import express from 'express';
import { userService, messageCountService } from '../database.js';
import { supabaseAnon } from '../supabase.js';

const router = express.Router();

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

        // Try Auth sign-in first
        const { data: authData, error: authError } = await supabaseAnon.auth.signInWithPassword({
            email,
            password
        });

        // Legacy behavior for old frontend:
        // If sign-in fails AND user profile doesn't exist in public.users, return 404 to trigger "create user" modal.
        if (authError || !authData?.user) {
            const maybeProfile = await userService.getUserByEmail(email);
            if (!maybeProfile) {
                return res.status(404).json({
                    error: 'Usuario no encontrado',
                    message: 'No existe una cuenta con este correo electrónico'
                });
            }

            return res.status(401).json({ error: 'Contraseña incorrecta' });
        }

        // Ensure we have a public.users profile linked to this auth user
        const user = await userService.getUserByEmail(email);
        if (!user) {
            const username = email.split('@')[0];
            try {
                await userService.ensureProfileForAuthUser(authData.user.id, username, email);
            } catch (e) {
                // ignore
            }
        }

        const freshProfile = await userService.getUserByEmail(email);
        if (!freshProfile) {
            return res.status(500).json({ error: 'No se pudo cargar el perfil del usuario' });
        }

        // Check if user is active
        if (freshProfile.is_active === false) {
            return res.status(403).json({ error: 'Usuario inactivo' });
        }

        res.json({
            success: true,
            user: freshProfile,
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

        // Verify current password with Auth
        const { data: authData, error: authError } = await supabaseAnon.auth.signInWithPassword({
            email,
            password: currentPassword
        });

        if (authError || !authData?.user) {
            return res.status(401).json({ error: 'La contraseña actual es incorrecta' });
        }

        // Update password in Auth via admin API (service role)
        const profile = await userService.getUserByEmail(email);
        if (!profile?.auth_user_id) {
            return res.status(400).json({ error: 'El usuario no tiene auth_user_id asociado' });
        }

        await userService.updateUser(profile.id, { password: newPassword });

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

        // Check if user already exists in public.users
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

        // Create Auth user (admin) + profile
        const user = await userService.createUser(username, email, 'gratuito', password);

        res.json({
            success: true,
            user,
            message: 'Cuenta creada exitosamente'
        });
    } catch (error) {
        console.error('Error in register:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;

