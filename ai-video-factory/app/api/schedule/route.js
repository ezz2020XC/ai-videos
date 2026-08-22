import { NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

const headers = {
  apikey: SUPABASE_SECRET_KEY,
  Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
  'Content-Type': 'application/json',
};

export async function GET() {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/scheduled_posts?select=id,project_id,platform,scheduled_for,status,caption,external_post_id,error_message,created_at,projects(id,title,idea,output_urls)&order=scheduled_for.asc&limit=100`,
      { headers, cache: 'no-store' }
    );
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ error: 'Could not load schedule', details: data }, { status: 500 });
    return NextResponse.json({ scheduled: data });
  } catch (error) {
    console.error('Schedule GET error:', error);
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const projectId = body.projectId;
    const scheduledFor = body.scheduledFor;
    const platforms = Array.isArray(body.platforms) ? body.platforms : [];
    const allowed = platforms.filter(p => ['youtube', 'instagram', 'tiktok'].includes(p));

    if (!projectId || !scheduledFor || allowed.length === 0) {
      return NextResponse.json({ error: 'Project, time and at least one platform are required.' }, { status: 400 });
    }

    const date = new Date(scheduledFor);
    if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
      return NextResponse.json({ error: 'Schedule time must be in the future.' }, { status: 400 });
    }

    const rows = allowed.map(platform => ({
      project_id: projectId,
      platform,
      scheduled_for: date.toISOString(),
      status: 'scheduled',
      caption: body.caption?.trim() || null,
      metadata: {},
    }));

    const insert = await fetch(`${SUPABASE_URL}/rest/v1/scheduled_posts`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify(rows),
    });
    const data = await insert.json();
    if (!insert.ok) return NextResponse.json({ error: 'Could not create schedule', details: data }, { status: 500 });

    await fetch(`${SUPABASE_URL}/rest/v1/projects?id=eq.${encodeURIComponent(projectId)}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({
        scheduled_for: date.toISOString(),
        publish_status: 'scheduled',
      }),
    });

    return NextResponse.json({ scheduled: data });
  } catch (error) {
    console.error('Schedule POST error:', error);
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 });
  }
}
