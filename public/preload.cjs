const { contextBridge, ipcRenderer } = require('electron');

const profilesAPI = {
  list: () => ipcRenderer.invoke('profiles:list'),
  get: (slug) => ipcRenderer.invoke('profiles:get', slug),
  launch: (slug) => ipcRenderer.invoke('profiles:launch', slug),
  terminate: (slug) => ipcRenderer.invoke('profiles:terminate', slug),
  onStatusChanged: (callback) => {
    ipcRenderer.on('profiles:status-changed', callback);
    return () => ipcRenderer.removeListener('profiles:status-changed', callback);
  }
};

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  profiles: profilesAPI,
  platform: process.platform,
  version: process.version
});

// Remove all listeners when the window is closed
window.addEventListener('beforeunload', () => {
  ipcRenderer.removeAllListeners();
});
