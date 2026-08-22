import gc
import importlib.util
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

BASE_URL = "https://raw.githubusercontent.com/ezz2020XC/ai-videos/main/kaggle_worker/run_job.py"
BASE_PATH = Path("/kaggle/working/base_run_job.py")
urllib.request.urlretrieve(BASE_URL, BASE_PATH)

spec = importlib.util.spec_from_file_location("ai_video_factory_base", BASE_PATH)
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)

# Extra packages required by the true image-to-video providers.
base.run([
    sys.executable, "-m", "pip", "install", "-q", "--upgrade",
    "ftfy", "imageio", "imageio-ffmpeg"
])

import numpy as np
import requests
import soundfile as sf
import torch
from PIL import Image

PROJECT = base.PROJECT
PROJECT_ID = base.PROJECT_ID
WORKER_TOKEN = base.WORKER_TOKEN
SUPABASE_URL = base.SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY = base.SUPABASE_PUBLISHABLE_KEY
WORK = base.WORK


class UserStop(Exception):
    def __init__(self, delete_requested=False, reason="Generation stopped by user"):
        super().__init__(reason)
        self.delete_requested = bool(delete_requested)
        self.reason = reason


_last_control_poll = 0.0
_last_control_state = None


def control_state(force=False):
    global _last_control_poll, _last_control_state
    now = time.time()
    if not force and _last_control_state is not None and now - _last_control_poll < 1.5:
        return _last_control_state

    try:
        response = requests.post(
            f"{SUPABASE_URL}/rest/v1/rpc/worker_control_state",
            headers={
                "apikey": SUPABASE_PUBLISHABLE_KEY,
                "Content-Type": "application/json",
            },
            json={
                "p_project_id": PROJECT_ID,
                "p_worker_token": WORKER_TOKEN,
            },
            timeout=15,
        )
        if response.ok:
            state = response.json()
            _last_control_state = state if isinstance(state, dict) else {}
            _last_control_poll = now
            return _last_control_state
        print("Control poll failed:", response.status_code, response.text[:300])
    except Exception as exc:
        print("Control poll exception:", repr(exc))
    return _last_control_state or {}


def check_stop(label="checkpoint", force=False):
    state = control_state(force=force)
    if state.get("authorized") and (state.get("cancel_requested") or state.get("delete_requested")):
        raise UserStop(
            delete_requested=state.get("delete_requested"),
            reason=f"Stopped by user during {label}",
        )
    return state


def progress(stage, percent, message):
    check_stop(stage)
    base.progress(stage, percent, message)
    check_stop(stage, force=True)


# Every base helper that resolves the module-global progress function now gains
# cancellation checks without duplicating the stable storyboard/render code.
base.progress = progress


def mode():
    return str(PROJECT.get("generation_mode") or "faceless")


def engine():
    value = str(PROJECT.get("animation_engine") or "auto")
    if value not in {"auto", "motion", "wan_vace", "cogvideox"}:
        return "auto"
    return value


def voice_pool():
    return ["am_michael", "af_heart", "bm_george", "bf_emma"]


