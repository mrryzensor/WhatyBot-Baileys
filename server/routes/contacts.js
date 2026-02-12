import express from 'express';
import axios from 'axios';
import archiver from 'archiver';
import path from 'path';

const router = express.Router();

// GET /api/contacts - Get all WhatsApp contacts (optionally filtered by groups)
router.get('/', async (req, res) => {
    try {
        const sessionManager = req.app.get('sessionManager');
        // Get groupIds from query parameter (comma-separated string)
        const groupIdsParam = req.query.groupIds;
        const groupIds = groupIdsParam ? groupIdsParam.split(',') : null;

        // Pass null as sessionId to let sessionManager find an active session
        // Or if we had req.sessionId from middleware, pass that.
        const contacts = await sessionManager.getContacts(null, groupIds);
        res.json({ success: true, contacts });
    } catch (error) {
        console.error('Error getting contacts:', error);
        res.status(500).json({ error: error.message });
    }
});

// Helper to download and zip images in parallel
async function downloadAndZip(contactsWithImages, res) {
    if (contactsWithImages.length === 0) {
        return res.status(404).json({ error: 'No se encontraron contactos con imagen de perfil' });
    }

    const archive = archiver('zip', { zlib: { level: 5 } });
    res.attachment(`fotos_perfil_${new Date().getTime()}.zip`);
    archive.pipe(res);

    console.log(`[ExportPhotos] Starting parallel export for ${contactsWithImages.length} images`);

    // Download in chunks of 10 to be faster but not overwhelm the server/network
    const CONCURRENCY = 10;
    for (let i = 0; i < contactsWithImages.length; i += CONCURRENCY) {
        const chunk = contactsWithImages.slice(i, i + CONCURRENCY);
        await Promise.all(chunk.map(async (contact) => {
            try {
                const response = await axios({
                    url: contact.profilePicUrl,
                    method: 'GET',
                    responseType: 'arraybuffer',
                    timeout: 8000 // Increased timeout
                });

                const safePhone = contact.phone ? contact.phone.replace(/[/\\?%*:|"<>]/g, '') : 'desconocido';
                const fileName = `${safePhone}.jpg`;
                archive.append(response.data, { name: fileName });
            } catch (err) {
                console.warn(`[ExportPhotos] Failed to download image for ${contact.phone}:`, err.message);
            }
        }));
    }

    await archive.finalize();
}

// GET /api/contacts/export-photos - Legacy (slower, re-fetches contacts)
router.get('/export-photos', async (req, res) => {
    console.log('[ExportPhotos-GET] Request received');
    try {
        const sessionManager = req.app.get('sessionManager');
        const groupIdsParam = req.query.groupIds;
        const groupIds = groupIdsParam ? groupIdsParam.split(',') : null;
        const phoneNumbersParam = req.query.phones;
        const selectedPhones = phoneNumbersParam ? phoneNumbersParam.split(',') : null;

        const contacts = await sessionManager.getContacts(null, groupIds);

        const contactsToExport = selectedPhones
            ? contacts.filter(c => selectedPhones.includes(c.phone.replace('+', '')))
            : contacts;

        const contactsWithImages = contactsToExport.filter(c => c.profilePicUrl);
        await downloadAndZip(contactsWithImages, res);
    } catch (error) {
        console.error('Error exporting photos (GET):', error);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message });
        }
    }
});

// POST /api/contacts/export-photos - Fast (uses frontend-provided URLs)
router.post('/export-photos', async (req, res) => {
    const { contacts } = req.body;
    console.log(`[ExportPhotos-POST] Received ${contacts?.length || 0} contacts from frontend`);

    try {
        if (!contacts || !Array.isArray(contacts)) {
            return res.status(400).json({ error: 'Se requiere una lista de contactos' });
        }

        const contactsWithImages = contacts.filter(c => c.profilePicUrl);
        await downloadAndZip(contactsWithImages, res);
    } catch (error) {
        console.error('Error exporting photos (POST):', error);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message });
        }
    }
});

export default router;
