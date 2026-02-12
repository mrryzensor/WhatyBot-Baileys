import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Helper to get session ID with fallback
const getSessionId = (req) => {
    const sessionManager = req.app.get('sessionManager');
    return req.sessionId || sessionManager.getFirstActiveSession(req.userId);
};

// Helper for display formatting
const formatTarget = (jid, groupName = null) => {
    if (!jid) return 'Desconocido';
    if (jid.endsWith('@g.us')) return groupName || jid;
    return jid.replace('@s.whatsapp.net', '').replace('@c.us', '');
};

// GET /api/messages/logs - Get message logs for current user
router.get('/logs', async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Usuario no autenticado' });
        }

        const messageLogService = req.app.get('messageLogService');
        const limit = parseInt(req.query.limit) || 100;
        const logs = await messageLogService.getMessageLogs(userId, limit);

        // Convert logs to match MessageLog interface
        const formattedLogs = logs.map(log => ({
            id: log.id.toString(),
            userId: log.user_id,
            target: log.recipient,
            status: log.status,
            timestamp: new Date(log.sent_at),
            content: log.content || '',
            messageType: log.message_type || 'single'
        }));

        res.json({ success: true, logs: formattedLogs });
    } catch (error) {
        console.error('Error getting message logs:', error);
        res.status(500).json({ error: error.message });
    }
});

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // En Railway y otros entornos, asegurar ruta absoluta para evitar ambigüedades
        const uploadDir = process.env.UPLOAD_DIR
            ? path.resolve(process.env.UPLOAD_DIR)
            : path.join(__dirname, '../../uploads');

        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 100 * 1024 * 1024 // 100MB limit for heavy media
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|mp4|avi|mov|pdf|doc|docx|xls|xlsx|mp3|wav|ogg/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Invalid file type'));
        }
    }
});

