import gc
import json
import math
import os
import re
import subprocess
import sys
import textwrap
import time
from pathlib import Path


def run(cmd, check=True, capture=False):
    print("$", " ".join(str(x) for x in cmd), flush=True)
    return subprocess.run(
        cmd,
        check=check,
        text=True,
        capture_output=capture,
    )


def install_runtime():
    # Kaggle already ships CUDA-enabled PyTorch. Install only the user-space
    # pieces needed by this project and keep the GPU environment intact.
    run(["apt-get", "update", "-qq"], check=False)
    run(["apt-get", "install", "-y", "-qq", "ffmpeg", "espeak-ng"], check=False)
    run([
        sys.executable,
        "-m",
        "pip",
        "install",
        "-q",
        "--upgrade",
        "transformers>=4.48.0",
        "accelerate>=1.2.0",
        "diffusers>=0.32.0",
        "sentencepiece",
        "safetensors",
        "soundfile",
        "kokoro>=0.9.4",
        "requests",
        "pillow",
    ])


install_runtime()

import numpy as np
import requests
import soundfile as sf
import torch
from PIL import Image, ImageDraw, ImageFilter

WORK = Path("/kaggle/working/ai_video_factory")
WORK.mkdir(parents=True, exist_ok=True)

PAYLOAD = json.loads(Path("/kaggle/input/job/job.json").read_text(encoding="utf-8")) if Path("/kaggle/input/job/job.json").exists() else json.loads(Path("job.json").read_text(encoding="utf-8"))
PROJECT = PAYLOAD["project"]
PROJECT_ID = PROJECT["id"]
WORKER_TOKEN = PROJECT["worker_token"]
SUPABASE_URL = PAYLOAD["supabase"]["url"].rstrip("/")
SUPABASE_PUBLISHABLE_KEY = PAYLOAD["supabase"]["publishable_key"]


def progress(stage, percent, message):
    print(f"[{percent:3d}%] {stage}: {message}", flush=True)
    try:
        response = requests.post(
            f"{SUPABASE_URL}/rest/v1/rpc/worker_progress",
            headers={
                "apikey": SUPABASE_PUBLISHABLE_KEY,
                "Content-Type": "application/json",
            },
            json={
                "p_project_id": PROJECT_ID,
                "p_worker_token": WORKER_TOKEN,
                "p_stage": stage,
                "p_progress": int(percent),
                "p_message": message,
            },
            timeout=20,
        )
        if not response.ok:
            print("Progress update failed:", response.status_code, response.text[:500])
    except Exception as exc:
        print("Progress update exception:", repr(exc))


def clean_json_text(text):
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.I)
    text = re.sub(r"\s*```$", "", text)
    first = text.find("{")
    last = text.rfind("}")
    if first >= 0 and last > first:
        text = text[first:last + 1]
    return text


def fallback_plan(idea, target_seconds, scene_count):
    base = idea.strip().rstrip("?.")
    scene_templates = [
        (
            f"Imagine {base}. It sounds impossible, but changing one assumption can transform everything we know about daily life.",
            f"cinematic opening establishing shot illustrating {base}, photorealistic documentary style, dramatic natural light, strong depth, no text, no letters, no words"
        ),
        (
            "First, the immediate physical effects would appear around us. Familiar routines, infrastructure and landscapes would start behaving in unfamiliar ways.",
            f"realistic close documentary scene showing the immediate physical consequences of {base}, people and environment reacting naturally, no text, no letters, no words"
        ),
        (
            "Then the consequences would spread through transport, energy, weather and communication. Systems designed for today's conditions would have to adapt quickly.",
            f"wide cinematic infrastructure scene showing systems adapting to {base}, transport energy weather communication, realistic, no text, no letters, no words"
        ),
        (
            "Nature would respond too. Temperature, water, wildlife and the shape of cities could all begin shifting in ways that are difficult to predict.",
            f"cinematic nature and city transformation caused by {base}, realistic environmental documentary photography, no text, no letters, no words"
        ),
        (
            "People would improvise. New technologies, new rules and completely new habits would emerge because survival is often a powerful engine for invention.",
            f"human adaptation and futuristic practical technology responding to {base}, grounded photorealistic documentary look, no text, no letters, no words"
        ),
        (
            "The strangest part is that after enough time, a world that seems extraordinary to us might feel completely normal to the people living inside it.",
            f"emotional cinematic final shot of a believable future shaped by {base}, contemplative atmosphere, photorealistic, no text, no letters, no words"
        ),
    ]
    scenes = []
    for i in range(scene_count):
        narration, visual = scene_templates[i % len(scene_templates)]
        scenes.append({
            "scene": i + 1,
            "narration": narration,
            "visual_prompt": visual,
            "motion_type": "animated_image",
        })
    return {
        "title": f"What If {idea.strip().rstrip('?').title()}?",
        "hook": f"What would really happen if {base}?",
        "scenes": scenes,
    }


