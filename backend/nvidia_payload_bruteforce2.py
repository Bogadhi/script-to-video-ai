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
    "NVCF-INPUT-ASSET-REFERENCES": "" # Sometimes required
}

voices = [
    "Magpie-Multilingual.EN-US.Aria",
    "Aria",
    None 
]

formats = ["wav", "mp3", None]

def generate_payloads(text, voice, fmt):
    payloads = []
    
    # Variant A
    p = {"input": text}
    if voice: p["voice"] = voice
    if fmt: p["format"] = fmt
    payloads.append(("Variant A (input)", p))
    
    # Variant B
    p = {"text": text}
    if voice: p["voice"] = voice
    if fmt: p["format"] = fmt
    payloads.append(("Variant B (text)", p))
    
    # Variant C
    p = {"input": {"text": text}}
    if voice: p["voice"] = voice
    if fmt: p["format"] = fmt
    payloads.append(("Variant C (input.text)", p))
    
    # Variant D is A or B
    return payloads

def test_all():
    print(f"Testing URL: {URL}")
    results = []
    for voice in voices:
        for fmt in formats:
            payloads = list(generate_payloads("Hello", voice, fmt))
            
            for name, payload in payloads:
                # Add delay to avoid 429
                time.sleep(1.5)
                
                try:
                    resp = requests.post(URL, json=payload, headers=headers, timeout=10)
                    
                    if resp.status_code == 200:
                        print(f"✅ SUCCESS! Payload: {name} | voice={voice} | format={fmt}")
                        with open("nvidia_payload_result.json", "w") as f:
                            json.dump({
                                "working_payload": payload,
                                "working_voice": voice,
                                "working_format": fmt,
                                "status_code": 200
                            }, f, indent=2)
                        return
                    else:
                        print(f"❌ {resp.status_code} | {name} | {voice} | {fmt} -> {resp.text[:50]}")
                        
                except Exception as e:
                    print(f"❌ Exception | {name} | {voice} | {fmt} -> {e}")

if __name__ == "__main__":
    test_all()
