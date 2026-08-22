import json
import mimetypes
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

import requests

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_SECRET_KEY = os.environ["SUPABASE_SECRET_KEY"]
OUTPUT_DIR = Path(os.environ.get("KAGGLE_OUTPUT_DIR", "/tmp/kaggle-output"))

HEADERS = {
    "apikey": SUPABASE_SECRET_KEY,
    "Authorization": f"Bearer {SUPABASE_SECRET_KEY}",
}
JSON_HEADERS = {**HEADERS, "Content-Type": "application/json"}


def upload_file(project_id: str, file_name: str) -> str:
    source = OUTPUT_DIR / file_name
    if not source.exists():
        raise FileNotFoundError(f"Expected Kaggle output not found: {source}")

    object_path = f"{project_id}/{file_name}"
    content_type = mimetypes.guess_type(file_name)[0] or "application/octet-stream"
    with source.open("rb") as fh:
        response = requests.post(
            f"{SUPABASE_URL}/storage/v1/object/videos/{quote(object_path, safe='/')}",
            headers={
                **HEADERS,
                "Content-Type": content_type,
                "x-upsert": "true",
            },
            data=fh,
            timeout=300,
        )
    response.raise_for_status()
    return f"{SUPABASE_URL}/storage/v1/object/public/videos/{quote(object_path, safe='/')}"


def load_current(project_id: str):
    response = requests.get(
        f"{SUPABASE_URL}/rest/v1/projects?id=eq.{project_id}&select=*",
        headers=HEADERS,
        timeout=30,
    )
    response.raise_for_status()
    rows = response.json()
    return rows[0] if rows else None


def remove_assets(project_id: str):
    prefixes = [
        f"{project_id}/final_vertical.mp4",
        f"{project_id}/final_landscape.mp4",
        f"{project_id}/thumbnail.jpg",
    ]
    try:
        response = requests.delete(
            f"{SUPABASE_URL}/storage/v1/object/videos",
            headers=JSON_HEADERS,
            json={"prefixes": prefixes},
            timeout=60,
        )
        if not response.ok:
            print("Storage cleanup warning:", response.status_code, response.text[:400])
    except Exception as exc:
        print("Storage cleanup exception:", repr(exc))


def delete_project(project_id: str):
    remove_assets(project_id)
    response = requests.delete(
        f"{SUPABASE_URL}/rest/v1/projects?id=eq.{project_id}",
        headers={**HEADERS, "Prefer": "return=minimal"},
        timeout=30,
    )
    response.raise_for_status()
    print(f"Deleted project {project_id} after worker shutdown.")


def mark_cancelled(project_id: str, message: str):
    response = requests.patch(
        f"{SUPABASE_URL}/rest/v1/projects?id=eq.{project_id}",
        headers={**JSON_HEADERS, "Prefer": "return=minimal"},
        json={
            "status": "cancelled",
            "current_stage": "cancelled",
            "cancel_requested": True,
            "cancelled_at": datetime.now(timezone.utc).isoformat(),
            "error_message": None,
        },
        timeout=30,
    )
    response.raise_for_status()
    requests.post(
        f"{SUPABASE_URL}/rest/v1/job_events",
        headers={**JSON_HEADERS, "Prefer": "return=minimal"},
        json={
            "project_id": project_id,
            "stage": "control",
            "status": "cancelled",
            "message": message,
            "metadata": {},
        },
        timeout=30,
    ).raise_for_status()


def main() -> int:
    result_path = OUTPUT_DIR / "result.json"
    if not result_path.exists():
        raise FileNotFoundError("Kaggle completed but result.json was not returned")

    result = json.loads(result_path.read_text(encoding="utf-8"))
    project_id = result["project_id"]
    embedded_project = result.get("project") or {}
    current = load_current(project_id)

    if not current:
        print(f"Project {project_id} no longer exists; nothing to finalize.")
        return 0

    if current.get("delete_requested") or result.get("delete_requested"):
        delete_project(project_id)
        return 0

    if current.get("cancel_requested") or result.get("cancelled"):
        mark_cancelled(project_id, result.get("cancel_reason") or "Generation stopped by user.")
        return 0

    generated = result.get("outputs", {})
    urls = {}
    vertical_url = None
    landscape_url = None

    if generated.get("vertical"):
        vertical_url = upload_file(project_id, generated["vertical"])
    if generated.get("landscape"):
        landscape_url = upload_file(project_id, generated["landscape"])
    if generated.get("thumbnail"):
        urls["thumbnail"] = upload_file(project_id, generated["thumbnail"])

    platforms = current.get("platforms") or embedded_project.get("platforms") or {}
    if vertical_url:
        urls["preview"] = vertical_url
        if platforms.get("reels"):
            urls["reels"] = vertical_url
        if platforms.get("tiktok"):
            urls["tiktok"] = vertical_url
        if platforms.get("shorts"):
            urls["shorts"] = vertical_url
    if landscape_url:
        urls["youtube"] = landscape_url
        if not urls.get("preview"):
            urls["preview"] = landscape_url

    patch = requests.patch(
        f"{SUPABASE_URL}/rest/v1/projects?id=eq.{project_id}",
        headers={**JSON_HEADERS, "Prefer": "return=minimal"},
        json={
            "status": "ready_for_review",
            "current_stage": "approval",
            "progress": 100,
            "title": result.get("title"),
            "script": result.get("script"),
            "plan": result.get("plan") or {},
            "result_metadata": result.get("metadata") or {},
            "output_urls": urls,
            "error_message": None,
        },
        timeout=30,
    )
    patch.raise_for_status()

    requests.post(
        f"{SUPABASE_URL}/rest/v1/job_events",
        headers={**JSON_HEADERS, "Prefer": "return=minimal"},
        json={
            "project_id": project_id,
            "stage": "approval",
            "status": "completed",
            "message": "Real Kaggle GPU render uploaded and ready for review",
            "metadata": {"output_urls": urls},
        },
        timeout=30,
    ).raise_for_status()

    print(json.dumps({"project_id": project_id, "output_urls": urls}, indent=2))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print(f"Finalize failed: {exc}", file=sys.stderr)
        raise