def create_plan():
    from transformers import AutoModelForCausalLM, AutoTokenizer

    idea = PROJECT["idea"]
    target_seconds = max(30, int(PROJECT.get("requested_duration") or 30))
    style = PROJECT.get("style") or "Cinematic Documentary"
    scene_count = 6 if target_seconds <= 60 else 8
    target_words = max(95, round(target_seconds * 2.25))
    words_per_scene = max(18, round(target_words / scene_count))

    prompt = f"""
You are the AI Director for a faceless short-form video generator.
Create a compelling {style} video about this idea:
{idea}

Target duration: {target_seconds} seconds.
Target narration length: about {target_words} words total.
Use exactly {scene_count} scenes, about {words_per_scene} narration words per scene.

Requirements:
- Begin with a very strong curiosity hook.
- Make the narration coherent from scene to scene.
- Keep claims framed as hypothetical when the idea is hypothetical.
- Every visual prompt must describe ONLY the image. Never request text, captions, letters, logos or typography inside the generated image.
- Favor photorealistic cinematic documentary visuals.
- motion_type must be one of: animated_image, parallax, map_motion, document_motion.
- Do not use markdown.

Return ONLY valid JSON in exactly this structure:
{{
  "title": "...",
  "hook": "...",
  "scenes": [
    {{
      "scene": 1,
      "narration": "...",
      "visual_prompt": "...",
      "motion_type": "animated_image"
    }}
  ]
}}
""".strip()

    progress("ai_director", 7, "Loading Qwen director")
    model_id = "Qwen/Qwen2.5-1.5B-Instruct"
    tokenizer = AutoTokenizer.from_pretrained(model_id)
    model = AutoModelForCausalLM.from_pretrained(
        model_id,
        torch_dtype=torch.float16,
        low_cpu_mem_usage=True,
    ).to("cuda:0")

    messages = [
        {"role": "system", "content": "Return strict JSON only."},
        {"role": "user", "content": prompt},
    ]
    formatted = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    inputs = tokenizer(formatted, return_tensors="pt").to("cuda:0")
    with torch.inference_mode():
        output = model.generate(
            **inputs,
            max_new_tokens=1800,
            do_sample=True,
            temperature=0.65,
            top_p=0.9,
            repetition_penalty=1.05,
        )
    generated = output[0][inputs.input_ids.shape[1]:]
    text = tokenizer.decode(generated, skip_special_tokens=True)

    try:
        plan = json.loads(clean_json_text(text))
        if not isinstance(plan.get("scenes"), list) or len(plan["scenes"]) < 4:
            raise ValueError("Director returned too few scenes")
        plan["scenes"] = plan["scenes"][:scene_count]
    except Exception as exc:
        print("Qwen JSON parse failed; using deterministic fallback:", exc)
        print(text[:3000])
        plan = fallback_plan(idea, target_seconds, scene_count)

    for idx, scene in enumerate(plan["scenes"], 1):
        scene["scene"] = idx
        scene["narration"] = str(scene.get("narration") or "").strip()
        visual = str(scene.get("visual_prompt") or idea).strip()
        visual = re.sub(r"(?i)(text|caption|subtitle|typography|letters?|words?|logo)\s*[:=-]?\s*[^,.;]*", "", visual)
        scene["visual_prompt"] = (
            visual.rstrip(" ,.;")
            + ", photorealistic cinematic documentary image, natural detail, no text, no letters, no words, no captions, no typography"
        )
        if scene.get("motion_type") not in {"animated_image", "parallax", "map_motion", "document_motion"}:
            scene["motion_type"] = "animated_image"

    progress("ai_director", 16, f"Director created {len(plan['scenes'])} scenes")

    del model, tokenizer, inputs, output
    gc.collect()
    torch.cuda.empty_cache()
    return plan


