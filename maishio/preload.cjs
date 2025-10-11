// CommonJS preload (no TypeScript/ESM) to avoid import/export issues
const { contextBridge, ipcRenderer } = require('electron')

console.log('[Preload] loaded')

contextBridge.exposeInMainWorld('api', {
  invoke: (channel, data) => ipcRenderer.invoke(channel, data),
  on: (channel, listener) => ipcRenderer.on(channel, listener),
})

