import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Helper to get session ID
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
    limits: { fileSize: 100 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|mp4|avi|mov|pdf|doc|docx|xls|xlsx|mp3|wav|ogg/;
        if (allowedTypes.test(path.extname(file.originalname).toLowerCase()) && allowedTypes.test(file.mimetype)) {
            return cb(null, true);
        }
        cb(new Error('Invalid file type'));
    }
});

// GET /api/groups - Get all WhatsApp groups
router.get('/', async (req, res) => {
    try {
        const sessionManager = req.app.get('sessionManager');
        const sessionId = getSessionId(req);
        if (!sessionId) return res.json({ success: false, groups: [], error: 'WhatsApp no conectado' });

        try {
            const groups = await sessionManager.getGroups(sessionId);
            return res.json({ success: true, groups });
        } catch (innerError) {
            return res.json({ success: false, groups: [], error: innerError.message });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/groups/:id/members - Get members
router.get('/:id/members', async (req, res) => {
    try {
        const { id } = req.params;
        const sessionManager = req.app.get('sessionManager');
        const sessionId = getSessionId(req);
        if (!sessionId) return res.status(400).json({ error: 'WhatsApp no conectado' });

        const client = sessionManager.getSessionClient(sessionId);
        const members = await client.getGroupMembers(id);
        res.json({ success: true, members });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/groups/send - Send to groups
router.post('/send', upload.array('media', 10), async (req, res) => {
    try {
        let groupIds = req.body.groupIds;
        if (typeof groupIds === 'string') groupIds = JSON.parse(groupIds);
        const { message, caption, captions, scheduledAt } = req.body;

        const sessionManager = req.app.get('sessionManager');
        const messageScheduler = req.app.get('messageScheduler');
        const validationService = req.app.get('validationService');
        const messageCountService = req.app.get('messageCountService');
        const messageLogService = req.app.get('messageLogService');

        const sessionId = getSessionId(req);
        if (!sessionId) return res.status(400).json({ error: 'WhatsApp no conectado' });

        const files = Array.isArray(req.files) ? req.files : [];
        const mediaPaths = files.map(f => f.path);
        let mediaCaptions = Array.isArray(captions) ? captions : (captions ? JSON.parse(captions) : []);
        if (mediaCaptions.length === 0) mediaCaptions = mediaPaths.map(() => caption || '');

        if (scheduledAt) {
            const userId = req.userId;
            const jobId = messageScheduler.scheduleGroupMessages(groupIds, message || '', mediaPaths, mediaCaptions, new Date(scheduledAt), userId);
            return res.json({ success: true, message: 'Group messages scheduled', jobId });
        }

        const userId = req.userId;
        const totalGroups = groupIds.length;
        const io = req.app.get('io');

        // Note: Running in background as before
        (async () => {
            let successCount = 0;
            let failedCount = 0;

            // Obtener información de grupos para validar permisos
            let myGroups = {};
            const client = sessionManager.getSessionClient(sessionId);
            if (client && client.sock) {
                try {
                    myGroups = await client.sock.groupFetchAllParticipating();
                } catch (e) { }
            }

            for (let i = 0; i < groupIds.length; i++) {
                const groupId = groupIds[i];
                try {
                    const groupMetadata = myGroups[groupId];
                    const cleanTarget = formatTarget(groupId, groupMetadata?.subject);

                    // Validación de permisos
                    if (groupMetadata) {
                        const announce = !!groupMetadata.announce;
                        const selfJid = client.sock?.user?.id || client.sock?.user?.jid || '';
                        const selfNumber = selfJid.split('@')[0].split(':')[0];
                        const isAdmin = !!(groupMetadata.participants || []).find(p =>
                            (p.id.split('@')[0].split(':')[0] === selfNumber) && !!p.admin
                        );

                        if (announce && !isAdmin) {
                            throw new Error('Sin permisos (Solo Admins)');
                        }
                    }

                    await sessionManager.sendMessage(sessionId, groupId, message || '', mediaPaths, mediaCaptions);
                    successCount++;
                    if (io) {
                        io.emit('group_progress', { userId, current: i + 1, total: totalGroups, successCount, failedCount, groupId, status: 'sent' });
                        io.emit('message_log', {
                            id: uuidv4(),
                            userId,
                            target: cleanTarget,
                            status: 'sent',
                            timestamp: new Date(),
                            content: message || '[Archivo multimedia]',
                            messageType: 'group'
                        });
                    }
                    await messageCountService.incrementCount(userId, 1);
                    await messageLogService.logMessage(userId, 'group', cleanTarget, 'sent', message || '[Archivo multimedia]', null);
                    if (i < groupIds.length - 1) await new Promise(r => setTimeout(r, 1000));
                } catch (e) {
                    const cleanTarget = formatTarget(groupId, myGroups[groupId]?.subject);
                    failedCount++;
                    if (io) {
                        io.emit('group_progress', { userId, current: i + 1, total: totalGroups, successCount, failedCount, groupId, status: 'failed', error: e.message });
                        io.emit('message_log', {
                            id: uuidv4(),
                            userId,
                            target: cleanTarget,
                            status: 'failed',
                            timestamp: new Date(),
                            content: message || '[Archivo multimedia]',
                            messageType: 'group'
                        });
                    }
                    await messageLogService.logMessage(userId, 'group', cleanTarget, 'failed', message || '[Archivo multimedia]', null);
                }
            }

            if (mediaPaths.length > 0) {
                setTimeout(() => {
                    for (const p of mediaPaths) if (fs.existsSync(p)) fs.unlinkSync(p);
                }, 5000);
            }
        })();

        res.json({ success: true, message: 'Enviando a grupos...' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Group lists logic (remains mostly same as it is DB/File based, not session based)
const getListsPath = () => path.join(__dirname, '../data/groupLists.json');
const loadGroupLists = () => {
    try {
        const p = getListsPath();
        if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) { }
    return [];
};
const saveGroupLists = (lists) => {
    try {
        const p = getListsPath();
        if (!fs.existsSync(path.dirname(p))) fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, JSON.stringify(lists, null, 2));
    } catch (e) { }
};

router.get('/lists', (req, res) => res.json({ success: true, lists: loadGroupLists() }));
router.post('/lists', (req, res) => {
    const { name, groupIds } = req.body;
    const lists = loadGroupLists();
    const newList = { id: Date.now().toString(), name, groupIds, createdAt: new Date() };
    lists.push(newList);
    saveGroupLists(lists);
    res.json({ success: true, list: newList });
});
router.delete('/lists/:id', (req, res) => {
    let lists = loadGroupLists();
    lists = lists.filter(l => l.id !== req.params.id);
    saveGroupLists(lists);
    res.json({ success: true });
});

router.post('/schedule', upload.array('media', 10), async (req, res) => {
    try {
        let groupIds = req.body.groupIds;
        if (typeof groupIds === 'string') groupIds = JSON.parse(groupIds);
        const { message, caption, captions, scheduleType, delayMinutes, scheduledAt } = req.body;
        const messageScheduler = req.app.get('messageScheduler');
        const files = Array.isArray(req.files) ? req.files : [];
        const mediaPaths = files.map(f => f.path);
        let mediaCaptions = Array.isArray(captions) ? captions : (captions ? JSON.parse(captions) : []);
        if (mediaCaptions.length === 0) mediaCaptions = mediaPaths.map(() => caption || '');

        let scheduleTime;
        if (scheduleType === 'delay') {
            scheduleTime = new Date(Date.now() + (delayMinutes || 0) * 60 * 1000);
        } else {
            scheduleTime = new Date(scheduledAt);
        }

        const jobId = messageScheduler.scheduleGroupMessages(groupIds, message || '', mediaPaths, mediaCaptions, scheduleTime, req.userId);
        res.json({ success: true, jobId, scheduledAt: scheduleTime.toISOString() });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Group selections
router.get('/selections', async (req, res) => {
    const service = req.app.get('groupSelectionService');
    const selections = await service.getByUserId(req.userId);
    res.json({ success: true, selections });
});
router.post('/selections', async (req, res) => {
    const { name, description, groupIds } = req.body;
    const service = req.app.get('groupSelectionService');
    const selection = await service.create(req.userId, name, description, groupIds);
    res.json({ success: true, selection });
});
router.put('/selections/:id', async (req, res) => {
    const service = req.app.get('groupSelectionService');
    const selection = await service.update(req.params.id, req.userId, req.body);
    res.json({ success: true, selection });
});
router.delete('/selections/:id', async (req, res) => {
    const service = req.app.get('groupSelectionService');
    await service.delete(req.params.id, req.userId);
    res.json({ success: true });
});

export default router;