def make_character_fallback(idea, target_seconds, scene_count):
    base_text = idea.strip().rstrip("?.")
    chars = [
        {
            "name": "Pip",
            "description": "a charming anthropomorphic main character with a readable expressive face, friendly eyes, small arms and legs, consistent appearance",
        },
        {
            "name": "Milo",
            "description": "a contrasting anthropomorphic companion with a readable expressive face, friendly eyes, small arms and legs, consistent appearance",
        },
    ]
    scenes = []
    lines = [
        "Wait. Are we really doing this? Because this might be the strangest day of my life.",
        "You said strange. I say unforgettable. Come on, we already made it this far.",
        "Everyone is staring at us, and somehow that makes this feel even more real.",
        "Forget everyone else. This is our story, and we get to decide what happens next.",
        "Then let's make it official, even if the whole world thinks the idea is completely ridiculous.",
        "Ridiculous can still be beautiful. And honestly, this ending is only the beginning.",
    ]
    for idx in range(scene_count):
        speaker = chars[idx % 2]["name"]
        text = lines[idx % len(lines)]
        visual = (
            f"{base_text}, {chars[0]['description']}, {chars[1]['description']}, "
            "cinematic 3D animated film look, expressive faces, believable materials, clean composition, no text, no letters"
        )
        scenes.append({
            "scene": idx + 1,
            "speaker": speaker,
            "narration": text,
            "visual_prompt": visual,
            "animation_prompt": (
                f"The characters act out this moment from {base_text}. {speaker} is speaking, "
                "mouth visibly articulating words, expressive eyes and eyebrows, natural head motion, hand gestures, body motion, "
                "the other character reacts naturally, cinematic camera movement, lively scene, no text"
            ),
            "motion_type": "ai_video",
        })
    return {
        "title": idea.strip().rstrip("?").title(),
        "hook": lines[0],
        "characters": chars,
        "scenes": scenes,
    }


def create_character_plan():
    from transformers import AutoModelForCausalLM, AutoTokenizer, StoppingCriteria, StoppingCriteriaList

    idea = PROJECT["idea"]
    target_seconds = max(30, int(PROJECT.get("requested_duration") or 30))
    scene_count = 6 if target_seconds <= 60 else 8
    target_words = max(95, round(target_seconds * 2.15))
    generation_mode = mode()

    mode_instruction = (
        "The characters themselves must speak to each other. Make it feel like a viral animated short with dialogue, reactions, comedy/emotion and visible acting."
        if generation_mode == "talking_characters"
        else
        "Tell the story through recurring characters. Dialogue is encouraged, but short narrator lines are allowed when needed."
    )

    prompt = f"""
You direct viral short-form AI character videos.
Idea: {idea}
Target runtime: {target_seconds} seconds.
Use exactly {scene_count} scenes and about {target_words} spoken words total.
{mode_instruction}

The user wants visually alive content like anthropomorphic objects/foods/animals acting, speaking, reacting and doing surprising things.
If the idea contains objects such as a banana, cucumber, car, planet or animal, turn them into appealing expressive characters when appropriate.
Create 2-3 recurring characters and keep their visual descriptions EXACTLY consistent in every scene.
Each scene should have ONE primary speaker so voice generation can switch naturally.
Each animation_prompt must explicitly describe body movement, facial expression, mouth movement while speaking, reactions and camera motion.
No on-image text, subtitles, logos or typography.

Return ONLY JSON:
{{
  "title": "...",
  "hook": "...",
  "characters": [
    {{"name":"...","description":"exact reusable visual description"}}
  ],
  "scenes": [
    {{
      "scene": 1,
      "speaker": "character name or Narrator",
      "narration": "spoken dialogue only",
      "visual_prompt": "single keyframe image prompt with the exact recurring character descriptions",
      "animation_prompt": "what moves, who speaks, mouth and facial motion, gestures, reactions, camera movement",
      "motion_type": "ai_video"
    }}
  ]
}}
""".strip()

    progress("ai_director", 6, "Loading Qwen character director")
    model_id = "Qwen/Qwen2.5-1.5B-Instruct"
    tokenizer = AutoTokenizer.from_pretrained(model_id)
    model = AutoModelForCausalLM.from_pretrained(
        model_id,
        torch_dtype=torch.float16,
        low_cpu_mem_usage=True,
    ).to("cuda:0")

    class RemoteStopCriteria(StoppingCriteria):
        def __init__(self):
            self.last = 0.0

        def __call__(self, input_ids, scores, **kwargs):
            now = time.time()
            if now - self.last > 1.7:
                self.last = now
                state = control_state(force=True)
                if state.get("cancel_requested") or state.get("delete_requested"):
                    return True
            return False

    messages = [
        {"role": "system", "content": "Return valid JSON only. Keep recurring character identity consistent."},
        {"role": "user", "content": prompt},
    ]
    formatted = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    inputs = tokenizer(formatted, return_tensors="pt").to("cuda:0")
    with torch.inference_mode():
        output = model.generate(
            **inputs,
            max_new_tokens=2200,
            do_sample=True,
            temperature=0.72,
            top_p=0.92,
            repetition_penalty=1.06,
            stopping_criteria=StoppingCriteriaList([RemoteStopCriteria()]),
        )
    check_stop("AI Director", force=True)
    generated = output[0][inputs.input_ids.shape[1]:]
    text = tokenizer.decode(generated, skip_special_tokens=True)

    try:
        plan = json.loads(base.clean_json_text(text))
        if not isinstance(plan.get("scenes"), list) or len(plan["scenes"]) < 4:
            raise ValueError("Character director returned too few scenes")
        plan["scenes"] = plan["scenes"][:scene_count]
        if not isinstance(plan.get("characters"), list):
            plan["characters"] = []
    except Exception as exc:
        print("Character Qwen JSON parse failed; using fallback:", repr(exc))
        print(text[:2500])
        plan = make_character_fallback(idea, target_seconds, scene_count)

    character_map = {
        str(c.get("name", "")).strip(): str(c.get("description", "")).strip()
        for c in plan.get("characters", []) if c.get("name")
    }
    pool = voice_pool()
    voice_map = {name: pool[i % len(pool)] for i, name in enumerate(character_map)}

    for idx, scene in enumerate(plan["scenes"], 1):
        scene["scene"] = idx
        scene["speaker"] = str(scene.get("speaker") or "Narrator").strip()
        scene["narration"] = str(scene.get("narration") or "").strip()
        scene["voice"] = voice_map.get(scene["speaker"], base.voice_name(PROJECT.get("voice")))

        visual = str(scene.get("visual_prompt") or idea).strip()
        visual = re.sub(r"(?i)(text|caption|subtitle|typography|letters?|words?|logo)\s*[:=-]?\s*[^,.;]*", "", visual)
        scene["visual_prompt"] = (
            visual.rstrip(" ,.;")
            + ", cinematic animated-film quality, expressive readable faces, consistent character design, detailed materials, no text, no letters, no words, no captions"
        )
        animation = str(scene.get("animation_prompt") or "").strip()
        if not animation:
            animation = (
                f"{scene['speaker']} speaks naturally with visible mouth movement, expressive facial acting, head movement and gestures; "
                "other characters react; lively body motion; cinematic camera movement"
            )
        scene["animation_prompt"] = animation + ", no subtitles, no text, no logos"
        scene["motion_type"] = "ai_video"

    progress("ai_director", 16, f"Character director created {len(plan['scenes'])} scenes")
    del model, tokenizer, inputs, output
    gc.collect()
    torch.cuda.empty_cache()
    return plan


