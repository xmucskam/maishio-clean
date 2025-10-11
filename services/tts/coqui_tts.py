import sys, os
from TTS.api import TTS

def main():
    if len(sys.argv) < 3:
        print('Usage: python services/tts/coqui_tts.py "text" runtime/out.wav')
        sys.exit(1)

    text = sys.argv[1]
    out_path = sys.argv[2]
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    os.environ["TTS_HOME"] = os.path.join(os.path.dirname(__file__), "../../vendor")
    model_name = "tts_models/multilingual/multi-dataset/xtts_v2"

    tts = TTS(model_name)

    tts.tts_to_file(
        text=text,
        file_path=out_path,
        speaker="Daisy Studious",
        language="en"
    )

    print(f"[OK] Wrote {out_path}")

if __name__ == "__main__":
    main()
