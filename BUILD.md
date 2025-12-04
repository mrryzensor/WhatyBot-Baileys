# Guía de Build de la Aplicación

## Comando para Generar el Build

Para generar el ejecutable de la aplicación, usa el siguiente comando:

```bash
pnpm electron:build
```

O si prefieres usar npm:

```bash
npm run electron:build
```

Este comando:
1. Compila el frontend con Vite (`npm run build`)
2. Genera el ejecutable con Electron Builder

## Archivos Generados

Los archivos compilados se generarán en la carpeta `release/`:
- **Windows**: `release/Whatbot Setup X.X.X.exe` (instalador NSIS)
- **macOS**: `release/Whatbot-X.X.X.dmg`
- **Linux**: `release/Whatbot-X.X.X.AppImage`

## Múltiples Instancias

La aplicación está configurada para permitir múltiples instancias simultáneas. Cada instancia:
- Usa puertos únicos basados en el ID del proceso
- Tiene su propio servidor backend embebido
- No interfiere con otras instancias

## Configuración de Build

La configuración de build se encuentra en `electron-builder.json`:
- **Windows**: Genera instalador NSIS (permite múltiples instalaciones)
- **macOS**: Genera DMG
- **Linux**: Genera AppImage

## Notas Importantes

- Asegúrate de tener todas las dependencias instaladas: `pnpm install`
- **Importante**: También instala las dependencias del servidor: `cd server && pnpm install` (o `npm install`)
- El build incluye el servidor backend en la carpeta `server/` con sus `node_modules`
- **La aplicación es completamente independiente**: Usa el Node.js embebido de Electron, no requiere Node.js instalado en el sistema
- Los puertos por defecto son 12345 (frontend) y 23456 (backend), pero cada instancia usará puertos únicos automáticamente
- En modo producción, cada instancia inicia automáticamente su propio servidor backend usando el Node.js de Electron
- Múltiples instancias pueden ejecutarse simultáneamente, cada una con su propio servidor en puertos diferentes
- **No se requiere Node.js instalado**: La aplicación usa el Node.js que viene con Electron

## Solución de Problemas

### Si el instalador no se ejecuta o la aplicación no inicia:

1. **Verifica los logs**: Ejecuta el instalador desde la terminal para ver errores:
   ```powershell
   .\release\Whatbot Setup 0.0.0.exe
   ```

2. **Verifica que los archivos estén presentes**:
   - Después de instalar, verifica que existan:
     - `C:\Users\[TuUsuario]\AppData\Local\Programs\whatbot\Whatbot.exe`
     - `C:\Users\[TuUsuario]\AppData\Local\Programs\whatbot\resources\app\dist\index.html`
     - `C:\Users\[TuUsuario]\AppData\Local\Programs\whatbot\resources\app\server\server.js`

3. **Ejecuta desde la terminal para ver logs**:
   ```powershell
   cd "C:\Users\[TuUsuario]\AppData\Local\Programs\whatbot"
   .\Whatbot.exe
   ```

4. **Verifica el Event Viewer de Windows**:
   - Abre "Visor de eventos" → "Registros de Windows" → "Aplicación"
   - Busca errores relacionados con "Whatbot"

