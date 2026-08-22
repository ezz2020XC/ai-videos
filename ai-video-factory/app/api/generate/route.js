import { NextResponse } from 'next/server';
import { estimateProspectiveJob } from '../../../lib/generation-estimates';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

const allowedModes = new Set(['faceless', 'character_story', 'talking_characters']);
const allowedEngines = new Set(['auto', 'motion', 'wan_vace', 'cogvideox']);
const allowedPresets = new Set(['fast_preview', 'balanced', 'full_quality']);
const allowedCoverage = new Set(['minimal', 'balanced', 'full']);
const allowedCaptions = new Set(['auto', 'meme', 'curiosity', 'storytelling', 'relatable', 'emotional', 'viral']);
const allowedHashtags = new Set(['auto', 'safe_viral', 'broad', 'niche', 'meme', 'ai_content']);

function projectPayload(body, batchId = null, eta = null) {
  const musicVolume = Math.min(0.35, Math.max(0, Number(body.musicVolume ?? 0.14)));
  const outroDuration = Math.min(8, Math.max(1, Number(body.outroDuration ?? 2.5)));
  const generationMode = allowedModes.has(body.generationMode) ? body.generationMode : 'faceless';
  const animationEngine = allowedEngines.has(body.animationEngine) ? body.animationEngine : 'auto';
  const generationPreset = allowedPresets.has(body.generationPreset) ? body.generationPreset : 'balanced';
  const animationCoverage = allowedCoverage.has(body.animationCoverage) ? body.animationCoverage : 'balanced';
  const captionStrategy = allowedCaptions.has(body.captionStrategy) ? body.captionStrategy : 'auto';
  const hashtagStrategy = allowedHashtags.has(body.hashtagStrategy) ? body.hashtagStrategy : 'auto';

  return {
    idea: body.idea.trim(),
    requested_duration: Math.max(Number(body.duration) || 30, 30),
    style: body.style || 'Cinematic Documentary',
    voice: body.voice || 'US Male',
    quality: body.quality || 'Full HD',
    platforms: body.platforms || {},
    music_enabled: body.musicEnabled !== false,
    music_mood: body.musicMood || 'cinematic',
    music_volume: musicVolume,
    generation_mode: generationMode,
    animation_engine: animationEngine,
    generation_preset: generationPreset,
    animation_coverage: animationCoverage,
    caption_strategy: captionStrategy,
    hashtag_strategy: hashtagStrategy,
    outro_enabled: body.outroEnabled !== false,
    outro_text: String(body.outroText || 'Follow for more').trim().slice(0, 120) || 'Follow for more',
    outro_duration: outroDuration,
    outro_style: String(body.outroStyle || 'minimal').trim().slice(0, 40) || 'minimal',
    batch_id: batchId,
    cancel_requested: false,
    delete_requested: false,
    status: 'queued_gpu',
    progress: 0,
    current_stage: 'queued',
    output_urls: {},
    error_message: null,
    estimated_render_seconds: eta?.renderSeconds ?? null,
    estimated_wait_seconds: eta?.waitSeconds ?? null,
    estimated_finish_at: eta?.finishAt ?? null,
  };
}

async function activeProjects() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/projects?status=in.(queued_gpu,processing,cancelling)&select=id,status,progress,created_at,requested_duration,generation_mode,animation_engine,generation_preset,animation_coverage,quality,platforms,estimated_render_seconds&order=created_at.asc`,
    {
      headers: {
        apikey: SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
      },
      cache: 'no-store',
    }
  );
  if (!res.ok) return [];
  return res.json();
}

export async function POST(request) {
  try {
    const body = await request.json();

    if (!body?.idea?.trim()) {
      return NextResponse.json({ error: 'Idea required' }, { status: 400 });
    }

    if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
      return NextResponse.json({ error: 'Supabase server environment variables are missing' }, { status: 500 });
    }

    const active = await activeProjects();
    const eta = estimateProspectiveJob({
      ...body,
      requested_duration: body.duration,
      generation_mode: body.generationMode,
      animation_engine: body.animationEngine,
      generation_preset: body.generationPreset,
      animation_coverage: body.animationCoverage,
    }, active);

    const supabaseResponse = await fetch(`${SUPABASE_URL}/rest/v1/projects`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(projectPayload(body, null, eta)),
      cache: 'no-store',
    });

    const data = await supabaseResponse.json();
    if (!supabaseResponse.ok) {
      console.error('Supabase insert failed:', data);
      return NextResponse.json({ error: 'Could not create project', details: data }, { status: 500 });
    }

    const project = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({
      projectId: project.id,
      status: project.status,
      progress: project.progress,
      stage: project.current_stage,
      generationMode: project.generation_mode,
      animationEngine: project.animation_engine,
      eta,
      outputs: {
        reels: body.platforms?.reels ? '1080x1920' : null,
        tiktok: body.platforms?.tiktok ? '1080x1920' : null,
        shorts: body.platforms?.shorts ? '1080x1920' : null,
        youtube: body.platforms?.youtube ? '1920x1080' : null,
      },
    });
  } catch (error) {
    console.error('Generate API error:', error);
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 });
  }
}
