import { app, BrowserWindow, Menu, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { spawn, fork } from 'child_process';

// electron-updater: carga con createRequire para compatibilidad ESM + CommonJS en Electron
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

let autoUpdater = null;
try {
  const { autoUpdater: au } = require('electron-updater');
  autoUpdater = au;
} catch (err) {
  console.warn('[AutoUpdater] No se pudo cargar electron-updater:', err.message);
}
import { getProfileBySlug, listProfiles, updateProfilePorts, updateProfileStatus, PROFILE_CONSTANTS } from '../profiles/profileStore.js';
import { findAvailablePort, isPortAvailable } from '../server/utils/portFinder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Allow multiple instances of the application
// By default, Electron prevents multiple instances, but we want to allow them
// Each instance will use different ports automatically
app.allowRendererProcessReuse = true;

// Generate a unique instance ID for this process
// This ensures each instance uses different ports
const instanceId = process.pid || Date.now();
const INSTANCE_PORT_OFFSET = instanceId % 10000; // Use modulo to keep offset reasonable

const profileArgSlug = getProfileArgument();
const profileStatuses = PROFILE_CONSTANTS().STATUS;
let profileContext = null;
const profileProcesses = new Map();

function setupAutoUpdater() {
  if (!app.isPackaged || !autoUpdater) {
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('error', (error) => {
    console.error('[AutoUpdater] Error:', error);
    sendAutoUpdateStatus({ status: 'error', message: error?.message || String(error) });
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[AutoUpdater] Update available:', info?.version);
    sendAutoUpdateStatus({ status: 'available', version: info?.version || null });
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdater] Update downloaded:', info?.version);
    sendAutoUpdateStatus({ status: 'downloaded', version: info?.version || null });
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('[AutoUpdater] No update available');
    sendAutoUpdateStatus({ status: 'no-update', version: info?.version || null });
  });

  try {
    sendAutoUpdateStatus({ status: 'checking' });
    autoUpdater.checkForUpdates();
  } catch (error) {
    console.error('[AutoUpdater] checkForUpdatesAndNotify failed:', error);
    sendAutoUpdateStatus({ status: 'error', message: error?.message || String(error) });
  }
}

ipcMain.handle('autoUpdater:check', async () => {
  if (!autoUpdater) {
    throw new Error('Auto-updater no está disponible en esta build (módulo electron-updater no cargado).');
  }

  try {
    sendAutoUpdateStatus({ status: 'checking' });
    await autoUpdater.checkForUpdates();
    return { success: true };
  } catch (error) {
    console.error('[AutoUpdater] manual checkForUpdates failed:', error);
    sendAutoUpdateStatus({ status: 'error', message: error?.message || String(error) });
    throw error;
  }
});

// Emergency restart handler - kills all Node.js processes and restarts the app
ipcMain.handle('emergency:restart', async () => {
  try {
    console.log('[Emergency] Initiating emergency restart...');

    // Kill all Node.js processes (including backend server)
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    let killCommand;
    if (process.platform === 'win32') {
      // Windows: Kill all node.exe processes except the current Electron process
      killCommand = 'taskkill /F /IM node.exe /T';
    } else {
      // Unix-like: Kill all node processes
      killCommand = 'pkill -9 node';
    }

    console.log('[Emergency] Killing all Node.js processes...');
    try {
      await execAsync(killCommand);
      console.log('[Emergency] Node.js processes killed');
    } catch (error) {
      // Ignore errors (process might not exist)
      console.log('[Emergency] Kill command completed (some processes may not exist)');
    }

    // Stop our backend server if it's still running
    stopBackendServer();

    // Wait a moment for processes to die
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('[Emergency] Restarting application...');

    // Relaunch the app
    app.relaunch();

    // Quit current instance
    app.exit(0);

    return { success: true };
  } catch (error) {
    console.error('[Emergency] Restart failed:', error);
    throw error;
  }
});

function getProfileArgument() {
  const cliArg = process.argv.find(arg => arg.startsWith('--profile='));
  if (cliArg) {
    const [, value] = cliArg.split('=');
    return value || null;
  }
  if (process.env.PROFILE_SLUG) {
    return process.env.PROFILE_SLUG;
  }
  return null;
}

function ensureDir(targetPath) {
  if (!existsSync(targetPath)) {
    mkdirSync(targetPath, { recursive: true });
  }
}

// Helper functions to manage port info files
// In production, use a writable directory (userData) instead of app.asar
function getPortInfoDir() {
  if (app.isPackaged) {
    const dir = app.getPath('userData');
    ensureDir(dir);
    return dir;
  }
  // En desarrollo, usar la raíz del proyecto (una carpeta arriba de public/)
  const dir = path.join(__dirname, '..');
  ensureDir(dir);
  return dir;
}

// Each instance will have its own port info based on instance ID
function getPortInfoPath() {
  const dir = getPortInfoDir();
  const portInfoPath = path.join(dir, `.port-info-${instanceId}.json`);
  return portInfoPath;
}

function readPortInfo() {
  try {
    const portInfoPath = getPortInfoPath();
    if (existsSync(portInfoPath)) {
      const content = readFileSync(portInfoPath, 'utf8');
      return JSON.parse(content);
    }
    // Fallback to default port info file if process-specific doesn't exist
    const dir = getPortInfoDir();
    const defaultPath = path.join(dir, '.port-info.json');
    if (existsSync(defaultPath)) {
      const content = readFileSync(defaultPath, 'utf8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.warn('Could not read port info:', error);
  }
  return null;
}

// Calculate default ports
// En desarrollo permitimos offsets por instancia, pero en producción usamos puertos fijos
const getInstanceDefaultPorts = () => {
  if (profileContext?.frontendPort && profileContext?.backendPort) {
    return {
      frontendPort: profileContext.frontendPort,
      backendPort: profileContext.backendPort
    };
  }

  const baseFrontendPort = 12345;
  const baseBackendPort = 23456;

  // En la app empaquetada usamos puertos fijos para que coincidan con api.ts y el backend
  if (app.isPackaged) {
    return {
      frontendPort: baseFrontendPort,
      backendPort: baseBackendPort
    };
  }

  // En desarrollo, cada instancia obtiene un offset para evitar conflictos
  const frontendOffset = INSTANCE_PORT_OFFSET;
  const backendOffset = INSTANCE_PORT_OFFSET + 5000; // Separate offset for backend

  return {
    frontendPort: baseFrontendPort + (frontendOffset % 50000), // Keep in 5-digit range
    backendPort: baseBackendPort + (backendOffset % 50000)    // Keep in 5-digit range
  };
};

async function prepareProfileContext(slug) {
  const profile = getProfileBySlug(slug);
  if (!profile) {
    throw new Error(`Perfil "${slug}" no existe en profiles.db`);
  }

  const profilesRoot = PROFILE_CONSTANTS().ROOT;
  const profileDir = path.join(profilesRoot, slug);
  const sessionDir = profile.session_dir || path.join(profileDir, '.baileys_auth');
  const uploadsDir = path.join(profileDir, 'uploads');

  ensureDir(profileDir);
  ensureDir(sessionDir);
  ensureDir(uploadsDir);

  let backendPort = profile.backend_port;
  let frontendPort = profile.frontend_port;
  let portsChanged = false;

  if (!backendPort || !(await isPortAvailable(backendPort))) {
    backendPort = await findAvailablePort(backendPort || 23456);
    portsChanged = true;
  }

  if (!frontendPort) {
    frontendPort = await findAvailablePort(12345);
    portsChanged = true;
  }

  if (portsChanged) {
    updateProfilePorts(slug, { backendPort, frontendPort });
  }

  return {
    slug,
    profileDir,
    sessionDir,
    uploadsDir,
    backendPort,
    frontendPort
  };
}

function registerProfileIpcHandlers() {
  ipcMain.handle('profiles:list', async () => {
    return listProfiles();
  });

  ipcMain.handle('profiles:launch', async (_event, slug) => {
    return launchProfileInstance(slug);
  });

  ipcMain.handle('profiles:terminate', async (_event, slug) => {
    return terminateProfileInstance(slug);
  });

  ipcMain.handle('profiles:get', async (_event, slug) => {
    return getProfileBySlug(slug) || null;
  });
}

async function launchProfileInstance(slug) {
  const profile = getProfileBySlug(slug);
  if (!profile) {
    throw new Error(`Perfil "${slug}" no existe`);
  }

  const execPath = process.execPath;
  const args = [];
  if (!app.isPackaged) {
    args.push(app.getAppPath());
  }
  args.push(`--profile=${slug}`);

  const child = spawn(execPath, args, {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, PROFILE_SLUG: slug }
  });

  child.unref();
  profileProcesses.set(slug, child.pid);
  updateProfileStatus(slug, profileStatuses.RUNNING, { pid: child.pid, message: 'Instancia lanzada desde gestor' });
  return { pid: child.pid };
}

async function terminateProfileInstance(slug) {
  const profile = getProfileBySlug(slug);
  if (!profile || !profile.last_pid) {
    throw new Error(`Perfil "${slug}" no tiene proceso activo registrado`);
  }

  try {
    process.kill(profile.last_pid, 'SIGTERM');
  } catch (error) {
    // Si SIGTERM falla, intentar SIGKILL
    try {
      process.kill(profile.last_pid, 'SIGKILL');
    } catch (killError) {
      throw killError;
    }
  }

  updateProfileStatus(slug, profileStatuses.STOPPED, { pid: null, message: 'Terminado manualmente desde gestor' });
  profileProcesses.delete(slug);
  return { success: true };
}

let mainWindow;
let serverProcess = null;
let backendPort = null;
let frontendPort = null;

function sendAutoUpdateStatus(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.webContents.send('autoUpdater:status', payload);
    } catch (err) {
      console.error('[AutoUpdater] Failed to send status to renderer:', err);
    }
  }
}

