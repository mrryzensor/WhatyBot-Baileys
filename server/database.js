import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import supabase, { supabaseAnon } from './supabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cache para límites de suscripción
let SUBSCRIPTION_LIMITS = {};

// Initialize database - verificar conexión y datos iniciales
async function initializeDatabase() {
    try {
        // Verificar conexión
        const { data, error } = await supabase.from('users').select('id').limit(1);
        if (error) {
            console.error('❌ Error conectando a Supabase:', error);
            throw error;
        }

        // Crear usuario admin por defecto si no existe
        await ensureAdminUser();

        // Inicializar límites de suscripción por defecto
        await initializeSubscriptionLimits();

        // Cargar límites en cache
        SUBSCRIPTION_LIMITS = await getSubscriptionLimitsFromDB();

        console.log('✅ Base de datos Supabase inicializada correctamente');
    } catch (error) {
        console.error('❌ Error inicializando base de datos:', error);
        throw error;
    }
}

// Asegurar que existe el usuario admin
async function ensureAdminUser() {
    const { data: existingAdmin } = await supabase
        .from('users')
        .select('*')
        .or('username.eq.admin,email.eq.daviex14@gmail.com')
        .maybeSingle();

    if (!existingAdmin) {
        const adminEmail = 'daviex14@gmail.com';
        const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'DxS000DxS*';

        const { data: createdAuth, error: createAuthError } = await supabase.auth.admin.createUser({
            email: adminEmail,
            password: adminPassword,
            email_confirm: true
        });

        if (createAuthError) {
            console.error('Error creando usuario admin (auth):', createAuthError);
            return;
        }

        // Esperar a que el trigger cree public.users, luego actualizar campos de negocio
        const { error: upsertError } = await supabase
            .from('users')
            .upsert({
                username: 'admin',
                email: adminEmail,
                auth_user_id: createdAuth.user.id,
                subscription_type: 'administrador',
                subscription_start_date: new Date().toISOString(),
                subscription_end_date: null,
                is_active: true
            }, { onConflict: 'auth_user_id' });

        if (upsertError) {
            console.error('Error creando usuario admin (public):', upsertError);
        } else {
            console.log('✅ Usuario admin creado (auth + public)');
        }
    } else if (!existingAdmin.auth_user_id && existingAdmin.email) {
        // Migración ligera: si existe el admin en public pero no está vinculado a Auth
        try {
            const { data: list, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
            if (!listError) {
                const match = (list?.users || []).find(u => u.email === existingAdmin.email);
                if (match) {
                    await supabase.from('users').update({ auth_user_id: match.id }).eq('id', existingAdmin.id);
                }
            }
        } catch (e) {
            // ignore
        }
    }
}

// Inicializar límites de suscripción por defecto
async function initializeSubscriptionLimits() {
    const { data: limits } = await supabase
        .from('subscription_limits')
        .select('subscription_type');

    if (!limits || limits.length === 0) {
        const defaultLimits = [
            { subscription_type: 'administrador', messages: -1, duration_days: null, price: 0 },
            { subscription_type: 'gratuito', messages: 50, duration_days: 30, price: 0 },
            { subscription_type: 'pro', messages: 500, duration_days: 30, price: 10 },
            { subscription_type: 'elite', messages: 2000, duration_days: 30, price: 15 },
            { subscription_type: 'platino', messages: -1, duration_days: 30, price: 25 }
        ];

        const { error } = await supabase
            .from('subscription_limits')
            .insert(defaultLimits);

        if (error) {
            console.error('Error inicializando límites de suscripción:', error);
        } else {
            console.log('✅ Límites de suscripción inicializados');
        }
    }
}

// Obtener límites de suscripción desde la base de datos
async function getSubscriptionLimitsFromDB() {
    try {
        const { data: limits, error } = await supabase
            .from('subscription_limits')
            .select('*');

        if (error) throw error;

        const result = {};
        for (const limit of limits || []) {
            result[limit.subscription_type] = {
                messages: limit.messages === -1 ? Infinity : limit.messages,
                duration: limit.duration_days,
                price: limit.price
            };
        }

        return result;
    } catch (error) {
        console.warn('Error obteniendo límites de suscripción, usando valores por defecto:', error);
        return {
            'administrador': { messages: Infinity, duration: null, price: 0 },
            'gratuito': { messages: 50, duration: 30, price: 0 },
            'pro': { messages: 500, duration: 30, price: 10 },
            'elite': { messages: 2000, duration: 30, price: 15 },
            'platino': { messages: Infinity, duration: 30, price: 25 }
        };
    }
}

// User management functions
export const userService = {
    // Get current user (accepts optional userId parameter)
    async getCurrentUser(userId = null) {
        // If userId is provided, get that specific user
        if (userId) {
            return await this.getUserById(userId);
        }

        // Fallback to admin (backward compatibility)
        let { data: user, error } = await supabase
            .from('users')
            .select('*')
            .or('username.eq.admin,email.eq.daviex14@gmail.com')
            .maybeSingle();

        if (error || !user) {
            await ensureAdminUser();
            const retry = await supabase
                .from('users')
                .select('*')
                .or('username.eq.admin,email.eq.daviex14@gmail.com')
                .maybeSingle();
            user = retry.data || null;
        }

        return user;
    },

    // Get user by ID
    async getUserById(userId) {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();

        if (error || !data) return null;
        return data;
    },

    // Get user by username
    async getUserByUsername(username) {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .single();

        if (error || !data) return null;
        return data;
    },

    // Get user by email
    async getUserByEmail(email) {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .maybeSingle();

        if (error || !data) return null;
        return data;
    },

    // Ensure a public.users profile exists for a given auth user id
    async ensureProfileForAuthUser(authUserId, username, email) {
        if (!authUserId) {
            throw new Error('authUserId is required');
        }
        if (!email) {
            throw new Error('email is required');
        }

        const { data, error } = await supabase
            .from('users')
            .upsert({
                auth_user_id: authUserId,
                username: username || email.split('@')[0],
                email,
                subscription_type: 'gratuito',
                subscription_start_date: new Date().toISOString(),
                subscription_end_date: null,
                is_active: true
            }, { onConflict: 'auth_user_id' })
            .select()
            .single();

        if (error) {
            throw error;
        }

        return data;
    },

    // Create user (with optional password and optional custom subscription dates)
    async createUser(username, email, subscriptionType = 'gratuito', password = null, subscriptionStartDate = null, subscriptionEndDate = null) {
        const limits = await getSubscriptionLimitsFromDB();
        const limit = limits[subscriptionType];
        if (!limit) {
            throw new Error(`Invalid subscription type: ${subscriptionType}`);
        }

        // Si vienen fechas explícitas, se respetan. Si no, se calcula por duración del plan.
        let startDate = subscriptionStartDate;
        let endDate = subscriptionEndDate;

        if (typeof startDate === 'string' && startDate.length === 10) {
            // Normalizar formato yyyy-mm-dd a ISO
            startDate = new Date(startDate + 'T00:00:00').toISOString();
        }

        if (!startDate) {
            startDate = new Date().toISOString();
        }

        if (!endDate) {
            if (limit.duration) {
                const end = new Date(startDate);
                // duration en meses (como en createUser original)
                end.setMonth(end.getMonth() + limit.duration);
                endDate = end.toISOString();
            } else {
                endDate = null;
            }
        } else if (typeof endDate === 'string' && endDate.length === 10) {
            // Normalizar formato yyyy-mm-dd a ISO
            endDate = new Date(endDate + 'T00:00:00').toISOString();
        }

        if (!email) {
            throw new Error('Email is required');
        }
        if (!password) {
            throw new Error('Password is required');
        }

        // 1) Crear en Auth
        const { data: createdAuth, error: createAuthError } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true
        });
        if (createAuthError) {
            throw new Error(createAuthError.message);
        }

        // 2) Dejar que el trigger cree public.users y luego actualizar campos de negocio
        const { data: updatedProfile, error: updateError } = await supabase
            .from('users')
            .upsert({
                auth_user_id: createdAuth.user.id,
                username,
                email,
                subscription_type: subscriptionType,
                subscription_start_date: startDate,
                subscription_end_date: endDate,
                is_active: true
            }, { onConflict: 'auth_user_id' })
            .select()
            .single();

        if (updateError) {
            throw updateError;
        }

        return updatedProfile;
    },

    // Create user with password
    async createUserWithPassword(username, email, passwordHash, subscriptionType = 'gratuito') {
        // Backward compatibility: this previously accepted a password hash.
        // Now we cannot recover a password from a hash; require the caller to use createUser(email,password)
        throw new Error('createUserWithPassword is deprecated. Use createUser(username, email, subscriptionType, password, ...)');
    },

    // Update user subscription
    async updateUserSubscription(userId, subscriptionType, customDurationDays = null) {
        const limits = await getSubscriptionLimitsFromDB();
        const limit = limits[subscriptionType];
        if (!limit) {
            throw new Error(`Invalid subscription type: ${subscriptionType}`);
        }

        const startDate = new Date().toISOString();
        let endDate = null;

        const duration = customDurationDays !== null ? customDurationDays : limit.duration;
        if (duration) {
            const end = new Date();
            end.setDate(end.getDate() + duration);
            endDate = end.toISOString();
        }

        const { data, error } = await supabase
            .from('users')
            .update({
                subscription_type: subscriptionType,
                subscription_start_date: startDate,
                subscription_end_date: endDate
            })
            .eq('id', userId)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    // Update user (username, email, password, subscription, duration)
    async updateUser(userId, updates) {
        const { username, email, password, subscriptionType, durationDays, subscriptionStartDate, subscriptionEndDate } = updates;

        const updateData = {};

        if (username !== undefined) updateData.username = username;
        if (email !== undefined) updateData.email = email;

        if (password !== undefined) {
            // Password update must happen in Auth. We need auth_user_id.
            const current = await this.getUserById(userId);
            if (current?.auth_user_id) {
                const { error: authError } = await supabase.auth.admin.updateUserById(current.auth_user_id, { password });
                if (authError) {
                    throw new Error(authError.message);
                }
            } else {
                throw new Error('User has no auth_user_id; cannot update password in Auth');
            }
        }

        // Si se proporciona explícitamente la fecha de inicio/fin (por ejemplo desde Excel),
        // deben respetarse y no ser sobreescritas por el cálculo automático.
        const hasExplicitDates = subscriptionStartDate !== undefined || subscriptionEndDate !== undefined;

        if (subscriptionType !== undefined) {
            const limits = await getSubscriptionLimitsFromDB();
            const limit = limits[subscriptionType];
            if (!limit) {
                throw new Error(`Invalid subscription type: ${subscriptionType}`);
            }

            updateData.subscription_type = subscriptionType;

            // Solo recalcular fechas automáticamente si NO se mandaron fechas explícitas
            if (!hasExplicitDates) {
                const startDate = new Date().toISOString();
                let endDate = null;

                const duration = durationDays !== null && durationDays !== undefined ? durationDays : limit.duration;
                if (duration) {
                    const end = new Date();
                    end.setDate(end.getDate() + duration);
                    endDate = end.toISOString();
                }

                updateData.subscription_start_date = startDate;
                updateData.subscription_end_date = endDate;
            }
        }

        // Fechas explícitas siempre tienen prioridad sobre cualquier cálculo previo
        if (subscriptionStartDate !== undefined) {
            updateData.subscription_start_date = subscriptionStartDate;
        }
        if (subscriptionEndDate !== undefined) {
            // Normalizar a ISO si viene en formato yyyy-mm-dd
            if (typeof subscriptionEndDate === 'string' && subscriptionEndDate.length === 10) {
                updateData.subscription_end_date = new Date(subscriptionEndDate + 'T00:00:00').toISOString();
            } else {
                updateData.subscription_end_date = subscriptionEndDate;
            }
        }

        if (Object.keys(updateData).length === 0) {
            return await this.getUserById(userId);
        }

        const { data, error } = await supabase
            .from('users')
            .update(updateData)
            .eq('id', userId)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    // Get all users
    async getAllUsers() {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
    },

    // Delete user
    async deleteUser(userId) {
        const current = await this.getUserById(userId);
        if (!current) {
            return { changes: 0 };
        }

        if (current.auth_user_id) {
            const { error: authError } = await supabase.auth.admin.deleteUser(current.auth_user_id);
            if (authError) {
                throw new Error(authError.message);
            }
        }

        const { error } = await supabase
            .from('users')
            .delete()
            .eq('id', userId);

        if (error) throw error;
        return { changes: 1 };
    }
};

// Message count functions
export const messageCountService = {
    // Get current month count for user
    async getCurrentMonthCount(userId) {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;

        const { data, error } = await supabase
            .from('message_counts')
            .select('count')
            .eq('user_id', userId)
            .eq('year', year)
            .eq('month', month)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
            console.error('Error obteniendo contador de mensajes:', error);
        }

        return data ? data.count : 0;
    },

    // Increment message count
    async incrementCount(userId, count = 1) {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;

        // Check if record exists
        const { data: existing } = await supabase
            .from('message_counts')
            .select('count')
            .eq('user_id', userId)
            .eq('year', year)
            .eq('month', month)
            .single();

        if (existing) {
            // Update existing record
            const newCount = existing.count + count;
            const { error: updateError } = await supabase
                .from('message_counts')
                .update({ count: newCount })
                .eq('user_id', userId)
                .eq('year', year)
                .eq('month', month);

            if (updateError) {
                console.error('Error actualizando contador de mensajes:', updateError);
            }
        } else {
            // Create new record
            const { error: insertError } = await supabase
                .from('message_counts')
                .insert({
                    user_id: userId,
                    year,
                    month,
                    count
                });

            if (insertError) {
                console.error('Error insertando contador de mensajes:', insertError);
            }
        }

        return await this.getCurrentMonthCount(userId);
    },

    // Get monthly statistics
    async getMonthlyStats(userId, year, month) {
        const { data, error } = await supabase
            .from('message_counts')
            .select('*')
            .eq('user_id', userId)
            .eq('year', year)
            .eq('month', month)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error('Error obteniendo estadísticas mensuales:', error);
        }

        return data || null;
    },

    // Get all monthly stats for user
    async getAllMonthlyStats(userId) {
        const { data, error } = await supabase
            .from('message_counts')
            .select('*')
            .eq('user_id', userId)
            .order('year', { ascending: false })
            .order('month', { ascending: false });

        if (error) {
            console.error('Error obteniendo todas las estadísticas:', error);
            return [];
        }

        return data || [];
    }
};

