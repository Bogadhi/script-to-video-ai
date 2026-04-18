import os
import requests
import time
from dotenv import load_dotenv

load_dotenv()

url = os.getenv('NVIDIA_TTS_URL')
headers = {
    'Authorization': f"Bearer {os.getenv('NVIDIA_API_KEY')}",
    'Content-Type': 'application/json',
    'Accept': 'application/json'
}

payloads = [
    # 1. Riva format
    {"text": "hello", "languageCode": "en-US", "voiceName": "English-US.Female.Amber"},
    {"text": "hello"},
    # 2. OpenAI format
    {"input": "hello", "voice": "Magpie-Multilingual.EN-US.Aria", "model": "nvidia/tts"},
    # 3. Simple format
    {"text": "hello", "voice": "Aria"}
]

for p in payloads:
    print(f"Testing: {p}")
    time.sleep(2)
    try:
        r = requests.post(url, json=p, headers=headers)
        if r.status_code == 200:
            print("  SUCCESS!")
        else:
            print(f"  {r.status_code} {r.text[:100]}")
    except Exception as e:
        print(f"  {e}")
