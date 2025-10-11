import { spawn } from "child_process";
import path from "path";
import fs from "fs";

const RHUBARB_BIN = path.resolve("vendor/rhubarb/rhubarb");

export function rhubarbCues(wavPath, outJsonPath) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(outJsonPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const args = ["-f", "json", wavPath, "-o", outJsonPath];

    const p = spawn(RHUBARB_BIN, args, { stdio: ["ignore", "pipe", "pipe"] });

    p.stdout.on("data", d => console.log("[Rhubarb]", d.toString().trim()));
    p.stderr.on("data", d => console.error("[Rhubarb ERR]", d.toString().trim()));

    p.on("close", code => {
      if (code === 0 && fs.existsSync(outJsonPath)) {
        resolve(outJsonPath);
      } else {
        reject(new Error(`Rhubarb failed (${code})`));
      }
    });
  });
}
