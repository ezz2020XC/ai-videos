# AI Video Factory

Production dashboard for an approval-first faceless AI video pipeline.

## Architecture

- Vercel / Next.js: dashboard + lightweight API
- Python GPU worker: script, voice, storyboard, image/video generation, FFmpeg rendering
- Supabase: projects, jobs, auth, storage
- Platform APIs: YouTube, Instagram, TikTok

## Local development

```bash
npm install
npm run dev
```
