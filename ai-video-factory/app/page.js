'use client';

import { useEffect, useMemo, useState } from 'react';

const defaultPlatforms = {
  reels: true,
  tiktok: true,
  shorts: true,
  youtube: false,
};

const pipeline = [
  { label: 'AI Director', key: 'ai_director' },
  { label: 'Voice', key: 'voice' },
  { label: 'Storyboard', key: 'storyboard' },
  { label: 'AI Animation', key: 'animation' },
  { label: 'Captions', key: 'captions' },
  { label: 'Full-HD Render', key: 'render' },
  { label: 'Approval', key: 'approval' },
  { label: 'Publishing', key: 'publishing' },
];

const tabs = [
  ['create', 'Create'],
  ['queue', 'Queue'],
  ['library', 'Library'],
  ['trends', 'Trending'],
  ['accounts', 'Social Accounts'],
  ['schedule', 'Schedule'],
];

const platformNames = {
  youtube: 'YouTube',
  instagram: 'Instagram',
  tiktok: 'TikTok',
};

const activeStatuses = new Set(['queued_gpu', 'processing', 'cancelling']);

function stageState(stage, status, itemKey, index) {
  if (status === 'failed') return stage === itemKey || stage === 'failed' ? 'Failed' : index < pipeline.findIndex(x => x.key === stage) ? 'Done' : 'Waiting';
  if (status === 'cancelled') return 'Stopped';
  if (status === 'cancelling') {
    const currentIndex = pipeline.findIndex(item => item.key === stage);
    if (index < currentIndex) return 'Done';
    if (index === currentIndex) return 'Stopping';
    return 'Waiting';
  }
  if (status === 'published') return 'Done';
  if (status === 'ready_for_review') {
    if (itemKey === 'approval') return 'Ready';
    if (itemKey === 'publishing') return 'Waiting';
    return 'Done';
  }
  if (stage === 'queued' || status === 'queued_gpu') return index === 0 ? 'Next' : 'Waiting';

  const currentIndex = pipeline.findIndex(item => item.key === stage);
  if (currentIndex === -1) return 'Waiting';
  if (index < currentIndex) return 'Done';
  if (index === currentIndex) return 'Running';
  return 'Waiting';
}

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch (_) {
    return value;
  }
}

function modeLabel(value) {
  if (value === 'talking_characters') return 'Talking Characters';
  if (value === 'character_story') return 'Character Story';
  return 'Faceless / Documentary';
}

function engineLabel(value) {
  if (value === 'wan_vace') return 'Wan VACE · Real AI Video';
  if (value === 'cogvideox') return 'CogVideoX · Real AI Video';
  if (value === 'motion') return 'Motion Only · Fast';
  return 'Auto · Hybrid';
}

function StatusPill({ project }) {
  const label = project.status === 'queued_gpu'
    ? 'Queued'
    : project.status === 'ready_for_review'
      ? 'Ready'
      : project.status === 'cancelling'
        ? 'Stopping'
        : project.status === 'cancelled'
          ? 'Stopped'
          : project.status;
  return <span className={`pill status-${project.status}`}>{label}</span>;
}

