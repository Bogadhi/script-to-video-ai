import os
import requests
import json
from dotenv import load_dotenv

load_dotenv()

key = os.getenv("NVIDIA_API_KEY")
url = os.getenv("NVIDIA_TTS_URL")
headers = {
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json",
    "Accept": "application/json"
}

payload = {
  "input": {
    "text": "Hello test"
  },
  "voice": {
    "name": "Magpie-Multilingual.EN-US.Aria"
  }
}

print("Testing Variant E...")
try:
    r = requests.post(url, json=payload, headers=headers)
    print(r.status_code)
    if r.status_code == 200:
        print("SUCCESS!")
        with open("working_payload.json", "w") as f:
            json.dump({
                "working_payload": payload,
                "working_voice": "Magpie-Multilingual.EN-US.Aria",
                "working_format": None,
                "status_code": 200
            }, f, indent=2)
    else:
        print(r.text[:150])
except Exception as e:
    print(e)
