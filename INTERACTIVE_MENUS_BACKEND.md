# Sistema de Menús Interactivos - Implementación Backend

## ✅ Implementado

### 1. **Tipos e Interfaces** (types.ts)

#### Nuevas Interfaces
```typescript
export interface MenuOption {
  id: string;
  label: string; // Etiqueta para mostrar
  triggers: string[]; // ['1', 'info', 'información']
  response?: string; // Respuesta directa
  mediaPaths?: string[]; // Archivos multimedia
  captions?: string[]; // Captions para multimedia
  nextMenuId?: string; // ID del siguiente menú
  endConversation?: boolean; // Terminar conversación
}

export interface InteractiveMenu {
  id: string;
  name: string;
  message: string; // Mensaje al entrar al menú
  options: MenuOption[];
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface UserSession {
  userId: string; // WhatsApp ID
  currentMenuId: string; // Menú actual
  conversationData?: any; // Datos de contexto
  startTime: string;
  lastInteraction: string;
}
```

#### AutoReplyRule Actualizado
```typescript
export interface AutoReplyRule {
  // ... campos existentes ...
  type?: 'simple' | 'menu'; // Nuevo: tipo de respuesta
  menuId?: string; // Nuevo: ID del menú si type === 'menu'
}
```

---

### 2. **Backend - WhatsApp Client** (server/whatsapp.js)

#### Nuevas Propiedades
```javascript
this.interactiveMenus = []; // Menús interactivos
this.userSessions = new Map(); // Sesiones activas
this.sessionTimeout = 15 * 60 * 1000; // 15 minutos
```

#### Funciones de Gestión de Menús
- ✅ `loadInteractiveMenus()` - Cargar desde JSON
- ✅ `saveInteractiveMenus()` - Guardar en JSON
- ✅ Archivo: `server/data/interactiveMenus.json`

#### Funciones de Gestión de Sesiones
- ✅ `loadUserSessions()` - Cargar sesiones
- ✅ `saveUserSessions()` - Guardar sesiones
- ✅ `cleanExpiredSessions()` - Limpiar expiradas
- ✅ `getSession(userId)` - Obtener sesión
- ✅ `setSession(userId, menuId, data)` - Crear sesión
- ✅ `updateSession(userId, menuId, data)` - Actualizar sesión
- ✅ `clearSession(userId)` - Eliminar sesión
- ✅ Archivo: `server/data/userSessions.json`

#### Manejo de Mensajes
```javascript
// 1. Verificar sesión activa PRIMERO
const session = this.getSession(from);
if (session) {
  const handled = await this.handleMenuInteraction(...);
  if (handled) return; // No procesar auto-replies
}

// 2. Procesar auto-replies
for (const rule of this.autoReplyRules) {
  if (rule.type === 'menu' && rule.menuId) {
    // Iniciar sesión de menú
    const menu = this.interactiveMenus.find(m => m.id === rule.menuId);
    await this.sendMessage(from, menu.message);
    this.setSession(from, menu.id);
  } else {
    // Auto-reply simple (normal)
    await this.sendMessage(from, rule.response, ...);
  }
}
```

#### Función handleMenuInteraction
```javascript
async handleMenuInteraction(userId, messageText, session, ...) {
  // 1. Obtener menú actual
  const currentMenu = this.interactiveMenus.find(m => m.id === session.currentMenuId);
  
  // 2. Buscar opción que coincida
  const matchedOption = currentMenu.options.find(option => 
    option.triggers.some(trigger => 
      messageText.toLowerCase().includes(trigger.toLowerCase())
    )
  );
  
  // 3. Si no coincide, enviar error
  if (!matchedOption) {
    await this.sendMessage(userId, '❌ Opción no válida...');
    return true;
  }
  
  // 4. Enviar respuesta de la opción
  if (matchedOption.response) {
    await this.sendMessage(userId, matchedOption.response, ...);
  }
  
  // 5. Navegar
  if (matchedOption.endConversation) {
    this.clearSession(userId);
  } else if (matchedOption.nextMenuId) {
    const nextMenu = this.interactiveMenus.find(m => m.id === matchedOption.nextMenuId);
    await this.sendMessage(userId, nextMenu.message);
    this.updateSession(userId, nextMenu.id);
  }
  
  return true;
}
```

---

### 3. **API Routes** (server/routes/menus.js)

#### Endpoints Creados
```
GET    /api/menus              - Listar todos los menús
POST   /api/menus              - Crear nuevo menú
PUT    /api/menus/:id          - Actualizar menú
DELETE /api/menus/:id          - Eliminar menú
GET    /api/menus/sessions     - Listar sesiones activas
DELETE /api/menus/sessions/:id - Limpiar sesión de usuario
```

