import json
import os
import shutil
import subprocess
from pathlib import Path

OUTPUT_DIR = Path(os.environ.get("KAGGLE_OUTPUT_DIR", "/tmp/kaggle-output"))

MOODS = {
    "cinematic": (110.00, 164.81, 220.00),
    "mystery": (82.41, 123.47, 185.00),
    "uplifting": (130.81, 196.00, 261.63),
    "dark": (65.41, 98.00, 146.83),
    "science": (110.00, 220.00, 329.63),
}


def run(cmd):
    print("$", " ".join(str(x) for x in cmd), flush=True)
    subprocess.run(cmd, check=True)


def duration(path: Path) -> float:
    result = subprocess.run(
        [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", str(path)
        ],
        check=True,
        text=True,
        capture_output=True,
    )
    return float(result.stdout.strip())


def make_music_bed(seconds: float, mood: str, output: Path):
    f1, f2, f3 = MOODS.get(mood, MOODS["cinematic"])
    fade_out = max(0.0, seconds - 2.0)
    filters = (
        "[0:a]volume=0.16[a0];"
        "[1:a]volume=0.10[a1];"
        "[2:a]volume=0.07[a2];"
        "[3:a]lowpass=f=800,volume=0.018[n];"
        "[a0][a1][a2][n]amix=inputs=4:normalize=0,"
        "aecho=0.75:0.20:900:0.10,"
        f"afade=t=in:st=0:d=2,afade=t=out:st={fade_out:.3f}:d=2[m]"
    )
    run([
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "lavfi", "-i", f"sine=frequency={f1}:sample_rate=48000:duration={seconds:.3f}",
        "-f", "lavfi", "-i", f"sine=frequency={f2}:sample_rate=48000:duration={seconds:.3f}",
        "-f", "lavfi", "-i", f"sine=frequency={f3}:sample_rate=48000:duration={seconds:.3f}",
        "-f", "lavfi", "-i", f"anoisesrc=color=pink:sample_rate=48000:duration={seconds:.3f}",
        "-filter_complex", filters,
        "-map", "[m]", "-c:a", "pcm_s16le", str(output),
    ])


def mix_into_video(video: Path, music: Path, volume: float):
    temp = video.with_name(video.stem + "_music.mp4")
    run([
        "ffmpeg", "-y", "-loglevel", "error",
        "-i", str(video), "-i", str(music),
        "-filter_complex",
        f"[0:a]volume=1.0[voice];[1:a]volume={volume:.3f}[music];"
        "[voice][music]amix=inputs=2:duration=first:dropout_transition=2[aout]",
        "-map", "0:v:0", "-map", "[aout]",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart", str(temp),
    ])
    shutil.move(str(temp), str(video))


def main():
    result_path = OUTPUT_DIR / "result.json"
    if not result_path.exists():
        print("No result.json found; skipping music stage.")
        return

    result = json.loads(result_path.read_text(encoding="utf-8"))
    project = result.get("project") or {}
    if project.get("music_enabled", True) is False:
        print("Background music disabled for this project.")
        return

    mood = str(project.get("music_mood") or "cinematic").lower()
    volume = float(project.get("music_volume") or 0.14)
    volume = max(0.0, min(volume, 0.35))

    videos = [p for p in [OUTPUT_DIR / "final_vertical.mp4", OUTPUT_DIR / "final_landscape.mp4"] if p.exists()]
    if not videos:
        print("No generated MP4 files found; skipping music.")
        return

    longest = max(duration(video) for video in videos)
    music = OUTPUT_DIR / "background_music.wav"
    make_music_bed(longest, mood, music)

    for video in videos:
        mix_into_video(video, music, volume)
        print(f"Mixed {mood} background music into {video.name} at volume {volume:.3f}")

    metadata = result.setdefault("metadata", {})
    metadata["background_music"] = {
        "enabled": True,
        "mood": mood,
        "volume": volume,
        "engine": "procedural_ffmpeg",
    }
    result_path.write_text(json.dumps(result, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
