'use client';

import { useEffect, useState } from 'react';

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

function stageState(stage, status, itemKey, index) {
  if (status === 'failed') return itemKey === 'approval' ? 'Blocked' : (index === 0 ? 'Failed' : 'Waiting');
  if (status === 'published') return 'Done';
  if (status === 'ready_for_review') {
    if (itemKey === 'approval') return 'Ready';
    if (itemKey === 'publishing') return 'Waiting';
    return 'Done';
  }
  if (stage === 'queued') return index === 0 ? 'Next' : 'Waiting';

  const currentIndex = pipeline.findIndex(item => item.key === stage);
  if (currentIndex === -1) return 'Waiting';

  if (index < currentIndex) return 'Done';
  if (index === currentIndex) return 'Running';
  return 'Waiting';
}

export default function Home() {
  const [idea, setIdea] = useState('');
  const [duration, setDuration] = useState('45');
  const [style, setStyle] = useState('Cinematic Documentary');
  const [voice, setVoice] = useState('US Male');
  const [quality, setQuality] = useState('Full HD');
  const [platforms, setPlatforms] = useState(defaultPlatforms);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [projectId, setProjectId] = useState('');
  const [projectStatus, setProjectStatus] = useState({
    status: 'idle',
    progress: 0,
    current_stage: 'queued',
    output_urls: {},
  });

  useEffect(() => {
    if (!projectId) return;

    let stopped = false;

    async function refreshStatus() {
      try {
        const res = await fetch(`/api/projects/${projectId}`, { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok || stopped) return;

        setProjectStatus(data);
        const failure = data.error_message ? `\nError: ${data.error_message}` : '';
        setResult(
          `Project ${data.id}\nStatus: ${data.status}\nStage: ${data.current_stage}\nProgress: ${data.progress}%${failure}`
        );
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
    setProjectStatus({ status: 'idle', progress: 0, current_stage: 'queued', output_urls: {} });

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
        `Project ${data.projectId} created.\nStatus: waiting for free Kaggle GPU\nStage: queued\nProgress: ${data.progress ?? 0}%`
      );
    } catch (_) {
      setResult('Could not create project.');
    } finally {
      setLoading(false);
    }
  }

  const toggle = key => setPlatforms(p => ({ ...p, [key]: !p[key] }));
  const previewUrl = projectStatus?.output_urls?.preview;

  return <main className="page"><div className="shell">
    <div className="top"><div className="brand"><h1>🎬 AI Video Factory</h1><p>Idea → Generate → Review → Approve → Publish</p></div><div className="badge">Implementation v0.4 · Free GPU</div></div>
    <div className="grid">
      <section className="card"><h2>Create video</h2>
        <label>Video idea</label><textarea value={idea} onChange={e=>setIdea(e.target.value)} placeholder="What if scientists discovered advanced technology beneath the pyramids?" />
        <div className="row"><div><label>Duration</label><select value={duration} onChange={e=>setDuration(e.target.value)}><option>30</option><option>35</option><option>45</option><option>60</option><option>90</option></select></div><div><label>Style</label><select value={style} onChange={e=>setStyle(e.target.value)}><option>Cinematic Documentary</option><option>Mystery</option><option>History</option><option>Science</option><option>Horror</option><option>Business</option><option>News Explainer</option></select></div></div>
        <div className="row"><div><label>Voice</label><select value={voice} onChange={e=>setVoice(e.target.value)}><option>US Male</option><option>US Female</option><option>British Male</option><option>British Female</option></select></div><div><label>Quality</label><select value={quality} onChange={e=>setQuality(e.target.value)}><option>Fast Draft</option><option>Full HD</option></select></div></div>
        <label style={{marginTop:16}}>Platforms</label><div className="platforms">
          <label className="platform"><input type="checkbox" checked={platforms.reels} onChange={()=>toggle('reels')}/> Instagram Reels · 9:16</label>
          <label className="platform"><input type="checkbox" checked={platforms.tiktok} onChange={()=>toggle('tiktok')}/> TikTok · 9:16</label>
          <label className="platform"><input type="checkbox" checked={platforms.shorts} onChange={()=>toggle('shorts')}/> YouTube Shorts · 9:16</label>
          <label className="platform"><input type="checkbox" checked={platforms.youtube} onChange={()=>toggle('youtube')}/> YouTube · 16:9</label>
        </div>
        <button className="primary" disabled={loading} onClick={generate}>{loading?'Creating project…':'Generate Video'}</button>
        {result && <div className="result">{result}</div>}
        {previewUrl && <div className="previewCard">
          <div className="previewHead"><div><strong>{projectStatus.title || 'Generated video'}</strong><span>Real Kaggle GPU output · Ready for review</span></div><span className="readyPill">READY</span></div>
          <video className="videoPreview" src={previewUrl} controls playsInline preload="metadata" />
        </div>}
      </section>
      <aside className="card"><div className="status"><span className="dot"></span>Dashboard online</div><h2 style={{marginTop:18}}>Pipeline</h2><div className="steps">
        {pipeline.map((item,i)=><div className="step" key={item.key}><span>{item.label}</span><span className="value">{stageState(projectStatus.current_stage, projectStatus.status, item.key, i)}</span></div>)}
      </div><p className="note">Real generation now runs on Kaggle's free T4 GPU through GitHub Actions. Qwen directs the scenes, Kokoro generates voice, SDXL Turbo creates visuals, and FFmpeg renders the final platform formats. The free queue is checked automatically about every 5 minutes.</p></aside>
    </div>
  </div></main>
}
