import WhatsAppClient from './whatsapp.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * SessionManager - Gestiona múltiples sesiones de WhatsApp simultáneamente
 * Cada sesión tiene su propio cliente, carpeta de autenticación y número asociado
 */
class SessionManager {
  constructor(io) {
    this.io = io;
    this.sessions = new Map(); // sessionId -> { client: WhatsAppClient, userId, phoneNumber, status, createdAt }
    this.userSessions = new Map(); // userId -> Set<sessionId>
  }

  /**
   * Genera un ID único para una sesión
   */
  generateSessionId(userId) {
    return `session_${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Obtiene la primera sesión activa de un usuario
   */
  getFirstActiveSession(userId) {
    const actualUserId = Number(userId);
    const userSessionIds = this.userSessions.get(actualUserId);
    if (!userSessionIds || userSessionIds.size === 0) {
      return null;
    }

    // Buscar la primera sesión que esté lista
    for (const sessionId of userSessionIds) {
      const sessionData = this.sessions.get(sessionId);
      if (sessionData && sessionData.client && sessionData.client.isReady) {
        return sessionId;
      }
    }

    // Si ninguna está lista, devolver la primera disponible
    return Array.from(userSessionIds)[0] || null;
  }

  /**
   * Obtiene el estado de una sesión específica
   */
  getSessionStatus(sessionId) {
    const sessionData = this.sessions.get(sessionId);
    if (!sessionData) {
      return { status: 'not_found', isReady: false };
    }

    // Return combined status from internal state and client status
    const clientStatus = sessionData.client ? sessionData.client.getStatus() : {};
    return {
      status: sessionData.status, // initializing, connected, waiting_qr, disconnected
      isReady: sessionData.client ? sessionData.client.isReady : false,
      ...clientStatus
    };
  }

  /**
   * Obtiene la carpeta de autenticación para una sesión específica
   */
  getSessionAuthDir(sessionId) {
    const sessionsDir = process.env.SESSION_DIR || path.join(__dirname, '.baileys_sessions');

    // Extract userId from sessionId to organize by folder
    const match = sessionId.match(/^session_(\d+)_/);
    const userId = match ? match[1] : 'unknown';

    const userDir = path.join(sessionsDir, `user_${userId}`);

    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }

    const sessionDir = path.join(userDir, sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    return sessionDir;
  }

  /**
   * Crea una nueva sesión de WhatsApp para un usuario
   */
  async createSession(userId) {
    try {
      const actualUserId = Number(userId);
      const sessionId = this.generateSessionId(actualUserId);
      const sessionAuthDir = this.getSessionAuthDir(sessionId);

      // Crear cliente de WhatsApp para esta sesión
      const client = new WhatsAppClient(this.io, sessionAuthDir, sessionId);
      client.setActiveUserId(actualUserId);

      // Guardar sesión
      const sessionData = {
        client,
        userId: actualUserId,
        phoneNumber: null,
        status: 'initializing',
        createdAt: new Date(),
        sessionId,
        authDir: sessionAuthDir
      };

      this.sessions.set(sessionId, sessionData);

      // Asociar sesión al usuario
      if (!this.userSessions.has(actualUserId)) {
        this.userSessions.set(actualUserId, new Set());
      }
      this.userSessions.get(actualUserId).add(sessionId);

      // Emitir evento de nueva sesión
      this.io.emit('session_created', {
        sessionId,
        userId: actualUserId,
        status: 'initializing',
        createdAt: sessionData.createdAt
      });

      console.log(`[SessionManager] Created session ${sessionId} for user ${userId}`);

      return {
        success: true,
        sessionId,
        status: sessionData.status,
        createdAt: sessionData.createdAt
      };
    } catch (error) {
      console.error('[SessionManager] Error creating session:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Inicializa una sesión (conecta a WhatsApp)
   */
  async initializeSession(sessionId) {
    try {
      const sessionData = this.sessions.get(sessionId);
      if (!sessionData) {
        throw new Error('Session not found');
      }

      // Inicializar cliente
      await sessionData.client.initialize();

      // Escuchar eventos de conexión a través del cliente (persiste tras reconexiones)
      sessionData.client.on('connection.update', (update) => {
        const { connection, qr } = update;

        if (connection === 'open') {
          sessionData.status = 'connected';
          this.sessions.set(sessionId, sessionData);

          // Intentar obtener el número de teléfono del socket actual
          const userJid = sessionData.client.sock?.user?.id;
          const phoneNumber = userJid ? userJid.split('@')[0].split(':')[0] : null;
          if (phoneNumber) {
            sessionData.phoneNumber = phoneNumber;
          }

          this.io.emit('session_updated', {
            sessionId,
            userId: sessionData.userId,
            status: 'connected',
            isReady: true,
            phoneNumber
          });
          console.log(`[SessionManager] Session ${sessionId} connected`);
        } else if (connection === 'close') {
          const statusCode = update.lastDisconnect?.error?.output?.statusCode;
          const loggedOut = statusCode === 401 || statusCode === 403;

          if (loggedOut) {
            console.log(`[SessionManager] Session ${sessionId} logged out. Removing from manager.`);
            this.destroySession(sessionId).catch(() => { });
          } else {
            sessionData.status = 'disconnected';
            this.io.emit('session_updated', {
              sessionId,
              status: 'disconnected',
              isReady: false
            });
          }
        } else if (qr) {
          sessionData.status = 'waiting_qr';
          this.io.emit('session_updated', {
            sessionId,
            status: 'waiting_qr',
            isReady: false
          });
        }
      });

      // Verificación inmediata de conexión
      const isAlreadyConnected = sessionData.client.isReady ||
        (sessionData.client.sock?.ws?.readyState === 1);

      if (isAlreadyConnected) {
        console.log(`[SessionManager] Session ${sessionId} was already connected after init`);
        sessionData.status = 'connected';
        this.sessions.set(sessionId, sessionData);

        const userJid = sessionData.client.sock?.user?.id;
        const phoneNumber = userJid ? userJid.split(':')[0] : null;

        this.io.emit('session_updated', {
          sessionId,
          userId: sessionData.userId,
          status: 'connected',
          isReady: true,
          phoneNumber
        });
      }

      // Actualizar estado inicial (solo si no estamos conectados)
      if (sessionData.status !== 'connected') {
        sessionData.status = 'waiting_qr';
        this.sessions.set(sessionId, sessionData);

        this.io.emit('session_updated', {
          sessionId,
          userId: sessionData.userId,
          status: 'waiting_qr'
        });
      }

      console.log(`[SessionManager] Initialized session ${sessionId}`);

      return { success: true };
    } catch (error) {
      console.error('[SessionManager] Error initializing session:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Obtiene todas las sesiones de un usuario
   */
  getUserSessions(userId) {
    const actualUserId = Number(userId);
    const sessionIds = this.userSessions.get(actualUserId) || new Set();
    const sessions = [];

    for (const sessionId of sessionIds) {
      const sessionData = this.sessions.get(sessionId);
      if (sessionData) {
        sessions.push({
          sessionId,
          userId: sessionData.userId,
          phoneNumber: sessionData.phoneNumber,
          status: sessionData.status,
          createdAt: sessionData.createdAt,
          isReady: sessionData.client?.isReady || false
        });
      }
    }

    return sessions;
  }

  /**
   * Obtiene la primera sesión conectada de un usuario
   */
  getFirstActiveSession(userId) {
    const actualUserId = Number(userId);
    const sessionIds = this.userSessions.get(actualUserId) || new Set();
    for (const sessionId of sessionIds) {
      const sessionData = this.sessions.get(sessionId);
      if (sessionData && (sessionData.status === 'connected' || (sessionData.client && sessionData.client.isReady))) {
        return sessionId;
      }
    }
    return null;
  }

  /**
   * Obtiene cualquier sesión conectada (para tareas globales)
   */
  getAnyActiveSession() {
    for (const [sessionId, sessionData] of this.sessions.entries()) {
      if (sessionData && (sessionData.status === 'connected' || (sessionData.client && sessionData.client.isReady))) {
        return sessionId;
      }
    }
    return null;
  }

  /**
   * Obtiene todas las sesiones activas
   */
  getAllSessions() {
    const sessions = [];
    for (const [sessionId, sessionData] of this.sessions.entries()) {
      sessions.push({
        sessionId,
        userId: sessionData.userId,
        phoneNumber: sessionData.phoneNumber,
        status: sessionData.status,
        createdAt: sessionData.createdAt,
        isReady: sessionData.client?.isReady || false
      });
    }
    return sessions;
  }

  /**
   * Obtiene una sesión específica
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  /**
   * Obtiene el cliente de WhatsApp de una sesión
   */
  getSessionClient(sessionId) {
    const sessionData = this.sessions.get(sessionId);
    return sessionData?.client || null;
  }

  /**
   * Actualiza el número de teléfono de una sesión
   */
  updateSessionPhone(sessionId, phoneNumber) {
    const sessionData = this.sessions.get(sessionId);
    if (sessionData) {
      sessionData.phoneNumber = phoneNumber;
      sessionData.status = 'connected';
      this.sessions.set(sessionId, sessionData);

      this.io.emit('session_updated', {
        sessionId,
        userId: sessionData.userId,
        phoneNumber,
        status: 'connected'
      });

      console.log(`[SessionManager] Updated session ${sessionId} with phone ${phoneNumber}`);
    }
  }

  /**
   * Envía un mensaje usando una sesión específica (soporta texto y multimedia)
   */
  async sendMessage(sessionId, to, message = '', mediaPath = null, caption = '') {
    const client = this.getSessionClient(sessionId);
    if (!client || !client.isReady) {
      throw new Error('La sesión de WhatsApp no está lista o no existe');
    }
    return await client.sendMessage(to, message, mediaPath, caption);
  }

  /**
   * Envía mensajes masivos usando una sesión específica
   */
  async sendBulkMessages(sessionId, ...args) {
    const client = this.getSessionClient(sessionId);
    if (!client || !client.isReady) {
      throw new Error('La sesión de WhatsApp no está lista o no existe');
    }
    return await client.sendBulkMessages(...args);
  }

  /**
   * Obtiene la lista de grupos
   */
  async getGroups(sessionId) {
    const client = this.getSessionClient(sessionId);
    if (!client || !client.isReady) {
      throw new Error('La sesión de WhatsApp no está lista o no existe');
    }
    return await client.getGroups();
  }

  /**
   * Desconecta y elimina una sesión
   */
  async destroySession(sessionId) {
    try {
      const sessionData = this.sessions.get(sessionId);
      if (!sessionData) {
        return { success: false, error: 'Session not found' };
      }

      // Destruir cliente de WhatsApp
      if (sessionData.client) {
        await sessionData.client.destroy();
      }

      // Eliminar carpeta de autenticación
      if (sessionData.authDir && fs.existsSync(sessionData.authDir)) {
        fs.rmSync(sessionData.authDir, { recursive: true, force: true });
      }

      // Eliminar de mapas
      this.sessions.delete(sessionId);
      const userSessionSet = this.userSessions.get(sessionData.userId);
      if (userSessionSet) {
        userSessionSet.delete(sessionId);
        if (userSessionSet.size === 0) {
          this.userSessions.delete(sessionData.userId);
        }
      }

      this.io.emit('session_destroyed', {
        sessionId,
        userId: sessionData.userId
      });

      console.log(`[SessionManager] Destroyed session ${sessionId}`);

      return { success: true };
    } catch (error) {
      console.error('[SessionManager] Error destroying session:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Limpia todas las sesiones de un usuario
   */
  async destroyUserSessions(userId) {
    const actualUserId = Number(userId);
    const sessionIds = Array.from(this.userSessions.get(actualUserId) || []);
    const results = [];

    for (const sessionId of sessionIds) {
      const result = await this.destroySession(sessionId);
      results.push({ sessionId, ...result });
    }

    return results;
  }

  /**
   * Obtiene el QR code de una sesión
   */
  getSessionQR(sessionId) {
    const sessionData = this.sessions.get(sessionId);
    if (!sessionData || !sessionData.client) {
      return null;
    }
    return sessionData.client.getQrCode();
  }

  /**
   * Envía un mensaje usando una sesión específica
   */
  async sendMessage(sessionId, to, message, mediaPath = null, caption = '') {
    const sessionData = this.sessions.get(sessionId);
    if (!sessionData) {
      throw new Error('Session not found');
    }

    if (!sessionData.client || !sessionData.client.isReady) {
      throw new Error('Session not ready');
    }

    return await sessionData.client.sendMessage(to, message, mediaPath, caption);
  }

  /**
   * Restaura sesiones desde el disco al iniciar el servidor
   */
  async restoreSessions() {
    try {
      const sessionsDir = process.env.SESSION_DIR || path.join(__dirname, '.baileys_sessions');
      console.log(`[SessionManager] Restoring sessions from: ${sessionsDir}`);

      if (!fs.existsSync(sessionsDir)) {
        console.log('[SessionManager] No sessions directory found');
        return;
      }

      // 1. Migración: Mover carpetas de sesión antiguas a carpetas de usuario
      const rootItems = fs.readdirSync(sessionsDir);
      for (const itemName of rootItems) {
        const itemPath = path.join(sessionsDir, itemName);

        // Skip files
        try {
          if (!fs.statSync(itemPath).isDirectory()) continue;
        } catch (e) { continue; }

        // Si es una sesión antigua (directa en root con formato session_USERID_...)
        const legacyMatch = itemName.match(/^session_(\d+)_/);
        if (legacyMatch) {
          const userId = legacyMatch[1];
          const userDir = path.join(sessionsDir, `user_${userId}`);

          if (!fs.existsSync(userDir)) {
            fs.mkdirSync(userDir, { recursive: true });
          }

          const newSessionPath = path.join(userDir, itemName);
          console.log(`[SessionManager] Migrating legacy session ${itemName} to ${newSessionPath}`);

          try {
            fs.renameSync(itemPath, newSessionPath);
          } catch (err) {
            console.error(`[SessionManager] Failed to migrate session ${itemName}:`, err);
          }
        }
      }

      // 2. Restauración: Buscar en carpetas de usuario
      const updatedRootItems = fs.readdirSync(sessionsDir);
      let sessionCount = 0;

      for (const userDirName of updatedRootItems) {
        // Buscar carpetas user_XXX
        const userMatch = userDirName.match(/^user_(\d+)$/);
        if (!userMatch) continue;

        const userId = Number(userMatch[1]);
        const userDirPath = path.join(sessionsDir, userDirName);

        if (!fs.statSync(userDirPath).isDirectory()) continue;

        const sessionDirs = fs.readdirSync(userDirPath);

        for (const sessionDir of sessionDirs) {
          const sessionPath = path.join(userDirPath, sessionDir);

          // Validar que sea un directorio
          try {
            if (!fs.statSync(sessionPath).isDirectory()) continue;
          } catch (e) { continue; }

          const sessionId = sessionDir;

          // Extraer userId del nombre de la sesión para doble verificación (opcional)
          // const match = sessionId.match(/^session_(\d+)_/);

          console.log(`[SessionManager] Restoring session ${sessionId} for user ${userId}`);

          // Crear cliente con ruta absoluta explícita
          const absoluteSessionPath = path.resolve(sessionPath);
          const client = new WhatsAppClient(this.io, absoluteSessionPath, sessionId);
          client.setActiveUserId(userId);

          // Guardar sesión
          const sessionData = {
            client,
            userId,
            phoneNumber: null,
            status: 'restored',
            createdAt: new Date(),
            sessionId,
            authDir: absoluteSessionPath
          };

          // Intentar leer metadatos (creds.json)
          let phoneNumber = null;
          try {
            const stat = fs.statSync(sessionPath);
            sessionData.createdAt = stat.birthtime;

            const credsPath = path.join(sessionPath, 'creds.json');
            if (fs.existsSync(credsPath)) {
              const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
              if (creds.me && (creds.me.id || creds.me.jid)) {
                const jid = creds.me.id || creds.me.jid;
                phoneNumber = jid.split('@')[0].split(':')[0].replace(/\D/g, '');
                console.log(`[SessionManager] Found phone ${phoneNumber} in creds.json for ${sessionId}`);
              }
            }
          } catch (e) {
            console.warn(`[SessionManager] Could not read metadata for ${sessionId}:`, e.message);
          }

          if (phoneNumber) {
            sessionData.phoneNumber = phoneNumber;
          }

          this.sessions.set(sessionId, sessionData);

          if (!this.userSessions.has(userId)) {
            this.userSessions.set(userId, new Set());
          }
          this.userSessions.get(userId).add(sessionId);

          sessionCount++;

          // Auto-inicializar
          try {
            await this.initializeSession(sessionId);
          } catch (error) {
            console.error(`[SessionManager] Error auto-initializing session ${sessionId}:`, error);
          }
        }
      }

      console.log(`[SessionManager] Restored total ${sessionCount} sessions.`);

    } catch (error) {
      console.error('[SessionManager] Error restoring sessions:', error);
    }
  }
}

export default SessionManager;
