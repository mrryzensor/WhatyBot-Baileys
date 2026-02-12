import fs from 'fs';
import path from 'path';

const TARGET_DIRS = ['./components', './App.tsx'];

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

const replacements = [
    // Backgrounds
    { regex: /bg-\[#f8fafc\]/g, replacement: 'bg-theme-base' },
    { regex: /bg-\[#f0f2f5\]/g, replacement: 'bg-theme-base' },
    { regex: /bg-white/g, replacement: 'bg-theme-card' },
    { regex: /bg-slate-50/g, replacement: 'bg-theme-base' },
    { regex: /bg-slate-900/g, replacement: 'bg-theme-sidebar' }, // Specifically for Sidebar

    // Borders
    { regex: /border-slate-[123]00/g, replacement: 'border-theme' },
    { regex: /border-slate-800/g, replacement: 'border-theme' }, // Sidebar border

    // Text
    { regex: /text-slate-[789]00/g, replacement: 'text-theme-main' },
    { regex: /text-black/g, replacement: 'text-theme-main' },
    { regex: /text-slate-[56]00/g, replacement: 'text-theme-muted' },
    // Sidebar text
    { regex: /text-white/g, replacement: 'text-theme-main' }, // Be careful with this one,buttons might need white text

    // Specific Sidebar/Dark overrides handled by semantic classes
];

const processFile = (filePath) => {
    if (!filePath.endsWith('.tsx') && !filePath.endsWith('.ts')) return;
    // Skip Sidebar for the generic "text-white" replacement because it needs care
    // Actually, let's skip "text-white" generally and only apply it if we are sure it's on a background that flips color
    // Replacing 'text-white' globally is dangerous for buttons (e.g. primary buttons are usually colored bg with white text)
    // Re-evaluating text-white replacement.

    let content = fs.readFileSync(filePath, 'utf8');
    let originalContent = content;

    // Apply safe replacements
    replacements.forEach(({ regex, replacement }) => {
        // skip text-white here, do it manually or more specifically
        if (regex.source.includes('text-white')) return;
        content = content.replace(regex, replacement);
    });

    // Specific fix for Sidebar.tsx text-white -> text-theme-main only in the main container context
    // This is too hard to regex safely. I will handle Sidebar manually or use conditional logic.
    // Replacing bg-[#f8fafc] is safe.

    if (content !== originalContent) {
        console.log(`Updated theme classes in: ${filePath}`);
        fs.writeFileSync(filePath, content, 'utf8');
    }
};

TARGET_DIRS.forEach(dir => {
    if (fs.existsSync(dir)) {
        walkDir(dir, processFile);
    }
});
