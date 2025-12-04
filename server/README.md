# WhatsApp Bot Backend - WhatyBot

Backend server para el bot de WhatsApp usando whatsapp-web.js con Chrome/Chromium.

## 🚀 Características

- ✅ Autenticación con código QR
- ✅ Persistencia de sesión (LocalAuth)
- ✅ Envío de mensajes individuales y masivos
- ✅ Soporte para medias pesadas (imágenes, videos, documentos hasta 100MB)
- ✅ Sistema de respuestas automáticas con palabras clave
- ✅ Extracción de grupos reales de WhatsApp
- ✅ Comunicación en tiempo real con Socket.io
- ✅ API REST completa

## 📋 Requisitos

- Node.js 16+ instalado
- WhatsApp en tu teléfono móvil

## 🔧 Instalación

1. **Instalar dependencias del backend:**

```bash
cd server
npm install
```

2. **Configurar variables de entorno:**

El archivo `.env` ya está configurado en la raíz del proyecto con:
```
PORT=3001
FRONTEND_URL=http://localhost:5173
SESSION_PATH=./server/.WhatyBot_auth
UPLOAD_DIR=./server/uploads
```

## ▶️ Ejecución

### Iniciar el servidor backend:

```bash
npm run server
```

El servidor se iniciará en `http://localhost:3001`

### Iniciar el frontend (en otra terminal):

```bash
npm install
npm run dev
```

El frontend se iniciará en `http://localhost:5173`

## 🔐 Autenticación

1. Al iniciar el servidor por primera vez, se generará un código QR
2. Abre el frontend en `http://localhost:5173`
3. Verás el código QR en el Dashboard
4. Escanea el código QR con WhatsApp:
   - Abre WhatsApp en tu teléfono
   - Ve a **Configuración** > **Dispositivos vinculados**
   - Toca **Vincular un dispositivo**
   - Escanea el código QR

5. La sesión se guardará automáticamente en `.wwebjs_auth`
6. En futuros reinicios, no necesitarás escanear el QR nuevamente

## 📡 API Endpoints

### Estado y Configuración

- `GET /api/status` - Obtener estado de conexión
- `GET /api/config` - Obtener configuración actual
- `POST /api/config` - Actualizar configuración
- `POST /api/logout` - Cerrar sesión y limpiar datos

### Mensajes

- `POST /api/messages/send` - Enviar mensaje individual
  ```json
  {
    "to": "5491234567890",
    "message": "Hola!"
  }
  ```

- `POST /api/messages/send-media` - Enviar mensaje con media
  ```
  FormData:
  - to: número de teléfono
  - message: texto del mensaje (opcional)
  - media: archivo (imagen, video, documento)
  ```

- `POST /api/messages/send-bulk` - Envío masivo
  ```
  FormData:
  - contacts: JSON array de contactos
  - message: mensaje con variables {{nombre}}
  - delay: delay entre mensajes en ms
  - media: archivo opcional
  ```

### Grupos

- `GET /api/groups` - Obtener todos los grupos de WhatsApp

### Contactos

- `GET /api/contacts` - Obtener todos los contactos

### Respuestas Automáticas

- `GET /api/auto-reply/rules` - Obtener todas las reglas
- `POST /api/auto-reply/rules` - Crear nueva regla
- `PUT /api/auto-reply/rules/:id` - Actualizar regla
- `DELETE /api/auto-reply/rules/:id` - Eliminar regla

## 🔌 Socket.io Events

### Eventos del servidor:

- `qr` - Código QR para autenticación
- `ready` - Cliente conectado y listo
- `authenticated` - Autenticación exitosa
- `disconnected` - Cliente desconectado
- `message_log` - Log de mensaje enviado
- `bulk_progress` - Progreso de envío masivo

## 📁 Estructura del Proyecto

```
server/
├── server.js              # Servidor principal Express + Socket.io
├── whatsapp.js           # Cliente WhatsApp con wwebjs
├── routes/
│   ├── messages.js       # Rutas de mensajes
│   ├── groups.js         # Rutas de grupos
│   ├── contacts.js       # Rutas de contactos
│   ├── autoReply.js      # Rutas de respuestas automáticas
│   └── config.js         # Rutas de configuración
├── data/
│   ├── autoReplyRules.json  # Reglas guardadas
│   └── config.json          # Configuración guardada
├── uploads/              # Archivos temporales de media
└── .wwebjs_auth/         # Sesión de WhatsApp (no commitear)
```

## ⚙️ Configuración Avanzada

### Usar Chrome personalizado:

En el frontend, ve a **Configuración** y especifica la ruta a tu Chrome:

**Windows:**
```
C:\Program Files\Google\Chrome\Application\chrome.exe
```

**macOS:**
```
/Applications/Google Chrome.app/Contents/MacOS/Google Chrome
```

**Linux:**
```
/usr/bin/google-chrome
```

### Modo Headless:

Por defecto, el navegador se ejecuta en modo visible. Para modo headless, actualiza la configuración desde el frontend.

## 🐛 Solución de Problemas

### El código QR no aparece:

1. Verifica que el backend esté corriendo en el puerto 3001
2. Revisa la consola del servidor para errores
3. Asegúrate de que no haya otra instancia corriendo

### Error de autenticación:

1. Elimina la carpeta `.wwebjs_auth`
2. Reinicia el servidor
3. Escanea el nuevo código QR

### Mensajes no se envían:

1. Verifica que estés conectado (indicador verde en el frontend)
2. Revisa los logs del servidor
3. Asegúrate de que los números tengan el formato correcto (código de país + número)

### Media pesada falla:

1. Verifica el tamaño del archivo (máximo 100MB)
2. Revisa el formato del archivo (jpg, png, mp4, pdf, etc.)
3. Aumenta el timeout si es necesario

## 📝 Notas Importantes

- **Números de teléfono:** Deben incluir código de país sin el símbolo +
  - Ejemplo: `5491234567890` (Argentina)
  - Ejemplo: `521234567890` (México)

- **Variables en mensajes:** Usa `{{variable}}` en el mensaje
  - Ejemplo: `Hola {{nombre}}, tu pedido {{pedido}} está listo`

- **Delay entre mensajes:** Recomendado mínimo 1000ms (1 segundo) para evitar bloqueos

- **Sesión:** La sesión se guarda automáticamente. No compartas la carpeta `.wwebjs_auth`

## 🔒 Seguridad

- No expongas el servidor directamente a internet sin autenticación
- Mantén la carpeta `.wwebjs_auth` privada
- Usa variables de entorno para datos sensibles
- Implementa rate limiting en producción

## 📞 Soporte

Si encuentras problemas:
1. Revisa los logs del servidor
2. Verifica la documentación de [whatsapp-web.js](https://wwebjs.dev/)
3. Asegúrate de tener la última versión de Node.js

## 🎯 Próximas Características

- [ ] Programación de mensajes
- [ ] Estadísticas avanzadas
- [ ] Webhooks para eventos
- [ ] Integración con bases de datos
- [ ] Panel de administración de usuarios
