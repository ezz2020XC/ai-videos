import json
import os
import runpy
import urllib.request
from pathlib import Path

# GitHub Actions replaces this string with the claimed Supabase job before
# pushing this private kernel to Kaggle.
EMBEDDED_JOB_JSON = "__AI_VIDEO_FACTORY_JOB_JSON__"

if EMBEDDED_JOB_JSON.startswith("__AI_VIDEO_FACTORY_"):
    raise RuntimeError("Job payload was not embedded by the orchestrator")

work = Path("/kaggle/working")
work.mkdir(parents=True, exist_ok=True)
(work / "job.json").write_text(EMBEDDED_JOB_JSON, encoding="utf-8")

# Keep the large worker implementation in GitHub so each run only injects the
# non-secret project payload. Kaggle internet is enabled for this private job.
worker_url = "https://raw.githubusercontent.com/ezz2020XC/ai-videos/main/kaggle_worker/run_job.py"
source = urllib.request.urlopen(worker_url, timeout=60).read().decode("utf-8")
source = source.replace(
    'WORK = Path("/kaggle/working/ai_video_factory")',
    'WORK = Path("/tmp/ai_video_factory")',
)
worker_path = work / "run_job.py"
worker_path.write_text(source, encoding="utf-8")

os.chdir(work)
runpy.run_path(str(worker_path), run_name="__main__")
