# Guía de Despliegue en Railway (Backend + Frontend)

Esta guía te permitirá desplegar tu aplicación (servidor Node.js y cliente React) en la plataforma Railway.app.

## Prerrequisitos
1. Tener una cuenta en [Railway.app](https://railway.app/).
2. Tener tu código subido a un repositorio de GitHub.

## Pasos para Desplegar

### 1. Configuración del Proyecto
Asegúrate de que tu repositorio tenga los últimos cambios, incluyendo:
- El script `start` y `postinstall` en el `package.json` raíz.
- La configuración en `server/server.js` para servir archivos estáticos (carpeta `dist`).

### 2. Crear Proyecto en Railway
1. Ve a tu dashboard de Railway.
2. Haz clic en **"New Project"**.
3. Selecciona **"Deploy from GitHub repo"**.
4. Selecciona tu repositorio.
5. Haz clic en "Add Variables" antes de desplegar, o configura las variables después.

### 3. Configurar Variables de Entorno
En la pestaña **Variables** de tu servicio en Railway, añade las siguientes:

- `NODE_ENV`: `production`
- `PORT`: `PORT` (Railway asigna esto automáticamente, pero es bueno declararlo para referencia, aunque no es necesario ponerle valor fijo).
- `VITE_API_URL`: `/` (Importante: esto asegura que el frontend se conecte al mismo dominio que el backend).

### 4. Configurar Persistencia (Importante para WhatsApp)
Para que no pierdas la sesión de WhatsApp cada vez que Railway reinicie tu servidor, necesitas un **Volumen**.

1. En tu servicio en Railway, ve a la pestaña **Settings**.
2. Baja hasta la sección **Provisions** o **Storage / Volumes**.
3. Haz clic en **Add Volume**.
4. Configura el volumen:
   - **Mount Path**: `/app/data` (Esta será la ruta persistente).
5. Agrega una nueva variable de entorno:
   - `SESSION_DIR`: `/app/data/baileys_sessions`

Esto le dirá al bot que guarde las credenciales de WhatsApp dentro del volumen persistente.

### 5. Build y Deploy
Railway detectará automáticamente el `package.json` en la raíz.
- Ejecutará `npm install` (que a su vez ejecutará `postinstall` para instalar dependencias del servidor).
- Ejecutará `npm run build` para construir el frontend (generando la carpeta `dist`).
- Ejecutará `npm start` para iniciar el servidor.

### 6. Verificar
Una vez desplegado, Railway te dará una URL (ej. `web-production-xxxx.up.railway.app`).
1. Entra a esa URL. Deberías ver tu aplicación web.
2. Abre la consola de desarrollador (F12) y verifica que las peticiones se hagan a ese mismo dominio (ej. `/api/status`).

## Solución de Problemas

- **Socket.io connection error**: Asegúrate de que `VITE_API_URL` esté configurado como `/` o como la URL completa de tu app en Railway (sin barra al final si usas url completa).
- **Error "not found" en rutas**: Si al recargar una página interna (ej. `/dashboard`) te da 404, asegúrate de que el backend esté configurado para redirigir todas las rutas desconocidas al `index.html` (esto ya está configurado en `server.js`).
