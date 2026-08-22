function hash(text = '') {
  let value = 0;
  for (const ch of String(text)) value = (value * 31 + ch.charCodeAt(0)) >>> 0;
  return value;
}

function pick(list, seed, offset = 0) {
  if (!list.length) return '';
  return list[(seed + offset) % list.length];
}

function cleanTopic(value = '') {
  return String(value)
    .replace(/^what if\s+/i, '')
    .replace(/[?!.]+$/g, '')
    .trim();
}

function topicTags(topic) {
  const stop = new Set(['what','with','when','where','that','this','from','into','about','would','could','their','there','have','just','every','they','them','your']);
  return cleanTopic(topic)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stop.has(word))
    .slice(0, 4)
    .map(word => `#${word.replace(/-/g, '')}`);
}

const captionPacks = {
  meme: [
    'nah this is actually wild 😭',
    'bro what did I just watch 💀',
    'this got out of hand so fast 😭',
    'I was not ready for the ending 💀',
    'why did this actually get emotional 😭',
    'internet please explain this one 💀',
  ],
  curiosity: [
    'wait until you see what happens next 👀',
    'this gets stranger the longer you watch 👀',
    'the ending changes the whole story.',
    'you probably would not expect this outcome.',
    'watch this before you decide what you think.',
  ],
  storytelling: [
    'it started as a ridiculous idea… then everything changed.',
    'this story should not work, but somehow it does.',
    'one strange decision turned into an entire story.',
    'the first few seconds are only the beginning.',
  ],
  relatable: [
    'tell me I am not the only one who would do this 😭',
    'why is this weirdly relatable 💀',
    'we all know someone who would make this happen.',
    'tag the person who would absolutely do this.',
  ],
  emotional: [
    'I did not expect this to hit like that.',
    'somehow this became way more emotional than expected.',
    'the ending is the part that stays with you.',
    'sometimes the strangest stories feel the most human.',
  ],
  viral: [
    'do not scroll before the ending 👀',
    'this might be the weirdest thing you see today.',
    'the internet is going to have opinions about this one.',
    'watch twice because the ending happens fast.',
    'would you watch part 2?',
  ],
};

const platformBroad = {
  instagram: ['#reels', '#viralreels', '#explorepage', '#reelitfeelit'],
  tiktok: ['#fyp', '#foryou', '#viralvideo', '#tiktok'],
  youtube: ['#shorts', '#youtubeshorts', '#viralshorts'],
};

const nichePacks = {
  funny: ['#funnyvideo', '#comedy', '#weirdhumor', '#memes'],
  story: ['#storytime', '#aistory', '#shortstory', '#storytelling'],
  ai: ['#aivideo', '#aianimation', '#aistory', '#generativeai'],
  characters: ['#talkingcharacters', '#animatedstory', '#3danimation', '#characteranimation'],
  curiosity: ['#whatif', '#mindblown', '#curiosity', '#didyouknow'],
};

function inferNiche(input = {}) {
  const haystack = `${input.idea || ''} ${input.title || ''} ${input.style || ''} ${input.generationMode || input.generation_mode || ''}`.toLowerCase();
  if (/talking|character|banana|cucumber|cat|dog|animal|3d animated/.test(haystack)) return 'characters';
  if (/comedy|funny|meme|ridiculous|weird/.test(haystack)) return 'funny';
  if (/what if|science|mystery|history|documentary/.test(haystack)) return 'curiosity';
  return 'story';
}

function captionForPlatform(platform, strategy, input, seed) {
  const topic = cleanTopic(input.idea || input.title || 'this story');
  const pack = captionPacks[strategy] || captionPacks.viral;
  const base = pick(pack, seed);

  if (platform === 'tiktok') {
    const variants = [
      `${base}\n${topic ? `POV: ${topic}.` : ''}`.trim(),
      `${topic ? `${topic}… ` : ''}${base}`.trim(),
      `${base} ${topic ? `Would you watch part 2 of ${topic}?` : 'Part 2?'}`.trim(),
    ];
    return pick(variants, seed, 2);
  }

  if (platform === 'instagram') {
    const variants = [
      `${base}\n\nTag someone who needs to see this.`,
      `${base}\n\nWould you watch part 2?`,
      `${base}\n\nSave this for later 😭`,
    ];
    return pick(variants, seed, 1);
  }

  return `${topic ? `${topic}: ` : ''}${base}`.trim();
}

export function buildSocialCopy(input = {}) {
  const idea = input.idea || input.title || '';
  const seed = hash(`${idea}|${input.platform}|${input.strategy}|${input.hashtagStrategy}`);
  const platform = ['instagram','tiktok','youtube'].includes(input.platform) ? input.platform : 'instagram';
  const strategy = input.strategy === 'auto'
    ? (input.generationMode === 'talking_characters' || /comedy|funny|meme/i.test(input.style || '') ? 'meme' : 'curiosity')
    : (captionPacks[input.strategy] ? input.strategy : 'viral');

  const niche = inferNiche(input);
  const caption = captionForPlatform(platform, strategy, input, seed);

  const hashtagStrategy = input.hashtagStrategy || 'auto';
  let tags = [];
  if (hashtagStrategy !== 'niche') tags.push(...(platformBroad[platform] || []));
  if (hashtagStrategy !== 'broad') tags.push(...(nichePacks[niche] || nichePacks.story));
  if (hashtagStrategy === 'ai_content' || hashtagStrategy === 'auto') tags.push(...nichePacks.ai);
  if (hashtagStrategy === 'meme') tags.push(...nichePacks.funny);
  tags.push(...topicTags(idea));

  const uniqueTags = [...new Set(tags)].slice(0, platform === 'tiktok' ? 8 : 12);
  const alternates = [1, 2].map(offset => captionForPlatform(platform, strategy, input, seed + offset * 17));

  return {
    platform,
    strategy,
    niche,
    caption,
    alternates,
    hashtags: uniqueTags,
    finalText: `${caption}${uniqueTags.length ? `\n\n${uniqueTags.join(' ')}` : ''}`,
    note: 'Platform-aware template output. Hashtags can improve discovery but do not guarantee reach or likes.',
  };
}
