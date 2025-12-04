import qrcode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
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

class WhatsAppClient {
  constructor(io) {
    this.io = io;
    this.client = null;
    this.sock = null;
    this.contactsCache = {};
    this.isReady = false;
    this.qrCode = null;
    this.qrDataUrl = null;
    this.autoReplyRules = [];
    this.activeUserId = null;
    this.config = {
      headless: true,
      messageDelay: 2,
      maxContactsPerBatch: 50,
      waitTimeBetweenBatches: 15
    };
    this.bulkControllers = new Map(); // Control por usuario para envíos masivos
    this.loadAutoReplyRules();
    this.loadConfig();
  }

  // Method to set active user ID (called from server.js socket handler)
  setActiveUserId(userId) {
    this.activeUserId = userId;
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
      const rulesPath = path.join(__dirname, 'data', 'autoReplyRules.json');
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
      const dataDir = path.join(__dirname, 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      const rulesPath = path.join(dataDir, 'autoReplyRules.json');
      fs.writeFileSync(rulesPath, JSON.stringify(this.autoReplyRules, null, 2));
    } catch (error) {
      console.error('Error saving auto-reply rules:', error);
    }
  }

  loadConfig() {
    try {
      const configPath = path.join(__dirname, 'data', 'config.json');
      if (fs.existsSync(configPath)) {
        this.config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      }
    } catch (error) {
      console.error('Error loading config:', error);
    }
  }

  saveConfig() {
    try {
      const dataDir = path.join(__dirname, 'data');
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

  async initialize() {
    console.log('Inicializando cliente WhatsApp (Baileys)...');
    const authDir = resolveSessionDir();
    if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();
    this.sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      browser: ['WhatyBot', 'Chrome', '1.0.0']
    });
    this.client = this.sock;
    this.sock.ev.on('creds.update', saveCreds);
    this.sock.ev.on('connection.update', async (update) => {
      const { connection, qr, lastDisconnect } = update;
      if (qr) {
        try {
          this.qrCode = qr;
          const qrDataUrl = await qrcode.toDataURL(qr);
          this.qrDataUrl = qrDataUrl;
          this.io.emit('qr', { qr: qrDataUrl });
        } catch (e) {}
      }
      if (connection === 'open') {
        this.isReady = true;
        this.qrCode = null;
        this.qrDataUrl = null;
        this.io.emit('authenticated');
        this.io.emit('ready', { status: 'connected' });
      } else if (connection === 'close') {
        this.isReady = false;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        this.io.emit('disconnected', { reason: loggedOut ? 'logged_out' : 'connection_closed' });
        setTimeout(() => this.initialize().catch(() => {}), loggedOut ? 1000 : 2000);
      }
    });
    this.sock.ev.on('messages.upsert', async ({ messages }) => {
      try {
        const m = messages && messages[0];
        if (!m) return;
        const isGroup = (m.key.remoteJid || '').endsWith('@g.us');
        const fromMe = !!m.key.fromMe;
        if (isGroup || fromMe) return;
        const from = m.key.remoteJid;
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
        } catch {}
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
        for (const rule of this.autoReplyRules) {
          if (!rule.isActive) continue;
          const messageText = body;
          let shouldReply = false;
          if (rule.matchType === 'exact') {
            shouldReply = rule.keywords.some(keyword => messageText === keyword.toLowerCase());
          } else if (rule.matchType === 'contains') {
            shouldReply = rule.keywords.some(keyword => messageText.includes(keyword.toLowerCase()));
          }
          if (shouldReply) {
            const textMessage = rule.response || '';

            // Soporte para múltiples archivos por regla
            const mediaPaths = Array.isArray(rule.mediaPaths)
              ? rule.mediaPaths.filter(Boolean)
              : (rule.mediaPath ? [rule.mediaPath] : []);

            let captions = Array.isArray(rule.captions)
              ? rule.captions
              : mediaPaths.map(() => (rule.caption || ''));

            console.log('[WhatsAppClient] Auto-reply matched rule:', {
              id: rule.id,
              name: rule.name,
              mediaPaths,
              captions
            });

            await new Promise(r => setTimeout(r, rule.delay * 1000));
            await this.sendMessage(from, textMessage, mediaPaths, captions);
            if (currentUser && currentUser.id) {
              await messageCountService.incrementCount(currentUser.id, 1);
              await messageLogService.logMessage(
                currentUser.id,
                'auto-reply',
                from,
                'sent',
                `Auto-reply: ${textMessage || '[Archivo multimedia]'}`,
                null
              );
            }
            if (this.io) {
              this.io.emit('message_log', {
                id: Date.now().toString(),
                userId: currentUser?.id || null,
                target: from,
                status: 'sent',
                timestamp: new Date(),
                content: `Auto-reply: ${textMessage || '[Archivo multimedia]'}`,
                messageType: 'auto-reply'
              });
            }
            break;
          }
        }
      } catch (error) {}
    });

