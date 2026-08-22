import { NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

export async function GET() {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/social_accounts?select=id,platform,display_name,external_account_id,status,token_expires_at,metadata,created_at,updated_at&order=platform.asc`,
      {
        headers: {
          apikey: SUPABASE_SECRET_KEY,
          Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
        },
        cache: 'no-store',
      }
    );
    const rows = await res.json();
    if (!res.ok) return NextResponse.json({ error: 'Could not load accounts' }, { status: 500 });

    const byPlatform = Object.fromEntries(rows.map(row => [row.platform, row]));
    return NextResponse.json({
      accounts: ['youtube', 'instagram', 'tiktok'].map(platform => byPlatform[platform] || {
        platform,
        status: 'disconnected',
        display_name: null,
      }),
    });
  } catch (error) {
    console.error('Social accounts API error:', error);
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { platform } = await request.json();
    const config = {
      youtube: {
        configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
        needs: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
      },
      instagram: {
        configured: Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET),
        needs: ['META_APP_ID', 'META_APP_SECRET'],
      },
      tiktok: {
        configured: Boolean(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET),
        needs: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
      },
    };

    if (!config[platform]) {
      return NextResponse.json({ error: 'Unsupported platform' }, { status: 400 });
    }

    if (!config[platform].configured) {
      return NextResponse.json({
        status: 'setup_required',
        platform,
        message: `${platform} OAuth app credentials must be added before account linking can start.`,
        requiredEnvironmentVariables: config[platform].needs,
      });
    }

    return NextResponse.json({
      status: 'oauth_ready',
      platform,
      message: 'OAuth credentials are configured. Callback exchange is the next publishing step.',
    });
  } catch (error) {
    console.error('Social connection API error:', error);
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 });
  }
}