// Function to start the backend server in production mode
async function startBackendServer() {
  if (isDev) {
    // In dev mode, server is started separately
    return;
  }

  try {
    const instancePorts = getInstanceDefaultPorts();
    backendPort = instancePorts.backendPort;

    // Set environment variable for the backend port
    process.env.PORT = backendPort.toString();

    // Get the path to server.js
    // In production, paths are different - use app.getAppPath() for packaged apps
    let serverPath, serverDir;
    if (app.isPackaged) {
      // In packaged app, server is in extraResources (outside app.asar)
      // extraResources puts files in resources/ directory
      // process.resourcesPath points to the resources/ directory
      const resourcesPath = process.resourcesPath || path.dirname(app.getAppPath());

      console.log(`[Instance ${instanceId}] Resources path: ${resourcesPath}`);
      console.log(`[Instance ${instanceId}] App path: ${app.getAppPath()}`);

      // Try multiple possible locations (extraResources should be in resources/server/)
      const possiblePaths = [
        path.join(resourcesPath, 'server', 'server.js'), // resources/server (extraResources - preferred)
        path.join(resourcesPath, 'app', 'server', 'server.js'), // resources/app/server (fallback)
        path.join(app.getAppPath(), 'server', 'server.js'), // resources/app.asar/server (inside asar - won't work, but check anyway)
        path.join(__dirname, '..', 'server', 'server.js') // Fallback
      ];

      console.log(`[Instance ${instanceId}] Searching for server in:`);
      possiblePaths.forEach(p => console.log(`  - ${p}`));

      // Find the first existing path
      for (const possiblePath of possiblePaths) {
        if (existsSync(possiblePath)) {
          serverPath = possiblePath;
          serverDir = path.dirname(serverPath);
          console.log(`[Instance ${instanceId}] ✅ Found server at: ${serverPath}`);
          break;
        } else {
          console.log(`[Instance ${instanceId}] ❌ Not found: ${possiblePath}`);
        }
      }

      if (!serverPath) {
        throw new Error(`Server file not found. Tried: ${possiblePaths.join(', ')}\nResources path: ${resourcesPath}\nApp path: ${app.getAppPath()}`);
      }
    } else {
      // In development, use relative path
      serverPath = path.join(__dirname, '..', 'server', 'server.js');
      serverDir = path.join(__dirname, '..', 'server');
    }

    console.log(`[Instance ${instanceId}] Starting backend server on port ${backendPort}...`);
    console.log(`[Instance ${instanceId}] Server path: ${serverPath}`);
    console.log(`[Instance ${instanceId}] Server dir: ${serverDir}`);

    // Check if server file exists
    if (!existsSync(serverPath)) {
      throw new Error(`Server file not found at: ${serverPath}`);
    }

    // Use Electron's embedded Node.js to run the server
    // Electron includes Node.js, and we can use it by setting ELECTRON_RUN_AS_NODE=1
    // This tells Electron to run as a Node.js process instead of Electron

    let nodeExecutable;

    // Configurar entorno para que el backend pueda resolver sus dependencias
    // En producción, usamos los node_modules locales del servidor (resources/server/node_modules)
    // En desarrollo, se usan los node_modules de la raíz del proyecto
    let nodeModulesPath;
    if (app.isPackaged) {
      const resourcesPath = process.resourcesPath || path.dirname(app.getAppPath());
      nodeModulesPath = path.join(resourcesPath, 'server', 'node_modules');
    } else {
      nodeModulesPath = path.join(__dirname, '..', 'node_modules');
    }

    const envVars = {
      ...process.env,
      PORT: backendPort.toString(),
      NODE_ENV: 'production',
      NODE_PATH: nodeModulesPath
    };

    // Ensure runtime-writable directories for session & uploads in packaged builds.
    // Never rely on __dirname/resources paths for mutable data.
    try {
      const baseDataDir = app.getPath('userData');
      ensureDir(baseDataDir);

      const sessionDir = profileContext?.sessionDir || path.join(baseDataDir, 'session');
      const uploadsDir = profileContext?.uploadsDir || path.join(baseDataDir, 'uploads');
      const dataDir = profileContext?.dataDir || path.join(baseDataDir, 'data');

      ensureDir(sessionDir);
      ensureDir(uploadsDir);
      ensureDir(dataDir);

      envVars.SESSION_DIR = sessionDir;
      envVars.UPLOAD_DIR = uploadsDir;
      envVars.DATA_DIR = dataDir;

      console.log(`[Instance ${instanceId}] SESSION_DIR: ${sessionDir}`);
      console.log(`[Instance ${instanceId}] UPLOAD_DIR: ${uploadsDir}`);
      console.log(`[Instance ${instanceId}] DATA_DIR: ${dataDir}`);
    } catch (e) {
      console.warn(`[Instance ${instanceId}] Could not prepare SESSION_DIR/UPLOAD_DIR/DATA_DIR:`, e?.message || e);
    }

    if (app.isPackaged) {
      // In packaged app, we need to use Electron's embedded Node.js
      // The issue is that process.execPath points to whatybot.exe which may have issues
      // We'll use a different approach: find the actual Electron executable or use fork

      // Try to use fork() which works better with Electron's Node.js
      // But fork requires CommonJS, so we'll use spawn with proper path handling

      // Use process.execPath but ensure the path is properly quoted for Windows
      nodeExecutable = process.execPath;
      envVars.ELECTRON_RUN_AS_NODE = '1';

      // En la app empaquetada, usamos spawn directo sin shell. process.execPath
      // puede contener espacios (por ejemplo C:\Users\Ing. David\...), pero
      // spawn los maneja correctamente cuando shell:false.
      const useShell = false;

      console.log(`[Instance ${instanceId}] Using Electron's embedded Node.js`);
      console.log(`[Instance ${instanceId}] Executable: ${nodeExecutable}`);
      console.log(`[Instance ${instanceId}] Server path: ${serverPath}`);
      console.log(`[Instance ${instanceId}] NODE_PATH: ${envVars.NODE_PATH}`);
      console.log(`[Instance ${instanceId}] Using shell: ${useShell}`);

      // Start the server as a child process
      // On Windows, we need to handle paths with spaces properly
      console.log(`[Instance ${instanceId}] Spawning server process...`);
      console.log(`[Instance ${instanceId}] Executable: ${nodeExecutable}`);
      console.log(`[Instance ${instanceId}] Server path: ${serverPath}`);
      console.log(`[Instance ${instanceId}] Server dir: ${serverDir}`);
      console.log(`[Instance ${instanceId}] Using shell: ${useShell}`);

      // Verify executable exists
      if (!existsSync(nodeExecutable)) {
        throw new Error(`Electron executable not found at: ${nodeExecutable}`);
      }

      // Verify server file exists
      if (!existsSync(serverPath)) {
        throw new Error(`Server file not found at: ${serverPath}`);
      }

      // On Windows with shell, we can pass paths directly
      // On Windows without shell, we need to handle paths carefully
      serverProcess = spawn(nodeExecutable, [serverPath], {
        cwd: serverDir,
        env: envVars,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: useShell
      });
    } else {
      // In development, use system Node.js
      nodeExecutable = process.platform === 'win32' ? 'node.exe' : 'node';
      console.log(`[Instance ${instanceId}] Using system Node.js`);

      serverProcess = spawn(nodeExecutable, [serverPath], {
        cwd: serverDir,
        env: envVars,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: process.platform === 'win32'
      });
    }

    // Log server output
    serverProcess.stdout.on('data', (data) => {
      console.log(`[Backend ${instanceId}] ${data.toString().trim()}`);
    });

    serverProcess.stderr.on('data', (data) => {
      console.error(`[Backend ${instanceId}] ${data.toString().trim()}`);
    });

    serverProcess.on('error', (error) => {
      console.error(`[Instance ${instanceId}] Failed to start backend server:`, error);
    });

    serverProcess.on('exit', (code, signal) => {
      console.log(`[Instance ${instanceId}] Backend server exited with code ${code}, signal ${signal}`);
      serverProcess = null;
    });

    // Wait for server to be ready (check health endpoint)
    // Use a shorter timeout and don't throw if it fails
    try {
      await waitForServerReady(backendPort, 10000); // Reduced timeout
      console.log(`[Instance ${instanceId}] Backend server is ready on port ${backendPort}`);
    } catch (error) {
      console.warn(`[Instance ${instanceId}] Backend server not ready yet, continuing anyway:`, error.message);
      // Continue anyway - server might start later
    }

    // Save port info for this instance
    const portInfoPath = getPortInfoPath();
    writeFileSync(portInfoPath, JSON.stringify({
      frontendPort: frontendPort || instancePorts.frontendPort,
      backendPort: backendPort
    }, null, 2), 'utf8');

  } catch (error) {
    console.error(`[Instance ${instanceId}] Error starting backend server:`, error);
    throw error;
  }
}

