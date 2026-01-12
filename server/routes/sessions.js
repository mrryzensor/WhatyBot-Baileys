import express from 'express';
const router = express.Router();

// GET /api/sessions - Obtiene todas las sesiones del usuario actual
router.get('/', (req, res) => {
    try {
        const sessionManager = req.app.get('sessionManager');
        const userId = req.userId;

        if (!userId) {
            return res.status(401).json({ success: false, error: 'Usuario no autenticado' });
        }

        const isAdmin = req.headers['x-user-role'] === 'administrador';
        let sessions;

        if (isAdmin) {
            sessions = sessionManager.getAllSessions();
        } else {
            sessions = sessionManager.getUserSessions(userId);
        }

        res.json({ success: true, sessions });
    } catch (error) {
        console.error('[SessionsRoute] Error getting sessions:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/sessions - Crea una nueva sesión
router.post('/', async (req, res) => {
    try {
        const sessionManager = req.app.get('sessionManager');
        const userId = req.userId;

        if (!userId) {
            return res.status(401).json({ success: false, error: 'Usuario no autenticado' });
        }

        const result = await sessionManager.createSession(userId);
        res.json(result);
    } catch (error) {
        console.error('[SessionsRoute] Error creating session:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/sessions/:sessionId/initialize - Inicializa una sesión específica
router.post('/:sessionId/initialize', async (req, res) => {
    try {
        const sessionManager = req.app.get('sessionManager');
        const { sessionId } = req.params;

        const result = await sessionManager.initializeSession(sessionId);
        res.json(result);
    } catch (error) {
        console.error('[SessionsRoute] Error initializing session:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/sessions/:sessionId/qr - Obtiene el QR de una sesión
router.get('/:sessionId/qr', (req, res) => {
    try {
        const sessionManager = req.app.get('sessionManager');
        const { sessionId } = req.params;

        const qr = sessionManager.getSessionQR(sessionId);
        if (qr) {
            res.json({ success: true, qr });
        } else {
            res.json({ success: false, error: 'QR no disponible' });
        }
    } catch (error) {
        console.error('[SessionsRoute] Error getting QR:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE /api/sessions/:sessionId - Elimina una sesión
router.delete('/:sessionId', async (req, res) => {
    try {
        const sessionManager = req.app.get('sessionManager');
        const { sessionId } = req.params;

        const result = await sessionManager.destroySession(sessionId);
        res.json(result);
    } catch (error) {
        console.error('[SessionsRoute] Error deleting session:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
