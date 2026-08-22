const ACTIVE = new Set(['queued_gpu', 'processing', 'cancelling']);

export function estimateGenerationSeconds(input = {}) {
  const duration = Math.max(30, Number(input.requested_duration ?? input.duration ?? 30));
  const mode = input.generation_mode ?? input.generationMode ?? 'faceless';
  const engine = input.animation_engine ?? input.animationEngine ?? 'auto';
  const preset = input.generation_preset ?? input.generationPreset ?? 'balanced';
  const coverage = input.animation_coverage ?? input.animationCoverage ?? 'balanced';
  const quality = input.quality ?? 'Full HD';
  const platforms = input.platforms || {};

  let seconds = 300;

  if (engine === 'motion') seconds = 240;
  else if (engine === 'auto') seconds = 600;
  else if (engine === 'cogvideox') seconds = 900;
  else if (engine === 'wan_vace') seconds = 1080;

  if (mode === 'character_story') seconds *= 1.18;
  if (mode === 'talking_characters') seconds *= 1.4;

  if (coverage === 'minimal') seconds *= 0.55;
  if (coverage === 'balanced') seconds *= 0.82;
  if (coverage === 'full') seconds *= 1.25;

  if (preset === 'fast_preview') seconds *= 0.55;
  if (preset === 'balanced') seconds *= 0.82;
  if (preset === 'full_quality') seconds *= 1.2;

  seconds *= duration / 30;

  if (quality === 'Fast Draft') seconds *= 0.72;
  if (platforms.youtube && (platforms.reels || platforms.tiktok || platforms.shorts)) seconds *= 1.28;

  // Model loading + voice + storyboard + final mux floor.
  seconds += 150;
  return Math.max(240, Math.round(seconds));
}

export function estimateRemainingSeconds(project = {}) {
  const total = Number(project.estimated_render_seconds) || estimateGenerationSeconds(project);
  if (project.status === 'queued_gpu') return total;
  if (project.status === 'cancelling') return Math.min(90, total);
  if (project.status !== 'processing') return 0;
  const progress = Math.max(0, Math.min(99, Number(project.progress || 0)));
  return Math.max(60, Math.round(total * (1 - progress / 100)));
}

export function decorateQueue(projects = [], now = Date.now()) {
  const result = projects.map(project => ({ ...project }));
  const active = result
    .filter(project => ACTIVE.has(project.status))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  let cursor = 0;
  let queuedPosition = 0;
  for (const project of active) {
    if (project.status === 'queued_gpu') queuedPosition += 1;
    const remaining = estimateRemainingSeconds(project);
    const wait = cursor;
    project.queue_position = project.status === 'queued_gpu' ? queuedPosition : 0;
    project.estimated_wait_seconds = wait;
    project.estimated_render_seconds = Number(project.estimated_render_seconds) || estimateGenerationSeconds(project);
    project.estimated_remaining_seconds = remaining;
    project.estimated_finish_at = new Date(now + (wait + remaining) * 1000).toISOString();
    cursor += remaining;
  }

  const byId = new Map(active.map(project => [project.id, project]));
  return result.map(project => byId.get(project.id) || project);
}

export function estimateProspectiveJob(input = {}, activeProjects = [], now = Date.now()) {
  const renderSeconds = estimateGenerationSeconds(input);
  const decorated = decorateQueue(activeProjects, now);
  const active = decorated.filter(project => ACTIVE.has(project.status));
  const waitSeconds = active.reduce((sum, project) => sum + estimateRemainingSeconds(project), 0);
  const queuePosition = active.filter(project => project.status === 'queued_gpu').length + 1;
  const totalSeconds = waitSeconds + renderSeconds;

  return {
    queuePosition,
    waitSeconds,
    renderSeconds,
    totalSeconds,
    minSeconds: Math.round(totalSeconds * 0.78),
    maxSeconds: Math.round(totalSeconds * 1.28),
    finishAt: new Date(now + totalSeconds * 1000).toISOString(),
  };
}
