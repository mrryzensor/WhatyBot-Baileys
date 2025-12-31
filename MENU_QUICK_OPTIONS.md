# ✨ Opciones Rápidas para Menús

## 🎯 Funcionalidad Implementada

Se han agregado **opciones rápidas predefinidas** que permiten añadir fácilmente acciones comunes a los menús interactivos.

---

## 🚀 Opciones Disponibles

### 1. 🏠 **Menú Principal**
- **Función**: Navega al primer menú (menú principal)
- **Triggers predefinidos**: `0`, `menu`, `inicio`, `principal`
- **Respuesta**: "Volviendo al menú principal..."
- **Acción**: Navega al primer menú de la lista

### 2. ❌ **Salir**
- **Función**: Termina la conversación del menú
- **Triggers predefinidos**: `salir`, `exit`, `cancelar`, `terminar`
- **Respuesta**: "¡Hasta pronto! 👋"
- **Acción**: Finaliza la sesión del menú

---

## 🎨 Ubicación en la UI

Los botones de opciones rápidas están ubicados debajo del botón "Agregar Opción":

```
┌─────────────────────────────────────┐
│ Opciones del Menú  [+ Agregar Opción]│
│                                     │
│ [🏠 Menú Principal] [❌ Salir]      │ ← Nuevos botones
│                                     │
│ Lista de opciones...                │
└─────────────────────────────────────┘
```

---

## 💡 Cómo Usar

### Agregar Opción "Menú Principal"

```
1. Estar editando un menú
2. Click en "🏠 Menú Principal"
3. Se abre el editor con la opción prellenada:
   - Etiqueta: "🏠 Menú Principal"
   - Triggers: "0, menu, inicio, principal"
   - Respuesta: "Volviendo al menú principal..."
   - Acción: Ir a primer menú
4. Personalizar si es necesario
5. Click "Guardar Opción"
```

### Agregar Opción "Salir"

```
1. Estar editando un menú
2. Click en "❌ Salir"
3. Se abre el editor con la opción prellenada:
   - Etiqueta: "❌ Salir"
   - Triggers: "salir, exit, cancelar, terminar"
   - Respuesta: "¡Hasta pronto! 👋"
   - Acción: Terminar conversación
4. Personalizar si es necesario
5. Click "Guardar Opción"
```

---

## 🔧 Implementación

### Función `addQuickOption`

```typescript
const addQuickOption = (type: 'main' | 'exit') => {
    if (type === 'main') {
        // Go to main menu - find first menu
        const mainMenu = menus.length > 0 ? menus[0] : null;
        setEditingOption({
            id: Date.now().toString(),
            label: '🏠 Menú Principal',
            triggers: ['0', 'menu', 'inicio', 'principal'],
            response: 'Volviendo al menú principal...',
            mediaPaths: [],
            captions: [],
            nextMenuId: mainMenu?.id,
            endConversation: false
        });
    } else if (type === 'exit') {
        // Exit menu
        setEditingOption({
            id: Date.now().toString(),
            label: '❌ Salir',
            triggers: ['salir', 'exit', 'cancelar', 'terminar'],
            response: '¡Hasta pronto! 👋',
            mediaPaths: [],
            captions: [],
            nextMenuId: undefined,
            endConversation: true
        });
    }
    optionMedia.setMediaItems([]);
    setShowOptionEditor(true);
};
```

### Botones UI

```tsx
<div className="flex gap-2 mb-3">
    <button
        onClick={() => addQuickOption('main')}
        className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-green-50 text-green-600 rounded-lg hover:bg-green-100"
        title="Agregar opción para volver al menú principal"
    >
        🏠 Menú Principal
    </button>
    <button
        onClick={() => addQuickOption('exit')}
        className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100"
        title="Agregar opción para salir del menú"
    >
        ❌ Salir
    </button>
</div>
```

---

## 📝 Ejemplo de Uso

### Menú de Productos con Navegación

```javascript
{
  name: "Menú de Productos",
  message: "Selecciona una categoría:",
  options: [
    {
      label: "Ropa",
      triggers: ["1", "ropa"],
      response: "Catálogo de ropa...",
      nextMenuId: "menu-ropa"
    },
    {
      label: "Electrónicos",
      triggers: ["2", "electronicos"],
      response: "Catálogo de electrónicos...",
      nextMenuId: "menu-electronicos"
    },
    // Opción rápida agregada
    {
      label: "🏠 Menú Principal",
      triggers: ["0", "menu", "inicio", "principal"],
      response: "Volviendo al menú principal...",
      nextMenuId: "menu-principal-id"
    },
    // Opción rápida agregada
    {
      label: "❌ Salir",
      triggers: ["salir", "exit", "cancelar", "terminar"],
      response: "¡Hasta pronto! 👋",
      endConversation: true
    }
  ]
}
```

### Flujo en WhatsApp

```
Bot: "Selecciona una categoría:

1️⃣ Ropa
2️⃣ Electrónicos
0️⃣ Menú Principal
❌ Salir"

Usuario: "0"
  ↓
Bot: "Volviendo al menú principal..."
Bot: [Muestra menú principal]

---

Usuario: "salir"
  ↓
Bot: "¡Hasta pronto! 👋"
[Sesión terminada]
```

