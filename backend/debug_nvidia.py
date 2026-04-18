import os
import requests
import json
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("NVIDIA_API_KEY")
URL = os.getenv("NVIDIA_TTS_URL")

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
    "Accept": "application/json"
}

# Common Magpie voices to try
voices = [
    "Magpie-Multilingual.EN-US.Aria",
    "Magpie-Multilingual.EN-US.Leo",
    "Magpie-Multilingual.EN-US.Aria.Happy",
    "English-US.Female.Amber",
]

formats = ["wav", "mp3", "flac"]

print(f"Testing URL: {URL}")

for voice in voices:
    for fmt in formats:
        payload = {
            "input": "This is a test.",
            "voice": voice,
            "format": fmt
        }
        print(f"Testing voice={voice}, format={fmt}...", end=" ")
        try:
            resp = requests.post(URL, json=payload, headers=headers, timeout=10)
            print(f"Status: {resp.status_code}")
            if resp.status_code == 200:
                print(f"SUCCESS with {voice}/{fmt}!")
                # Just save the first success to verify
                with open(f"test_success_{fmt}.{fmt}", "wb") as f:
                    # check if it's JSON or binary
                    if "audio" in resp.headers.get("Content-Type", ""):
                        f.write(resp.content)
                    else:
                        data = resp.json()
                        import base64
                        f.write(base64.b64decode(data.get("audio") or data.get("audio_content") or ""))
                break
            elif resp.status_code == 500:
                print(f"Error Body: {resp.text[:100]}")
        except Exception as e:
            print(f"Exception: {e}")
    else:
        continue
    break
