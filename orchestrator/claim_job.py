import json
import os
import sys
from pathlib import Path

import requests

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_SECRET_KEY = os.environ["SUPABASE_SECRET_KEY"]
SUPABASE_PUBLISHABLE_KEY = os.environ["SUPABASE_PUBLISHABLE_KEY"]

HEADERS = {
    "apikey": SUPABASE_SECRET_KEY,
    "Authorization": f"Bearer {SUPABASE_SECRET_KEY}",
    "Content-Type": "application/json",
}


def github_output(name: str, value: str) -> None:
    output = os.environ.get("GITHUB_OUTPUT")
    if output:
        with open(output, "a", encoding="utf-8") as fh:
            fh.write(f"{name}={value}\n")
    else:
        print(f"{name}={value}")


def main() -> int:
    response = requests.get(
        f"{SUPABASE_URL}/rest/v1/projects"
        "?status=eq.queued_gpu&select=*&order=created_at.asc&limit=1",
        headers=HEADERS,
        timeout=30,
    )
    response.raise_for_status()
    rows = response.json()

    if not rows:
        print("No queued Kaggle GPU jobs.")
        github_output("found", "false")
        return 0

    candidate = rows[0]
    project_id = candidate["id"]

    claim = requests.patch(
        f"{SUPABASE_URL}/rest/v1/projects?id=eq.{project_id}&status=eq.queued_gpu",
        headers={**HEADERS, "Prefer": "return=representation"},
        json={
            "status": "processing",
            "current_stage": "ai_director",
            "progress": 2,
            "error_message": None,
        },
        timeout=30,
    )
    claim.raise_for_status()
    claimed = claim.json()

    if not claimed:
        print("Job was claimed elsewhere; exiting cleanly.")
        github_output("found", "false")
        return 0

    project = claimed[0]
    payload = {
        "project": project,
        "supabase": {
            "url": SUPABASE_URL,
            "publishable_key": SUPABASE_PUBLISHABLE_KEY,
        },
    }

    destination = Path("kaggle_worker/job.json")
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    requests.post(
        f"{SUPABASE_URL}/rest/v1/job_events",
        headers={**HEADERS, "Prefer": "return=minimal"},
        json={
            "project_id": project_id,
            "stage": "orchestrator",
            "status": "claimed",
            "message": "GitHub Actions claimed the project for real Kaggle GPU generation",
            "metadata": {"runner": "github-actions", "gpu_provider": "kaggle"},
        },
        timeout=30,
    ).raise_for_status()

    print(f"Claimed project {project_id}: {project['idea']}")
    github_output("found", "true")
    github_output("project_id", project_id)
    return 0


if __name__ == "__main__":
    sys.exit(main())