def create_plan():
    if mode() in {"character_story", "talking_characters"}:
        return create_character_plan()
    return base.create_plan()


def generate_voice(plan):
    progress("voice", 20, "Generating scene voices with Kokoro")
    voice_dir = WORK / "voice"
    voice_dir.mkdir(exist_ok=True)
    durations = []

    try:
        from kokoro import KPipeline
        pipeline = KPipeline(lang_code="a")
        for idx, scene in enumerate(plan["scenes"], 1):
            check_stop(f"voice scene {idx}")
            voice = scene.get("voice") or base.voice_name(PROJECT.get("voice"))
            audio_parts = []
            for _, _, audio in pipeline(scene["narration"], voice=voice, speed=1.05):
                audio_parts.append(np.asarray(audio, dtype=np.float32))
            if not audio_parts:
                raise RuntimeError("Kokoro returned no audio")
            audio = np.concatenate(audio_parts)
            path = voice_dir / f"scene_{idx:02d}.wav"
            sf.write(path, audio, 24000)
            durations.append(float(len(audio) / 24000.0))
            progress("voice", 20 + int(9 * idx / len(plan["scenes"])), f"Voice scene {idx}/{len(plan['scenes'])}")
    except UserStop:
        raise
    except Exception as exc:
        print("Kokoro failed; falling back to espeak-ng:", repr(exc))
        durations = []
        for idx, scene in enumerate(plan["scenes"], 1):
            check_stop(f"fallback voice scene {idx}")
            raw = voice_dir / f"scene_{idx:02d}_raw.wav"
            path = voice_dir / f"scene_{idx:02d}.wav"
            base.run(["espeak-ng", "-s", "165", "-w", str(raw), scene["narration"]])
            base.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(raw), "-ar", "24000", "-ac", "1", str(path)])
            durations.append(float(sf.info(path).duration))

    target = max(30.0, float(PROJECT.get("requested_duration") or 30))
    minimum_scene = 3.6
    raw_total = sum(max(d, minimum_scene) for d in durations)
    if raw_total < target:
        extra = (target - raw_total) / max(1, len(durations))
        scene_durations = [max(d, minimum_scene) + extra for d in durations]
    else:
        scene_durations = [max(d + 0.25, minimum_scene) for d in durations]

    for scene, audio_dur, scene_dur in zip(plan["scenes"], durations, scene_durations):
        scene["audio_duration"] = round(audio_dur, 3)
        scene["duration"] = round(scene_dur, 3)

    progress("voice", 30, f"Voice complete; timeline {sum(scene_durations):.1f}s")
    return scene_durations


