#!/usr/bin/env node

import { spawn, execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import waitOn from 'wait-on';
import treeKill from 'tree-kill';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

let viteProcess;
let serverProcess;
let electronProcess;
let cleanupCalled = false;

// Function to restore terminal state
const restoreTerminal = () => {
  try {
    // Restore stdin to cooked mode (normal mode)
    if (process.stdin.isTTY && process.stdin.setRawMode) {
      // Check if stdin is in raw mode and restore it
      try {
        process.stdin.setRawMode(false);
      } catch (e) {
        // Ignore if already in cooked mode
      }
    }

    // Ensure stdout is in normal mode
    if (process.stdout.isTTY) {
      // Show cursor if hidden
      process.stdout.write('\x1b[?25h');
      // Reset any terminal formatting
      process.stdout.write('\x1b[0m');
    }

    // On Windows, ensure the terminal is in the correct mode
    if (process.platform === 'win32') {
      // Write a newline to ensure we're on a new line
      process.stdout.write('\n');
    }
  } catch (e) {
    // Ignore errors - terminal might already be restored
  }
};

// Function to kill all processes
const cleanup = () => {
  if (cleanupCalled) return;
  cleanupCalled = true;

  console.log('\nShutting down all processes...');

  // Restore terminal state first
  restoreTerminal();

  const killProcess = (proc, name, signal = 'SIGTERM') => {
    if (!proc || proc.killed) return;
    const pid = proc.pid;
    if (!pid) {
      try {
        proc.kill(signal);
      } catch { }
      return;
    }
    try {
      treeKill(pid, signal, (err) => {
        if (err && err.code !== 'ESRCH') {
          console.warn(`Failed to kill ${name} (pid ${pid}) with ${signal}:`, err.message);
          try {
            proc.kill(signal);
          } catch { }
        }
      });
    } catch (error) {
      try {
        proc.kill(signal);
      } catch { }
    }
  };

  killProcess(viteProcess, 'Vite');
  killProcess(serverProcess, 'Server');
  killProcess(electronProcess, 'Electron');

  // Force kill if graceful shutdown fails
  setTimeout(() => {
    killProcess(viteProcess, 'Vite (force)', 'SIGKILL');
    killProcess(serverProcess, 'Server (force)', 'SIGKILL');
    killProcess(electronProcess, 'Electron (force)', 'SIGKILL');

    // Final terminal restore
    restoreTerminal();
    process.exit(0);
  }, 2000);
};

// Handle process signals
process.on('SIGINT', () => {
  restoreTerminal();
  cleanup();
});

process.on('SIGTERM', () => {
  restoreTerminal();
  cleanup();
});

process.on('exit', () => {
  restoreTerminal();
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  restoreTerminal();
  cleanup();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  restoreTerminal();
  cleanup();
});

// Start Vite dev server
console.log('Starting Vite dev server...');
const pm = 'npm';
viteProcess = spawn(pm, ['run', 'dev'], {
  cwd: projectRoot,
  stdio: ['ignore', 'pipe', 'pipe'], // Don't inherit to avoid terminal issues
  shell: true
});

// Pipe Vite output
viteProcess.stdout.on('data', (data) => {
  process.stdout.write(data);
});

viteProcess.stderr.on('data', (data) => {
  process.stderr.write(data);
});

// Start backend server
console.log('Starting backend server...');
serverProcess = spawn(pm, ['run', 'server'], {
  cwd: projectRoot,
  stdio: ['ignore', 'pipe', 'pipe'], // Don't inherit to avoid terminal issues
  shell: true
});

// Pipe server output
serverProcess.stdout.on('data', (data) => {
  process.stdout.write(data);
});

serverProcess.stderr.on('data', (data) => {
  process.stderr.write(data);
});

const parsePort = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const uniquePorts = (ports = []) => {
  return [...new Set(ports.filter((port) => Number.isFinite(port)))];
};

const waitForPort = async (ports, resourceBuilder, label) => {
  for (let i = 0; i < ports.length; i++) {
    const port = ports[i];
    const resource = resourceBuilder(port);
    console.log(`Checking ${label} on port ${port}...`);
    try {
      await waitOn({
        resources: [resource],
        timeout: i === 0 ? 30000 : 5000,
        interval: 500
      });
      console.log(`✅ ${label} is ready on port ${port}`);
      return port;
    } catch (error) {
      const hasMore = i < ports.length - 1;
      console.log(`⚠️  Port ${port} failed${hasMore ? ', trying another one...' : ''}`);
    }
  }
  throw new Error(`Could not find ${label.toLowerCase()} server`);
};

const frontendPortBase = parsePort(process.env.FRONTEND_PORT, 12345);
const backendPortBase = parsePort(process.env.BACKEND_PORT, 23456);

const frontendPortCandidates = uniquePorts([
  frontendPortBase,
  frontendPortBase + 1,
  frontendPortBase + 2,
  frontendPortBase + 3,
  12345,
  12346,
  12347,
  12348
]);

const backendPortCandidates = uniquePorts([
  backendPortBase,
  backendPortBase + 1,
  backendPortBase + 2,
  backendPortBase + 3,
  23456,
  23457,
  23458,
  23459
]);

// Wait for both servers to be ready, then start Electron
const startElectron = async () => {
  try {
    console.log('Waiting for servers to be ready...');

    // Give dev servers a moment to boot
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const frontendPort = await waitForPort(
      frontendPortCandidates,
      (port) => `http://localhost:${port}`,
      'Frontend'
    );

    const backendPort = await waitForPort(
      backendPortCandidates,
      (port) => `http://localhost:${port}/api/status`,
      'Backend'
    );

    console.log('All servers are ready, starting Electron...');
    console.log(`Frontend confirmed on port ${frontendPort}`);
    console.log(`Backend confirmed on port ${backendPort}`);

    electronProcess = spawn(pm, ['run', 'electron'], {
      cwd: projectRoot,
      stdio: 'inherit',
      shell: true
    });

    electronProcess.on('close', (code) => {
      console.log(`\nElectron process exited with code ${code}`);
      restoreTerminal();
      cleanup();
    });

    electronProcess.on('error', (error) => {
      console.error('Electron process error:', error);
      restoreTerminal();
      cleanup();
    });

  } catch (error) {
    console.error('Error starting Electron:', error);
    console.log('Please check if all servers are running properly.');
    cleanup();
  }
};

// Handle process errors
viteProcess.on('error', (error) => {
  console.error('Vite process error:', error);
  cleanup();
});

serverProcess.on('error', (error) => {
  console.error('Server process error:', error);
  cleanup();
});

// Start the sequence
startElectron();