def voice_name(label):
    return {
        "US Male": "am_michael",
        "US Female": "af_heart",
        "British Male": "bm_george",
        "British Female": "bf_emma",
    }.get(label, "am_michael")


def generate_voice(plan):
    progress("voice", 20, "Generating narration with Kokoro")
    voice_dir = WORK / "voice"
    voice_dir.mkdir(exist_ok=True)
    voice = voice_name(PROJECT.get("voice"))
    durations = []

    try:
        from kokoro import KPipeline
        pipeline = KPipeline(lang_code="a")
        for idx, scene in enumerate(plan["scenes"], 1):
            audio_parts = []
            for _, _, audio in pipeline(scene["narration"], voice=voice, speed=1.05):
                audio_parts.append(np.asarray(audio, dtype=np.float32))
            if not audio_parts:
                raise RuntimeError("Kokoro returned no audio")
            audio = np.concatenate(audio_parts)
            path = voice_dir / f"scene_{idx:02d}.wav"
            sf.write(path, audio, 24000)
            durations.append(float(len(audio) / 24000.0))
    except Exception as exc:
        print("Kokoro failed; falling back to espeak-ng:", repr(exc))
        durations = []
        for idx, scene in enumerate(plan["scenes"], 1):
            raw = voice_dir / f"scene_{idx:02d}_raw.wav"
            path = voice_dir / f"scene_{idx:02d}.wav"
            run(["espeak-ng", "-s", "165", "-w", str(raw), scene["narration"]])
            run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(raw), "-ar", "24000", "-ac", "1", str(path)])
            info = sf.info(path)
            durations.append(float(info.duration))

    target = max(30.0, float(PROJECT.get("requested_duration") or 30))
    minimum_scene = 3.8
    raw_total = sum(max(d, minimum_scene) for d in durations)

    # Guarantee the requested runtime. If the spoken narration is shorter,
    # distribute breathing room across scenes instead of time-stretching voices.
    if raw_total < target:
        extra = (target - raw_total) / len(durations)
        scene_durations = [max(d, minimum_scene) + extra for d in durations]
    else:
        scene_durations = [max(d + 0.35, minimum_scene) for d in durations]

    for scene, audio_dur, scene_dur in zip(plan["scenes"], durations, scene_durations):
        scene["audio_duration"] = round(audio_dur, 3)
        scene["duration"] = round(scene_dur, 3)

    progress("voice", 30, f"Voice complete; final timeline {sum(scene_durations):.1f}s")
    return scene_durations


