import express from 'express';

const router = express.Router();

// GET /api/status - Get connection status
router.get('/status', (req, res) => {
    try {
        const whatsappClient = req.app.get('whatsappClient');
        const status = whatsappClient.getStatus();
        res.json({ success: true, ...status });
    } catch (error) {
        console.error('Error getting status:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/qr - Get current QR data URL (fallback for clients)
router.get('/qr', (req, res) => {
    try {
        const whatsappClient = req.app.get('whatsappClient');
        const qr = whatsappClient.getQrCode();
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
        const whatsappClient = req.app.get('whatsappClient');
        res.json({ success: true, config: whatsappClient.config });
    } catch (error) {
        console.error('Error getting config:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/config - Update configuration
router.post('/config', (req, res) => {
    try {
        const whatsappClient = req.app.get('whatsappClient');
        const newConfig = req.body;

        whatsappClient.config = { ...whatsappClient.config, ...newConfig };
        whatsappClient.saveConfig();

        res.json({ success: true, config: whatsappClient.config });
    } catch (error) {
        console.error('Error updating config:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/initialize - Initialize WhatsApp client
router.post('/initialize', async (req, res) => {
    try {
        const whatsappClient = req.app.get('whatsappClient');

        // Check if already initialized and ready
        if (whatsappClient.client && whatsappClient.isReady) {
            return res.json({ success: true, message: 'Already initialized' });
        }

        // If client exists but not ready (e.g. disconnected or stuck), destroy it first
        if (whatsappClient.client) {
            console.log('Client exists but not ready, destroying before re-init...');
            await whatsappClient.destroy();
        }

        // Initialize the client
        console.log('Initializing WhatsApp client from API request...');
        await whatsappClient.initialize();

        res.json({ success: true, message: 'WhatsApp client initialized' });
    } catch (error) {
        console.error('Error initializing:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/logout - Logout and clear session
router.post('/logout', async (req, res) => {
    try {
        const whatsappClient = req.app.get('whatsappClient');
        await whatsappClient.destroy();

        res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        console.error('Error logging out:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/reset-session - Clear session and reinitialize client (forces new QR)
router.post('/reset-session', async (req, res) => {
    try {
        const whatsappClient = req.app.get('whatsappClient');
        console.log('🔁 Resetting WhatsApp session (manual request)...');
        await whatsappClient.resetSession();
        res.json({ success: true, message: 'Session cleared. Please scan the new QR.' });
    } catch (error) {
        console.error('Error resetting session:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
