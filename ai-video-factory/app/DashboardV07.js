'use client';

import { useEffect, useMemo, useState } from 'react';

const defaultPlatforms = { reels: true, tiktok: true, shorts: true, youtube: false };
const activeStatuses = new Set(['queued_gpu', 'processing', 'cancelling']);
const tabs = [
  ['create', 'Create'], ['queue', 'Queue'], ['library', 'Library'], ['trends', 'Trending'], ['accounts', 'Social Accounts'], ['schedule', 'Schedule'],
];
const platformNames = { youtube: 'YouTube', instagram: 'Instagram', tiktok: 'TikTok' };

const modelOptions = [
  { id: 'auto', label: 'Auto Hybrid', speed: 'Fastest balance', quality: 'High', best: 'Daily posting', desc: 'Uses true AI video on key scenes and professional motion elsewhere.', demo: 'hybrid' },
  { id: 'wan_vace', label: 'Wan VACE', speed: 'Slow', quality: 'Highest motion', best: 'Characters & cinematic shots', desc: 'Real image-to-video diffusion with stronger temporal movement.', demo: 'wan' },
  { id: 'cogvideox', label: 'CogVideoX', speed: 'Medium-slow', quality: 'High', best: 'Cinematic image-to-video', desc: 'Alternate real AI video engine and fallback provider.', demo: 'cog' },
  { id: 'motion', label: 'Motion Only', speed: 'Very fast', quality: 'Good', best: 'Bulk volume', desc: 'No video diffusion. Uses generated images with polished camera motion.', demo: 'motion' },
];

const styleOptions = [
  { id: 'Cinematic Documentary', icon: '◉', note: 'Realistic, dramatic, factual' },
  { id: '3D Animated', icon: '◈', note: 'Pixar-like character storytelling' },
  { id: 'Comedy', icon: '☺', note: 'Fast reactions and meme pacing' },
  { id: 'Mystery', icon: '◇', note: 'Dark curiosity and suspense' },
  { id: 'Science', icon: '✦', note: 'Explainers and what-if concepts' },
  { id: 'Horror', icon: '◐', note: 'Tension, shadows and reveals' },
  { id: 'Business', icon: '↗', note: 'Clean, authoritative, modern' },
  { id: 'News Explainer', icon: '▤', note: 'Current topics and fast context' },
];

