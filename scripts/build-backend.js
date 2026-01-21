import esbuild from 'esbuild';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '..');
const serverDir = path.join(projectRoot, 'server');
const distServerDir = path.join(projectRoot, 'dist-server');

// Ensure dist-server directory exists
if (!fs.existsSync(distServerDir)) {
    fs.mkdirSync(distServerDir, { recursive: true });
}

// Get all dependencies from server/package.json to mark as external
// We want to bundle relative imports (our code) but keep node_modules external
const serverPackageJson = require(path.join(serverDir, 'package.json'));
const dependencies = Object.keys(serverPackageJson.dependencies || {});
const peerDependencies = Object.keys(serverPackageJson.peerDependencies || {});
const external = [...dependencies, ...peerDependencies, 'electron'];

console.log('📦 Bundling backend...');

await esbuild.build({
    entryPoints: [path.join(serverDir, 'server.js')],
    bundle: true,
    platform: 'node',
    target: 'node18',
    outfile: path.join(distServerDir, 'server.js'),
    external: external, // Mark dependencies as external
    format: 'esm', // ESM for Node.js (since package.json has "type": "module")
    sourcemap: false, // No sourcemaps for production to hide code better
    minify: true, // Minify to further obfuscate and reduce size
    loader: {
        '.node': 'file', // Handle .node native extensions if any
    },
    logLevel: 'info',
}).then(() => {
    console.log('✅ Backend bundled successfully to dist-server/server.js');
}).catch((err) => {
    console.error('❌ Build failed:', err);
    process.exit(1);
});
