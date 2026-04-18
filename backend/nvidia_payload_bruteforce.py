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

voices = [
    "Magpie-Multilingual.EN-US.Aria",
    "Magpie-Multilingual.EN-US.Leo",
    "Aria",
    "Leo",
    "English-US.Female.Amber",
    None # Test without voice param
]

formats = ["wav", "mp3", "flac", None]

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
    
    # Variant E
    p = {"input": {"text": text}}
    if voice: p["voice"] = {"name": voice}
    if fmt: p["format"] = fmt
    payloads.append(("Variant E (input.text + voice.name)", p))
    
    return payloads

def test_all():
    print(f"Testing URL: {URL}")
    for voice in voices:
        for fmt in formats:
            payloads = list(generate_payloads("Hello test", voice, fmt))
            
            for name, payload in payloads:
                print(f"Testing: {name} | voice={voice} | format={fmt}")
                # print(f"Payload: {payload}")
                try:
                    resp = requests.post(URL, json=payload, headers=headers, timeout=10)
                    print(f"  -> Status: {resp.status_code}")
                    if resp.status_code == 200:
                        print("  -> SUCCESS!")
                        
                        working_payload = payload
                        
                        print("\n================ FINAL RESULT ================\n")
                        print(json.dumps({
                            "working_payload": working_payload,
                            "working_voice": voice,
                            "working_format": fmt,
                            "status_code": 200
                        }, indent=2))
                        print("\n==============================================\n")
                        return
                    else:
                        print(f"  -> Error: {resp.text[:150]}")
                except Exception as e:
                    print(f"  -> Exception: {e}")

if __name__ == "__main__":
    test_all()
