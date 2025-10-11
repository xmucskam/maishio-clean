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



// import { app, BrowserWindow, ipcMain } from 'electron'
// import path from 'path'
// import fs from 'fs'
// import { fileURLToPath } from 'url'
// import isDev from 'electron-is-dev'

// // Resolve __dirname when using ES modules
// const __filename = fileURLToPath(import.meta.url)
// const __dirname = path.dirname(__filename)

// function createWindow() {
//   // Choose the correct preload path for dev vs prod
//   const preloadPath = isDev
//     ? path.resolve(process.cwd(), 'maishio', 'preload.cjs')   // dev: source folder
//     : path.join(__dirname, 'preload.cjs')                     // prod: packaged dist

//   if (!fs.existsSync(preloadPath)) {
//     console.warn('[Main] ⚠️ Preload file not found at:', preloadPath)
//   } else {
//     console.log('[Main] ✅ Using preload:', preloadPath)
//   }

//   const win = new BrowserWindow({
//     width: 1000,
//     height: 800,
//     webPreferences: {
//       preload: preloadPath,
//       contextIsolation: true,
//       nodeIntegration: false,
//     },
//   })

//   // Load frontend depending on environment
//   if (isDev) {
//     win.loadURL('http://localhost:5173')   // served by Vite during dev
//   } else {
//     win.loadFile(path.join(__dirname, '../../dist/index.html'))
//   }

//   // Optional: open DevTools in dev mode
//   if (isDev) {
//     win.webContents.openDevTools({ mode: 'detach' })
//   }
// }

// // -----------------------------------------------------------------------------
// // Example IPC handlers (you can expand these)
// // -----------------------------------------------------------------------------
// ipcMain.handle('file:read', async (_event, filePath: string) => {
//   const data = fs.readFileSync(filePath)
//   return data.toString('base64')
// })

// // (Stub handlers — these will later call your Python/Rhubarb logic)
// ipcMain.handle('tts:make', async (_event, text: string) => {
//   console.log('[Main] tts:make →', text)
//   return { wav: '/path/to/generated.wav' }
// })

// ipcMain.handle('lipsync:make', async (_event, { wavPath }) => {
//   console.log('[Main] lipsync:make →', wavPath)
//   return { cues: [] }
// })

// // -----------------------------------------------------------------------------
// // App lifecycle
// // -----------------------------------------------------------------------------
// app.whenReady().then(() => {
//   createWindow()

//   app.on('activate', () => {
//     if (BrowserWindow.getAllWindows().length === 0) createWindow()
//   })
// })

// app.on('window-all-closed', () => {
//   if (process.platform !== 'darwin') app.quit()
// })



// import { app, BrowserWindow, ipcMain } from 'electron'
// import path from 'path'
// import fs from 'fs'
// import { spawn } from 'child_process'
// import { fileURLToPath } from 'url'
// import isDev from 'electron-is-dev'

// // Resolve __dirname for ESM
// const __filename = fileURLToPath(import.meta.url)
// const __dirname = path.dirname(__filename)

// function resolvePreload() {
//   // In dev, point to source; in prod, next to main bundle
//   const p = isDev
//     ? path.resolve(process.cwd(), 'maishio', 'preload.cjs')
//     : path.join(__dirname, 'preload.cjs')

//   if (!fs.existsSync(p)) {
//     console.warn('[Main] ⚠️ Preload not found at:', p)
//   } else {
//     console.log('[Main] ✅ Using preload:', p)
//   }
//   return p
// }

// function createWindow() {
//   const win = new BrowserWindow({
//     width: 1100,
//     height: 820,
//     webPreferences: {
//       preload: resolvePreload(),
//       contextIsolation: true,
//       nodeIntegration: false,
//     },
//   })

//   if (isDev) {
//     win.loadURL('http://localhost:5173')
//     win.webContents.openDevTools({ mode: 'detach' })
//   } else {
//     win.loadFile(path.join(__dirname, '../../dist/index.html'))
//   }
// }

// /* ----------------------------- IPC: file:read ----------------------------- */
// ipcMain.handle('file:read', async (_evt, filePath: string) => {
//   const data = fs.readFileSync(filePath)
//   return data.toString('base64')
// })

