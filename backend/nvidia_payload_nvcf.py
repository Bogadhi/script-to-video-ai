import os
import requests
import json
import time
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("NVIDIA_API_KEY")
URL = os.getenv("NVIDIA_TTS_URL")

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
    "Accept": "application/json",
}

# The Magpie TTS models in API catalog usually accept variations of:
payloads = [
    (
        "NVIDIA NVCF Standard format",
        {
            "text": "Hello world",
            "voice": "Magpie-Multilingual.EN-US.Aria",
            "model": "nvidia/tts",
            "config": {
                "format": "wav"
            }
        }
    ),
    (
        "Standard NVCF format (no model field)",
        {
            "text": "Hello world",
            "voice": "Magpie-Multilingual.EN-US.Aria"
        }
    ),
    (
        "ElevenLabs compatible format",
        {
            "text": "Hello world",
            "model_id": "nvidia-tts",
        }
    ),
    (
        "Empty payload",
        {}
    )
]

def test_all():
    print(f"Testing URL: {URL}")
    for name, payload in payloads:
        # Avoid 429
        time.sleep(1.5)
        
        try:
            print(f"Testing: {name}")
            resp = requests.post(URL, json=payload, headers=headers, timeout=10)
            
            if resp.status_code == 200:
                print(f"✅ SUCCESS! Payload: {name}")
                with open("nvidia_payload_result.json", "w") as f:
                    json.dump({
                        "working_payload": payload,
                        "working_voice": payload.get("voice"),
                        "status_code": 200
                    }, f, indent=2)
                return
            else:
                print(f"❌ {resp.status_code} | {name} -> {resp.text[:100]}...")
                
        except Exception as e:
            print(f"❌ Exception | {name} -> {e}")

if __name__ == "__main__":
    test_all()
