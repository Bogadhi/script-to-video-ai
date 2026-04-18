import os
import requests
import json
import time
from dotenv import load_dotenv

load_dotenv()

key = os.getenv("NVIDIA_API_KEY")
url = os.getenv("NVIDIA_TTS_URL")
headers = {
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json",
    "Accept": "application/json"
}

voices = [
    "Magpie-Multilingual.EN-US.Aria", 
    "Aria", 
    "English-US.Female.Amber",
    "en-US-AriaNeural"
]

formats = ["wav", "mp3", "flac"]

print("Testing Variant E Permutations...")

for idx_v, name_v in enumerate(voices):
    for idx_f, name_f in enumerate(formats):
        payload = {
            "input": {"text": "Hello test"},
            "voice": {"name": name_v},
            "format": name_f
        }
        
        # Avoid rate limits
        if idx_v > 0 or idx_f > 0:
            time.sleep(1.5)
            
        try:
            r = requests.post(url, json=payload, headers=headers, timeout=10)
            print(f"[{name_v}] + [{name_f}] -> Status: {r.status_code}")
            
            if r.status_code == 200:
                print("================ SUCCESS! ================")
                with open("working_payload_final.json", "w") as f:
                    json.dump({
                        "working_payload": payload,
                        "working_voice": name_v,
                        "working_format": name_f,
                        "status_code": 200
                    }, f, indent=2)
                import sys
                sys.exit(0)
            else:
                if "Internal Server Error" not in r.text:
                    print(f"  Response: {r.text[:100]}")
        except Exception as e:
            print(f"Exception: {e}")
