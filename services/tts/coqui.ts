import { spawn } from "child_process";
import path from "path";
import fs from "fs";

const PYTHON_BIN = path.resolve("vendor/tts-venv/bin/python");
const TTS_SCRIPT = path.resolve("services/tts/coqui_tts.py");

export function generateTTS(text: string, outWavPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(outWavPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const args = [TTS_SCRIPT, text, outWavPath];
    const p = spawn(PYTHON_BIN, args, { stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";

    p.stdout.on("data", (d) => {
      const msg = d.toString();
      stdout += msg;
      console.log("[TTS]", msg.trim());
    });

    p.stderr.on("data", (d) => {
      const msg = d.toString();
      stderr += msg;
      console.error("[TTS ERR]", msg.trim());
    });

    p.on("close", (code) => {
      if (code === 0 && fs.existsSync(outWavPath)) {
        resolve(outWavPath);
      } else {
        reject(new Error(`TTS failed (${code}): ${stderr || stdout}`));
      }
    });
  });
}
