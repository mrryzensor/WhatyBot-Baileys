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

// GET /api/auto-reply/rules - Get all auto-reply rules
router.get('/rules', (req, res) => {
    try {
        const whatsappClient = req.app.get('whatsappClient');
        // Normalize keywords to arrays and isActive to boolean before sending to frontend
        const normalizedRules = whatsappClient.autoReplyRules.map(rule => {
            const normalizedRule = { ...rule };
            if (normalizedRule.keywords && typeof normalizedRule.keywords === 'string') {
                try {
                    normalizedRule.keywords = JSON.parse(normalizedRule.keywords);
                } catch {
                    normalizedRule.keywords = normalizedRule.keywords.split(',').map(k => k.trim()).filter(k => k.length > 0);
                }
            }
            // Ensure keywords is always an array
            if (!Array.isArray(normalizedRule.keywords)) {
                normalizedRule.keywords = [];
            }
            // Ensure isActive is always a boolean
            if (normalizedRule.isActive !== undefined) {
                normalizedRule.isActive = Boolean(normalizedRule.isActive);
            } else {
                normalizedRule.isActive = true; // Default to true if not set
            }
            return normalizedRule;
        });
        res.json({ success: true, rules: normalizedRules });
    } catch (error) {
        console.error('Error getting rules:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/auto-reply/rules - Create new rule (with optional single or multiple media files)
router.post('/rules', upload.array('media', 10), (req, res) => {
    try {
        const whatsappClient = req.app.get('whatsappClient');
        const rule = req.body;

        console.log('[autoReply] POST /rules - body:', rule);

        if (!rule.name || !rule.keywords) {
            return res.status(400).json({ error: 'Missing required fields: name, keywords' });
        }

        const files = Array.isArray(req.files) ? req.files : [];
        console.log('[autoReply] PUT /rules/:id - files:', files.map(f => ({ fieldname: f.fieldname, originalname: f.originalname, path: f.path })));
        console.log('[autoReply] POST /rules - files:', files.map(f => ({ fieldname: f.fieldname, originalname: f.originalname, path: f.path })));

        // Validation: menu-type rules need menuId, simple-type rules need response or media
        if (rule.type === 'menu') {
            if (!rule.menuId) {
                return res.status(400).json({ error: 'Menu-type rules require menuId' });
            }
        } else {
            if (!rule.response && (!files || files.length === 0)) {
                return res.status(400).json({ error: 'Missing required field: response or media' });
            }
        }

        // Normalize keywords to array
        let keywordsArray = [];
        if (typeof rule.keywords === 'string') {
            try {
                keywordsArray = JSON.parse(rule.keywords);
            } catch {
                keywordsArray = rule.keywords.split(',').map(k => k.trim()).filter(k => k.length > 0);
            }
        } else if (Array.isArray(rule.keywords)) {
            keywordsArray = rule.keywords;
        }

        rule.id = Date.now().toString();
        rule.keywords = keywordsArray; // Ensure it's always an array

        // Manejo de múltiples medias: construir mediaPaths y captions
        const mediaPaths = files && files.length > 0 ? files.map(f => f.path) : [];

        let mediaCaptions = [];
        if (rule.captions) {
            try {
                const parsed = JSON.parse(rule.captions);
                if (Array.isArray(parsed)) {
                    mediaCaptions = parsed.map(c => (typeof c === 'string' ? c : ''));
                }
            } catch (e) {
                // fallback a caption simple más abajo
            }
        }

        if (mediaCaptions.length === 0 && mediaPaths.length > 0) {
            const baseCaption = rule.caption || '';
            mediaCaptions = mediaPaths.map(() => baseCaption);
        }

        rule.mediaPaths = mediaPaths;
        rule.captions = mediaCaptions;

        console.log('[autoReply] POST /rules - computed mediaPaths:', mediaPaths, 'mediaCaptions:', mediaCaptions);

        // Compatibilidad con campos antiguos de un solo archivo
        rule.mediaPath = mediaPaths.length > 0 ? mediaPaths[0] : null;
        rule.caption = mediaCaptions.length > 0 ? mediaCaptions[0] : (rule.caption || '');

        // Normalize isActive to boolean
        if (rule.isActive !== undefined) {
            if (typeof rule.isActive === 'string') {
                rule.isActive = rule.isActive === 'true' || rule.isActive === '1';
            } else {
                rule.isActive = Boolean(rule.isActive);
            }
        } else {
            rule.isActive = true; // Default to true if not set
        }

        // Handle type and menuId for menu-type rules
        rule.type = rule.type || 'simple';
        if (rule.type === 'menu' && rule.menuId) {
            rule.menuId = rule.menuId;
        }

        whatsappClient.autoReplyRules.push(rule);
        whatsappClient.saveAutoReplyRules();

        // Ensure isActive is boolean in response
        const normalizedRule = { ...rule };
        normalizedRule.isActive = Boolean(normalizedRule.isActive);

        res.json({ success: true, rule: normalizedRule });
    } catch (error) {
        console.error('Error creating rule:', error);
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/auto-reply/rules/:id - Update rule (with optional single or multiple media files)
router.put('/rules/:id', upload.array('media', 10), (req, res) => {
    try {
        const whatsappClient = req.app.get('whatsappClient');
        const { id } = req.params;
        const updatedRule = req.body;

        console.log('[autoReply] PUT /rules/:id - id:', id, 'body:', updatedRule);

        const index = whatsappClient.autoReplyRules.findIndex(r => r.id === id);
        if (index === -1) {
            return res.status(404).json({ error: 'Rule not found' });
        }

        // Normalize keywords to array
        if (updatedRule.keywords) {
            let keywordsArray = [];
            if (typeof updatedRule.keywords === 'string') {
                try {
                    keywordsArray = JSON.parse(updatedRule.keywords);
                } catch {
                    keywordsArray = updatedRule.keywords.split(',').map(k => k.trim()).filter(k => k.length > 0);
                }
            } else if (Array.isArray(updatedRule.keywords)) {
                keywordsArray = updatedRule.keywords;
            }
            updatedRule.keywords = keywordsArray; // Ensure it's always an array
        }

        // Normalize isActive to boolean
        if (updatedRule.isActive !== undefined) {
            if (typeof updatedRule.isActive === 'string') {
                updatedRule.isActive = updatedRule.isActive === 'true' || updatedRule.isActive === '1';
            } else {
                updatedRule.isActive = Boolean(updatedRule.isActive);
            }
        }

        const files = Array.isArray(req.files) ? req.files : [];

        // Handle media updates (single o múltiples archivos)
        if (files && files.length > 0) {
            // New files uploaded - delete old ones and use new paths
            const oldRule = whatsappClient.autoReplyRules[index];

            // Borrar todos los archivos antiguos si existen
            if (Array.isArray(oldRule.mediaPaths) && oldRule.mediaPaths.length > 0) {
                for (const p of oldRule.mediaPaths) {
                    if (p && fs.existsSync(p)) {
                        try { fs.unlinkSync(p); } catch { }
                    }
                }
            } else if (oldRule.mediaPath && fs.existsSync(oldRule.mediaPath)) {
                try { fs.unlinkSync(oldRule.mediaPath); } catch { }
            }

            const mediaPaths = files.map(f => f.path);

            let mediaCaptions = [];
            if (updatedRule.captions) {
                try {
                    const parsed = JSON.parse(updatedRule.captions);
                    if (Array.isArray(parsed)) {
                        mediaCaptions = parsed.map(c => (typeof c === 'string' ? c : ''));
                    }
                } catch (e) {
                    // fallback a caption simple más abajo
                }
            }

            if (mediaCaptions.length === 0 && mediaPaths.length > 0) {
                const baseCaption = updatedRule.caption || '';
                mediaCaptions = mediaPaths.map(() => baseCaption);
            }

            updatedRule.mediaPaths = mediaPaths;
            updatedRule.captions = mediaCaptions;

            console.log('[autoReply] PUT /rules/:id - computed mediaPaths:', mediaPaths, 'mediaCaptions:', mediaCaptions);

            // Compatibilidad con campos antiguos de un solo archivo
            updatedRule.mediaPath = mediaPaths.length > 0 ? mediaPaths[0] : null;
            updatedRule.caption = mediaCaptions.length > 0 ? mediaCaptions[0] : (updatedRule.caption || '');

        } else if (updatedRule.existingMediaPaths) {
            // No new files, but preserve existing mediaPaths (array serializado)
            try {
                const parsed = typeof updatedRule.existingMediaPaths === 'string'
                    ? JSON.parse(updatedRule.existingMediaPaths)
                    : updatedRule.existingMediaPaths;
                if (Array.isArray(parsed)) {
                    updatedRule.mediaPaths = parsed;
                    // Compatibilidad: mediaPath simple = primer elemento
                    updatedRule.mediaPath = parsed.length > 0 ? parsed[0] : null;

                    // Parse and update captions array
                    let mediaCaptions = [];
                    if (updatedRule.captions) {
                        try {
                            const parsedCaptions = typeof updatedRule.captions === 'string'
                                ? JSON.parse(updatedRule.captions)
                                : updatedRule.captions;
                            if (Array.isArray(parsedCaptions)) {
                                mediaCaptions = parsedCaptions.map(c => (typeof c === 'string' ? c : ''));
                            }
                        } catch (e) {
                            console.warn('[autoReply] Error parsing captions:', e);
                        }
                    }

                    // Ensure captions array matches mediaPaths length
                    while (mediaCaptions.length < parsed.length) {
                        mediaCaptions.push('');
                    }

                    updatedRule.captions = mediaCaptions;
                    updatedRule.caption = mediaCaptions.length > 0 ? mediaCaptions[0] : '';

                    console.log('[autoReply] PUT /rules/:id - preserving existing media with updated captions:', {
                        mediaPaths: updatedRule.mediaPaths,
                        captions: updatedRule.captions
                    });
                }
            } catch (e) {
                console.warn('[autoReply] Error parsing existingMediaPaths:', e);
            }
            delete updatedRule.existingMediaPaths;
        } else if (updatedRule.existingMediaPath) {
            // Compatibilidad antigua: un solo mediaPath preservado
            updatedRule.mediaPath = updatedRule.existingMediaPath;
            delete updatedRule.existingMediaPath;
        } else if (updatedRule.caption !== undefined) {
            // Caption updated but no file change - preserve existing media
            const oldRule = whatsappClient.autoReplyRules[index];
            updatedRule.mediaPath = oldRule.mediaPath;
            if (Array.isArray(oldRule.mediaPaths)) {
                updatedRule.mediaPaths = oldRule.mediaPaths;
            }
        }

        // Merge with existing rule to preserve all fields
        const existingRule = whatsappClient.autoReplyRules[index];
        const mergedRule = {
            ...existingRule,
            ...updatedRule,
            keywords: updatedRule.keywords || existingRule.keywords,
            id: existingRule.id, // Preserve ID
            mediaPath: updatedRule.mediaPath !== undefined ? updatedRule.mediaPath : existingRule.mediaPath,
            mediaPaths: updatedRule.mediaPaths !== undefined ? updatedRule.mediaPaths : existingRule.mediaPaths,
            captions: updatedRule.captions !== undefined ? updatedRule.captions : existingRule.captions,
            type: updatedRule.type !== undefined ? updatedRule.type : (existingRule.type || 'simple'),
            menuId: updatedRule.menuId !== undefined ? updatedRule.menuId : existingRule.menuId
        };

        whatsappClient.autoReplyRules[index] = mergedRule;
        whatsappClient.saveAutoReplyRules();

        // Normalize keywords and isActive before sending response
        const normalizedRule = { ...mergedRule };
        if (normalizedRule.keywords && typeof normalizedRule.keywords === 'string') {
            try {
                normalizedRule.keywords = JSON.parse(normalizedRule.keywords);
            } catch {
                normalizedRule.keywords = normalizedRule.keywords.split(',').map(k => k.trim()).filter(k => k.length > 0);
            }
        }
        if (!Array.isArray(normalizedRule.keywords)) {
            normalizedRule.keywords = [];
        }
        // Ensure isActive is a boolean
        if (normalizedRule.isActive !== undefined) {
            normalizedRule.isActive = Boolean(normalizedRule.isActive);
        } else {
            normalizedRule.isActive = true; // Default to true if not set
        }

        res.json({ success: true, rule: normalizedRule });
    } catch (error) {
        console.error('Error updating rule:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/auto-reply/rules/:id - Delete rule
router.delete('/rules/:id', (req, res) => {
    try {
        const whatsappClient = req.app.get('whatsappClient');
        const { id } = req.params;

        const index = whatsappClient.autoReplyRules.findIndex(r => r.id === id);
        if (index === -1) {
            return res.status(404).json({ error: 'Rule not found' });
        }

        // Delete associated media file if exists
        const rule = whatsappClient.autoReplyRules[index];
        if (rule.mediaPath && fs.existsSync(rule.mediaPath)) {
            try {
                fs.unlinkSync(rule.mediaPath);
                console.log(`Deleted media file: ${rule.mediaPath}`);
            } catch (error) {
                console.warn(`Could not delete media file: ${rule.mediaPath}`, error);
            }
        }

        whatsappClient.autoReplyRules.splice(index, 1);
        whatsappClient.saveAutoReplyRules();

        res.json({ success: true, message: 'Rule deleted successfully' });
    } catch (error) {
        console.error('Error deleting rule:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/auto-reply/rules/import - Import rules from JSON (with automatic media file copying)
router.post('/rules/import', express.json(), (req, res) => {
    try {
        const whatsappClient = req.app.get('whatsappClient');
        const { rules } = req.body;

        if (!Array.isArray(rules)) {
            return res.status(400).json({ error: 'Rules must be an array' });
        }

        const uploadDir = process.env.UPLOAD_DIR || './uploads';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        const results = {
            success: 0,
            failed: 0,
            errors: [],
            rules: []
        };

        for (const rule of rules) {
            try {
                if (!rule.name || !rule.keywords || !Array.isArray(rule.keywords)) {
                    results.failed++;
                    results.errors.push(`${rule.name || 'Regla sin nombre'}: Campos requeridos faltantes`);
                    continue;
                }

                // Normalize keywords
                let keywordsArray = [];
                if (Array.isArray(rule.keywords)) {
                    keywordsArray = rule.keywords;
                } else if (typeof rule.keywords === 'string') {
                    try {
                        keywordsArray = JSON.parse(rule.keywords);
                    } catch {
                        keywordsArray = rule.keywords.split(',').map(k => k.trim()).filter(k => k.length > 0);
                    }
                }

                // Handle media file copying
                let mediaPath = null;
                if (rule.mediaPath) {
                    const originalPath = rule.mediaPath;
                    let sourcePath = null;

                    // Try multiple path resolutions
                    // 1. Try absolute path as-is
                    if (fs.existsSync(originalPath)) {
                        sourcePath = originalPath;
                    }
                    // 2. Try relative to current working directory
                    else if (fs.existsSync(path.resolve(originalPath))) {
                        sourcePath = path.resolve(originalPath);
                    }
                    // 3. Try relative to uploads directory (just filename)
                    else {
                        const fileName = path.basename(originalPath);
                        const relativePath = path.join(uploadDir, fileName);
                        if (fs.existsSync(relativePath)) {
                            sourcePath = relativePath;
                        }
                    }

                    // If we found the source file, copy it
                    if (sourcePath) {
                        try {
                            const ext = path.extname(sourcePath);
                            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                            const newFileName = uniqueSuffix + ext;
                            const newPath = path.join(uploadDir, newFileName);

                            // Copy file to uploads directory
                            fs.copyFileSync(sourcePath, newPath);
                            mediaPath = newPath;
                            console.log(`Copied media file from ${sourcePath} to ${newPath}`);
                        } catch (copyError) {
                            console.warn(`Could not copy media file from ${sourcePath}:`, copyError);
                            results.errors.push(`${rule.name}: No se pudo copiar el archivo de media desde ${originalPath}`);
                            // Continue without media
                        }
                    } else {
                        console.warn(`Media file not found: ${originalPath}`);
                        results.errors.push(`${rule.name}: Archivo de media no encontrado en ${originalPath}. Asegúrate de que el archivo exista en el servidor.`);
                        // Continue without media - rule will be created but without media
                    }
                }

                // Create rule
                const newRule = {
                    id: Date.now().toString() + '-' + Math.round(Math.random() * 1E9),
                    name: rule.name,
                    keywords: keywordsArray,
                    response: rule.response || '',
                    matchType: rule.matchType || 'contains',
                    delay: rule.delay || 2,
                    isActive: rule.isActive !== undefined ? rule.isActive : true,
                    mediaPath: mediaPath,
                    caption: rule.caption || ''
                };

                whatsappClient.autoReplyRules.push(newRule);
                results.success++;
                results.rules.push(newRule);
            } catch (error) {
                results.failed++;
                results.errors.push(`${rule.name || 'Regla desconocida'}: ${error.message}`);
                console.error('Error importing rule:', error);
            }
        }

        // Save all rules
        whatsappClient.saveAutoReplyRules();

        res.json({
            success: results.success > 0,
            imported: results.success,
            failed: results.failed,
            errors: results.errors,
            rules: results.rules
        });
    } catch (error) {
        console.error('Error importing rules:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
