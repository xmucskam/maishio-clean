import { app, BrowserWindow, ipcMain } from "electron";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { rhubarbCues } from "../services/lipsync/rhubarb.js";
import { generateTTS } from "../services/tts/coqui.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.NODE_ENV === "development") {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// TTS Handler
ipcMain.handle("tts:make", async (_event, text: string) => {
  try {
    const timestamp = Date.now();
    const wavPath = path.join(process.cwd(), "runtime", "audio", `reply_${timestamp}.wav`);
    
    console.log("[Main] Generating TTS for:", text.substring(0, 50) + "...");
    await generateTTS(text, wavPath);
    
    console.log("[Main] TTS complete:", wavPath);
    return { wav: wavPath };
  } catch (error: any) {
    console.error("[Main] TTS error:", error);
    throw error;
  }
});

// Lip-sync Handler
ipcMain.handle("lipsync:make", async (_event, { wavPath }) => {
  try {
    const outPath = path.join(process.cwd(), "runtime", "cues", `${path.basename(wavPath, '.wav')}.json`);
    
    console.log("[Main] Generating lip-sync cues for:", wavPath);
    await rhubarbCues(wavPath, outPath);
    
    const cuesData = JSON.parse(fs.readFileSync(outPath, "utf-8"));
    console.log("[Main] Lip-sync complete:", cuesData.mouthCues?.length || 0, "cues");
    
    return cuesData.mouthCues || [];
  } catch (error: any) {
    console.error("[Main] Lip-sync error:", error);
    throw error;
  }
});

// File read handler
ipcMain.handle("file:read", async (_event, filePath: string) => {
  try {
    const data = fs.readFileSync(filePath);
    return data.toString("base64");
  } catch (error: any) {
    console.error("[Main] File read error:", error);
    throw error;
  }
});
