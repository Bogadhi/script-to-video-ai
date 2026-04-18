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

# The Riva gRPC wrapper expected format:
payloads = [
    (
        "Riva HTTP Payload (en-US)",
        {
            "text": "Hello, this is a speech synthesizer test.",
            "language_code": "en-US",
            "voice_name": "Magpie-Multilingual.EN-US.Aria",
            "encoding": "LINEAR_PCM",
            "sample_rate_hz": 22050
        }
    ),
    (
        "Riva HTTP Payload (en-US, no encoding)",
        {
            "text": "Hello, this is a speech synthesizer test.",
            "language_code": "en-US",
            "voice_name": "Magpie-Multilingual.EN-US.Aria"
        }
    ),
    (
        "Riva HTTP Payload (Female Neutral)",
        {
            "text": "Hello, this is a speech synthesizer test.",
            "language_code": "en-US",
            "voice_name": "Magpie-Multilingual.EN-US.Female.Neutral"
        }
    ),
    (
        "Minimal Riva",
        {
            "text": "Hello"
        }
    )
]

def test_all():
    print(f"Testing URL: {URL}")
    for name, payload in payloads:
        time.sleep(1.5)
        
        try:
            print(f"Testing: {name}")
            resp = requests.post(URL, json=payload, headers=headers, timeout=10)
            
            print(f"  -> {resp.status_code}")
            if resp.status_code == 200:
                print(f"✅ SUCCESS! Payload: {name}")
                with open("nvidia_payload_result.json", "w") as f:
                    json.dump({
                        "working_payload": payload,
                        "working_voice": payload.get("voice_name"),
                        "status_code": 200
                    }, f, indent=2)
                return
            else:
                print(f"❌ {resp.text[:150]}...")
                
        except Exception as e:
            print(f"❌ Exception | {name} -> {e}")

if __name__ == "__main__":
    test_all()
