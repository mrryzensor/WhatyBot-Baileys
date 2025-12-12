import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

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
            messageType: log.message_type || 'single' // Include message type to identify auto-replies
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
        const uploadDir = process.env.UPLOAD_DIR || './uploads';
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
        // Accept images, videos, documents, audio
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
        const whatsappClient = req.app.get('whatsappClient');
        const messageScheduler = req.app.get('messageScheduler');
        const userService = req.app.get('userService');
        const validationService = req.app.get('validationService');
        const messageCountService = req.app.get('messageCountService');
        const messageLogService = req.app.get('messageLogService');

        if (!to) {
            return res.status(400).json({ error: 'Missing required field: to' });
        }

        if (!message && !req.body.mediaPath) {
            return res.status(400).json({ error: 'Missing required field: message or media' });
        }

        // Validate user can send messages (only for immediate sends, not scheduled)
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
                    subscriptionExpired: validation.subscriptionExpired || false,
                    currentCount: validation.currentCount,
                    limit: validation.limit,
                    subscriptionType: validation.subscriptionType
                });
            }
        }

        if (scheduledAt) {
            const scheduleTime = new Date(scheduledAt);
            if (isNaN(scheduleTime.getTime())) {
                return res.status(400).json({ 
                    error: `Invalid scheduledAt date format: "${scheduledAt}". Expected ISO 8601 format.` 
                });
            }
            
            // Validate: must be at least 30 seconds in the future
            const now = new Date();
            const diffFromNow = scheduleTime.getTime() - now.getTime();
            const diffSeconds = Math.round(diffFromNow / 1000);
            
            if (diffSeconds < 30) {
                if (diffSeconds < 0) {
                    return res.status(400).json({ 
                        error: `La fecha y hora programada está en el pasado. Por favor selecciona una fecha y hora futura.` 
                    });
                } else {
                    return res.status(400).json({ 
                        error: `La fecha y hora programada debe ser al menos 30 segundos en el futuro. Faltan ${diffSeconds} segundos.` 
                    });
                }
            }
            
            const userId = req.userId;
            if (!userId) {
                return res.status(401).json({ error: 'Usuario no autenticado' });
            }
            const jobId = messageScheduler.scheduleMessage(to, message || '', null, '', scheduleTime, userId);
            if (!jobId) {
                return res.status(500).json({ error: 'Failed to create scheduled job' });
            }
            return res.json({ 
                success: true, 
                message: 'Message scheduled', 
                jobId,
                scheduledAt: scheduleTime.toISOString()
            });
        }

        const result = await whatsappClient.sendMessage(to, message || '');
        
        // Increment message count and log message (only for immediate sends, not scheduled)
        if (!scheduledAt) {
            const userId = req.userId;
            if (!userId) {
                return res.status(401).json({ error: 'Usuario no autenticado' });
            }
            await messageCountService.incrementCount(userId, 1);
            console.log(`Incremented message count for user ${userId}: +1 message`);
            
            // Log message to database
            await messageLogService.logMessage(
                userId,
                'single',
                to,
                'sent',
                message || '',
                null
            );
        }
        
        res.json({ success: true, result });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/messages/send-media - Send message with one or multiple media files
