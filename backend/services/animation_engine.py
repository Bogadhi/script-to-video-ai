"""
Animation Engine
================
Transforms list of static native image files into cinematic video sequences,
utilizing advanced FFmpeg complex filters adjusting dynamics based on emotion.
"""

import os
import random
import logging
import subprocess

logger = logging.getLogger(__name__)

def images_to_video(images: list, duration: float, emotion: str, out_path: str, scene_type: str = "build") -> bool:
    """
    Renders AI-generated static shots into a fluid, animated cinematic MP4 block.
    """
    if not images:
        logger.error("[animation] Refusing to render video without any images.")
        return False
        
    duration = max(duration, 2.0)
    
    # Calculate screen-time per image
    slice_duration = duration / len(images)
    
    # Dynamics Mapping
    zoom_speed = 0.001
    pan_shift = 15
    if emotion == "dramatic":
        zoom_speed = 0.0006  # slow ultra-zoom
        pan_shift = 5
    elif emotion == "energetic":
        zoom_speed = 0.003   # aggressive
        pan_shift = 35
    elif emotion == "mysterious":
        zoom_speed = 0.0012
        pan_shift = 10       # drifting

    # V3 Pacing Engine
    contrast_filter = ""
    if scene_type == "hook":
        zoom_speed *= 2.5
        slice_duration *= 0.7
        contrast_filter = ",eq=contrast=1.3:brightness=0.05"
    elif scene_type == "climax":
        zoom_speed *= 0.5
        slice_duration *= 1.2
    elif scene_type == "resolution":
        zoom_speed *= 0.3
        slice_duration *= 1.5

    # Generating the complex ffmpeg filter graph for stitching and animating consecutive images
    # NOTE: Since constructing a perfect multi-input FFmpeg zoompan/fade crossfade matrix 
    # dynamically for variable quantities of images is immensely complex through raw subprocess strings,
    # we first animate each image individually, then concat them.
    
    intermediate_clips = []
    success = True
    
    logger.info("[animation] Start render -> %s images, duration=%.2fs, emotion=%s, type=%s", len(images), duration, emotion, scene_type)

    for i, img in enumerate(images):
        tmp_out = f"{out_path}_clip_{i}.mp4"
        
        # Animate individual image slice
        motion = random.choice(["zoom_in", "zoom_out", "pan_left", "pan_right"])
        
        tf = int(slice_duration * 30)
        
        if motion == "zoom_in":
            # Sinusoidal deceleration zoom
            zoom_expr = f"1.0+({zoom_speed*100})*sin((on/{tf})*(PI/2))"
            x_expr = f"iw/2-(iw/zoom/2)+sin(on/15)*{pan_shift}"
        elif motion == "zoom_out":
            zoom_expr = f"1.2-({zoom_speed*100})*sin((on/{tf})*(PI/2))"
            x_expr = f"iw/2-(iw/zoom/2)+sin(on/15)*{pan_shift}"
        elif motion == "pan_left":
            zoom_expr = "1.08"
            x_expr = f"iw/2-(iw/zoom/2)-sin((on/{tf})*(PI/2))*{(pan_shift*10)}"
        else: # pan_right
            zoom_expr = "1.08"
            x_expr = f"iw/2-(iw/zoom/2)+sin((on/{tf})*(PI/2))*{(pan_shift*10)}"

        y_expr = f"ih/2-(ih/zoom/2)+cos(on/20)*{pan_shift}"
        
        # Scale & pad dynamically to avoid aspect ratio squashing prior to zoompan extraction
        kb_filter = (
            "scale=1920:1080:force_original_aspect_ratio=increase,"
            "crop=1920:1080,"
            "zoompan="
            f"z='if(lte(on,1),1.0,{zoom_expr})':"
            f"d={int(slice_duration * 30)}:"
            f"x='{x_expr}':"
            f"y='{y_expr}':"
            f"fps=30{contrast_filter}"
        )
        
        cmd = [
            "ffmpeg", "-y", "-loop", "1", "-i", img, 
            "-vf", kb_filter, 
            "-t", str(slice_duration),
            "-c:v", "libx264", "-preset", "fast", "-pix_fmt", "yuv420p",
            "-an", tmp_out
        ]
        
        try:
            logger.info("[animation] Rendering slice %d/%d", i + 1, len(images))
            res = subprocess.run(cmd, capture_output=True, timeout=120)
            if res.returncode == 0 and os.path.exists(tmp_out):
                intermediate_clips.append(tmp_out)
            else:
                logger.error(f"[animation] Error rendering slice {i}: {res.stderr.decode()}")
        except Exception as e:
            logger.error(f"[animation] Subprocess failed on slice {i}: {e}")
            
    # Concat the slices
    if intermediate_clips:
        concat_txt = f"{out_path}_concat.txt"
        with open(concat_txt, "w") as f:
            for clip in intermediate_clips:
                # Force windows paths to be ffmpeg compliant inside concat files
                f_path = clip.replace('\\', '/')
                f.write(f"file '{f_path}'\n")
                
        cmd_concat = [
            "ffmpeg", "-y", "-f", "concat", "-safe", "0", 
            "-i", concat_txt, 
            "-c:v", "copy", "-an", out_path
        ]
        logger.info("[animation] Concatenating %d intermediate clips", len(intermediate_clips))
        res = subprocess.run(cmd_concat, capture_output=True, timeout=180)
        
        if res.returncode != 0 or not os.path.exists(out_path):
            success = False
            logger.error(f"[animation] Concat failed: {res.stderr.decode()}")
            
        # Cleanup
        try:
            os.remove(concat_txt)
            for clip in intermediate_clips:
                os.remove(clip)
        except:
            pass
    else:
        success = False

    logger.info("[animation] Render %s -> %s", "success" if success else "failed", out_path)
    return success
