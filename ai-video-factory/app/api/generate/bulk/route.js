import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { estimateGenerationSeconds, estimateProspectiveJob } from '../../../../lib/generation-estimates';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

const allowedModes = new Set(['faceless', 'character_story', 'talking_characters']);
const allowedEngines = new Set(['auto', 'motion', 'wan_vace', 'cogvideox']);
const allowedPresets = new Set(['fast_preview', 'balanced', 'full_quality']);
const allowedCoverage = new Set(['minimal', 'balanced', 'full']);
const allowedCaptions = new Set(['auto', 'meme', 'curiosity', 'storytelling', 'relatable', 'emotional', 'viral']);
const allowedHashtags = new Set(['auto', 'safe_viral', 'broad', 'niche', 'meme', 'ai_content']);

function buildProject(idea, body, batchId, eta) {
  const musicVolume = Math.min(0.35, Math.max(0, Number(body.musicVolume ?? 0.14)));
  const outroDuration = Math.min(8, Math.max(1, Number(body.outroDuration ?? 2.5)));
  return {
    idea,
    requested_duration: Math.max(Number(body.duration) || 30, 30),
    style: body.style || 'Cinematic Documentary',
    voice: body.voice || 'US Male',
    quality: body.quality || 'Full HD',
    platforms: body.platforms || {},
    music_enabled: body.musicEnabled !== false,
    music_mood: body.musicMood || 'cinematic',
    music_volume: musicVolume,
    generation_mode: allowedModes.has(body.generationMode) ? body.generationMode : 'faceless',
    animation_engine: allowedEngines.has(body.animationEngine) ? body.animationEngine : 'auto',
    generation_preset: allowedPresets.has(body.generationPreset) ? body.generationPreset : 'balanced',
    animation_coverage: allowedCoverage.has(body.animationCoverage) ? body.animationCoverage : 'balanced',
    caption_strategy: allowedCaptions.has(body.captionStrategy) ? body.captionStrategy : 'auto',
    hashtag_strategy: allowedHashtags.has(body.hashtagStrategy) ? body.hashtagStrategy : 'auto',
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
    estimated_render_seconds: eta.renderSeconds,
    estimated_wait_seconds: eta.waitSeconds,
    estimated_finish_at: eta.finishAt,
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const rawIdeas = Array.isArray(body.ideas) ? body.ideas : String(body.ideas || '').split(/\r?\n/);
    const ideas = [...new Set(rawIdeas.map(v => String(v).trim()).filter(Boolean))].slice(0, 12);
    if (ideas.length < 2) {
      return NextResponse.json({ error: 'Add at least two video ideas for bulk generation.' }, { status: 400 });
    }
    if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
      return NextResponse.json({ error: 'Supabase server environment variables are missing' }, { status: 500 });
    }

    const activeRes = await fetch(
      `${SUPABASE_URL}/rest/v1/projects?status=in.(queued_gpu,processing,cancelling)&select=id,status,progress,created_at,requested_duration,generation_mode,animation_engine,generation_preset,animation_coverage,quality,platforms,estimated_render_seconds&order=created_at.asc`,
      { headers: { apikey: SUPABASE_SECRET_KEY, Authorization: `Bearer ${SUPABASE_SECRET_KEY}` }, cache: 'no-store' }
    );
    const active = activeRes.ok ? await activeRes.json() : [];
    const firstEta = estimateProspectiveJob({
      ...body,
      requested_duration: body.duration,
      generation_mode: body.generationMode,
      animation_engine: body.animationEngine,
      generation_preset: body.generationPreset,
      animation_coverage: body.animationCoverage,
    }, active);
    const renderSeconds = estimateGenerationSeconds({
      ...body,
      requested_duration: body.duration,
      generation_mode: body.generationMode,
      animation_engine: body.animationEngine,
      generation_preset: body.generationPreset,
      animation_coverage: body.animationCoverage,
    });

    const batchId = crypto.randomUUID();
    const now = Date.now();
    const rows = ideas.map((idea, index) => {
      const waitSeconds = firstEta.waitSeconds + index * renderSeconds;
      const eta = {
        renderSeconds,
        waitSeconds,
        finishAt: new Date(now + (waitSeconds + renderSeconds) * 1000).toISOString(),
      };
      return buildProject(idea, body, batchId, eta);
    });

    const response = await fetch(`${SUPABASE_URL}/rest/v1/projects`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(rows),
      cache: 'no-store',
    });

    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json({ error: 'Could not create bulk generation batch', details: data }, { status: 500 });
    }

    return NextResponse.json({
      batchId,
      count: data.length,
      estimatedBatchSeconds: firstEta.waitSeconds + renderSeconds * data.length,
      projects: data.map(row => ({ id: row.id, idea: row.idea, status: row.status, estimatedFinishAt: row.estimated_finish_at })),
    });
  } catch (error) {
    console.error('Bulk generate API error:', error);
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 });
  }
}
