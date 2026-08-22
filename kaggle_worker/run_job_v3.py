import gc
import importlib.util
import json
import sys
import urllib.request
from pathlib import Path

V2_URL = "https://raw.githubusercontent.com/ezz2020XC/ai-videos/main/kaggle_worker/run_job_v2.py"
V2_PATH = Path("/kaggle/working/run_job_v2_base.py")
source = urllib.request.urlopen(V2_URL, timeout=60).read().decode("utf-8")
source = source.replace(
    "WORK = base.WORK",
    'base.WORK = Path("/tmp/ai_video_factory")\nbase.WORK.mkdir(parents=True, exist_ok=True)\nWORK = base.WORK',
    1,
)
source = source.replace(
    "def progress(stage, percent, message):",
    "_base_progress = base.progress\n\ndef progress(stage, percent, message):",
    1,
)
source = source.replace(
    "    base.progress(stage, percent, message)\n",
    "    _base_progress(stage, percent, message)\n",
    1,
)
V2_PATH.write_text(source, encoding="utf-8")

spec = importlib.util.spec_from_file_location("ai_video_factory_v2", V2_PATH)
v2 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v2)

PROJECT = v2.PROJECT


def preset():
    value = str(PROJECT.get("generation_preset") or "balanced")
    return value if value in {"fast_preview", "balanced", "full_quality"} else "balanced"


def coverage():
    value = str(PROJECT.get("animation_coverage") or "balanced")
    return value if value in {"minimal", "balanced", "full"} else "balanced"


def selected_indices(scene_count):
    if scene_count <= 0:
        return set()
    if coverage() == "full":
        return set(range(scene_count))
    if coverage() == "minimal":
        return {0} if scene_count == 1 else {0, scene_count - 1}

    picks = {0, scene_count // 2, scene_count - 1}
    if v2.mode() in {"talking_characters", "character_story"} and scene_count >= 5:
        picks.add(1)
    if preset() == "fast_preview" and coverage() != "full":
        picks = {0, scene_count - 1} if scene_count > 1 else {0}
    return picks


def should_ai_animate(scene_index, scene_count):
    if v2.engine() == "motion":
        return False
    return scene_index in selected_indices(scene_count)


_original_create_plan = v2.create_plan


def create_plan():
    plan = _original_create_plan()
    if preset() == "fast_preview" and isinstance(plan.get("scenes"), list) and len(plan["scenes"]) > 4:
        plan["scenes"] = plan["scenes"][:4]
        for idx, scene in enumerate(plan["scenes"], 1):
            scene["scene"] = idx
    return plan


def animate_with_wan(pipe, image_path, prompt, output_path, kind, seed):
    from diffusers.utils import export_to_video
    import torch
    from PIL import Image

    if kind == "vertical":
        width, height = 448, 768
    else:
        width, height = 768, 448

    if preset() == "fast_preview":
        num_frames, steps, fps = 33, 8, 8
    elif preset() == "full_quality":
        num_frames, steps, fps = 65, 18, 10
    else:
        num_frames, steps, fps = 49, 12, 8

    image = Image.open(image_path).convert("RGB")
    video, mask = v2.wan_inputs(image, width, height, num_frames)
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
        guidance_scale=4.2,
        generator=torch.Generator(device="cpu").manual_seed(seed),
        callback_on_step_end=v2.cancel_callback(flag),
    ).frames[0]
    if flag["stop"]:
        raise v2.UserStop(flag["delete"], "Stopped during Wan AI animation")
    export_to_video(output, str(output_path), fps=fps)


def animate_with_cogvideo(pipe, image_path, prompt, output_path, seed):
    from diffusers.utils import export_to_video
    import torch
    from PIL import Image

    image = Image.open(image_path).convert("RGB").resize((720, 480), Image.Resampling.LANCZOS)
    if preset() == "fast_preview":
        steps, frames = 12, 33
    elif preset() == "full_quality":
        steps, frames = 26, 49
    else:
        steps, frames = 18, 49

    flag = {"stop": False, "delete": False}
    try:
        pipe._interrupt = False
    except Exception:
        pass
    result = pipe(
        prompt=prompt,
        image=image,
        num_videos_per_prompt=1,
        num_inference_steps=steps,
        num_frames=frames,
        guidance_scale=5.5,
        generator=torch.Generator(device="cpu").manual_seed(seed),
        callback_on_step_end=v2.cancel_callback(flag),
    ).frames[0]
    if flag["stop"]:
        raise v2.UserStop(flag["delete"], "Stopped during CogVideoX AI animation")
    export_to_video(result, str(output_path), fps=8)


v2.should_ai_animate = should_ai_animate
v2.create_plan = create_plan
v2.animate_with_wan = animate_with_wan
v2.animate_with_cogvideo = animate_with_cogvideo

if preset() == "fast_preview":
    PROJECT["quality"] = "Fast Draft"


def annotate_result():
    path = Path("/kaggle/working/result.json")
    if not path.exists():
        return
    result = json.loads(path.read_text(encoding="utf-8"))
    metadata = result.setdefault("metadata", {})
    metadata.update({
        "generator": "AI Video Factory Kaggle v3",
        "generation_preset": preset(),
        "animation_coverage": coverage(),
        "selected_ai_scene_indices": sorted(i + 1 for i in selected_indices(len((result.get("plan") or {}).get("scenes") or []))),
        "speed_optimized": True,
    })
    path.write_text(json.dumps(result, indent=2), encoding="utf-8")


if __name__ == "__main__":
    try:
        v2.main()
        annotate_result()
    except v2.UserStop as stop:
        print("USER STOP:", stop.reason, flush=True)
        v2.write_cancel_result(stop)
    except Exception as exc:
        print("FATAL:", repr(exc), file=sys.stderr, flush=True)
        try:
            state = v2.control_state(force=True)
            if state.get("cancel_requested") or state.get("delete_requested"):
                v2.write_cancel_result(v2.UserStop(state.get("delete_requested"), "Stopped by user"))
            else:
                v2.base.progress("render", 90, f"Generation failed: {exc}")
                raise
        except v2.UserStop as stop:
            v2.write_cancel_result(stop)
    finally:
        gc.collect()
