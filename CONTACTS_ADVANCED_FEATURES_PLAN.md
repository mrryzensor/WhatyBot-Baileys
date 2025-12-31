# Plan de Implementación - Características Avanzadas de Contactos

## Estado Actual
✅ Backend actualizado con:
- `getGroupMembersWithRetry()` - Manejo de rate-limits con exponential backoff
- Emisión de eventos de progreso (`contacts:extraction:progress`)
- Emisión de eventos de error (`contacts:extraction:error`)

✅ Frontend parcialmente actualizado:
- Estados agregados para progress, savedContactSets, y ref para scroll
- Import de `getSocket` agregado
- Effect para cargar savedContactSets desde localStorage

## Pendiente de Implementar

### 1. Actualizar `loadContacts()` ✅ Backend / ⏳ Frontend

**Necesita**:
```typescript
const loadContacts = async () => {
  // 1. Validaciones existentes
  // 2. Setup de socket listeners para progress
  // 3. Llamar a getContacts()
  // 4. Guardar contactos en localStorage con timestamp
  // 5. Actualizar savedContactSets
  // 6. Auto-scroll a contactos
  // 7. Cleanup de listeners
};
```

**Socket Listeners**:
```typescript
const socket = getSocket();
socket?.on('contacts:extraction:progress', (progress) => {
  setExtractionProgress(progress);
});
socket?.on('contacts:extraction:error', (error) => {
  toast.warning(`Error en ${error.groupName}: ${error.error}`);
});
```

**Guardar Contactos**:
```typescript
const savedSet = {
  id: Date.now().toString(),
  timestamp: new Date(),
  count: formattedContacts.length,
  groupIds: groupIds,
  contacts: formattedContacts
};
localStorage.setItem(`contacts_${savedSet.id}`, JSON.stringify(savedSet));
```

**Auto-scroll**:
```typescript
setTimeout(() => {
  contactsListRef.current?.scrollIntoView({ 
    behavior: 'smooth',
    block: 'start'
  });
}, 300);
```

### 2. Progress Bar Component

**Ubicación**: Justo después del botón "Extraer Contactos"

**Código**:
```tsx
{extractionProgress && (
  <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
    <div className="mb-2 flex items-center justify-between">
      <span className="text-sm font-medium text-slate-700">
        Extrayendo contactos...
      </span>
      <span className="text-sm text-slate-600">
        {extractionProgress.current} / {extractionProgress.total} grupos
      </span>
    </div>
    <div className="w-full bg-slate-200 rounded-full h-2.5 mb-2">
      <div 
        className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
        style={{ width: `${extractionProgress.percentage}%` }}
      />
    </div>
    <p className="text-xs text-slate-500 truncate">
      Procesando: {extractionProgress.groupName}
    </p>
  </div>
)}
```

### 3. Saved Contacts Selector

**Ubicación**: Antes del selector de grupos

**Código**:
```tsx
{savedContactSets.length > 0 && (
  <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
    <h3 className="font-bold text-slate-900 mb-3">
      Contactos Guardados ({savedContactSets.length})
    </h3>
    <div className="space-y-2 max-h-[200px] overflow-y-auto">
      {savedContactSets.map(set => (
        <div 
          key={set.id}
          className="flex items-center justify-between p-3 border rounded-lg hover:bg-slate-50 cursor-pointer"
          onClick={() => loadSavedContactSet(set.id)}
        >
          <div>
            <p className="font-medium text-slate-900">
              {set.count} contactos
            </p>
            <p className="text-xs text-slate-500">
              {formatDate(set.timestamp)}
            </p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              deleteSavedContactSet(set.id);
            }}
            className="text-red-600 hover:text-red-700"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
    </div>
  </div>
)}
```

### 4. Funciones de Persistencia

**loadSavedContactSet**:
```typescript
const loadSavedContactSet = (id: string) => {
  const saved = localStorage.getItem(`contacts_${id}`);
  if (saved) {
    const set = JSON.parse(saved);
    setContacts(set.contacts);
    toast.success(`${set.count} contactos cargados desde historial`);
    // Auto-scroll
    setTimeout(() => {
      contactsListRef.current?.scrollIntoView({ 
        behavior: 'smooth' 
      });
    }, 300);
  }
};
```

**deleteSavedContactSet**:
```typescript
const deleteSavedContactSet = (id: string) => {
  localStorage.removeItem(`contacts_${id}`);
  setSavedContactSets(prev => prev.filter(s => s.id !== id));
  toast.success('Contactos eliminados del historial');
};
```

**syncContacts** (para actualizar/sincronizar):
```typescript
const syncContacts = (newContacts: ExtendedContact[], existingContacts: ExtendedContact[]) => {
  const existingMap = new Map(existingContacts.map(c => [c.phone, c]));
  const newMap = new Map(newContacts.map(c => [c.phone, c]));
  
  // Merge: keep existing + add new + update existing
  const merged = [...newContacts];
  
  existingContacts.forEach(existing => {
    if (!newMap.has(existing.phone)) {
      // Contact no longer in groups - optionally remove or keep
      // For now, keep all
      merged.push(existing);
    }
  });
  
  return merged;
};
```

### 5. Helper Functions

**formatDate**:
```typescript
const formatDate = (date: Date) => {
  return new Intl.DateTimeFormat('es-ES', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
};
```

## Orden de Implementación

1. ✅ Backend - Rate limit handling
2. ✅ Backend - Progress events
3. ⏳ Frontend - Update loadContacts con socket listeners
4. ⏳ Frontend - Progress bar UI
5. ⏳ Frontend - Auto-scroll
6. ⏳ Frontend - Save contacts to localStorage
7. ⏳ Frontend - Saved contacts selector UI
8. ⏳ Frontend - Load/delete saved contacts
9. ⏳ Frontend - Sync functionality

## Archivos a Modificar

- ✅ `server/whatsapp.js` - Completado
- ⏳ `components/ContactsManager.tsx` - En progreso
- ⏳ Agregar icono `Trash2` a imports de lucide-react

## Testing Checklist

- [ ] Rate-limit se maneja correctamente (retry 3 veces)
- [ ] Progress bar muestra porcentaje correcto
- [ ] Auto-scroll funciona al extraer contactos
- [ ] Contactos se guardan automáticamente
- [ ] Contactos guardados se pueden cargar
- [ ] Contactos guardados se pueden eliminar
- [ ] Sincronización agrega nuevos contactos
- [ ] Sincronización mantiene contactos existentes
- [ ] UI responsive en todas las secciones

## Notas Importantes

- Los contactos se guardan con prefijo `contacts_${id}` en localStorage
- El array `savedContactSets` solo guarda metadata (id, timestamp, count, groupIds)
- Los contactos completos se guardan en entradas separadas de localStorage
- El auto-scroll usa `scrollIntoView` con smooth behavior
- El progress bar se oculta automáticamente cuando `extractionProgress` es null
- Los socket listeners se limpian en el cleanup del effect

## Próximos Pasos

1. Completar actualización de `loadContacts()`
2. Agregar Progress Bar UI
3. Agregar Saved Contacts Selector UI
4. Implementar funciones de persistencia
5. Testing completo
6. Documentación final
