import qrcode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';
import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } from '@whiskeysockets/baileys';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const resolveSessionDir = () => {
  const envDir = process.env.SESSION_DIR;
  if (envDir && envDir.trim()) {
    return path.resolve(envDir.trim());
  }
  return path.join(__dirname, '.baileys_auth');
};

// Helper for display formatting
const formatTarget = (jid) => {
  if (!jid) return 'Desconocido';
  return jid.replace('@s.whatsapp.net', '').replace('@c.us', '');
};

class WhatsAppClient extends EventEmitter {
  constructor(io, authDir = null, sessionId = null) {
    super();
    this.io = io;
    this.authDir = authDir || resolveSessionDir();
    this.sessionId = sessionId;
    this.client = null;
    this.sock = null;
    this.contactsCache = {};
    this.isReady = false;
    this.qrCode = null;
    this.qrDataUrl = null;
    this.autoReplyRules = [];
    this.interactiveMenus = [];
    this.userSessions = new Map();
    this.sessionTimeout = 15 * 60 * 1000;
    this.activeUserId = null;
    this.config = {
      headless: true,
      messageDelay: 2,
      maxContactsPerBatch: 50,
      waitTimeBetweenBatches: 15
    };
    this.bulkControllers = new Map();
    this.globalSessionsEnabled = true; // Default to true
    this._isDestroying = false;

    this._initializePromise = null;
    this._reconnectTimer = null;
    this._reconnectAttempts = 0;
    this._autoResetInProgress = false;
    this._lastAutoResetAt = 0;
    this.loadAutoReplyRules();
    this.loadInteractiveMenus();
    this.loadUserSessions();
    this.loadConfig();
    this.loadGlobalSessionsConfig();
  }

  loadGlobalSessionsConfig() {
    try {
      const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
      const configPath = path.join(dataDir, 'globalSessionsConfig.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        this.globalSessionsEnabled = config.enabled ?? true;
        this.activeSessionId = config.activeSessionId ?? null;
        console.log('[WhatsApp] Global sessions config loaded:', {
          enabled: this.globalSessionsEnabled,
          activeSessionId: this.activeSessionId,
          thisSessionId: this.sessionId
        });
      } else {
        this.globalSessionsEnabled = true;
        this.activeSessionId = null;
      }
    } catch (error) {
      console.error('[WhatsApp] Error loading global sessions config:', error);
      this.globalSessionsEnabled = true;
    }
  }

  scheduleReconnect(delayMs) {
    try {
      if (this._reconnectTimer) {
        clearTimeout(this._reconnectTimer);
        this._reconnectTimer = null;
      }
      this._reconnectTimer = setTimeout(() => {
        this.initialize().catch(() => { });
      }, Math.max(0, delayMs || 0));
    } catch { }
  }

  clearReconnectTimer() {
    try {
      if (this._reconnectTimer) {
        clearTimeout(this._reconnectTimer);
        this._reconnectTimer = null;
      }
    } catch { }
  }

  // Method to set active user ID (called from server.js socket handler)
  async setActiveUserId(userId) {
    this.activeUserId = userId;

    // Si WhatsApp ya está conectado, registrar el número para este nuevo usuario
    if (this.isReady && userId) {
      try {
        // Verificar si el usuario es administrador (no tiene restricciones)
        const { userService, phoneNumberService } = await import('./database.js');
        const user = await userService.getUserById(userId);
        const isAdmin = (user?.subscription_type || '').toString().toLowerCase() === 'administrador';

        if (isAdmin) {
          console.log(`[WhatsApp] User ${userId} is admin, skipping phone number registration`);
          return;
        }

        const jid = this.sock?.user?.id || this.sock?.user?.jid;
        if (jid) {
          const jidPart = jid.split('@')[0];
          const numberPart = jidPart.split(':')[0];
          const phoneNumber = numberPart.replace(/\D/g, '');

          if (phoneNumber) {
            const otherUsersCount = await phoneNumberService.countOtherUsersForPhone(phoneNumber, userId);

            if (otherUsersCount >= 2) {
              // Este número ya está asociado a 2 cuentas diferentes
              await phoneNumberService.unlinkPhoneFromUser(userId, phoneNumber);

              if (this.io) {
                this.io.emit('phone_limit_exceeded', {
                  phone: phoneNumber,
                  userId: userId,
                  message: 'Este número de WhatsApp ya está sincronizado con el máximo de cuentas permitidas (2).'
                });
                this.io.emit('disconnected', { reason: 'phone_limit_exceeded' });
              }
              await this.destroy();
              return;
            }

            await phoneNumberService.linkPhoneToUser(userId, phoneNumber);
            console.log(`[WhatsApp] Phone ${phoneNumber} linked to user ${userId} (session already active)`);
          }
        }
      } catch (error) {
        console.error('Error linking phone on user change:', error);
      }
    }
  }

  async checkAndAutoInitialize() {
    try {
      const sessionPath = path.join(__dirname, '.baileys_auth');
      if (fs.existsSync(sessionPath)) {
        const files = fs.readdirSync(sessionPath);
        if (files.length > 0) {
          console.log('📱 Sesión Baileys detectada. Intentando reconexión automática...');
          setTimeout(async () => {
            try {
              await this.initialize();
              console.log('✅ Auto-inicialización completada');
            } catch (error) {
              console.error('❌ Error en auto-inicialización:', error.message);
            }
          }, 2000);
        }
      }
    } catch (error) {
      console.error('Error verificando sesión guardada:', error);
    }
  }

  loadAutoReplyRules() {
    try {
      const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
      // Use session-specific file if sessionId is present, otherwise use default
      const fileName = this.sessionId ? `autoReplyRules_${this.sessionId}.json` : 'autoReplyRules.json';
      const rulesPath = path.join(dataDir, fileName);

      // Migration/Fallback: If session file doesn't exist but global default exists, copy it
      if (!fs.existsSync(rulesPath) && this.sessionId) {
        const globalPath = path.join(dataDir, 'autoReplyRules.json');
        if (fs.existsSync(globalPath)) {
          try {
            fs.copyFileSync(globalPath, rulesPath);
            console.log(`[WhatsApp] Copied global auto-reply rules to session ${this.sessionId}`);
          } catch (e) {
            console.warn('[WhatsApp] Failed to copy global auto-reply rules:', e);
          }
        }
      }

      if (fs.existsSync(rulesPath)) {
        const rawRules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
        // Normalize keywords to arrays (handle legacy string format)
        this.autoReplyRules = rawRules.map(rule => {
          if (rule.keywords && typeof rule.keywords === 'string') {
            try {
              rule.keywords = JSON.parse(rule.keywords);
            } catch {
              // If not JSON, split by comma
              rule.keywords = rule.keywords.split(',').map(k => k.trim()).filter(k => k.length > 0);
            }
          }
          // Ensure keywords is always an array
          if (!Array.isArray(rule.keywords)) {
            rule.keywords = [];
          }
          // Ensure ID is always a string
          if (rule.id) {
            rule.id = String(rule.id);
          }
          // Ensure countries is always an array
          if (rule.countries && typeof rule.countries === 'string') {
            try {
              rule.countries = JSON.parse(rule.countries);
            } catch {
              rule.countries = [];
            }
          }
          if (!Array.isArray(rule.countries)) {
            rule.countries = [];
          }
          return rule;
        });
      } else {
        // Default rules
        this.autoReplyRules = [
          {
            id: '1',
            name: 'Saludo Básico',
            keywords: ['hola', 'buenas', 'info'],
            response: '¡Hola! Gracias por escribirnos. ¿En qué podemos ayudarte hoy?',
            matchType: 'contains',
            delay: 2,
            isActive: true
          }
        ];
        this.saveAutoReplyRules();
      }
    } catch (error) {
      console.error('Error loading auto-reply rules:', error);
      this.autoReplyRules = [];
    }
  }

  saveAutoReplyRules() {
    try {
      const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
      const fileName = this.sessionId ? `autoReplyRules_${this.sessionId}.json` : 'autoReplyRules.json';
      const rulesPath = path.join(dataDir, fileName);

      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      fs.writeFileSync(rulesPath, JSON.stringify(this.autoReplyRules, null, 2));
    } catch (error) {
      console.error('Error saving auto-reply rules:', error);
    }
  }