def make_fallback_image(prompt, width, height, index):
    # This is only used if the image model fails to load. It guarantees the
    # pipeline returns a playable video rather than losing the whole job.
    img = Image.new("RGB", (width, height), (9 + index * 4, 17 + index * 3, 31 + index * 5))
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    cx, cy = width // 2, height // 2
    for r in range(min(width, height) // 2, 20, -28):
        alpha = max(2, int(40 * r / max(width, height)))
        draw.ellipse((cx-r, cy-r, cx+r, cy+r), outline=(80, 120, 200, alpha), width=3)
    return Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB").filter(ImageFilter.GaussianBlur(radius=0.3))


def generate_storyboards(plan, need_vertical, need_landscape):
    progress("storyboard", 34, "Loading SDXL Turbo storyboard model")
    image_dir = WORK / "images"
    image_dir.mkdir(exist_ok=True)

    pipe = None
    try:
        from diffusers import AutoPipelineForText2Image
        pipe = AutoPipelineForText2Image.from_pretrained(
            "stabilityai/sdxl-turbo",
            torch_dtype=torch.float16,
            variant="fp16",
        ).to("cuda:0")
        pipe.set_progress_bar_config(disable=True)
    except Exception as exc:
        print("SDXL Turbo load failed; visual fallback enabled:", repr(exc))
        pipe = None

    steps = 2 if PROJECT.get("quality") == "Fast Draft" else 4
    total_images = len(plan["scenes"]) * ((1 if need_vertical else 0) + (1 if need_landscape else 0))
    done = 0

    for idx, scene in enumerate(plan["scenes"], 1):
        prompt = scene["visual_prompt"]
        if need_vertical:
            path = image_dir / f"scene_{idx:02d}_vertical.png"
            if pipe:
                try:
                    img = pipe(
                        prompt + ", portrait vertical 9:16 composition, centered safe subject",
                        num_inference_steps=steps,
                        guidance_scale=0.0,
                        height=896,
                        width=512,
                    ).images[0]
                except Exception as exc:
                    print("Vertical generation failed:", repr(exc))
                    img = make_fallback_image(prompt, 512, 896, idx)
            else:
                img = make_fallback_image(prompt, 512, 896, idx)
            img.save(path)
            scene["vertical_image"] = str(path)
            done += 1
            progress("storyboard", 34 + int(16 * done / max(1, total_images)), f"Generated visual {done}/{total_images}")

        if need_landscape:
            path = image_dir / f"scene_{idx:02d}_landscape.png"
            if pipe:
                try:
                    img = pipe(
                        prompt + ", cinematic landscape 16:9 composition, centered safe subject",
                        num_inference_steps=steps,
                        guidance_scale=0.0,
                        height=512,
                        width=896,
                    ).images[0]
                except Exception as exc:
                    print("Landscape generation failed:", repr(exc))
                    img = make_fallback_image(prompt, 896, 512, idx)
            else:
                img = make_fallback_image(prompt, 896, 512, idx)
            img.save(path)
            scene["landscape_image"] = str(path)
            done += 1
            progress("storyboard", 34 + int(16 * done / max(1, total_images)), f"Generated visual {done}/{total_images}")

    if pipe is not None:
        del pipe
    gc.collect()
    torch.cuda.empty_cache()
    progress("storyboard", 52, "Storyboard complete")


def srt_time(seconds):
    ms = int(round(seconds * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def caption_chunks(text, max_words=7):
    words = text.split()
    return [" ".join(words[i:i + max_words]) for i in range(0, len(words), max_words)] or [""]


def write_srt(plan, path):
    rows = []
    counter = 1
    cursor = 0.0
    for scene in plan["scenes"]:
        duration = float(scene["duration"])
        chunks = caption_chunks(scene["narration"])
        chunk_dur = duration / len(chunks)
        for i, chunk in enumerate(chunks):
            start = cursor + i * chunk_dur
            end = cursor + (i + 1) * chunk_dur
            rows.extend([
                str(counter),
                f"{srt_time(start)} --> {srt_time(end)}",
                chunk,
                "",
            ])
            counter += 1
        cursor += duration
    path.write_text("\n".join(rows), encoding="utf-8")


def render_scene(image_path, audio_path, output_path, duration, width, height, idx, motion_type):
    fps = 30
    # Different subtle motion directions keep the result from looking like
    # one repeated camera shake. The source image itself remains stable.
    if idx % 4 == 0:
        x = "iw/2-(iw/zoom/2)"
        y = "0"
    elif idx % 4 == 1:
        x = "0"
        y = "ih/2-(ih/zoom/2)"
    elif idx % 4 == 2:
        x = "iw-(iw/zoom)"
        y = "ih/2-(ih/zoom/2)"
    else:
        x = "iw/2-(iw/zoom/2)"
        y = "ih-(ih/zoom)"

    zoom_speed = "0.00032" if motion_type == "parallax" else "0.00022"
    vf = (
        f"scale={width}:{height}:force_original_aspect_ratio=increase,"
        f"crop={width}:{height},"
        f"zoompan=z='min(zoom+{zoom_speed},1.055)':x='{x}':y='{y}':d=1:s={width}x{height}:fps={fps},"
        "format=yuv420p"
    )

    run([
        "ffmpeg", "-y", "-loglevel", "error",
        "-loop", "1", "-framerate", str(fps), "-i", str(image_path),
        "-i", str(audio_path),
        "-vf", vf,
        "-af", "apad",
        "-t", f"{duration:.3f}",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-c:a", "aac", "-b:a", "160k", "-ar", "48000",
        "-movflags", "+faststart",
        str(output_path),
    ])


def render_format(plan, kind, width, height, subtitle_font_size):
    clips_dir = WORK / f"clips_{kind}"
    clips_dir.mkdir(exist_ok=True)
    clip_paths = []

    for idx, scene in enumerate(plan["scenes"], 1):
        image_path = Path(scene[f"{kind}_image"])
        audio_path = WORK / "voice" / f"scene_{idx:02d}.wav"
        clip_path = clips_dir / f"scene_{idx:02d}.mp4"
        render_scene(
            image_path,
            audio_path,
            clip_path,
            float(scene["duration"]),
            width,
            height,
            idx,
            scene.get("motion_type", "animated_image"),
        )
        clip_paths.append(clip_path)
        progress("animation", 54 + int(14 * idx / len(plan["scenes"])), f"Animated {kind} scene {idx}/{len(plan['scenes'])}")

    concat_file = clips_dir / "concat.txt"
    concat_file.write_text("\n".join(f"file '{p.as_posix()}'" for p in clip_paths), encoding="utf-8")
    joined = WORK / f"joined_{kind}.mp4"
    run([
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "concat", "-safe", "0", "-i", str(concat_file),
        "-c", "copy", str(joined),
    ])

    subtitle_file = WORK / "captions.srt"
    if not subtitle_file.exists():
        write_srt(plan, subtitle_file)

    output = Path("/kaggle/working") / ("final_vertical.mp4" if kind == "vertical" else "final_landscape.mp4")
    force_style = (
        f"FontName=Arial,FontSize={subtitle_font_size},Bold=1,"
        "PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=3,Shadow=1,"
        "Alignment=2,MarginV=110"
    )
    vf = f"subtitles={subtitle_file.as_posix()}:force_style='{force_style}'"
    run([
        "ffmpeg", "-y", "-loglevel", "error",
        "-i", str(joined),
        "-vf", vf,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "19",
        "-c:a", "aac", "-b:a", "160k",
        "-movflags", "+faststart",
        str(output),
    ])
    return output


def main():
    started = time.time()
    if not torch.cuda.is_available():
        raise RuntimeError("Kaggle job started without a CUDA GPU")

    print("GPU count:", torch.cuda.device_count())
    for i in range(torch.cuda.device_count()):
        print(f"GPU {i}:", torch.cuda.get_device_name(i))

    platforms = PROJECT.get("platforms") or {}
    need_vertical = any(platforms.get(k) for k in ("reels", "tiktok", "shorts"))
    need_landscape = bool(platforms.get("youtube"))
    if not need_vertical and not need_landscape:
        need_vertical = True

    plan = create_plan()
    generate_voice(plan)
    generate_storyboards(plan, need_vertical, need_landscape)

    progress("animation", 54, "Building professional motion scenes")
    outputs = {}
    quality = PROJECT.get("quality") or "Full HD"

    if need_vertical:
        if quality == "Fast Draft":
            vertical = render_format(plan, "vertical", 720, 1280, 18)
        else:
            vertical = render_format(plan, "vertical", 1080, 1920, 22)
        outputs["vertical"] = vertical.name

    if need_landscape:
        if quality == "Fast Draft":
            landscape = render_format(plan, "landscape", 1280, 720, 20)
        else:
            landscape = render_format(plan, "landscape", 1920, 1080, 22)
        outputs["landscape"] = landscape.name

    progress("captions", 78, "Captions burned into final compositions")
    progress("render", 88, "Finalizing MP4 outputs")

    first_key = "vertical_image" if need_vertical else "landscape_image"
    thumbnail = Path("/kaggle/working/thumbnail.jpg")
    Image.open(plan["scenes"][0][first_key]).convert("RGB").save(thumbnail, quality=92)
    outputs["thumbnail"] = thumbnail.name

    script = " ".join(scene["narration"] for scene in plan["scenes"]).strip()
    metadata = {
        "generator": "AI Video Factory Kaggle v1",
        "director_model": "Qwen/Qwen2.5-1.5B-Instruct",
        "voice_engine": "Kokoro",
        "storyboard_model": "stabilityai/sdxl-turbo",
        "renderer": "FFmpeg",
        "gpu_count": torch.cuda.device_count(),
        "gpu_name": torch.cuda.get_device_name(0),
        "runtime_seconds": round(time.time() - started, 2),
        "requested_duration": PROJECT.get("requested_duration"),
        "timeline_duration": round(sum(float(s["duration"]) for s in plan["scenes"]), 2),
        "quality": quality,
    }

    result = {
        "project_id": PROJECT_ID,
        "project": PROJECT,
        "title": plan.get("title") or PROJECT["idea"],
        "script": script,
        "plan": plan,
        "outputs": outputs,
        "metadata": metadata,
    }
    Path("/kaggle/working/result.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    progress("approval", 98, "Render complete; uploading for review")
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("FATAL:", repr(exc), file=sys.stderr, flush=True)
        progress("render", 90, f"Generation failed: {exc}")
        raise
