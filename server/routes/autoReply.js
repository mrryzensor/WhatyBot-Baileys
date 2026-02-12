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
        const allowedTypes = /jpeg|jpg|png|gif|mp4|avi|mov|pdf|doc|docx|xls|xlsx|mp3|wav|ogg|webp|zip|json/;
        if (allowedTypes.test(path.extname(file.originalname).toLowerCase()) && allowedTypes.test(file.mimetype)) {
            return cb(null, true);
        }
        cb(new Error('Invalid file type'));
    }
});

// GET /api/auto-reply/rules - Get all auto-reply rules
router.get('/rules', (req, res) => {
    try {
        const sessionManager = req.app.get('sessionManager');
        const sessionId = getSessionId(req);

        if (!sessionId) {
            // Return empty rules if no session is active, or error?
            // For now return empty list to avoid UI breaking
            return res.json({ success: true, rules: [] });
        }

        const client = sessionManager.getSessionClient(sessionId);
        if (!client) {
            return res.json({ success: true, rules: [] });
        }

        const normalizedRules = client.autoReplyRules.map(rule => {
            const normalizedRule = { ...rule };
            if (normalizedRule.keywords && typeof normalizedRule.keywords === 'string') {
                try {
                    normalizedRule.keywords = JSON.parse(normalizedRule.keywords);
                } catch {
                    normalizedRule.keywords = normalizedRule.keywords.split(',').map(k => k.trim()).filter(k => k.length > 0);
                }
            }
            if (!Array.isArray(normalizedRule.keywords)) normalizedRule.keywords = [];

            // Normalize isActive
            if (normalizedRule.isActive !== undefined) {
                normalizedRule.isActive = Boolean(normalizedRule.isActive);
            } else {
                normalizedRule.isActive = true;
            }
            return normalizedRule;
        });
        res.json({ success: true, rules: normalizedRules });
    } catch (error) {
        console.error('Error getting rules:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/auto-reply/rules - Create new rule
router.post('/rules', upload.array('media', 10), (req, res) => {
    try {
        const sessionManager = req.app.get('sessionManager');
        const sessionId = getSessionId(req);
        if (!sessionId) return res.status(400).json({ error: 'No active WhatsApp session' });

        const client = sessionManager.getSessionClient(sessionId);
        if (!client) return res.status(400).json({ error: 'WhatsApp client not found' });

        const rule = req.body;
        if (!rule.name || !rule.keywords) {
            return res.status(400).json({ error: 'Missing required fields: name, keywords' });
        }

        const files = Array.isArray(req.files) ? req.files : [];

        if (rule.type === 'menu' && !rule.menuId) {
            return res.status(400).json({ error: 'Menu-type rules require menuId' });
        } else if (rule.type !== 'menu' && !rule.response && (!files || files.length === 0) && !rule.mediaPaths) {
            return res.status(400).json({ error: 'Missing required field: response or media' });
        }

        let keywordsArray = [];
        if (typeof rule.keywords === 'string') {
            try { keywordsArray = JSON.parse(rule.keywords); }
            catch { keywordsArray = rule.keywords.split(',').map(k => k.trim()).filter(k => k.length > 0); }
        } else if (Array.isArray(rule.keywords)) {
            keywordsArray = rule.keywords;
        }

        rule.id = Date.now().toString();
        rule.keywords = keywordsArray;

        if (rule.countries) {
            try {
                rule.countries = typeof rule.countries === 'string' ? JSON.parse(rule.countries) : rule.countries;
            } catch (e) {
                rule.countries = [];
            }
        }

        // Convert absolute paths to relative paths (relative to server directory)
        let mediaPaths = files.map(f => {
            const relativePath = path.relative(process.cwd(), f.path);
            return relativePath.replace(/\\/g, '/'); // Normalize to forward slashes
        });

        let mediaCaptions = [];
        if (rule.captions) {
            try {
                const parsed = typeof rule.captions === 'string' ? JSON.parse(rule.captions) : rule.captions;
                if (Array.isArray(parsed)) mediaCaptions = parsed.map(c => (typeof c === 'string' ? c : ''));
            } catch (e) { }
        }

        // Support for duplicating media (if no new files, use existing paths in rule)
        if (files.length === 0 && rule.mediaPaths) {
            try {
                const existing = typeof rule.mediaPaths === 'string' ? JSON.parse(rule.mediaPaths) : rule.mediaPaths;
                if (Array.isArray(existing)) {
                    mediaPaths = existing;
                }
            } catch (e) { }
        }

        if (mediaCaptions.length === 0 && mediaPaths.length > 0) {
            mediaCaptions = mediaPaths.map(() => rule.caption || '');
        }

        rule.mediaPaths = mediaPaths;
        rule.captions = mediaCaptions;
        rule.mediaPath = mediaPaths[0] || null;
        rule.caption = mediaCaptions[0] || (rule.caption || '');

        if (rule.isActive !== undefined) {
            rule.isActive = (String(rule.isActive) === 'true' || rule.isActive === true || rule.isActive === '1');
        } else {
            rule.isActive = true;
        }

        rule.type = rule.type || 'simple';

        client.autoReplyRules.push(rule);
        client.saveAutoReplyRules();

        const normalizedRule = { ...rule, isActive: Boolean(rule.isActive) };
        res.json({ success: true, rule: normalizedRule });

    } catch (error) {
        console.error('Error creating rule:', error);
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/auto-reply/rules/:id - Update rule
router.put('/rules/:id', upload.array('media', 10), (req, res) => {
    try {
        const sessionManager = req.app.get('sessionManager');
        const sessionId = getSessionId(req);
        if (!sessionId) return res.status(400).json({ error: 'No active WhatsApp session' });

        const client = sessionManager.getSessionClient(sessionId);
        if (!client) return res.status(400).json({ error: 'WhatsApp client not found' });

        const { id } = req.params;
        const updatedRule = req.body;

        const index = client.autoReplyRules.findIndex(r => String(r.id) === String(id));
        if (index === -1) return res.status(404).json({ error: 'Rule not found' });

        if (updatedRule.keywords) {
            let keywordsArray = [];
            if (typeof updatedRule.keywords === 'string') {
                try { keywordsArray = JSON.parse(updatedRule.keywords); }
                catch { keywordsArray = updatedRule.keywords.split(',').map(k => k.trim()).filter(k => k.length > 0); }
            } else if (Array.isArray(updatedRule.keywords)) {
                keywordsArray = updatedRule.keywords;
            }
            updatedRule.keywords = keywordsArray;
        }

        if (updatedRule.isActive !== undefined) {
            updatedRule.isActive = (String(updatedRule.isActive) === 'true' || updatedRule.isActive === true || updatedRule.isActive === '1');
        }

        if (updatedRule.countries) {
            try {
                updatedRule.countries = typeof updatedRule.countries === 'string' ? JSON.parse(updatedRule.countries) : updatedRule.countries;
            } catch (e) {
                updatedRule.countries = [];
            }
        }

        const files = Array.isArray(req.files) ? req.files : [];

        // First, handle existing media paths (this is the source of truth from frontend)
        let currentMediaPaths = [];
        let currentCaptions = [];

        if (updatedRule.existingMediaPaths) {
            try {
                const parsed = typeof updatedRule.existingMediaPaths === 'string'
                    ? JSON.parse(updatedRule.existingMediaPaths)
                    : updatedRule.existingMediaPaths;
                if (Array.isArray(parsed)) {
                    currentMediaPaths = parsed;
                }
            } catch (e) {
                console.error('Error parsing existingMediaPaths:', e);
            }
            delete updatedRule.existingMediaPaths;
        }

        if (updatedRule.captions) {
            try {
                const parsedC = typeof updatedRule.captions === 'string'
                    ? JSON.parse(updatedRule.captions)
                    : updatedRule.captions;
                if (Array.isArray(parsedC)) {
                    currentCaptions = parsedC.map(c => (typeof c === 'string' ? c : ''));
                }
            } catch (e) {
                console.error('Error parsing captions:', e);
            }
        }

        // Add newly uploaded files
        if (files && files.length > 0) {
            // Convert absolute paths to relative paths (relative to server directory)
            const newMediaPaths = files.map(f => {
                const relativePath = path.relative(process.cwd(), f.path);
                return relativePath.replace(/\\/g, '/'); // Normalize to forward slashes
            });
            currentMediaPaths = [...currentMediaPaths, ...newMediaPaths];

            // Add empty captions for new files or use provided caption
            const newCaptions = files.map(() => updatedRule.caption || '');
            currentCaptions = [...currentCaptions, ...newCaptions];
        }

        // Update the rule with the final media paths and captions
        updatedRule.mediaPaths = currentMediaPaths;
        updatedRule.captions = currentCaptions;
        updatedRule.mediaPath = currentMediaPaths[0] || null;
        updatedRule.caption = currentCaptions[0] || '';

        // Clean up old fields
        if (updatedRule.existingMediaPath) {
            delete updatedRule.existingMediaPath;
        }

        const existingRule = client.autoReplyRules[index];
        const mergedRule = {
            ...existingRule,
            ...updatedRule,
            keywords: updatedRule.keywords || existingRule.keywords,
            id: existingRule.id,
            mediaPath: updatedRule.mediaPath !== undefined ? updatedRule.mediaPath : existingRule.mediaPath,
            mediaPaths: updatedRule.mediaPaths !== undefined ? updatedRule.mediaPaths : existingRule.mediaPaths,
            captions: updatedRule.captions !== undefined ? updatedRule.captions : existingRule.captions,
            type: updatedRule.type !== undefined ? updatedRule.type : (existingRule.type || 'simple'),
            menuId: updatedRule.menuId !== undefined ? updatedRule.menuId : existingRule.menuId,
            countries: updatedRule.countries !== undefined ? updatedRule.countries : (existingRule.countries || [])
        };

        client.autoReplyRules[index] = mergedRule;
        client.saveAutoReplyRules();

        // Limpiar archivos huérfanos después de actualizar
        const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
        cleanSessionOrphanedFiles(client, uploadDir);

        const normalizedRule = { ...mergedRule };
        if (normalizedRule.keywords && typeof normalizedRule.keywords === 'string') {
            try { normalizedRule.keywords = JSON.parse(normalizedRule.keywords); } catch { normalizedRule.keywords = []; }
        }
        normalizedRule.isActive = Boolean(normalizedRule.isActive);

        res.json({ success: true, rule: normalizedRule });
    } catch (error) {
        console.error('Error updating rule:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/auto-reply/rules/:id
router.delete('/rules/:id', (req, res) => {
    try {
        const sessionManager = req.app.get('sessionManager');
        const sessionId = getSessionId(req);
        if (!sessionId) return res.status(400).json({ error: 'No active WhatsApp session' });

        const client = sessionManager.getSessionClient(sessionId);
        if (!client) return res.status(400).json({ error: 'WhatsApp client not found' });

        const { id } = req.params;
        const index = client.autoReplyRules.findIndex(r => String(r.id) === String(id));
        if (index === -1) return res.status(404).json({ error: 'Rule not found' });

        const rule = client.autoReplyRules[index];

        // Eliminar archivos multimedia de la regla (maneja mediaPaths y mediaPath)
        deleteItemMediaFiles(rule);

        // Eliminar la regla
        client.autoReplyRules.splice(index, 1);
        client.saveAutoReplyRules();

        // Limpiar archivos huérfanos
        const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
        cleanSessionOrphanedFiles(client, uploadDir);

        res.json({ success: true, message: 'Rule deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/auto-reply/export - Export rules with media files as ZIP
router.get('/export', async (req, res) => {
    console.log('[Export Rules] ========== EXPORT RULES ENDPOINT CALLED ==========');
    try {
        console.log('[Export Rules] Step 1: Getting session manager');
        const sessionManager = req.app.get('sessionManager');
        const sessionId = getSessionId(req);
        console.log('[Export Rules] Step 2: Session ID:', sessionId);
        const client = sessionId ? sessionManager.getSessionClient(sessionId) : null;
        console.log('[Export Rules] Step 3: Client:', client ? 'Found' : 'Not found');

        const rules = client ? client.autoReplyRules : [];
        console.log('[Export Rules] Step 4: Rules count:', rules.length);

        if (rules.length === 0) {
            console.log('[Export Rules] No rules to export, returning empty JSON');
            return res.json({
                success: true,
                rules: [],
                exportDate: new Date().toISOString(),
                count: 0
            });
        }

        console.log(`[Export Rules] Exporting ${rules.length} rules`);
        rules.forEach((rule, i) => {
            console.log(`[Export Rules] Rule ${i}: ${rule.name}, mediaPaths:`, rule.mediaPaths, 'mediaPath:', rule.mediaPath);
        });

        console.log('[Export Rules] Step 5: Collecting media files');
        const mediaFiles = new Set();
        rules.forEach(rule => {
            if (rule.mediaPaths && Array.isArray(rule.mediaPaths)) {
                rule.mediaPaths.forEach(p => {
                    if (p && !p.startsWith('http')) {
                        mediaFiles.add(p);
                    }
                });
            } else if (rule.mediaPath && !rule.mediaPath.startsWith('http')) {
                mediaFiles.add(rule.mediaPath);
            }
        });

        console.log(`[Export Rules] Found ${mediaFiles.size} media files:`, Array.from(mediaFiles));

        console.log('[Export Rules] Step 6: Creating ZIP archive');
        // Always create ZIP (even if no media files)
        const archiver = (await import('archiver')).default;
        const archive = archiver('zip', { zlib: { level: 9 } });

        console.log('[Export Rules] Step 7: Setting response headers');
        res.attachment('auto-reply-rules-export.zip');
        archive.pipe(res);

        console.log('[Export Rules] Step 8: Adding JSON file to ZIP');
        // Add JSON file
        const jsonData = {
            rules,
            exportDate: new Date().toISOString(),
            count: rules.length,
            version: '1.0'
        };
        archive.append(JSON.stringify(jsonData, null, 2), { name: 'rules.json' });

        console.log('[Export Rules] Step 9: Adding media files to ZIP');
        // Add media files if any
        for (const mediaPath of mediaFiles) {
            const fullPath = path.isAbsolute(mediaPath) ? mediaPath : path.join(process.cwd(), mediaPath);
            if (fs.existsSync(fullPath)) {
                const fileName = path.basename(mediaPath);
                console.log(`[Export Rules] Adding media file: ${fileName} from ${fullPath}`);
                archive.file(fullPath, { name: `media/${fileName}` });
            } else {
                console.warn(`[Export Rules] Media file not found: ${fullPath}`);
            }
        }

        console.log('[Export Rules] Step 10: Finalizing ZIP archive');
        archive.finalize();
        console.log('[Export Rules] ========== EXPORT COMPLETED SUCCESSFULLY ==========');
    } catch (error) {
        console.error('[Export Rules] ERROR:', error);
        console.error('[Export Rules] Error stack:', error.stack);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/auto-reply/rules/import - Import rules from ZIP or JSON
router.post('/rules/import', upload.single('file'), async (req, res) => {
    try {
        const sessionManager = req.app.get('sessionManager');
        const sessionId = getSessionId(req);
        if (!sessionId) return res.status(400).json({ error: 'No active WhatsApp session' });

        const client = sessionManager.getSessionClient(sessionId);
        if (!client) return res.status(400).json({ error: 'WhatsApp client not found' });

        let rulesData;

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
                    if (file.path === 'rules.json') {
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
                    return res.status(400).json({ error: 'Invalid ZIP file: rules.json not found' });
                }

                rulesData = jsonContent.rules || [];

                // Clean up uploaded ZIP file
                fs.unlinkSync(filePath);
            } else if (ext === '.json') {
                // Handle JSON file
                const content = fs.readFileSync(filePath, 'utf8');
                const parsed = JSON.parse(content);
                rulesData = Array.isArray(parsed) ? parsed : (parsed.rules || []);

                // Clean up uploaded file
                fs.unlinkSync(filePath);
            } else {
                fs.unlinkSync(filePath);
                return res.status(400).json({ error: 'Invalid file type. Please upload a .zip or .json file' });
            }
        } else if (req.body.rules) {
            // Handle JSON body (legacy support)
            rulesData = req.body.rules;
        } else {
            return res.status(400).json({ error: 'No file or data provided' });
        }

        if (!Array.isArray(rulesData)) {
            return res.status(400).json({ error: 'Rules must be an array' });
        }

        const uploadDir = process.env.UPLOAD_DIR || './uploads';
        const results = { success: 0, failed: 0, replaced: 0, errors: [], rules: [] };

        // Check if we should apply to all sessions
        const applyToAllSessions = req.body.applyToAllSessions === 'true';

        // Get all sessions if applyToAllSessions is true
        const sessionsToUpdate = applyToAllSessions
            ? Array.from(sessionManager.sessions.values()).map(s => s.client)
            : [client];

        console.log(`[Import] Applying to ${sessionsToUpdate.length} session(s)`);

        for (const rule of rulesData) {
            try {
                if (!rule.name || !rule.keywords) {
                    results.failed++;
                    results.errors.push(`Rule "${rule.name || 'unnamed'}": Missing required fields`);
                    continue;
                }

                let keywordsArray = Array.isArray(rule.keywords) ? rule.keywords : (typeof rule.keywords === 'string' ? rule.keywords.split(',').map(k => k.trim()) : []);

                // Update media paths to point to correct location
                let mediaPaths = [];
                if (rule.mediaPaths && Array.isArray(rule.mediaPaths)) {
                    mediaPaths = rule.mediaPaths.map(p => {
                        if (p && !p.startsWith('http')) {
                            const fileName = path.basename(p);
                            return path.join(uploadDir, fileName);
                        }
                        return p;
                    });
                } else if (rule.mediaPath && !rule.mediaPath.startsWith('http')) {
                    const fileName = path.basename(rule.mediaPath);
                    mediaPaths = [path.join(uploadDir, fileName)];
                }

                // If this is a menu-type rule, try to find the menu by name and update menuId
                let finalMenuId = rule.menuId;
                if (rule.type === 'menu' && rule.menuId) {
                    // Try to find menu in the first session (they should all have the same menus)
                    const firstSession = sessionsToUpdate[0];
                    const menuByName = firstSession.interactiveMenus.find(m =>
                        m.name === 'Principal' || // Try common menu names
                        m.isActive
                    );

                    // If we can't find by name, try to find by the old menuId
                    const menuById = firstSession.interactiveMenus.find(m => String(m.id) === String(rule.menuId));

                    if (!menuById && menuByName) {
                        console.log(`[Import] Updating menuId for rule "${rule.name}" from ${rule.menuId} to ${menuByName.id}`);
                        finalMenuId = menuByName.id;
                    } else if (menuById) {
                        finalMenuId = menuById.id;
                    }
                }

                // Apply to each session
                sessionsToUpdate.forEach((sessionClient, sessionIndex) => {
                    // Check if a rule with the same name already exists
                    const existingIndex = sessionClient.autoReplyRules.findIndex(r => r.name === rule.name);

                    if (existingIndex !== -1) {
                        // Replace existing rule
                        const existingRule = sessionClient.autoReplyRules[existingIndex];
                        const updatedRule = {
                            id: existingRule.id, // Keep the same ID
                            name: rule.name,
                            keywords: keywordsArray,
                            response: rule.response || '',
                            matchType: rule.matchType || 'contains',
                            delay: rule.delay || 2,
                            isActive: rule.isActive !== undefined ? rule.isActive : true,
                            mediaPaths: mediaPaths,
                            mediaPath: mediaPaths[0] || null,
                            captions: rule.captions || [],
                            caption: (rule.captions && rule.captions[0]) || rule.caption || '',
                            type: rule.type || 'simple',
                            menuId: finalMenuId || null
                        };
                        sessionClient.autoReplyRules[existingIndex] = updatedRule;

                        // Only count once (for the first session)
                        if (sessionIndex === 0) {
                            results.replaced++;
                            results.rules.push(updatedRule);
                            console.log(`[Import] Replaced existing rule: ${rule.name}`);
                        }
                    } else {
                        // Create new rule
                        const newRule = {
                            id: Date.now().toString() + '-' + Math.round(Math.random() * 1E9),
                            name: rule.name,
                            keywords: keywordsArray,
                            response: rule.response || '',
                            matchType: rule.matchType || 'contains',
                            delay: rule.delay || 2,
                            isActive: rule.isActive !== undefined ? rule.isActive : true,
                            mediaPaths: mediaPaths,
                            mediaPath: mediaPaths[0] || null,
                            captions: rule.captions || [],
                            caption: (rule.captions && rule.captions[0]) || rule.caption || '',
                            type: rule.type || 'simple',
                            menuId: finalMenuId || null
                        };
                        sessionClient.autoReplyRules.push(newRule);

                        // Only count once (for the first session)
                        if (sessionIndex === 0) {
                            results.success++;
                            results.rules.push(newRule);
                            console.log(`[Import] Created new rule: ${rule.name}`);
                        }
                    }
                });
            } catch (e) {
                results.failed++;
                results.errors.push(`Rule "${rule.name || 'unnamed'}": ${e.message}`);
            }
        }

        // Save all updated sessions
        sessionsToUpdate.forEach(sessionClient => {
            sessionClient.saveAutoReplyRules();
        });

        res.json({ success: results.success > 0, ...results });
    } catch (error) {
        console.error('Error importing rules:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
