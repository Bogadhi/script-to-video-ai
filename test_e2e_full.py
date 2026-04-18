import os
import sys
import time
import requests
import json
import subprocess
from PIL import Image

API_BASE = "http://localhost:8000/api"

def run_test():
    report = {
        "backend": "FAIL",
        "pipeline": "FAIL",
        "video_valid": False,
        "visual_valid": False,
        "audio_present": False,
        "thumbnail_valid": False,
        "metadata_valid": False,
        "issues_found": [],
        "fix_suggestions": []
    }
    
    try:
        # STEP 1: Backend check
        try:
            r = requests.get("http://localhost:8000/projects", timeout=5)
            # Actually, just ping something to ensure it's up
        except:
            report["issues_found"].append("FastAPI backend not reachable at :8000")
            return report
        
        report["backend"] = "PASS"

        # STEP 2: Create
        print("[*] Creating project...")
        script = "The majestic mountains stand tall. A river flows gently through the valley. The sky is crystal blue. Nature provides endless wonders."
        resp = requests.post(f"{API_BASE}/scripts/create", data={
            "script_text": script,
            "video_category": "travel",
            "voice_style": "documentary",
            "music_style": "cinematic"
        })
        if resp.status_code != 200:
            report["issues_found"].append(f"Create failed: {resp.text}")
            return report
        
        pid = resp.json().get("project_id")
        if not pid:
            report["issues_found"].append("No project_id returned")
            return report
        
        print(f"[*] Project created: {pid}")

        # STEP 3: Poll
        status_url = f"{API_BASE}/pipeline/{pid}/status"
        timeout = 300
        start_t = time.time()
        final_data = None
        
        while time.time() - start_t < timeout:
            sr = requests.get(status_url)
            st_data = sr.json()
            ov = st_data.get("overall_status")
            print(f"[*] Polling... status: {ov}")
            if ov == "complete":
                final_data = st_data
                break
            elif ov == "error":
                report["issues_found"].append(f"Pipeline error: {st_data.get('error')}")
                return report
            time.sleep(5)
            
        if not final_data:
            report["issues_found"].append("Pipeline timeout after 5 mins")
            return report
            
        report["pipeline"] = "PASS"
        
        # STEP 4: Artifacts
        print("[*] Checking artifacts...")
        a = final_data.get("artifacts", {})
        vid_url = a.get("final_video") or a.get("video")
        thumb_url = a.get("thumbnail")
        sub_url = a.get("subtitles")
        
        vid_path = os.path.join("projects", pid, "final.mp4")
        thumb_path = os.path.join("projects", pid, "thumbnail.jpg")
        sub_path = os.path.join("projects", pid, "subtitles.srt")
        
        if not os.path.isfile(vid_path) or os.path.getsize(vid_path) < 500_000:
            report["issues_found"].append(f"Video missing or < 500KB (size: {os.path.getsize(vid_path) if os.path.isfile(vid_path) else 'N/A'})")
        if not os.path.isfile(thumb_path) or os.path.getsize(thumb_path) < 5_000:
            report["issues_found"].append("Thumbnail missing or < 5KB")
        if not os.path.isfile(sub_path) or os.path.getsize(sub_path) < 1_000:
            report["issues_found"].append("Subtitles missing or < 1KB")
            
        # STEP 5: Video validation
        print("[*] Validating video (ffprobe)...")
        r = subprocess.run([
            "ffprobe", "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=codec_name,pix_fmt,duration,nb_frames",
            "-of", "json", vid_path
        ], capture_output=True, text=True)
        if r.returncode != 0:
            report["issues_found"].append("ffprobe on video failed")
        else:
            j = json.loads(r.stdout)
            st = j.get("streams", [{}])[0]
            if st.get("codec_name") != "h264": report["issues_found"].append("Codec not h264")
            if st.get("pix_fmt") != "yuv420p": report["issues_found"].append("Pix_fmt not yuv420p")
            try:
                dur = float(st.get("duration", 0))
                if dur < 5: report["issues_found"].append("Duration < 5s")
            except: pass
            
            if not any(x in report["issues_found"] for x in ["Codec not h264", "Duration < 5s"]):
                report["video_valid"] = True
                
        # STEP 6: Visual validation
        print("[*] Checking visuals (frames)...")
        tmp_dir = os.path.join("projects", pid, "frames")
        os.makedirs(tmp_dir, exist_ok=True)
        rf = subprocess.run([
            "ffmpeg", "-y", "-i", vid_path,
            "-vf", "select=eq(n\\,10)+eq(n\\,50)+eq(n\\,100)",
            "-vsync", "vfr", os.path.join(tmp_dir, "frame_%d.jpg")
        ], capture_output=True)
        
        frames = [f for f in os.listdir(tmp_dir) if f.endswith(".jpg")]
        if len(frames) == 0:
            report["issues_found"].append("Could not extract frames")
        else:
            solid_colors = 0
            for f in frames:
                im = Image.open(os.path.join(tmp_dir, f))
                extrema = im.convert("L").getextrema()
                if extrema[0] == extrema[1]: # Solid color
                    solid_colors += 1
            if solid_colors > 0:
                report["issues_found"].append(f"Visuals: {solid_colors} frames are solid colors")
            else:
                report["visual_valid"] = True

        # STEP 7: Audio
        print("[*] Checking audio...")
        ra = subprocess.run([
            "ffprobe", "-v", "error", "-select_streams", "a:0",
            "-show_entries", "stream=codec_type", "-of", "csv=p=0", vid_path
        ], capture_output=True, text=True)
        if "audio" in ra.stdout:
            report["audio_present"] = True
        else:
            report["issues_found"].append("No audio stream in final.mp4")

        # STEP 8: Thumbnail
        print("[*] Checking thumbnail...")
        if os.path.isfile(thumb_path):
            try:
                im = Image.open(thumb_path)
                w, h = im.size
                if w >= 640 and h >= 360:
                    report["thumbnail_valid"] = True
                else:
                    report["issues_found"].append(f"Thumbnail too small: {w}x{h}")
            except:
                report["issues_found"].append("Thumbnail invalid image")

        # STEP 9: Metadata
        print("[*] Checking metadata...")
        meta_path = os.path.join("projects", pid, "metadata", "youtube.json")
        if os.path.isfile(meta_path):
            with open(meta_path) as mf:
                m = json.load(mf)
                tit = m.get("title", "")
                tag = m.get("tags", [])
                if len(tit) > 60: report["issues_found"].append("Title > 60 chars")
                if not (8 <= len(tag) <= 20): report["issues_found"].append(f"Tags count {len(tag)} not in 8-20")
                if len(tit) <= 60 and (8 <= len(tag) <= 20):
                    report["metadata_valid"] = True

    except Exception as e:
        report["issues_found"].append(f"Test crash: {e}")
        
    print(json.dumps(report, indent=2))
    with open("qa_report.json", "w") as f:
        json.dump(report, f, indent=2)

if __name__ == "__main__":
    run_test()