// /* ----------------------------- IPC: tts:make ------------------------------ */
// /**
//  * Spawns Python TTS and writes a WAV into runtime/tts/speech_<ts>.wav
//  * Expects a Python script at services/tts/coqui_tts.py
//  */
// ipcMain.handle('tts:make', async (_evt, { text }: { text: string }) => {
//   const pythonScript = path.resolve(process.cwd(), 'services', 'tts', 'coqui_tts.py')
//   const outDir = path.resolve(process.cwd(), 'runtime', 'tts')
//   if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

//   const outFile = path.join(outDir, `speech_${Date.now()}.wav`)
//   console.log('[Main] TTS start →', pythonScript, '->', outFile)

//   return new Promise<{ wav: string }>((resolve, reject) => {
//     const proc = spawn('python3', [pythonScript, text, outFile], { cwd: process.cwd() })

//     proc.stdout.on('data', d => console.log('[TTS]', d.toString().trim()))
//     proc.stderr.on('data', d => console.error('[TTS ERR]', d.toString().trim()))

//     proc.on('close', code => {
//       if (code === 0 && fs.existsSync(outFile)) {
//         console.log('[Main] ✅ TTS OK:', outFile)
//         resolve({ wav: outFile })
//       } else {
//         reject(new Error(`TTS failed with code ${code}`))
//       }
//     })
//   })
// })

// /* --------------------------- IPC: lipsync:make ---------------------------- */
// /**
//  * Runs Rhubarb on a WAV and returns JSON cues.
//  * Set RHUBARB_BIN env or adjust the default path below.
//  */
// ipcMain.handle('lipsync:make', async (_evt, { wavPath }: { wavPath: string }) => {
//   const rhubarbBin =
//     process.env.RHUBARB_BIN ||
//     path.resolve(process.cwd(), 'vendor', 'rhubarb', process.platform === 'win32' ? 'rhubarb.exe' : 'rhubarb')

//   const outJson = `${wavPath.replace(/\.wav$/i, '')}.json`
//   console.log('[Main] Rhubarb start →', rhubarbBin, wavPath, '->', outJson)

//   return new Promise<{ cues: Array<{ start: number; end: number; value: string }> }>((resolve, reject) => {
//     const args = ['-f', 'json', wavPath, '-o', outJson]
//     const proc = spawn(rhubarbBin, args, { cwd: process.cwd() })

//     proc.stdout.on('data', d => console.log('[Rhubarb]', d.toString().trim()))
//     proc.stderr.on('data', d => console.error('[Rhubarb ERR]', d.toString().trim()))

//     proc.on('close', code => {
//       if (code === 0 && fs.existsSync(outJson)) {
//         const json = fs.readFileSync(outJson, 'utf-8')
//         const parsed = JSON.parse(json)
//         // Rhubarb JSON has "mouthCues": [{start, end, value}, ...]
//         const cues = parsed?.mouthCues ?? []
//         console.log('[Main] ✅ Rhubarb OK:', outJson, `(${cues.length} cues)`)
//         resolve({ cues })
//       } else {
//         reject(new Error(`Rhubarb failed with code ${code}`))
//       }
//     })
//   })
// })

// /* ------------------------------ App lifecycle ----------------------------- */
// app.whenReady().then(() => {
//   createWindow()
//   app.on('activate', () => {
//     if (BrowserWindow.getAllWindows().length === 0) createWindow()
//   })
// })

// app.on('window-all-closed', () => {
//   if (process.platform !== 'darwin') app.quit()
// })


// maishio/main.ts
import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import isDev from 'electron-is-dev'
import { spawn } from 'child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// -------------------- PATHS / CONFIG --------------------
const PROJECT_ROOT = process.cwd()

// Prefer the repo venv's python if it exists, else use system python3.
const VENV_PY = path.resolve(PROJECT_ROOT, 'vendor', 'tts-venv', 'bin', 'python3')
const PYTHON_BIN = fs.existsSync(VENV_PY) ? VENV_PY : 'python3'

