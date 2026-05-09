const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

function registerExportHandlers() {
    ipcMain.handle('save-text-files', (event, files) => {
        try {
            files.forEach(file => {
                const filePath = path.join(__dirname, file.filename);
                fs.writeFileSync(filePath, file.content, 'utf8');
                console.log(`[Export] Saved: ${filePath}`);
            });
            return { success: true };
        } catch (error) {
            console.error(`[Export] Save failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    });
}

module.exports = { registerExportHandlers };
