# Gestión de Contactos - WhatyBot

## Descripción

El módulo de **Gestión de Contactos** permite administrar los contactos de WhatsApp de manera eficiente, con funcionalidades de selección, exportación, importación y envío masivo.

## Características

### 1. **Carga de Contactos desde WhatsApp**
- Obtiene contactos de **múltiples fuentes**:
  - Cache de contactos de Baileys
  - Chats activos individuales
  - **Miembros de todos los grupos** (fuente principal)
- Muestra nombre y número de teléfono de cada contacto
- Actualización manual mediante botón "Actualizar Contactos"
- Elimina duplicados automáticamente
- Ordena alfabéticamente por nombre

### 2. **Selección de Contactos**
- **Checkbox Global**: Selecciona o deselecciona todos los contactos filtrados
- **Checkbox Individual**: Selecciona contactos específicos haciendo clic en la tarjeta
- Contador en tiempo real de contactos seleccionados

### 3. **Búsqueda y Filtrado**
- Búsqueda por nombre o número de teléfono
- Filtrado en tiempo real mientras escribes
- Mantiene las selecciones al filtrar

### 4. **Exportación de Contactos**

#### Exportar a Excel (.xlsx)
- Exporta los contactos seleccionados a un archivo Excel
- Formato: `contactos_whatsapp_YYYY-MM-DD.xlsx`
- Columnas: `phone`, `name`
- Ancho de columnas optimizado para lectura

#### Exportar a JSON (.json)
- Exporta los contactos seleccionados a formato JSON
- Formato: `contactos_whatsapp_YYYY-MM-DD.json`
- Estructura de array de objetos con `phone` y `name`

### 5. **Importación de Contactos**

#### Formatos Soportados
- **Excel (.xlsx, .xls)**: Importa contactos desde archivos Excel
- **JSON (.json)**: Importa contactos desde archivos JSON

#### Estructura Esperada

**Excel:**
```
| phone          | name           | empresa        | producto       |
|----------------|----------------|----------------|----------------|
| +5491123456789 | Juan Pérez     | Tech Solutions | Software CRM   |
| +5491134567890 | María García   | Marketing Pro  | Servicios SEO  |
```

**JSON:**
```json
[
  {
    "phone": "+5491123456789",
    "name": "Juan Pérez",
    "empresa": "Tech Solutions",
    "producto": "Software CRM"
  },
  {
    "phone": "+5491134567890",
    "name": "María García",
    "empresa": "Marketing Pro",
    "producto": "Servicios SEO"
  }
]
```

#### Características de Importación
- **Detección automática de duplicados**: No importa contactos con números ya existentes
- **Campos flexibles**: Acepta columnas adicionales (empresa, producto, etc.)
- **Validación de números**: Solo importa contactos con números válidos
- **Reporte de resultados**: Muestra cuántos contactos se importaron y cuántos duplicados se omitieron

### 6. **Envío a Campañas Masivas**
- Botón "Enviar a Masivos" envía los contactos seleccionados al módulo de Envíos Masivos
- Navegación automática al módulo de Envíos Masivos
- Los contactos se cargan automáticamente listos para enviar

## Uso

### Flujo de Trabajo Típico

1. **Conectar WhatsApp** desde el Panel Principal
2. **Navegar a Contactos** desde el menú lateral
3. **Cargar contactos** haciendo clic en "Actualizar Contactos"
4. **Buscar y filtrar** contactos según necesidad
5. **Seleccionar contactos** usando checkboxes globales o individuales
6. **Opciones disponibles**:
   - **Exportar**: Guardar contactos seleccionados en Excel o JSON
   - **Importar**: Agregar contactos desde archivos externos
   - **Enviar a Masivos**: Usar contactos seleccionados para campaña masiva

### Ejemplo de Uso para Campaña Masiva

1. Selecciona los contactos deseados (ej: 50 contactos)
2. Haz clic en "Enviar a Masivos (50)"
3. Automáticamente se abre el módulo de Envíos Masivos
4. Los 50 contactos están cargados y listos
5. Escribe tu mensaje y envía la campaña

## Archivos de Ejemplo

En la carpeta `examples/` encontrarás:
- `contactos_ejemplo.json`: Archivo JSON de ejemplo para importar
- Puedes descargar un archivo Excel de ejemplo desde el botón en el módulo de Envíos Masivos

## Estadísticas

El módulo muestra tres métricas principales:
- **Total Contactos**: Cantidad total de contactos cargados
- **Seleccionados**: Cantidad de contactos seleccionados actualmente
- **Filtrados**: Cantidad de contactos que coinciden con la búsqueda actual

## Notas Importantes

- **Conexión requerida**: WhatsApp debe estar conectado para cargar contactos
- **Privacidad**: Los contactos se cargan desde tu WhatsApp local, no se almacenan en servidor
- **Sincronización**: Los contactos se actualizan cada vez que haces clic en "Actualizar Contactos"
- **Límites**: No hay límite en la cantidad de contactos que puedes gestionar
- **Compatibilidad**: Funciona con cualquier tipo de suscripción

## Integración con Otros Módulos

### Envíos Masivos
Los contactos seleccionados se envían al módulo de Envíos Masivos donde puedes:
- Personalizar mensajes con variables
- Adjuntar archivos multimedia
- Programar envíos
- Configurar delays y lotes

### Gestor de Grupos
Complementa la funcionalidad de grupos permitiendo:
- Exportar miembros de grupos como contactos
- Importar contactos para crear nuevos grupos
- Combinar contactos de WhatsApp con contactos importados

## Notas Técnicas

### Extracción de Contactos con Baileys

El módulo utiliza **Baileys** (no whatsapp-web.js) para extraer contactos de manera eficiente. La extracción se realiza desde **múltiples fuentes**:

1. **Cache de Contactos**: Contactos que Baileys ha cacheado mediante eventos
2. **Chats Activos**: Todos los chats individuales en el store
3. **Miembros de Grupos**: La fuente más rica - extrae todos los participantes de todos los grupos

**Ventajas de esta implementación:**
- ✅ No requiere Puppeteer/Chrome (más ligero)
- ✅ Más rápido y estable
- ✅ Menos recursos del sistema
- ✅ Menos propenso a detecciones de WhatsApp
- ✅ Elimina duplicados automáticamente
- ✅ Valida números de teléfono (mínimo 8 dígitos)

**Primera carga:**
- Puede tomar unos segundos si tienes muchos grupos
- Los contactos se extraen de todos tus grupos automáticamente
- Cuantos más grupos tengas, más contactos obtendrás

Para más detalles técnicos, consulta `CONTACTS_SOLUTION.md`.

## Soporte

Para reportar problemas o sugerencias sobre el módulo de Gestión de Contactos, contacta al equipo de desarrollo.
