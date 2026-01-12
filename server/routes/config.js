import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import archiver from 'archiver';
import unzipper from 'unzipper';
import { fileURLToPath } from 'url';
import { cleanSessionOrphanedFiles, cleanAllSessionsOrphanedFiles } from '../utils/mediaCleanup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Helper to get session ID
const getSessionId = (req) => {
    const sessionManager = req.app.get('sessionManager');
    return req.sessionId || sessionManager.getFirstActiveSession(req.userId);
};

// GET /api/status - Get connection status
router.get('/status', (req, res) => {
    try {
        const sessionManager = req.app.get('sessionManager');
        const sessionId = getSessionId(req);
        if (!sessionId) {
            return res.json({ success: true, status: 'no_session', isReady: false });
        }

        const client = sessionManager.getSessionClient(sessionId);
        if (!client) {
            return res.json({ success: true, status: 'not_found', isReady: false });
        }

        const status = client.getStatus();
        res.json({ success: true, ...status });
    } catch (error) {
        console.error('Error getting status:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/qr - Get current QR data URL
router.get('/qr', (req, res) => {
    try {
        const sessionManager = req.app.get('sessionManager');
        const sessionId = getSessionId(req);
        if (!sessionId) return res.status(404).json({ success: false, error: 'No session' });

        const client = sessionManager.getSessionClient(sessionId);
        if (!client) return res.status(404).json({ success: false, error: 'Client not found' });

        const qr = client.getQrCode();
        if (!qr) {
            return res.status(404).json({ success: false, error: 'No QR available' });
        }
        res.json({ success: true, qr });
    } catch (error) {
        console.error('Error getting QR:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/config - Get current configuration
router.get('/config', (req, res) => {
    try {
        const sessionManager = req.app.get('sessionManager');
        const sessionId = getSessionId(req);

        // If no session, return default config?
        if (!sessionId) {
            // Return default config structure
            return res.json({
                success: true, config: {
                    headless: true,
                    messageDelay: 2,
                    maxContactsPerBatch: 50,
                    waitTimeBetweenBatches: 15
                }
            });
        }

        const client = sessionManager.getSessionClient(sessionId);
        if (!client) return res.json({ success: true, config: {} });

        res.json({ success: true, config: client.config });
    } catch (error) {
        console.error('Error getting config:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/config - Update configuration
router.post('/config', (req, res) => {
    try {
        const sessionManager = req.app.get('sessionManager');
        const sessionId = getSessionId(req);
        if (!sessionId) return res.status(400).json({ error: 'No active WhatsApp session' });

        const client = sessionManager.getSessionClient(sessionId);
        if (!client) return res.status(400).json({ error: 'WhatsApp client not found' });

        const newConfig = req.body;
        client.config = { ...client.config, ...newConfig };
        client.saveConfig();

        res.json({ success: true, config: client.config });
    } catch (error) {
        console.error('Error updating config:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/initialize - Initialize WhatsApp client
router.post('/initialize', async (req, res) => {
    try {
        const sessionManager = req.app.get('sessionManager');
        const sessionId = getSessionId(req);
        if (!sessionId) return res.status(400).json({ error: 'No active WhatsApp session to initialize' });

        // Use sessionManager to initialize
        await sessionManager.initializeSession(sessionId);

        res.json({ success: true, message: 'WhatsApp client initialized' });
    } catch (error) {
        console.error('Error initializing:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/logout - Logout and clear session
router.post('/logout', async (req, res) => {
    try {
        const sessionManager = req.app.get('sessionManager');
        const sessionId = getSessionId(req);
        if (!sessionId) return res.status(400).json({ error: 'No active WhatsApp session' });

        const result = await sessionManager.destroySession(sessionId);
        if (result.success) {
            res.json({ success: true, message: 'Logged out successfully' });
        } else {
            res.status(500).json({ error: result.error || 'Failed to logout' });
        }
    } catch (error) {
        console.error('Error logging out:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/reset-session - Clear session and reinitialize client (forces new QR)
router.post('/reset-session', async (req, res) => {
    try {
        const sessionManager = req.app.get('sessionManager');
        const sessionId = getSessionId(req);
        if (!sessionId) return res.status(400).json({ error: 'No active WhatsApp session' });

        console.log(`🔁 Resetting WhatsApp session ${sessionId}...`);

        // Destroy and recreate mechanics
        // Since SessionManager handles lifecycle, "reset" usually means destroy and re-create/re-init
        // But for SessionManager, "createSession" creates a NEW ID usually. 
        // If we want to reset the *current* session ID's data:
        // We might need to manually access the client and call reset if implemented, 
        // OR destroy session and create a new one for the user?
        // But the frontend expects to keep the same context maybe?

        // If we look at previous `whatsappClient.resetSession()` logic (implied), it destroyed and re-inited.
        // Let's see if we can just destroy and re-init using SessionManager.

        const client = sessionManager.getSessionClient(sessionId);
        if (client) {
            await client.resetSession(); // Assuming resetSession exists on client as per previous code
        } else {
            // Fallback
            await sessionManager.destroySession(sessionId);
            // Re-create??
            // Usually reset-session implies keeping the 'slot' but clearing data.
            // But here sessions are dynamic.
            // Maybe we should just return success and let frontend handle re-creation?
            // Or better, using client.resetSession() is safer if it exists.
        }

        res.json({ success: true, message: 'Session cleared. Please scan the new QR.' });
    } catch (error) {
        console.error('Error resetting session:', error);
        res.status(500).json({ error: error.message });
    }
});

// Configure multer for complete config import
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = './uploads/temp';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage });

// GET /api/config/export-all - Export complete configuration (menus + rules + media)
router.get('/config/export-all', async (req, res) => {
    try {
        const sessionManager = req.app.get('sessionManager');
        const sessionId = req.query.sessionId || req.sessionId || sessionManager.getFirstActiveSession(req.userId);

        if (!sessionId) {
            return res.status(404).json({ error: 'No active session found' });
        }

        const session = sessionManager.getSession(sessionId);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const client = session.client;
        const menus = client.interactiveMenus || [];
        const rules = client.autoReplyRules || [];

        console.log('[Export-All] Starting complete export:', {
            sessionId,
            menusCount: menus.length,
            rulesCount: rules.length
        });

        // Collect all media files
        const mediaFiles = new Set();
        const uploadDir = process.env.UPLOAD_DIR || './uploads';

        // Collect media from menus
        menus.forEach(menu => {
            if (menu.mediaPaths && Array.isArray(menu.mediaPaths)) {
                menu.mediaPaths.forEach(p => {
                    if (p && !p.startsWith('http')) {
                        const fileName = path.basename(p);
                        const fullPath = path.join(uploadDir, fileName);
                        if (fs.existsSync(fullPath)) {
                            mediaFiles.add(fileName);
                        }
                    }
                });
            }

            if (menu.options && Array.isArray(menu.options)) {
                menu.options.forEach(opt => {
                    if (opt.mediaPaths && Array.isArray(opt.mediaPaths)) {
                        opt.mediaPaths.forEach(p => {
                            if (p && !p.startsWith('http')) {
                                const fileName = path.basename(p);
                                const fullPath = path.join(uploadDir, fileName);
                                if (fs.existsSync(fullPath)) {
                                    mediaFiles.add(fileName);
                                }
                            }
                        });
                    }
                });
            }
        });

        // Collect media from rules
        rules.forEach(rule => {
            if (rule.mediaPaths && Array.isArray(rule.mediaPaths)) {
                rule.mediaPaths.forEach(p => {
                    if (p && !p.startsWith('http')) {
                        const fileName = path.basename(p);
                        const fullPath = path.join(uploadDir, fileName);
                        if (fs.existsSync(fullPath)) {
                            mediaFiles.add(fileName);
                        }
                    }
                });
            }
        });

        console.log(`[Export-All] Found ${mediaFiles.size} media files`);

        // Create ZIP file
        const archive = archiver('zip', { zlib: { level: 9 } });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const zipFileName = `whatsapp-config-${timestamp}.zip`;

        res.attachment(zipFileName);
        archive.pipe(res);

        // Add menus.json
        const menusData = {
            menus,
            exportDate: new Date().toISOString(),
            count: menus.length,
            version: '1.0'
        };
        archive.append(JSON.stringify(menusData, null, 2), { name: 'menus.json' });

        // Add rules.json
        const rulesData = {
            rules,
            exportDate: new Date().toISOString(),
            count: rules.length,
            version: '1.0'
        };
        archive.append(JSON.stringify(rulesData, null, 2), { name: 'rules.json' });

        // Add media files
        for (const fileName of mediaFiles) {
            const filePath = path.join(uploadDir, fileName);
            if (fs.existsSync(filePath)) {
                archive.file(filePath, { name: `media/${fileName}` });
            }
        }

        await archive.finalize();
        console.log('[Export-All] Export completed successfully');

    } catch (error) {
        console.error('[Export-All] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/config/import-all - Import complete configuration (menus + rules + media)
router.post('/config/import-all', upload.single('file'), async (req, res) => {
    try {
        const sessionManager = req.app.get('sessionManager');
        const sessionId = req.body.sessionId || req.sessionId || sessionManager.getFirstActiveSession(req.userId);
        const applyToAllSessions = req.body.applyToAllSessions === 'true';

        console.log('[Import-All] Starting complete import:', {
            sessionId,
            applyToAllSessions,
            fileName: req.file?.originalname
        });

        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const session = sessionManager.getSession(sessionId);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const filePath = req.file.path;
        const uploadDir = process.env.UPLOAD_DIR || './uploads';

        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        // Extract ZIP file
        const directory = await unzipper.Open.file(filePath);
        let menusData = null;
        let rulesData = null;
        let mediaCount = 0;

        // Extract all files
        for (const file of directory.files) {
            if (file.path === 'menus.json') {
                const content = await file.buffer();
                const parsed = JSON.parse(content.toString('utf8'));
                menusData = Array.isArray(parsed) ? parsed : (parsed.menus || []);
            } else if (file.path === 'rules.json') {
                const content = await file.buffer();
                const parsed = JSON.parse(content.toString('utf8'));
                rulesData = Array.isArray(parsed) ? parsed : (parsed.rules || []);
            } else if (file.path.startsWith('media/')) {
                const fileName = path.basename(file.path);
                const targetPath = path.join(uploadDir, fileName);

                if (fs.existsSync(targetPath)) {
                    fs.unlinkSync(targetPath);
                }

                const content = await file.buffer();
                fs.writeFileSync(targetPath, content);
                mediaCount++;
            }
        }

        // Clean up uploaded file
        fs.unlinkSync(filePath);

        if (!menusData && !rulesData) {
            return res.status(400).json({ error: 'No valid configuration found in ZIP file' });
        }

        const client = session.client;
        const sessionsToUpdate = applyToAllSessions
            ? Array.from(sessionManager.sessions.values()).map(s => s.client)
            : [client];

        console.log(`[Import-All] Applying to ${sessionsToUpdate.length} session(s)`);

        const results = {
            menus: { imported: 0, replaced: 0 },
            rules: { imported: 0, replaced: 0 },
            media: mediaCount
        };

        // Import menus first
        if (menusData && menusData.length > 0) {
            menusData.forEach(menu => {
                if (!menu.name) return;

                // Update media paths
                if (menu.mediaPaths && Array.isArray(menu.mediaPaths)) {
                    menu.mediaPaths = menu.mediaPaths.map(p => {
                        if (p && !p.startsWith('http')) {
                            const fileName = path.basename(p);
                            return path.join(uploadDir, fileName).replace(/\\/g, '/');
                        }
                        return p;
                    });
                }

                if (menu.options && Array.isArray(menu.options)) {
                    menu.options.forEach(opt => {
                        if (opt.mediaPaths && Array.isArray(opt.mediaPaths)) {
                            opt.mediaPaths = opt.mediaPaths.map(p => {
                                if (p && !p.startsWith('http')) {
                                    const fileName = path.basename(p);
                                    return path.join(uploadDir, fileName).replace(/\\/g, '/');
                                }
                                return p;
                            });
                        }
                    });
                }

                sessionsToUpdate.forEach((sessionClient, sessionIndex) => {
                    const existingIndex = sessionClient.interactiveMenus.findIndex(m => m.name === menu.name);

                    if (existingIndex !== -1) {
                        const existingMenu = sessionClient.interactiveMenus[existingIndex];
                        sessionClient.interactiveMenus[existingIndex] = {
                            ...menu,
                            id: existingMenu.id,
                            createdAt: existingMenu.createdAt,
                            updatedAt: new Date().toISOString()
                        };
                        if (sessionIndex === 0) results.menus.replaced++;
                    } else {
                        sessionClient.interactiveMenus.push({
                            ...menu,
                            id: menu.id || (Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9)),
                            createdAt: menu.createdAt || new Date().toISOString(),
                            updatedAt: new Date().toISOString()
                        });
                        if (sessionIndex === 0) results.menus.imported++;
                    }
                });
            });

            sessionsToUpdate.forEach(sessionClient => {
                sessionClient.saveInteractiveMenus();
            });
        }

        // Import rules second (after menus are loaded)
        if (rulesData && rulesData.length > 0) {
            rulesData.forEach(rule => {
                if (!rule.name || !rule.keywords) return;

                const keywordsArray = Array.isArray(rule.keywords) ? rule.keywords : [];

                // Update media paths
                let mediaPaths = [];
                if (rule.mediaPaths && Array.isArray(rule.mediaPaths)) {
                    mediaPaths = rule.mediaPaths.map(p => {
                        if (p && !p.startsWith('http')) {
                            const fileName = path.basename(p);
                            return path.join(uploadDir, fileName).replace(/\\/g, '/');
                        }
                        return p;
                    });
                }

                // Update menuId for menu-type rules
                let finalMenuId = rule.menuId;
                if (rule.type === 'menu' && rule.menuId) {
                    const firstSession = sessionsToUpdate[0];
                    const menuById = firstSession.interactiveMenus.find(m => String(m.id) === String(rule.menuId));

                    if (!menuById) {
                        const firstActiveMenu = firstSession.interactiveMenus.find(m => m.isActive);
                        if (firstActiveMenu) {
                            console.log(`[Import-All] Updating menuId for rule "${rule.name}" to ${firstActiveMenu.id}`);
                            finalMenuId = firstActiveMenu.id;
                        }
                    }
                }

                sessionsToUpdate.forEach((sessionClient, sessionIndex) => {
                    const existingIndex = sessionClient.autoReplyRules.findIndex(r => r.name === rule.name);

                    const ruleData = {
                        name: rule.name,
                        keywords: keywordsArray,
                        response: rule.response || '',
                        matchType: rule.matchType || 'contains',
                        delay: rule.delay || 2,
                        isActive: rule.isActive !== undefined ? rule.isActive : true,
                        mediaPaths,
                        mediaPath: mediaPaths[0] || null,
                        captions: rule.captions || [],
                        caption: (rule.captions && rule.captions[0]) || rule.caption || '',
                        type: rule.type || 'simple',
                        menuId: finalMenuId || null
                    };

                    if (existingIndex !== -1) {
                        const existingRule = sessionClient.autoReplyRules[existingIndex];
                        sessionClient.autoReplyRules[existingIndex] = {
                            ...ruleData,
                            id: existingRule.id
                        };
                        if (sessionIndex === 0) results.rules.replaced++;
                    } else {
                        sessionClient.autoReplyRules.push({
                            ...ruleData,
                            id: rule.id || (Date.now().toString() + '-' + Math.round(Math.random() * 1E9))
                        });
                        if (sessionIndex === 0) results.rules.imported++;
                    }
                });
            });

            sessionsToUpdate.forEach(sessionClient => {
                sessionClient.saveAutoReplyRules();
            });
        }

        console.log('[Import-All] Import completed:', results);

        res.json({
            success: true,
            ...results
        });

    } catch (error) {
        console.error('[Import-All] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/config/global-sessions - Get global sessions configuration
router.get('/config/global-sessions', (req, res) => {
    try {
        const configPath = path.join(__dirname, '../data/globalSessionsConfig.json');

        let config = { enabled: true, activeSessionId: null };
        if (fs.existsSync(configPath)) {
            config = { ...config, ...JSON.parse(fs.readFileSync(configPath, 'utf8')) };
        }

        res.json({ success: true, ...config });
    } catch (error) {
        console.error('[Global-Sessions] Error reading config:', error);
        res.json({ success: true, enabled: true, activeSessionId: null });
    }
});

// POST /api/config/global-sessions - Update global sessions configuration
router.post('/config/global-sessions', (req, res) => {
    try {
        const { enabled, activeSessionId } = req.body;
        const configPath = path.join(__dirname, '../data/globalSessionsConfig.json');

        const dataDir = path.join(__dirname, '../data');
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

        let config = { enabled: true, activeSessionId: null };
        if (fs.existsSync(configPath)) {
            config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }

        if (enabled !== undefined) config.enabled = enabled;
        if (activeSessionId !== undefined) config.activeSessionId = activeSessionId;

        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

        console.log('[Global-Sessions] Configuration updated:', config);

        // Notify all WhatsApp clients to reload configuration
        const sessionManager = req.app.get('sessionManager');
        if (sessionManager && sessionManager.sessions) {
            for (const [id, sessionData] of sessionManager.sessions.entries()) {
                const client = sessionData.client;
                if (client && typeof client.loadGlobalSessionsConfig === 'function') {
                    client.loadGlobalSessionsConfig();
                    console.log(`[Global-Sessions] Reloaded config for session: ${id}`);
                }
            }
        }

        res.json({ success: true, ...config });
    } catch (error) {
        console.error('[Global-Sessions] Error saving config:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/cleanup-orphaned-files - Clean up orphaned media files
router.post('/cleanup-orphaned-files', (req, res) => {
    try {
        const sessionManager = req.app.get('sessionManager');
        const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '../uploads');
        const { sessionId, allSessions } = req.body;

        let result;

        if (allSessions) {
            // Clean considering all sessions
            result = cleanAllSessionsOrphanedFiles(sessionManager, uploadDir);
            console.log('[Cleanup] Global cleanup executed:', result);
        } else if (sessionId) {
            // Clean for specific session
            const sessionData = sessionManager.getSession(sessionId);
            if (!sessionData || !sessionData.client) {
                return res.status(404).json({ error: 'Session not found' });
            }
            result = cleanSessionOrphanedFiles(sessionData.client, uploadDir);
            console.log(`[Cleanup] Session ${sessionId} cleanup executed:`, result);
        } else {
            return res.status(400).json({ error: 'Must specify sessionId or allSessions=true' });
        }

        res.json({
            success: true,
            ...result,
            message: `Cleanup complete: ${result.deletedCount} orphaned file(s) deleted`
        });
    } catch (error) {
        console.error('[Cleanup] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