// Almacenamiento local para logs persistente en archivos
const LOGS_DIR = path.join(__dirname, 'data/local_logs');

// Asegurar que el directorio de logs existe
if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
}

const getLogFilePath = (userId) => path.join(LOGS_DIR, `logs_${userId}.json`);

const loadLocalLogs = (userId) => {
    const filePath = getLogFilePath(userId);
    if (fs.existsSync(filePath)) {
        try {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (e) {
            console.error(`Error cargando logs locales para ${userId}:`, e);
            return [];
        }
    }
    return [];
};

const saveLocalLogs = (userId, logs) => {
    try {
        const filePath = getLogFilePath(userId);
        fs.writeFileSync(filePath, JSON.stringify(logs, null, 2), 'utf8');
    } catch (e) {
        console.error(`Error guardando logs locales para ${userId}:`, e);
    }
};

// Message log functions
export const messageLogService = {
    // Log a message
    async logMessage(userId, messageType, recipient, status, content, scheduledAt = null) {
        const logEntry = {
            id: 'local-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9),
            user_id: userId,
            message_type: messageType || 'single',
            recipient: recipient || 'Desconocido',
            status: status || 'pending',
            content: content || '',
            scheduled_at: scheduledAt,
            sent_at: new Date().toISOString()
        };

        if (userId) {
            let userLogs = loadLocalLogs(userId);
            userLogs.push(logEntry); // Agregamos al final (más reciente al final)

            // Mantener solo los últimos 100 logs
            if (userLogs.length > 100) {
                userLogs = userLogs.slice(-100);
            }
            saveLocalLogs(userId, userLogs);
        }

        return logEntry;
    },

    // Get message logs (desde archivos locales)
    async getMessageLogs(userId, limit = 100) {
        if (!userId) return [];
        const userLogs = loadLocalLogs(userId);
        // Retornamos los últimos N logs en el orden que están (más viejos a más nuevos)
        // El frontend se encarga de reversarlos para mostrar los más recientes arriba
        return userLogs.slice(-limit);
    }
};

// Validation functions
export const validationService = {
    // Check if user can send messages
    async validateMessageLimit(userId, messageCount = 1) {
        const user = await userService.getUserById(userId);
        if (!user) {
            return { allowed: false, reason: 'Usuario no encontrado' };
        }

        // Resolve limits early (needed for both expiration and message-limit checks)
        const limits = await getSubscriptionLimitsFromDB();
        const subscriptionType = (user.subscription_type || '').toString().toLowerCase();
        const limit = limits[subscriptionType] || limits[user.subscription_type];
        if (!limit) {
            return {
                allowed: false,
                reason: `Tipo de suscripción inválido: ${user.subscription_type}`
            };
        }

        // Check subscription expiration (administrador is never blocked)
        if (user.subscription_end_date && limit.messages !== Infinity) {
            const endDate = new Date(user.subscription_end_date);
            const now = new Date();
            if (endDate < now) {
                const currentCount = await messageCountService.getCurrentMonthCount(userId);
                return {
                    allowed: false,
                    reason: 'Suscripción expirada',
                    subscriptionExpired: true,
                    currentCount,
                    limit: limit.messages,
                    subscriptionType: user.subscription_type,
                    endDate: user.subscription_end_date
                };
            }
        }

        // Check message limits

        // Administrador has unlimited messages
        if (limit.messages === Infinity) {
            return { allowed: true, reason: null };
        }

        // Check current month count
        const currentCount = await messageCountService.getCurrentMonthCount(userId);
        const newCount = currentCount + messageCount;

        // Debug logging
        console.log(`[Validation] User ${userId}: currentCount=${currentCount}, messageCount=${messageCount}, newCount=${newCount}, limit=${limit.messages}`);

        // Block if new count would exceed limit
        if (newCount > limit.messages) {
            console.log(`[Validation] BLOCKED: User ${userId} would exceed limit (${newCount} > ${limit.messages})`);
            return {
                allowed: false,
                reason: `Límite de mensajes excedido. Has usado ${currentCount}/${limit.messages} mensajes este mes.`,
                limitExceeded: true,
                currentCount: currentCount,
                limit: limit.messages,
                subscriptionType: user.subscription_type
            };
        }

        console.log(`[Validation] ALLOWED: User ${userId} can send ${messageCount} message(s) (${newCount} <= ${limit.messages})`);

        return { allowed: true, reason: null };
    },

    // Backward-compatible alias (used by routes and WhatsApp client)
    async canSendMessages(userId, messageCount = 1) {
        return await this.validateMessageLimit(userId, messageCount);
    },

    // Get subscription info
    async getSubscriptionInfo(userId) {
        const user = await userService.getUserById(userId);
        if (!user) return null;

        const limits = await getSubscriptionLimitsFromDB();
        const subscriptionType = (user.subscription_type || '').toString().toLowerCase();
        const limit = limits[subscriptionType] || limits[user.subscription_type];
        if (!limit) {
            return {
                type: user.subscription_type,
                limit: 0,
                used: await messageCountService.getCurrentMonthCount(userId),
                remaining: 0,
                price: 0,
                startDate: user.subscription_start_date,
                endDate: user.subscription_end_date,
                isExpired: user.subscription_end_date ? new Date(user.subscription_end_date) < new Date() : false
            };
        }
        const currentCount = await messageCountService.getCurrentMonthCount(userId);
        const remaining = limit.messages === Infinity ? Infinity : Math.max(0, limit.messages - currentCount);

        return {
            type: user.subscription_type,
            limit: limit.messages,
            used: currentCount,
            remaining: remaining,
            price: limit.price,
            startDate: user.subscription_start_date,
            endDate: user.subscription_end_date,
            isExpired: user.subscription_end_date ? new Date(user.subscription_end_date) < new Date() : false
        };
    }
};

// Subscription limits service
export const subscriptionLimitsService = {
    async getAll() {
        return await getSubscriptionLimitsFromDB();
    },

    async getByType(type) {
        const { data, error } = await supabase
            .from('subscription_limits')
            .select('*')
            .eq('subscription_type', type)
            .single();

        if (error || !data) return null;

        return {
            type: data.subscription_type,
            messages: data.messages === -1 ? Infinity : data.messages,
            duration: data.duration_days,
            price: data.price
        };
    },

    async update(type, updates) {
        const { messages, duration, price } = updates;

        // Convert Infinity to -1 for storage
        const messagesValue = messages === Infinity ? -1 : messages;

        const updateData = {
            messages: messagesValue,
            duration_days: duration,
            price
        };

        const { data, error } = await supabase
            .from('subscription_limits')
            .update(updateData)
            .eq('subscription_type', type)
            .select()
            .single();

        if (error) throw error;
        if (!data) {
            throw new Error(`Subscription type ${type} not found`);
        }

        // Update cache
        SUBSCRIPTION_LIMITS = await getSubscriptionLimitsFromDB();

        return {
            type: data.subscription_type,
            messages: data.messages === -1 ? Infinity : data.messages,
            duration: data.duration_days,
            price: data.price
        };
    }
};

// Subscription contact links service
export const subscriptionContactLinksService = {
    async getAll() {
        const { data, error } = await supabase
            .from('subscription_contact_links')
            .select('*');

        if (error) {
            console.error('Error obteniendo enlaces de contacto:', error);
            return [];
        }

        return data || [];
    },

    async getByType(type) {
        const { data, error } = await supabase
            .from('subscription_contact_links')
            .select('*')
            .eq('subscription_type', type)
            .single();

        if (error || !data) return null;

        return {
            subscriptionType: data.subscription_type,
            contactType: data.contact_type,
            contactValue: data.contact_value
        };
    },

    async upsert(type, contactType, contactValue) {
        const { data: existing } = await supabase
            .from('subscription_contact_links')
            .select('id')
            .eq('subscription_type', type)
            .single();

        if (existing) {
            const { data, error } = await supabase
                .from('subscription_contact_links')
                .update({
                    contact_type: contactType,
                    contact_value: contactValue
                })
                .eq('subscription_type', type)
                .select()
                .single();

            if (error) throw error;
            return {
                subscriptionType: data.subscription_type,
                contactType: data.contact_type,
                contactValue: data.contact_value
            };
        } else {
            const { data, error } = await supabase
                .from('subscription_contact_links')
                .insert({
                    subscription_type: type,
                    contact_type: contactType,
                    contact_value: contactValue
                })
                .select()
                .single();

            if (error) throw error;
            return {
                subscriptionType: data.subscription_type,
                contactType: data.contact_type,
                contactValue: data.contact_value
            };
        }
    },

    async delete(type) {
        const { error } = await supabase
            .from('subscription_contact_links')
            .delete()
            .eq('subscription_type', type);

        if (error) throw error;
        return { changes: 1 };
    }
};

// Phone numbers service
export const phoneNumberService = {
    async linkPhoneToUser(userId, phoneNumber) {
        const normalized = (phoneNumber || '').replace(/\D/g, '');
        if (!normalized) {
            throw new Error('Invalid phone number');
        }

        const { data: existing } = await supabase
            .from('user_phone_numbers')
            .select('*')
            .eq('user_id', userId)
            .eq('phone_number', normalized)
            .single();

        if (existing) {
            return existing;
        }

        const { data, error } = await supabase
            .from('user_phone_numbers')
            .insert({
                user_id: userId,
                phone_number: normalized
            })
            .select()
            .single();

        if (error) {
            console.error('Error linking phone number to user:', error);
            throw error;
        }

        return data;
    },

    async countUsersForPhone(phoneNumber) {
        const normalized = (phoneNumber || '').replace(/\D/g, '');
        if (!normalized) {
            return 0;
        }

        const { count, error } = await supabase
            .from('user_phone_numbers')
            .select('id', { count: 'exact', head: true })
            .eq('phone_number', normalized);

        if (error) {
            console.error('Error counting users for phone number:', error);
            return 0;
        }

        return count || 0;
    },

    async countOtherUsersForPhone(phoneNumber, excludeUserId) {
        const normalized = (phoneNumber || '').replace(/\D/g, '');
        if (!normalized) {
            return 0;
        }

        const { count, error } = await supabase
            .from('user_phone_numbers')
            .select('id', { count: 'exact', head: true })
            .eq('phone_number', normalized)
            .neq('user_id', excludeUserId);

        if (error) {
            console.error('Error counting other users for phone number:', error);
            return 0;
        }

        return count || 0;
    },

    async unlinkPhoneFromUser(userId, phoneNumber) {
        const normalized = (phoneNumber || '').replace(/\D/g, '');
        if (!normalized || !userId) {
            return false;
        }

        const { error } = await supabase
            .from('user_phone_numbers')
            .delete()
            .eq('user_id', userId)
            .eq('phone_number', normalized);

        if (error) {
            console.error('Error unlinking phone number from user:', error);
            return false;
        }

        console.log(`Phone ${normalized} unlinked from user ${userId}`);
        return true;
    }
};

// Group selections service
export const groupSelectionService = {
    // Get all selections for a user
    async getByUserId(userId) {
        const { data, error } = await supabase
            .from('group_selections')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error obteniendo selecciones de grupos:', error);
            return [];
        }

        return (data || []).map(selection => ({
            id: selection.id.toString(),
            name: selection.name,
            description: selection.description || '',
            groupIds: JSON.parse(selection.group_ids),
            createdAt: new Date(selection.created_at)
        }));
    },

    // Get a specific selection by ID (ensuring it belongs to the user)
    async getById(selectionId, userId) {
        const { data, error } = await supabase
            .from('group_selections')
            .select('*')
            .eq('id', selectionId)
            .eq('user_id', userId)
            .single();

        if (error || !data) return null;

        return {
            id: data.id.toString(),
            name: data.name,
            description: data.description || '',
            groupIds: JSON.parse(data.group_ids),
            createdAt: new Date(data.created_at)
        };
    },

    // Create a new selection
    async create(userId, name, description, groupIds) {
        const { data, error } = await supabase
            .from('group_selections')
            .insert({
                user_id: userId,
                name,
                description: description || null,
                group_ids: JSON.stringify(groupIds)
            })
            .select()
            .single();

        if (error) throw error;

        return {
            id: data.id.toString(),
            name: data.name,
            description: data.description || '',
            groupIds: JSON.parse(data.group_ids),
            createdAt: new Date(data.created_at)
        };
    },

    // Update a selection (ensuring it belongs to the user)
    async update(selectionId, userId, updates) {
        const { name, description, groupIds } = updates;
        const updateData = {};

        if (name !== undefined) updateData.name = name;
        if (description !== undefined) updateData.description = description || null;
        if (groupIds !== undefined) updateData.group_ids = JSON.stringify(groupIds);

        if (Object.keys(updateData).length === 0) {
            return await this.getById(selectionId, userId);
        }

        const { data, error } = await supabase
            .from('group_selections')
            .update(updateData)
            .eq('id', selectionId)
            .eq('user_id', userId)
            .select()
            .single();

        if (error) throw error;

        return {
            id: data.id.toString(),
            name: data.name,
            description: data.description || '',
            groupIds: JSON.parse(data.group_ids),
            createdAt: new Date(data.created_at)
        };
    },

    // Delete a selection (ensuring it belongs to the user)
    async delete(selectionId, userId) {
        const { error } = await supabase
            .from('group_selections')
            .delete()
            .eq('id', selectionId)
            .eq('user_id', userId);

        if (error) throw error;
        return { changes: 1 };
    }
};

// Export a getter function for SUBSCRIPTION_LIMITS to ensure it's always up to date
export async function getSubscriptionLimits() {
    return await getSubscriptionLimitsFromDB();
}

export { getSubscriptionLimitsFromDB };

// Initialize database on module load
initializeDatabase().catch(error => {
    console.error('Error inicializando base de datos:', error);
});

// Export SUBSCRIPTION_LIMITS for backward compatibility (will be updated after init)
export { SUBSCRIPTION_LIMITS };
