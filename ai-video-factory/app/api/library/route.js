import { NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

export async function GET() {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/projects?select=id,title,idea,status,current_stage,progress,requested_duration,style,voice,quality,platforms,output_urls,script,created_at,scheduled_for,publish_status,music_enabled,music_mood&order=created_at.desc&limit=100`,
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
    return NextResponse.json({ projects: data });
  } catch (error) {
    console.error('Library API error:', error);
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 });
  }
}
