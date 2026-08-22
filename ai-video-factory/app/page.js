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
  { label: 'Animation', key: 'animation' },
  { label: 'Captions', key: 'captions' },
  { label: 'Full-HD Render', key: 'render' },
  { label: 'Approval', key: 'approval' },
  { label: 'Publishing', key: 'publishing' },
];

const tabs = [
  ['create', 'Create'],
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

function stageState(stage, status, itemKey, index) {
  if (status === 'failed' && stage === itemKey) return 'Failed';
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

export default function Home() {
  const [activeTab, setActiveTab] = useState('create');
  const [idea, setIdea] = useState('');
  const [duration, setDuration] = useState('45');
  const [style, setStyle] = useState('Cinematic Documentary');
  const [voice, setVoice] = useState('US Male');
  const [quality, setQuality] = useState('Full HD');
  const [platforms, setPlatforms] = useState(defaultPlatforms);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [musicMood, setMusicMood] = useState('cinematic');
  const [musicVolume, setMusicVolume] = useState(0.14);
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

  const [trendRegion, setTrendRegion] = useState('AE');
  const [trends, setTrends] = useState([]);
  const [trendsLoading, setTrendsLoading] = useState(false);

  const [accounts, setAccounts] = useState([]);
  const [accountMessage, setAccountMessage] = useState('');

  const [scheduled, setScheduled] = useState([]);
  const [scheduleMessage, setScheduleMessage] = useState('');
  const [scheduleForm, setScheduleForm] = useState({
    projectId: '',
    scheduledFor: '',
    caption: '',
    platforms: { youtube: false, instagram: false, tiktok: false },
  });

  const readyProjects = useMemo(
    () => library.filter(item => item.status === 'ready_for_review' && item.output_urls?.preview),
    [library]
  );

  async function loadLibrary() {
    setLibraryLoading(true);
    try {
      const res = await fetch('/api/library', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok) setLibrary(data.projects || []);
    } finally {
      setLibraryLoading(false);
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
    if (activeTab === 'library') loadLibrary();
    if (activeTab === 'trends') loadTrends();
    if (activeTab === 'accounts') loadAccounts();
    if (activeTab === 'schedule') loadSchedule();
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
        if (data.status === 'ready_for_review') loadLibrary();
      } catch (_) {}
    }

    refreshStatus();
    const timer = setInterval(refreshStatus, 2500);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [projectId]);

  async function generate() {
    if (!idea.trim()) return setResult('Enter a video idea first.');
    setLoading(true);
    setResult('');
    setProjectId('');

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idea,
          duration: Number(duration),
          style,
          voice,
          quality,
          platforms,
          musicEnabled,
          musicMood,
          musicVolume,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setResult(data?.error || 'Could not create project.');
        return;
      }

      setProjectId(data.projectId);
      setProjectStatus({
        status: data.status,
        progress: data.progress ?? 0,
        current_stage: data.stage || 'queued',
        output_urls: {},
      });
      setResult(
        `Project ${data.projectId} created.\nStatus: ${data.status}\nStage: ${data.stage || 'queued'}\nProgress: ${data.progress ?? 0}%`
      );
    } catch (_) {
      setResult('Could not create project.');
    } finally {
      setLoading(false);
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

  async function createSchedule() {
    setScheduleMessage('');
    const selectedPlatforms = Object.entries(scheduleForm.platforms)
      .filter(([, enabled]) => enabled)
      .map(([key]) => key);

    const res = await fetch('/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: scheduleForm.projectId,
        scheduledFor: scheduleForm.scheduledFor,
        caption: scheduleForm.caption,
        platforms: selectedPlatforms,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setScheduleMessage(data.error || 'Could not schedule post.');
      return;
    }
    setScheduleMessage('Post scheduled. It will publish automatically once that platform account is connected.');
    setScheduleForm(form => ({ ...form, scheduledFor: '', caption: '' }));
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
    setActiveTab('create');
  }

  return (
    <main className="page">
      <div className="shell">
        <div className="top">
          <div className="brand">
            <h1>🎬 AI Video Factory</h1>
            <p>Discover → Create → Review → Schedule → Publish</p>
          </div>
          <div className="badge">Implementation v0.5 · Free GPU</div>
        </div>

        <nav className="tabs">
          {tabs.map(([key, label]) => (
            <button key={key} className={activeTab === key ? 'tab active' : 'tab'} onClick={() => setActiveTab(key)}>
              {label}
            </button>
          ))}
        </nav>

        {activeTab === 'create' && (
          <div className="grid">
            <section className="card">
              <h2>Create video</h2>
              <label>Video idea</label>
              <textarea value={idea} onChange={e => setIdea(e.target.value)} placeholder="What if scientists discovered advanced technology beneath the pyramids?" />

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
                    <option>Cinematic Documentary</option><option>Mystery</option><option>History</option><option>Science</option><option>Horror</option><option>Business</option><option>News Explainer</option>
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
                  <div><strong>Background music</strong><span>Automatically mixed under the voiceover.</span></div>
                  <input type="checkbox" checked={musicEnabled} onChange={e => setMusicEnabled(e.target.checked)} />
                </div>
                {musicEnabled && (
                  <div className="row musicControls">
                    <div>
                      <label>Music mood</label>
                      <select value={musicMood} onChange={e => setMusicMood(e.target.value)}>
                        <option value="cinematic">Cinematic</option>
                        <option value="mystery">Mystery</option>
                        <option value="uplifting">Uplifting</option>
                        <option value="dark">Dark</option>
                        <option value="science">Science / Tech</option>
                      </select>
                    </div>
                    <div>
                      <label>Music level · {Math.round(musicVolume * 100)}%</label>
                      <input className="range" type="range" min="0.05" max="0.28" step="0.01" value={musicVolume} onChange={e => setMusicVolume(Number(e.target.value))} />
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

              <button className="primary" disabled={loading} onClick={generate}>{loading ? 'Creating project…' : 'Generate Video'}</button>
              {result && <div className="result">{result}</div>}
            </section>

            <aside className="card">
              <div className="status"><span className="dot"></span>Free GPU pipeline online</div>
              <h2 style={{ marginTop: 18 }}>Pipeline</h2>
              <div className="steps">
                {pipeline.map((item, i) => (
                  <div className="step" key={item.key}>
                    <span>{item.label}</span>
                    <span className="value">{stageState(projectStatus.current_stage, projectStatus.status, item.key, i)}</span>
                  </div>
                ))}
              </div>
              <p className="note">Jobs are queued in Supabase and processed on the free Kaggle T4 worker. Finished videos automatically appear in Library for preview and scheduling.</p>
            </aside>
          </div>
        )}

        {activeTab === 'library' && (
          <section className="card wideCard">
            <div className="sectionHead">
              <div><h2>Video Library</h2><p>Every generated video stays here with its preview, status and publishing state.</p></div>
              <button className="secondary" onClick={loadLibrary}>Refresh</button>
            </div>
            {libraryLoading && <div className="empty">Loading library…</div>}
            {!libraryLoading && library.length === 0 && <div className="empty">No generated videos yet.</div>}
            <div className="libraryGrid">
              {library.map(project => (
                <article className="videoCard" key={project.id}>
                  <div className="thumb">
                    {project.output_urls?.thumbnail ? <img src={project.output_urls.thumbnail} alt="" /> : <div className="thumbPlaceholder">🎬</div>}
                    <span className={`statusPill ${project.status}`}>{project.status.replaceAll('_', ' ')}</span>
                  </div>
                  <div className="videoBody">
                    <h3>{project.title || project.idea}</h3>
                    <p>{project.requested_duration}s · {project.style}</p>
                    <div className="cardMeta"><span>{formatDate(project.created_at)}</span><span>{project.publish_status || 'not scheduled'}</span></div>
                    <div className="cardActions">
                      <button className="secondary" disabled={!project.output_urls?.preview} onClick={() => setPreviewProject(project)}>Preview</button>
                      <button className="ghost" onClick={() => { setScheduleForm(f => ({ ...f, projectId: project.id })); setActiveTab('schedule'); }}>Schedule</button>
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
              <div><h2>Trending Topic Finder</h2><p>Live topic discovery to help choose ideas with existing search momentum.</p></div>
              <select className="regionSelect" value={trendRegion} onChange={e => setTrendRegion(e.target.value)}>
                <option value="AE">UAE</option><option value="US">USA</option><option value="GB">UK</option><option value="CA">Canada</option><option value="AU">Australia</option>
              </select>
            </div>
            {trendsLoading && <div className="empty">Scanning live trends…</div>}
            <div className="trendGrid">
              {trends.map((trend, index) => (
                <article className="trendCard" key={trend.id}>
                  <div className="trendRank">#{index + 1}</div>
                  <div><span className="sourceTag">{trend.source}{trend.traffic ? ` · ${trend.traffic}` : ''}</span><h3>{trend.topic}</h3><p>{trend.reason}</p><div className="hook">Hook: {trend.suggestedHook}</div></div>
                  <button className="secondary" onClick={() => useTrend(trend)}>Create video</button>
                </article>
              ))}
            </div>
            {!trendsLoading && trends.length === 0 && <div className="empty">No live trends returned right now. Refresh in a few minutes.</div>}
          </section>
        )}

        {activeTab === 'accounts' && (
          <section className="card wideCard">
            <div className="sectionHead"><div><h2>Social Accounts</h2><p>Connect channels once, then approve or schedule videos without entering passwords again.</p></div></div>
            <div className="accountGrid">
              {accounts.map(account => (
                <article className="accountCard" key={account.platform}>
                  <div className={`socialIcon ${account.platform}`}>{account.platform === 'youtube' ? '▶' : account.platform === 'instagram' ? '◎' : '♪'}</div>
                  <div className="accountInfo"><h3>{platformNames[account.platform]}</h3><p>{account.status === 'connected' ? account.display_name || 'Connected' : 'Not connected'}</p></div>
                  <span className={`connection ${account.status}`}>{account.status}</span>
                  <button className="secondary" onClick={() => connectAccount(account.platform)}>{account.status === 'connected' ? 'Reconnect' : 'Connect'}</button>
                </article>
              ))}
            </div>
            {accountMessage && <div className="infoBox">{accountMessage}</div>}
            <div className="infoBox subtle">YouTube, Instagram and TikTok require their own free developer/OAuth app credentials before the Connect button can open the real authorization screen. The dashboard and database side are ready for those credentials.</div>
          </section>
        )}

        {activeTab === 'schedule' && (
          <div className="scheduleLayout">
            <section className="card">
              <h2>Schedule a video</h2>
              <label>Generated video</label>
              <select value={scheduleForm.projectId} onChange={e => setScheduleForm(f => ({ ...f, projectId: e.target.value }))}>
                <option value="">Choose a ready video</option>
                {readyProjects.map(project => <option key={project.id} value={project.id}>{project.title || project.idea}</option>)}
              </select>

              <label style={{ marginTop: 16 }}>Post to</label>
              <div className="platforms schedulePlatforms">
                {['youtube', 'instagram', 'tiktok'].map(key => (
                  <label className="platform" key={key}><input type="checkbox" checked={scheduleForm.platforms[key]} onChange={() => toggleSchedulePlatform(key)} /> {platformNames[key]}</label>
                ))}
              </div>

              <label style={{ marginTop: 16 }}>Date & time</label>
              <input className="field" type="datetime-local" value={scheduleForm.scheduledFor} onChange={e => setScheduleForm(f => ({ ...f, scheduledFor: e.target.value }))} />

              <label style={{ marginTop: 16 }}>Caption / description</label>
              <textarea className="captionField" value={scheduleForm.caption} onChange={e => setScheduleForm(f => ({ ...f, caption: e.target.value }))} placeholder="AI can generate platform-specific captions here later…" />
              <button className="primary" onClick={createSchedule}>Schedule Post</button>
              {scheduleMessage && <div className="infoBox">{scheduleMessage}</div>}
            </section>

            <section className="card">
              <div className="sectionHead"><div><h2>Upcoming</h2><p>Your publishing queue.</p></div><button className="secondary" onClick={loadSchedule}>Refresh</button></div>
              <div className="scheduleList">
                {scheduled.map(item => (
                  <div className="scheduleItem" key={item.id}>
                    <div><strong>{item.projects?.title || item.projects?.idea || 'Video'}</strong><span>{platformNames[item.platform]} · {formatDate(item.scheduled_for)}</span></div>
                    <span className={`statusPill ${item.status}`}>{item.status}</span>
                  </div>
                ))}
                {scheduled.length === 0 && <div className="empty">Nothing scheduled yet.</div>}
              </div>
            </section>
          </div>
        )}
      </div>

      {previewProject && (
        <div className="modalBackdrop" onClick={() => setPreviewProject(null)}>
          <div className="previewModal" onClick={e => e.stopPropagation()}>
            <div className="previewHead"><div><span className="eyebrow">VIDEO PREVIEW</span><h2>{previewProject.title || previewProject.idea}</h2></div><button className="closeBtn" onClick={() => setPreviewProject(null)}>×</button></div>
            <div className="playerWrap"><video src={previewProject.output_urls?.preview} controls playsInline preload="metadata" /></div>
            <div className="previewMeta"><span>{previewProject.requested_duration}s</span><span>{previewProject.quality}</span><span>{previewProject.music_enabled ? `${previewProject.music_mood} music` : 'no music'}</span><span>{previewProject.status.replaceAll('_', ' ')}</span></div>
            {previewProject.script && <details className="scriptBox"><summary>View generated script</summary><p>{previewProject.script}</p></details>}
            <div className="modalActions"><button className="secondary" onClick={() => { setScheduleForm(f => ({ ...f, projectId: previewProject.id })); setPreviewProject(null); setActiveTab('schedule'); }}>Schedule</button><a className="primaryLink" href={previewProject.output_urls?.preview} target="_blank" rel="noreferrer">Open video</a></div>
          </div>
        </div>
      )}
    </main>
  );
}
