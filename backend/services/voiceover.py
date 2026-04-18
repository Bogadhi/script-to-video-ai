import os
from elevenlabs.client import ElevenLabs
from gtts import gTTS

# =========================
# CONFIG
# =========================

client = ElevenLabs(api_key=os.getenv("ELEVENLABS_API_KEY"))

VOICE_MAP = {
    "documentary": "21m00Tcm4TlvDq8ikWAM",
    "motivational": "TxGEqnHWrfWFTfGW9XjX",
    "calm": "EXAVITQu4vr4xnSDxMaL",
    "deep": "VR6AewLTigWG4xSOukaG",
    "energetic": "21m00Tcm4TlvDq8ikWAM"
}


# =========================
# MAIN FUNCTION
# =========================

def generate_scene_voiceover(narration, scene_number, project_dir, voice_style="documentary"):
    output = os.path.join(project_dir, "audio", f"scene_{scene_number}.mp3")
    os.makedirs(os.path.dirname(output), exist_ok=True)

    try:
        voice_id = VOICE_MAP.get(voice_style, VOICE_MAP["documentary"])

        audio = client.text_to_speech.convert(
            voice_id=voice_id,
            model_id="eleven_multilingual_v2",
            text=narration
        )

        with open(output, "wb") as f:
            for chunk in audio:
                f.write(chunk)

        print("[Voice] ✅ ElevenLabs success")
        return output

    except Exception as e:
        print("[Voice] ⚠ ElevenLabs failed → using gTTS")
        print(e)

        # Fallback to gTTS
        tts = gTTS(text=narration, lang="en")
        tts.save(output)

        print("[Voice] ✅ gTTS fallback success")
        return output