/**
 * Script de migración de datos de SQLite a Supabase
 * 
 * Este script lee los datos de la base de datos SQLite local y los migra a Supabase.
 * 
 * IMPORTANTE: 
 * - Asegúrate de tener configuradas las variables de entorno SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
 * - Ejecuta el esquema SQL (supabase-schema.sql) en Supabase antes de ejecutar este script
 * - Este script NO elimina los datos de SQLite, solo los copia a Supabase
 * 
 * Uso:
 *   node migrate-to-supabase.js
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import supabase from './supabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'data', 'app.db');

async function migrateData() {
    console.log('🚀 Iniciando migración de datos a Supabase...\n');

    // Verificar que existe la base de datos SQLite
    if (!fs.existsSync(dbPath)) {
        console.error('❌ No se encontró la base de datos SQLite en:', dbPath);
        console.error('   Asegúrate de que existe el archivo app.db antes de migrar.');
        process.exit(1);
    }

    const db = new Database(dbPath);

    try {
        // 1. Migrar usuarios
        console.log('📦 Migrando usuarios...');
        const users = db.prepare('SELECT * FROM users').all();
        for (const user of users) {
            const { error } = await supabase
                .from('users')
                .upsert({
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    password_hash: user.password_hash,
                    subscription_type: user.subscription_type,
                    subscription_start_date: user.subscription_start_date,
                    subscription_end_date: user.subscription_end_date,
                    is_active: user.is_active === 1,
                    created_at: user.created_at,
                    updated_at: user.updated_at
                }, { onConflict: 'id' });

            if (error && error.code !== '23505') { // Ignorar duplicados
                console.error(`   Error migrando usuario ${user.id}:`, error.message);
            }
        }
        console.log(`   ✅ ${users.length} usuarios migrados\n`);

        // 2. Migrar contadores de mensajes
        console.log('📦 Migrando contadores de mensajes...');
        const messageCounts = db.prepare('SELECT * FROM message_counts').all();
        for (const count of messageCounts) {
            const { error } = await supabase
                .from('message_counts')
                .upsert({
                    id: count.id,
                    user_id: count.user_id,
                    year: count.year,
                    month: count.month,
                    count: count.count,
                    created_at: count.created_at,
                    updated_at: count.updated_at
                }, { onConflict: 'id' });

            if (error && error.code !== '23505') {
                console.error(`   Error migrando contador ${count.id}:`, error.message);
            }
        }
        console.log(`   ✅ ${messageCounts.length} contadores migrados\n`);

        // 3. Migrar logs de mensajes
        console.log('📦 Migrando logs de mensajes...');
        const messageLogs = db.prepare('SELECT * FROM message_logs').all();
        for (const log of messageLogs) {
            const { error } = await supabase
                .from('message_logs')
                .insert({
                    id: log.id,
                    user_id: log.user_id,
                    message_type: log.message_type,
                    recipient: log.recipient,
                    status: log.status,
                    content: log.content,
                    scheduled_at: log.scheduled_at,
                    sent_at: log.sent_at
                });

            if (error && error.code !== '23505') {
                console.error(`   Error migrando log ${log.id}:`, error.message);
            }
        }
        console.log(`   ✅ ${messageLogs.length} logs migrados\n`);

        // 4. Migrar límites de suscripción
        console.log('📦 Migrando límites de suscripción...');
        const subscriptionLimits = db.prepare('SELECT * FROM subscription_limits').all();
        for (const limit of subscriptionLimits) {
            const { error } = await supabase
                .from('subscription_limits')
                .upsert({
                    id: limit.id,
                    subscription_type: limit.subscription_type,
                    messages: limit.messages,
                    duration_days: limit.duration_days,
                    price: limit.price,
                    created_at: limit.created_at,
                    updated_at: limit.updated_at
                }, { onConflict: 'subscription_type' });

            if (error && error.code !== '23505') {
                console.error(`   Error migrando límite ${limit.id}:`, error.message);
            }
        }
        console.log(`   ✅ ${subscriptionLimits.length} límites migrados\n`);

        // 5. Migrar enlaces de contacto
        console.log('📦 Migrando enlaces de contacto...');
        const contactLinks = db.prepare('SELECT * FROM subscription_contact_links').all();
        for (const link of contactLinks) {
            const { error } = await supabase
                .from('subscription_contact_links')
                .upsert({
                    id: link.id,
                    subscription_type: link.subscription_type,
                    contact_type: link.contact_type,
                    contact_value: link.contact_value,
                    created_at: link.created_at,
                    updated_at: link.updated_at
                }, { onConflict: 'subscription_type' });

            if (error && error.code !== '23505') {
                console.error(`   Error migrando enlace ${link.id}:`, error.message);
            }
        }
        console.log(`   ✅ ${contactLinks.length} enlaces migrados\n`);

        // 6. Migrar selecciones de grupos
        console.log('📦 Migrando selecciones de grupos...');
        const groupSelections = db.prepare('SELECT * FROM group_selections').all();
        for (const selection of groupSelections) {
            const { error } = await supabase
                .from('group_selections')
                .upsert({
                    id: selection.id,
                    user_id: selection.user_id,
                    name: selection.name,
                    description: selection.description,
                    group_ids: selection.group_ids,
                    created_at: selection.created_at,
                    updated_at: selection.updated_at
                }, { onConflict: 'id' });

            if (error && error.code !== '23505') {
                console.error(`   Error migrando selección ${selection.id}:`, error.message);
            }
        }
        console.log(`   ✅ ${groupSelections.length} selecciones migradas\n`);

        console.log('✅ Migración completada exitosamente!');
        console.log('\n📊 Resumen:');
        console.log(`   - Usuarios: ${users.length}`);
        console.log(`   - Contadores: ${messageCounts.length}`);
        console.log(`   - Logs: ${messageLogs.length}`);
        console.log(`   - Límites: ${subscriptionLimits.length}`);
        console.log(`   - Enlaces: ${contactLinks.length}`);
        console.log(`   - Selecciones: ${groupSelections.length}`);

    } catch (error) {
        console.error('❌ Error durante la migración:', error);
        process.exit(1);
    } finally {
        db.close();
    }
}

// Ejecutar migración
migrateData().catch(error => {
    console.error('❌ Error fatal:', error);
    process.exit(1);
});

