import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { deleteItemMediaFiles, cleanSessionOrphanedFiles } from '../utils/mediaCleanup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Helper to get session ID
const getSessionId = (req) => {
    const sessionManager = req.app.get('sessionManager');
    if (req.sessionId) return req.sessionId;
    if (req.userId) return sessionManager.getFirstActiveSession(req.userId);

    // If no userId, get the first session from the sessions Map
    if (sessionManager.sessions && sessionManager.sessions.size > 0) {
        const firstSessionId = sessionManager.sessions.keys().next().value;
        return firstSessionId;
    }
    return null;
};

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
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

const upload = multer({ storage });

// GET /api/menus - Get all interactive menus
router.get('/', (req, res) => {
    try {
        const sessionManager = req.app.get('sessionManager');
        const sessionId = getSessionId(req);
        if (!sessionId) return res.json({ success: true, menus: [] }); // Or error

        const client = sessionManager.getSessionClient(sessionId);
        if (!client) return res.json({ success: true, menus: [] });

        res.json({ success: true, menus: client.interactiveMenus });
    } catch (error) {
        console.error('Error getting menus:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/menus - Create new menu
router.post('/', upload.array('media', 50), (req, res) => {
    try {
        const sessionManager = req.app.get('sessionManager');
        const sessionId = getSessionId(req);
        if (!sessionId) return res.status(400).json({ error: 'No active WhatsApp session' });

        const client = sessionManager.getSessionClient(sessionId);
        if (!client) return res.status(400).json({ error: 'WhatsApp client not found' });

        const files = req.files || [];
        const menu = {
            name: req.body.name,
            message: req.body.message,
            isActive: req.body.isActive === 'true' || req.body.isActive === true,
            options: []
        };

        if (req.body.options) {
            try {
                menu.options = typeof req.body.options === 'string'
                    ? JSON.parse(req.body.options)
                    : req.body.options;
            } catch (e) {
                menu.options = [];
            }
        }

        if (req.body.menuMediaPaths) {
            try {
                menu.mediaPaths = typeof req.body.menuMediaPaths === 'string'
                    ? JSON.parse(req.body.menuMediaPaths)
                    : req.body.menuMediaPaths;
            } catch (e) {
                menu.mediaPaths = [];
            }
        }

        if (req.body.menuCaptions) {
            try {
                menu.captions = typeof req.body.menuCaptions === 'string'
                    ? JSON.parse(req.body.menuCaptions)
                    : req.body.menuCaptions;
            } catch (e) {
                menu.captions = [];
            }
        }

        if (!menu.name) return res.status(400).json({ error: 'Missing required field: name' });

        const hasCaption = menu.captions && menu.captions.some(c => c && c.trim().length > 0);
        if (!menu.message && !hasCaption) return res.status(400).json({ error: 'Missing required field: message (or provide captions in media)' });

        menu.id = Date.now().toString();
        menu.createdAt = new Date().toISOString();
        menu.updatedAt = new Date().toISOString();

        if (files.length > 0) {
            // Convert absolute paths to relative paths (relative to server directory)
            const uploadedPaths = files.map(f => {
                const relativePath = path.relative(process.cwd(), f.path);
                return relativePath.replace(/\\/g, '/'); // Normalize to forward slashes
            });
            menu.mediaPaths = menu.mediaPaths || [];
            menu.mediaPaths.push(...uploadedPaths);
        }

        client.interactiveMenus.push(menu);
        client.saveInteractiveMenus();

        res.json({ success: true, menu });
    } catch (error) {
        console.error('Error creating menu:', error);
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/menus/:id - Update menu
router.put('/:id', upload.array('media', 50), (req, res) => {
    try {
        const sessionManager = req.app.get('sessionManager');
        const sessionId = getSessionId(req);
        if (!sessionId) return res.status(400).json({ error: 'No active WhatsApp session' });

        const client = sessionManager.getSessionClient(sessionId);
        if (!client) return res.status(400).json({ error: 'WhatsApp client not found' });

        const { id } = req.params;
        const files = req.files || [];

        const index = client.interactiveMenus.findIndex(m => String(m.id) === String(id));
        if (index === -1) return res.status(404).json({ error: 'Menu not found' });

        const existingMenu = client.interactiveMenus[index];
        const updatedMenu = {
            name: req.body.name !== undefined ? req.body.name : existingMenu.name,
            message: req.body.message !== undefined ? req.body.message : existingMenu.message,
            isActive: req.body.isActive !== undefined
                ? (req.body.isActive === 'true' || req.body.isActive === true)
                : existingMenu.isActive
        };

        if (req.body.options) {
            try {
                updatedMenu.options = typeof req.body.options === 'string'
                    ? JSON.parse(req.body.options)
                    : req.body.options;
            } catch (e) {
                updatedMenu.options = existingMenu.options || [];
            }
        } else {
            updatedMenu.options = existingMenu.options || [];
        }

        // Replace mediaPaths completely with the ones from frontend
        if (req.body.menuMediaPaths) {
            try {
                updatedMenu.mediaPaths = typeof req.body.menuMediaPaths === 'string'
                    ? JSON.parse(req.body.menuMediaPaths)
                    : req.body.menuMediaPaths;
            } catch (e) {
                updatedMenu.mediaPaths = [];
            }
        } else {
            updatedMenu.mediaPaths = [];
        }

        if (req.body.menuCaptions) {
            try {
                updatedMenu.captions = typeof req.body.menuCaptions === 'string'
                    ? JSON.parse(req.body.menuCaptions)
                    : req.body.menuCaptions;
            } catch (e) {
                updatedMenu.captions = [];
            }
        } else {
            updatedMenu.captions = [];
        }

        // Add newly uploaded files to the mediaPaths
        if (files.length > 0) {
            // Convert absolute paths to relative paths (relative to server directory)
            const uploadedPaths = files.map(f => {
                const relativePath = path.relative(process.cwd(), f.path);
                return relativePath.replace(/\\/g, '/'); // Normalize to forward slashes
            });
            updatedMenu.mediaPaths = [...updatedMenu.mediaPaths, ...uploadedPaths];
        }

        const mergedMenu = {
            ...existingMenu,
            ...updatedMenu,
            id: existingMenu.id,
            createdAt: existingMenu.createdAt,
            updatedAt: new Date().toISOString()
        };

        client.interactiveMenus[index] = mergedMenu;
        client.saveInteractiveMenus();

        // Limpiar archivos huérfanos después de actualizar
        const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
        cleanSessionOrphanedFiles(client, uploadDir);

        res.json({ success: true, menu: mergedMenu });
    } catch (error) {
        console.error('Error updating menu:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/menus/upload-option-media - Upload media for menu option
router.post('/upload-option-media', upload.array('media', 10), (req, res) => {
    try {
        const files = req.files || [];
        if (files.length === 0) return res.status(400).json({ error: 'No files uploaded' });

        const uploadedFiles = files.map(f => ({
            path: f.path,
            filename: f.filename,
            originalname: f.originalname,
            mimetype: f.mimetype,
            size: f.size
        }));
        res.json({ success: true, files: uploadedFiles });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/menus/:id - Delete menu
router.delete('/:id', (req, res) => {
    try {
        const sessionManager = req.app.get('sessionManager');
        const sessionId = getSessionId(req);
        if (!sessionId) return res.status(400).json({ error: 'No active WhatsApp session' });

        const client = sessionManager.getSessionClient(sessionId);
        if (!client) return res.status(400).json({ error: 'WhatsApp client not found' });

        const { id } = req.params;
        const index = client.interactiveMenus.findIndex(m => String(m.id) === String(id));
        if (index === -1) return res.status(404).json({ error: 'Menu not found' });

        const menu = client.interactiveMenus[index];

        // Eliminar archivos multimedia del menú principal
        deleteItemMediaFiles(menu);

        // Eliminar archivos multimedia de las opciones del menú
        if (menu.options && Array.isArray(menu.options)) {
            menu.options.forEach(option => {
                deleteItemMediaFiles(option);
            });
        }

        // Eliminar el menú
        client.interactiveMenus.splice(index, 1);
        client.saveInteractiveMenus();

        // Limpiar archivos huérfanos (por si acaso)
        const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
        cleanSessionOrphanedFiles(client, uploadDir);

        res.json({ success: true, message: 'Menu deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/menus/sessions - Get active menu sessions (from memory)
router.get('/sessions', (req, res) => {
    try {
        const sessionManager = req.app.get('sessionManager');
        const sessionId = getSessionId(req);
        if (!sessionId) return res.json({ success: true, sessions: [] });

        const client = sessionManager.getSessionClient(sessionId);
        if (!client) return res.json({ success: true, sessions: [] });

        const sessions = Array.from(client.userSessions.values());
        res.json({ success: true, sessions });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/menus/sessions/:userId - Clear user session
router.delete('/sessions/:userId', (req, res) => {
    try {
        const sessionManager = req.app.get('sessionManager');
        const sessionId = getSessionId(req);
        if (!sessionId) return res.status(400).json({ error: 'No active WhatsApp session' });

        const client = sessionManager.getSessionClient(sessionId);
        if (!client) return res.status(400).json({ error: 'WhatsApp client not found' });

        const { userId } = req.params;
        client.clearSession(userId);

        res.json({ success: true, message: 'Session cleared successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/menus/export
router.get('/export', async (req, res) => {
    console.log('[Export] ========== EXPORT ENDPOINT CALLED ==========');
    try {
        console.log('[Export] Step 1: Getting session manager');
        const sessionManager = req.app.get('sessionManager');
        const sessionId = getSessionId(req);
        console.log('[Export] Step 2: Session ID:', sessionId);
        const client = sessionId ? sessionManager.getSessionClient(sessionId) : null;
        console.log('[Export] Step 3: Client:', client ? 'Found' : 'Not found');

        const menus = client ? client.interactiveMenus : [];
        console.log('[Export] Step 4: Menus count:', menus.length);

        if (menus.length === 0) {
            console.log('[Export] No menus to export, returning empty JSON');
            return res.json({
                success: true,
                menus: [],
                exportDate: new Date().toISOString(),
                count: 0
            });
        }

        console.log(`[Export] Exporting ${menus.length} menus`);
        menus.forEach((menu, i) => {
            console.log(`[Export] Menu ${i}: ${menu.name}, mediaPaths:`, menu.mediaPaths);
            if (menu.options) {
                menu.options.forEach((opt, j) => {
                    if (opt.mediaPaths && opt.mediaPaths.length > 0) {
                        console.log(`[Export]   Option ${j}: ${opt.label}, mediaPaths:`, opt.mediaPaths);
                    }
                });
            }
        });

        console.log('[Export] Step 5: Collecting media files');
        const mediaFiles = new Set();
        menus.forEach(menu => {
            // Menu-level media
            if (menu.mediaPaths && Array.isArray(menu.mediaPaths)) {
                menu.mediaPaths.forEach(p => {
                    if (p && !p.startsWith('http')) {
                        mediaFiles.add(p);
                    }
                });
            }
            // Option-level media
            if (menu.options && Array.isArray(menu.options)) {
                menu.options.forEach(opt => {
                    if (opt.mediaPaths && Array.isArray(opt.mediaPaths)) {
                        opt.mediaPaths.forEach(p => {
                            if (p && !p.startsWith('http')) {
                                mediaFiles.add(p);
                            }
                        });
                    }
                });
            }
        });

        console.log(`[Export] Found ${mediaFiles.size} media files:`, Array.from(mediaFiles));

        console.log('[Export] Step 6: Creating ZIP archive');
        // Always create ZIP (even if no media files)
        const archiver = (await import('archiver')).default;
        const archive = archiver('zip', { zlib: { level: 9 } });

        console.log('[Export] Step 7: Setting response headers');
        res.attachment('menus-export.zip');
        archive.pipe(res);

        console.log('[Export] Step 8: Adding JSON file to ZIP');
        // Add JSON file
        const jsonData = {
            menus,
            exportDate: new Date().toISOString(),
            count: menus.length,
            version: '1.0'
        };
        archive.append(JSON.stringify(jsonData, null, 2), { name: 'menus.json' });

        console.log('[Export] Step 9: Adding media files to ZIP');
        for (const mediaPath of mediaFiles) {
            const fullPath = path.isAbsolute(mediaPath) ? mediaPath : path.join(process.cwd(), mediaPath);
            if (fs.existsSync(fullPath)) {
                const fileName = path.basename(mediaPath);
                console.log(`[Export] Adding media file: ${fileName} from ${fullPath}`);
                archive.file(fullPath, { name: `media/${fileName}` });
            } else {
                console.warn(`[Export] Media file not found: ${fullPath}`);
            }
        }

        console.log('[Export] Step 10: Finalizing ZIP archive');
        archive.finalize();
        console.log('[Export] ========== EXPORT COMPLETED SUCCESSFULLY ==========');
    } catch (error) {
        console.error('[Export] ERROR:', error);
        console.error('[Export] Error stack:', error.stack);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/menus/import
router.post('/import', upload.single('file'), async (req, res) => {
    try {
        const sessionManager = req.app.get('sessionManager');
        const sessionId = getSessionId(req);
        if (!sessionId) return res.status(400).json({ error: 'No active WhatsApp session' });

        const client = sessionManager.getSessionClient(sessionId);
        if (!client) return res.status(400).json({ error: 'WhatsApp client not found' });

        let menusData;

        // Check if it's a ZIP file or JSON
        if (req.file) {
            const filePath = req.file.path;
            const ext = path.extname(req.file.originalname).toLowerCase();

            if (ext === '.zip') {
                // Handle ZIP file
                const unzipper = (await import('unzipper')).default;
                const uploadDir = process.env.UPLOAD_DIR || './uploads';
                if (!fs.existsSync(uploadDir)) {
                    fs.mkdirSync(uploadDir, { recursive: true });
                }

                const directory = await unzipper.Open.file(filePath);
                let jsonContent = null;

                for (const file of directory.files) {
                    if (file.path === 'menus.json') {
                        const content = await file.buffer();
                        jsonContent = JSON.parse(content.toString('utf8'));
                    } else if (file.path.startsWith('media/')) {
                        // Extract media file to uploads directory
                        const fileName = path.basename(file.path);
                        const targetPath = path.join(uploadDir, fileName);

                        // If file exists, replace it
                        if (fs.existsSync(targetPath)) {
                            fs.unlinkSync(targetPath);
                        }

                        const content = await file.buffer();
                        fs.writeFileSync(targetPath, content);
                    }
                }

                if (!jsonContent) {
                    // Clean up uploaded file
                    fs.unlinkSync(filePath);
                    return res.status(400).json({ error: 'Invalid ZIP file: menus.json not found' });
                }

                menusData = jsonContent.menus || [];

                // Clean up uploaded ZIP file
                fs.unlinkSync(filePath);
            } else if (ext === '.json') {
                // Handle JSON file
                const content = fs.readFileSync(filePath, 'utf8');
                const parsed = JSON.parse(content);
                menusData = Array.isArray(parsed) ? parsed : (parsed.menus || []);

                // Clean up uploaded file
                fs.unlinkSync(filePath);
            } else {
                fs.unlinkSync(filePath);
                return res.status(400).json({ error: 'Invalid file type. Please upload a .zip or .json file' });
            }
        } else if (req.body.menus) {
            // Handle JSON body (legacy support)
            menusData = req.body.menus;
        } else {
            return res.status(400).json({ error: 'No file or data provided' });
        }

        if (!Array.isArray(menusData)) {
            return res.status(400).json({ error: 'Menus must be an array' });
        }

        let imported = 0;
        let skipped = 0;
        let replaced = 0;
        const errors = [];
        const uploadDir = process.env.UPLOAD_DIR || './uploads';

        // Check if we should apply to all sessions
        const applyToAllSessions = req.body.applyToAllSessions === 'true';

        // Get all sessions if applyToAllSessions is true
        const sessionsToUpdate = applyToAllSessions
            ? Array.from(sessionManager.sessions.values()).map(s => s.client)
            : [client];

        console.log(`[Import] Applying to ${sessionsToUpdate.length} session(s)`);

        menusData.forEach((menu, index) => {
            if (!menu.name) {
                errors.push(`Menu ${index + 1}: Missing name`);
                skipped++;
                return;
            }

            // Update media paths to point to correct location
            if (menu.mediaPaths && Array.isArray(menu.mediaPaths)) {
                menu.mediaPaths = menu.mediaPaths.map(p => {
                    if (p && !p.startsWith('http')) {
                        const fileName = path.basename(p);
                        return path.join(uploadDir, fileName);
                    }
                    return p;
                });
            }

            // Update option media paths
            if (menu.options && Array.isArray(menu.options)) {
                menu.options.forEach(opt => {
                    if (opt.mediaPaths && Array.isArray(opt.mediaPaths)) {
                        opt.mediaPaths = opt.mediaPaths.map(p => {
                            if (p && !p.startsWith('http')) {
                                const fileName = path.basename(p);
                                return path.join(uploadDir, fileName);
                            }
                            return p;
                        });
                    }
                });
            }

            // Apply to each session
            sessionsToUpdate.forEach((sessionClient, sessionIndex) => {
                // Check if a menu with the same name already exists
                const existingIndex = sessionClient.interactiveMenus.findIndex(m => m.name === menu.name);

                if (existingIndex !== -1) {
                    // Replace existing menu
                    const existingMenu = sessionClient.interactiveMenus[existingIndex];
                    const updatedMenu = {
                        ...menu,
                        id: existingMenu.id, // Keep the same ID
                        createdAt: existingMenu.createdAt, // Keep original creation date
                        updatedAt: new Date().toISOString(),
                        isActive: menu.isActive !== undefined ? menu.isActive : true,
                        options: menu.options || []
                    };
                    sessionClient.interactiveMenus[existingIndex] = updatedMenu;

                    // Only count once (for the first session)
                    if (sessionIndex === 0) {
                        replaced++;
                        console.log(`[Import] Replaced existing menu: ${menu.name}`);
                    }
                } else {
                    // Create new menu - use original ID from JSON if available
                    const newMenu = {
                        ...menu,
                        id: menu.id || (Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9)),
                        createdAt: menu.createdAt || new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        isActive: menu.isActive !== undefined ? menu.isActive : true,
                        options: menu.options || []
                    };
                    sessionClient.interactiveMenus.push(newMenu);

                    // Only count once (for the first session)
                    if (sessionIndex === 0) {
                        imported++;
                        console.log(`[Import] Created new menu: ${menu.name} with ID: ${newMenu.id}`);
                    }
                }
            });
        });

        // Save all updated sessions
        sessionsToUpdate.forEach(sessionClient => {
            sessionClient.saveInteractiveMenus();
        });

        res.json({
            success: true,
            imported,
            replaced,
            skipped,
            total: menusData.length,
            errors: errors.length > 0 ? errors : undefined
        });
    } catch (error) {
        console.error('Error importing menus:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