function ProgressBar({ value = 0 }) {
  return (
    <div className="progressTrack" aria-label={`Progress ${value}%`}>
      <div className="progressFill" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export default function Home() {
  const [activeTab, setActiveTab] = useState('create');
  const [bulkMode, setBulkMode] = useState(false);
  const [idea, setIdea] = useState('');
  const [bulkIdeas, setBulkIdeas] = useState('');
  const [duration, setDuration] = useState('45');
  const [style, setStyle] = useState('Cinematic Documentary');
  const [voice, setVoice] = useState('US Male');
  const [quality, setQuality] = useState('Full HD');
  const [generationMode, setGenerationMode] = useState('faceless');
  const [animationEngine, setAnimationEngine] = useState('wan_vace');
  const [platforms, setPlatforms] = useState(defaultPlatforms);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [musicMood, setMusicMood] = useState('cinematic');
  const [musicVolume, setMusicVolume] = useState(0.14);
  const [outroEnabled, setOutroEnabled] = useState(true);
  const [outroText, setOutroText] = useState('Follow for more');
  const [outroDuration, setOutroDuration] = useState(2.5);
  const [outroStyle, setOutroStyle] = useState('minimal');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [projectId, setProjectId] = useState('');
  const [projectStatus, setProjectStatus] = useState({
    status: 'idle',
    progress: 0,
    current_stage: 'queued',
    output_urls: {},
  });

  const [library, setLibrary] = useState([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [previewProject, setPreviewProject] = useState(null);
  const [controlBusy, setControlBusy] = useState({});

  const [trendRegion, setTrendRegion] = useState('AE');
  const [trends, setTrends] = useState([]);
  const [trendsLoading, setTrendsLoading] = useState(false);

  const [accounts, setAccounts] = useState([]);
  const [accountMessage, setAccountMessage] = useState('');

  const [scheduled, setScheduled] = useState([]);
  const [scheduleMessage, setScheduleMessage] = useState('');
  const [scheduleForm, setScheduleForm] = useState({
    projectIds: [],
    scheduledFor: '',
    intervalMinutes: 180,
    caption: '',
    platforms: { youtube: false, instagram: false, tiktok: false },
  });

  const activeProjects = useMemo(
    () => library.filter(project => activeStatuses.has(project.status)),
    [library]
  );
  const completedProjects = useMemo(
    () => library.filter(project => !activeStatuses.has(project.status)),
    [library]
  );
  const readyProjects = useMemo(
    () => library.filter(item => item.status === 'ready_for_review' && item.output_urls?.preview),
    [library]
  );
  const bulkCount = useMemo(
    () => [...new Set(bulkIdeas.split(/\r?\n/).map(x => x.trim()).filter(Boolean))].length,
    [bulkIdeas]
  );

  async function loadLibrary(silent = false) {
    if (!silent) setLibraryLoading(true);
    try {
      const res = await fetch('/api/library', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok) setLibrary(data.projects || []);
    } finally {
      if (!silent) setLibraryLoading(false);
    }
  }

  async function loadTrends(region = trendRegion) {
    setTrendsLoading(true);
    try {
      const res = await fetch(`/api/trends?region=${region}`, { cache: 'no-store' });
      const data = await res.json();
      setTrends(data.trends || []);
    } finally {
      setTrendsLoading(false);
    }
  }

  async function loadAccounts() {
    const res = await fetch('/api/socials', { cache: 'no-store' });
    const data = await res.json();
    if (res.ok) setAccounts(data.accounts || []);
  }

  async function loadSchedule() {
    await loadLibrary();
    const res = await fetch('/api/schedule', { cache: 'no-store' });
    const data = await res.json();
    if (res.ok) setScheduled(data.scheduled || []);
  }

  useEffect(() => {
    if (activeTab === 'queue' || activeTab === 'library') loadLibrary();
    if (activeTab === 'trends') loadTrends();
    if (activeTab === 'accounts') loadAccounts();
    if (activeTab === 'schedule') loadSchedule();
  }, [activeTab]);

  useEffect(() => {
    if (!['queue', 'library'].includes(activeTab)) return;
    const timer = setInterval(() => loadLibrary(true), 3000);
    return () => clearInterval(timer);
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'trends') loadTrends(trendRegion);
  }, [trendRegion]);

  useEffect(() => {
    if (!projectId) return;
    let stopped = false;

    async function refreshStatus() {
      try {
        const res = await fetch(`/api/projects/${projectId}`, { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok || stopped) return;

        setProjectStatus(data);
        setResult(
          `Project ${data.id}\nStatus: ${data.status}\nStage: ${data.current_stage}\nProgress: ${data.progress}%`
        );
        if (['ready_for_review', 'cancelled', 'failed'].includes(data.status)) loadLibrary(true);
      } catch (_) {}
    }

    refreshStatus();
    const timer = setInterval(refreshStatus, 2500);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [projectId]);

  function commonGenerationBody() {
    return {
      duration: Number(duration),
      style,
      voice,
      quality,
      generationMode,
      animationEngine,
      platforms,
      musicEnabled,
      musicMood,
      musicVolume,
      outroEnabled,
      outroText,
      outroDuration,
      outroStyle,
    };
  }

  async function generate() {
    if (bulkMode) return generateBulk();
    if (!idea.trim()) return setResult('Enter a video idea first.');
    setLoading(true);
    setResult('');
    setProjectId('');

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea, ...commonGenerationBody() }),
      });
      const data = await res.json();
      if (!res.ok) return setResult(data?.error || 'Could not create project.');

      setProjectId(data.projectId);
      setProjectStatus({
        status: data.status,
        progress: data.progress ?? 0,
        current_stage: data.stage || 'queued',
        output_urls: {},
      });
      setResult(`Project ${data.projectId} created.\nQueued for real AI animation.`);
      loadLibrary(true);
    } catch (_) {
      setResult('Could not create project.');
    } finally {
      setLoading(false);
    }
  }

  async function generateBulk() {
    const ideas = [...new Set(bulkIdeas.split(/\r?\n/).map(x => x.trim()).filter(Boolean))];
    if (ideas.length < 2) return setResult('Add at least two ideas, one per line.');
    setLoading(true);
    setResult('');
    setProjectId('');
    try {
      const res = await fetch('/api/generate/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ideas, ...commonGenerationBody() }),
      });
      const data = await res.json();
      if (!res.ok) return setResult(data?.error || 'Could not create generation batch.');
      setResult(`Batch ${data.batchId}\n${data.count} videos queued.\nThey will generate one-by-one on the free GPU queue.`);
      loadLibrary(true);
      setActiveTab('queue');
    } catch (_) {
      setResult('Could not create generation batch.');
    } finally {
      setLoading(false);
    }
  }

  async function controlProject(project, action) {
    if (action === 'delete' && !window.confirm(`Delete “${project.title || project.idea}”?`)) return;
    setControlBusy(state => ({ ...state, [project.id]: action }));
    try {
      const res = await fetch(`/api/projects/${project.id}/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) window.alert(data.error || 'Could not update project.');
      if (data.deleted && previewProject?.id === project.id) setPreviewProject(null);
      await loadLibrary(true);
    } finally {
      setControlBusy(state => ({ ...state, [project.id]: null }));
    }
  }

  async function connectAccount(platform) {
    setAccountMessage(`Checking ${platformNames[platform]} setup…`);
    const res = await fetch('/api/socials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform }),
    });
    const data = await res.json();
    setAccountMessage(data.message || data.error || 'Could not start account connection.');
  }

  function toggleScheduleProject(projectId) {
    setScheduleForm(form => ({
      ...form,
      projectIds: form.projectIds.includes(projectId)
        ? form.projectIds.filter(id => id !== projectId)
        : [...form.projectIds, projectId],
    }));
  }

  async function createSchedule() {
    setScheduleMessage('');
    const selectedPlatforms = Object.entries(scheduleForm.platforms)
      .filter(([, enabled]) => enabled)
      .map(([key]) => key);

    const res = await fetch('/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectIds: scheduleForm.projectIds,
        scheduledFor: scheduleForm.scheduledFor,
        intervalMinutes: Number(scheduleForm.intervalMinutes || 0),
        caption: scheduleForm.caption,
        platforms: selectedPlatforms,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setScheduleMessage(data.error || 'Could not schedule posts.');
      return;
    }
    setScheduleMessage(`${data.videos} video${data.videos === 1 ? '' : 's'} scheduled across ${selectedPlatforms.length} platform${selectedPlatforms.length === 1 ? '' : 's'}.`);
    setScheduleForm(form => ({ ...form, projectIds: [], scheduledFor: '', caption: '' }));
    loadSchedule();
  }

  const togglePlatform = key => setPlatforms(p => ({ ...p, [key]: !p[key] }));
  const toggleSchedulePlatform = key => setScheduleForm(form => ({
    ...form,
    platforms: { ...form.platforms, [key]: !form.platforms[key] },
  }));

  function useTrend(trend) {
    setIdea(trend.suggestedHook || trend.topic);
    setStyle('News Explainer');
    setBulkMode(false);
    setActiveTab('create');
  }

  function addTrendToBulk(trend) {
    setBulkIdeas(current => `${current}${current.trim() ? '\n' : ''}${trend.suggestedHook || trend.topic}`);
    setBulkMode(true);
    setActiveTab('create');
  }

  function JobCard({ project }) {
    const busy = controlBusy[project.id];
    return (
      <article className="jobCard">
        <div className="jobTop">
          <div className="jobTitleWrap">
            <strong>{project.title || project.idea}</strong>
            <span>{modeLabel(project.generation_mode)} · {engineLabel(project.animation_engine)}</span>
          </div>
          <StatusPill project={project} />
        </div>
        <div className="jobStage">
          <span>{project.status === 'queued_gpu' ? 'Waiting for free GPU' : project.status === 'cancelling' ? 'Stopping at safe checkpoint' : `Stage: ${project.current_stage}`}</span>
          <b>{project.progress || 0}%</b>
        </div>
        <ProgressBar value={project.progress || 0} />
        <div className="jobMeta">
          <span>{project.requested_duration}s</span>
          <span>{project.quality}</span>
          {project.batch_id && <span>Batch</span>}
          <span>{formatDate(project.updated_at || project.created_at)}</span>
        </div>
        {project.error_message && <div className="errorText">{project.error_message}</div>}
        <div className="jobActions">
          {activeStatuses.has(project.status) && (
            <button className="dangerSoft" disabled={Boolean(busy)} onClick={() => controlProject(project, 'stop')}>
              {busy === 'stop' ? 'Stopping…' : 'Stop'}
            </button>
          )}
          <button className="dangerGhost" disabled={Boolean(busy)} onClick={() => controlProject(project, 'delete')}>
            {busy === 'delete' ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </article>
    );
  }

  return (
    <main className="page">
      <div className="shell">
        <div className="top">
          <div className="brand">
            <h1>🎬 AI Video Factory</h1>
            <p>Discover → Generate → Animate → Review → Schedule → Publish</p>
          </div>
          <div className="badge">Implementation v0.6 · AI Animation</div>
        </div>

        <nav className="tabs">
          {tabs.map(([key, label]) => (
            <button key={key} className={activeTab === key ? 'tab active' : 'tab'} onClick={() => setActiveTab(key)}>
              {label}{key === 'queue' && activeProjects.length > 0 ? ` · ${activeProjects.length}` : ''}
            </button>
          ))}
        </nav>

        {activeTab === 'create' && (
          <div className="grid">
            <section className="card">
              <div className="sectionHead compactHead">
                <div><h2>Create video</h2><p>Real generated motion is available for every scene, including talking character stories.</p></div>
                <div className="segmented">
                  <button className={!bulkMode ? 'segment active' : 'segment'} onClick={() => setBulkMode(false)}>Single</button>
                  <button className={bulkMode ? 'segment active' : 'segment'} onClick={() => setBulkMode(true)}>Bulk</button>
                </div>
              </div>

              {!bulkMode ? (
                <>
                  <label>Video idea</label>
                  <textarea value={idea} onChange={e => setIdea(e.target.value)} placeholder="A banana and a cucumber fall in love and get married…" />
                </>
              ) : (
                <>
                  <label>Bulk ideas · one per line · {bulkCount}/12</label>
                  <textarea className="bulkTextarea" value={bulkIdeas} onChange={e => setBulkIdeas(e.target.value)} placeholder={'A banana marries a cucumber\nWhat if Dubai had snow every day?\nA cat becomes president for one day'} />
                  <p className="helper">Bulk jobs share the settings below and queue sequentially to protect your free Kaggle GPU quota.</p>
                </>
              )}

              <div className="row">
                <div>
                  <label>Video mode</label>
                  <select value={generationMode} onChange={e => setGenerationMode(e.target.value)}>
                    <option value="faceless">Faceless / Documentary</option>
                    <option value="character_story">Character Story</option>
                    <option value="talking_characters">Talking Characters</option>
                  </select>
                </div>
                <div>
                  <label>Animation</label>
                  <select value={animationEngine} onChange={e => setAnimationEngine(e.target.value)}>
                    <option value="wan_vace">Wan VACE · Real AI Video</option>
                    <option value="cogvideox">CogVideoX · Real AI Video</option>
                    <option value="auto">Auto · Hybrid</option>
                    <option value="motion">Motion Only · Fast</option>
                  </select>
                </div>
              </div>

              {generationMode === 'talking_characters' && (
                <div className="featureNotice">
                  <strong>Talking Characters mode</strong>
                  <span>The director creates recurring characters, dialogue, multiple Kokoro voices, expressive mouth/face/body motion and reaction shots. Exact phoneme lip-sync is a later enhancement; this mode already generates real temporal character animation rather than static pan/zoom.</span>
                </div>
              )}

              <div className="row">
                <div>
                  <label>Duration</label>
                  <select value={duration} onChange={e => setDuration(e.target.value)}>
                    <option>30</option><option>35</option><option>45</option><option>60</option><option>90</option>
                  </select>
                </div>
                <div>
                  <label>Style</label>
                  <select value={style} onChange={e => setStyle(e.target.value)}>
                    <option>Cinematic Documentary</option><option>3D Animated</option><option>Comedy</option><option>Mystery</option><option>History</option><option>Science</option><option>Horror</option><option>Business</option><option>News Explainer</option>
                  </select>
                </div>
              </div>

              <div className="row">
                <div>
                  <label>Voice</label>
                  <select value={voice} onChange={e => setVoice(e.target.value)}>
                    <option>US Male</option><option>US Female</option><option>British Male</option><option>British Female</option>
                  </select>
                </div>
                <div>
                  <label>Quality</label>
                  <select value={quality} onChange={e => setQuality(e.target.value)}>
                    <option>Fast Draft</option><option>Full HD</option>
                  </select>
                </div>
              </div>

              <div className="musicBox">
                <div className="switchRow">
                  <div><strong>Background music</strong><span>Copyright-safe music bed mixed under speech.</span></div>
                  <input type="checkbox" checked={musicEnabled} onChange={e => setMusicEnabled(e.target.checked)} />
                </div>
                {musicEnabled && (
                  <div className="row musicControls">
                    <div>
                      <label>Music mood</label>
                      <select value={musicMood} onChange={e => setMusicMood(e.target.value)}>
                        <option value="cinematic">Cinematic</option><option value="mystery">Mystery</option><option value="uplifting">Uplifting</option><option value="dark">Dark</option><option value="science">Science / Tech</option>
                      </select>
                    </div>
                    <div>
                      <label>Music level · {Math.round(musicVolume * 100)}%</label>
                      <input className="range" type="range" min="0.05" max="0.28" step="0.01" value={musicVolume} onChange={e => setMusicVolume(Number(e.target.value))} />
                    </div>
                  </div>
                )}
              </div>

              <div className="musicBox outroBox">
                <div className="switchRow">
                  <div><strong>Proper outro</strong><span>Appended after the story, before music finalization.</span></div>
                  <input type="checkbox" checked={outroEnabled} onChange={e => setOutroEnabled(e.target.checked)} />
                </div>
                {outroEnabled && (
                  <div className="row tripleRow">
                    <div>
                      <label>Outro CTA</label>
                      <input value={outroText} onChange={e => setOutroText(e.target.value)} placeholder="Follow for more" />
                    </div>
                    <div>
                      <label>Style</label>
                      <select value={outroStyle} onChange={e => setOutroStyle(e.target.value)}>
                        <option value="minimal">Minimal</option><option value="neon">Neon</option><option value="warm">Warm</option>
                      </select>
                    </div>
                    <div>
                      <label>Duration</label>
                      <select value={outroDuration} onChange={e => setOutroDuration(Number(e.target.value))}>
                        <option value="1.5">1.5 sec</option><option value="2.5">2.5 sec</option><option value="3.5">3.5 sec</option><option value="5">5 sec</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <label style={{ marginTop: 16 }}>Platforms</label>
              <div className="platforms">
                <label className="platform"><input type="checkbox" checked={platforms.reels} onChange={() => togglePlatform('reels')} /> Instagram Reels · 9:16</label>
                <label className="platform"><input type="checkbox" checked={platforms.tiktok} onChange={() => togglePlatform('tiktok')} /> TikTok · 9:16</label>
                <label className="platform"><input type="checkbox" checked={platforms.shorts} onChange={() => togglePlatform('shorts')} /> YouTube Shorts · 9:16</label>
                <label className="platform"><input type="checkbox" checked={platforms.youtube} onChange={() => togglePlatform('youtube')} /> YouTube · 16:9</label>
              </div>

              <button className="primary" disabled={loading} onClick={generate}>
                {loading ? 'Queuing…' : bulkMode ? `Generate ${bulkCount || ''} Videos` : 'Generate Video'}
              </button>
              {result && <div className="result">{result}</div>}
            </section>

            <aside className="card stickyCard">
              <div className="status"><span className="dot"></span>Free GPU pipeline online</div>
              <h2 style={{ marginTop: 18 }}>Current pipeline</h2>
              <div className="steps">
                {pipeline.map((item, i) => (
                  <div className="step" key={item.key}>
                    <span>{item.label}</span>
                    <span className="value">{stageState(projectStatus.current_stage, projectStatus.status, item.key, i)}</span>
                  </div>
                ))}
              </div>
              {projectId && <div className="miniProgress"><ProgressBar value={projectStatus.progress || 0} /><span>{projectStatus.progress || 0}%</span></div>}
              <p className="note">Real AI animation uses the free Kaggle T4 queue. Talking-character and all-scene AI animation modes take longer but produce actual temporal motion instead of moving a still image.</p>
              <button className="secondary fullButton" onClick={() => setActiveTab('queue')}>Open generation queue</button>
            </aside>
          </div>
        )}

        {activeTab === 'queue' && (
          <section className="card wideCard">
            <div className="sectionHead">
              <div><h2>Generation Queue</h2><p>See exactly what is waiting, directing, voicing, storyboarding, animating or rendering.</p></div>
              <button className="secondary" onClick={() => loadLibrary()}>Refresh</button>
            </div>
            {libraryLoading && <div className="empty">Loading queue…</div>}
            {!libraryLoading && activeProjects.length === 0 && <div className="empty">Nothing is generating right now.</div>}
            <div className="queueGrid">
              {activeProjects.map(project => <JobCard key={project.id} project={project} />)}
            </div>
          </section>
        )}

        {activeTab === 'library' && (
          <section className="card wideCard">
            <div className="sectionHead">
              <div><h2>Video Library</h2><p>Finished, stopped and failed jobs stay visible here until you delete them.</p></div>
              <button className="secondary" onClick={() => loadLibrary()}>Refresh</button>
            </div>
            {libraryLoading && <div className="empty">Loading library…</div>}
            {!libraryLoading && library.length === 0 && <div className="empty">No videos yet.</div>}

            {activeProjects.length > 0 && (
              <div className="libraryActiveBlock">
                <div className="subHead"><strong>Still generating</strong><span>{activeProjects.length} active</span></div>
                <div className="queueGrid compactQueue">{activeProjects.map(project => <JobCard key={project.id} project={project} />)}</div>
              </div>
            )}

            <div className="libraryGrid">
              {completedProjects.map(project => (
                <article className="videoCard" key={project.id}>
                  <div className="thumb">
                    {project.output_urls?.thumbnail ? <img src={project.output_urls.thumbnail} alt="" /> : <div className="thumbPlaceholder">🎬</div>}
                    <div className="thumbBadge"><StatusPill project={project} /></div>
                  </div>
                  <div className="videoBody">
                    <strong>{project.title || project.idea}</strong>
                    <span>{modeLabel(project.generation_mode)} · {project.requested_duration}s</span>
                    <span>{formatDate(project.created_at)}</span>
                    {project.error_message && <span className="errorText">{project.error_message}</span>}
                    <div className="cardActions">
                      {project.output_urls?.preview && <button className="secondary" onClick={() => setPreviewProject(project)}>Preview</button>}
                      <button className="dangerGhost" disabled={Boolean(controlBusy[project.id])} onClick={() => controlProject(project, 'delete')}>Delete</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {activeTab === 'trends' && (
          <section className="card wideCard">
            <div className="sectionHead">
              <div><h2>Trending Opportunities</h2><p>Live search demand you can turn into videos before the topic cools down.</p></div>
              <select className="regionSelect" value={trendRegion} onChange={e => setTrendRegion(e.target.value)}>
                <option value="AE">UAE</option><option value="US">USA</option><option value="GB">UK</option><option value="CA">Canada</option><option value="AU">Australia</option>
              </select>
            </div>
            {trendsLoading && <div className="empty">Finding live trends…</div>}
            <div className="trendGrid">
              {trends.map((trend, index) => (
                <article className="trendCard" key={trend.id || `${trend.topic}-${index}`}>
                  <div className="trendNumber">{String(index + 1).padStart(2, '0')}</div>
                  <div className="trendBody">
                    <strong>{trend.topic}</strong>
                    <span>{trend.traffic || trend.reason || 'Trending now'}</span>
                    <p>{trend.suggestedHook}</p>
                  </div>
                  <div className="trendActions">
                    <button className="secondary" onClick={() => useTrend(trend)}>Create</button>
                    <button className="ghostButton" onClick={() => addTrendToBulk(trend)}>+ Bulk</button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {activeTab === 'accounts' && (
          <section className="card wideCard">
            <div className="sectionHead"><div><h2>Social Accounts</h2><p>Link accounts with OAuth so approved or scheduled videos can publish without sharing passwords.</p></div></div>
            <div className="accountGrid">
              {['youtube', 'instagram', 'tiktok'].map(platform => {
                const account = accounts.find(item => item.platform === platform) || { status: 'disconnected' };
                return (
                  <article className="accountCard" key={platform}>
                    <div className={`socialIcon ${platform}`}>{platform === 'youtube' ? '▶' : platform === 'instagram' ? '◎' : '♪'}</div>
                    <div><strong>{platformNames[platform]}</strong><span>{account.status === 'connected' ? account.display_name || 'Connected' : 'Not connected'}</span></div>
                    <button className="secondary" onClick={() => connectAccount(platform)}>{account.status === 'connected' ? 'Reconnect' : 'Connect'}</button>
                  </article>
                );
              })}
            </div>
            {accountMessage && <div className="result">{accountMessage}</div>}
          </section>
        )}

        {activeTab === 'schedule' && (
          <section className="card wideCard">
            <div className="sectionHead"><div><h2>Bulk Schedule</h2><p>Select one or many ready videos, pick a start time and automatically space each video out.</p></div></div>

            <div className="scheduleBuilder">
              <div className="scheduleVideos">
                <label>Select videos · {scheduleForm.projectIds.length} selected</label>
                {readyProjects.length === 0 && <div className="empty smallEmpty">No ready videos yet.</div>}
                <div className="scheduleVideoList">
                  {readyProjects.map(project => (
                    <label className={scheduleForm.projectIds.includes(project.id) ? 'scheduleVideo selected' : 'scheduleVideo'} key={project.id}>
                      <input type="checkbox" checked={scheduleForm.projectIds.includes(project.id)} onChange={() => toggleScheduleProject(project.id)} />
                      {project.output_urls?.thumbnail ? <img src={project.output_urls.thumbnail} alt="" /> : <span className="miniThumb">🎬</span>}
                      <span><strong>{project.title || project.idea}</strong><small>{project.requested_duration}s · {modeLabel(project.generation_mode)}</small></span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="scheduleControls">
                <div className="row">
                  <div><label>First post time</label><input type="datetime-local" value={scheduleForm.scheduledFor} onChange={e => setScheduleForm(form => ({ ...form, scheduledFor: e.target.value }))} /></div>
                  <div><label>Spacing between videos</label><select value={scheduleForm.intervalMinutes} onChange={e => setScheduleForm(form => ({ ...form, intervalMinutes: Number(e.target.value) }))}><option value="0">Same time</option><option value="60">1 hour</option><option value="180">3 hours</option><option value="360">6 hours</option><option value="720">12 hours</option><option value="1440">1 day</option></select></div>
                </div>
                <label style={{ marginTop: 14 }}>Caption / description</label><textarea className="captionArea" value={scheduleForm.caption} onChange={e => setScheduleForm(form => ({ ...form, caption: e.target.value }))} placeholder="Optional caption. Platform-specific AI captions can be added later." />
                <label style={{ marginTop: 14 }}>Post to</label>
                <div className="platforms threePlatforms">
                  {['youtube', 'instagram', 'tiktok'].map(key => <label className="platform" key={key}><input type="checkbox" checked={scheduleForm.platforms[key]} onChange={() => toggleSchedulePlatform(key)} /> {platformNames[key]}</label>)}
                </div>
                <button className="primary" onClick={createSchedule}>Schedule {scheduleForm.projectIds.length || ''} Video{scheduleForm.projectIds.length === 1 ? '' : 's'}</button>
                {scheduleMessage && <div className="result">{scheduleMessage}</div>}
              </div>
            </div>

            <div className="scheduleList">
              <div className="subHead"><strong>Upcoming posts</strong><span>{scheduled.length}</span></div>
              {scheduled.length === 0 && <div className="empty smallEmpty">Nothing scheduled yet.</div>}
              {scheduled.map(item => (
                <div className="scheduleRow" key={item.id}>
                  <div><strong>{item.projects?.title || item.projects?.idea || 'Video'}</strong><span>{platformNames[item.platform] || item.platform}</span></div>
                  <div><strong>{formatDate(item.scheduled_for)}</strong><span>{item.status}</span></div>
                </div>
              ))}
            </div>
          </section>
        )}

        {previewProject && (
          <div className="modalBackdrop" onClick={() => setPreviewProject(null)}>
            <div className="previewModal" onClick={e => e.stopPropagation()}>
              <div className="previewModalHead">
                <div><strong>{previewProject.title || previewProject.idea}</strong><span>{modeLabel(previewProject.generation_mode)} · {previewProject.requested_duration}s + outro</span></div>
                <button className="closeButton" onClick={() => setPreviewProject(null)}>×</button>
              </div>
              <video className="modalVideo" src={previewProject.output_urls?.preview} controls autoPlay playsInline />
              <div className="previewInfo">
                <span>Music: {previewProject.music_enabled ? previewProject.music_mood || 'On' : 'Off'}</span>
                <span>Animation: {engineLabel(previewProject.animation_engine)}</span>
                <span>Outro: {previewProject.outro_enabled ? previewProject.outro_text || 'Enabled' : 'Off'}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
