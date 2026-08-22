import { NextResponse } from 'next/server';

function decodeXml(value = '') {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function hookFor(topic) {
  const hooks = [
    `Why is everyone suddenly searching for ${topic}?`,
    `${topic} is trending — here's what people are missing.`,
    `The real reason ${topic} is blowing up right now.`,
    `What happens next with ${topic}?`,
  ];
  let hash = 0;
  for (const char of topic) hash = (hash + char.charCodeAt(0)) % hooks.length;
  return hooks[hash];
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const requested = (searchParams.get('region') || 'AE').toUpperCase();
  const region = ['AE', 'US', 'GB', 'CA', 'AU'].includes(requested) ? requested : 'AE';

  try {
    const response = await fetch(`https://trends.google.com/trending/rss?geo=${region}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 AI Video Factory' },
      next: { revalidate: 900 },
    });

    if (!response.ok) throw new Error(`Google Trends returned ${response.status}`);
    const xml = await response.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 18);
    const trends = items.map((match, index) => {
      const block = match[1];
      const title = decodeXml((block.match(/<title>([\s\S]*?)<\/title>/) || [,''])[1]).trim();
      const traffic = decodeXml((block.match(/<ht:approx_traffic>([\s\S]*?)<\/ht:approx_traffic>/) || [,''])[1]).trim();
      const newsTitle = decodeXml((block.match(/<ht:news_item_title>([\s\S]*?)<\/ht:news_item_title>/) || [,''])[1]).trim();
      return {
        id: `${region}-${index}-${title}`,
        topic: title,
        source: 'Google Trends',
        region,
        traffic,
        reason: newsTitle || `Currently trending in ${region}`,
        suggestedHook: hookFor(title),
      };
    }).filter(item => item.topic);

    return NextResponse.json({ region, trends, updatedAt: new Date().toISOString() });
  } catch (error) {
    console.error('Trends API error:', error);
    return NextResponse.json({ region, trends: [], error: 'Live trend source is temporarily unavailable.' }, { status: 200 });
  }
}