function fmtSeconds(value) {
  const seconds = Math.max(0, Math.round(Number(value || 0)));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `~${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `~${h}h ${m ? `${m}m` : ''}`.trim();
}

function fmtDate(value) {
  if (!value) return '—';
  try { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
  catch { return value; }
}

function modeLabel(value) {
  if (value === 'talking_characters') return 'Talking Characters';
  if (value === 'character_story') return 'Character Story';
  return 'Faceless / Documentary';
}

function engineLabel(value) {
  return modelOptions.find(item => item.id === value)?.label || 'Auto Hybrid';
}

function presetLabel(value) {
  if (value === 'fast_preview') return 'Fast Preview';
  if (value === 'full_quality') return 'Full Quality';
  return 'Balanced';
}

function StatusPill({ project }) {
  const label = project.status === 'queued_gpu' ? 'Queued' : project.status === 'ready_for_review' ? 'Ready' : project.status === 'cancelling' ? 'Stopping' : project.status === 'cancelled' ? 'Stopped' : project.status;
  return <span className={`v7pill v7-${project.status}`}>{label}</span>;
}

function Progress({ value = 0 }) {
  return <div className="v7progress"><span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}

export default function DashboardV07() {
  const [tab, setTab] = useState('create');
  const [bulkMode, setBulkMode] = useState(false);
  const [idea, setIdea] = useState('');
  const [bulkIdeas, setBulkIdeas] = useState('');
  const [duration, setDuration] = useState('30');
  const [style, setStyle] = useState('3D Animated');
  const [voice, setVoice] = useState('US Male');
  const [quality, setQuality] = useState('Full HD');
  const [generationMode, setGenerationMode] = useState('talking_characters');
  const [animationEngine, setAnimationEngine] = useState('auto');
  const [generationPreset, setGenerationPreset] = useState('balanced');
  const [animationCoverage, setAnimationCoverage] = useState('balanced');
  const [captionStrategy, setCaptionStrategy] = useState('auto');
  const [hashtagStrategy, setHashtagStrategy] = useState('auto');
  const [platforms, setPlatforms] = useState(defaultPlatforms);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [musicMood, setMusicMood] = useState('uplifting');
  const [musicVolume, setMusicVolume] = useState(0.14);
  const [outroEnabled, setOutroEnabled] = useState(true);
  const [outroText, setOutroText] = useState('Follow for more');
  const [outroDuration, setOutroDuration] = useState(2.5);
  const [outroStyle, setOutroStyle] = useState('minimal');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [estimate, setEstimate] = useState(null);

  const [library, setLibrary] = useState([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [previewProject, setPreviewProject] = useState(null);
  const [busy, setBusy] = useState({});

  const [trendRegion, setTrendRegion] = useState('AE');
  const [trends, setTrends] = useState([]);
  const [trendsLoading, setTrendsLoading] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [accountMessage, setAccountMessage] = useState('');
  const [scheduled, setScheduled] = useState([]);
  const [scheduleMessage, setScheduleMessage] = useState('');
  const [socialPreview, setSocialPreview] = useState({});
  const [scheduleForm, setScheduleForm] = useState({
    projectIds: [], scheduledFor: '', intervalMinutes: 180, caption: '', captionStrategy: 'auto', hashtagStrategy: 'auto',
    platforms: { youtube: false, instagram: true, tiktok: true },
  });

  const activeProjects = useMemo(() => library.filter(p => activeStatuses.has(p.status)), [library]);
  const completedProjects = useMemo(() => library.filter(p => !activeStatuses.has(p.status)), [library]);
  const readyProjects = useMemo(() => library.filter(p => p.status === 'ready_for_review' && p.output_urls?.preview), [library]);
  const bulkCount = useMemo(() => [...new Set(bulkIdeas.split(/\r?\n/).map(x => x.trim()).filter(Boolean))].length, [bulkIdeas]);

  function generationBody() {
    return {
      duration: Number(duration), style, voice, quality, generationMode, animationEngine, generationPreset, animationCoverage,
      captionStrategy, hashtagStrategy, platforms, musicEnabled, musicMood, musicVolume, outroEnabled, outroText, outroDuration, outroStyle,
    };
  }

  async function loadLibrary(silent = false) {
    if (!silent) setLibraryLoading(true);
    try {
      const res = await fetch('/api/library', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok) setLibrary(data.projects || []);
    } finally { if (!silent) setLibraryLoading(false); }
  }

  async function loadTrends() {
    setTrendsLoading(true);
    try {
      const res = await fetch(`/api/trends?region=${trendRegion}`, { cache: 'no-store' });
      const data = await res.json();
      setTrends(data.trends || []);
    } finally { setTrendsLoading(false); }
  }

  async function loadAccounts() {
    const res = await fetch('/api/socials', { cache: 'no-store' });
    const data = await res.json();
    if (res.ok) setAccounts(data.accounts || []);
  }

  async function loadSchedule() {
    const res = await fetch('/api/schedule', { cache: 'no-store' });
    const data = await res.json();
    if (res.ok) setScheduled(data.scheduled || []);
  }

  useEffect(() => { loadLibrary(true); }, []);
  useEffect(() => {
    if (tab === 'queue' || tab === 'library') loadLibrary();
    if (tab === 'trends') loadTrends();
    if (tab === 'accounts') loadAccounts();
    if (tab === 'schedule') { loadLibrary(true); loadSchedule(); }
  }, [tab, trendRegion]);
  useEffect(() => {
    if (!['queue', 'library'].includes(tab)) return;
    const timer = setInterval(() => loadLibrary(true), 3000);
    return () => clearInterval(timer);
  }, [tab]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/estimate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(generationBody()) });
        const data = await res.json();
        if (res.ok) setEstimate(data);
      } catch {}
    }, 450);
    return () => clearTimeout(timer);
  }, [duration, quality, generationMode, animationEngine, generationPreset, animationCoverage, platforms.youtube, platforms.reels, platforms.tiktok, platforms.shorts]);

  async function generate() {
    if (bulkMode) return generateBulk();
    if (!idea.trim()) return setResult('Enter a video idea first.');
    setLoading(true); setResult('');
    try {
      const res = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idea, ...generationBody() }) });
      const data = await res.json();
      if (!res.ok) setResult(data.error || 'Could not create project.');
      else {
        setResult(`Queued successfully.\nEstimated total: ${fmtSeconds(data.eta?.totalSeconds)}\nEstimated finish: ${fmtDate(data.eta?.finishAt)}`);
        await loadLibrary(true); setTab('queue');
      }
    } finally { setLoading(false); }
  }

  async function generateBulk() {
    const ideas = [...new Set(bulkIdeas.split(/\r?\n/).map(x => x.trim()).filter(Boolean))];
    if (ideas.length < 2) return setResult('Add at least two ideas, one per line.');
    setLoading(true); setResult('');
    try {
      const res = await fetch('/api/generate/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ideas, ...generationBody() }) });
      const data = await res.json();
      if (!res.ok) setResult(data.error || 'Could not create batch.');
      else {
        setResult(`${data.count} videos queued. Estimated batch completion: ${fmtSeconds(data.estimatedBatchSeconds)}.`);
        await loadLibrary(true); setTab('queue');
      }
    } finally { setLoading(false); }
  }

  async function controlProject(project, action) {
    if (action === 'delete' && !window.confirm(`Delete “${project.title || project.idea}”?`)) return;
    setBusy(v => ({ ...v, [project.id]: action }));
    try {
      const res = await fetch(`/api/projects/${project.id}/control`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      const data = await res.json();
      if (!res.ok) window.alert(data.error || 'Could not update project.');
      if (data.deleted && previewProject?.id === project.id) setPreviewProject(null);
      await loadLibrary(true);
    } finally { setBusy(v => ({ ...v, [project.id]: null })); }
  }

  async function connectAccount(platform) {
    setAccountMessage(`Checking ${platformNames[platform]}…`);
    const res = await fetch('/api/socials', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ platform }) });
    const data = await res.json();
    setAccountMessage(data.message || data.error || 'Could not start connection.');
  }

  async function suggestSocialCopy(project = readyProjects.find(p => scheduleForm.projectIds.includes(p.id)) || readyProjects[0]) {
    if (!project) return setScheduleMessage('Select a ready video first.');
    const selectedPlatforms = Object.entries(scheduleForm.platforms).filter(([, enabled]) => enabled).map(([key]) => key);
    const res = await fetch('/api/captions/suggest', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idea: project.idea, title: project.title, style: project.style, generationMode: project.generation_mode, platforms: selectedPlatforms.length ? selectedPlatforms : ['instagram','tiktok'], strategy: scheduleForm.captionStrategy, hashtagStrategy: scheduleForm.hashtagStrategy }),
    });
    const data = await res.json();
    if (res.ok) setSocialPreview(data.suggestions || {});
  }

  async function createSchedule() {
    const selectedPlatforms = Object.entries(scheduleForm.platforms).filter(([, enabled]) => enabled).map(([key]) => key);
    const captionsByPlatform = Object.fromEntries(Object.entries(socialPreview).map(([key, value]) => [key, value.finalText]));
    const res = await fetch('/api/schedule', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...scheduleForm, platforms: selectedPlatforms, captionsByPlatform }),
    });
    const data = await res.json();
    if (!res.ok) setScheduleMessage(data.error || 'Could not schedule.');
    else {
      setScheduleMessage(`${data.videos} video${data.videos === 1 ? '' : 's'} scheduled with platform-specific copy.`);
      setScheduleForm(v => ({ ...v, projectIds: [], scheduledFor: '', caption: '' })); setSocialPreview({}); loadSchedule();
    }
  }

  function toggleScheduleProject(id) { setScheduleForm(v => ({ ...v, projectIds: v.projectIds.includes(id) ? v.projectIds.filter(x => x !== id) : [...v.projectIds, id] })); }
  function togglePlatform(key) { setPlatforms(v => ({ ...v, [key]: !v[key] })); }
  function toggleSchedulePlatform(key) { setScheduleForm(v => ({ ...v, platforms: { ...v.platforms, [key]: !v.platforms[key] } })); }

  function sampleForModel(modelId) { return library.find(p => p.animation_engine === modelId && p.output_urls?.preview); }
  function sampleForStyle(styleName) { return library.find(p => p.style === styleName && p.output_urls?.preview); }

  function Demo({ kind }) {
    return <div className={`v7demo ${kind}`}><span className="orb a"/><span className="orb b"/><span className="figure">{kind === 'motion' ? '↗' : kind === 'wan' ? '◉' : kind === 'cog' ? '◇' : '✦'}</span></div>;
  }

  function ModelCard({ model }) {
    const sample = sampleForModel(model.id);
    return <button className={`v7model ${animationEngine === model.id ? 'selected' : ''}`} onClick={() => setAnimationEngine(model.id)}>
      <div className="v7modelMedia">{sample ? <video src={sample.output_urls.preview} muted loop autoPlay playsInline /> : <Demo kind={model.demo}/>}<span className="v7mediaBadge">{sample ? 'Your real sample' : 'Mode preview'}</span></div>
      <div className="v7modelBody"><strong>{model.label}</strong><p>{model.desc}</p><div className="v7chips"><span>{model.speed}</span><span>{model.quality}</span><span>{model.best}</span></div></div>
    </button>;
  }

  function JobCard({ project }) {
    const isActive = activeStatuses.has(project.status);
    return <article className="v7job">
      <div className="v7jobHead"><div><strong>{project.title || project.idea}</strong><span>{modeLabel(project.generation_mode)} · {engineLabel(project.animation_engine)} · {presetLabel(project.generation_preset)}</span></div><StatusPill project={project}/></div>
      <div className="v7stage"><span>{project.status === 'queued_gpu' ? `Queue position ${project.queue_position || 1}` : `Stage: ${project.current_stage}`}</span><b>{project.progress || 0}%</b></div>
      <Progress value={project.progress || 0}/>
      <div className="v7etaGrid"><div><small>Wait</small><strong>{fmtSeconds(project.estimated_wait_seconds)}</strong></div><div><small>Remaining</small><strong>{fmtSeconds(project.estimated_remaining_seconds || project.estimated_render_seconds)}</strong></div><div><small>Finish</small><strong>{fmtDate(project.estimated_finish_at)}</strong></div></div>
      <div className="v7jobFoot"><span>{project.requested_duration}s</span><span>{project.animation_coverage || 'balanced'} animation</span>{project.batch_id && <span>Batch</span>}</div>
      <div className="v7actions">{isActive && <button className="v7stop" disabled={!!busy[project.id]} onClick={() => controlProject(project,'stop')}>{busy[project.id] === 'stop' ? 'Stopping…' : 'Stop'}</button>}<button className="v7delete" disabled={!!busy[project.id]} onClick={() => controlProject(project,'delete')}>{busy[project.id] === 'delete' ? 'Deleting…' : 'Delete'}</button></div>
    </article>;
  }

  return <main className="page"><div className="shell">
    <div className="top"><div className="brand"><h1>🎬 AI Video Factory</h1><p>Discover → Generate → Animate → Review → Schedule → Publish</p></div><div className="badge">Implementation v0.7 · ETA + Growth Engine</div></div>
    <nav className="tabs">{tabs.map(([key,label]) => <button key={key} className={tab===key?'tab active':'tab'} onClick={() => setTab(key)}>{label}{key==='queue'&&activeProjects.length?` · ${activeProjects.length}`:''}</button>)}</nav>

    {tab === 'create' && <div className="v7create">
      <section className="card v7main">
        <div className="sectionHead"><div><h2>Create video</h2><p>Choose speed, real-animation coverage and the model before spending GPU time.</p></div><div className="v7seg"><button className={!bulkMode?'on':''} onClick={()=>setBulkMode(false)}>Single</button><button className={bulkMode?'on':''} onClick={()=>setBulkMode(true)}>Bulk</button></div></div>
        {!bulkMode ? <><label>Video idea</label><textarea value={idea} onChange={e=>setIdea(e.target.value)} placeholder="A banana and a cucumber fall in love, talk, argue and get married…"/></> : <><label>Bulk ideas · {bulkCount}/12</label><textarea value={bulkIdeas} onChange={e=>setBulkIdeas(e.target.value)} placeholder={'Banana marries cucumber\nCat becomes president\nDubai wakes up under snow'}/></>}

        <div className="v7presetGrid">
          {[['fast_preview','⚡ Fast Preview','Lowest GPU time','Draft resolution, fewer AI scenes'],['balanced','◎ Balanced','Recommended','Real AI motion on key scenes'],['full_quality','✦ Full Quality','Slowest','More frames, more AI animation']].map(([id,title,badge,desc]) => <button key={id} className={`v7preset ${generationPreset===id?'selected':''}`} onClick={()=>setGenerationPreset(id)}><span>{title}</span><b>{badge}</b><small>{desc}</small></button>)}
        </div>

        <div className="row"><div><label>Video mode</label><select value={generationMode} onChange={e=>setGenerationMode(e.target.value)}><option value="faceless">Faceless / Documentary</option><option value="character_story">Character Story</option><option value="talking_characters">Talking Characters</option></select></div><div><label>Animation coverage</label><select value={animationCoverage} onChange={e=>setAnimationCoverage(e.target.value)}><option value="minimal">Minimal · 1–2 AI scenes</option><option value="balanced">Balanced · key AI scenes</option><option value="full">Full · every scene</option></select></div></div>
        <div className="row"><div><label>Duration</label><select value={duration} onChange={e=>setDuration(e.target.value)}><option>30</option><option>35</option><option>45</option><option>60</option><option>90</option></select></div><div><label>Voice</label><select value={voice} onChange={e=>setVoice(e.target.value)}><option>US Male</option><option>US Female</option><option>British Male</option><option>British Female</option></select></div></div>

        <div className="v7titleRow"><div><label>AI animation model</label><span>Click a card to select. Real samples appear automatically after you generate with that model.</span></div></div>
        <div className="v7models">{modelOptions.map(model => <ModelCard key={model.id} model={model}/>)}</div>

        <div className="v7titleRow"><div><label>Genre / visual style</label><span>Preview the creative direction before generating.</span></div></div>
        <div className="v7styles">{styleOptions.map(item => { const sample=sampleForStyle(item.id); return <button key={item.id} className={`v7style ${style===item.id?'selected':''}`} onClick={()=>setStyle(item.id)}>{sample?<video src={sample.output_urls.preview} muted loop autoPlay playsInline/>:<div className="v7styleDemo"><b>{item.icon}</b><i>{item.id}</i></div>}<strong>{item.id}</strong><span>{item.note}</span></button>; })}</div>

        <div className="row"><div><label>Quality</label><select value={quality} onChange={e=>setQuality(e.target.value)}><option>Fast Draft</option><option>Full HD</option></select></div><div><label>Caption strategy</label><select value={captionStrategy} onChange={e=>setCaptionStrategy(e.target.value)}><option value="auto">Auto by platform</option><option value="meme">Meme page</option><option value="curiosity">Curiosity</option><option value="storytelling">Storytelling</option><option value="relatable">Relatable</option><option value="emotional">Emotional</option><option value="viral">Viral hook</option></select></div></div>
        <div className="row"><div><label>Hashtag strategy</label><select value={hashtagStrategy} onChange={e=>setHashtagStrategy(e.target.value)}><option value="auto">Auto</option><option value="safe_viral">Safe viral mix</option><option value="broad">Broad reach</option><option value="niche">Niche specific</option><option value="meme">Meme / funny</option><option value="ai_content">AI content</option></select></div><div><label>Music mood</label><select value={musicMood} onChange={e=>setMusicMood(e.target.value)}><option value="uplifting">Uplifting</option><option value="cinematic">Cinematic</option><option value="mystery">Mystery</option><option value="dark">Dark</option><option value="science">Science / Tech</option></select></div></div>

        <div className="musicBox"><div className="switchRow"><div><strong>Background music</strong><span>Mixed under speech.</span></div><input type="checkbox" checked={musicEnabled} onChange={e=>setMusicEnabled(e.target.checked)}/></div>{musicEnabled&&<div><label style={{marginTop:10}}>Music level · {Math.round(musicVolume*100)}%</label><input className="range" type="range" min="0.05" max="0.28" step="0.01" value={musicVolume} onChange={e=>setMusicVolume(Number(e.target.value))}/></div>}</div>
        <div className="musicBox"><div className="switchRow"><div><strong>Proper outro</strong><span>CTA after the story.</span></div><input type="checkbox" checked={outroEnabled} onChange={e=>setOutroEnabled(e.target.checked)}/></div>{outroEnabled&&<div className="row"><div><label>CTA</label><input value={outroText} onChange={e=>setOutroText(e.target.value)}/></div><div><label>Outro</label><div className="v7inline"><select value={outroStyle} onChange={e=>setOutroStyle(e.target.value)}><option value="minimal">Minimal</option><option value="neon">Neon</option><option value="warm">Warm</option></select><select value={outroDuration} onChange={e=>setOutroDuration(Number(e.target.value))}><option value="1.5">1.5s</option><option value="2.5">2.5s</option><option value="3.5">3.5s</option><option value="5">5s</option></select></div></div></div>}</div>

        <label style={{marginTop:16}}>Platforms</label><div className="platforms"><label className="platform"><input type="checkbox" checked={platforms.reels} onChange={()=>togglePlatform('reels')}/> Instagram Reels</label><label className="platform"><input type="checkbox" checked={platforms.tiktok} onChange={()=>togglePlatform('tiktok')}/> TikTok</label><label className="platform"><input type="checkbox" checked={platforms.shorts} onChange={()=>togglePlatform('shorts')}/> YouTube Shorts</label><label className="platform"><input type="checkbox" checked={platforms.youtube} onChange={()=>togglePlatform('youtube')}/> YouTube 16:9</label></div>
        <button className="primary" disabled={loading} onClick={generate}>{loading?'Queuing…':bulkMode?`Generate ${bulkCount||''} Videos`:'Generate Video'}</button>{result&&<div className="result">{result}</div>}
      </section>

      <aside className="card v7side"><div className="status"><span className="dot"/>Free GPU pipeline online</div><h2>Estimated generation</h2>{estimate?<><div className="v7bigEta">{fmtSeconds(estimate.totalSeconds)}</div><div className="v7range">Typical range {fmtSeconds(estimate.minSeconds)} – {fmtSeconds(estimate.maxSeconds)}</div><div className="v7etaCards"><div><span>Queue</span><b>#{estimate.queuePosition}</b></div><div><span>Wait</span><b>{fmtSeconds(estimate.waitSeconds)}</b></div><div><span>Generate</span><b>{fmtSeconds(estimate.renderSeconds)}</b></div></div><div className="v7finish"><span>Estimated finish</span><strong>{fmtDate(estimate.finishAt)}</strong></div></>:<div className="empty">Calculating…</div>}<div className="v7speedTip"><b>Fastest free setup</b><span>Fast Preview + Auto Hybrid + Minimal/Balanced coverage + vertical only.</span></div><button className="secondary fullButton" onClick={()=>setTab('queue')}>Open generation queue</button></aside>
    </div>}

    {tab === 'queue' && <section className="card wideCard"><div className="sectionHead"><div><h2>Generation Queue</h2><p>Live progress, queue position, remaining time and finish estimate.</p></div><button className="secondary" onClick={()=>loadLibrary()}>Refresh</button></div>{libraryLoading&&<div className="empty">Loading…</div>}{!libraryLoading&&!activeProjects.length&&<div className="empty">Nothing is generating right now.</div>}<div className="v7queue">{activeProjects.map(p=><JobCard key={p.id} project={p}/>)}</div></section>}

    {tab === 'library' && <section className="card wideCard"><div className="sectionHead"><div><h2>Video Library</h2><p>Generated videos, status and the real settings used.</p></div><button className="secondary" onClick={()=>loadLibrary()}>Refresh</button></div>{activeProjects.length>0&&<><h3 className="v7sub">Still generating</h3><div className="v7queue">{activeProjects.map(p=><JobCard key={p.id} project={p}/>)}</div></>}<div className="libraryGrid">{completedProjects.map(p=><article className="videoCard" key={p.id}><div className="thumb">{p.output_urls?.thumbnail?<img src={p.output_urls.thumbnail} alt=""/>:<div className="thumbPlaceholder">🎬</div>}<div className="thumbBadge"><StatusPill project={p}/></div></div><div className="videoBody"><strong>{p.title||p.idea}</strong><span>{engineLabel(p.animation_engine)} · {presetLabel(p.generation_preset)} · {p.requested_duration}s</span><span>{fmtDate(p.created_at)}</span><div className="cardActions">{p.output_urls?.preview&&<button className="secondary" onClick={()=>setPreviewProject(p)}>Preview</button>}<button className="dangerGhost" onClick={()=>controlProject(p,'delete')}>Delete</button></div></div></article>)}</div></section>}

    {tab === 'trends' && <section className="card wideCard"><div className="sectionHead"><div><h2>Trending Opportunities</h2><p>Turn live search demand into content, then use platform-aware captions at scheduling.</p></div><select className="regionSelect" value={trendRegion} onChange={e=>setTrendRegion(e.target.value)}><option value="AE">UAE</option><option value="US">USA</option><option value="GB">UK</option><option value="CA">Canada</option><option value="AU">Australia</option></select></div>{trendsLoading&&<div className="empty">Finding trends…</div>}<div className="trendGrid">{trends.map((t,i)=><article className="trendCard" key={t.id||i}><div className="trendRank">{i+1}</div><div><strong>{t.topic}</strong><p>{t.suggestedHook}</p><span>{t.traffic||t.reason}</span></div><button className="secondary" onClick={()=>{setIdea(t.suggestedHook||t.topic);setBulkMode(false);setTab('create');}}>Create</button></article>)}</div></section>}

    {tab === 'accounts' && <section className="card wideCard"><div className="sectionHead"><div><h2>Social Accounts</h2><p>OAuth connection slots for publishing.</p></div></div><div className="accountGrid">{['youtube','instagram','tiktok'].map(key=>{const acc=accounts.find(x=>x.platform===key)||{status:'disconnected'};return <article className="accountCard" key={key}><div className={`socialIcon ${key}`}>{key==='youtube'?'▶':key==='instagram'?'◎':'♪'}</div><div><strong>{platformNames[key]}</strong><span>{acc.status==='connected'?acc.display_name||'Connected':'Not connected'}</span></div><button className="secondary" onClick={()=>connectAccount(key)}>{acc.status==='connected'?'Reconnect':'Connect'}</button></article>})}</div>{accountMessage&&<div className="result">{accountMessage}</div>}</section>}

    {tab === 'schedule' && <section className="card wideCard"><div className="sectionHead"><div><h2>Bulk Schedule + Viral Copy</h2><p>Generate different captions and hashtag packs for each platform before scheduling.</p></div></div><div className="v7schedule"><div><label>Select videos · {scheduleForm.projectIds.length} selected</label><div className="scheduleVideoList">{readyProjects.map(p=><label className={scheduleForm.projectIds.includes(p.id)?'scheduleVideo selected':'scheduleVideo'} key={p.id}><input type="checkbox" checked={scheduleForm.projectIds.includes(p.id)} onChange={()=>toggleScheduleProject(p.id)}/>{p.output_urls?.thumbnail?<img src={p.output_urls.thumbnail} alt=""/>:<span className="miniThumb">🎬</span>}<span><strong>{p.title||p.idea}</strong><small>{p.requested_duration}s · {modeLabel(p.generation_mode)}</small></span></label>)}</div></div><div><div className="row"><div><label>First post</label><input type="datetime-local" value={scheduleForm.scheduledFor} onChange={e=>setScheduleForm(v=>({...v,scheduledFor:e.target.value}))}/></div><div><label>Spacing</label><select value={scheduleForm.intervalMinutes} onChange={e=>setScheduleForm(v=>({...v,intervalMinutes:Number(e.target.value)}))}><option value="60">1 hour</option><option value="180">3 hours</option><option value="360">6 hours</option><option value="720">12 hours</option><option value="1440">1 day</option></select></div></div><div className="row"><div><label>Caption style</label><select value={scheduleForm.captionStrategy} onChange={e=>setScheduleForm(v=>({...v,captionStrategy:e.target.value}))}><option value="auto">Auto</option><option value="meme">Meme page</option><option value="curiosity">Curiosity</option><option value="storytelling">Storytelling</option><option value="relatable">Relatable</option><option value="emotional">Emotional</option><option value="viral">Viral hook</option></select></div><div><label>Hashtag strategy</label><select value={scheduleForm.hashtagStrategy} onChange={e=>setScheduleForm(v=>({...v,hashtagStrategy:e.target.value}))}><option value="auto">Auto</option><option value="safe_viral">Safe viral mix</option><option value="broad">Broad</option><option value="niche">Niche</option><option value="meme">Meme</option><option value="ai_content">AI content</option></select></div></div><label style={{marginTop:14}}>Post to</label><div className="platforms threePlatforms">{['youtube','instagram','tiktok'].map(key=><label className="platform" key={key}><input type="checkbox" checked={scheduleForm.platforms[key]} onChange={()=>toggleSchedulePlatform(key)}/>{platformNames[key]}</label>)}</div><button className="secondary fullButton" onClick={()=>suggestSocialCopy()}>Generate platform captions + hashtags</button><div className="v7copyGrid">{Object.entries(socialPreview).map(([key,copy])=><article key={key} className="v7copy"><strong>{platformNames[key]}</strong><p>{copy.caption}</p><div>{copy.hashtags?.join(' ')}</div><small>{copy.strategy} · {copy.niche}</small></article>)}</div><label>Manual caption override (optional)</label><textarea value={scheduleForm.caption} onChange={e=>setScheduleForm(v=>({...v,caption:e.target.value}))} placeholder="Leave blank to use generated platform-specific copy."/><button className="primary" onClick={createSchedule}>Schedule {scheduleForm.projectIds.length||''} Video{scheduleForm.projectIds.length===1?'':'s'}</button>{scheduleMessage&&<div className="result">{scheduleMessage}</div>}</div></div><h3 className="v7sub">Upcoming posts</h3>{scheduled.map(item=><div className="scheduleItem" key={item.id}><div><strong>{item.projects?.title||item.projects?.idea||'Video'}</strong><span>{platformNames[item.platform]} · {fmtDate(item.scheduled_for)}</span></div><span className="statusPill">{item.status}</span></div>)}</section>}

    {previewProject&&<div className="modalBackdrop" onClick={()=>setPreviewProject(null)}><div className="previewModal" onClick={e=>e.stopPropagation()}><div className="previewHead"><div><span className="eyebrow">VIDEO PREVIEW</span><h2>{previewProject.title||previewProject.idea}</h2></div><button className="closeBtn" onClick={()=>setPreviewProject(null)}>×</button></div><div className="playerWrap"><video src={previewProject.output_urls.preview} controls autoPlay playsInline/></div><div className="previewMeta"><span>{engineLabel(previewProject.animation_engine)}</span><span>{presetLabel(previewProject.generation_preset)}</span><span>{previewProject.animation_coverage||'balanced'} coverage</span><span>{previewProject.music_enabled?'Music on':'Music off'}</span><span>{previewProject.outro_enabled?'Outro on':'Outro off'}</span></div></div></div>}

    <style jsx>{`
      .v7create{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:22px}.v7side{position:sticky;top:18px;height:max-content}.v7seg{display:flex;background:#0b1017;border:1px solid #293241;border-radius:12px;padding:4px}.v7seg button{border:0;background:transparent;color:#8993a4;padding:8px 13px;border-radius:9px;cursor:pointer}.v7seg .on{background:#20283a;color:#fff}.v7presetGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:16px 0}.v7preset{display:flex;flex-direction:column;gap:5px;text-align:left;background:#0d1219;border:1px solid #293241;border-radius:14px;padding:14px;cursor:pointer;color:#fff}.v7preset.selected{border-color:#7669ff;box-shadow:0 0 0 2px rgba(118,105,255,.15)}.v7preset b{font-size:11px;color:#8ed8ff}.v7preset small{color:#727d8e}.v7titleRow{margin:20px 0 8px}.v7titleRow label{margin:0}.v7titleRow span{display:block;color:#707a8b;font-size:11px;margin-top:4px}.v7models{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.v7model{padding:0;overflow:hidden;text-align:left;background:#0d1219;border:1px solid #293241;border-radius:16px;color:#fff;cursor:pointer}.v7model.selected{border-color:#7669ff;box-shadow:0 0 0 2px rgba(118,105,255,.16)}.v7modelMedia{position:relative;height:125px;background:#070a0f}.v7modelMedia video{width:100%;height:100%;object-fit:cover}.v7mediaBadge{position:absolute;left:9px;top:9px;background:rgba(5,8,12,.76);border:1px solid #313a48;border-radius:999px;padding:4px 7px;font-size:9px;color:#c1c8d2}.v7modelBody{padding:12px}.v7modelBody p{font-size:11px;line-height:1.45;color:#7f8998;margin:5px 0 8px}.v7chips{display:flex;gap:5px;flex-wrap:wrap}.v7chips span{font-size:9px;border:1px solid #293241;border-radius:999px;padding:4px 6px;color:#909aaa}.v7demo{height:100%;position:relative;overflow:hidden;background:radial-gradient(circle at 25% 30%,#273d6d,#0a0d14 66%)}.v7demo.wan{background:radial-gradient(circle at 70% 20%,#5b2d7f,#11101c 65%)}.v7demo.cog{background:radial-gradient(circle at 30% 20%,#225c62,#081113 65%)}.v7demo.motion{background:linear-gradient(135deg,#172134,#080c12)}.orb{position:absolute;width:70px;height:70px;border-radius:50%;filter:blur(2px);background:rgba(105,91,255,.65);animation:v7float 3.2s ease-in-out infinite}.orb.a{left:18%;top:20%}.orb.b{right:12%;bottom:10%;width:50px;height:50px;animation-delay:-1.2s}.figure{position:absolute;inset:0;display:grid;place-items:center;font-size:34px;animation:v7pulse 2.6s ease-in-out infinite}.v7styles{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.v7style{background:#0d1219;border:1px solid #293241;border-radius:13px;padding:8px;color:#fff;text-align:left;cursor:pointer;overflow:hidden}.v7style.selected{border-color:#7669ff}.v7style video,.v7styleDemo{width:100%;height:75px;border-radius:9px;object-fit:cover;background:radial-gradient(circle at 50% 10%,#253551,#0b0e14);display:flex;flex-direction:column;align-items:center;justify-content:center}.v7styleDemo b{font-size:24px}.v7styleDemo i{font-style:normal;font-size:9px;color:#a8b1be}.v7style>strong{display:block;font-size:11px;margin-top:7px}.v7style>span{display:block;color:#737e8e;font-size:9px;margin-top:3px}.v7inline{display:grid;grid-template-columns:1fr .6fr;gap:8px}.v7bigEta{font-size:40px;font-weight:800;letter-spacing:-.04em;margin-top:4px}.v7range{color:#7f8999;font-size:11px;margin-top:3px}.v7etaCards{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:15px 0}.v7etaCards div{background:#0c1118;border:1px solid #27303d;border-radius:11px;padding:10px}.v7etaCards span,.v7finish span{display:block;color:#707b8c;font-size:10px}.v7etaCards b{display:block;margin-top:4px;font-size:13px}.v7finish{border-top:1px solid #242b38;padding-top:12px}.v7finish strong{display:block;margin-top:4px;font-size:12px}.v7speedTip{margin:16px 0;padding:12px;border:1px solid #2b3e38;background:#0c1714;border-radius:12px}.v7speedTip b{display:block;color:#8ee7be;font-size:12px}.v7speedTip span{display:block;color:#779287;font-size:10px;margin-top:4px;line-height:1.45}.v7queue{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.v7job{background:#0d1219;border:1px solid #293241;border-radius:16px;padding:15px}.v7jobHead{display:flex;justify-content:space-between;gap:10px}.v7jobHead strong{display:block;font-size:13px}.v7jobHead span:not(.v7pill){display:block;color:#727d8e;font-size:10px;margin-top:4px}.v7pill{height:max-content;border:1px solid #344052;border-radius:999px;padding:5px 8px;font-size:9px;text-transform:capitalize}.v7-ready_for_review{color:#7fe4b5;border-color:#285e48}.v7-processing{color:#8ed8ff;border-color:#2b5268}.v7stage{display:flex;justify-content:space-between;margin:14px 0 6px;color:#8d97a6;font-size:11px}.v7progress{height:6px;background:#1b2330;border-radius:999px;overflow:hidden}.v7progress span{display:block;height:100%;background:linear-gradient(90deg,#6d5efc,#19a9f6);border-radius:999px}.v7etaGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:11px}.v7etaGrid div{background:#0a0e14;border-radius:9px;padding:8px}.v7etaGrid small{display:block;color:#697484;font-size:9px}.v7etaGrid strong{display:block;font-size:10px;margin-top:3px}.v7jobFoot{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.v7jobFoot span{font-size:9px;color:#788293;border:1px solid #252e3b;border-radius:999px;padding:4px 6px}.v7actions{display:flex;gap:7px;margin-top:12px}.v7actions button{flex:1;padding:8px;border-radius:9px;cursor:pointer}.v7stop{border:1px solid #79552b;background:#241a0e;color:#f7c785}.v7delete{border:1px solid #6a3237;background:#1f1012;color:#ff9ea5}.v7sub{margin:20px 0 10px;font-size:14px}.v7schedule{display:grid;grid-template-columns:.9fr 1.1fr;gap:20px}.v7copyGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0}.v7copy{background:#0c1118;border:1px solid #293241;border-radius:12px;padding:10px}.v7copy strong{font-size:11px}.v7copy p{font-size:11px;line-height:1.45;color:#d1d6de}.v7copy div{font-size:9px;color:#7bc8ff;line-height:1.5}.v7copy small{display:block;color:#657080;margin-top:7px}.scheduleVideoList{display:grid;gap:8px;max-height:520px;overflow:auto}.scheduleVideo{display:grid;grid-template-columns:auto 54px 1fr;gap:9px;align-items:center;border:1px solid #293241;border-radius:12px;padding:8px;background:#0d1219}.scheduleVideo.selected{border-color:#7669ff}.scheduleVideo img,.miniThumb{width:54px;height:54px;border-radius:8px;object-fit:cover;background:#121a26;display:grid;place-items:center}.scheduleVideo strong{display:block;font-size:11px}.scheduleVideo small{display:block;color:#778192;margin-top:3px}.threePlatforms{grid-template-columns:repeat(3,1fr)}@keyframes v7float{50%{transform:translate(18px,-8px) scale(1.08)}}@keyframes v7pulse{50%{transform:scale(1.12);opacity:.75}}@media(max-width:1050px){.v7create,.v7schedule{grid-template-columns:1fr}.v7side{position:static}.v7models{grid-template-columns:1fr 1fr}.v7styles{grid-template-columns:repeat(2,1fr)}.v7queue{grid-template-columns:1fr}.v7copyGrid{grid-template-columns:1fr}}@media(max-width:700px){.v7presetGrid,.v7models,.v7styles,.v7etaCards,.threePlatforms{grid-template-columns:1fr}.v7etaGrid{grid-template-columns:1fr 1fr 1fr}}
    `}</style>
  </div></main>;
}