// Function to wait for server to be ready
function waitForServerReady(port, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const checkServer = async () => {
      try {
        const response = await fetch(`http://localhost:${port}/api/health`);
        if (response.ok) {
          resolve();
          return;
        }
      } catch (error) {
        // Server not ready yet
      }

      if (Date.now() - startTime > timeout) {
        reject(new Error(`Server did not become ready within ${timeout}ms`));
        return;
      }

      setTimeout(checkServer, 500);
    };

    checkServer();
  });
}

// Function to stop the backend server
function stopBackendServer() {
  if (serverProcess) {
    console.log(`[Instance ${instanceId}] Stopping backend server...`);
    serverProcess.kill('SIGTERM');

    // Force kill after 5 seconds if it doesn't exit gracefully
    setTimeout(() => {
      if (serverProcess) {
        console.log(`[Instance ${instanceId}] Force killing backend server...`);
        serverProcess.kill('SIGKILL');
        serverProcess = null;
      }
    }, 5000);
  }
}

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.cjs'),
      webSecurity: false, // Disable for dev to allow loading modules
      allowRunningInsecureContent: false
    },
    icon: path.join(__dirname, 'assets/icon.png'), // Optional: add an icon
    show: false, // Don't show until ready-to-show
    autoHideMenuBar: true
  });

  // In production, block common DevTools shortcuts (F12, Ctrl+Shift+I, Cmd+Alt+I)
  if (!isDev) {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      const isDevToolsShortcut =
        input.type === 'keyDown' && (
          input.key === 'F12' ||
          (input.control && input.shift && input.key.toUpperCase() === 'I') ||
          (input.meta && input.alt && input.key.toUpperCase() === 'I')
        );

      if (isDevToolsShortcut) {
        event.preventDefault();
      }
    });
  }

  // Load the app
  if (isDev) {
    // Try to read port from port info file, fallback to instance-specific default
    const portInfo = readPortInfo();
    const instancePorts = getInstanceDefaultPorts();
    const frontendPort = portInfo?.frontendPort || instancePorts.frontendPort;
    const frontendUrl = `http://localhost:${frontendPort}`;
    console.log(`[Instance ${instanceId}] Loading from dev server: ${frontendUrl}`);
    mainWindow.loadURL(frontendUrl).catch(err => {
      console.error('Failed to load dev server:', err);
      // Try instance-specific default port as fallback
      console.log(`Trying instance default port ${instancePorts.frontendPort}...`);
      mainWindow.loadURL(`http://localhost:${instancePorts.frontendPort}`).catch(err2 => {
        console.error('Failed to load from instance default port:', err2);
      });
    });
  } else {
    // In production, load the built HTML file
    // The frontend will connect to the backend using the port info
    // In packaged app, dist folder contents are in the app directory
    let htmlPath;
    if (app.isPackaged) {
      // In packaged app, electron.js is in dist/, and index.html is also in dist/
      // After packaging, both are in resources/app/
      const appPath = app.getAppPath();
      const possibleHtmlPaths = [
        path.join(__dirname, 'index.html'), // Same directory as electron.js (dist/index.html)
        path.join(appPath, 'index.html'), // resources/app/index.html
        path.join(appPath, 'dist', 'index.html'), // resources/app/dist/index.html (if dist folder is preserved)
        path.join(__dirname, '../index.html') // Fallback
      ];

      // Find the first existing path
      for (const possiblePath of possibleHtmlPaths) {
        if (existsSync(possiblePath)) {
          htmlPath = possiblePath;
          console.log(`[Instance ${instanceId}] Found HTML at: ${htmlPath}`);
          break;
        }
      }
    } else {
      // In development, electron.js is in public/, index.html is in root
      htmlPath = path.join(__dirname, '../index.html');
    }

    console.log(`[Instance ${instanceId}] Loading from file: ${htmlPath || 'not found'}`);
    console.log(`[Instance ${instanceId}] Backend will be on port: ${backendPort || 'not set yet'}`);

    // Check if file exists
    if (!htmlPath || !existsSync(htmlPath)) {
      console.error(`[Instance ${instanceId}] HTML file not found. Tried multiple locations.`);
      // Show error page with instructions
      mainWindow.loadURL('data:text/html,<html><head><title>Error</title></head><body style="font-family: Arial; padding: 40px; text-align: center;"><h1>Application Files Not Found</h1><p>The application files could not be located.</p><p>Please reinstall the application.</p><p style="color: #666; font-size: 12px; margin-top: 40px;">If this problem persists, contact support.</p></body></html>');
    } else {
      // Inject backend port into the page after loading
      mainWindow.webContents.once('did-finish-load', () => {
        // Set the backend port in localStorage so the frontend can use it
        // Use a timeout to ensure backendPort is set
        setTimeout(() => {
          const port = backendPort || getInstanceDefaultPorts().backendPort;
          if (port) {
            mainWindow.webContents.executeJavaScript(`
              localStorage.setItem('backendPort', ${port});
              localStorage.setItem('backendUrl', 'http://localhost:${port}');
              console.log('Backend port set to:', ${port});
            `).catch(err => {
              console.error('Failed to set backend port:', err);
            });
          }
        }, 1000);
      });

      mainWindow.loadFile(htmlPath).catch(err => {
        console.error('Failed to load file:', err);
        // Show error page
        mainWindow.loadURL('data:text/html,<h1>Error Loading Application</h1><p>' + err.message + '</p>');
      });
    }
  }

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();

    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
  });

  // Also show window after a timeout to ensure it appears even if ready-to-show doesn't fire
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      console.log(`[Instance ${instanceId}] Force showing window after timeout`);
      mainWindow.show();
    }
  }, 3000);

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle window close attempt (before it actually closes)
  mainWindow.on('close', async (event) => {
    // Only disconnect if this is the last window
    if (BrowserWindow.getAllWindows().length === 1) {
      event.preventDefault(); // Prevent immediate close
      await disconnectWhatsApp();
      mainWindow.destroy(); // Now close the window
    }
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    import('electron').then(({ shell }) => {
      shell.openExternal(url);
    });
    return { action: 'deny' };
  });
}

