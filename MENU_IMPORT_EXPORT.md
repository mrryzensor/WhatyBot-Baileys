# ✅ Import/Export de Menús Interactivos

## 🎯 Funcionalidad Implementada

Se ha agregado la capacidad de **exportar** e **importar** menús interactivos en formato JSON.

---

## 📊 Características

### 1. **Exportar Menús**
- Descarga todos los menús como archivo JSON
- Nombre de archivo: `menus-export-YYYY-MM-DD.json`
- Incluye todas las opciones, multimedia y configuraciones
- Formato legible (pretty-printed)

### 2. **Importar Menús**
- Importa menús desde archivo JSON
- Genera nuevos IDs automáticamente
- Valida campos requeridos
- Reporta menús importados y omitidos
- Muestra errores si los hay

---

## 🔧 Implementación

### Backend (`server/routes/menus.js`)

#### GET /api/menus/export
```javascript
router.get('/export', (req, res) => {
    const whatsappClient = req.app.get('whatsappClient');
    const menus = whatsappClient.interactiveMenus || [];
    
    res.json({ 
        success: true, 
        menus,
        exportDate: new Date().toISOString(),
        count: menus.length
    });
});
```

**Respuesta**:
```json
{
  "success": true,
  "menus": [...],
  "exportDate": "2025-12-30T23:08:00.000Z",
  "count": 5
}
```

#### POST /api/menus/import
```javascript
router.post('/import', (req, res) => {
    const { menus } = req.body;
    
    // Validar y procesar cada menú
    menus.forEach((menu, index) => {
        // Validar campos requeridos
        if (!menu.name || !menu.message) {
            errors.push(`Menu ${index + 1}: Missing required fields`);
            return;
        }
        
        // Generar nuevo ID
        const newMenu = {
            ...menu,
            id: Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        whatsappClient.interactiveMenus.push(newMenu);
    });
    
    whatsappClient.saveInteractiveMenus();
    
    res.json({ 
        success: true, 
        imported,
        skipped,
        total: menus.length,
        errors
    });
});
```

**Respuesta**:
```json
{
  "success": true,
  "imported": 4,
  "skipped": 1,
  "total": 5,
  "errors": ["Menu 3: Missing required fields (name, message)"]
}
```

---

### Frontend (`components/MenuManager.tsx`)

#### Función de Exportar
```typescript
const handleExport = async () => {
    const response = await exportMenus();
    if (response.success) {
        // Crear archivo JSON
        const dataStr = JSON.stringify(response.menus, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        
        // Descargar archivo
        const link = document.createElement('a');
        link.href = url;
        link.download = `menus-export-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        URL.revokeObjectURL(url);
        
        toast.success(`${response.count} menú(s) exportado(s) exitosamente`);
    }
};
```

#### Función de Importar
```typescript
const handleImport = () => {
    fileInputRef.current?.click(); // Abrir selector de archivos
};

const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    // Leer archivo JSON
    const text = await file.text();
    const data = JSON.parse(text);
    
    // Validar formato
    const menusToImport = Array.isArray(data) ? data : (data.menus || []);
    
    if (!Array.isArray(menusToImport) || menusToImport.length === 0) {
        toast.error('Archivo inválido: debe contener un array de menús');
        return;
    }
    
    // Importar
    const response = await importMenus(menusToImport);
    if (response.success) {
        await loadMenus(); // Recargar lista
        toast.success(`${response.imported} menú(s) importado(s) exitosamente`);
    }
};
```

#### UI - Botones
```tsx
<div className="flex gap-2 mt-4">
    <button
        onClick={handleExport}
        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100"
    >
        <Download size={14} />
        Exportar
    </button>
    <button
        onClick={handleImport}
        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100"
    >
        <Upload size={14} />
        Importar
    </button>
    <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileChange}
        className="hidden"
    />
