import { NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

function headers(extra = {}) {
  return {
    apikey: SUPABASE_SECRET_KEY,
    Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function loadProject(id) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/projects?id=eq.${encodeURIComponent(id)}&select=id,status,current_stage,progress,output_urls,delete_requested,cancel_requested`,
    { headers: headers(), cache: 'no-store' }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`Could not load project: ${JSON.stringify(data)}`);
  return Array.isArray(data) ? data[0] : null;
}

async function patchProject(id, payload) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/projects?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=representation' }),
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Could not update project: ${JSON.stringify(data)}`);
  return Array.isArray(data) ? data[0] : data;
}

async function logEvent(id, status, message) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/job_events`, {
      method: 'POST',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify({
        project_id: id,
        stage: 'control',
        status,
        message,
        metadata: {},
      }),
    });
  } catch (_) {}
}

async function removeStoredAssets(id, outputUrls = {}) {
  const prefixes = new Set([
    `${id}/final_vertical.mp4`,
    `${id}/final_landscape.mp4`,
    `${id}/thumbnail.jpg`,
  ]);

  for (const value of Object.values(outputUrls || {})) {
    if (typeof value !== 'string') continue;
    const marker = '/storage/v1/object/public/videos/';
    const index = value.indexOf(marker);
    if (index >= 0) {
      prefixes.add(decodeURIComponent(value.slice(index + marker.length)));
    }
  }

  if (!prefixes.size) return;
  try {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/videos`, {
      method: 'DELETE',
      headers: headers(),
      body: JSON.stringify({ prefixes: [...prefixes] }),
    });
    if (!res.ok) console.warn('Storage cleanup returned', res.status, await res.text());
  } catch (error) {
    console.warn('Storage cleanup failed:', error);
  }
}

async function hardDeleteProject(id, project) {
  await removeStoredAssets(id, project?.output_urls || {});
  const res = await fetch(`${SUPABASE_URL}/rest/v1/projects?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: headers({ Prefer: 'return=minimal' }),
  });
  if (!res.ok) throw new Error(`Could not delete project: ${await res.text()}`);
}

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const { action } = await request.json();

    if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
      return NextResponse.json({ error: 'Supabase server configuration is missing.' }, { status: 500 });
    }
    if (!['stop', 'delete'].includes(action)) {
      return NextResponse.json({ error: 'Unsupported control action.' }, { status: 400 });
    }

    const project = await loadProject(id);
    if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });

    const active = ['queued_gpu', 'processing', 'cancelling'].includes(project.status);

    if (action === 'stop') {
      if (!active) {
        return NextResponse.json({ project, message: 'This project is not currently generating.' });
      }

      if (project.status === 'queued_gpu') {
        const updated = await patchProject(id, {
          cancel_requested: true,
          status: 'cancelled',
          current_stage: 'cancelled',
          cancelled_at: new Date().toISOString(),
          error_message: null,
        });
        await logEvent(id, 'cancelled', 'Queued generation was stopped before GPU processing started.');
        return NextResponse.json({ project: updated, message: 'Generation stopped.' });
      }

      const updated = await patchProject(id, {
        cancel_requested: true,
        status: 'cancelling',
        error_message: null,
      });
      await logEvent(id, 'stop_requested', 'Stop requested. The GPU worker will interrupt at the next safe checkpoint.');
      return NextResponse.json({ project: updated, message: 'Stopping generation…' });
    }

    if (active && project.status !== 'queued_gpu') {
      const updated = await patchProject(id, {
        cancel_requested: true,
        delete_requested: true,
        status: 'cancelling',
        error_message: null,
      });
      await logEvent(id, 'delete_requested', 'Delete requested while generating. Worker will stop, then the project will be removed.');
      return NextResponse.json({ project: updated, pendingDelete: true, message: 'Stopping and deleting…' });
    }

    await hardDeleteProject(id, project);
    return NextResponse.json({ deleted: true, id });
  } catch (error) {
    console.error('Project control API error:', error);
    return NextResponse.json({ error: error?.message || 'Unexpected server error' }, { status: 500 });
  }
}