// Helper function to disconnect WhatsApp
const disconnectWhatsApp = async () => {
  try {
    // Try to read backend port from port info file, fallback to instance-specific default
    const portInfo = readPortInfo();
    const instancePorts = getInstanceDefaultPorts();
    const backendPort = portInfo?.backendPort || instancePorts.backendPort;
    const backendUrl = `http://localhost:${backendPort}`;
    const response = await fetch(`${backendUrl}/api/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    if (response.ok) {
      console.log(`[Instance ${instanceId}] WhatsApp disconnected successfully`);
    }
  } catch (error) {
    // Ignore errors if server is not running
    console.log(`[Instance ${instanceId}] Could not disconnect WhatsApp (server may be offline):`, error.message);
  }
};

// Allow multiple instances - don't request single instance lock
// Each instance will use different ports automatically
// Comment out the single instance lock to allow multiple instances
// const gotTheLock = app.requestSingleInstanceLock();
// if (!gotTheLock) {
//   app.quit();
//   return;
// }

// Add error handlers before app starts
process.on('uncaughtException', (error) => {
  console.error(`[Instance ${instanceId}] Uncaught Exception:`, error);
  console.error(`[Instance ${instanceId}] Stack:`, error.stack);
  // Show error dialog
  app.whenReady().then(async () => {
    try {
      const { dialog } = await import('electron');
      dialog.showErrorBox(
        'Uncaught Exception',
        `An error occurred: ${error.message}\n\n${error.stack}`
      );
    } catch (e) {
      // Ignore if dialog fails
    }
  });
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(`[Instance ${instanceId}] Unhandled Rejection at:`, promise, 'reason:', reason);
  if (reason instanceof Error) {
    console.error(`[Instance ${instanceId}] Rejection stack:`, reason.stack);
  }
});

console.log(`[Instance ${instanceId}] Starting application (multiple instances allowed)`);
console.log(`[Instance ${instanceId}] isDev: ${isDev}, isPackaged: ${app.isPackaged}`);
console.log(`[Instance ${instanceId}] __dirname: ${__dirname}`);
console.log(`[Instance ${instanceId}] process.execPath: ${process.execPath}`);

// App event handlers
app.whenReady().then(async () => {
  try {
    console.log(`[Instance ${instanceId}] App is ready, starting initialization...`);

    // Create window first so user sees something
    console.log(`[Instance ${instanceId}] Creating window...`);
    createWindow();

    // In production, start the backend server (but don't block window creation)
    if (!isDev) {
      console.log(`[Instance ${instanceId}] Starting backend server in production mode...`);
      // Start server in background, don't wait for it
      startBackendServer().catch((error) => {
        console.error(`[Instance ${instanceId}] Backend server failed to start:`, error);
        // Show error in window if it exists
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.executeJavaScript(`
            console.error('Backend server failed to start:', ${JSON.stringify(error.message)});
            alert('Warning: Backend server failed to start. Some features may not work.\\n\\nError: ' + ${JSON.stringify(error.message)});
          `).catch(() => { });
        }
      });
    } else {
      console.log(`[Instance ${instanceId}] Development mode - backend started separately`);
    }

    app.on('activate', () => {
      // On macOS, re-create window when dock icon is clicked
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });

    console.log(`[Instance ${instanceId}] Application initialized successfully`);

    // Start auto-updater once app is initialized
    setupAutoUpdater();
  } catch (error) {
    console.error(`[Instance ${instanceId}] Failed to start application:`, error);
    console.error(`[Instance ${instanceId}] Error stack:`, error.stack);

    // Try to show error dialog
    try {
      const electron = await import('electron');
      electron.dialog.showErrorBox(
        'Error Starting Application',
        `Failed to start application: ${error.message}\n\nCheck the console for more details.`
      );
    } catch (dialogError) {
      console.error('Failed to show error dialog:', dialogError);
    }

    // Still try to show window with error message
    if (!mainWindow) {
      try {
        createWindow();
        if (mainWindow) {
          mainWindow.webContents.once('did-finish-load', () => {
            mainWindow.webContents.executeJavaScript(`
              document.body.innerHTML = '<div style="padding: 20px; font-family: Arial; text-align: center;"><h1>Error Starting Application</h1><p>${error.message.replace(/'/g, "\\'")}</p><p>Check the console for more details.</p></div>';
            `);
          });
        }
      } catch (windowError) {
        console.error('Failed to create error window:', windowError);
      }
    }

    // Don't quit immediately, let user see the error
    // app.quit();
  }
});

// Handle app launch errors
app.on('will-finish-launching', () => {
  console.log(`[Instance ${instanceId}] App will finish launching`);
});

app.on('ready', () => {
  console.log(`[Instance ${instanceId}] App ready event fired`);
});

// Handle before-quit event (allows async operations)
let isQuiting = false;

const gracefulShutdown = async () => {
  if (isQuiting) return;
  isQuiting = true;
  try {
    await disconnectWhatsApp();
  } catch (error) {
    console.warn('Failed to disconnect WhatsApp during shutdown:', error?.message);
  }
  stopBackendServer();
};

app.on('before-quit', async (event) => {
  if (!isQuiting) {
    event.preventDefault();
    await gracefulShutdown();
    app.exit(0);
  }
});

app.on('window-all-closed', async () => {
  await gracefulShutdown();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle process termination signals
process.on('SIGINT', async () => {
  console.log(`[Instance ${instanceId}] Received SIGINT, shutting down gracefully...`);
  await disconnectWhatsApp();
  stopBackendServer();
  app.quit();
});

process.on('SIGTERM', async () => {
  console.log(`[Instance ${instanceId}] Received SIGTERM, shutting down gracefully...`);
  await disconnectWhatsApp();
  stopBackendServer();
  app.quit();
});

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault();
    import('electron').then(({ shell }) => {
      shell.openExternal(navigationUrl);
    });
  });
});

// Set application menu (disable DevTools menu in production)
const template = [
  {
    label: 'File',
    submenu: [
      {
        label: 'Quit',
        accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
        click: async () => {
          await disconnectWhatsApp();
          stopBackendServer();
          app.quit();
        }
      }
    ]
  },
  {
    label: 'View',
    submenu: [
      { role: 'reload' },
      { role: 'forceReload' },
      // Only allow DevTools from menu in development
      ...(isDev ? [{ role: 'toggleDevTools' }] : []),
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' }
    ]
  }
];

const menu = Menu.buildFromTemplate(template);
Menu.setApplicationMenu(menu);
