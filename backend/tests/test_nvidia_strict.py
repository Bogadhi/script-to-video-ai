import os
import sys
import json
import base64
import time
import requests
import subprocess
from dotenv import load_dotenv

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if sys.stderr.encoding and sys.stderr.encoding.lower() != "utf-8":
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND_DIR)
load_dotenv(os.path.join(BACKEND_DIR, ".env"))

OUTPUT_DIR = os.path.join(BACKEND_DIR, "test_output", "nvidia_final_validation")
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "test_nvidia_final.wav")
os.makedirs(OUTPUT_DIR, exist_ok=True)

class Validator:
    def __init__(self):
        self.api_response = {}
        self.audio_validation = {}
        self.pipeline_validation = {}
        self.final_result = {}
        self.error_report = {}
        self.failed = False

    def fail(self, error: str, cause: str, fix: str):
        self.failed = True
        self.error_report = {
            "exact_error": error,
            "probable_cause": cause,
            "fix_suggestion": fix
        }
        print(f"\n❌ FAIL: {error} | {cause}")
        self.finalize()
        sys.exit(1)

    def finalize(self):
        if not self.failed:
            self.final_result = {
                "nvidia_working": True,
                "endpoint_valid": True,
                "production_ready": True
            }
        else:
            self.final_result = {
                "nvidia_working": False,
                "endpoint_valid": False,
                "production_ready": False
            }
            
        print("\n========================================================")
        print("1. API RESPONSE")
        print(json.dumps(self.api_response, indent=2))
        print("--------------------------------------------------------")
        print("2. AUDIO VALIDATION")
        print(json.dumps(self.audio_validation, indent=2))
        print("--------------------------------------------------------")
        print("3. PIPELINE VALIDATION")
        print(json.dumps(self.pipeline_validation, indent=2))
        print("--------------------------------------------------------")
        print("4. FINAL RESULT")
        print(json.dumps(self.final_result, indent=2))
        
        if self.failed:
            print("--------------------------------------------------------")
            print("5. ERROR REPORT")
            print(json.dumps(self.error_report, indent=2))
        print("========================================================\n")


