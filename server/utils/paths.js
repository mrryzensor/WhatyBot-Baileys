import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project root is two levels up from server/utils
// BUT wait, if we are in server/utils/paths.js, project root is server/..
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const SERVER_ROOT = path.resolve(__dirname, '../');

/**
 * Standardized Path Utility
 * Ensures paths are absolute and consistent across environments
 */

// 1. Data Directory (for JSON rules, menus, etc.)
export const DATA_DIR = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(SERVER_ROOT, 'data');

// 2. Uploads Directory (for media files)
export const UPLOAD_DIR = process.env.UPLOAD_DIR
    ? path.resolve(process.env.UPLOAD_DIR)
    : path.join(PROJECT_ROOT, 'uploads');

// 3. Sessions Directory (for Baileys auth files)
export const SESSION_DIR = process.env.SESSION_DIR
    ? path.resolve(process.env.SESSION_DIR)
    : path.join(SERVER_ROOT, '.baileys_sessions');

// 4. Logs Directory
export const LOGS_DIR = path.join(DATA_DIR, 'local_logs');

// Ensure directories exist
const ensureDir = (dir) => {
    if (!fs.existsSync(dir)) {
        console.log(`[Paths] Creating directory: ${dir}`);
        fs.mkdirSync(dir, { recursive: true });
    }
};

ensureDir(DATA_DIR);
ensureDir(UPLOAD_DIR);
ensureDir(SESSION_DIR);
ensureDir(LOGS_DIR);

export default {
    PROJECT_ROOT,
    SERVER_ROOT,
    DATA_DIR,
    UPLOAD_DIR,
    SESSION_DIR,
    LOGS_DIR
};