router.post('/send-media', upload.array('media', 10), async (req, res) => {
    try {
        const { to, message, caption, captions, scheduledAt } = req.body;
        const whatsappClient = req.app.get('whatsappClient');
        const messageScheduler = req.app.get('messageScheduler');
        const userService = req.app.get('userService');
        const validationService = req.app.get('validationService');
        const messageCountService = req.app.get('messageCountService');
        const messageLogService = req.app.get('messageLogService');

        if (!to) {
            return res.status(400).json({ error: 'Missing required field: to' });
        }

        const files = Array.isArray(req.files) ? req.files : [];

        if (!files || files.length === 0) {
            return res.status(400).json({ error: 'No media file uploaded' });
        }

        // Validate user can send messages (only for immediate sends, not scheduled)
        if (!scheduledAt) {
            const userId = req.userId;
            if (!userId) {
                // Clean up uploaded files
                for (const f of files) {
                    if (f && f.path && fs.existsSync(f.path)) {
                        fs.unlinkSync(f.path);
                    }
                }
                return res.status(401).json({ error: 'Usuario no autenticado' });
            }
            const validation = await validationService.canSendMessages(userId, 1);
            if (!validation.allowed) {
                // Clean up uploaded files
                for (const f of files) {
                    if (f && f.path && fs.existsSync(f.path)) {
                        fs.unlinkSync(f.path);
                    }
                }
                return res.status(403).json({ 
                    error: validation.reason,
                    limitExceeded: validation.limitExceeded || false,
                    subscriptionExpired: validation.subscriptionExpired || false,
                    currentCount: validation.currentCount,
                    limit: validation.limit,
                    subscriptionType: validation.subscriptionType
                });
            }
        }

        const mediaPaths = files.map(f => f.path);

        // Captions: si viene captions (JSON de array) lo usamos, si no, repetimos caption simple
        let mediaCaptions = [];
        if (captions) {
            try {
                const parsed = JSON.parse(captions);
                if (Array.isArray(parsed)) {
                    mediaCaptions = parsed.map(c => (typeof c === 'string' ? c : ''));
                }
            } catch (e) {
                // fallback a caption simple más abajo
            }
        }

        if (mediaCaptions.length === 0) {
            const baseCaption = caption || '';
            mediaCaptions = mediaPaths.map(() => baseCaption);
        }

        // caption(s) goes with the media, message is sent separately
        const textMessage = message || '';

        if (scheduledAt) {
            const scheduleTime = new Date(scheduledAt);
            if (isNaN(scheduleTime.getTime())) {
                return res.status(400).json({ 
                    error: `Invalid scheduledAt date format: "${scheduledAt}". Expected ISO 8601 format.` 
                });
            }
            
            // Validate: must be at least 30 seconds in the future
            const now = new Date();
            const diffFromNow = scheduleTime.getTime() - now.getTime();
            const diffSeconds = Math.round(diffFromNow / 1000);
            
            if (diffSeconds < 30) {
                if (diffSeconds < 0) {
                    return res.status(400).json({ 
                        error: `La fecha y hora programada está en el pasado. Por favor selecciona una fecha y hora futura.` 
                    });
                } else {
                    return res.status(400).json({ 
                        error: `La fecha y hora programada debe ser al menos 30 segundos en el futuro. Faltan ${diffSeconds} segundos.` 
                    });
                }
            }
            
            const userId = req.userId;
            if (!userId) {
                // Clean up uploaded files
                for (const f of files) {
                    if (f && f.path && fs.existsSync(f.path)) {
                        fs.unlinkSync(f.path);
                    }
                }
                return res.status(401).json({ error: 'Usuario no autenticado' });
            }
            const jobId = messageScheduler.scheduleMessage(to, textMessage, mediaPaths, mediaCaptions, scheduleTime, userId);
            if (!jobId) {
                return res.status(500).json({ error: 'Failed to create scheduled job' });
            }
            return res.json({ 
                success: true, 
                message: 'Media message scheduled', 
                jobId,
                scheduledAt: scheduleTime.toISOString()
            });
        }

        const result = await whatsappClient.sendMessage(to, textMessage, mediaPaths, mediaCaptions);

        // Increment message count and log message (only for immediate sends, not scheduled)
        if (!scheduledAt) {
            const userId = req.userId;
            if (!userId) {
                // Clean up uploaded files
                for (const f of files) {
                    if (f && f.path && fs.existsSync(f.path)) {
                        fs.unlinkSync(f.path);
                    }
                }
                return res.status(401).json({ error: 'Usuario no autenticado' });
            }
            await messageCountService.incrementCount(userId, 1);
            console.log(`Incremented message count for user ${userId}: +1 message`);
            
            // Log message to database
            await messageLogService.logMessage(
                userId,
                'media',
                to,
                'sent',
                message || '[Archivo multimedia]',
                null
            );
        }

        // Clean up uploaded files after sending (only if not scheduled, scheduler handles cleanup logic if needed, 
        // but for now we keep files for scheduled job. Ideally we should clean up after job execution)
        setTimeout(() => {
            if (!scheduledAt) {
                for (const p of mediaPaths) {
                    if (p && fs.existsSync(p)) {
                        fs.unlinkSync(p);
                    }
                }
            }
        }, 5000);

        res.json({ success: true, result });
    } catch (error) {
        console.error('Error sending media:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/messages/send-bulk - Send bulk messages (one message per contact, each con uno o varios adjuntos)
router.post('/send-bulk', upload.array('media', 10), async (req, res) => {
    try {
        const { contacts, message, caption, captions, delay, scheduledAt } = req.body;
        const whatsappClient = req.app.get('whatsappClient');
        const messageScheduler = req.app.get('messageScheduler');
        const validationService = req.app.get('validationService');
        const messageCountService = req.app.get('messageCountService');
        const messageLogService = req.app.get('messageLogService');

        if (!contacts) {
            return res.status(400).json({ error: 'Missing required field: contacts' });
        }

        const files = Array.isArray(req.files) ? req.files : [];

        if (!message && (!files || files.length === 0)) {
            return res.status(400).json({ error: 'Missing required field: message or media' });
        }

        let contactsList;
        try {
            contactsList = typeof contacts === 'string' ? JSON.parse(contacts) : contacts;
        } catch (error) {
            return res.status(400).json({ error: 'Invalid contacts format' });
        }

        // Validate user can send messages (only for immediate sends, not scheduled)
        if (!scheduledAt) {
            const userId = req.userId;
            if (!userId) {
                // Clean up uploaded files if exists
                for (const f of files) {
                    if (f && f.path && fs.existsSync(f.path)) {
                        fs.unlinkSync(f.path);
                    }
                }
                return res.status(401).json({ error: 'Usuario no autenticado' });
            }
            const validation = await validationService.canSendMessages(userId, contactsList.length);
            if (!validation.allowed) {
                // Clean up uploaded files if exists
                for (const f of files) {
                    if (f && f.path && fs.existsSync(f.path)) {
                        fs.unlinkSync(f.path);
                    }
                }
                return res.status(403).json({ 
                    error: validation.reason,
                    limitExceeded: validation.limitExceeded || false,
                    subscriptionExpired: validation.subscriptionExpired || false,
                    currentCount: validation.currentCount,
                    limit: validation.limit,
                    subscriptionType: validation.subscriptionType
                });
            }
        }

        const mediaPath = files && files.length > 0 ? files[0].path : null; // compatibilidad para código que aún espera string

        // Para múltiples adjuntos, construimos arrays
        const mediaPaths = files && files.length > 0 ? files.map(f => f.path) : (mediaPath ? [mediaPath] : []);

        // caption(s) va con el/los media, message se envía por separado
        let mediaCaptions = [];
        if (captions) {
            try {
                const parsed = JSON.parse(captions);
                if (Array.isArray(parsed)) {
                    mediaCaptions = parsed.map(c => (typeof c === 'string' ? c : ''));
                }
            } catch (e) {
                // fallback a caption simple más abajo
            }
        }

        if (mediaCaptions.length === 0) {
            const baseCaption = caption || '';
            mediaCaptions = mediaPaths.map(() => baseCaption);
        }
        const textMessage = message || '';
        const messageDelay = parseInt(delay) || whatsappClient.config.messageDelay || 2; // seconds
        const maxContactsPerBatch = whatsappClient.config.maxContactsPerBatch || 50;
        const waitTimeBetweenBatches = whatsappClient.config.waitTimeBetweenBatches || 15; // minutes

        if (scheduledAt) {
            const scheduleTime = new Date(scheduledAt);
            if (isNaN(scheduleTime.getTime())) {
                return res.status(400).json({ 
                    error: `Invalid scheduledAt date format: "${scheduledAt}". Expected ISO 8601 format.` 
                });
            }
            
            // Validate: must be at least 30 seconds in the future
            const now = new Date();
            const diffFromNow = scheduleTime.getTime() - now.getTime();
            const diffSeconds = Math.round(diffFromNow / 1000);
            
            if (diffSeconds < 30) {
                if (diffSeconds < 0) {
                    return res.status(400).json({ 
                        error: `La fecha y hora programada está en el pasado. Por favor selecciona una fecha y hora futura.` 
                    });
                } else {
                    return res.status(400).json({ 
                        error: `La fecha y hora programada debe ser al menos 30 segundos en el futuro. Faltan ${diffSeconds} segundos.` 
                    });
                }
            }
            
            const userId = req.userId;
            if (!userId) {
                // Clean up uploaded files if exists
                for (const f of files) {
                    if (f && f.path && fs.existsSync(f.path)) {
                        fs.unlinkSync(f.path);
                    }
                }
                return res.status(401).json({ error: 'Usuario no autenticado' });
            }
            const jobId = messageScheduler.scheduleBulkMessages(contactsList, textMessage, mediaPaths, mediaCaptions, messageDelay, scheduleTime, userId, maxContactsPerBatch, waitTimeBetweenBatches);
            return res.json({ 
                success: true, 
                message: 'Bulk messages scheduled', 
                jobId,
                scheduledAt: scheduleTime.toISOString(),
                contacts: contactsList,
                message: textMessage,
                hasMedia: !!mediaPath,
                caption: mediaCaption
            });
        }

        // Send bulk messages (this will run in background)
        const userId = req.userId;
        if (!userId) {
            // Clean up uploaded files if exists
            for (const f of files) {
                if (f && f.path && fs.existsSync(f.path)) {
                    fs.unlinkSync(f.path);
                }
            }
            return res.status(401).json({ error: 'Usuario no autenticado' });
        }
        const sentCount = contactsList.filter(c => c.phone).length;
        
        // Store references for use in promise callbacks
        const countService = messageCountService;
        
        whatsappClient.sendBulkMessages(contactsList, textMessage, mediaPaths, mediaCaptions, messageDelay, userId, maxContactsPerBatch, waitTimeBetweenBatches)
            .then(async (results) => {
                console.log('Bulk send completed:', results.length, 'messages');
                
                // Increment message count for successful sends
                const successCount = results.filter(r => r.status === 'sent').length;
                if (successCount > 0) {
                    await countService.incrementCount(userId, successCount);
                    console.log(`Incremented message count for user ${userId}: +${successCount} messages`);
                    
                    // Log each successful message to database
                    const logService = req.app.get('messageLogService');
                    for (const result of results) {
                        if (result.status === 'sent') {
                            await logService.logMessage(
                                userId,
                                'bulk',
                                result.contact,
                                'sent',
                                textMessage || '[Archivo multimedia]',
                                null
                            );
                        }
                    }
                }

                // Clean up media files after all sends
                if (mediaPaths && mediaPaths.length > 0) {
                    for (const p of mediaPaths) {
                        if (p && fs.existsSync(p)) {
                            fs.unlinkSync(p);
                        }
                    }
                }
            })
            .catch(error => {
                console.error('Error in bulk send:', error);
            });

        // Return immediately
        res.json({
            success: true,
            message: 'Bulk send started',
            total: contactsList.length
        });
    } catch (error) {
        console.error('Error starting bulk send:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/messages/bulk/pause - Pause bulk sending for current user
router.post('/bulk/pause', async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Usuario no autenticado' });
        }
        const whatsappClient = req.app.get('whatsappClient');
        whatsappClient.pauseBulk(userId);
        return res.json({ success: true });
    } catch (error) {
        console.error('Error pausing bulk send:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/messages/bulk/resume - Resume bulk sending for current user
router.post('/bulk/resume', async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Usuario no autenticado' });
        }
        const whatsappClient = req.app.get('whatsappClient');
        whatsappClient.resumeBulk(userId);
        return res.json({ success: true });
    } catch (error) {
        console.error('Error resuming bulk send:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/messages/bulk/cancel - Cancel bulk sending for current user
router.post('/bulk/cancel', async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Usuario no autenticado' });
        }
        const whatsappClient = req.app.get('whatsappClient');
        whatsappClient.cancelBulk(userId);
        return res.json({ success: true });
    } catch (error) {
        console.error('Error cancelling bulk send:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/messages/scheduled - Get scheduled jobs for current user
router.get('/scheduled', async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Usuario no autenticado' });
        }
        const messageScheduler = req.app.get('messageScheduler');
        const jobs = messageScheduler.getJobs().filter(job => !job.userId || job.userId === userId);
        return res.json({ success: true, jobs });
    } catch (error) {
        console.error('Error getting scheduled jobs:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/messages/scheduled/:jobId - Cancel a scheduled job for current user
router.delete('/scheduled/:jobId', async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Usuario no autenticado' });
        }
        const { jobId } = req.params;
        const messageScheduler = req.app.get('messageScheduler');
        const cancelled = messageScheduler.cancelJob(jobId, userId);
        if (!cancelled) {
            return res.status(404).json({ error: 'Job no encontrado o no autorizado' });
        }
        return res.json({ success: true });
    } catch (error) {
        console.error('Error cancelling scheduled job:', error);
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/messages/scheduled/:jobId - Reschedule a job for current user
router.put('/scheduled/:jobId', async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Usuario no autenticado' });
        }
        const { jobId } = req.params;
        const { scheduledAt } = req.body;
        if (!scheduledAt) {
            return res.status(400).json({ error: 'Missing required field: scheduledAt' });
        }
        const scheduleTime = new Date(scheduledAt);
        if (isNaN(scheduleTime.getTime())) {
            return res.status(400).json({ 
                error: `Invalid scheduledAt date format: "${scheduledAt}". Expected ISO 8601 format.` 
            });
        }

        const now = new Date();
        const diffFromNow = scheduleTime.getTime() - now.getTime();
        const diffSeconds = Math.round(diffFromNow / 1000);
        if (diffSeconds < 30) {
            if (diffSeconds < 0) {
                return res.status(400).json({ 
                    error: 'La nueva fecha y hora programada está en el pasado. Por favor selecciona una fecha y hora futura.' 
                });
            } else {
                return res.status(400).json({ 
                    error: `La nueva fecha y hora programada debe ser al menos 30 segundos en el futuro. Faltan ${diffSeconds} segundos.` 
                });
            }
        }

        const messageScheduler = req.app.get('messageScheduler');
        const updated = messageScheduler.rescheduleJob(jobId, scheduleTime, userId);
        if (!updated) {
            return res.status(404).json({ error: 'Job no encontrado o no autorizado' });
        }
        return res.json({ success: true, scheduledAt: scheduleTime.toISOString() });
    } catch (error) {
        console.error('Error rescheduling job:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
