# 🎯 Implementación de Multimedia en Menús - Resumen

## ✅ Cambios Completados

### 1. Backend (`server/routes/menus.js`)
- ✅ Agregado soporte `multer` para subida de archivos
- ✅ POST `/api/menus` - Acepta archivos multimedia
- ✅ PUT `/api/menus/:id` - Acepta archivos multimedia
- ✅ POST `/api/menus/upload-option-media` - Endpoint para subir archivos de opciones

### 2. Types (`types.ts`)
- ✅ Agregado `mediaPaths` y `captions` a `InteractiveMenu`

### 3. API (`services/api.ts`)
- ✅ `createInteractiveMenu` - Acepta archivos
- ✅ `updateInteractiveMenu` - Acepta archivos
- ✅ `uploadOptionMedia` - Nueva función para subir archivos de opciones

---

## 🔄 Cambios Pendientes en MenuManager.tsx

### 1. Agregar Hook de Media para el Menú
```typescript
const menuMedia = useMedia({ maxFiles: 10 }); // Para el menú principal
const optionMedia = useMedia({ maxFiles: 10 }); // Para las opciones (ya existe)
```

### 2. Actualizar `saveOption` para Subir Archivos
```typescript
const saveOption = async () => {
    // ... validaciones
    
    // Subir archivos nuevos si hay
    const filesToUpload = optionMedia.mediaItems
        .filter(item => item.file) // Solo archivos nuevos
        .map(item => item.file!);
    
    let uploadedPaths: string[] = [];
    if (filesToUpload.length > 0) {
        const uploadResponse = await uploadOptionMedia(filesToUpload);
        if (uploadResponse.success) {
            uploadedPaths = uploadResponse.files.map((f: any) => f.path);
        }
    }
    
    // Combinar rutas existentes + nuevas
    const existingPaths = optionMedia.mediaItems
        .filter(item => !item.file && item.mediaPath)
        .map(item => item.mediaPath!);
    
    const mediaPaths = [...existingPaths, ...uploadedPaths];
    const captions = optionMedia.mediaItems.map(item => item.caption || '');
    
    const updatedOption = {
        ...editingOption,
        mediaPaths,
        captions
    };
    
    // ... guardar opción
};
```

### 3. Actualizar `handleSave` para Subir Archivos del Menú
```typescript
const handleSave = async () => {
    // ... validaciones
    
    // Extraer archivos nuevos del menú
    const menuFiles = menuMedia.mediaItems
        .filter(item => item.file)
        .map(item => item.file!);
    
    // Extraer rutas existentes
    const existingMenuPaths = menuMedia.mediaItems
        .filter(item => !item.file && item.mediaPath)
        .map(item => item.mediaPath!);
    
    const menuData = {
        name: formData.name!,
        message: formData.message!,
        options: formData.options!,
        isActive: formData.isActive ?? true,
        mediaPaths: existingMenuPaths,
        captions: menuMedia.mediaItems.map(item => item.caption || '')
    };
    
    if (editingId) {
        const response = await updateInteractiveMenu(editingId, menuData, menuFiles);
        // ...
    } else {
        const response = await createInteractiveMenu(menuData, menuFiles);
        // ...
    }
};
```

### 4. Actualizar `handleEdit` para Cargar Media del Menú
```typescript
const handleEdit = (menu: InteractiveMenu) => {
    setEditingId(menu.id);
    setFormData({ ...menu });
    
    // Cargar media del menú
    if (menu.mediaPaths && menu.mediaPaths.length > 0) {
        const mediaItems = menu.mediaPaths.map((path, index) => ({
            id: `menu-${index}`,
            mediaPath: path,
            caption: menu.captions?.[index] || '',
            file: undefined
        }));
        menuMedia.setMediaItems(mediaItems);
    } else {
        menuMedia.setMediaItems([]);
    }
};
```

### 5. Actualizar `resetForm` para Limpiar Media del Menú
```typescript
const resetForm = () => {
    setFormData({
        name: '',
        message: '',
        options: [],
        isActive: true
    });
    setEditingId(null);
    setFormErrors({});
    menuMedia.setMediaItems([]); // ← Agregar
};
```

### 6. Agregar MediaUpload al Formulario del Menú
```tsx
<div>
    <label className="block text-sm font-medium text-slate-700 mb-1">
        Mensaje del Menú
    </label>
    <textarea
        // ... props existentes
    />
</div>

{/* NUEVO: Media Upload para el Menú */}
<div>
    <label className="block text-sm font-medium text-slate-700 mb-2">
        Archivos Multimedia del Menú (opcional)
    </label>
    <MediaUpload
        mediaItems={menuMedia.mediaItems}
        onMediaChange={menuMedia.setMediaItems}
        maxFiles={10}
        fileInputRef={menuMedia.fileInputRef}
        onFileSelect={menuMedia.handleFileSelect}
        onDrop={menuMedia.handleDrop}
        onOpenFileSelector={menuMedia.openFileSelector}
        onRemoveMedia={menuMedia.removeMedia}
        onUpdateCaption={menuMedia.updateCaption}
    />
    <p className="text-xs text-slate-400 mt-2">
        Estos archivos se enviarán junto con el mensaje del menú.
    </p>
</div>

<div>
    <div className="flex items-center justify-between mb-2">
        <label>Opciones del Menú</label>
        // ...
    </div>
</div>
```

---

## 🎯 Flujo Completo

### Crear Menú con Multimedia

```
1. Usuario crea menú
2. Agrega nombre y mensaje
3. Agrega archivos multimedia al menú (nuevo)
4. Crea opciones
5. Agrega archivos multimedia a opciones (nuevo)
6. Click "Guardar Menú"
   ↓
7. MenuManager:
   - Sube archivos de opciones → uploadOptionMedia()
   - Obtiene rutas de archivos subidos
   - Actualiza opciones con rutas
   - Llama createInteractiveMenu(menuData, menuFiles)
   ↓
8. Backend:
   - Recibe FormData con archivos del menú
   - Guarda archivos en /uploads
   - Guarda menú con mediaPaths
   ↓
9. WhatsApp:
   - Usuario activa menú
   - Bot envía mensaje + archivos multimedia del menú
   - Usuario selecciona opción
   - Bot envía respuesta + archivos multimedia de la opción
```

---

## 📝 Notas de Implementación

### Manejo de Archivos en Opciones
- Los archivos de opciones se suben **antes** de guardar el menú
- Esto permite obtener las rutas del servidor
- Las rutas se guardan en `option.mediaPaths`

### Manejo de Archivos en Menú
- Los archivos del menú se envían junto con el FormData
- El backend los procesa y guarda
- Las rutas se agregan a `menu.mediaPaths`

### Edición
- Al editar, se cargan los archivos existentes (solo rutas)
- Se pueden agregar nuevos archivos
- Se pueden eliminar archivos existentes
- Al guardar, solo se suben los archivos nuevos

---

## ✅ Estado Actual

- [x] Backend acepta archivos multimedia
- [x] API functions actualizadas
- [x] Types actualizados
- [ ] MenuManager con media para menú
- [ ] MenuManager sube archivos de opciones
- [ ] UI completa

**Próximo paso**: Implementar cambios en MenuManager.tsx