// POST /api/messages/send - Send individual message
router.post('/send', async (req, res) => {
    try {
        const { to, message, scheduledAt } = req.body;
        const sessionManager = req.app.get('sessionManager');
        const messageScheduler = req.app.get('messageScheduler');
        const validationService = req.app.get('validationService');
        const messageCountService = req.app.get('messageCountService');
        const messageLogService = req.app.get('messageLogService');

        const sessionId = getSessionId(req);
        if (!sessionId) {
            return res.status(400).json({ error: 'No hay una sesión de WhatsApp activa' });
        }

        if (!to) {
            return res.status(400).json({ error: 'Missing required field: to' });
        }

        if (!message && !req.body.mediaPath) {
            return res.status(400).json({ error: 'Missing required field: message or media' });
        }

        if (!scheduledAt) {
            const userId = req.userId;
            if (!userId) {
                return res.status(401).json({ error: 'Usuario no autenticado' });
            }
            const validation = await validationService.canSendMessages(userId, 1);
            if (!validation.allowed) {
                return res.status(403).json({
                    error: validation.reason,
                    limitExceeded: validation.limitExceeded || false,
                    currentCount: validation.currentCount,
                    limit: validation.limit
                });
            }
        }

        if (scheduledAt) {
            const scheduleTime = new Date(scheduledAt);
            if (isNaN(scheduleTime.getTime())) {
                return res.status(400).json({ error: 'Invalid date format' });
            }

            const userId = req.userId;
            const jobId = messageScheduler.scheduleMessage(to, message || '', null, '', scheduleTime, userId);
            return res.json({ success: true, message: 'Message scheduled', jobId });
        }

        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Usuario no autenticado' });
        }

        let targetDisplay = null;
        try {
            // Note: Pre-emptive permission check removed.
            // We rely on the actual send failure from Baileys/WhatsApp to determine permissions.

            const cleanTarget = formatTarget(to, targetDisplay);
            const result = await sessionManager.sendMessage(sessionId, to, message || '');
            await messageCountService.incrementCount(userId, 1);
            await messageLogService.logMessage(userId, 'single', cleanTarget, 'sent', message || '', null);

            const io = req.app.get('io');
            if (io) {
                io.emit('message_log', {
                    id: uuidv4(),
                    userId,
                    target: cleanTarget,
                    status: 'sent',
                    timestamp: new Date(),
                    content: message || '',
                    messageType: 'single'
                });
            }

            res.json({ success: true, result });
        } catch (sendError) {
            const cleanTarget = formatTarget(to, targetDisplay);
            await messageLogService.logMessage(userId, 'single', cleanTarget, 'failed', message || '', null);

            const io = req.app.get('io');
            if (io) {
                io.emit('message_log', {
                    id: uuidv4(),
                    userId,
                    target: cleanTarget,
                    status: 'failed',
                    timestamp: new Date(),
                    content: message || '',
                    messageType: 'single'
                });
            }
            throw sendError;
        }
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/messages/send-media - Send message with one or multiple media files
router.post('/send-media', upload.array('media', 10), async (req, res) => {
    try {
        const { to, message, caption, captions, scheduledAt } = req.body;
        const sessionManager = req.app.get('sessionManager');
        const messageScheduler = req.app.get('messageScheduler');
        const validationService = req.app.get('validationService');
        const messageCountService = req.app.get('messageCountService');
        const messageLogService = req.app.get('messageLogService');

        const sessionId = getSessionId(req);
        if (!sessionId) {
            return res.status(400).json({ error: 'No hay una sesión de WhatsApp activa' });
        }

        if (!to) {
            return res.status(400).json({ error: 'Missing required field: to' });
        }

        const files = Array.isArray(req.files) ? req.files : [];
        if (!files || files.length === 0) {
            return res.status(400).json({ error: 'No media file uploaded' });
        }

        if (!scheduledAt) {
            const userId = req.userId;
            const validation = await validationService.canSendMessages(userId, 1);
            if (!validation.allowed) {
                return res.status(403).json({ error: validation.reason });
            }
        }

        const mediaPaths = files.map(f => f.path);
        let mediaCaptions = [];
        if (captions) {
            try {
                const parsed = JSON.parse(captions);
                if (Array.isArray(parsed)) {
                    mediaCaptions = parsed.map(c => (typeof c === 'string' ? c : ''));
                }
            } catch (e) { }
        }
        if (mediaCaptions.length === 0) {
            mediaCaptions = mediaPaths.map(() => caption || '');
        }

        if (scheduledAt) {
            const scheduleTime = new Date(scheduledAt);
            const userId = req.userId;
            const jobId = messageScheduler.scheduleMessage(to, message || '', mediaPaths, mediaCaptions, scheduleTime, userId);
            return res.json({ success: true, message: 'Media message scheduled', jobId });
        }

        const userId = req.userId;
        let targetDisplay = null;
        try {
            // Note: Pre-emptive permission check removed.
            // We rely on the actual send failure from Baileys/WhatsApp to determine permissions.

            const cleanTarget = formatTarget(to, targetDisplay);
            const result = await sessionManager.sendMessage(sessionId, to, message || '', mediaPaths, mediaCaptions);
            await messageCountService.incrementCount(userId, 1);
            await messageLogService.logMessage(userId, 'media', cleanTarget, 'sent', message || '[Archivo multimedia]', null);

            const io = req.app.get('io');
            if (io) {
                io.emit('message_log', {
                    id: uuidv4(),
                    userId,
                    target: cleanTarget,
                    status: 'sent',
                    timestamp: new Date(),
                    content: message || '[Archivo multimedia]',
                    messageType: 'media'
                });
            }

            setTimeout(() => {
                if (!scheduledAt) {
                    for (const p of mediaPaths) {
                        if (p && fs.existsSync(p)) fs.unlinkSync(p);
                    }
                }
            }, 5000);

            res.json({ success: true, result });
        } catch (sendError) {
            const cleanTarget = formatTarget(to, targetDisplay);
            await messageLogService.logMessage(userId, 'media', cleanTarget, 'failed', message || '[Archivo multimedia]', null);

            const io = req.app.get('io');
            if (io) {
                io.emit('message_log', {
                    id: uuidv4(),
                    userId,
                    target: cleanTarget,
                    status: 'failed',
                    timestamp: new Date(),
                    content: message || '[Archivo multimedia]',
                    messageType: 'media'
                });
            }
            throw sendError;
        }
    } catch (error) {
        console.error('Error sending media:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/messages/send-bulk - Send bulk messages
router.post('/send-bulk', upload.array('media', 10), async (req, res) => {
    try {
        const { contacts, message, caption, captions, delay, scheduledAt } = req.body;
        const sessionManager = req.app.get('sessionManager');
        const messageScheduler = req.app.get('messageScheduler');
        const validationService = req.app.get('validationService');
        const messageCountService = req.app.get('messageCountService');
        const messageLogService = req.app.get('messageLogService');

        const sessionId = getSessionId(req);
        if (!sessionId) {
            return res.status(400).json({ error: 'No hay una sesión de WhatsApp activa' });
        }

        if (!contacts) {
            return res.status(400).json({ error: 'Missing required field: contacts' });
        }

        const files = Array.isArray(req.files) ? req.files : [];
        let contactsList = typeof contacts === 'string' ? JSON.parse(contacts) : contacts;

        if (!scheduledAt) {
            const userId = req.userId;
            const validation = await validationService.canSendMessages(userId, contactsList.length);
            if (!validation.allowed) {
                return res.status(403).json({ error: validation.reason });
            }
        }

        const mediaPaths = files.map(f => f.path);
        let mediaCaptions = [];
        if (captions) {
            try {
                const parsed = JSON.parse(captions);
                if (Array.isArray(parsed)) {
                    mediaCaptions = parsed.map(c => (typeof c === 'string' ? c : ''));
                }
            } catch (e) { }
        }
        if (mediaCaptions.length === 0) {
            mediaCaptions = mediaPaths.map(() => caption || '');
        }

        const userId = req.userId;
        const messageDelay = parseInt(delay) || 2;
        const maxContactsPerBatch = 50;
        const waitTimeBetweenBatches = 15;

        if (scheduledAt) {
            const scheduleTime = new Date(scheduledAt);
            const jobId = messageScheduler.scheduleBulkMessages(contactsList, message || '', mediaPaths, mediaCaptions, messageDelay, scheduleTime, userId, maxContactsPerBatch, waitTimeBetweenBatches);
            return res.json({ success: true, message: 'Bulk messages scheduled', jobId });
        }

        sessionManager.sendBulkMessages(sessionId, contactsList, message || '', mediaPaths, mediaCaptions, messageDelay, userId, maxContactsPerBatch, waitTimeBetweenBatches)
            .then(async (results) => {
                const successCount = results.filter(r => r.status === 'sent').length;
                if (successCount > 0) {
                    await messageCountService.incrementCount(userId, successCount);
                }

                const io = req.app.get('io');
                // Log all results (sent and failed)
                for (const result of results) {
                    const status = result.status === 'sent' ? 'sent' : 'failed';
                    const cleanTarget = formatTarget(result.contact);
                    await messageLogService.logMessage(
                        userId,
                        'bulk',
                        cleanTarget,
                        status,
                        message || '[Archivo multimedia]',
                        null
                    );

                    // Emit to dashboard
                    if (io) {
                        io.emit('message_log', {
                            id: uuidv4(),
                            userId,
                            target: cleanTarget,
                            status: status,
                            timestamp: new Date(),
                            content: message || '[Archivo multimedia]',
                            messageType: 'bulk'
                        });
                    }
                }
                if (mediaPaths.length > 0) {
                    for (const p of mediaPaths) {
                        if (p && fs.existsSync(p)) fs.unlinkSync(p);
                    }
                }
            })
            .catch(error => console.error('Error in bulk send:', error));

        res.json({ success: true, message: 'Bulk send started', total: contactsList.length });
    } catch (error) {
        console.error('Error starting bulk send:', error);
        res.status(500).json({ error: error.message });
    }
});

// Pause/Resume/Cancel Bulk
router.post('/bulk/pause', async (req, res) => {
    try {
        const sessionManager = req.app.get('sessionManager');
        const sessionId = getSessionId(req);
        const client = sessionManager.getSessionClient(sessionId);
        if (client) client.pauseBulk(req.userId);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/bulk/resume', async (req, res) => {
    try {
        const sessionManager = req.app.get('sessionManager');
        const sessionId = getSessionId(req);
        const client = sessionManager.getSessionClient(sessionId);
        if (client) client.resumeBulk(req.userId);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/bulk/cancel', async (req, res) => {
    try {
        const sessionManager = req.app.get('sessionManager');
        const sessionId = getSessionId(req);
        const client = sessionManager.getSessionClient(sessionId);
        if (client) client.cancelBulk(req.userId);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Scheduled messages
router.get('/scheduled', async (req, res) => {
    try {
        const userId = req.userId;
        const messageScheduler = req.app.get('messageScheduler');
        const jobs = messageScheduler.getJobs().filter(job => !job.userId || job.userId === userId);
        res.json({ success: true, jobs });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/scheduled/:jobId', async (req, res) => {
    try {
        const userId = req.userId;
        const { jobId } = req.params;
        const messageScheduler = req.app.get('messageScheduler');
        const cancelled = messageScheduler.cancelJob(jobId, userId);
        if (!cancelled) return res.status(404).json({ error: 'Job no encontrado' });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/scheduled/:jobId', async (req, res) => {
    try {
        const userId = req.userId;
        const { jobId } = req.params;
        const { scheduledAt } = req.body;
        const scheduleTime = new Date(scheduledAt);
        const messageScheduler = req.app.get('messageScheduler');
        const updated = messageScheduler.rescheduleJob(jobId, scheduleTime, userId);
        if (!updated) return res.status(404).json({ error: 'Job no encontrado' });
        res.json({ success: true, scheduledAt: scheduleTime.toISOString() });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
