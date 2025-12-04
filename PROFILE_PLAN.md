# Plan multisesión / perfiles

## Estado general
- [x] Infraestructura de almacenamiento (`profiles/profileStore.js` con SQLite, carpetas por perfil, eventos, snapshots).
- [x] Backend parametrizable parcialmente (`SESSION_DIR`, `PROFILE_SLUG`, validación de puertos, errores controlados).
- [ ] Gestor en Electron (IPC + `spawn --profile`, seguimiento de PID, reasignación de puertos).
- [ ] APIs expuestas en `preload` + hooks/servicios del renderer.
- [ ] UI "Perfiles" (listado, CRUD, acciones Abrir/Forzar cierre/Eliminar, avisos de puertos y estados).
- [ ] Documentación y UX (notificaciones, guía de uso, notas sobre límites).

## Detalle por fase

### 1. Infraestructura de perfiles ✅
- Archivo `profiles/profileStore.js` usa `better-sqlite3`.
- Tablas `profiles`, `profile_events` con CRUD, notas, snapshots `profile.json`.
- Helpers recientes: `updateProfilePorts`, `updateProfileStatus`, `ensureProfileStructure`.

### 2. Backend parametrizable ✅ (pendiente completar integración con launcher)
- `server/whatsapp.js`: `resolveSessionDir()` respeta `process.env.SESSION_DIR`.
- `server/server.js`: maneja `PROFILE_SLUG`, `SESSION_DIR`, valida `BACKEND_PORT`/`FRONTEND_PORT`, error controlado `CONFIGURED_PORT_IN_USE`.
- Falta: conectar con el lanzador (`electron.js`) para pasar env correctos desde `--profile`.

### 3. Gestor en Electron ✅
- **Estado:** completado (IPC + `spawn`/`terminate`, verificación de puertos y contexto por perfil).
- **Plan detallado:**
  1. Crear módulo `profileManager` en el proceso principal que use `profileStore` (CRUD, notas, eventos, `updateProfilePorts`).
  2. Implementar `ProfileLauncher` que interprete `--profile=<slug>`, calcula rutas (`SESSION_DIR`, `UPLOAD_DIR`, `PROFILE_ROOT`), setea `process.env` antes de iniciar backend/frontend y registra `pid`/estado.
  3. Definir cola de arranque: verificación de puertos (`isPortAvailable`), reasignación automática si están ocupados y registro de cambios.
  4. Persistir estado (corriendo/detenido/error) al capturar señales (`exit`, `SIGINT`, `SIGTERM`).
  5. Reportar errores específicos (puerto ocupado, perfil inexistente) para que la UI muestre feedback claro.

### 4. APIs en `preload` + servicios de frontend ☐
- **Estado:** pendiente (exponer electronAPI + construir servicios/hooks en renderer).
- **Plan detallado:**
  - Exponer métodos seguros (`window.electronAPI.profiles.*`) con `ipcRenderer.invoke/on` (e.g., `profiles:list`, `profiles:create`, `profiles:launch`, `profiles:kill`).
  - Agregar notificaciones push (eventos `profiles:status-changed`) para actualizar la UI al instante.
  - Crear `profilesApi.ts` (servicios) y `useProfiles` hook para centralizar carga de datos, estados y acciones. Integrar manejo de errores/notificaciones.

### 5. UI "Perfiles" ☐
- **Estado:** pendiente, depende de que los puntos 3 y 4 estén listos.
- **Componentes previstos:**
  - `ProfilesPanel` (tab principal) que consume el hook `useProfiles`.
  - `ProfileFormModal` para crear/editar perfiles (valida nombre/slug, sugiere puertos, muestra carpeta).
  - `ProfileActions` (botones Abrir, Forzar cierre, Reasignar, Eliminar) con confirmaciones y toasts.
  - `ProfileEventsDrawer` para ver historial.
- **UX:** indicadores de estado (corriendo/detenido/error), badges por plataforma, avisos cuando se reasignan puertos o una instancia falla.

### 6. Documentación y UX ☐
- Actualizar UI (tooltips, notificaciones sonner) para informar creación, apertura, errores.
- Sección guía interna: "Cómo crear un perfil", "Dónde se guardan las sesiones".
- README/BUILD.md: uso de `--profile`, ubicación de `profiles.db`, consideraciones multi-OS.

## Próximos pasos inmediatos
1. **Terminar integración launcher ↔ backend:** adaptar `public/electron.js` para aceptar `--profile`, cargar datos desde `profiles/profileStore`, setear `process.env` (`PROFILE_SLUG`, `SESSION_DIR`, `BACKEND_PORT`, `FRONTEND_PORT`) antes de iniciar backend/frontend. Registrar PID y actualizar estado.
2. **IPC/Preload:** definir canales (`profiles:list`, `profiles:create`, `profiles:launch`, etc.) y exponerlos al renderer.
3. **Vista React:** crear componentes y hooks para administrar perfiles desde la UI principal.
4. **Docs/notifs:** añadir toasts/notas, actualizar README/BUILD.

_Última actualización: 2025-12-04 01:18 (UTC-05)_
