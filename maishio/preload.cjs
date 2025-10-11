// maishio/preload.cjs
// CommonJS preload – no TypeScript, no ESM imports
const { contextBridge, ipcRenderer } = require('electron');

console.log('[Preload] Loaded');

contextBridge.exposeInMainWorld('api', {
  invoke: (channel, data) => ipcRenderer.invoke(channel, data),
  on: (channel, listener) => ipcRenderer.on(channel, listener),
});

