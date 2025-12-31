import express from 'express';

const router = express.Router();

// GET /api/contacts - Get all WhatsApp contacts (optionally filtered by groups)
router.get('/', async (req, res) => {
    try {
        const whatsappClient = req.app.get('whatsappClient');
        // Get groupIds from query parameter (comma-separated string)
        const groupIdsParam = req.query.groupIds;
        const groupIds = groupIdsParam ? groupIdsParam.split(',') : null;

        const contacts = await whatsappClient.getContacts(groupIds);
        res.json({ success: true, contacts });
    } catch (error) {
        console.error('Error getting contacts:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
