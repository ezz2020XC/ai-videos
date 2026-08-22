import json
import os
import shutil
import subprocess
from pathlib import Path

OUTPUT_DIR = Path(os.environ.get("KAGGLE_OUTPUT_DIR", "/tmp/kaggle-output"))


def run(cmd):
    print("$", " ".join(str(x) for x in cmd), flush=True)
    subprocess.run(cmd, check=True)


def probe_size(video: Path):
    result = subprocess.run(
        [
            "ffprobe", "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", str(video)
        ],
        check=True,
        text=True,
        capture_output=True,
    )
    width, height = result.stdout.strip().split("x")
    return int(width), int(height)


def esc(text: str) -> str:
    return (
        text.replace("\\", "\\\\")
        .replace(":", "\\:")
        .replace("'", "\\'")
        .replace("%", "\\%")
    )


def make_outro(width: int, height: int, seconds: float, text: str, title: str, style: str, path: Path):
    portrait = height > width
    main_size = max(34, int(width * (0.072 if portrait else 0.047)))
    sub_size = max(18, int(width * (0.031 if portrait else 0.022)))
    margin = int(height * 0.08)

    if style == "neon":
        background = "0x070b18"
        accent = "0x54d8ff"
    elif style == "warm":
        background = "0x15100c"
        accent = "0xffd08a"
    else:
        background = "0x090d13"
        accent = "0xffffff"

    fade = f"if(lt(t,0.45),t/0.45,if(gt(t,{max(0.5, seconds - 0.55):.3f}),({seconds:.3f}-t)/0.55,1))"
    filter_chain = (
        f"drawbox=x=0:y=0:w=iw:h=ih:color={background}:t=fill,"
        f"drawbox=x='iw*0.18':y='ih*0.44':w='iw*0.64':h=3:color={accent}@0.65:t=fill,"
        f"drawtext=text='{esc(text)}':fontcolor=white:fontsize={main_size}:font='Arial':"
        f"x=(w-text_w)/2:y=(h-text_h)/2-{margin}:alpha='{fade}',"
        f"drawtext=text='{esc(title[:90])}':fontcolor=white@0.62:fontsize={sub_size}:font='Arial':"
        f"x=(w-text_w)/2:y=(h-text_h)/2+{int(margin * 0.55)}:alpha='{fade}',"
        "fade=t=in:st=0:d=0.25,"
        f"fade=t=out:st={max(0, seconds - 0.35):.3f}:d=0.35,format=yuv420p"
    )

    run([
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "lavfi", "-i", f"color=c={background}:s={width}x{height}:r=30:d={seconds:.3f}",
        "-f", "lavfi", "-i", f"anullsrc=channel_layout=stereo:sample_rate=48000:d={seconds:.3f}",
        "-vf", filter_chain,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
        "-c:a", "aac", "-b:a", "160k",
        "-shortest", "-movflags", "+faststart", str(path),
    ])


def append_outro(video: Path, outro: Path):
    temp = video.with_name(video.stem + "_with_outro.mp4")
    run([
        "ffmpeg", "-y", "-loglevel", "error",
        "-i", str(video), "-i", str(outro),
        "-filter_complex",
        "[0:v]fps=30,format=yuv420p[v0];[1:v]fps=30,format=yuv420p[v1];"
        "[0:a]aresample=48000[a0];[1:a]aresample=48000[a1];"
        "[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]",
        "-map", "[v]", "-map", "[a]",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "19",
        "-c:a", "aac", "-b:a", "160k",
        "-movflags", "+faststart", str(temp),
    ])
    shutil.move(str(temp), str(video))


def main():
    result_path = OUTPUT_DIR / "result.json"
    if not result_path.exists():
        print("No result.json found; skipping outro.")
        return

    result = json.loads(result_path.read_text(encoding="utf-8"))
    project = result.get("project") or {}
    if project.get("outro_enabled", True) is False:
        print("Outro disabled for this project.")
        return

    seconds = max(1.0, min(8.0, float(project.get("outro_duration") or 2.5)))
    text = str(project.get("outro_text") or "Follow for more").strip() or "Follow for more"
    style = str(project.get("outro_style") or "minimal").lower()
    title = str(result.get("title") or project.get("idea") or "More stories coming next")

    videos = [p for p in [OUTPUT_DIR / "final_vertical.mp4", OUTPUT_DIR / "final_landscape.mp4"] if p.exists()]
    for video in videos:
        width, height = probe_size(video)
        outro = OUTPUT_DIR / f"outro_{width}x{height}.mp4"
        make_outro(width, height, seconds, text, title, style, outro)
        append_outro(video, outro)
        print(f"Appended {seconds:.1f}s {style} outro to {video.name}")

    metadata = result.setdefault("metadata", {})
    metadata["outro"] = {
        "enabled": True,
        "text": text,
        "duration": seconds,
        "style": style,
    }
    result_path.write_text(json.dumps(result, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
