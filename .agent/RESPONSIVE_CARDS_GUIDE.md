# Guía de Responsividad para Cards - WhatyBot

## ✅ Clases CSS Globales Agregadas

Se han agregado las siguientes utilidades CSS en `index.css`:

### 📝 Clases de Truncado de Texto
- `.truncate-2-lines` - Trunca texto a 2 líneas con ellipsis
- `.truncate-3-lines` - Trunca texto a 3 líneas con ellipsis

### 🔒 Prevención de Desbordamiento
- `.card-content-safe` - Asegura que el contenido nunca desborde (word-break, overflow-wrap)
- `.card-container` - Contenedor responsivo con min-width: 0

### 🏷️ Badges Responsivos
- `.badge-responsive` - Badge que trunca texto largo con ellipsis

### 🔘 Grupos de Botones
- `.button-group-responsive` - Contenedor flex que envuelve botones en múltiples líneas
- Los botones dentro se ajustan automáticamente con `flex: 1 1 auto`

### 📱 Números de Teléfono
- `.phone-number` - Optimiza la visualización de números (tabular-nums, letter-spacing)

## 🔧 Patrones de Aplicación

### 1. Cards con Iconos y Texto Largo

**ANTES:**
```tsx
<div className="bg-white p-6 rounded-xl flex items-center gap-4">
  <div className="p-4 rounded-full bg-green-100">
    <Icon size={24} />
  </div>
  <div>
    <p>Título</p>
    <h3>Texto muy largo que puede desbordar</h3>
  </div>
</div>
```

**DESPUÉS:**
```tsx
<div className="bg-white p-6 rounded-xl flex items-center gap-4">
  <div className="p-4 rounded-full bg-green-100 flex-shrink-0">
    <Icon size={24} />
  </div>
  <div className="flex-1 min-w-0">
    <p>Título</p>
    <h3 className="truncate">Texto muy largo que puede desbordar</h3>
  </div>
</div>
```

**Cambios clave:**
- `flex-shrink-0` en el icono para que no se comprima
- `flex-1 min-w-0` en el contenedor de texto para permitir truncado
- `truncate` en el texto largo

### 2. Números de Teléfono

**ANTES:**
```tsx
<h3 className="text-xl font-bold">
  Conectado: +51987422887
</h3>
```

**DESPUÉS:**
```tsx
<h3 className="text-xl font-bold truncate phone-number">
  Conectado: +51987422887
</h3>
```

### 3. Grupos de Botones

**ANTES:**
```tsx
<div className="flex gap-2">
  <button>Descargar Ejemplo</button>
  <button>Ver Instructivo</button>
</div>
```

**DESPUÉS:**
```tsx
<div className="button-group-responsive">
  <button className="whitespace-nowrap">Descargar Ejemplo</button>
  <button className="whitespace-nowrap">Ver Instructivo</button>
</div>
```

### 4. Badges que Pueden Ser Largos

**ANTES:**
```tsx
<span className="px-2 py-1 rounded-full text-xs bg-blue-100">
  Texto muy largo del badge
</span>
```

**DESPUÉS:**
```tsx
<span className="badge-responsive px-2 py-1 rounded-full text-xs bg-blue-100">
  Texto muy largo del badge
</span>
```

### 5. Texto Descriptivo Largo

**ANTES:**
```tsx
<p className="text-sm text-slate-600">
  Descripción muy larga que puede ocupar muchas líneas...
</p>
```

**DESPUÉS:**
```tsx
<p className="text-sm text-slate-600 truncate-3-lines">
  Descripción muy larga que puede ocupar muchas líneas...
</p>
```

## 📍 Componentes que Necesitan Actualización

### ✅ Ya Corregidos:
1. **Dashboard.tsx** - Card "Estado del Cliente" (número de teléfono)

### ⚠️ Pendientes de Corrección:

1. **MassSender.tsx** (línea 889-904)
   - Botones "Descargar Ejemplo" y "Ver Instructivo"
   - Aplicar: `button-group-responsive`

2. **ContactsManager.tsx**
   - Botón "Actualizar Grupos"
   - Nombres de grupos largos

3. **ScheduledMessages.tsx**
   - Números de teléfono en cards
   - Aplicar: `phone-number` y `truncate`

4. **AutoReply.tsx**
   - Botones "Exportar" e "Importar"
   - Nombres de reglas largas
   - Aplicar: `button-group-responsive` y `truncate`

5. **SessionManager.tsx**
   - Números de sesión largos
   - Aplicar: `phone-number` y `truncate`

## 🎯 Checklist de Revisión

Para cada card, verificar:

- [ ] Los iconos tienen `flex-shrink-0`
- [ ] Los contenedores de texto tienen `flex-1 min-w-0`
- [ ] Los textos largos tienen `truncate` o `truncate-X-lines`
- [ ] Los números de teléfono tienen `phone-number`
- [ ] Los grupos de botones usan `button-group-responsive`
- [ ] Los botones tienen `whitespace-nowrap` si es necesario
- [ ] Los badges largos usan `badge-responsive`
- [ ] Los cards tienen `overflow: hidden` (ya aplicado globalmente)

## 🔍 Cómo Probar

1. Reducir el ancho de la ventana a ~400px
2. Verificar que ningún contenido desborde horizontalmente
3. Verificar que los botones se envuelvan en múltiples líneas si es necesario
4. Verificar que los textos largos muestren ellipsis (...)
5. Verificar que los números de teléfono se muestren correctamente

## 📱 Breakpoints Recomendados

- **Mobile**: < 640px - Todos los elementos deben ser de ancho completo
- **Tablet**: 640px - 1024px - Botones pueden estar en línea si hay espacio
- **Desktop**: > 1024px - Layout normal

## 💡 Notas Adicionales

- Las clases globales ya previenen desbordamiento en backgrounds comunes
- `box-sizing: border-box` está aplicado globalmente
- Los scrollbars personalizados no afectan el layout
- Usar `min-w-0` es crucial para que `truncate` funcione en flex containers