// Your coqui script (we call it with positional args: "text" out.wav)
const COQUI_SCRIPT = path.resolve(PROJECT_ROOT, 'services', 'tts', 'coqui_tts.py')

// Rhubarb binary; override with RHUBARB_BIN if you want.
const DEFAULT_RHUBARB = path.resolve(PROJECT_ROOT, 'vendor', 'rhubarb', 'rhubarb', 'rhubarb')
const RHUBARB_BIN = process.env.RHUBARB_BIN || DEFAULT_RHUBARB

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
  return p
}

function runtimeDir() {
  // dev: ./runtime ; prod: ~/Library/Application Support/<AppName>
  const base = isDev ? path.resolve(PROJECT_ROOT, 'runtime') : app.getPath('userData')
  ensureDir(base)
  return base
}

function outPaths() {
  const baseAudio = ensureDir(path.join(runtimeDir(), 'audio'))
  const baseCues  = ensureDir(path.join(runtimeDir(), 'cues'))
  const ts = Date.now()
  return {
    wav: path.join(baseAudio, `out-${ts}.wav`),
    json: path.join(baseCues,  `out-${ts}.json`),
  }
}

// -------------------- WINDOW --------------------
function createWindow() {
  const preloadPath = isDev
    ? path.resolve(PROJECT_ROOT, 'maishio', 'preload.cjs')
    : path.join(__dirname, 'preload.cjs')

  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(path.join(__dirname, '../../dist/index.html'))
  }
}

// -------------------- IPC HANDLERS --------------------
ipcMain.handle('file:read', async (_e, filePath: string) => {
  const data = fs.readFileSync(filePath)
  return data.toString('base64')
})

// TTS via your coqui_tts.py:  python coqui_tts.py "text" out.wav
ipcMain.handle('tts:make', async (_e, { text }: { text: string }) => {
  if (!text || !text.trim()) throw new Error('TTS: empty text')
  if (!fs.existsSync(COQUI_SCRIPT)) {
    throw new Error(`TTS script not found at ${COQUI_SCRIPT}`)
  }
  const { wav } = outPaths()

  // coqui_tts.py sets TTS_HOME relative to itself; no extra env needed.
  await execSpawn(PYTHON_BIN, [COQUI_SCRIPT, text, wav], { cwd: PROJECT_ROOT })

  if (!fs.existsSync(wav)) throw new Error('TTS failed: WAV not produced')
  return { wav }
})

// Lip sync via Rhubarb
ipcMain.handle('lipsync:make', async (_e, { wavPath }: { wavPath: string }) => {
  if (!wavPath || !fs.existsSync(wavPath)) throw new Error('LipSync: WAV not found')
  const rhubarb = RHUBARB_BIN
  if (!fs.existsSync(rhubarb)) {
    throw new Error(`Rhubarb binary not found at ${rhubarb}. Set RHUBARB_BIN env if needed.`)
  }
  const { json } = outPaths()

  // rhubarb -f json -o out.json input.wav
  await execSpawn(rhubarb, ['-f', 'json', '-o', json, wavPath], { cwd: PROJECT_ROOT })

  if (!fs.existsSync(json)) throw new Error('Rhubarb failed: JSON not produced')

  // Expect an array of cues: [{ start, end, value }, ...]
  const content = fs.readFileSync(json, 'utf-8')
  let cues: any = []
  try { cues = JSON.parse(content) } catch (e) {
    throw new Error('Rhubarb JSON parse error')
  }
  return { cues }
})

// -------------------- SPAWN UTILITY --------------------
function execSpawn(cmd: string, args: string[], opts: { cwd?: string }) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: opts.cwd, stdio: 'pipe' })
    let stderr = ''
    p.stdout.on('data', d => process.stdout.write(d))
    p.stderr.on('data', d => { stderr += d.toString(); process.stderr.write(d) })
    p.on('error', reject)
    p.on('close', code => {
      if (code === 0) resolve()
      else reject(new Error(`${cmd} exited with code ${code}\n${stderr}`))
    })
  })
}

// -------------------- APP LIFECYCLE --------------------
app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
