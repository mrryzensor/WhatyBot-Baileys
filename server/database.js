import crypto from 'crypto';
import supabase from './supabase.js';

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
    const hashPassword = (password) => {
        return crypto.createHash('sha256').update(password).digest('hex');
    };

    const { data: existingAdmin } = await supabase
        .from('users')
        .select('*')
        .or('username.eq.admin,email.eq.daviex14@gmail.com')
        .single();

    if (!existingAdmin) {
        const passwordHash = hashPassword('DxS000DxS*');
        const { error } = await supabase
            .from('users')
            .insert({
                username: 'admin',
                email: 'daviex14@gmail.com',
                password_hash: passwordHash,
                subscription_type: 'administrador',
                subscription_start_date: new Date().toISOString(),
                subscription_end_date: null
            });

        if (error && error.code !== '23505') { // Ignorar error de duplicado
            console.error('Error creando usuario admin:', error);
        } else {
            console.log('✅ Usuario admin creado');
        }
    } else {
        // Actualizar admin si no tiene email o password
        if (!existingAdmin.email || !existingAdmin.password_hash) {
            const passwordHash = hashPassword('DxS000DxS*');
            await supabase
                .from('users')
                .update({
                    email: 'daviex14@gmail.com',
                    password_hash: passwordHash
                })
                .eq('id', existingAdmin.id);
            console.log('✅ Usuario admin actualizado');
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
            { subscription_type: 'elite', messages: 2000, duration_days: 30, price: 15 }
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
            'elite': { messages: 2000, duration: 30, price: 15 }
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

        // Fallback to admin (for backward compatibility)
        const hashPassword = (password) => {
            return crypto.createHash('sha256').update(password).digest('hex');
        };

        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .or('username.eq.admin,email.eq.daviex14@gmail.com')
            .single();

        if (error || !user) {
            // Create default admin if doesn't exist
            const passwordHash = hashPassword('DxS000DxS*');
            const { data: newUser, error: insertError } = await supabase
                .from('users')
                .insert({
                    username: 'admin',
                    email: 'daviex14@gmail.com',
                    password_hash: passwordHash,
                    subscription_type: 'administrador',
                    subscription_start_date: new Date().toISOString(),
                    subscription_end_date: null
                })
                .select()
                .single();

            if (insertError) {
                console.error('Error creando usuario admin:', insertError);
                return null;
            }
            return newUser;
        }

        // Update admin user with email and password if not set
        if ((!user.email || user.email !== 'daviex14@gmail.com') || !user.password_hash) {
            const passwordHash = hashPassword('DxS000DxS*');
            const { data: updatedUser } = await supabase
                .from('users')
                .update({
                    email: 'daviex14@gmail.com',
                    password_hash: passwordHash
                })
                .eq('id', user.id)
                .select()
                .single();

            return updatedUser || user;
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
            .single();

        if (error || !data) return null;
        return data;
    },

    // Create user (with optional password)
    async createUser(username, email, subscriptionType = 'gratuito', password = null) {
        const limits = await getSubscriptionLimitsFromDB();
        const limit = limits[subscriptionType];
        if (!limit) {
            throw new Error(`Invalid subscription type: ${subscriptionType}`);
        }

        const startDate = new Date().toISOString();
        let endDate = null;

        if (limit.duration) {
            const end = new Date();
            end.setMonth(end.getMonth() + limit.duration);
            endDate = end.toISOString();
        }

        // Hash password if provided
        let passwordHash = null;
        if (password) {
            passwordHash = crypto.createHash('sha256').update(password).digest('hex');
        }

        const userData = {
            username,
            email,
            subscription_type: subscriptionType,
            subscription_start_date: startDate,
            subscription_end_date: endDate
        };

        if (passwordHash) {
            userData.password_hash = passwordHash;
        }

        const { data, error } = await supabase
            .from('users')
            .insert(userData)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    // Create user with password
    async createUserWithPassword(username, email, passwordHash, subscriptionType = 'gratuito') {
        const limits = await getSubscriptionLimitsFromDB();
        const limit = limits[subscriptionType];
        if (!limit) {
            throw new Error(`Invalid subscription type: ${subscriptionType}`);
        }

        const startDate = new Date().toISOString();
        let endDate = null;

        if (limit.duration) {
            const end = new Date();
            end.setMonth(end.getMonth() + limit.duration);
            endDate = end.toISOString();
        }

        const { data, error } = await supabase
            .from('users')
            .insert({
                username,
                email,
                password_hash: passwordHash,
                subscription_type: subscriptionType,
                subscription_start_date: startDate,
                subscription_end_date: endDate
            })
            .select()
            .single();

        if (error) throw error;
        return data;
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
            updateData.password_hash = crypto.createHash('sha256').update(password).digest('hex');
        }

        if (subscriptionType !== undefined) {
            const limits = await getSubscriptionLimitsFromDB();
            const limit = limits[subscriptionType];
            if (!limit) {
                throw new Error(`Invalid subscription type: ${subscriptionType}`);
            }

            updateData.subscription_type = subscriptionType;

            const startDate = new Date().toISOString();
            let endDate = null;

            const duration = durationDays !== null ? durationDays : limit.duration;
            if (duration) {
                const end = new Date();
                end.setDate(end.getDate() + duration);
                endDate = end.toISOString();
            }

            updateData.subscription_start_date = startDate;
            updateData.subscription_end_date = endDate;
        } else if (subscriptionStartDate !== undefined || subscriptionEndDate !== undefined) {
            if (subscriptionStartDate !== undefined) updateData.subscription_start_date = subscriptionStartDate;
            if (subscriptionEndDate !== undefined) updateData.subscription_end_date = subscriptionEndDate || null;
        } else if (durationDays !== null && durationDays !== undefined) {
            const user = await this.getUserById(userId);
            if (user && user.subscription_start_date) {
                const startDate = new Date(user.subscription_start_date);
                const endDate = new Date(startDate);
                endDate.setDate(endDate.getDate() + durationDays);
                updateData.subscription_end_date = endDate.toISOString();
            }
        }

        if (Object.keys(updateData).length === 0) {
            throw new Error('No fields to update');
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

// Message log functions
export const messageLogService = {
    // Log a message
    async logMessage(userId, messageType, recipient, status, content, scheduledAt = null) {
        const { data, error } = await supabase
            .from('message_logs')
            .insert({
                user_id: userId,
                message_type: messageType,
                recipient,
                status,
                content,
                scheduled_at: scheduledAt
            })
            .select()
            .single();

        if (error) {
            console.error('Error registrando mensaje:', error);
            throw error;
        }

        return data;
    },

    // Get message logs
    async getMessageLogs(userId, limit = 100) {
        const { data, error } = await supabase
            .from('message_logs')
            .select('*')
            .eq('user_id', userId)
            .order('sent_at', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('Error obteniendo logs de mensajes:', error);
            return [];
        }

        return data || [];
    }
};

// Validation functions
export const validationService = {
    // Check if user can send messages
    async canSendMessages(userId, messageCount) {
        const user = await userService.getUserById(userId);
        if (!user || !user.is_active) {
            return { allowed: false, reason: 'Usuario inactivo' };
        }

        // Check subscription expiration
        if (user.subscription_end_date) {
            const endDate = new Date(user.subscription_end_date);
            const now = new Date();
            if (endDate < now) {
                return { allowed: false, reason: 'Suscripción expirada' };
            }
        }

        // Check message limits
        const limits = await getSubscriptionLimitsFromDB();
        const limit = limits[user.subscription_type];
        if (!limit) {
            return { allowed: false, reason: 'Tipo de suscripción inválido' };
        }

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

    // Get subscription info
    async getSubscriptionInfo(userId) {
        const user = await userService.getUserById(userId);
        if (!user) return null;

        const limits = await getSubscriptionLimitsFromDB();
        const limit = limits[user.subscription_type];
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
