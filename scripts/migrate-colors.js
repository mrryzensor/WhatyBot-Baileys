import fs from 'fs';
import path from 'path';

const TARGET_DIRS = ['./components', './App.tsx'];
const EXCLUDE_FILES = ['Toast.tsx']; // Keep semantic colors for Toast (Success=Green)

function walkDir(dir, callback) {
    if (fs.statSync(dir).isFile()) {
        callback(dir);
        return;
    }

    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        if (isDirectory) {
            walkDir(dirPath, callback);
        } else {
            callback(dirPath);
        }
    });
}

const replaceColors = (filePath) => {
    if (EXCLUDE_FILES.some(f => filePath.endsWith(f))) {
        console.log(`Skipping excluded file: ${filePath}`);
        return;
    }

    if (!filePath.endsWith('.tsx') && !filePath.endsWith('.ts')) return;

    let content = fs.readFileSync(filePath, 'utf8');
    let originalContent = content;

    // Replace green-[number] with primary-[number]
    // Matches bg-green-500, text-green-600, hover:bg-green-500, etc.
    // Also handles arbitrary prefixes like ring-green-500
    const regex = /([a-z0-9:-]+)-green-(\d+)/g;

    content = content.replace(regex, (match, prefix, shade) => {
        // Only replace known valid prefixes to avoid hacking random strings
        if (['bg', 'text', 'border', 'ring', 'fill', 'stroke', 'to', 'from', 'via', 'outline', 'shadow'].some(p => prefix.endsWith(p))) {
            return `${prefix}-primary-${shade}`;
        }
        return match;
    });

    // Handle specific "decoration-green" if exists
    content = content.replace(/decoration-green-(\d+)/g, 'decoration-primary-$1');

    // Handle "accent-green"
    content = content.replace(/accent-green-(\d+)/g, 'accent-primary-$1');

    if (content !== originalContent) {
        console.log(`Updated colors in: ${filePath}`);
        fs.writeFileSync(filePath, content, 'utf8');
    }
};

TARGET_DIRS.forEach(dir => {
    if (fs.existsSync(dir)) {
        walkDir(dir, replaceColors);
    }
});

console.log('Color migration complete.');
