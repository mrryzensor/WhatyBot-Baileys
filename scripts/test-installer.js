#!/usr/bin/env node

/**
 * Script para probar el instalador y ver logs
 * Ejecuta la aplicación instalada y muestra los logs en la consola
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Buscar el ejecutable instalado
const possiblePaths = [
  join(projectRoot, 'release', 'win-unpacked', 'Whatbot.exe'),
  join(process.env.LOCALAPPDATA || '', 'Programs', 'whatbot', 'Whatbot.exe'),
  join(process.env.PROGRAMFILES || '', 'Whatbot', 'Whatbot.exe'),
  join(process.env['PROGRAMFILES(X86)'] || '', 'Whatbot', 'Whatbot.exe')
];

let exePath = null;
for (const possiblePath of possiblePaths) {
  if (existsSync(possiblePath)) {
    exePath = possiblePath;
    break;
  }
}

if (!exePath) {
  console.log('❌ No se encontró el ejecutable instalado.');
  console.log('Buscado en:');
  possiblePaths.forEach(p => console.log(`  - ${p}`));
  console.log('\n💡 Instala la aplicación primero ejecutando: Whatbot Setup 0.0.0.exe');
  process.exit(1);
}

console.log(`✅ Ejecutable encontrado: ${exePath}`);
console.log('🚀 Iniciando aplicación...\n');

// Ejecutar con salida visible
const app = spawn(exePath, [], {
  stdio: 'inherit',
  shell: true
});

app.on('error', (error) => {
  console.error('❌ Error al ejecutar:', error);
});

app.on('exit', (code) => {
  console.log(`\n📊 Aplicación finalizada con código: ${code}`);
});

