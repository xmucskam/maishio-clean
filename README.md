# 🧠 Maishio Clean

This repository contains the source code for the **Maishio** Electron + Vite + React application, which includes text-to-speech (TTS), lip-sync processing, and local AI model inference components.

---

## ⚙️ Overview

The project is split into several key parts:

- **Electron (main & preload):** Application window management and backend process handling.
- **Vite + React (renderer):** Frontend user interface.
- **Services:** Local scripts for TTS generation and lip-sync processing.
- **Models:** AI model files used for inference (not included due to size restrictions).

---

## 🚫 Large Files Not Included

Certain large files were **excluded** from the repository due to GitHub's 100 MB and ~1 GB total size limits.  
You’ll need to **manually place these files** in the correct folders after cloning.

### Excluded Folders & Files

| Path | Description |
|------|--------------|
| `models/` | LLM and speech model files (e.g., `.gguf`, `.pth`, `.bin`) |
| `runtime/audio/` | Generated TTS audio output |
| `runtime/cues/` | Lip-sync cue JSON output |
| `vendor/tts-venv/` | Python virtual environment for TTS |
| `dist/` | Compiled build output (generated at runtime) |

---

## 🧩 How to Restore Missing Files

### 1. Download or prepare model files
Download the necessary model files from their official sources (for example, from [Hugging Face](https://huggingface.co) or the project documentation).

Place them in:
 models/Meta-llama-3-8B.gguf

---

### 2. Set up the Python environment (for TTS)

If using the included `coqui_tts.py` or similar Python scripts:

```bash
cd vendor
python3 -m venv tts-venv
source tts-venv/bin/activate
pip install -r requirements.txt
```

If you don’t have a requirements.txt file, install your TTS library manually.)


###Run APP
```bash
npm install
npm run dev
```
For a production build:
(local llm server has to be running )
```bash
npm run build
npm run start
```
🧰 Notes

The app uses Electron for desktop integration and Vite + React for the UI.

Large model and runtime data are kept local for performance and privacy.

Always verify your .gitignore excludes large binary files before committing.

📜 License

This project is for educational and research purposes.
All model files belong to their respective owners and are not distributed through this repository.
