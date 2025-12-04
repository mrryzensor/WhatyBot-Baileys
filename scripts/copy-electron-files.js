#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, resolve, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');
const distDir = join(projectRoot, 'dist');

// Ensure dist directory exists
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

const filesToCopy = [
  { src: 'public/electron.js', dest: 'dist/electron.js' },
  { src: 'public/preload.cjs', dest: 'dist/preload.cjs' }
];

let copied = 0;
let failed = 0;

filesToCopy.forEach(({ src, dest }) => {
  const srcPath = join(projectRoot, src);
  const destPath = join(projectRoot, dest);
  
  if (existsSync(srcPath)) {
    try {
      // Ensure destination directory exists
      const destDir = dirname(destPath);
      if (!existsSync(destDir)) {
        mkdirSync(destDir, { recursive: true });
      }
      
      copyFileSync(srcPath, destPath);
      console.log(`✅ Copied ${src} to ${dest}`);
      copied++;
    } catch (error) {
      console.error(`❌ Failed to copy ${src}:`, error.message);
      failed++;
    }
  } else {
    console.warn(`⚠️  ${src} not found`);
    failed++;
  }
});

if (failed === 0) {
  console.log(`\n✅ Successfully copied ${copied} file(s) to dist/`);
  process.exit(0);
} else {
  console.error(`\n❌ Failed to copy ${failed} file(s)`);
  process.exit(1);
}

