import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

/**
 * Optimiza las imágenes subidas de forma transparente e in-situ (en el mismo path).
 * Soporta JPEG, PNG, WebP, GIF, etc.
 * 
 * @param {object} req - Express request object containing req.files or req.file
 */
export async function optimizeUploadedFiles(req) {
    const files = req.files || (req.file ? [req.file] : []);
    if (!files || files.length === 0) return;

    for (const file of files) {
        if (!file.path) continue;

        const ext = path.extname(file.originalname).toLowerCase();
        const isImage = /^\.(jpg|jpeg|png|webp|tiff|gif)$/i.test(ext) || (file.mimetype && file.mimetype.startsWith('image/'));
        
        // No optimizar si no es imagen o si es un SVG vector
        if (!isImage || ext === '.svg') continue;

        try {
            const tempPath = file.path + '.tmp';
            console.log(`[MediaOptimizer] Optimizing file: ${file.originalname} (${ext}) at ${file.path}`);
            
            let pipeline = sharp(file.path);
            
            // Si es un GIF animado, procesamos todos sus frames
            if (ext === '.gif') {
                pipeline = sharp(file.path, { animated: true });
            }

            // Reducir resolución de forma balanceada si supera los 2000px
            pipeline = pipeline.resize({
                width: 2000,
                height: 2000,
                fit: 'inside',
                withoutEnlargement: true
            });

            // Optimizar según el formato manteniendo la extensión original intacta
            if (ext === '.png') {
                pipeline = pipeline.png({ palette: true, quality: 80, compressionLevel: 8 });
            } else if (ext === '.gif') {
                pipeline = pipeline.gif({ colours: 128, quality: 75 });
            } else if (ext === '.webp') {
                pipeline = pipeline.webp({ quality: 80 });
            } else {
                // JPEG / JPG
                pipeline = pipeline.jpeg({ quality: 80, mozjpeg: true });
            }

            await pipeline.toFile(tempPath);

            // Reemplazar el archivo original con la versión optimizada de forma atómica
            if (fs.existsSync(tempPath)) {
                const oldSize = fs.statSync(file.path).size;
                fs.unlinkSync(file.path);
                fs.renameSync(tempPath, file.path);
                
                const newSize = fs.statSync(file.path).size;
                const savings = ((oldSize - newSize) / oldSize * 100).toFixed(1);
                console.log(`[MediaOptimizer] Success for ${file.originalname}: ${oldSize} bytes -> ${newSize} bytes (Saved ${savings}%)`);
                
                // Actualizar el tamaño en el objeto de multer
                file.size = newSize;
            }
        } catch (error) {
            console.error(`[MediaOptimizer] Failed to optimize ${file.originalname}, keeping original:`, error.message);
            // El flujo principal continúa de forma segura con el archivo original intacto
        }
    }
}