  // Interactive Menus Management
  loadInteractiveMenus() {
    try {
      const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
      const fileName = this.sessionId ? `interactiveMenus_${this.sessionId}.json` : 'interactiveMenus.json';
      const menusPath = path.join(dataDir, fileName);

      // Migration/Fallback: If session file doesn't exist but global default exists, copy it
      if (!fs.existsSync(menusPath) && this.sessionId) {
        const globalPath = path.join(dataDir, 'interactiveMenus.json');
        if (fs.existsSync(globalPath)) {
          try {
            fs.copyFileSync(globalPath, menusPath);
            console.log(`[WhatsApp] Copied global interactive menus to session ${this.sessionId}`);
          } catch (e) {
            console.warn('[WhatsApp] Failed to copy global interactive menus:', e);
          }
        }
      }

      if (fs.existsSync(menusPath)) {
        const rawMenus = JSON.parse(fs.readFileSync(menusPath, 'utf8'));
        this.interactiveMenus = Array.isArray(rawMenus) ? rawMenus.map(menu => ({
          ...menu,
          id: menu.id ? String(menu.id) : menu.id
        })) : [];
        console.log(`[WhatsApp] Loaded ${this.interactiveMenus.length} interactive menus`);
      } else {
        // Create example menu
        this.interactiveMenus = [];
        this.saveInteractiveMenus();
      }
    } catch (error) {
      console.error('Error loading interactive menus:', error);
      this.interactiveMenus = [];
    }
  }

  saveInteractiveMenus() {
    try {
      const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
      const fileName = this.sessionId ? `interactiveMenus_${this.sessionId}.json` : 'interactiveMenus.json';
      const menusPath = path.join(dataDir, fileName);

      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      fs.writeFileSync(menusPath, JSON.stringify(this.interactiveMenus, null, 2));
      console.log(`[WhatsApp] Saved ${this.interactiveMenus.length} interactive menus`);
    } catch (error) {
      console.error('Error saving interactive menus:', error);
    }
  }

  // User Sessions Management
  loadUserSessions() {
    try {
      const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
      const sessionsPath = path.join(dataDir, 'userSessions.json');
      if (fs.existsSync(sessionsPath)) {
        const sessionsArray = JSON.parse(fs.readFileSync(sessionsPath, 'utf8'));
        this.userSessions = new Map(sessionsArray.map(s => [s.userId, s]));
        console.log(`[WhatsApp] Loaded ${this.userSessions.size} user sessions`);

        // Clean expired sessions
        this.cleanExpiredSessions();
      } else {
        this.userSessions = new Map();
      }
    } catch (error) {
      console.error('Error loading user sessions:', error);
      this.userSessions = new Map();
    }
  }

  saveUserSessions() {
    try {
      const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      const sessionsPath = path.join(dataDir, 'userSessions.json');
      const sessionsArray = Array.from(this.userSessions.values());
      fs.writeFileSync(sessionsPath, JSON.stringify(sessionsArray, null, 2));
    } catch (error) {
      console.error('Error saving user sessions:', error);
    }
  }

