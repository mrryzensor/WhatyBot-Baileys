import express from 'express';

const router = express.Router();

// GET /api/contacts - Get all WhatsApp contacts
router.get('/', async (req, res) => {
    try {
        const whatsappClient = req.app.get('whatsappClient');
        const contacts = await whatsappClient.getContacts();
        res.json({ success: true, contacts });
    } catch (error) {
        console.error('Error getting contacts:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