#### Registro en server.js
```javascript
import menusRouter from './routes/menus.js';
app.use('/api/menus', menusRouter);
```

---

## 🎯 Flujo de Funcionamiento

### Ejemplo: Menú de Información

#### 1. Configuración del Menú
```json
{
  "id": "main",
  "name": "Menú Principal",
  "message": "¡Hola! 👋 ¿En qué puedo ayudarte?\n\n1️⃣ Información\n2️⃣ Precios\n3️⃣ Soporte\n\nResponde con el número",
  "isActive": true,
  "options": [
    {
      "id": "opt1",
      "label": "Información",
      "triggers": ["1", "info", "información"],
      "nextMenuId": "info"
    },
    {
      "id": "opt2",
      "label": "Precios",
      "triggers": ["2", "precio", "precios"],
      "response": "Nuestros precios son...",
      "endConversation": true
    }
  ]
}
```

#### 2. Auto-Reply que Inicia el Menú
```json
{
  "id": "rule1",
  "name": "Iniciar Menú",
  "keywords": ["hola", "menu", "ayuda"],
  "type": "menu",
  "menuId": "main",
  "isActive": true
}
```

#### 3. Flujo de Conversación
```
Usuario: "hola"
  ↓
Bot detecta keyword "hola" en auto-reply
  ↓
Auto-reply type === 'menu'
  ↓
Bot envía mensaje del menú "main"
Bot crea sesión: { userId, currentMenuId: "main" }
  ↓
Usuario: "1"
  ↓
Bot detecta sesión activa
  ↓
handleMenuInteraction() procesa "1"
  ↓
Encuentra opción con trigger "1"
  ↓
nextMenuId === "info"
  ↓
Bot envía mensaje del menú "info"
Bot actualiza sesión: { currentMenuId: "info" }
  ↓
Usuario: "0" (volver)
  ↓
Bot navega a menú anterior o termina
```

---

## 📁 Archivos Creados/Modificados

### Creados
1. ✅ `server/routes/menus.js` - API routes para menús
2. ✅ `server/data/interactiveMenus.json` - Storage de menús (auto-creado)
3. ✅ `server/data/userSessions.json` - Storage de sesiones (auto-creado)

### Modificados
1. ✅ `types.ts` - Nuevas interfaces
2. ✅ `server/whatsapp.js` - Lógica de menús y sesiones
3. ✅ `server/server.js` - Registro de rutas

---

## 🔄 Persistencia

### Menús
- **Archivo**: `server/data/interactiveMenus.json`
- **Formato**: Array de InteractiveMenu
- **Guardado**: Automático en cada cambio

### Sesiones
- **Archivo**: `server/data/userSessions.json`
- **Formato**: Array de UserSession
- **Guardado**: Automático en cada cambio
- **Limpieza**: Al cargar (elimina expiradas)
- **Timeout**: 15 minutos de inactividad

---

## ⏱️ Gestión de Sesiones

### Timeout
- **Duración**: 15 minutos (configurable)
- **Verificación**: En cada `getSession()`
- **Limpieza**: Al cargar sesiones

### Estados de Sesión
```javascript
// Sesión activa
{
  userId: "51987422887@s.whatsapp.net",
  currentMenuId: "main",
  conversationData: {},
  startTime: "2025-12-30T18:00:00.000Z",
  lastInteraction: "2025-12-30T18:05:00.000Z"
}

// Sesión expirada (auto-eliminada)
// lastInteraction + 15min < now
```

---

## 🎨 Características Implementadas

### ✅ Menús Interactivos
- Múltiples opciones por menú
- Triggers flexibles (números, palabras)
- Navegación entre menús
- Fin de conversación

### ✅ Respuestas Ricas
- Texto
- Multimedia (imágenes, videos, documentos)
- Captions individuales

### ✅ Gestión de Sesiones
- Timeout automático
- Persistencia en disco
- Limpieza de expiradas

### ✅ Integración con Auto-Replies
- Auto-replies pueden iniciar menús
- Menús tienen prioridad sobre auto-replies
- Coexistencia pacífica

---

## 📝 Próximos Pasos

### Frontend (Pendiente)
1. ⏳ Componente MenuManager
2. ⏳ UI para crear/editar menús
3. ⏳ UI para crear/editar opciones
4. ⏳ Visualización de sesiones activas
5. ⏳ Integración con AutoReplyManager

### Características Avanzadas (Futuro)
- Variables de contexto
- Condiciones dinámicas
- Integración con APIs
- Analytics de flujos
- Webhooks

---

## 🎉 Estado Actual

**Backend**: ✅ 100% Implementado
**Frontend**: ⏳ 0% Implementado
**Testing**: ⏳ Pendiente

¡El backend está listo para usar! Ahora necesitamos crear la UI en el frontend.
