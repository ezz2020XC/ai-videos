import { NextResponse } from 'next/server';
import { buildSocialCopy } from '../../../lib/social-copy';

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
      `${SUPABASE_URL}/rest/v1/scheduled_posts?select=id,project_id,platform,scheduled_for,status,caption,metadata,external_post_id,error_message,created_at,projects(id,title,idea,output_urls)&order=scheduled_for.asc&limit=250`,
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
    const projectIds = [...new Set(
      (Array.isArray(body.projectIds) ? body.projectIds : [body.projectId])
        .map(value => String(value || '').trim())
        .filter(Boolean)
    )].slice(0, 50);
    const scheduledFor = body.scheduledFor;
    const platforms = Array.isArray(body.platforms) ? body.platforms : [];
    const allowed = [...new Set(platforms.filter(p => ['youtube', 'instagram', 'tiktok'].includes(p)))];
    const intervalMinutes = Math.max(0, Math.min(10080, Number(body.intervalMinutes || 0)));

    if (projectIds.length === 0 || !scheduledFor || allowed.length === 0) {
      return NextResponse.json({ error: 'At least one project, a start time and one platform are required.' }, { status: 400 });
    }

    const start = new Date(scheduledFor);
    if (Number.isNaN(start.getTime()) || start.getTime() <= Date.now()) {
      return NextResponse.json({ error: 'Schedule time must be in the future.' }, { status: 400 });
    }

    const filter = projectIds.map(id => encodeURIComponent(id)).join(',');
    const projectRes = await fetch(
      `${SUPABASE_URL}/rest/v1/projects?id=in.(${filter})&select=id,status,title,idea,style,generation_mode,caption_strategy,hashtag_strategy`,
      { headers, cache: 'no-store' }
    );
    const projects = await projectRes.json();
    if (!projectRes.ok) return NextResponse.json({ error: 'Could not validate selected videos.' }, { status: 500 });

    const byId = new Map(projects.map(project => [project.id, project]));
    const invalid = projectIds.filter(id => !byId.has(id) || byId.get(id).status !== 'ready_for_review');
    if (invalid.length) {
      return NextResponse.json({
        error: 'Only videos that are ready for review can be scheduled.',
        invalidProjectIds: invalid,
      }, { status: 400 });
    }

    const rows = [];
    const projectCopy = {};
    projectIds.forEach((projectId, index) => {
      const project = byId.get(projectId);
      const publishAt = new Date(start.getTime() + index * intervalMinutes * 60_000).toISOString();
      allowed.forEach(platform => {
        const platformOverride = body.captionsByPlatform?.[platform];
        const copy = buildSocialCopy({
          ...project,
          platform,
          generationMode: project.generation_mode,
          strategy: body.captionStrategy || project.caption_strategy || 'auto',
          hashtagStrategy: body.hashtagStrategy || project.hashtag_strategy || 'auto',
        });
        const caption = String(platformOverride || body.caption || '').trim() || copy.finalText;
        projectCopy[platform] = copy;

        rows.push({
          project_id: projectId,
          platform,
          scheduled_for: publishAt,
          status: 'scheduled',
          caption,
          metadata: {
            bulk: projectIds.length > 1,
            sequence_index: index,
            interval_minutes: intervalMinutes,
            caption_strategy: copy.strategy,
            hashtag_strategy: body.hashtagStrategy || project.hashtag_strategy || 'auto',
            generated_copy: copy,
          },
        });
      });
    });

    const insert = await fetch(`${SUPABASE_URL}/rest/v1/scheduled_posts`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify(rows),
    });
    const data = await insert.json();
    if (!insert.ok) return NextResponse.json({ error: 'Could not create schedule', details: data }, { status: 500 });

    await Promise.all(projectIds.map((projectId, index) => {
      const publishAt = new Date(start.getTime() + index * intervalMinutes * 60_000).toISOString();
      return fetch(`${SUPABASE_URL}/rest/v1/projects?id=eq.${encodeURIComponent(projectId)}`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify({
          scheduled_for: publishAt,
          publish_status: 'scheduled',
          social_copy: projectCopy,
        }),
      });
    }));

    return NextResponse.json({
      scheduled: data,
      videos: projectIds.length,
      posts: rows.length,
      intervalMinutes,
      generatedCaptions: projectCopy,
    });
  } catch (error) {
    console.error('Schedule POST error:', error);
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 });
  }
}
