#!/usr/bin/env python3
import sys
import os

# Optional: use Piper instead of Coqui, uncomment these lines and adjust
# import subprocess

def main():
    if len(sys.argv) < 3:
        print("Usage: coqui_tts.py <text> <outpath>")
        sys.exit(1)

    text = sys.argv[1]
    out_path = sys.argv[2]
    out_dir = os.path.dirname(out_path)
    if out_dir and not os.path.exists(out_dir):
        os.makedirs(out_dir, exist_ok=True)

    try:
        # --- Coqui TTS (preferred) ---
        # pip install TTS
        from TTS.api import TTS
        model_name = os.environ.get('COQUI_MODEL', 'tts_models/en/ljspeech/tacotron2-DDC')

        print(f"[Coqui] Loading model {model_name}...")
        tts = TTS(model_name)
        print(f"[Coqui] Synthesizing: {text}")
        tts.tts_to_file(text=text, file_path=out_path)
        print(f"[Coqui] Saved to {out_path}")

        sys.exit(0)

        # --- Piper example (alternative) ---
        # PIPER_BIN = os.environ.get('PIPER_BIN', 'piper')
        # VOICE = os.environ.get('PIPER_VOICE', 'en_US-lessac-medium')
        # cmd = [PIPER_BIN, '-m', VOICE, '-f', out_path]
        # print("[Piper] Synthesizing...")
        # p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
        # p.communicate(input=text.encode('utf-8'))
        # rc = p.wait()
        # if rc == 0:
        #     print(f"[Piper] Saved to {out_path}")
        #     sys.exit(0)
        # else:
        #     print("[Piper] Failed with code", rc)
        #     sys.exit(rc)

    except Exception as e:
        print("[TTS ERROR]", e)
        sys.exit(2)

if __name__ == "__main__":
    main()