    // Cache contacts from Baileys events
    this.sock.ev.on('contacts.upsert', (contacts = []) => {
      try {
        contacts.forEach(c => {
          if (c && c.id) {
            this.contactsCache[c.id] = { id: c.id, name: c.name || c.notify, status: c.status };
          }
        });
      } catch {}
    });
    this.sock.ev.on('contacts.update', (updates = []) => {
      try {
        updates.forEach(u => {
          const id = u?.id;
          if (!id) return;
          const prev = this.contactsCache[id] || { id };
          this.contactsCache[id] = { ...prev, name: u.name || prev.name, status: u.status || prev.status };
        });
      } catch {}
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
      } catch {}
    });
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

      for (let i = 0; i < mediaPaths.length; i++) {
        const currentPath = mediaPaths[i];
        if (!currentPath) continue;
        const currentCaption = captions[i] || '';

        const ext = path.extname(currentPath).toLowerCase();
        const data = fs.readFileSync(currentPath);
        if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
          await this.sock.sendMessage(jid, { image: data, caption: currentCaption || undefined });
        } else if (['.mp4', '.mov', '.avi', '.mkv', '.webm'].includes(ext)) {
          await this.sock.sendMessage(jid, { video: data, caption: currentCaption || undefined });
        } else if (['.mp3', '.wav', '.ogg', '.m4a'].includes(ext)) {
          await this.sock.sendMessage(jid, { audio: data });
        } else {
          await this.sock.sendMessage(jid, { document: data, fileName: path.basename(currentPath) });
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
        } catch {}
      }

      if (message && message.trim()) {
        await this.sock.sendMessage(jid, { text: message });
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

    const results = [];
    const totalContacts = contacts.length;
    let processedCount = 0;
    const controller = this.getBulkController(userId);
    controller.cancelled = false;
    controller.paused = false;

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
          // Replace variables in message y captions
          let personalizedMessage = message || '';

          // caption puede ser string o array de strings
          let personalizedCaption = caption;
          let personalizedCaptionsArray = null;

          Object.keys(contact).forEach(key => {
            const regex = new RegExp(`{{${key}}}`, 'g');
            personalizedMessage = personalizedMessage.replace(regex, contact[key]);

            if (typeof personalizedCaption === 'string') {
              personalizedCaption = personalizedCaption.replace(regex, contact[key]);
            }
          });

          // Si caption es array, personalizar cada elemento
          if (Array.isArray(caption)) {
            personalizedCaptionsArray = caption.map(c => {
              let result = c || '';
              Object.keys(contact).forEach(key => {
                const regex = new RegExp(`{{${key}}}`, 'g');
                result = result.replace(regex, contact[key]);
              });
              return result;
            });
          }

          const effectiveCaption = Array.isArray(caption) ? personalizedCaptionsArray : personalizedCaption;

          await this.sendMessage(contact.phone, personalizedMessage, mediaPath, effectiveCaption);

          results.push({
            contact: contact.phone,
            status: 'sent',
            timestamp: new Date()
          });

          processedCount++;

          // Emit progress to frontend with userId
          this.io.emit('bulk_progress', {
            userId: userId || null,
            current: processedCount,
            total: totalContacts,
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

          this.io.emit('bulk_progress', {
            userId: userId || null,
            current: processedCount,
            total: totalContacts,
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
      const groupsObj = await this.sock.groupFetchAllParticipating();
      const groups = Object.values(groupsObj || {});
      return groups.map(g => ({
        id: g.id,
        name: g.subject || g.id,
        participants: g.participants ? g.participants.length : 0,
        image: null
      }));
    } catch (error) {
      throw error;
    }
  }

  async getContacts() {
    if (!this.sock || !this.isReady) throw new Error('WhatsApp client no está listo');
    try {
      const contacts = Object.values(this.contactsCache || {});
      return contacts
        .filter(c => c.id && c.id.endsWith('@s.whatsapp.net'))
        .map(c => ({
          id: c.id,
          phone: (c.id || '').split('@')[0],
          name: c.name || c.status || (c.id || '').split('@')[0]
        }));
    } catch (error) {
      throw error;
    }
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
    return {
      isReady: this.isReady,
      hasQR: !!this.qrCode,
      info: this.isReady ? { user: this.sock?.user } : null,
      qr: this.qrDataUrl || null
    };
  }

  async destroy() {
    try {
      if (this.sock) {
        try { this.sock.ws?.close?.(); } catch {}
        try { this.sock.end?.(); } catch {}
      }
    } catch {}
    this.client = null;
    this.sock = null;
    this.isReady = false;
    this.qrCode = null;
    this.qrDataUrl = null;
  }

  clearSessionFiles() {
    try {
      const authDir = resolveSessionDir();
      if (fs.existsSync(authDir)) {
        fs.rmSync(authDir, { recursive: true, force: true });
        console.log('🧹 Sesión Baileys eliminada manualmente');
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
