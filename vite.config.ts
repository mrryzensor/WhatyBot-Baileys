import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { findAvailablePort, savePortInfo, readPortInfo, isPortAvailable } from './utils/portFinder.js';
import { readFileSync, existsSync, copyFileSync } from 'fs';

export default defineConfig(async ({ mode }) => {
    const env = loadEnv(mode, '.', '');
    
    // Use port 12345 (uncommon 5-digit port) or find next available
    const defaultPort = 12345;
    let frontendPort = defaultPort;
    
    try {
      // List of common ports to avoid (Vite default, common dev ports, etc.)
      const commonPortsToAvoid = [5173, 3000, 8000, 8080, 5174, 5175, 3001, 5000, 4000];
      
      // Try to use default port first
      const portInfo = readPortInfo();
      if (portInfo?.frontendPort && !commonPortsToAvoid.includes(portInfo.frontendPort)) {
        // Check if the saved port is still available and not a common port
        const available = await isPortAvailable(portInfo.frontendPort);
        if (available) {
          frontendPort = portInfo.frontendPort;
        } else {
          frontendPort = await findAvailablePort(defaultPort);
        }
      } else {
        // Always use new default port if saved port is common or doesn't exist
        frontendPort = await findAvailablePort(defaultPort);
      }
      
      // Save port info
      const currentPortInfo = readPortInfo() || {};
      savePortInfo({
        ...currentPortInfo,
        frontendPort
      });
      
      console.log(`🌐 Frontend running on port ${frontendPort}`);
    } catch (error) {
      console.warn('Could not find available port, using default:', error);
    }
    
    return {
      server: {
        port: frontendPort,
        host: '0.0.0.0',
        strictPort: false, // Allow Vite to find another port if this one is taken
        fs: {
          allow: ['..']
        }
      },
      plugins: [
        react(),
        // Plugin to serve .port-info.json
        {
          name: 'serve-port-info',
          configureServer(server) {
            server.middlewares.use('/.port-info.json', (req, res, next) => {
              const portInfoPath = path.resolve(__dirname, '.port-info.json');
              try {
                if (existsSync(portInfoPath)) {
                  const content = readFileSync(portInfoPath, 'utf8');
                  res.setHeader('Content-Type', 'application/json');
                  res.setHeader('Access-Control-Allow-Origin', '*');
                  res.end(content);
                } else {
                  res.statusCode = 404;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'Port info not found' }));
                }
              } catch (error) {
                console.error('Error reading port info:', error);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Error reading port info', message: error.message }));
              }
            });
          }
        },
        // Plugin to copy electron files to dist
        {
          name: 'copy-electron',
          writeBundle() {
            const filesToCopy = [
              { src: 'public/electron.js', dest: 'dist/electron.js' },
              { src: 'public/preload.cjs', dest: 'dist/preload.cjs' }
            ];
            
            filesToCopy.forEach(({ src, dest }) => {
              const srcPath = path.resolve(__dirname, src);
              const destPath = path.resolve(__dirname, dest);
              if (existsSync(srcPath)) {
                copyFileSync(srcPath, destPath);
                console.log(`✅ Copied ${src} to ${dest}`);
              } else {
                console.warn(`⚠️  ${src} not found`);
              }
            });
          }
        }
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.NODE_ENV': JSON.stringify(mode === 'development' ? 'development' : 'production')
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        },
        extensions: ['.ts', '.tsx', '.js', '.jsx', '.json']
      },
      base: './',
      build: {
        outDir: 'dist',
        assetsDir: 'assets',
        sourcemap: true,
        rollupOptions: {
          input: {
            main: path.resolve(__dirname, 'index.html')
          }
        }
      }
    };
});
