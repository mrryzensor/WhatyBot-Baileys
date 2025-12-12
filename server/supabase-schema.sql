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
    ('elite', 2000, 30, 15),
    ('platino', -1, 30, 25)
ON CONFLICT (subscription_type) DO NOTHING;

-- Nota: -1 representa Infinity para mensajes ilimitados

-- 1) Columna auth_user_id y constraint
alter table public.users
add column if not exists auth_user_id uuid;

create unique index if not exists users_auth_user_id_unique
on public.users(auth_user_id);

-- 2) Trigger: al crear auth.users, crear/actualizar public.users
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.users (auth_user_id, email, username, subscription_type, is_active, created_at, updated_at)
  values (
    new.id,
    new.email,
    split_part(new.email, '@', 1),
    'gratuito',
    true,
    now(),
    now()
  )
  on conflict (auth_user_id)
  do update set
    email = excluded.email,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_auth_user();


-- 3) RPC admin delete (Auth + public) Esta RPC es la que llama tu frontend (delete_user_everywhere con target_auth_user_id).

create or replace function public.delete_user_everywhere(target_auth_user_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  caller_is_admin boolean;
begin
  -- validar que el caller está autenticado
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  -- validar que el caller es admin según public.users
  select (u.subscription_type = 'administrador')
    into caller_is_admin
  from public.users u
  where u.auth_user_id = auth.uid();

  if caller_is_admin is distinct from true then
    raise exception 'not_authorized';
  end if;

  -- borrar perfil (y cascadas) primero o después, como prefieras
  delete from public.users where auth_user_id = target_auth_user_id;

  -- borrar usuario de Auth (requiere privileges internos de Supabase; security definer ayuda)
  perform auth.admin_delete_user(target_auth_user_id);

end;
$$;

grant execute on function public.delete_user_everywhere(uuid) to authenticated;

-- crear/ajustar la función en Supabase (SQL)
create or replace function public.delete_user_everywhere(target_auth_user_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  -- Eliminar el perfil (public.users)
  delete from public.users where auth_user_id = target_auth_user_id;

  -- Eliminar del Auth (auth.users)
  delete from auth.users where id = target_auth_user_id;
end;
$$;

-- Importante: que sea ejecutable desde el cliente logueado
grant execute on function public.delete_user_everywhere(uuid) to authenticated;

