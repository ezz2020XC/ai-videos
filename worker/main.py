import os
import time
import requests

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_SECRET_KEY = os.environ["SUPABASE_SECRET_KEY"]
POLL_SECONDS = float(os.getenv("POLL_SECONDS", "5"))

HEADERS = {
    "apikey": SUPABASE_SECRET_KEY,
    "Authorization": f"Bearer {SUPABASE_SECRET_KEY}",
    "Content-Type": "application/json",
}

STAGES = [
    ("ai_director", 10),
    ("voice", 25),
    ("storyboard", 40),
    ("animation", 60),
    ("captions", 75),
    ("render", 90),
    ("approval", 100),
]


def fetch_next_job():
    url = (
        f"{SUPABASE_URL}/rest/v1/projects"
        "?status=eq.queued&select=*&order=created_at.asc&limit=1"
    )
    response = requests.get(url, headers=HEADERS, timeout=30)
    response.raise_for_status()
    rows = response.json()
    return rows[0] if rows else None


def update_project(project_id, **fields):
    url = f"{SUPABASE_URL}/rest/v1/projects?id=eq.{project_id}"
    response = requests.patch(
        url,
        headers={**HEADERS, "Prefer": "return=minimal"},
        json=fields,
        timeout=30,
    )
    response.raise_for_status()


def add_event(project_id, stage, status, message=None, metadata=None):
    url = f"{SUPABASE_URL}/rest/v1/job_events"
    payload = {
        "project_id": project_id,
        "stage": stage,
        "status": status,
        "message": message,
        "metadata": metadata or {},
    }
    response = requests.post(
        url,
        headers={**HEADERS, "Prefer": "return=minimal"},
        json=payload,
        timeout=30,
    )
    response.raise_for_status()


def run_placeholder_pipeline(project):
    project_id = project["id"]

    update_project(
        project_id,
        status="processing",
        current_stage="ai_director",
        progress=1,
        error_message=None,
    )
    add_event(project_id, "worker", "started", "Worker claimed project")

    for stage, progress in STAGES:
        update_project(
            project_id,
            status="processing" if stage != "approval" else "ready_for_review",
            current_stage=stage,
            progress=progress,
        )
        add_event(project_id, stage, "started", f"Running {stage}")

        # Temporary end-to-end pipeline test.
        # Each block will be replaced with the real AI implementation.
        time.sleep(2)

        add_event(project_id, stage, "completed", f"Completed {stage}")

    update_project(
        project_id,
        status="ready_for_review",
        current_stage="approval",
        progress=100,
    )


def process_project(project):
    try:
        run_placeholder_pipeline(project)
    except Exception as exc:
        project_id = project.get("id")
        if project_id:
            try:
                update_project(
                    project_id,
                    status="failed",
                    current_stage="failed",
                    error_message=str(exc),
                )
                add_event(project_id, "worker", "failed", str(exc))
            except Exception:
                pass
        raise


def main():
    print("AI Video Factory worker started")
    while True:
        try:
            project = fetch_next_job()
            if project:
                print(f"Processing {project['id']} :: {project['idea']}")
                process_project(project)
            else:
                time.sleep(POLL_SECONDS)
        except KeyboardInterrupt:
            print("Worker stopped")
            break
        except Exception as exc:
            print(f"Worker error: {exc}")
            time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
