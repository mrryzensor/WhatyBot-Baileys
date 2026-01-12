# Agregar Barra de Formato a MenuManager

## Objetivo
Agregar el componente `MessageEditorToolbar` a todos los campos de texto de mensaje en el MenuManager (mensaje del menú, mensaje de opciones, mensaje de submenús).

## Pasos a Seguir

### 1. Agregar Importación

En la línea 1-10 de `MenuManager.tsx`, agregar:

```tsx
import { MessageEditorToolbar } from './MessageEditorToolbar';
```

### 2. Crear Refs para los Textareas

Después de las declaraciones de estado (alrededor de la línea 30-60), agregar:

```tsx
// Refs para los textareas del editor de formato
const menuMessageRef = useRef<HTMLTextAreaElement>(null);
const optionMessageRefs = useRef<{ [key: string]: HTMLTextAreaElement | null }>({});
```

### 3. Actualizar el Campo "Mensaje del Menú"

**Ubicación**: Líneas 805-826

**Antes**:
```tsx
<div>
    <label className="block text-sm font-medium text-slate-700 mb-1">
        Mensaje del Menú <span className="text-slate-400 text-xs font-normal">(opcional si hay captions)</span>
    </label>
    <textarea
        className={`w-full border rounded-lg px-4 py-2 text-sm focus:ring-blue-500 focus:border-blue-500 resize-none ${formErrors.message ? 'border-red-300' : 'border-slate-300'}`}
        placeholder="¡Hola! 👋 ¿En qué puedo ayudarte?&#10;&#10;1️⃣ Información&#10;2️⃣ Precios&#10;3️⃣ Soporte"
        rows={6}
        value={formData.message}
        onChange={e => {
            setFormData({ ...formData, message: e.target.value });
            if (formErrors.message) setFormErrors({ ...formErrors, message: '' });
        }}
    />
    {formErrors.message && (
        <p className="mt-1 text-sm text-red-600">{formErrors.message}</p>
    )}
    <p className="text-xs text-slate-400 mt-1">
        Este mensaje se mostrará cuando el usuario entre al menú...
    </p>
</div>
```

**Después**:
```tsx
<div>
    <label className="block text-sm font-medium text-slate-700 mb-1">
        Mensaje del Menú <span className="text-slate-400 text-xs font-normal">(opcional si hay captions)</span>
    </label>
    
    {/* Barra de Formato */}
    <MessageEditorToolbar
        textareaRef={menuMessageRef}
        value={formData.message}
        onChange={(value) => {
            setFormData({ ...formData, message: value });
            if (formErrors.message) setFormErrors({ ...formErrors, message: '' });
        }}
        showVariables={false}
    />
    
    <textarea
        ref={menuMessageRef}
        className={`w-full border rounded-lg px-4 py-2 text-sm focus:ring-blue-500 focus:border-blue-500 resize-none mt-2 ${formErrors.message ? 'border-red-300' : 'border-slate-300'}`}
        placeholder="¡Hola! 👋 ¿En qué puedo ayudarte?&#10;&#10;1️⃣ Información&#10;2️⃣ Precios&#10;3️⃣ Soporte"
        rows={6}
        value={formData.message}
        onChange={e => {
            setFormData({ ...formData, message: e.target.value });
            if (formErrors.message) setFormErrors({ ...formErrors, message: '' });
        }}
    />
    {formErrors.message && (
        <p className="mt-1 text-sm text-red-600">{formErrors.message}</p>
    )}
    <p className="text-xs text-slate-400 mt-1">
        Este mensaje se mostrará cuando el usuario entre al menú...
    </p>
</div>
```

### 4. Actualizar Campos de Mensaje de Opciones

Buscar todos los textareas que tengan `placeholder` relacionado con opciones del menú.

**Patrón a buscar**:
```tsx
<textarea
    placeholder="Escribe el mensaje de respuesta para esta opción..."
```

**Agregar antes del textarea**:
```tsx
<MessageEditorToolbar
    textareaRef={{
        current: optionMessageRefs.current[option.id] || null
    } as React.RefObject<HTMLTextAreaElement>}
    value={option.message || ''}
    onChange={(value) => updateOption(index, 'message', value)}
    showVariables={false}
/>
```

**Agregar ref al textarea**:
```tsx
<textarea
    ref={(el) => {
        if (el) optionMessageRefs.current[option.id] = el;
    }}
    // ... resto de props
/>
```

### 5. Actualizar Campos de Mensaje de Submenús

Similar al paso 4, pero para los submenús.

**Buscar**:
```tsx
<textarea
    placeholder="Mensaje del submenú..."
```

**Agregar la barra de formato antes del textarea y el ref correspondiente.**

## Notas Importantes

1. **showVariables={false}**: No mostrar variables en el MenuManager ya que no se usan en este contexto
2. **mt-2**: Agregar margen superior al textarea para separarlo de la barra de formato
3. **Refs**: Asegurarse de que cada textarea tenga su ref correspondiente
4. **onChange**: La función onChange debe actualizar tanto el estado como pasar el valor a la barra de formato

## Archivos a Modificar

- `components/MenuManager.tsx`

## Componentes Utilizados

- `MessageEditorToolbar` (ya existe en `components/MessageEditorToolbar.tsx`)
- Hook `useMessageEditor` (ya existe en `hooks/useMessageEditor.ts`)

## Resultado Esperado

Todos los campos de texto de mensaje en el MenuManager tendrán:
- Barra de formato con botones para negrita, cursiva, tachado, código, etc.
- Selector de emojis
- Botones para listas y citas
- Funcionalidad completa de formato de WhatsApp
