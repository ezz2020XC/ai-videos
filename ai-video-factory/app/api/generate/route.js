import { NextResponse } from 'next/server';

export async function POST(request) {
  const body = await request.json();
  if (!body?.idea?.trim()) return NextResponse.json({ error:'Idea required' }, { status:400 });
  const projectId = crypto.randomUUID().slice(0,8);
  return NextResponse.json({
    projectId,
    status:'queued',
    request: body,
    outputs: {
      reels: body.platforms?.reels ? '1080x1920' : null,
      tiktok: body.platforms?.tiktok ? '1080x1920' : null,
      shorts: body.platforms?.shorts ? '1080x1920' : null,
      youtube: body.platforms?.youtube ? '1920x1080' : null,
    }
  });
}
