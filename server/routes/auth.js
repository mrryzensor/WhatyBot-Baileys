import express from 'express';
import { userService, messageCountService } from '../database.js';
import crypto from 'crypto';

const router = express.Router();

// Simple password hash function (for demo purposes, in production use bcrypt)
const hashPassword = (password) => {
    return crypto.createHash('sha256').update(password).digest('hex');
};

// POST /api/auth/login - Login user
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email y contraseña son requeridos' });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Formato de correo electrónico inválido' });
        }

        // Find user by email
        const user = await userService.getUserByEmail(email);

        if (!user) {
            return res.status(404).json({ 
                error: 'Usuario no encontrado',
                message: 'No existe una cuenta con este correo electrónico'
            });
        }

        // Verify password
        const passwordHash = hashPassword(password);
        if (user.password_hash !== passwordHash) {
            return res.status(401).json({ error: 'Contraseña incorrecta' });
        }

        // Check if user is active
        if (!user.is_active) {
            return res.status(403).json({ error: 'Usuario inactivo' });
        }

        // Remove password from response
        const { password_hash, ...userWithoutPassword } = user;

        res.json({
            success: true,
            user: userWithoutPassword,
            message: 'Login exitoso'
        });
    } catch (error) {
        console.error('Error in login:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/auth/change-password - Change user password
router.post('/change-password', async (req, res) => {
    try {
        const { email, currentPassword, newPassword } = req.body;

        if (!email || !currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Email, contraseña actual y nueva contraseña son requeridos' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Formato de correo electrónico inválido' });
        }

        const user = await userService.getUserByEmail(email);
        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const currentHash = hashPassword(currentPassword);
        if (user.password_hash !== currentHash) {
            return res.status(401).json({ error: 'La contraseña actual es incorrecta' });
        }

        await userService.updateUser(user.id, { password: newPassword });

        return res.json({
            success: true,
            message: 'Contraseña actualizada correctamente'
        });
    } catch (error) {
        console.error('Error in change-password:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/auth/register - Register new user
router.post('/register', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email y contraseña son requeridos' });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Formato de correo electrónico inválido' });
        }

        // Check if user already exists
        const existingUser = await userService.getUserByEmail(email);
        if (existingUser) {
            return res.status(409).json({ error: 'Ya existe una cuenta con este correo electrónico' });
        }

        // Validate password length
        if (password.length < 6) {
            return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
        }

        // Create username from email (before @)
        const username = email.split('@')[0];

        // Hash password
        const passwordHash = hashPassword(password);

        // Create user with free subscription
        const user = await userService.createUserWithPassword(username, email, passwordHash, 'gratuito');

        // Remove password from response
        const { password_hash, ...userWithoutPassword } = user;

        res.json({
            success: true,
            user: userWithoutPassword,
            message: 'Cuenta creada exitosamente'
        });
    } catch (error) {
        console.error('Error in register:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;