---

## 🎯 Casos de Uso

### 1. Menú Multinivel
```
Menú Principal
  ├─ Productos
  │   ├─ Ropa
  │   ├─ Electrónicos
  │   ├─ 🏠 Menú Principal ← Opción rápida
  │   └─ ❌ Salir ← Opción rápida
  └─ Servicios
      ├─ Consultoría
      ├─ Soporte
      ├─ 🏠 Menú Principal ← Opción rápida
      └─ ❌ Salir ← Opción rápida
```

### 2. Menú de Ayuda
```
Opciones:
1️⃣ FAQ
2️⃣ Contacto
3️⃣ Tutoriales
0️⃣ Menú Principal ← Siempre presente
❌ Salir ← Siempre presente
```

### 3. Menú de Configuración
```
Opciones:
1️⃣ Cambiar idioma
2️⃣ Notificaciones
3️⃣ Privacidad
0️⃣ Volver al inicio ← Opción rápida
❌ Cancelar ← Opción rápida
```

---

## ✨ Personalización

Las opciones rápidas son **plantillas editables**:

### Personalizar Triggers
```
Original: ["0", "menu", "inicio", "principal"]
Personalizado: ["0", "volver", "atras", "home"]
```

### Personalizar Respuesta
```
Original: "Volviendo al menú principal..."
Personalizado: "Te llevo al inicio 🏠"
```

### Personalizar Etiqueta
```
Original: "🏠 Menú Principal"
Personalizado: "⬅️ Volver al Inicio"
```

### Agregar Multimedia
```
Puedes agregar imágenes, videos o documentos
a las opciones rápidas después de crearlas
```

---

## 🔄 Comportamiento

### Opción "Menú Principal"

1. **Detecta primer menú**: Usa el primer menú de la lista
2. **Navega automáticamente**: `nextMenuId` se configura automáticamente
3. **Mantiene sesión**: No termina la conversación
4. **Múltiples triggers**: Acepta varios comandos

### Opción "Salir"

1. **Termina sesión**: `endConversation: true`
2. **Limpia estado**: Usuario sale del sistema de menús
3. **Mensaje de despedida**: Respuesta personalizable
4. **Vuelve a auto-replies**: Después de salir, vuelven a funcionar las auto-replies normales

---

## 🧪 Testing

### Test 1: Agregar Opción Menú Principal
```
1. Editar menú
2. Click "🏠 Menú Principal"
3. Verificar que se abre editor con datos prellenados
4. Guardar
✅ Opción debe agregarse al menú
✅ Debe navegar al primer menú al usarla
```

### Test 2: Agregar Opción Salir
```
1. Editar menú
2. Click "❌ Salir"
3. Verificar datos prellenados
4. Guardar
✅ Opción debe agregarse al menú
✅ Debe terminar conversación al usarla
```

### Test 3: Personalizar Opción Rápida
```
1. Click en opción rápida
2. Modificar triggers y respuesta
3. Guardar
✅ Debe guardar con cambios personalizados
```

### Test 4: Usar en WhatsApp
```
1. Activar menú con opciones rápidas
2. Enviar "0" (menú principal)
✅ Debe navegar al primer menú
3. Enviar "salir"
✅ Debe terminar conversación
```

---

## 📁 Archivo Modificado

**Archivo**: `components/MenuManager.tsx`

**Cambios**:
1. ✅ Función `addQuickOption()` (línea ~352)
2. ✅ Botones UI de opciones rápidas (línea ~682)

---

## 💡 Ventajas

### Para Usuarios
- ✅ Navegación más fácil entre menús
- ✅ Forma rápida de volver al inicio
- ✅ Opción clara para salir

### Para Administradores
- ✅ Creación rápida de opciones comunes
- ✅ Menos tiempo configurando menús
- ✅ Consistencia en todos los menús
- ✅ Plantillas editables

### Para el Sistema
- ✅ Mejor experiencia de usuario
- ✅ Navegación más intuitiva
- ✅ Menos usuarios perdidos en menús
- ✅ Salida clara del sistema de menús

---

## 🎨 Diseño Visual

### Botones de Opciones Rápidas
```
┌─────────────────────────────────────┐
│ [🏠 Menú Principal] [❌ Salir]      │
│  Verde claro         Rojo claro     │
│  Hover: Verde        Hover: Rojo    │
└─────────────────────────────────────┘
```

### Opción en Lista
```
┌─────────────────────────────────────┐
│ 🏠 Menú Principal                   │
│ Triggers: 0, menu, inicio, principal│
│ → Ir a: Menú Principal              │
│ [Editar] [Eliminar]                 │
└─────────────────────────────────────┘
```

---

## ✅ Resultado

### Antes
- ❌ Crear opciones de navegación manualmente
- ❌ Configurar triggers uno por uno
- ❌ Recordar qué ID es el menú principal
- ❌ Configurar endConversation manualmente

### Después
- ✅ Un click para agregar opción de navegación
- ✅ Triggers predefinidos y editables
- ✅ Menú principal detectado automáticamente
- ✅ Configuración automática de acciones
- ✅ Plantillas personalizables

**¡Creación de menús más rápida y eficiente!** 🚀
