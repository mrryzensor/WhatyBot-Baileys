const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

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

esbuild.build({
    entryPoints: [path.join(serverDir, 'server.js')],
    bundle: true,
    platform: 'node',
    target: 'node18',
    outfile: path.join(distServerDir, 'server.js'),
    external: external, // Mark dependencies as external
    format: 'cjs', // CommonJS for Node.js
    sourcemap: false, // No sourcemaps for production to hide code better
    minify: true, // Minify to further obfuscate and reduce size
    loader: {
        '.node': 'file', // Handle .node native extensions if any
    },
    logLevel: 'info',
}).then(() => {
    console.log('✅ Backend bundled successfully to dist-server/server.js');

    // Copy other necessary files that might not be bundled or are needed
    // e.g., local database files or config files if they exist in source and aren't generated
    // But typically DATA_DIR handles runtime data. 

    // We DO need to ensure package.json is there if we were running npm install, 
    // but since we copy node_modules separately, we mainy need the bundle.

}).catch((err) => {
    console.error('❌ Build failed:', err);
    process.exit(1);
});
