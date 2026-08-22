'use client';

import { useState } from 'react';

const defaultPlatforms = {
  reels: true,
  tiktok: true,
  shorts: true,
  youtube: false,
};

export default function Home() {
  const [idea, setIdea] = useState('');
  const [duration, setDuration] = useState('45');
  const [style, setStyle] = useState('Cinematic Documentary');
  const [voice, setVoice] = useState('US Male');
  const [quality, setQuality] = useState('Full HD');
  const [platforms, setPlatforms] = useState(defaultPlatforms);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');

  async function generate() {
    if (!idea.trim()) return setResult('Enter a video idea first.');
    setLoading(true);
    setResult('');
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea, duration:Number(duration), style, voice, quality, platforms }),
      });
      const data = await res.json();
      setResult(`Project ${data.projectId} created.\nStatus: ${data.status}\n\nNext: connect the Python/GPU worker to this API.`);
    } catch (e) {
      setResult('Could not create project.');
    } finally { setLoading(false); }
  }

  const toggle = key => setPlatforms(p => ({...p,[key]:!p[key]}));

  return <main className="page"><div className="shell">
    <div className="top"><div className="brand"><h1>🎬 AI Video Factory</h1><p>Idea → Generate → Review → Approve → Publish</p></div><div className="badge">Implementation v0.1</div></div>
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
      </section>
      <aside className="card"><div className="status"><span className="dot"></span>Dashboard online</div><h2 style={{marginTop:18}}>Pipeline</h2><div className="steps">
        {['AI Director','Voice','Storyboard','Animation','Captions','Full-HD Render','Approval','Publishing'].map((x,i)=><div className="step" key={x}><span>{x}</span><span className="value">{i===0?'Next':'Waiting'}</span></div>)}
      </div><p className="note">This Vercel app stays lightweight and always available. Heavy AI rendering will run in a separate GPU worker, so the dashboard does not depend on Kaggle or Hugging Face Space uptime.</p></aside>
    </div>
  </div></main>
}
