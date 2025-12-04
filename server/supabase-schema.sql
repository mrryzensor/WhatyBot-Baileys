-- Esquema de base de datos para Supabase
-- Ejecuta este script en el SQL Editor de Supabase

-- Habilitar extensiones necesarias (si no están habilitadas)
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tabla de usuarios
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE,
    password_hash TEXT,
    subscription_type TEXT NOT NULL DEFAULT 'gratuito',
    subscription_start_date TIMESTAMPTZ,
    subscription_end_date TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de contadores de mensajes mensuales
CREATE TABLE IF NOT EXISTS message_counts (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, year, month)
);

-- Tabla de logs de mensajes
CREATE TABLE IF NOT EXISTS message_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_type TEXT NOT NULL,
    recipient TEXT NOT NULL,
    status TEXT NOT NULL,
    content TEXT,
    scheduled_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de límites de suscripción
CREATE TABLE IF NOT EXISTS subscription_limits (
    id BIGSERIAL PRIMARY KEY,
    subscription_type TEXT UNIQUE NOT NULL,
    messages INTEGER NOT NULL,
    duration_days INTEGER,
    price REAL NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de enlaces de contacto por suscripción
CREATE TABLE IF NOT EXISTS subscription_contact_links (
    id BIGSERIAL PRIMARY KEY,
    subscription_type TEXT UNIQUE NOT NULL,
    contact_type TEXT NOT NULL DEFAULT 'whatsapp_number',
    contact_value TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (subscription_type) REFERENCES subscription_limits(subscription_type) ON DELETE CASCADE
);

-- Tabla de selecciones de grupos guardadas
CREATE TABLE IF NOT EXISTS group_selections (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    group_ids TEXT NOT NULL, -- JSON array almacenado como texto
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_message_counts_user_month ON message_counts(user_id, year, month);
CREATE INDEX IF NOT EXISTS idx_message_logs_user_date ON message_logs(user_id, sent_at);
CREATE INDEX IF NOT EXISTS idx_group_selections_user ON group_selections(user_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para actualizar updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_message_counts_updated_at BEFORE UPDATE ON message_counts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscription_limits_updated_at BEFORE UPDATE ON subscription_limits
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscription_contact_links_updated_at BEFORE UPDATE ON subscription_contact_links
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_group_selections_updated_at BEFORE UPDATE ON group_selections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insertar límites de suscripción por defecto
INSERT INTO subscription_limits (subscription_type, messages, duration_days, price)
VALUES 
    ('administrador', -1, NULL, 0),
    ('gratuito', 50, 30, 0),
    ('pro', 500, 30, 10),
    ('elite', 2000, 30, 15)
ON CONFLICT (subscription_type) DO NOTHING;

-- Nota: -1 representa Infinity para mensajes ilimitados