  cleanExpiredSessions() {
    const now = Date.now();
    let cleaned = 0;
    for (const [userId, session] of this.userSessions.entries()) {
      const lastInteraction = new Date(session.lastInteraction).getTime();
      if (now - lastInteraction > this.sessionTimeout) {
        this.userSessions.delete(userId);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log(`[WhatsApp] Cleaned ${cleaned} expired sessions`);
      this.saveUserSessions();
    }
  }

  getSession(userId) {
    const session = this.userSessions.get(userId);
    if (!session) return null;

    const lastInteraction = new Date(session.lastInteraction).getTime();
    const now = Date.now();

    if (now - lastInteraction > this.sessionTimeout) {
      this.userSessions.delete(userId);
      this.saveUserSessions();
      return null;
    }

    return session;
  }

  setSession(userId, menuId, conversationData = {}) {
    const session = {
      userId,
      currentMenuId: menuId,
      history: [],
      conversationData,
      startTime: new Date().toISOString(),
      lastInteraction: new Date().toISOString()
    };
    this.userSessions.set(userId, session);
    this.saveUserSessions();
    return session;
  }

  updateSession(userId, menuId, conversationData = null) {
    const session = this.userSessions.get(userId);
    if (session) {
      if (session.currentMenuId !== menuId) {
        session.history = session.history || [];
        session.history.push(session.currentMenuId);
        if (session.history.length > 20) session.history.shift();
      }
      session.currentMenuId = menuId;
      session.lastInteraction = new Date().toISOString();
      if (conversationData !== null) {
        session.conversationData = { ...session.conversationData, ...conversationData };
      }
      this.userSessions.set(userId, session);
      this.saveUserSessions();
    }
  }

  clearSession(userId) {
    this.userSessions.delete(userId);
    this.saveUserSessions();
  }

  async handleMenuInteraction(userId, messageText, session, currentUser, messageCountService, messageLogService) {
    try {
      const currentMenu = this.interactiveMenus.find(m => m.id === session.currentMenuId);
      if (!currentMenu || !currentMenu.isActive) {
        console.log('[WhatsApp] Current menu not found or inactive, clearing session');
        this.clearSession(userId);
        return false;
      }

      // Find matching option
      const matchedOption = currentMenu.options.find(option =>
        option.triggers.some(trigger =>
          messageText.toLowerCase().trim() === trigger.toLowerCase().trim() ||
          messageText.toLowerCase().includes(trigger.toLowerCase())
        )
      );

      if (!matchedOption) {
        // No matching option - send error message
        // Generate ONLY the list of options for the error message
        const optionsList = currentMenu.options && currentMenu.options.length > 0
          ? currentMenu.options.map((opt, idx) => {
            const triggerDisplay = opt.triggers && opt.triggers.length > 0 ? opt.triggers[0] : (idx + 1).toString();
            if (/^\d+$/.test(triggerDisplay)) {
              return `${triggerDisplay}️⃣ ${opt.label}`;
            }
            return opt.label;
          }).join('\n')
          : '';

        await this.sendMessage(
          userId,
          `❌ Opción no válida. Por favor, elige una opción del menú:\n\n${optionsList}`
        );
        return true; // Handled (error response sent)
      }

      console.log('[WhatsApp] Menu option matched:', {
        userId,
        menuId: currentMenu.id,
        optionId: matchedOption.id,
        optionLabel: matchedOption.label,
        nextMenuId: matchedOption.nextMenuId,
        goBack: !!matchedOption.goBack,
        endConversation: !!matchedOption.endConversation,
        hasResponse: !!matchedOption.response,
        mediaCount: (matchedOption.mediaPaths || []).length
      });

      // Send option response if exists
      if (matchedOption.response || (matchedOption.mediaPaths && matchedOption.mediaPaths.length > 0)) {
        const mediaPaths = matchedOption.mediaPaths || [];
        const captions = matchedOption.captions || [];
        await this.sendMessage(userId, matchedOption.response || '', mediaPaths, captions);

        if (currentUser && currentUser.id) {
          await messageCountService.incrementCount(currentUser.id, 1);
          await messageLogService.logMessage(
            currentUser.id,
            'menu-response',
            userId,
            'sent',
            `Menu response: ${matchedOption.label}`,
            null
          );
        }
      }

      // Handle navigation
      console.log('[WhatsApp] Starting navigation check for option:', matchedOption.label);

      if (matchedOption.endConversation) {
        // End conversation
        this.clearSession(userId);
        console.log('[WhatsApp] Conversation ended for user:', userId);
      } else if (matchedOption.goBack) {
        // Go back to previous menu
        const history = session.history || [];
        const prevMenuId = history.length > 0 ? history.pop() : null;

        if (prevMenuId) {
          const prevMenu = this.interactiveMenus.find(m => String(m.id) === String(prevMenuId) && m.isActive);
          if (prevMenu) {
            await this.sendMenu(userId, prevMenu);

            // Update session without adding current to history (since we are going back)
            session.currentMenuId = prevMenuId;
            session.history = history; // Already popped
            session.lastInteraction = new Date().toISOString();
            this.userSessions.set(userId, session);
            this.saveUserSessions();

            console.log('[WhatsApp] Go back to menu:', { userId, toMenu: prevMenuId });
          } else {
            await this.sendMessage(userId, "❌ El menú anterior ya no está disponible.");
          }
        } else {
          await this.sendMessage(userId, "❌ No hay un menú anterior al que volver.");
        }
      } else if (matchedOption.nextMenuId) {
        // Navigate to next menu
        const nextMenu = this.interactiveMenus.find(m => String(m.id) === String(matchedOption.nextMenuId) && m.isActive);
        if (nextMenu) {
          await this.sendMenu(userId, nextMenu);

          this.updateSession(userId, nextMenu.id);

          if (currentUser && currentUser.id) {
            await messageCountService.incrementCount(currentUser.id, 1);
          }

          console.log('[WhatsApp] Navigated to menu:', {
            userId,
            fromMenu: currentMenu.id,
            toMenu: nextMenu.id
          });
        } else {
          // Next menu not found, end conversation
          this.clearSession(userId);
          console.log('[WhatsApp] Next menu not found, ending conversation');
        }
      } else {
        // No navigation specified, stay in current menu
        this.updateSession(userId, currentMenu.id);
      }

      return true; // Handled
    } catch (error) {
      console.error('[WhatsApp] Error handling menu interaction:', error);
      this.clearSession(userId);
      return false;
    }
  }

  loadConfig() {
    try {
      const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
      const configPath = path.join(dataDir, 'config.json');
      if (fs.existsSync(configPath)) {
        this.config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      }
    } catch (error) {
      console.error('Error loading config:', error);
    }
  }

  saveConfig() {
    try {
      const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      const configPath = path.join(dataDir, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('Error saving config:', error);
    }
  }

  getQrCode() {
    return this.qrDataUrl;
  }

  resolveJid(to) {
    if (to.includes('@')) return to;
    const clean = to.replace(/\D/g, '');
    return `${clean}@s.whatsapp.net`;
  }

  getTextFromMessage(msg) {
    const m = msg.message || {};
    return (
      m.conversation ||
      m.extendedTextMessage?.text ||
      m.imageMessage?.caption ||
      m.videoMessage?.caption ||
      ''
    );
  }

  // Control de cola de envíos masivos por usuario
  getBulkController(userId) {
    const key = userId || 'global';
    if (!this.bulkControllers.has(key)) {
      this.bulkControllers.set(key, { cancelled: false, paused: false });
    }
    return this.bulkControllers.get(key);
  }

  pauseBulk(userId = null) {
    const ctrl = this.getBulkController(userId);
    ctrl.paused = true;
    ctrl.cancelled = false;
    if (this.io) {
      this.io.emit('bulk_control', { userId: userId || null, action: 'paused' });
    }
  }

  resumeBulk(userId = null) {
    const ctrl = this.getBulkController(userId);
    ctrl.paused = false;
    if (this.io) {
      this.io.emit('bulk_control', { userId: userId || null, action: 'resumed' });
    }
  }

  cancelBulk(userId = null) {
    const ctrl = this.getBulkController(userId);
    ctrl.cancelled = true;
    ctrl.paused = false;
    if (this.io) {
      const safeUserId = userId || null;
      this.io.emit('bulk_control', { userId: safeUserId, action: 'cancelled' });
      // Notificar también por el canal de progreso para que el frontend pueda cerrar la cola
      this.io.emit('bulk_progress', {
        userId: safeUserId,
        current: 0,
        total: 0,
        status: 'cancelled',
        batch: 0,
        totalBatches: 0
      });
    }
  }

  clearBulk(userId = null) {
    const key = userId || 'global';
    if (this.bulkControllers.has(key)) {
      this.bulkControllers.delete(key);
    }
  }

  async sleepWithControl(ms, controller) {
    const step = 500;
    let elapsed = 0;
    while (elapsed < ms) {
      if (controller.cancelled) break;

      while (controller.paused && !controller.cancelled) {
        await new Promise(r => setTimeout(r, step));
      }
      if (controller.cancelled) break;

      const remaining = ms - elapsed;
      const chunk = Math.min(step, remaining);
      await new Promise(r => setTimeout(r, chunk));
      elapsed += chunk;
    }
  }

  async sendPoll(to, name, options, selectableCount = 1) {
    if (!this.sock) throw new Error('WhatsApp socket not initialized');
    const jid = this.resolveJid(to);

    // Ensure options is an array of strings
    const pollOptions = Array.isArray(options) ? options : [];

    return await this.sock.sendMessage(jid, {
      poll: {
        name: name,
        values: pollOptions,
        selectableCount: selectableCount
      }
    });
  }

  async initialize() {
    if (this._initializePromise) {
      return this._initializePromise;
    }

    this._initializePromise = (async () => {
      console.log('Inicializando cliente WhatsApp (Baileys)...');

      this.clearReconnectTimer();

      // Ensure any previous socket is closed before starting a new one
      try {
        if (this.sock) {
          try { this.sock.ws?.close?.(); } catch { }
          try { this.sock.end?.(); } catch { }
        }
      } catch { }

      const authDir = this.authDir;
      if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });
      const { state, saveCreds } = await useMultiFileAuthState(authDir);
      const { version } = await fetchLatestBaileysVersion();
      this.sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        browser: ['WhatyBot', 'Chrome', '1.0.0'],
        markOnlineOnConnect: false,
        syncFullHistory: false, // Save RAM by not syncing full history
        generateHighQualityLinkPreview: false, // Save bandwidth/RAM
        shouldIgnoreJid: (jid) => {
          if (!jid) return false;
          if (jid === 'status@broadcast') return true;
          if (jid.endsWith('@broadcast')) return true;
          return false;
        }
      });
      this.client = this.sock;
      this.sock.ev.on('creds.update', saveCreds);
      this.sock.ev.on('connection.update', async (update) => {
        this.emit('connection.update', update);
        const { connection, qr, lastDisconnect } = update;
        if (qr) {
          try {
            this.qrCode = qr;
            const qrDataUrl = await qrcode.toDataURL(qr);
            this.qrDataUrl = qrDataUrl;
            this.io.emit('qr', { sessionId: this.sessionId, qr: qrDataUrl });
          } catch (e) { }
        }
        if (connection === 'open') {
          this.isReady = true;
          this.qrCode = null;
          this.qrDataUrl = null;
          this._reconnectAttempts = 0;
          this.clearReconnectTimer();

          let phoneNumber = null;
          try {
            const jid = this.sock?.user?.id || this.sock?.user?.jid;
            if (jid) {
              // JID format: "51987422887:77@s.whatsapp.net" - extraer solo el número antes de ':'
              const jidPart = jid.split('@')[0]; // "51987422887:77"
              const numberPart = jidPart.split(':')[0]; // "51987422887" (sin device ID)
              phoneNumber = numberPart.replace(/\D/g, '');
            }

            if (phoneNumber && this.activeUserId) {
              const { userService, phoneNumberService } = await import('./database.js');

              // Verificar si el usuario es administrador (no tiene restricciones)
              const user = await userService.getUserById(this.activeUserId);
              const isAdmin = (user?.subscription_type || '').toString().toLowerCase() === 'administrador';

              if (!isAdmin) {
                // Contar cuántos OTROS usuarios tienen este número (excluyendo el usuario actual)
                const otherUsersCount = await phoneNumberService.countOtherUsersForPhone(phoneNumber, this.activeUserId);

                if (otherUsersCount >= 2) {
                  // Este número ya está asociado a 2 cuentas diferentes
                  // Eliminar cualquier registro previo de este número para este usuario
                  await phoneNumberService.unlinkPhoneFromUser(this.activeUserId, phoneNumber);

                  if (this.io) {
                    this.io.emit('phone_limit_exceeded', {
                      phone: phoneNumber,
                      userId: this.activeUserId,
                      sessionId: this.sessionId,
                      message: 'Este número de WhatsApp ya está sincronizado con el máximo de cuentas permitidas (2).'
                    });
                    this.io.emit('disconnected', { reason: 'phone_limit_exceeded' });
                  }
                  await this.destroy();
                  return;
                }

                await phoneNumberService.linkPhoneToUser(this.activeUserId, phoneNumber);
              } else {
                console.log(`[WhatsApp] User ${this.activeUserId} is admin, skipping phone number registration`);
              }
            }
          } catch (error) {
            console.error('Error validating phone number usage:', error);
          }

          this.io?.emit('authenticated', { sessionId: this.sessionId, phone: phoneNumber });
          this.io?.emit('ready', { sessionId: this.sessionId, status: 'connected', phone: phoneNumber });
        } else if (connection === 'close') {
          if (this._isDestroying) {
            console.log(`[WhatsApp] Connection closed for session ${this.sessionId} (planned shutdown)`);
            return;
          }
          this.isReady = false;
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const loggedOut = statusCode === DisconnectReason.loggedOut;
          this.io.emit('disconnected', { sessionId: this.sessionId, reason: loggedOut ? 'logged_out' : 'connection_closed' });

          // If WhatsApp logged out (invalid/expired session), auto-reset once to force a new QR,
          // same behavior as the manual "Limpiar sesión y generar nuevo QR" button.
          if (loggedOut) {
            const now = Date.now();
            const cooldownMs = 60 * 1000;

            // Guard against infinite reset loops (e.g. persistent login failure)
            if (!this._autoResetInProgress && (now - (this._lastAutoResetAt || 0)) > cooldownMs) {
              this._autoResetInProgress = true;
              this._lastAutoResetAt = now;
              try {
                console.log('🔁 Sesión inválida (logged_out). Limpiando sesión y generando nuevo QR automáticamente...');
                await this.resetSession();
              } catch (e) {
                console.error('❌ Error auto-reseteando sesión:', e?.message || e);
                try {
                  await this.destroy();
                } catch { }
              } finally {
                this._autoResetInProgress = false;
              }
            } else {
              if (this._autoResetInProgress) {
                console.log('⚠️ Auto-reset ya en progreso, ignorando evento logged_out duplicado.');
              } else {
                console.log('⏳ Auto-reset en enfriamiento (cooldown), esperando...');
              }
            }

            this.clearReconnectTimer();
            this._reconnectAttempts = 0;
            return;
          }

          // Unified reconnection logic
          if (statusCode !== DisconnectReason.loggedOut) {
            const isConflict = String(lastDisconnect?.error)?.includes('Stream Errored (conflict)');

            if (isConflict) {
              console.log('[WhatsApp] Conflict detected (Stream Errored), waiting 5s before reconnect...');
              this.scheduleReconnect(5000);
            } else {
              this._reconnectAttempts = (this._reconnectAttempts || 0) + 1;
              const baseDelay = 2000;
              const maxDelay = 60000;
              const delay = Math.min(maxDelay, baseDelay * (2 ** Math.min(6, this._reconnectAttempts - 1)));
              console.log(`[WhatsApp] Reconnecting in ${delay}ms (attempt ${this._reconnectAttempts})...`);
              this.scheduleReconnect(delay);
            }
          }
        }
      });
      this.sock.ev.on('messages.upsert', async ({ messages }) => {
        try {
          const m = messages && messages[0];
          if (!m) return;
          const remoteJid = m.key.remoteJid || '';
          if (remoteJid === 'status@broadcast' || remoteJid.endsWith('@broadcast')) return;
          const isGroup = remoteJid.endsWith('@g.us');
          const fromMe = !!m.key.fromMe;

          // Skip if message is from me
          if (fromMe) return;

          // Skip groups unless autoReplyInGroups is enabled
          const autoReplyInGroups = this.config?.autoReplyInGroups || false;
          if (isGroup && !autoReplyInGroups) {
            console.log('[WhatsAppClient] Skipping group message (autoReplyInGroups disabled)');
            return;
          }

          const from = remoteJid;
          const body = (this.getTextFromMessage(m) || '').toLowerCase();
          const activeUserInfo = this.activeUserId ? `[Usuario activo: ${this.activeUserId}]` : '[Usuario activo: NINGUNO]';
          console.log(`${activeUserInfo} Message received:`, {
            from,
            body: body.substring(0, 100) || '(sin texto)',
            isGroup,
            fromMe
          });
          const { userService, validationService, messageCountService, messageLogService } = await import('./database.js');
          let currentUser = null;
          try {
            if (this.activeUserId) {
              currentUser = await userService.getUserById(this.activeUserId);
              if (!(currentUser && currentUser.is_active)) {
                currentUser = null;
              }
            }
          } catch { }
          if (currentUser && currentUser.id) {
            const userInfo = `[Usuario: ${currentUser.id} - ${currentUser.username || currentUser.email || 'N/A'}]`;
            const validation = await validationService.canSendMessages(currentUser.id, 1);
            if (!validation.allowed) {
              if (this.io) {
                this.io.emit('limit_exceeded', {
                  userId: currentUser.id,
                  limitExceeded: validation.limitExceeded,
                  currentCount: validation.currentCount,
                  limit: validation.limit,
                  subscriptionType: validation.subscriptionType
                });
              }
              return;
            }
          }

          // Check if we should process menus/rules based on global sessions configuration
          if (!this.globalSessionsEnabled) {
            // Allow processing ONLY if this is the active session
            if (this.sessionId !== this.activeSessionId) {
              console.log(`[WhatsApp] ⛔ SKIP: Session ${this.sessionId} is NOT active. Active is: ${this.activeSessionId}`);
              return;
            }

            console.log(`[WhatsApp] ✅ PROCESS: Session ${this.sessionId} IS active.`);
          }

          // Check for active menu session FIRST
          const session = this.getSession(from);
          if (session) {
            // Verify that the menu is still active
            const currentMenu = this.interactiveMenus.find(m => String(m.id) === String(session.currentMenuId));
            if (!currentMenu || !currentMenu.isActive) {
              console.log('[WhatsApp] Menu session exists but menu is inactive/deleted, clearing session');
              this.clearSession(from);
            } else {
              // Check if there's an auto-reply rule that triggers this menu and if it's still active
              const menuTriggerRule = this.autoReplyRules.find(r =>
                r.type === 'menu' && String(r.menuId) === String(session.currentMenuId)
              );

              if (menuTriggerRule && !menuTriggerRule.isActive) {
                console.log('[WhatsApp] Menu session exists but auto-reply trigger is inactive, clearing session');
                this.clearSession(from);
              } else {
                // Menu and trigger (if exists) are active, process menu interaction
                const handled = await this.handleMenuInteraction(from, body, session, currentUser, messageCountService, messageLogService);
                if (handled) {
                  return; // Menu interaction handled, don't process auto-reply rules
                }
              }
            }
          }

          // Process auto-reply rules (only if no menu session or menu didn't handle it)
          // First, check for menu-type rules (higher priority)
          console.log(`[WhatsApp] Checking ${this.autoReplyRules.length} auto-reply rules...`);
          for (const rule of this.autoReplyRules) {
            if (!rule.isActive || rule.type !== 'menu') continue;

            const phoneNumberFrom = from.split('@')[0].split(':')[0].replace(/\D/g, '');

            // Country filter check
            if (rule.countries && rule.countries.length > 0) {
              const matchedCountry = rule.countries.some(countryCode => phoneNumberFrom.startsWith(countryCode.replace(/\D/g, '')));
              if (!matchedCountry) {
                console.log(`[WhatsApp] Rule [${rule.name}] (menu) skipped: country mismatch (${phoneNumberFrom} does not match [${rule.countries.join(',')}])`);
                continue;
              }
            }

            const messageText = body.trim();
            let shouldReply = false;

            if (rule.matchType === 'exact') {
              shouldReply = rule.keywords.some(keyword => messageText === keyword.toLowerCase().trim());
            } else if (rule.matchType === 'contains') {
              shouldReply = rule.keywords.some(keyword => messageText.includes(keyword.toLowerCase().trim()));
            }

            console.log(`[WhatsApp] Rule [${rule.name}] match result: ${shouldReply} (Keywords: ${rule.keywords.join(',')}, Input: ${messageText})`);

            if (shouldReply && rule.menuId) {
              // Start menu session
              const menu = this.interactiveMenus.find(m => String(m.id) === String(rule.menuId) && m.isActive);
              if (menu) {
                console.log('[WhatsAppClient] Starting menu session:', {
                  userId: from,
                  menuId: menu.id,
                  menuName: menu.name
                });

                await new Promise(r => setTimeout(r, rule.delay * 1000));

                await this.sendMenu(from, menu);

                this.setSession(from, menu.id);

                if (currentUser && currentUser.id) {
                  await messageCountService.incrementCount(currentUser.id, 1);
                  await messageLogService.logMessage(
                    currentUser.id,
                    'menu-start',
                    from,
                    'sent',
                    `Menu started: ${menu.name}`,
                    null
                  );
                }

                if (this.io) {
                  this.io.emit('message_log', {
                    id: Date.now().toString(),
                    sessionId: this.sessionId,
                    userId: currentUser?.id || null,
                    target: from,
                    status: 'sent',
                    timestamp: new Date(),
                    content: `Menu started: ${menu.name}`,
                    messageType: 'menu-start'
                  });
                }

                return; // Menu started, don't process other rules
              }
            }
          }

          // Then, check for simple auto-reply rules
          for (const rule of this.autoReplyRules) {
            if (!rule.isActive || rule.type === 'menu') continue;

            const phoneNumberFrom = from.split('@')[0].split(':')[0].replace(/\D/g, '');

            // Country filter check
            if (rule.countries && rule.countries.length > 0) {
              const matchedCountry = rule.countries.some(countryCode => phoneNumberFrom.startsWith(countryCode.replace(/\D/g, '')));
              if (!matchedCountry) {
                console.log(`[WhatsApp] Rule [${rule.name}] (simple) skipped: country mismatch (${phoneNumberFrom} does not match [${rule.countries.join(',')}])`);
                continue;
              }
            }
            const messageText = body;
            let shouldReply = false;
            if (rule.matchType === 'exact') {
              shouldReply = rule.keywords.some(keyword => messageText === keyword.toLowerCase());
            } else if (rule.matchType === 'contains') {
              shouldReply = rule.keywords.some(keyword => messageText.includes(keyword.toLowerCase()));
            }
            if (shouldReply) {
              // Regular auto-reply (simple type)
              const textMessage = rule.response || '';

              // Soporte para múltiples archivos por regla
              const mediaPaths = Array.isArray(rule.mediaPaths)
                ? rule.mediaPaths.filter(Boolean)
                : (rule.mediaPath ? [rule.mediaPath] : []);

              // Fix: Parse captions if it comes as a stringified JSON (common in imports)
              let parsedCaptions = rule.captions;
              if (typeof rule.captions === 'string' && rule.captions.trim().startsWith('[')) {
                try {
                  parsedCaptions = JSON.parse(rule.captions);
                } catch (e) {
                  console.warn('[WhatsAppClient] Auto-reply caption parse failed, using as string:', e);
                }
              } else if (typeof rule.caption === 'string' && rule.caption.trim().startsWith('[')) {
                // Fallback to checking singular caption if it holds the array
                try {
                  parsedCaptions = JSON.parse(rule.caption);
                } catch (e) { }
              }

              let captions = Array.isArray(parsedCaptions)
                ? parsedCaptions
                : (parsedCaptions ? [parsedCaptions] : mediaPaths.map(() => (rule.caption || '')));

              console.log('[WhatsAppClient] Auto-reply matched rule:', {
                id: rule.id,
                name: rule.name,
                mediaPaths,
                captions
              });

              await new Promise(r => setTimeout(r, rule.delay * 1000));
              try {
                await this.sendMessage(from, textMessage, mediaPaths, captions);
                const cleanTarget = formatTarget(from);
                if (this.io) {
                  this.io.emit('message_log', {
                    id: uuidv4(),
                    sessionId: this.sessionId,
                    userId: currentUser?.id || null,
                    target: cleanTarget,
                    status: 'sent',
                    timestamp: new Date(),
                    content: `Auto-reply: ${textMessage || '[Archivo multimedia]'}`,
                    messageType: 'auto-reply'
                  });
                }
                if (currentUser && currentUser.id) {
                  await messageCountService.incrementCount(currentUser.id, 1);
                  await messageLogService.logMessage(currentUser.id, 'auto-reply', cleanTarget, 'sent', `Auto-reply: ${textMessage || '[Archivo multimedia]'}`, null);
                }
              } catch (replyError) {
                console.error('[WhatsAppClient] Error sending auto-reply:', replyError);
                const cleanTargetByError = formatTarget(from);
                if (this.io) {
                  this.io.emit('message_log', {
                    id: uuidv4(),
                    sessionId: this.sessionId,
                    userId: currentUser?.id || null,
                    target: cleanTargetByError,
                    status: 'failed',
                    timestamp: new Date(),
                    content: `Auto-reply: ${textMessage || '[Archivo multimedia]'}`,
                    messageType: 'auto-reply'
                  });
                }
                if (currentUser && currentUser.id) {
                  await messageLogService.logMessage(currentUser.id, 'auto-reply', cleanTargetByError, 'failed', `Auto-reply: ${textMessage || '[Archivo multimedia]'}`, null);
                }
              }
              break;
            }
          }
        } catch (error) { }
      });

      // Cache contacts from Baileys events
      this.sock.ev.on('contacts.upsert', (contacts = []) => {
        try {
          contacts.forEach(c => {
            if (c && c.id) {
              this.contactsCache[c.id] = { id: c.id, name: c.name || c.notify, status: c.status };
            }
          });
        } catch { }
      });
      this.sock.ev.on('contacts.update', (updates = []) => {
        try {
          updates.forEach(u => {
            const id = u?.id;
            if (!id) return;
            const prev = this.contactsCache[id] || { id };
            this.contactsCache[id] = { ...prev, name: u.name || prev.name, status: u.status || prev.status };
          });
        } catch { }
      });
      // Also collect JIDs from chats
      this.sock.ev.on('chats.upsert', (chats = []) => {
        try {
          chats.forEach(ch => {
            const id = ch?.id;
            if (!id) return;
            if (id.endsWith('@s.whatsapp.net')) {
              const name = ch.name || ch.subject || ch.notify || (id.split('@')[0]);
              this.contactsCache[id] = { id, name };
            }
          });
        } catch { }
      });

      return true;
    })();

    try {
      return await this._initializePromise;
    } finally {
      this._initializePromise = null;
    }
  }
  /**
   * Genera y envía un menú interactivo a un usuario
   * @param {string} jid - JID del destinatario
   * @param {Object} menu - El objeto menú a enviar
   */
  async sendMenu(jid, menu) {
    if (!menu) return;

    // Generate option list
    const optionsList = menu.options && menu.options.length > 0
      ? '\n\n' + menu.options.map((opt, idx) => {
        const triggerDisplay = opt.triggers && opt.triggers.length > 0 ? opt.triggers[0] : (idx + 1).toString();
        // ONLY prepend and format if it's a number.
        if (/^\d+$/.test(triggerDisplay)) {
          return `${triggerDisplay}️⃣ ${opt.label}`;
        }
        return opt.label;
      }).join('\n')
      : '';

    const mediaPaths = menu.mediaPaths || [];
    const captions = (menu.captions || []).slice(); // Clone array
    let message = menu.message || '';

    // If there's no message but there are captions, append options to first caption
    if (!message && captions.length > 0) {
      captions[0] = (captions[0] || '') + optionsList;
    } else {
      // Append options to message
      message = (message || '') + optionsList;
    }

    console.log('[WhatsApp] Sending menu:', {
      jid,
      menuName: menu.name,
      optionsCount: (menu.options || []).length,
      mediaCount: mediaPaths.length,
      finalMessageSnippet: message.substring(0, 50) + '...',
      firstCaptionSnippet: captions.length > 0 ? (captions[0] || '').substring(0, 50) + '...' : 'N/A'
    });

    console.log('[WhatsApp] Generated options list:', optionsList);

    return this.sendMessage(jid, message, mediaPaths, captions);
  }

  /**
   * Send message with support for multimedia (single or multiple files) and separate text message
   * @param {string} to - Recipient phone number or chat ID
   * @param {string} message - Text message to send separately (after media if present)
   * @param {string|string[]|null} mediaPath - Path or paths to media file(s) (optional)
   * @param {string|string[]} caption - Caption(s) for media file(s) (optional)
   * @returns {Promise<Object>} Result object
   */
  async sendMessage(to, message = '', mediaPath = null, caption = '') {
    if (!this.sock) throw new Error('WhatsApp client no está inicializado');
    if (!this.isReady) throw new Error('WhatsApp client no está listo');
    try {
      const jid = this.resolveJid(to);

      // Normalizar a arrays para soportar múltiples adjuntos manteniendo compatibilidad con string
      const mediaPaths = mediaPath
        ? Array.isArray(mediaPath)
          ? mediaPath.filter(Boolean)
          : [mediaPath]
        : [];

      const captions = Array.isArray(caption)
        ? caption
        : mediaPaths.map(() => (caption || ''));

      // Send text message FIRST (if exists)
      if (message && message.trim()) {
        try {
          await this.sock.sendMessage(jid, { text: message });
        } catch (error) {
          // Si el error es específicamente por permisos de grupo (frecuentemente 401/403 de WhatsApp)
          if (jid.endsWith('@g.us') && (error.message.includes('not authorized') || error.message.includes('403') || error.message.includes('401'))) {
            throw new Error('No tienes permiso para enviar mensajes a este grupo (solo administradores)');
          }
          throw error;
        }
      }

      // Then send media files
      for (let i = 0; i < mediaPaths.length; i++) {
        const currentPath = mediaPaths[i];
        if (!currentPath) continue;
        const currentCaption = captions[i] || '';

        // Normalize path separators (handle both / and \)
        let normalizedPath = currentPath.replace(/\\/g, '/');

        // Fix duplicate uploads prefix if present (e.g. uploads/uploads/file.png -> uploads/file.png)
        if (normalizedPath.includes('uploads/uploads/')) {
          normalizedPath = normalizedPath.replace('uploads/uploads/', 'uploads/');
        }

        // Convert relative paths to absolute paths
        // Assuming structure: /app/server (CWD) -> /app/uploads or /app/server/uploads
        // Railway structure typically sets CWD to /app/server due to "cd server && npm install"
        let absolutePath;
        if (path.isAbsolute(normalizedPath)) {
          absolutePath = normalizedPath;
        } else {
          // If path starts with uploads/, try to find it in project root
          if (normalizedPath.startsWith('uploads/')) {
            // Try relative to current dir first
            absolutePath = path.join(__dirname, normalizedPath);
            if (!fs.existsSync(absolutePath)) {
              // Try one level up (project root)
              absolutePath = path.join(__dirname, '..', normalizedPath);
            }
            if (!fs.existsSync(absolutePath)) {
              // Try two levels up (in case structure is deeper)
              absolutePath = path.join(__dirname, '../..', normalizedPath);
            }
          } else {
            // No prefix, assume it is in default uploads folder relative to __dirname
            absolutePath = path.join(__dirname, 'uploads', normalizedPath);
          }
        }

        console.log('[sendMessage] Media file debug:', {
          currentPath,
          normalizedPath,
          __dirname,
          absolutePath,
          exists: fs.existsSync(absolutePath)
        });

        if (!fs.existsSync(absolutePath)) {
          console.error(`[sendMessage] File not found: ${absolutePath}`);
          console.error(`[sendMessage] Tried to find file from path: ${currentPath}`);
          continue; // Skip this file and continue with the next one
        }

        const ext = path.extname(absolutePath).toLowerCase();
        const data = fs.readFileSync(absolutePath);
        try {
          if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
            await this.sock.sendMessage(jid, { image: data, caption: currentCaption || undefined });
          } else if (['.mp4', '.mov', '.avi', '.mkv', '.webm'].includes(ext)) {
            await this.sock.sendMessage(jid, { video: data, caption: currentCaption || undefined });
          } else if (['.mp3', '.wav', '.ogg', '.m4a'].includes(ext)) {
            await this.sock.sendMessage(jid, { audio: data });
          } else {
            await this.sock.sendMessage(jid, { document: data, fileName: path.basename(currentPath) });
          }
        } catch (error) {
          // Si el error es específicamente por permisos de grupo
          if (jid.endsWith('@g.us') && (error.message.includes('not authorized') || error.message.includes('403') || error.message.includes('401'))) {
            throw new Error('No tienes permiso para enviar mensajes a este grupo (solo administradores)');
          }
          throw error;
        }

        // Emit simple progress event for individual media sends (usar canal separado para no interferir con bulk_progress de campañas masivas)
        try {
          if (this.io && mediaPaths.length > 0) {
            this.io.emit('media_progress', {
              userId: this.activeUserId || null,
              current: i + 1,
              total: mediaPaths.length,
              contact: to,
              status: 'sent',
              batch: 1,
              totalBatches: 1
            });
          }
        } catch { }
      }

      return { success: true };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Send bulk messages with support for multimedia (single o múltiples archivos) y mensaje de texto separado
   * @param {Array} contacts - Array de objetos contacto (deben incluir .phone y posibles variables)
   * @param {string} message - Mensaje de texto base (se personaliza por contacto)
   * @param {string|string[]|null} mediaPath - Ruta o rutas a los archivos multimedia (opcional)
   * @param {string|string[]} caption - Caption(s) base para los archivos (opcional)
   * @param {number} delay - Máximo delay entre mensajes en segundos
   * @param {number} maxContactsPerBatch - Máximo de contactos por lote
   * @param {number} waitTimeBetweenBatches - Tiempo de espera entre lotes en minutos
   * @returns {Promise<Array>} Array de resultados
   */
  async sendBulkMessages(contacts, message = '', mediaPath = null, caption = '', delay = 2, userId = null, maxContactsPerBatch = null, waitTimeBetweenBatches = null) {
    if (!this.sock || !this.isReady) throw new Error('WhatsApp client no está listo');

    // Use config values if not provided
    const maxPerBatch = maxContactsPerBatch || this.config.maxContactsPerBatch || 50;
    const waitMinutes = waitTimeBetweenBatches || this.config.waitTimeBetweenBatches || 15;
    const maxDelaySeconds = delay || this.config.messageDelay || 2;

    // Ensure captions are parsed if passed as JSON string
    let parsedCaptions = caption;
    if (typeof caption === 'string' && caption.trim().startsWith('[')) {
      try {
        parsedCaptions = JSON.parse(caption);
      } catch (e) {
        console.warn('[WhatsApp] Failed to parse captions JSON, using as string:', e);
        // If failed to parse but looks like JSON, it might just be a string that starts with [
        // parsedCaptions remains as string
      }
    }
    // Normalization: Ensure parsedCaptions is consistent throughout
    // If it's a single string (not JSON), treat it as the caption for ALL media files or the first one
    // sendMessage handles `captions` array.

    const results = [];
    const totalContacts = contacts.length;
    let processedCount = 0;
    let successCount = 0;
    let failedCount = 0;
    const controller = this.getBulkController(userId);
    controller.cancelled = false;
    controller.paused = false;

    // Obtener grupos participando para validar permisos preventivamente (solo si hay grupos en los contactos)
    let myGroups = {};
    if (contacts.some(c => c.phone && (c.phone.endsWith('@g.us') || c.phone.includes('-')))) {
      try {
        myGroups = await this.sock.groupFetchAllParticipating();
      } catch (e) {
        console.warn('[WhatsApp] Error fetching groups for validation:', e.message);
      }
    }

    // Split contacts into batches
    const batches = [];
    for (let i = 0; i < contacts.length; i += maxPerBatch) {
      batches.push(contacts.slice(i, i + maxPerBatch));
    }

    console.log(`📦 Enviando ${totalContacts} contactos en ${batches.length} lote(s) de máximo ${maxPerBatch} contactos cada uno`);

    // Process each batch
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`📤 Procesando lote ${batchIndex + 1}/${batches.length} (${batch.length} contactos)`);

      for (let i = 0; i < batch.length; i++) {
        if (controller.cancelled) {
          console.log(`🚫 Envío masivo cancelado para usuario ${userId || 'N/A'} durante el lote ${batchIndex + 1}`);
          break;
        }

        // Respetar pausa manual
        while (controller.paused && !controller.cancelled) {
          await new Promise(r => setTimeout(r, 500));
        }
        if (controller.cancelled) {
          console.log(`🚫 Envío masivo cancelado para usuario ${userId || 'N/A'} antes de enviar contacto en lote ${batchIndex + 1}`);
          break;
        }
        const contact = batch[i];
        try {
          // Note: Pre-emptive permission check removed to fix admin false negatives.
          // We rely on actual send failure.

          // Replace variables in message y captions
          let personalizedMessage = message || '';

          // Prepare caption for this contact
          let effectiveCaption = '';

          Object.keys(contact).forEach(key => {
            const regex = new RegExp(`{{${key}}}`, 'g');
            personalizedMessage = personalizedMessage.replace(regex, contact[key]);
          });

          // Handle captions (single string or array)
          if (Array.isArray(parsedCaptions)) {
            // It's an array of captions (one per media file)
            effectiveCaption = parsedCaptions.map(c => {
              let captionStr = c || '';
              // Personalize each caption string in the array
              Object.keys(contact).forEach(key => {
                const regex = new RegExp(`{{${key}}}`, 'g');
                captionStr = captionStr.replace(regex, contact[key]);
              });
              return captionStr;
            });
          } else {
            // It's a single string caption
            effectiveCaption = parsedCaptions || '';
            if (typeof effectiveCaption === 'string') {
              Object.keys(contact).forEach(key => {
                const regex = new RegExp(`{{${key}}}`, 'g');
                effectiveCaption = effectiveCaption.replace(regex, contact[key]);
              });
            }
          }

          await this.sendMessage(contact.phone, personalizedMessage, mediaPath, effectiveCaption);

          results.push({
            contact: contact.phone,
            status: 'sent',
            timestamp: new Date()
          });

          processedCount++;
          successCount++;

          // Emit progress to frontend with userId
          this.io.emit('bulk_progress', {
            userId: userId || null,
            current: processedCount,
            total: totalContacts,
            successCount,
            failedCount,
            contact: contact.phone,
            status: 'sent',
            batch: batchIndex + 1,
            totalBatches: batches.length
          });

          // Wait before next message with random delay (between 1 and maxDelaySeconds seconds)
          if (i < batch.length - 1) {
            const randomDelay = Math.floor(Math.random() * (maxDelaySeconds - 1) * 1000) + 1000; // Random between 1 and maxDelaySeconds seconds in milliseconds
            await this.sleepWithControl(randomDelay, controller);
          }
        } catch (error) {
          console.error(`Error sending to ${contact.phone}:`, error);
          results.push({
            contact: contact.phone,
            status: 'failed',
            error: error.message,
            timestamp: new Date()
          });

          processedCount++;
          failedCount++;

          this.io.emit('bulk_progress', {
            userId: userId || null,
            current: processedCount,
            total: totalContacts,
            successCount,
            failedCount,
            contact: contact.phone,
            status: 'failed',
            batch: batchIndex + 1,
            totalBatches: batches.length
          });
        }
      }

      // Si el envío fue cancelado, no esperar entre lotes
      if (controller.cancelled) {
        break;
      }

      // Wait between batches (except after the last batch)
      if (batchIndex < batches.length - 1) {
        const waitTimeMs = waitMinutes * 60 * 1000;
        console.log(`⏳ Esperando ${waitMinutes} minutos antes del siguiente lote...`);

        // Emit waiting status
        this.io.emit('bulk_progress', {
          userId: userId || null,
          current: processedCount,
          total: totalContacts,
          status: 'waiting',
          batch: batchIndex + 1,
          totalBatches: batches.length,
          waitMinutes: waitMinutes
        });

        await this.sleepWithControl(waitTimeMs, controller);

        if (controller.cancelled) {
          console.log(`🚫 Envío masivo cancelado para usuario ${userId || 'N/A'} durante la espera entre lotes`);
          break;
        }

        console.log(`✅ Espera completada, continuando con el siguiente lote...`);
      }

      if (controller.cancelled) {
        break;
      }
    }

    if (controller.cancelled) {
      console.log(`✅ Envío masivo detenido: ${results.filter(r => r.status === 'sent').length} exitosos, ${results.filter(r => r.status === 'failed').length} fallidos (cancelado por usuario)`);
    } else {
      console.log(`✅ Envío masivo completado: ${results.filter(r => r.status === 'sent').length} exitosos, ${results.filter(r => r.status === 'failed').length} fallidos`);
    }

    this.clearBulk(userId);
    return results;
  }

  async getGroups() {
    if (!this.sock || !this.isReady) throw new Error('WhatsApp client no está listo');
    try {
      const rawSelfJid = this.sock?.user?.id || this.sock?.user?.jid || '';
      const rawSelfLid = this.sock?.user?.lid || this.sock?.user?.lidJid || this.sock?.user?.userLid || '';
      // rawSelfJid examples:
      // - "51987422887:77@s.whatsapp.net"
      // - "51987422887@s.whatsapp.net"
      const selfNumber = rawSelfJid ? rawSelfJid.split('@')[0].split(':')[0] : '';
      const selfJid = selfNumber ? `${selfNumber}@s.whatsapp.net` : '';

      const normalizeNumber = (jid) => {
        if (!jid || typeof jid !== 'string') return '';
        // examples:
        // - 51987422887@s.whatsapp.net
        // - 51987422887:77@s.whatsapp.net
        // - 227259772342457@lid
        const left = jid.split('@')[0];
        const numberPart = left.split(':')[0];
        return numberPart.replace(/\D/g, '');
      };

      const normalizeLid = (jid) => {
        if (!jid || typeof jid !== 'string') return '';
        // examples:
        // - 227259772342457@lid
        // - 227259772342457:0@lid
        const left = jid.split('@')[0];
        const lidPart = left.split(':')[0];
        return lidPart.replace(/\D/g, '');
      };

      const selfLid = rawSelfLid ? `${normalizeLid(rawSelfLid)}@lid` : '';

      const groupsObj = await this.sock.groupFetchAllParticipating();
      const groups = Object.values(groupsObj || {});
      return await Promise.all(
        groups.map(async (g) => {
          let image = null;
          try {
            // Baileys returns a temporary URL hosted by WhatsApp/CDN.
            // It can fail if the group has no photo or due to privacy/permissions.
            image = await this.sock.profilePictureUrl(g.id, 'image');
          } catch { }

          const announce = typeof g?.announce === 'boolean' ? g.announce : undefined;
          const isAdmin = !!(g?.participants || []).find((p) => {
            const participantId = p?.id || p?.jid || '';
            const participantLid = p?.lid || p?.participant_lid || '';
            const matchByJid = participantId && participantId === selfJid;
            const matchByLid = !!(
              selfLid &&
              (
                (participantLid && normalizeLid(participantLid) === normalizeLid(selfLid)) ||
                (participantId && participantId.endsWith('@lid') && normalizeLid(participantId) === normalizeLid(selfLid))
              )
            );
            const matchByNumber = selfNumber && (
              normalizeNumber(participantId) === selfNumber ||
              normalizeNumber(participantLid) === selfNumber
            );
            return (matchByJid || matchByLid || matchByNumber) && !!p?.admin;
          });
          const canSend = announce === true ? isAdmin : true;

          return {
            id: g.id,
            name: g.subject || g.id,
            participants: g.participants ? g.participants.length : 0,
            image: image || null,
            announce,
            isAdmin,
            canSend
          };
        })
      );
    } catch (error) {
      throw error;
    }
  }

  async getContacts(groupIds = null) {
    if (!this.sock || !this.isReady) throw new Error('WhatsApp client no está listo');
    try {
      console.log('[getContacts] Starting contact extraction...');
      if (groupIds && groupIds.length > 0) {
        console.log(`[getContacts] Filtering by ${groupIds.length} selected groups`);
      }

      const contactsMap = new Map();

      // 1. Get contacts from cache (from events) - only if no group filter
      if (!groupIds || groupIds.length === 0) {
        const cachedContacts = Object.values(this.contactsCache || {});
        console.log(`[getContacts] Found ${cachedContacts.length} contacts in cache`);

        cachedContacts.forEach(c => {
          if (c.id && c.id.endsWith('@s.whatsapp.net')) {
            const phone = c.id.split('@')[0];
            contactsMap.set(phone, {
              id: c.id,
              phone: phone,
              name: c.name || c.status || phone,
              groups: []
            });
          }
        });

        // 2. Get contacts from active chats using store - only if no group filter
        try {
          const chats = await this.sock.store?.chats?.all() || [];
          console.log(`[getContacts] Found ${chats.length} chats in store`);

          chats.forEach(chat => {
            if (chat.id && chat.id.endsWith('@s.whatsapp.net')) {
              const phone = chat.id.split('@')[0];
              if (!contactsMap.has(phone)) {
                contactsMap.set(phone, {
                  id: chat.id,
                  phone: phone,
                  name: chat.name || chat.notify || phone,
                  groups: []
                });
              }
            }
          });
        } catch (error) {
          console.log('[getContacts] Could not access chats from store:', error.message);
        }
      }

      // 3. Extract contacts from groups (all or filtered)
      try {
        const allGroups = await this.getGroups();
        const groupsToProcess = groupIds && groupIds.length > 0
          ? allGroups.filter(g => groupIds.includes(g.id))
          : allGroups;

        console.log(`[getContacts] Extracting contacts from ${groupsToProcess.length} groups`);

        // Process groups with rate-limit handling and progress tracking
        for (let i = 0; i < groupsToProcess.length; i++) {
          const group = groupsToProcess[i];
          const progress = {
            current: i + 1,
            total: groupsToProcess.length,
            groupName: group.name,
            percentage: Math.round(((i + 1) / groupsToProcess.length) * 100)
          };

          try {
            // Emit progress event
            this.io?.emit('contacts:extraction:progress', progress);

            // Get members with retry logic for rate-limits
            const members = await this.getGroupMembersWithRetry(group.id, group.name);
            console.log(`[getContacts] Group "${group.name}": ${members.length} members`);

            members.forEach(member => {
              const phone = member.phone;
              if (phone) {
                if (contactsMap.has(phone)) {
                  // Add group to existing contact
                  const contact = contactsMap.get(phone);
                  contact.groups.push({
                    id: group.id,
                    name: group.name,
                    image: group.image || null
                  });
                } else {
                  // Create new contact with group info
                  contactsMap.set(phone, {
                    id: member.id,
                    phone: phone,
                    name: member.name || phone,
                    groups: [{
                      id: group.id,
                      name: group.name,
                      image: group.image || null
                    }]
                  });
                }
              }
            });
          } catch (error) {
            console.log(`[getContacts] Error getting members from group ${group.name}:`, error.message);
            // Emit error but continue with other groups
            this.io?.emit('contacts:extraction:error', {
              groupName: group.name,
              error: error.message,
              ...progress
            });
          }
        }
      } catch (error) {
        console.log('[getContacts] Error getting groups:', error.message);
      }

      // 4. Convert map to array, fetch profile pictures, and filter out invalid entries
      const contactsArray = Array.from(contactsMap.values())
        .filter(c => c.phone && c.phone.length >= 8); // Valid phone numbers

      // Fetch profile pictures for all contacts
      const contactsWithImages = await Promise.all(
        contactsArray.map(async (c) => {
          let profilePicUrl = null;
          try {
            // Try to get profile picture
            profilePicUrl = await this.sock.profilePictureUrl(c.id, 'image');
          } catch (error) {
            // If no profile picture, use null (will show default avatar)
          }

          return {
            ...c,
            // Clean phone: remove @s.whatsapp.net if present
            phone: `+${c.phone.split('@')[0]}`,
            // Add profile picture URL
            profilePicUrl: profilePicUrl,
            // Add group names as comma-separated string for display
            groupNames: c.groups.map(g => g.name).join(', ') || 'Sin grupo'
          };
        })
      );

      const contacts = contactsWithImages.sort((a, b) => a.phone.localeCompare(b.phone)); // Sort by phone

      console.log(`[getContacts] Returning ${contacts.length} unique contacts`);
      return contacts;
    } catch (error) {
      console.error('[getContacts] Error:', error);
      throw error;
    }
  }

  // Helper function to get group members with retry logic for rate-limits
  async getGroupMembersWithRetry(groupId, groupName, maxRetries = 3) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const members = await this.getGroupMembers(groupId);
        return members;
      } catch (error) {
        lastError = error;
        const isRateLimit = error.message && error.message.toLowerCase().includes('rate');

        if (isRateLimit && attempt < maxRetries) {
          // Exponential backoff: 2s, 4s, 8s
          const delayMs = Math.pow(2, attempt) * 1000;
          console.log(`[getGroupMembersWithRetry] Rate limit for "${groupName}", retrying in ${delayMs}ms (attempt ${attempt}/${maxRetries})`);

          await new Promise(resolve => setTimeout(resolve, delayMs));
        } else if (!isRateLimit) {
          // If it's not a rate limit error, don't retry
          throw error;
        }
      }
    }

    // If all retries failed, throw the last error
    console.error(`[getGroupMembersWithRetry] Failed to get members for "${groupName}" after ${maxRetries} attempts`);
    throw lastError;
  }

  async getGroupMembers(groupId) {
    if (!this.sock || !this.isReady) throw new Error('WhatsApp client no está listo');
    try {
      const meta = await this.sock.groupMetadata(groupId);
      const participants = meta.participants || [];
      return participants.map(p => ({
        id: p.id,
        phone: (
          p?.phoneNumber ||
          p?.phone_number ||
          p?.pn ||
          (p.id || '').split('@')[0]
        ),
        name: p.name || p.notify || (p.id || '').split('@')[0],
        isAdmin: !!p.admin
      }));
    } catch (error) {
      throw error;
    }
  }

  getStatus() {
    let phone = null;
    try {
      const jid = this.sock?.user?.id || this.sock?.user?.jid;
      if (jid) {
        // JID format: "51987422887:77@s.whatsapp.net" - extraer solo el número antes de ':'
        const jidPart = jid.split('@')[0];
        const numberPart = jidPart.split(':')[0];
        phone = numberPart.replace(/\D/g, '');
      }
    } catch { }

    return {
      isReady: this.isReady,
      hasQR: !!this.qrCode,
      info: this.isReady ? { user: this.sock?.user, phone } : null,
      qr: this.qrDataUrl || null
    };
  }

  async destroy() {
    this._isDestroying = true;
    try {
      if (this.sock) {
        try { this.sock.ws?.close?.(); } catch { }
        try { this.sock.end?.(); } catch { }
      }
    } catch { }
    this.client = null;
    this.sock = null;
    this.isReady = false;
    this.qrCode = null;
    this.qrDataUrl = null;
    this.clearReconnectTimer();
    this._reconnectAttempts = 0;
  }

  clearSessionFiles() {
    try {
      const authDir = this.authDir || resolveSessionDir();
      if (fs.existsSync(authDir)) {
        fs.rmSync(authDir, { recursive: true, force: true });
        console.log(`🧹 Sesión Baileys eliminada manualmente: ${authDir}`);
      }
    } catch (error) {
      console.error('Error al eliminar sesión Baileys:', error);
    }
  }

  async resetSession() {
    await this.destroy();
    this.clearSessionFiles();
    await this.initialize();
  }
}

export default WhatsAppClient;
