# Guía de Migración a Supabase

Esta guía te ayudará a migrar tu base de datos de SQLite a Supabase.

## 📋 Requisitos Previos

1. **Cuenta de Supabase**: Necesitas tener una cuenta en [Supabase](https://supabase.com)
2. **Proyecto de Supabase**: Crea un nuevo proyecto en Supabase
3. **Variables de entorno**: Necesitarás las credenciales de tu proyecto

## 🔧 Paso 1: Configurar Supabase

1. Ve a tu proyecto en Supabase Dashboard
2. Ve a **Settings** > **API**
3. Copia los siguientes valores:
   - **Project URL** (SUPABASE_URL)
   - **service_role key** (SUPABASE_SERVICE_ROLE_KEY) - ⚠️ **IMPORTANTE**: Usa la service_role key, NO la anon key

## 🔧 Paso 2: Configurar Variables de Entorno

Agrega las siguientes variables a tu archivo `.env` en la raíz del proyecto:

```env
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key_aqui
```

⚠️ **IMPORTANTE**: 
- No compartas tu `SUPABASE_SERVICE_ROLE_KEY` públicamente
- Esta key tiene permisos completos, úsala solo en el servidor

## 🔧 Paso 3: Crear el Esquema en Supabase

1. Ve a tu proyecto en Supabase Dashboard
2. Ve a **SQL Editor**
3. Abre el archivo `server/supabase-schema.sql`
4. Copia y pega todo el contenido en el editor SQL
5. Haz clic en **Run** para ejecutar el script

Esto creará todas las tablas necesarias:
- `users`
- `message_counts`
- `message_logs`
- `subscription_limits`
- `subscription_contact_links`
- `group_selections`

## 🔧 Paso 4: Migrar Datos (Opcional)

Si tienes datos existentes en SQLite que quieres migrar:

1. Asegúrate de que el archivo `server/data/app.db` existe
2. Ejecuta el script de migración:

```bash
cd server
node migrate-to-supabase.js
```

Este script copiará todos los datos de SQLite a Supabase.

⚠️ **Nota**: El script NO elimina los datos de SQLite, solo los copia.

## 🔧 Paso 5: Verificar la Migración

1. Reinicia tu servidor:

```bash
npm run server
```

2. Verifica que no hay errores en la consola
3. Prueba algunas funcionalidades:
   - Login de usuario
   - Crear un usuario
   - Enviar un mensaje
   - Ver logs de mensajes

## 📊 Estructura de Tablas

### users
- Almacena información de usuarios
- Campos: id, username, email, password_hash, subscription_type, etc.

### message_counts
- Contadores mensuales de mensajes por usuario
- Campos: user_id, year, month, count

### message_logs
- Logs detallados de todos los mensajes enviados
- Campos: user_id, message_type, recipient, status, content, sent_at

### subscription_limits
- Límites configurables por tipo de suscripción
- Campos: subscription_type, messages, duration_days, price

### subscription_contact_links
- Enlaces de contacto por tipo de suscripción
- Campos: subscription_type, contact_type, contact_value

### group_selections
- Selecciones de grupos guardadas por usuario
- Campos: user_id, name, description, group_ids (JSON)

## 🔒 Seguridad

- **Service Role Key**: Solo úsala en el servidor, nunca en el cliente
- **Row Level Security (RLS)**: Considera habilitar RLS en Supabase para mayor seguridad
- **Backups**: Supabase realiza backups automáticos, pero puedes configurar backups adicionales

## 🐛 Solución de Problemas

### Error: "Invalid API key"
- Verifica que estás usando la `service_role` key, no la `anon` key
- Asegúrate de que la key está correctamente configurada en el `.env`

### Error: "relation does not exist"
- Asegúrate de haber ejecutado el script SQL (`supabase-schema.sql`) en Supabase
- Verifica que todas las tablas fueron creadas correctamente

### Error: "duplicate key value"
- Esto es normal si intentas migrar datos que ya existen
- El script usa `upsert` para evitar duplicados

### Los datos no se están guardando
- Verifica la conexión a Supabase en los logs del servidor
- Revisa que las variables de entorno estén correctamente configuradas
- Verifica los permisos de las tablas en Supabase

## 📝 Notas Adicionales

- La migración mantiene la misma interfaz de servicios, por lo que no necesitas cambiar el código del frontend
- Los IDs se mantienen iguales durante la migración
- Las fechas se convierten automáticamente al formato de Supabase (TIMESTAMPTZ)

## 🆘 Soporte

Si encuentras problemas durante la migración:
1. Revisa los logs del servidor
2. Verifica la configuración de Supabase
3. Asegúrate de que todas las tablas existen y tienen los permisos correctos

