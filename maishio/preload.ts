import { contextBridge, ipcRenderer } from "electron";

console.log("[Preload] Loading preload script...");

contextBridge.exposeInMainWorld("api", {
  invoke: (channel: string, data?: any) => {
    console.log("[Preload] Invoking:", channel, data);
    return ipcRenderer.invoke(channel, data);
  }
});

console.log("[Preload] Preload script loaded successfully");
