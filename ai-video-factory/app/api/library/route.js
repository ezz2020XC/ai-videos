import { NextResponse } from 'next/server';
import { decorateQueue } from '../../../lib/generation-estimates';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

export async function GET() {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/projects?select=id,title,idea,status,current_stage,progress,requested_duration,style,voice,quality,platforms,output_urls,script,created_at,updated_at,scheduled_for,publish_status,music_enabled,music_mood,generation_mode,animation_engine,generation_preset,animation_coverage,caption_strategy,hashtag_strategy,outro_enabled,outro_text,outro_duration,outro_style,batch_id,cancel_requested,delete_requested,error_message,estimated_render_seconds,estimated_wait_seconds,estimated_finish_at,started_at,finished_at,social_copy&order=created_at.desc&limit=200`,
      {
        headers: {
          apikey: SUPABASE_SECRET_KEY,
          Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
        },
        cache: 'no-store',
      }
    );

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: 'Could not load library', details: data }, { status: 500 });
    }

    const activeStatuses = new Set(['queued_gpu', 'processing', 'cancelling']);
    const projects = decorateQueue(Array.isArray(data) ? data : []);
    const active = projects.filter(project => activeStatuses.has(project.status));
    const completed = projects.filter(project => !activeStatuses.has(project.status));

    return NextResponse.json({ projects, active, completed, generatedAt: new Date().toISOString() });
  } catch (error) {
    console.error('Library API error:', error);
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 });
  }
}
