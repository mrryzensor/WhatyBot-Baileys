#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const packageJsonPath = join(projectRoot, 'package.json');

// Read package.json
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

// Store original main for restoration
const originalMain = packageJson.main;

// Update main for build
packageJson.main = 'dist/electron.js';

// Write updated package.json
writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf8');

console.log(`✅ Updated package.json main from "${originalMain}" to "dist/electron.js"`);

// Export function to restore
export function restore() {
  packageJson.main = originalMain;
  writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf8');
  console.log(`✅ Restored package.json main to "${originalMain}"`);
}