def should_ai_animate(scene_index, scene_count):
    selected_engine = engine()
    if selected_engine == "motion":
        return False
    if selected_engine in {"wan_vace", "cogvideox"}:
        return True
    if mode() in {"character_story", "talking_characters"}:
        return True
    # Auto keeps faceless documentary mode efficient while still providing
    # genuine generated motion on several hero scenes.
    hero = {0, max(0, scene_count // 2), max(0, scene_count - 1)}
    return scene_index in hero


def resize_cover(image, width, height):
    img = image.convert("RGB")
    scale = max(width / img.width, height / img.height)
    nw = max(width, int(round(img.width * scale)))
    nh = max(height, int(round(img.height * scale)))
    img = img.resize((nw, nh), Image.Resampling.LANCZOS)
    left = (nw - width) // 2
    top = (nh - height) // 2
    return img.crop((left, top, left + width, top + height))


def wan_inputs(image, width, height, num_frames):
    first = resize_cover(image, width, height)
    gray = Image.new("RGB", (width, height), (128, 128, 128))
    black = Image.new("L", (width, height), 0)
    white = Image.new("L", (width, height), 255)
    video = [first] + [gray.copy() for _ in range(num_frames - 1)]
    mask = [black] + [white.copy() for _ in range(num_frames - 1)]
    return video, mask


def load_wan():
    from diffusers import AutoencoderKLWan, WanVACEPipeline
    from diffusers.schedulers.scheduling_unipc_multistep import UniPCMultistepScheduler

    model_id = "Wan-AI/Wan2.1-VACE-1.3B-diffusers"
    progress("animation", 55, "Loading Wan VACE 1.3B true AI animation")
    vae = AutoencoderKLWan.from_pretrained(model_id, subfolder="vae", torch_dtype=torch.float32)
    pipe = WanVACEPipeline.from_pretrained(
        model_id,
        vae=vae,
        torch_dtype=torch.float16,
        low_cpu_mem_usage=True,
    )
    pipe.scheduler = UniPCMultistepScheduler.from_config(pipe.scheduler.config, flow_shift=3.0)
    pipe.enable_model_cpu_offload()
    try:
        pipe.vae.enable_tiling()
        pipe.vae.enable_slicing()
    except Exception:
        pass
    return pipe


def load_cogvideo():
    from diffusers import CogVideoXImageToVideoPipeline
    progress("animation", 55, "Loading CogVideoX image-to-video fallback")
    pipe = CogVideoXImageToVideoPipeline.from_pretrained(
        "THUDM/CogVideoX-5b-I2V",
        torch_dtype=torch.float16,
        low_cpu_mem_usage=True,
    )
    pipe.enable_model_cpu_offload()
    pipe.vae.enable_tiling()
    pipe.vae.enable_slicing()
    return pipe


def cancel_callback(flag):
    def callback(pipe, step, timestep, callback_kwargs):
        if step % 2 == 0:
            state = control_state(force=True)
            if state.get("cancel_requested") or state.get("delete_requested"):
                flag["stop"] = True
                flag["delete"] = bool(state.get("delete_requested"))
                pipe._interrupt = True
        return callback_kwargs
    return callback


def animate_with_wan(pipe, image_path, prompt, output_path, kind, seed):
    from diffusers.utils import export_to_video

    if kind == "vertical":
        width, height = 480, 832
    else:
        width, height = 832, 480
    quality = PROJECT.get("quality") or "Full HD"
    num_frames = 49 if quality == "Fast Draft" else 65
    steps = 12 if quality == "Fast Draft" else 18
    fps = 8 if quality == "Fast Draft" else 10

    image = Image.open(image_path).convert("RGB")
    video, mask = wan_inputs(image, width, height, num_frames)
    flag = {"stop": False, "delete": False}
    pipe._interrupt = False
    negative = (
        "static image, frozen pose, motionless, subtitles, text, watermark, logo, deformed face, bad anatomy, "
        "extra limbs, flicker, jitter, low quality"
    )
    output = pipe(
        video=video,
        mask=mask,
        prompt=prompt,
        negative_prompt=negative,
        height=height,
        width=width,
        num_frames=num_frames,
        num_inference_steps=steps,
        guidance_scale=4.5,
        generator=torch.Generator(device="cpu").manual_seed(seed),
        callback_on_step_end=cancel_callback(flag),
    ).frames[0]
    if flag["stop"]:
        raise UserStop(flag["delete"], "Stopped during Wan AI animation")
    export_to_video(output, str(output_path), fps=fps)


def animate_with_cogvideo(pipe, image_path, prompt, output_path, seed):
    from diffusers.utils import export_to_video
    image = Image.open(image_path).convert("RGB").resize((720, 480), Image.Resampling.LANCZOS)
    flag = {"stop": False, "delete": False}
    try:
        pipe._interrupt = False
    except Exception:
        pass
    result = pipe(
        prompt=prompt,
        image=image,
        num_videos_per_prompt=1,
        num_inference_steps=18 if PROJECT.get("quality") == "Fast Draft" else 26,
        num_frames=49,
        guidance_scale=6,
        generator=torch.Generator(device="cpu").manual_seed(seed),
        callback_on_step_end=cancel_callback(flag),
    ).frames[0]
    if flag["stop"]:
        raise UserStop(flag["delete"], "Stopped during CogVideoX AI animation")
    export_to_video(result, str(output_path), fps=8)


def generate_ai_animation(plan, need_vertical, need_landscape):
    selected = [
        idx for idx in range(len(plan["scenes"]))
        if should_ai_animate(idx, len(plan["scenes"]))
    ]
    if not selected:
        progress("animation", 57, "Motion-only rendering selected")
        return {"provider": "motion", "clips": 0}

    preferred = engine()
    provider = "wan_vace" if preferred in {"auto", "wan_vace"} else "cogvideox"
    pipe = None
    load_error = None
    try:
        pipe = load_wan() if provider == "wan_vace" else load_cogvideo()
    except Exception as exc:
        load_error = exc
        print(f"Primary video provider {provider} failed to load:", repr(exc))
        gc.collect()
        torch.cuda.empty_cache()
        if provider == "wan_vace":
            try:
                provider = "cogvideox"
                pipe = load_cogvideo()
            except Exception as exc2:
                print("CogVideoX fallback also failed:", repr(exc2))
                pipe = None

    if pipe is None:
        progress("animation", 57, f"AI video provider unavailable; falling back to professional motion ({load_error})")
        return {"provider": "motion_fallback", "clips": 0}

    targets = []
    for idx in selected:
        if need_vertical:
            targets.append((idx, "vertical"))
        if need_landscape:
            targets.append((idx, "landscape"))

    animated = 0
    for target_index, (scene_idx, kind) in enumerate(targets, 1):
        check_stop(f"AI animation scene {scene_idx + 1}")
        scene = plan["scenes"][scene_idx]
        image_path = Path(scene[f"{kind}_image"])
        out = WORK / f"ai_scene_{scene_idx + 1:02d}_{kind}.mp4"
        prompt = str(scene.get("animation_prompt") or "").strip()
        if not prompt:
            prompt = (
                scene["visual_prompt"]
                + ", everything is alive and moving naturally, subject performs a clear action, expressive body motion, realistic environmental motion, smooth cinematic camera movement"
            )
        if mode() == "talking_characters":
            prompt += ", primary speaker visibly talks with continuous mouth articulation, expressive eyes and brows, natural head movement and gestures, listener reacts"

        try:
            if provider == "wan_vace":
                animate_with_wan(pipe, image_path, prompt, out, kind, seed=202600 + scene_idx * 17 + target_index)
            else:
                animate_with_cogvideo(pipe, image_path, prompt, out, seed=202600 + scene_idx * 17 + target_index)
            scene[f"{kind}_video"] = str(out)
            animated += 1
        except UserStop:
            raise
        except Exception as exc:
            print(f"AI animation failed for scene {scene_idx + 1} {kind}; keeping motion fallback:", repr(exc))
        progress(
            "animation",
            57 + int(15 * target_index / max(1, len(targets))),
            f"True AI animation {target_index}/{len(targets)}",
        )

    del pipe
    gc.collect()
    torch.cuda.empty_cache()
    return {"provider": provider, "clips": animated}


def render_ai_scene(video_path, audio_path, output_path, duration, width, height):
    # A generated clip is genuine temporal AI motion. Loop only when its source
    # duration is shorter than the scene narration, then crop/scale to final output.
    base.run([
        "ffmpeg", "-y", "-loglevel", "error",
        "-stream_loop", "-1", "-i", str(video_path),
        "-i", str(audio_path),
        "-vf",
        f"scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height},fps=30,format=yuv420p",
        "-af", "apad",
        "-t", f"{duration:.3f}",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-c:a", "aac", "-b:a", "160k", "-ar", "48000",
        "-movflags", "+faststart", str(output_path),
    ])


def render_format(plan, kind, width, height, subtitle_font_size):
    clips_dir = WORK / f"clips_{kind}"
    clips_dir.mkdir(exist_ok=True)
    clip_paths = []

    for idx, scene in enumerate(plan["scenes"], 1):
        check_stop(f"render scene {idx}")
        audio_path = WORK / "voice" / f"scene_{idx:02d}.wav"
        clip_path = clips_dir / f"scene_{idx:02d}.mp4"
        ai_video = scene.get(f"{kind}_video")
        if ai_video and Path(ai_video).exists():
            render_ai_scene(
                ai_video,
                audio_path,
                clip_path,
                float(scene["duration"]),
                width,
                height,
            )
        else:
            base.render_scene(
                Path(scene[f"{kind}_image"]),
                audio_path,
                clip_path,
                float(scene["duration"]),
                width,
                height,
                idx,
                scene.get("motion_type", "animated_image"),
            )
        clip_paths.append(clip_path)
        progress("render", 74 + int(10 * idx / len(plan["scenes"])), f"Composed {kind} scene {idx}/{len(plan['scenes'])}")

    concat_file = clips_dir / "concat.txt"
    concat_file.write_text("\n".join(f"file '{p.as_posix()}'" for p in clip_paths), encoding="utf-8")
    joined = WORK / f"joined_{kind}.mp4"
    base.run([
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "concat", "-safe", "0", "-i", str(concat_file),
        "-c", "copy", str(joined),
    ])

    subtitle_file = WORK / "captions.srt"
    if not subtitle_file.exists():
        base.write_srt(plan, subtitle_file)

    output = Path("/kaggle/working") / ("final_vertical.mp4" if kind == "vertical" else "final_landscape.mp4")
    force_style = (
        f"FontName=Arial,FontSize={subtitle_font_size},Bold=1,"
        "PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=3,Shadow=1,"
        "Alignment=2,MarginV=110"
    )
    vf = f"subtitles={subtitle_file.as_posix()}:force_style='{force_style}'"
    base.run([
        "ffmpeg", "-y", "-loglevel", "error",
        "-i", str(joined),
        "-vf", vf,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "19",
        "-c:a", "aac", "-b:a", "160k",
        "-movflags", "+faststart", str(output),
    ])
    return output


def write_cancel_result(stop):
    state = control_state(force=True)
    result = {
        "project_id": PROJECT_ID,
        "project": PROJECT,
        "cancelled": True,
        "delete_requested": bool(stop.delete_requested or state.get("delete_requested")),
        "cancel_reason": stop.reason,
        "outputs": {},
        "metadata": {
            "generator": "AI Video Factory Kaggle v2",
            "cancelled": True,
            "generation_mode": mode(),
            "animation_engine": engine(),
        },
    }
    Path("/kaggle/working/result.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))


def main():
    started = time.time()
    if not torch.cuda.is_available():
        raise RuntimeError("Kaggle job started without a CUDA GPU")

    print("GPU count:", torch.cuda.device_count())
    for i in range(torch.cuda.device_count()):
        print(f"GPU {i}:", torch.cuda.get_device_name(i))
    print("Generation mode:", mode())
    print("Animation engine:", engine())

    check_stop("startup", force=True)
    platforms = PROJECT.get("platforms") or {}
    need_vertical = any(platforms.get(k) for k in ("reels", "tiktok", "shorts"))
    need_landscape = bool(platforms.get("youtube"))
    if not need_vertical and not need_landscape:
        need_vertical = True

    plan = create_plan()
    generate_voice(plan)
    base.generate_storyboards(plan, need_vertical, need_landscape)
    animation = generate_ai_animation(plan, need_vertical, need_landscape)

    outputs = {}
    quality = PROJECT.get("quality") or "Full HD"
    progress("captions", 73, "Preparing captions and final compositions")

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

    progress("render", 89, "Final MP4 compositions complete")
    first_key = "vertical_image" if need_vertical else "landscape_image"
    thumbnail = Path("/kaggle/working/thumbnail.jpg")
    Image.open(plan["scenes"][0][first_key]).convert("RGB").save(thumbnail, quality=92)
    outputs["thumbnail"] = thumbnail.name

    script = " ".join(scene["narration"] for scene in plan["scenes"]).strip()
    metadata = {
        "generator": "AI Video Factory Kaggle v2",
        "director_model": "Qwen/Qwen2.5-1.5B-Instruct",
        "voice_engine": "Kokoro",
        "storyboard_model": "stabilityai/sdxl-turbo",
        "animation_provider": animation.get("provider"),
        "ai_animated_clips": animation.get("clips", 0),
        "generation_mode": mode(),
        "animation_engine_requested": engine(),
        "renderer": "FFmpeg",
        "gpu_count": torch.cuda.device_count(),
        "gpu_name": torch.cuda.get_device_name(0),
        "runtime_seconds": round(time.time() - started, 2),
        "requested_duration": PROJECT.get("requested_duration"),
        "timeline_duration_before_outro": round(sum(float(s["duration"]) for s in plan["scenes"]), 2),
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
    progress("approval", 98, "Render complete; handing video to review pipeline")
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    try:
        main()
    except UserStop as stop:
        print("USER STOP:", stop.reason, flush=True)
        write_cancel_result(stop)
    except Exception as exc:
        print("FATAL:", repr(exc), file=sys.stderr, flush=True)
        try:
            state = control_state(force=True)
            if state.get("cancel_requested") or state.get("delete_requested"):
                write_cancel_result(UserStop(state.get("delete_requested"), "Stopped by user"))
            else:
                base.progress("render", 90, f"Generation failed: {exc}")
                raise
        except UserStop as stop:
            write_cancel_result(stop)