</div>
```

---

## 📝 Formato de Archivo JSON

### Estructura del Archivo Exportado
```json
[
  {
    "id": "1735602480000-abc123",
    "name": "Menú Principal",
    "message": "¡Hola! 👋\n\n¿En qué puedo ayudarte?",
    "mediaPaths": ["uploads/logo.jpg"],
    "captions": ["Nuestro logo"],
    "options": [
      {
        "id": "1735602481000-def456",
        "label": "Información",
        "triggers": ["1", "info", "información"],
        "response": "Aquí está la información:",
        "mediaPaths": ["uploads/info.pdf"],
        "captions": ["Documento informativo"],
        "nextMenuId": null,
        "endConversation": false
      },
      {
        "id": "1735602482000-ghi789",
        "label": "Precios",
        "triggers": ["2", "precios", "costos"],
        "response": "Lista de precios:",
        "mediaPaths": ["uploads/precios.jpg"],
        "captions": ["Precios actualizados"],
        "nextMenuId": null,
        "endConversation": false
      }
    ],
    "isActive": true,
    "createdAt": "2025-12-30T23:08:00.000Z",
    "updatedAt": "2025-12-30T23:08:00.000Z"
  }
]
```

---

## 🎯 Casos de Uso

### 1. Backup de Menús
```
1. Click "Exportar"
2. Guardar archivo JSON en ubicación segura
3. Usar como respaldo
```

### 2. Migrar Menús entre Instancias
```
Instancia A:
1. Click "Exportar"
2. Descargar menus-export-2025-12-30.json

Instancia B:
1. Click "Importar"
2. Seleccionar menus-export-2025-12-30.json
3. Menús importados con nuevos IDs
```

### 3. Compartir Configuraciones
```
1. Exportar menús configurados
2. Compartir archivo JSON con otros usuarios
3. Otros usuarios importan y tienen los mismos menús
```

### 4. Plantillas de Menús
```
1. Crear menús base (plantillas)
2. Exportar
3. Importar en nuevos proyectos
4. Personalizar según necesidad
```

---

## ⚠️ Consideraciones Importantes

### IDs Únicos
- Al importar, se generan **nuevos IDs** automáticamente
- Esto evita conflictos con menús existentes
- Los menús importados son **independientes** de los originales

### Archivos Multimedia
- Las rutas de archivos (`mediaPaths`) se importan tal cual
- **Importante**: Los archivos multimedia NO se copian automáticamente
- Debes asegurarte de que los archivos existan en `/uploads`
- Alternativa: Copiar manualmente la carpeta `/uploads` entre instancias

### Validación
- Se validan campos requeridos: `name`, `message`
- Menús inválidos se **omiten** (no se importan)
- Se reportan errores en la respuesta

### Timestamps
- `createdAt` y `updatedAt` se regeneran con fecha actual
- No se preservan las fechas originales

---

## 🧪 Testing

### Test 1: Exportar Menús
```
1. Tener al menos 2 menús creados
2. Click "Exportar"
3. Verificar descarga de archivo JSON
4. Abrir archivo y verificar estructura
✅ Debe contener array de menús
✅ Debe tener todos los campos
```

### Test 2: Importar Menús Válidos
```
1. Tener archivo JSON con menús válidos
2. Click "Importar"
3. Seleccionar archivo
4. Verificar mensaje de éxito
✅ Menús deben aparecer en lista
✅ Deben tener nuevos IDs
```

### Test 3: Importar Archivo Inválido
```
1. Crear archivo JSON con formato incorrecto
2. Click "Importar"
3. Seleccionar archivo
✅ Debe mostrar error
✅ No debe importar nada
```

### Test 4: Importar con Errores Parciales
```
1. Archivo con 3 menús: 2 válidos, 1 inválido
2. Click "Importar"
3. Seleccionar archivo
✅ Debe importar 2 menús
✅ Debe omitir 1 menú
✅ Debe mostrar mensaje con conteo
```

---

## 📁 Archivos Modificados

### Backend
1. ✅ `server/routes/menus.js`
   - GET `/api/menus/export`
   - POST `/api/menus/import`

### Frontend
2. ✅ `services/api.ts`
   - `exportMenus()`
   - `importMenus(menus)`

3. ✅ `components/MenuManager.tsx`
   - `handleExport()`
   - `handleImport()`
   - `handleFileChange()`
   - Botones UI
   - File input ref

---

## ✅ Resultado

### Antes
- ❌ No había forma de exportar menús
- ❌ No se podían compartir configuraciones
- ❌ No había backup de menús

### Después
- ✅ Exportar todos los menús como JSON
- ✅ Importar menús desde JSON
- ✅ Compartir configuraciones fácilmente
- ✅ Crear backups de menús
- ✅ Migrar entre instancias
- ✅ Usar plantillas de menús

**¡Funcionalidad completa de import/export!** 🎉
