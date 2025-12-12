import express from 'express';
import { userService, messageCountService, validationService, subscriptionLimitsService, subscriptionContactLinksService, getSubscriptionLimitsFromDB } from '../database.js';

const router = express.Router();

// Middleware para verificar si el usuario es administrador
const requireAdmin = async (req, res, next) => {
    try {
        const currentUser = await userService.getCurrentUser();
        const isAdmin = (currentUser?.subscription_type || '').toString().toLowerCase() === 'administrador';
        if (!currentUser || !isAdmin) {
            return res.status(403).json({ error: 'Acceso denegado. Solo administradores pueden acceder a esta funcionalidad.' });
        }
        next();
    } catch (error) {
        console.error('Error en requireAdmin:', error);
        res.status(500).json({ error: error.message });
    }
};

// GET /api/users - Get all users (admin only)
router.get('/', requireAdmin, async (req, res) => {
    try {
        const users = await userService.getAllUsers();
        res.json({ success: true, users });
    } catch (error) {
        console.error('Error getting users:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/users/current - Get current user
router.get('/current', async (req, res) => {
    try {
        const user = await userService.getCurrentUser();
        const subscriptionInfo = await validationService.getSubscriptionInfo(user.id);
        res.json({ success: true, user, subscriptionInfo });
    } catch (error) {
        console.error('Error getting current user:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/users/bulk - Delete multiple users (admin only) - MUST be before /:id
router.delete('/bulk', requireAdmin, async (req, res) => {
    try {
        const { userIds } = req.body;
        
        if (!Array.isArray(userIds) || userIds.length === 0) {
            return res.status(400).json({ error: 'userIds must be a non-empty array' });
        }

        const results = { success: 0, failed: 0, errors: [] };
        
        for (const userId of userIds) {
            try {
                const parsedId = parseInt(userId);
                if (isNaN(parsedId)) {
                    results.failed++;
                    results.errors.push(`User ${userId}: Invalid ID`);
                    continue;
                }
                await userService.deleteUser(parsedId);
                results.success++;
            } catch (error) {
                results.failed++;
                results.errors.push(`User ${userId}: ${error.message}`);
            }
        }

        res.json({ 
            success: true, 
            message: `Deleted ${results.success} user(s)`,
            results 
        });
    } catch (error) {
        console.error('Error deleting users:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/users/:id - Get user by ID
router.get('/:id', async (req, res) => {
    try {
        const user = await userService.getUserById(parseInt(req.params.id));
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        const subscriptionInfo = await validationService.getSubscriptionInfo(user.id);
        res.json({ success: true, user, subscriptionInfo });
    } catch (error) {
        console.error('Error getting user:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/users - Create new user (admin only)
router.post('/', requireAdmin, async (req, res) => {
    try {
        const { username, email, subscriptionType, password, subscriptionStartDate, subscriptionEndDate } = req.body;
        
        if (!username) {
            return res.status(400).json({ error: 'Username is required' });
        }

        const limits = await getSubscriptionLimitsFromDB();
        if (!limits[subscriptionType || 'gratuito']) {
            return res.status(400).json({ error: 'Invalid subscription type' });
        }

        // Use default password if not provided
        const userPassword = password || '2748curso';
        const user = await userService.createUser(
            username,
            email,
            subscriptionType || 'gratuito',
            userPassword,
            subscriptionStartDate || null,
            subscriptionEndDate || null
        );
        res.json({ success: true, user });
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/users/:id/subscription - Update user subscription (admin only)
router.put('/:id/subscription', requireAdmin, async (req, res) => {
    try {
        const { subscriptionType, durationDays } = req.body;
        
        const limits = await getSubscriptionLimitsFromDB();
        if (!limits[subscriptionType]) {
            return res.status(400).json({ error: 'Invalid subscription type' });
        }

        const user = await userService.updateUserSubscription(parseInt(req.params.id), subscriptionType, durationDays || null);
        const subscriptionInfo = await validationService.getSubscriptionInfo(user.id);
        res.json({ success: true, user, subscriptionInfo });
    } catch (error) {
        console.error('Error updating subscription:', error);
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/users/:id - Update user (admin only)
router.put('/:id', requireAdmin, async (req, res) => {
    try {
        const { username, email, password, subscriptionType, durationDays, subscriptionStartDate, subscriptionEndDate } = req.body;
        const userId = parseInt(req.params.id);
        
        const user = await userService.getUserById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const updates = {};
        if (username !== undefined) updates.username = username;
        if (email !== undefined) updates.email = email;
        if (password !== undefined) updates.password = password;
        if (subscriptionType !== undefined) updates.subscriptionType = subscriptionType;
        if (durationDays !== undefined) updates.durationDays = durationDays;
        if (subscriptionStartDate !== undefined) updates.subscriptionStartDate = subscriptionStartDate;
        if (subscriptionEndDate !== undefined) updates.subscriptionEndDate = subscriptionEndDate;
        
        const updatedUser = await userService.updateUser(userId, updates);
        const subscriptionInfo = await validationService.getSubscriptionInfo(updatedUser.id);
        res.json({ success: true, user: updatedUser, subscriptionInfo });
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/users/:id/stats - Get user statistics
router.get('/:id/stats', async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const user = await userService.getUserById(userId);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const currentCount = await messageCountService.getCurrentMonthCount(userId);
        const monthlyStats = await messageCountService.getAllMonthlyStats(userId);
        const subscriptionInfo = await validationService.getSubscriptionInfo(userId);

        res.json({
            success: true,
            stats: {
                currentMonthCount: currentCount,
                monthlyStats,
                subscriptionInfo
            }
        });
    } catch (error) {
        console.error('Error getting user stats:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/users/:id - Delete user (admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
    try {
        await userService.deleteUser(parseInt(req.params.id));
        res.json({ success: true, message: 'User deleted' });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/users/subscription/limits - Get subscription limits info
router.get('/subscription/limits', async (req, res) => {
    try {
        const limits = await getSubscriptionLimitsFromDB();
        const limitsArray = Object.keys(limits).map(type => ({
            type,
            ...limits[type]
        }));
        res.json({ success: true, limits: limitsArray });
    } catch (error) {
        console.error('Error getting subscription limits:', error);
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/users/subscription/limits/:type - Update subscription limit (admin only)
router.put('/subscription/limits/:type', requireAdmin, async (req, res) => {
    try {
        const { type } = req.params;
        const { messages, duration, price } = req.body;
        
        if (messages === undefined && duration === undefined && price === undefined) {
            return res.status(400).json({ error: 'At least one field (messages, duration, price) must be provided' });
        }
        
        // Get current limits
        const currentLimit = await subscriptionLimitsService.getByType(type);
        if (!currentLimit) {
            return res.status(404).json({ error: `Subscription type ${type} not found` });
        }
        
        // Update with provided values or keep current ones
        const updatedLimit = await subscriptionLimitsService.update(type, {
            messages: messages !== undefined ? messages : currentLimit.messages,
            duration: duration !== undefined ? duration : currentLimit.duration,
            price: price !== undefined ? price : currentLimit.price
        });
        
        res.json({ success: true, limit: updatedLimit });
    } catch (error) {
        console.error('Error updating subscription limit:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/users/subscription/contact-links - Get all subscription contact links (admin only)
router.get('/subscription/contact-links', requireAdmin, async (req, res) => {
    try {
        const links = await subscriptionContactLinksService.getAll();
        res.json({ success: true, links });
    } catch (error) {
        console.error('Error getting contact links:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/users/subscription/contact-links/:type - Get contact link for subscription type
router.get('/subscription/contact-links/:type', async (req, res) => {
    try {
        const { type } = req.params;
        const link = await subscriptionContactLinksService.getByType(type);
        if (!link) {
            // Return default if not configured
            return res.json({ 
                success: true, 
                link: {
                    subscriptionType: type,
                    contactType: 'whatsapp_number',
                    contactValue: '51977638887'
                }
            });
        }
        res.json({ success: true, link });
    } catch (error) {
        console.error('Error getting contact link:', error);
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/users/subscription/contact-links/:type - Update or create contact link (admin only)
router.put('/subscription/contact-links/:type', requireAdmin, async (req, res) => {
    try {
        const { type } = req.params;
        const { contactType, contactValue } = req.body;

        if (!contactType || !contactValue) {
            return res.status(400).json({ error: 'Missing required fields: contactType, contactValue' });
        }

        if (!['whatsapp_number', 'wa_link', 'payment_link'].includes(contactType)) {
            return res.status(400).json({ error: 'Invalid contactType. Must be: whatsapp_number, wa_link, or payment_link' });
        }

        const updated = await subscriptionContactLinksService.upsert(type, contactType, contactValue);
        res.json({ success: true, link: updated });
    } catch (error) {
        console.error('Error updating contact link:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
