import { NextResponse } from 'next/server';
import { estimateProspectiveJob } from '../../../lib/generation-estimates';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

export async function POST(request) {
  try {
    const input = await request.json();
    if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
      return NextResponse.json({ error: 'Supabase server configuration is missing.' }, { status: 500 });
    }

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/projects?status=in.(queued_gpu,processing,cancelling)&select=id,status,progress,created_at,requested_duration,generation_mode,animation_engine,generation_preset,animation_coverage,quality,platforms,estimated_render_seconds&order=created_at.asc`,
      {
        headers: {
          apikey: SUPABASE_SECRET_KEY,
          Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
        },
        cache: 'no-store',
      }
    );
    const active = await response.json();
    if (!response.ok) return NextResponse.json({ error: 'Could not estimate queue.' }, { status: 500 });

    return NextResponse.json(estimateProspectiveJob(input, active));
  } catch (error) {
    console.error('Estimate API error:', error);
    return NextResponse.json({ error: 'Could not estimate generation time.' }, { status: 500 });
  }
}
