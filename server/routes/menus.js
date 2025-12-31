import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '..', 'uploads');
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
        const whatsappClient = req.app.get('whatsappClient');
        res.json({ success: true, menus: whatsappClient.interactiveMenus });
    } catch (error) {
        console.error('Error getting menus:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/menus - Create new menu (with file upload support)
router.post('/', upload.array('media', 50), (req, res) => {
    try {
        const whatsappClient = req.app.get('whatsappClient');
        const files = req.files || [];

        // Parse menu data from form
        const menu = {
            name: req.body.name,
            message: req.body.message,
            isActive: req.body.isActive === 'true' || req.body.isActive === true,
            options: []
        };

        // Parse options if provided
        if (req.body.options) {
            try {
                menu.options = typeof req.body.options === 'string'
                    ? JSON.parse(req.body.options)
                    : req.body.options;
            } catch (e) {
                console.error('[menus] Error parsing options:', e);
                menu.options = [];
            }
        }

        // Parse menu-level media if provided
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

        console.log('[menus] POST / - menu:', menu, 'files:', files.length);

        // Validate required fields
        if (!menu.name) {
            return res.status(400).json({ error: 'Missing required field: name' });
        }

        // Message is optional if there's at least one caption
        const hasCaption = menu.captions && menu.captions.some(c => c && c.trim().length > 0);
        if (!menu.message && !hasCaption) {
            return res.status(400).json({ error: 'Missing required field: message (or provide captions in media)' });
        }

        menu.id = Date.now().toString();
        menu.createdAt = new Date().toISOString();
        menu.updatedAt = new Date().toISOString();

        // Add uploaded file paths to menu-level media
        if (files.length > 0) {
            const uploadedPaths = files.map(f => f.path);
            menu.mediaPaths = menu.mediaPaths || [];
            menu.mediaPaths.push(...uploadedPaths);
        }

        whatsappClient.interactiveMenus.push(menu);
        whatsappClient.saveInteractiveMenus();

        res.json({ success: true, menu });
    } catch (error) {
        console.error('Error creating menu:', error);
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/menus/:id - Update menu (with file upload support)
router.put('/:id', upload.array('media', 50), (req, res) => {
    try {
        const whatsappClient = req.app.get('whatsappClient');
        const { id } = req.params;
        const files = req.files || [];

        const index = whatsappClient.interactiveMenus.findIndex(m => m.id === id);
        if (index === -1) {
            return res.status(404).json({ error: 'Menu not found' });
        }

        const existingMenu = whatsappClient.interactiveMenus[index];

        // Parse updated menu data
        const updatedMenu = {
            name: req.body.name !== undefined ? req.body.name : existingMenu.name,
            message: req.body.message !== undefined ? req.body.message : existingMenu.message,
            isActive: req.body.isActive !== undefined
                ? (req.body.isActive === 'true' || req.body.isActive === true)
                : existingMenu.isActive
        };

        // Parse options
        if (req.body.options) {
            try {
                updatedMenu.options = typeof req.body.options === 'string'
                    ? JSON.parse(req.body.options)
                    : req.body.options;

                console.log(`[API] Received ${updatedMenu.options.length} options for menu ${id}.`);
                updatedMenu.options.forEach((opt, i) => {
                    console.log(`  Option ${i}: ${opt.label}, nextMenuId: ${opt.nextMenuId}, goBack: ${opt.goBack}`);
                });
            } catch (e) {
                console.error('[API] Error parsing options:', e);
                updatedMenu.options = existingMenu.options || [];
            }
        } else {
            updatedMenu.options = existingMenu.options || [];
        }

        // Handle menu-level media
        if (req.body.menuMediaPaths) {
            try {
                updatedMenu.mediaPaths = typeof req.body.menuMediaPaths === 'string'
                    ? JSON.parse(req.body.menuMediaPaths)
                    : req.body.menuMediaPaths;
            } catch (e) {
                updatedMenu.mediaPaths = existingMenu.mediaPaths || [];
            }
        } else {
            updatedMenu.mediaPaths = existingMenu.mediaPaths || [];
        }

        if (req.body.menuCaptions) {
            try {
                updatedMenu.captions = typeof req.body.menuCaptions === 'string'
                    ? JSON.parse(req.body.menuCaptions)
                    : req.body.menuCaptions;
            } catch (e) {
                updatedMenu.captions = existingMenu.captions || [];
            }
        } else {
            updatedMenu.captions = existingMenu.captions || [];
        }

        // Add new uploaded files
        if (files.length > 0) {
            const uploadedPaths = files.map(f => f.path);
            updatedMenu.mediaPaths = updatedMenu.mediaPaths || [];
            updatedMenu.mediaPaths.push(...uploadedPaths);
        }

        console.log('[menus] PUT /:id - id:', id, 'files:', files.length);

        const mergedMenu = {
            ...existingMenu,
            ...updatedMenu,
            id: existingMenu.id,
            createdAt: existingMenu.createdAt,
            updatedAt: new Date().toISOString()
        };

        whatsappClient.interactiveMenus[index] = mergedMenu;
        whatsappClient.saveInteractiveMenus();

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

        if (files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        const uploadedFiles = files.map(f => ({
            path: f.path,
            filename: f.filename,
            originalname: f.originalname,
            mimetype: f.mimetype,
            size: f.size
        }));

        console.log('[menus] Uploaded option media:', uploadedFiles.length, 'files');

        res.json({ success: true, files: uploadedFiles });
    } catch (error) {
        console.error('Error uploading option media:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/menus/:id - Delete menu
router.delete('/:id', (req, res) => {
    try {
        const whatsappClient = req.app.get('whatsappClient');
        const { id } = req.params;

        const index = whatsappClient.interactiveMenus.findIndex(m => m.id === id);
        if (index === -1) {
            return res.status(404).json({ error: 'Menu not found' });
        }

        whatsappClient.interactiveMenus.splice(index, 1);
        whatsappClient.saveInteractiveMenus();

        res.json({ success: true, message: 'Menu deleted successfully' });
    } catch (error) {
        console.error('Error deleting menu:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/menus/sessions - Get active user sessions
router.get('/sessions', (req, res) => {
    try {
        const whatsappClient = req.app.get('whatsappClient');
        const sessions = Array.from(whatsappClient.userSessions.values());
        res.json({ success: true, sessions });
    } catch (error) {
        console.error('Error getting sessions:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/menus/sessions/:userId - Clear user session
router.delete('/sessions/:userId', (req, res) => {
    try {
        const whatsappClient = req.app.get('whatsappClient');
        const { userId } = req.params;

        whatsappClient.clearSession(userId);

        res.json({ success: true, message: 'Session cleared successfully' });
    } catch (error) {
        console.error('Error clearing session:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/menus/export - Export all menus as JSON
router.get('/export', (req, res) => {
    try {
        const whatsappClient = req.app.get('whatsappClient');
        const menus = whatsappClient.interactiveMenus || [];

        res.json({
            success: true,
            menus,
            exportDate: new Date().toISOString(),
            count: menus.length
        });
    } catch (error) {
        console.error('Error exporting menus:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/menus/import - Import menus from JSON
router.post('/import', (req, res) => {
    try {
        const whatsappClient = req.app.get('whatsappClient');
        const { menus } = req.body;

        if (!Array.isArray(menus)) {
            return res.status(400).json({ error: 'Menus must be an array' });
        }

        let imported = 0;
        let skipped = 0;
        const errors = [];

        menus.forEach((menu, index) => {
            try {
                // Validate required fields
                if (!menu.name) {
                    errors.push(`Menu ${index + 1}: Missing required field: name`);
                    skipped++;
                    return;
                }

                // Message is optional if there's at least one caption
                const hasCaption = menu.captions && menu.captions.some(c => c && c.trim().length > 0);
                if (!menu.message && !hasCaption) {
                    errors.push(`Menu ${index + 1}: Missing required field: message (or provide captions in media)`);
                    skipped++;
                    return;
                }

                // Generate new ID and timestamps
                const newMenu = {
                    ...menu,
                    id: Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9),
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    isActive: menu.isActive !== undefined ? menu.isActive : true,
                    options: menu.options || []
                };

                whatsappClient.interactiveMenus.push(newMenu);
                imported++;
            } catch (err) {
                errors.push(`Menu ${index + 1}: ${err.message}`);
                skipped++;
            }
        });

        whatsappClient.saveInteractiveMenus();

        res.json({
            success: true,
            imported,
            skipped,
            total: menus.length,
            errors: errors.length > 0 ? errors : undefined
        });
    } catch (error) {
        console.error('Error importing menus:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
