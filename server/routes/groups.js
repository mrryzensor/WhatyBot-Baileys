import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

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
        fileSize: 100 * 1024 * 1024 // 100MB limit
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

// GET /api/groups - Get all WhatsApp groups
router.get('/', async (req, res) => {
    try {
        const whatsappClient = req.app.get('whatsappClient');
        if (!whatsappClient || typeof whatsappClient.getGroups !== 'function') {
            return res.status(503).json({ success: false, groups: [], error: 'WhatsApp client no disponible' });
        }

        try {
            const groups = await whatsappClient.getGroups();
            return res.json({ success: true, groups });
        } catch (innerError) {
            const message = innerError?.message || 'Error getting groups';
            if (typeof message === 'string' && message.toLowerCase().includes('no está listo')) {
                return res.json({ success: false, groups: [], error: message });
            }
            throw innerError;
        }
    } catch (error) {
        console.error('Error getting groups:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/groups/:id/members - Get members of a specific group
router.get('/:id/members', async (req, res) => {
    try {
        const { id } = req.params;
        const whatsappClient = req.app.get('whatsappClient');
        const members = await whatsappClient.getGroupMembers(id);
        res.json({ success: true, members });
    } catch (error) {
        console.error('Error getting group members:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/groups/send - Send message to groups (with optional single or multiple media files)
router.post('/send', upload.array('media', 10), async (req, res) => {
    try {
        // Parse groupIds from JSON string if needed (when sent as FormData)
        let groupIds = req.body.groupIds;
        if (typeof groupIds === 'string') {
            try {
                groupIds = JSON.parse(groupIds);
            } catch (e) {
                return res.status(400).json({ error: 'Invalid groupIds format. Must be JSON array' });
            }
        }
        
        const { message, caption, captions, scheduledAt } = req.body;
        const whatsappClient = req.app.get('whatsappClient');
        const messageScheduler = req.app.get('messageScheduler');
        const userService = req.app.get('userService');
        const validationService = req.app.get('validationService');
        const messageCountService = req.app.get('messageCountService');
        const messageLogService = req.app.get('messageLogService');

        if (!groupIds || !Array.isArray(groupIds) || groupIds.length === 0) {
            return res.status(400).json({ error: 'Missing or invalid groupIds array' });
        }

        // Extract message and media info first
        const files = Array.isArray(req.files) ? req.files : [];
        const mediaPaths = files && files.length > 0 ? files.map(f => f.path) : [];

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

        const textMessage = message || '';

        // Allow empty message if there's media, or media if there's message, or both
        if (!textMessage && mediaPaths.length === 0) {
            // Clean up uploaded file if exists
            for (const f of files) {
                if (f && f.path && fs.existsSync(f.path)) {
                    fs.unlinkSync(f.path);
                }
            }
            return res.status(400).json({ error: 'Missing message or media' });
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
            const validation = await validationService.canSendMessages(userId, groupIds.length);
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

        if (scheduledAt) {
            const userId = req.userId;
            if (!userId) {
                // Clean up uploaded file if exists
                if (req.file && req.file.path && fs.existsSync(req.file.path)) {
                    fs.unlinkSync(req.file.path);
                }
                return res.status(401).json({ error: 'Usuario no autenticado' });
            }
            const jobId = messageScheduler.scheduleGroupMessages(groupIds, textMessage, mediaPaths, mediaCaptions, new Date(scheduledAt), userId);
            return res.json({ success: true, message: 'Group messages scheduled', jobId });
        }

        // Send messages to groups in background
        const results = [];
        const userId = req.userId;
        if (!userId) {
            // Clean up uploaded file if exists
            if (req.file && req.file.path && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            return res.status(401).json({ error: 'Usuario no autenticado' });
        }

        // Get group names for better logging
        let groupNamesMap = {};
        try {
            const allGroups = await whatsappClient.getGroups();
            allGroups.forEach(group => {
                groupNamesMap[group.id] = group.name;
            });
        } catch (e) {
            console.warn('Could not fetch group names:', e.message);
        }

        const io = req.app.get('io');
        const totalGroups = groupIds.length;

        for (let i = 0; i < groupIds.length; i++) {
            const groupId = groupIds[i];
            try {
                await whatsappClient.sendMessage(groupId, textMessage, mediaPaths, mediaCaptions);
                results.push({ groupId, status: 'sent' });
                console.log(`Message sent to group: ${groupId}`);
                
                // Emit progress event
                if (io) {
                    io.emit('group_progress', {
                        userId: userId,
                        current: i + 1,
                        total: totalGroups,
                        groupId: groupId,
                        groupName: groupNamesMap[groupId] || groupId,
                        status: 'sent'
                    });
                }
                
                // Increment message count for each group
                await messageCountService.incrementCount(userId, 1);
                console.log(`Incremented message count for user ${userId}: +1 message (group)`);
                
                // Log message to database
                await messageLogService.logMessage(
                    userId,
                    'group',
                    groupId,
                    'sent',
                    textMessage || '[Archivo multimedia]',
                    null
                );

                // Small delay between group messages
                if (i < groupIds.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                }
            } catch (error) {
                console.error(`Error sending to group ${groupId}:`, error);
                results.push({ groupId, status: 'failed', error: error.message });
                
                // Emit progress event for failed
                if (io) {
                    io.emit('group_progress', {
                        userId: userId,
                        current: i + 1,
                        total: totalGroups,
                        groupId: groupId,
                        groupName: groupNamesMap[groupId] || groupId,
                        status: 'failed'
                    });
                }
            }
        }

        // Clean up media files after sending
        if (mediaPaths && mediaPaths.length > 0) {
            setTimeout(() => {
                for (const p of mediaPaths) {
                    if (p && fs.existsSync(p)) {
                        fs.unlinkSync(p);
                    }
                }
            }, 5000);
        }

        res.json({
            success: true,
            message: 'Messages sent to groups',
            results
        });
    } catch (error) {
        console.error('Error sending to groups:', error);
        res.status(500).json({ error: error.message });
    }
});

// Load group lists
const loadGroupLists = () => {
    try {
        const listsPath = path.join(__dirname, '../data/groupLists.json');
        if (fs.existsSync(listsPath)) {
            return JSON.parse(fs.readFileSync(listsPath, 'utf8'));
        }
    } catch (error) {
        console.error('Error loading group lists:', error);
    }
    return [];
};

// Save group lists
const saveGroupLists = (lists) => {
    try {
        const dataDir = path.join(__dirname, '../data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        const listsPath = path.join(dataDir, 'groupLists.json');
        fs.writeFileSync(listsPath, JSON.stringify(lists, null, 2));
    } catch (error) {
        console.error('Error saving group lists:', error);
    }
};

// GET /api/groups/lists - Get saved group lists
router.get('/lists', (req, res) => {
    const lists = loadGroupLists();
    res.json({ success: true, lists });
});

// POST /api/groups/lists - Save a new group list
router.post('/lists', (req, res) => {
    try {
        const { name, groupIds } = req.body;
        if (!name || !groupIds || !Array.isArray(groupIds)) {
            return res.status(400).json({ error: 'Missing name or groupIds' });
        }

        const lists = loadGroupLists();
        const newList = {
            id: Date.now().toString(),
            name,
            groupIds,
            createdAt: new Date()
        };

        lists.push(newList);
        saveGroupLists(lists);

        res.json({ success: true, list: newList });
    } catch (error) {
        console.error('Error saving group list:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/groups/lists/:id - Delete a group list
router.delete('/lists/:id', (req, res) => {
    try {
        const { id } = req.params;
        let lists = loadGroupLists();
        lists = lists.filter(list => list.id !== id);
        saveGroupLists(lists);
        res.json({ success: true, message: 'List deleted' });
    } catch (error) {
        console.error('Error deleting group list:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/groups/schedule - Schedule message to groups (with optional single or multiple media)
router.post('/schedule', upload.array('media', 10), async (req, res) => {
    try {
        // Parse groupIds from JSON string if needed
        let groupIds = req.body.groupIds;
        if (typeof groupIds === 'string') {
            try {
                groupIds = JSON.parse(groupIds);
            } catch (e) {
                return res.status(400).json({ error: 'Invalid groupIds format. Must be JSON array' });
            }
        }

        const { message, caption, captions, scheduleType, delayMinutes, scheduledAt } = req.body;
        const messageScheduler = req.app.get('messageScheduler');
        const userService = req.app.get('userService');
        const validationService = req.app.get('validationService');

        const files = Array.isArray(req.files) ? req.files : [];
        const mediaPaths = files && files.length > 0 ? files.map(f => f.path) : [];

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

        console.log('Schedule request received:', { 
            groupIds: Array.isArray(groupIds) ? groupIds.length : 'invalid', 
            messageLength: textMessage?.length, 
            hasMedia: mediaPaths && mediaPaths.length > 0,
            scheduleType, 
            delayMinutes: delayMinutes ? Number(delayMinutes) : undefined, 
            scheduledAt,
            scheduledAtType: typeof scheduledAt
        });

        if (!groupIds || !Array.isArray(groupIds) || groupIds.length === 0) {
            return res.status(400).json({ error: 'Missing or invalid groupIds array' });
        }

        if (!textMessage && mediaPaths.length === 0) {
            return res.status(400).json({ error: 'Missing message or media' });
        }

        // Map frontend scheduleType to backend format
        // Frontend uses: 'now', 'delay', 'datetime'
        // Backend expects: 'delay', 'scheduled'
        let actualScheduleType = scheduleType;
        if (scheduleType === 'datetime') {
            actualScheduleType = 'scheduled';
        }

        if (!actualScheduleType || !['delay', 'scheduled'].includes(actualScheduleType)) {
            return res.status(400).json({ 
                error: `Invalid scheduleType: "${scheduleType}". Must be "delay" or "datetime"` 
            });
        }

        let scheduleTime;

        if (actualScheduleType === 'delay') {
            const delay = delayMinutes ? Number(delayMinutes) : null;
            if (!delay || delay <= 0 || isNaN(delay)) {
                return res.status(400).json({ error: 'Invalid delayMinutes for delay schedule. Must be a number greater than 0' });
            }
            scheduleTime = new Date(Date.now() + delay * 60 * 1000);
            console.log(`Scheduling with delay: ${delay} minutes, scheduled for: ${scheduleTime.toISOString()}`);
        } else if (actualScheduleType === 'scheduled') {
            if (!scheduledAt) {
                return res.status(400).json({ error: 'Missing scheduledAt for datetime schedule' });
            }
            
            // Handle both string and Date formats
            scheduleTime = new Date(scheduledAt);
            if (isNaN(scheduleTime.getTime())) {
                return res.status(400).json({ 
                    error: `Invalid scheduledAt date format: "${scheduledAt}". Expected ISO 8601 format.` 
                });
            }
            
            const now = new Date();
            // Allow at least 30 seconds in the future to account for processing time
            // This gives flexibility while still ensuring the message is scheduled for the future
            const minTime = new Date(now.getTime() + 30 * 1000);
            
            // Calculate difference from current time (not minTime) for better error messages
            const diffFromNow = scheduleTime.getTime() - now.getTime();
            const diffSeconds = Math.round(diffFromNow / 1000);
            const diffMinutes = Math.round(diffSeconds / 60);
            
            // Log timezone information for debugging
            console.log(`Date validation:`, {
                receivedUTC: scheduleTime.toISOString(),
                receivedLocal: scheduleTime.toLocaleString('es-ES', { timeZone: 'America/Lima' }),
                nowUTC: now.toISOString(),
                nowLocal: now.toLocaleString('es-ES', { timeZone: 'America/Lima' }),
                minTimeUTC: minTime.toISOString(),
                diffFromNowSeconds: diffSeconds,
                diffFromNowMinutes: diffMinutes,
                isValid: diffSeconds >= 30
            });
            
            // Validate: must be at least 30 seconds in the future
            if (diffSeconds < 30) {
                if (diffSeconds < -60) {
                    // More than 1 minute in the past
                    return res.status(400).json({ 
                        error: `La fecha y hora programada está en el pasado (${Math.abs(diffMinutes)} minutos atrás). Por favor selecciona una fecha y hora futura.` 
                    });
                } else if (diffSeconds < 0) {
                    return res.status(400).json({ 
                        error: `La fecha y hora programada está en el pasado. Por favor selecciona una fecha y hora futura.` 
                    });
                } else {
                    return res.status(400).json({ 
                        error: `La fecha y hora programada debe ser al menos 30 segundos en el futuro. Faltan ${diffSeconds} segundos. Por favor selecciona una hora más adelante.` 
                    });
                }
            }
            console.log(`✅ Scheduling for datetime: ${scheduleTime.toISOString()}, Current time: ${now.toISOString()}`);
        }

            const userId = req.userId;
            if (!userId) {
                // Clean up uploaded file if exists
                for (const f of files) {
                    if (f && f.path && fs.existsSync(f.path)) {
                        fs.unlinkSync(f.path);
                    }
                }
                return res.status(401).json({ error: 'Usuario no autenticado' });
            }
            const jobId = messageScheduler.scheduleGroupMessages(groupIds, textMessage, mediaPaths, mediaCaptions, scheduleTime, userId);

        if (!jobId) {
            return res.status(500).json({ error: 'Failed to create scheduled job' });
        }

        res.json({ 
            success: true, 
            message: 'Group messages scheduled successfully',
            jobId,
            scheduledAt: scheduleTime.toISOString(),
            groupIds: groupIds,
            message: textMessage,
            hasMedia: mediaPaths && mediaPaths.length > 0,
            caption: caption || ''
        });
    } catch (error) {
        console.error('Error scheduling group messages:', error);
        res.status(500).json({ error: error.message });
    }
});

// Group Selections endpoints (user-specific saved group selections)
// GET /api/groups/selections - Get all selections for current user
router.get('/selections', async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Usuario no autenticado' });
        }

        const groupSelectionService = req.app.get('groupSelectionService');
        const selections = await groupSelectionService.getByUserId(userId);
        res.json({ success: true, selections });
    } catch (error) {
        console.error('Error getting group selections:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/groups/selections - Create a new selection
router.post('/selections', async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Usuario no autenticado' });
        }

        const { name, description, groupIds } = req.body;
        if (!name || !groupIds || !Array.isArray(groupIds)) {
            return res.status(400).json({ error: 'Missing name or groupIds array' });
        }

        const groupSelectionService = req.app.get('groupSelectionService');
        const selection = await groupSelectionService.create(userId, name, description, groupIds);
        res.json({ success: true, selection });
    } catch (error) {
        console.error('Error creating group selection:', error);
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/groups/selections/:id - Update a selection
router.put('/selections/:id', async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Usuario no autenticado' });
        }

        const { id } = req.params;
        const { name, description, groupIds } = req.body;

        const groupSelectionService = req.app.get('groupSelectionService');
        const selection = await groupSelectionService.update(id, userId, { name, description, groupIds });
        
        if (!selection) {
            return res.status(404).json({ error: 'Selección no encontrada o no pertenece al usuario' });
        }

        res.json({ success: true, selection });
    } catch (error) {
        console.error('Error updating group selection:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/groups/selections/:id - Delete a selection
router.delete('/selections/:id', async (req, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Usuario no autenticado' });
        }

        const { id } = req.params;
        const groupSelectionService = req.app.get('groupSelectionService');
        const result = await groupSelectionService.delete(id, userId);
        
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Selección no encontrada o no pertenece al usuario' });
        }

        res.json({ success: true, message: 'Selección eliminada exitosamente' });
    } catch (error) {
        console.error('Error deleting group selection:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
