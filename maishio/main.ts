// import { app, BrowserWindow, ipcMain } from "electron";
// import path from "path";
// import fs from "fs";
// import { fileURLToPath } from "url";
// import { rhubarbCues } from "../services/lipsync/rhubarb.js";
// import { generateTTS } from "../services/tts/coqui.js";

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// let mainWindow: BrowserWindow | null = null;

// function createWindow() {
//   mainWindow = new BrowserWindow({
//     width: 1200,
//     height: 800,
//     webPreferences: {
//       preload: path.join(__dirname, "preload.cjs"),
//       contextIsolation: true,
//       nodeIntegration: false,
//     },
//   });

//   if (process.env.NODE_ENV === "development") {
//     mainWindow.loadURL("http://localhost:5173");
//     mainWindow.webContents.openDevTools();
//   } else {
//     mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
//   }

//   mainWindow.on("closed", () => {
//     mainWindow = null;
//   });
// }

// app.whenReady().then(createWindow);

// app.on("window-all-closed", () => {
//   if (process.platform !== "darwin") {
//     app.quit();
//   }
// });

// app.on("activate", () => {
//   if (mainWindow === null) {
//     createWindow();
//   }
// });

// // TTS Handler
// ipcMain.handle("tts:make", async (_event, text: string) => {
//   try {
//     const timestamp = Date.now();
//     const wavPath = path.join(process.cwd(), "runtime", "audio", `reply_${timestamp}.wav`);
    
//     console.log("[Main] Generating TTS for:", text.substring(0, 50) + "...");
//     await generateTTS(text, wavPath);
    
//     console.log("[Main] TTS complete:", wavPath);
//     return { wav: wavPath };
//   } catch (error: any) {
//     console.error("[Main] TTS error:", error);
//     throw error;
//   }
// });

// // Lip-sync Handler
// ipcMain.handle("lipsync:make", async (_event, { wavPath }) => {
//   try {
//     const outPath = path.join(process.cwd(), "runtime", "cues", `${path.basename(wavPath, '.wav')}.json`);
    
//     console.log("[Main] Generating lip-sync cues for:", wavPath);
//     await rhubarbCues(wavPath, outPath);
    
//     const cuesData = JSON.parse(fs.readFileSync(outPath, "utf-8"));
//     console.log("[Main] Lip-sync complete:", cuesData.mouthCues?.length || 0, "cues");
    
//     return cuesData.mouthCues || [];
//   } catch (error: any) {
//     console.error("[Main] Lip-sync error:", error);
//     throw error;
//   }
// });

// // File read handler
// ipcMain.handle("file:read", async (_event, filePath: string) => {
//   try {
//     const data = fs.readFileSync(filePath);
//     return data.toString("base64");
//   } catch (error: any) {
//     console.error("[Main] File read error:", error);
//     throw error;
//   }
// });
import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import isDev from 'electron-is-dev'

// Resolve __dirname when using ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function createWindow() {
  // Choose the correct preload path for dev vs prod
  const preloadPath = isDev
    ? path.resolve(process.cwd(), 'maishio', 'preload.cjs')   // dev: source folder
    : path.join(__dirname, 'preload.cjs')                     // prod: packaged dist

  if (!fs.existsSync(preloadPath)) {
    console.warn('[Main] ⚠️ Preload file not found at:', preloadPath)
  } else {
    console.log('[Main] ✅ Using preload:', preloadPath)
  }

  const win = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Load frontend depending on environment
  if (isDev) {
    win.loadURL('http://localhost:5173')   // served by Vite during dev
  } else {
    win.loadFile(path.join(__dirname, '../../dist/index.html'))
  }

  // Optional: open DevTools in dev mode
  if (isDev) {
    win.webContents.openDevTools({ mode: 'detach' })
  }
}

// -----------------------------------------------------------------------------
// Example IPC handlers (you can expand these)
// -----------------------------------------------------------------------------
ipcMain.handle('file:read', async (_event, filePath: string) => {
  const data = fs.readFileSync(filePath)
  return data.toString('base64')
})

// (Stub handlers — these will later call your Python/Rhubarb logic)
ipcMain.handle('tts:make', async (_event, text: string) => {
  console.log('[Main] tts:make →', text)
  return { wav: '/path/to/generated.wav' }
})

ipcMain.handle('lipsync:make', async (_event, { wavPath }) => {
  console.log('[Main] lipsync:make →', wavPath)
  return { cues: [] }
})

// -----------------------------------------------------------------------------
// App lifecycle
// -----------------------------------------------------------------------------
app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
