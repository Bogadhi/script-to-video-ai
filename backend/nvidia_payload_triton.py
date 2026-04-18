import os
import requests
import time
from dotenv import load_dotenv

load_dotenv()

url = os.getenv("NVIDIA_TTS_URL")
headers = {
    "Authorization": f"Bearer {os.getenv('NVIDIA_API_KEY')}",
    "Content-Type": "application/json",
    "Accept": "application/json"
}

payloads = [
    # 1. Raw Triton Inference Server Schema
    {
        "inputs": [
            {
                "name": "text",
                "datatype": "BYTES",
                "shape": [1],
                "data": ["Hello"]
            }
        ]
    },
    
    # 2. Riva REST / SynthesizeSpeechRequest
    {
        "text": "Hello",
        "language_code": "en-US",
        "voice_name": "Magpie-Multilingual.EN-US.Aria",
    },
    
    # 3. Kserve / v2 Inference
    {
        "instances": [
             {"text": "Hello"}
        ]
    },
    
    # 4. Another OpenAI variant
    {
        "model": "nvidia/tts",
        "messages": [{"role": "user", "content": "Hello"}],
    }
]

for p in payloads:
    time.sleep(1.5)
    print(f"Testing: {str(p)[:80]}...")
    try:
        r = requests.post(url, json=p, headers=headers)
        if r.status_code == 200:
            print("  SUCCESS!")
        else:
            print(f"  {r.status_code} {r.text[:80]}")
    except Exception as e:
        print(f"  Exception: {e}")
