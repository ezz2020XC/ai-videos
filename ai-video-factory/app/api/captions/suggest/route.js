import { NextResponse } from 'next/server';
import { buildSocialCopy } from '../../../../lib/social-copy';

export async function POST(request) {
  try {
    const body = await request.json();
    const platforms = Array.isArray(body.platforms) && body.platforms.length
      ? body.platforms.filter(p => ['instagram', 'tiktok', 'youtube'].includes(p))
      : ['instagram', 'tiktok', 'youtube'];

    const suggestions = Object.fromEntries(
      platforms.map(platform => [
        platform,
        buildSocialCopy({
          ...body,
          platform,
          strategy: body.strategy || 'auto',
          hashtagStrategy: body.hashtagStrategy || 'auto',
        }),
      ])
    );

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error('Caption suggestion error:', error);
    return NextResponse.json({ error: 'Could not generate social copy.' }, { status: 500 });
  }
}
