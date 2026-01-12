import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Extrae todos los archivos multimedia referenciados en menús y reglas
 * @param {Array} menus - Array de menús interactivos
 * @param {Array} rules - Array de reglas de auto-respuesta
 * @returns {Set} Set de nombres de archivos referenciados
 */
export function getReferencedMediaFiles(menus = [], rules = []) {
    const referencedFiles = new Set();

    // Procesar menús
    menus.forEach(menu => {
        // Media del menú principal
        if (menu.mediaPaths && Array.isArray(menu.mediaPaths)) {
            menu.mediaPaths.forEach(mediaPath => {
                if (mediaPath && !mediaPath.startsWith('http')) {
                    const fileName = path.basename(mediaPath);
                    referencedFiles.add(fileName);
                }
            });
        }

        // Soporte legacy para mediaPath singular
        if (menu.mediaPath && !menu.mediaPath.startsWith('http')) {
            const fileName = path.basename(menu.mediaPath);
            referencedFiles.add(fileName);
        }

        // Media de las opciones del menú
        if (menu.options && Array.isArray(menu.options)) {
            menu.options.forEach(option => {
                if (option.mediaPaths && Array.isArray(option.mediaPaths)) {
                    option.mediaPaths.forEach(mediaPath => {
                        if (mediaPath && !mediaPath.startsWith('http')) {
                            const fileName = path.basename(mediaPath);
                            referencedFiles.add(fileName);
                        }
                    });
                }

                // Soporte legacy para mediaPath singular
                if (option.mediaPath && !option.mediaPath.startsWith('http')) {
                    const fileName = path.basename(option.mediaPath);
                    referencedFiles.add(fileName);
                }
            });
        }
    });

    // Procesar reglas
    rules.forEach(rule => {
        if (rule.mediaPaths && Array.isArray(rule.mediaPaths)) {
            rule.mediaPaths.forEach(mediaPath => {
                if (mediaPath && !mediaPath.startsWith('http')) {
                    const fileName = path.basename(mediaPath);
                    referencedFiles.add(fileName);
                }
            });
        }

        // Soporte legacy para mediaPath singular
        if (rule.mediaPath && !rule.mediaPath.startsWith('http')) {
            const fileName = path.basename(rule.mediaPath);
            referencedFiles.add(fileName);
        }
    });

    return referencedFiles;
}

/**
 * Elimina archivos multimedia que ya no están referenciados
 * @param {string} uploadDir - Directorio de uploads
 * @param {Set} referencedFiles - Set de archivos que están siendo usados
 * @returns {Object} Resultado con archivos eliminados y errores
 */
export function cleanOrphanedMediaFiles(uploadDir, referencedFiles) {
    const result = {
        deleted: [],
        errors: [],
        totalFiles: 0,
        deletedCount: 0
    };

    try {
        if (!fs.existsSync(uploadDir)) {
            return result;
        }

        const files = fs.readdirSync(uploadDir);
        result.totalFiles = files.length;

        files.forEach(fileName => {
            const filePath = path.join(uploadDir, fileName);

            // Verificar que sea un archivo (no directorio)
            try {
                const stats = fs.statSync(filePath);
                if (!stats.isFile()) {
                    return;
                }
            } catch (error) {
                result.errors.push({ fileName, error: error.message });
                return;
            }

            // Si el archivo no está referenciado, eliminarlo
            if (!referencedFiles.has(fileName)) {
                try {
                    fs.unlinkSync(filePath);
                    result.deleted.push(fileName);
                    result.deletedCount++;
                    console.log(`[MediaCleanup] Deleted orphaned file: ${fileName}`);
                } catch (error) {
                    result.errors.push({ fileName, error: error.message });
                    console.error(`[MediaCleanup] Error deleting ${fileName}:`, error);
                }
            }
        });

    } catch (error) {
        console.error('[MediaCleanup] Error reading upload directory:', error);
        result.errors.push({ error: error.message });
    }

    return result;
}

/**
 * Elimina archivos multimedia específicos de un elemento (menú u opción)
 * @param {Object} item - Elemento que contiene mediaPaths
 * @returns {Object} Resultado de la eliminación
 */
export function deleteItemMediaFiles(item) {
    const result = {
        deleted: [],
        errors: []
    };

    const mediaPaths = [];

    // Recopilar todas las rutas de media
    if (item.mediaPaths && Array.isArray(item.mediaPaths)) {
        mediaPaths.push(...item.mediaPaths);
    }
    if (item.mediaPath) {
        mediaPaths.push(item.mediaPath);
    }

    // Eliminar cada archivo
    mediaPaths.forEach(mediaPath => {
        if (mediaPath && !mediaPath.startsWith('http')) {
            try {
                if (fs.existsSync(mediaPath)) {
                    fs.unlinkSync(mediaPath);
                    result.deleted.push(path.basename(mediaPath));
                    console.log(`[MediaCleanup] Deleted file: ${path.basename(mediaPath)}`);
                }
            } catch (error) {
                result.errors.push({ file: path.basename(mediaPath), error: error.message });
                console.error(`[MediaCleanup] Error deleting ${mediaPath}:`, error);
            }
        }
    });

    return result;
}

/**
 * Limpia archivos huérfanos para una sesión específica
 * @param {Object} client - Cliente de WhatsApp con menús y reglas
 * @param {string} uploadDir - Directorio de uploads
 * @returns {Object} Resultado de la limpieza
 */
export function cleanSessionOrphanedFiles(client, uploadDir = './uploads') {
    const menus = client.interactiveMenus || [];
    const rules = client.autoReplyRules || [];

    const referencedFiles = getReferencedMediaFiles(menus, rules);
    const result = cleanOrphanedMediaFiles(uploadDir, referencedFiles);

    console.log(`[MediaCleanup] Session cleanup complete: ${result.deletedCount} orphaned files deleted`);

    return result;
}

/**
 * Limpia archivos huérfanos considerando todas las sesiones activas
 * @param {Object} sessionManager - Gestor de sesiones
 * @param {string} uploadDir - Directorio de uploads
 * @returns {Object} Resultado de la limpieza
 */
export function cleanAllSessionsOrphanedFiles(sessionManager, uploadDir = './uploads') {
    const allReferencedFiles = new Set();

    // Recopilar archivos referenciados de todas las sesiones
    if (sessionManager && sessionManager.sessions) {
        for (const [sessionId, sessionData] of sessionManager.sessions.entries()) {
            const client = sessionData.client;
            if (client) {
                const menus = client.interactiveMenus || [];
                const rules = client.autoReplyRules || [];
                const sessionFiles = getReferencedMediaFiles(menus, rules);

                sessionFiles.forEach(file => allReferencedFiles.add(file));
            }
        }
    }

    const result = cleanOrphanedMediaFiles(uploadDir, allReferencedFiles);

    console.log(`[MediaCleanup] Global cleanup complete: ${result.deletedCount} orphaned files deleted from ${sessionManager?.sessions?.size || 0} sessions`);

    return result;
}