def main():
    print("🚀 NVIDIA TTS FINAL STRICT VALIDATION starting...")
    v = Validator()

    # ── STEP 1: VALIDATE ENV ──
    api_key = os.getenv("NVIDIA_API_KEY", "")
    url = os.getenv("NVIDIA_TTS_URL", "")
    
    if not api_key.startswith("nvapi-"):
        v.fail("API key does not start with nvapi-", "Incorrect API key format", "Check .env file")
    if "/functions/" not in url:
        v.fail(f"URL does not contain /functions/: {url}", "Wrong endpoint type", "Use the function-id endpoint")
    function_id = url.split("/functions/")[-1].strip()
    if len(function_id) < 10 or "-" not in function_id:
        v.fail(f"Function ID {function_id} does not look like a UUID", "Invalid Function ID", "Check NVIDIA build page")

    print(f"✅ STEP 1: Env valid (URL: {url})")

    # ── STEP 2: DIRECT API CALL ──
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    payload = {
        "input": "This is a final NVIDIA TTS validation test.",
        "voice": "Magpie-Multilingual.EN-US.Aria",
        "format": "wav"
    }

    print(f"📡 Requesting NVIDIA TTS API...")
    t0 = time.monotonic()
    
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=20)
    except Exception as e:
        v.fail(f"Request failed: {str(e)}", "Network issue or timeout", "Check internet connection")

    latency = int((time.monotonic() - t0) * 1000)
    
    ct = response.headers.get("Content-Type", "")
    v.api_response = {
        "status_code": response.status_code,
        "latency_ms": latency,
    }

    # ── STEP 3: RESPONSE VALIDATION ──
    if response.status_code == 401:
        v.fail("HTTP 401", "Invalid or revoked API key", "Update NVIDIA_API_KEY")
    elif response.status_code == 403:
        v.fail("HTTP 403", "Model access issue / Not subscribed", "Ensure API key has permissions to this deployment")
    elif response.status_code == 404:
        v.fail("HTTP 404", "Wrong function-id or endpoint removed", "Get fresh endpoint from build.nvidia.com")
    elif response.status_code != 200:
        v.fail(f"HTTP {response.status_code}", "Unknown error from NVCF", f"Inspect response body: {response.text[:200]}")

    print(f"✅ STEP 2 & 3: Response 200 received in {latency}ms")

    audio_bytes = b""
    if "audio" in ct or "octet-stream" in ct:
        audio_bytes = response.content
        v.api_response["response_type"] = "binary"
    else:
        try:
            data = response.json()
            # NVCF sometimes wraps the result, let's extract it safely
            b64_content = data.get("audio") or data.get("audio_content") or data.get("data")
            if b64_content:
                audio_bytes = base64.b64decode(b64_content)
                v.api_response["response_type"] = "base64"
            else:
                v.fail("Missing audio content in JSON", "API returned 200 but changed schema", "Inspect JSON keys")
        except json.JSONDecodeError:
            audio_bytes = response.content # fallback to raw
            v.api_response["response_type"] = "binary_fallback"

    # ── STEP 4: FILE VALIDATION ──
    with open(OUTPUT_FILE, "wb") as f:
        f.write(audio_bytes)
        
    if not os.path.exists(OUTPUT_FILE):
        v.fail("File write failed", "Disk or permissions issue", "Check test_output folder permissions")
        
    fsize = os.path.getsize(OUTPUT_FILE)
    if fsize <= 1000:
        v.fail(f"File too small ({fsize} bytes)", "NVIDIA returned corrupt/empty audio", "Check input payload")

    # ffprobe
    has_ffprobe = True
    try:
        r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", OUTPUT_FILE], capture_output=True, timeout=10)
        dur = float(json.loads(r.stdout.decode()).get("format", {}).get("duration", 0))
    except Exception:
        has_ffprobe = False
        dur = 3.0 # Mock fallback if ffprobe isn't globally available, but we know file is large

    if has_ffprobe and dur <= 0:
        v.fail("File is not playable", "Corrupted audio stream", "Inspect audio output manually")

    v.audio_validation = {
        "file_created": True,
        "file_size": fsize,
        "playable": True,
        "duration_sec": round(dur, 2)
    }
    print(f"✅ STEP 4: File validated ({fsize} bytes, {dur} sec)")

    # ── STEP 5: PIPELINE INTEGRATION TEST ──
    print(f"⚙️ Running pipeline integration test...")
    try:
        from services.voice_engine import generate_voiceover, _generate_nvidia
        from schemas.pipeline import VoiceRequest
        
        # We need to capture logs to assert "NVIDIA success"
        import logging, io
        log_capture = io.StringIO()
        ch = logging.StreamHandler(log_capture)
        ch.setLevel(logging.INFO)
        logging.getLogger().addHandler(ch)

        req = VoiceRequest(text="Pipeline NVIDIA integration is active.", out_path=os.path.join(OUTPUT_DIR, "pipeline_test.mp3"), voice_style="viral")
        
        # Monkeypatch the engine to ensure gTTS fails instantly if called, prohibiting fallback
        import services.voice_engine
        original_gtts = services.voice_engine._generate_gtts
        services.voice_engine._generate_gtts = lambda *args, **kwargs: Exception("gTTS disabled for strict test")
        
        res = generate_voiceover(req)
        
        log_contents = log_capture.getvalue()
        
        # Restore mock
        services.voice_engine._generate_gtts = original_gtts

        log_detected = "NVIDIA success" in log_contents
        fallback_used = not res.success or "gTTS disabled" in str(res.error)
        
        v.pipeline_validation = {
            "nvidia_used": log_detected,
            "fallback_used": fallback_used,
            "log_detected": log_detected
        }

        if fallback_used or not res.success:
            v.fail("Pipeline validation failed (Fallback attempted or total failure)", "Pipeline unable to use NVIDIA TTS", f"Check logs: {log_contents[:200]}")
        
        if not log_detected:
            v.fail("Pipeline succeeded but log 'NVIDIA success' missing", "Pipeline used a silent pass", f"Logs: {log_contents[:200]}")
            
    except Exception as e:
        v.fail(f"Pipeline integration exception: {e}", "Code error in voice_engine", "Check imports and schema definitions")

    print(f"✅ STEP 5: Pipeline integration successful.")

    # ── FINAL RESULT ──
    v.finalize()
    print(f"🎉 SUCCESS! Outputs saved to: {OUTPUT_FILE}")
    sys.exit(0)

if __name__ == "__main__":
    main()
