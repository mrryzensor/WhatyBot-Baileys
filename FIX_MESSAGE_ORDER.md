# 🔧 Fix: Orden de Envío de Mensajes en WhatsApp

## ❌ Problema

Cuando se enviaba una respuesta de opción de menú con multimedia, los archivos se enviaban **antes** que el mensaje de texto, lo cual no es el orden deseado.

### Comportamiento Anterior
```
Usuario: "1"
  ↓
Bot: [Envía imagen1.jpg] "Caption 1"
Bot: [Envía imagen2.jpg] "Caption 2"
Bot: "👕 Catálogo de Ropa:"  ← Texto al final
```

### Comportamiento Deseado
```
Usuario: "1"
  ↓
Bot: "👕 Catálogo de Ropa:"  ← Texto primero
Bot: [Envía imagen1.jpg] "Caption 1"
Bot: [Envía imagen2.jpg] "Caption 2"
```

---

## ✅ Solución

Actualizado la función `sendMessage` en `server/whatsapp.js` para invertir el orden de envío.

### Antes (Líneas 922-957)
```javascript
async sendMessage(to, message = '', mediaPath = null, caption = '') {
    // ... setup
    
    // 1. Enviar archivos multimedia PRIMERO
    for (let i = 0; i < mediaPaths.length; i++) {
        // ... enviar cada archivo
    }
    
    // 2. Enviar mensaje de texto DESPUÉS
    if (message && message.trim()) {
        await this.sock.sendMessage(jid, { text: message });
    }
}
```

### Después (Correcto)
```javascript
async sendMessage(to, message = '', mediaPath = null, caption = '') {
    // ... setup
    
    // 1. Enviar mensaje de texto PRIMERO
    if (message && message.trim()) {
        await this.sock.sendMessage(jid, { text: message });
    }
    
    // 2. Enviar archivos multimedia DESPUÉS
    for (let i = 0; i < mediaPaths.length; i++) {
        // ... enviar cada archivo
    }
}
```

---

## 🎯 Impacto

Este cambio afecta a **todas** las funciones que envían mensajes con multimedia:

### 1. Menús Interactivos
```javascript
// handleMenuInteraction()
if (matchedOption.response) {
    const mediaPaths = matchedOption.mediaPaths || [];
    const captions = matchedOption.captions || [];
    await this.sendMessage(userId, matchedOption.response, mediaPaths, captions);
}
```

**Resultado**:
- ✅ Primero: Mensaje de respuesta
- ✅ Después: Archivos multimedia con captions

### 2. Auto-Respuestas
```javascript
// Auto-reply con multimedia
await this.sendMessage(from, rule.response, rule.mediaPaths, rule.captions);
```

**Resultado**:
- ✅ Primero: Mensaje de respuesta
- ✅ Después: Archivos multimedia

### 3. Mensajes Individuales
```javascript
// Envío manual desde frontend
await this.sendMessage(phone, message, mediaPaths, captions);
```

**Resultado**:
- ✅ Primero: Mensaje de texto
- ✅ Después: Archivos multimedia

### 4. Campañas Masivas
```javascript
// sendBulkMessages() usa sendMessage internamente
await this.sendMessage(contact.phone, personalizedMessage, mediaPath, effectiveCaption);
```

**Resultado**:
- ✅ Primero: Mensaje personalizado
- ✅ Después: Archivos multimedia

---

## 📝 Ejemplo Completo

### Menú de Catálogo

```javascript
// Opción configurada
{
  label: "Ver Ropa",
  triggers: ["1", "ropa"],
  response: "👕 Catálogo de Ropa:\n\nAquí están nuestros productos:",
  mediaPaths: [
    "uploads/ropa1.jpg",
    "uploads/ropa2.jpg",
    "uploads/ropa3.jpg"
  ],
  captions: [
    "Camisetas - $15-$25",
    "Pantalones - $30-$50",
    "Zapatos - $40-$80"
  ]
}
```

### Flujo en WhatsApp (Correcto)

```
Usuario: "1"
  ↓
Bot: "👕 Catálogo de Ropa:

Aquí están nuestros productos:"
  ↓
Bot: [Envía ropa1.jpg]
     "Camisetas - $15-$25"
  ↓
Bot: [Envía ropa2.jpg]
     "Pantalones - $30-$50"
  ↓
Bot: [Envía ropa3.jpg]
     "Zapatos - $40-$80"
```

---

## 🔄 Orden de Envío Detallado

### Función sendMessage()

```javascript
1. Validaciones (sock, isReady)
2. Resolver JID
3. Normalizar mediaPaths y captions
4. ✅ ENVIAR TEXTO (si existe)
   await this.sock.sendMessage(jid, { text: message });
5. ✅ ENVIAR ARCHIVOS (loop)
   for cada archivo:
     - Leer archivo
     - Determinar tipo (imagen/video/audio/documento)
     - Enviar con caption
     - Emitir progreso
6. Return success
```

---

## ✅ Testing

### Test 1: Menú con Multimedia
```
1. Crear menú con opción que tenga:
   - Respuesta: "Aquí está el catálogo"
   - 2 imágenes con captions
2. Activar menú
3. Seleccionar opción
✅ Debe enviar primero el texto
✅ Luego las imágenes
```

### Test 2: Auto-Reply con Multimedia
```
1. Crear auto-reply con:
   - Response: "Hola, aquí está la info"
   - 1 PDF con caption
2. Enviar keyword
✅ Debe enviar primero el texto
✅ Luego el PDF
```

### Test 3: Mensaje Individual
```
1. Enviar mensaje individual con:
   - Texto: "Mira esto"
   - 3 imágenes
2. Enviar
✅ Debe enviar primero el texto
✅ Luego las imágenes
```

### Test 4: Campaña Masiva
```
1. Crear campaña con:
   - Mensaje: "Hola {{nombre}}"
   - 1 imagen
2. Enviar a 5 contactos
✅ Cada contacto debe recibir primero el texto
✅ Luego la imagen
```

---

## 📁 Archivo Modificado

**Archivo**: `server/whatsapp.js`
**Función**: `sendMessage()`
**Líneas**: 905-962

**Cambio**:
- Movido el envío de texto (líneas 955-957) **antes** del loop de archivos (líneas 922-953)

---

## 🎯 Resultado

### Antes
- ❌ Archivos multimedia primero
- ❌ Mensaje de texto después
- ❌ Orden confuso para el usuario

### Después
- ✅ Mensaje de texto primero
- ✅ Archivos multimedia después
- ✅ Orden lógico y claro

---

## 📝 Notas

### Compatibilidad
- ✅ Mantiene compatibilidad con código existente
- ✅ No requiere cambios en llamadas a `sendMessage()`
- ✅ Funciona con todos los tipos de multimedia

### Performance
- ✅ Sin impacto en performance
- ✅ Mismo número de llamadas a WhatsApp
- ✅ Solo cambia el orden

### Casos Especiales
- Si `message` está vacío, solo envía archivos
- Si `mediaPaths` está vacío, solo envía texto
- Si ambos están vacíos, retorna success sin enviar nada

---

## ✅ Estado Final

**Orden de envío corregido:**
1. ✅ Texto primero
2. ✅ Multimedia después
3. ✅ Aplicado a todas las funcionalidades
4. ✅ Sin breaking changes

**¡Problema resuelto!** 🎉
