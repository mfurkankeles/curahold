// The crawler policy: which robots may read which Curahold surface. This is the
// ONE list to maintain — the sales site's robots.txt (scripts/build-site.ts), the
// app/docs host's robots.txt (answered by the API, api/src/lib/botGuard.ts), the
// portal's and the demo's, and the request-time refusal of known crawlers on the
// app and the API all read it. tests/crawlers.test.ts checks every surface.
//
// Search engines may index the marketing pages and the documentation. AI
// training and AI answer crawlers may read nothing. The product itself (app,
// portal, demo, onboarding hub, API) is closed to every robot: `Disallow: /`,
// `X-Robots-Tag: noindex, nofollow` and a `noai, noimageai` meta.
//
// Honest limits: robots.txt, the TDM reservation and the meta tags are requests
// that well-behaved robots follow. A script driving a real browser, or a robot
// that lies about its name, is not stopped by them; the signed-in product, the
// per-person and per-company limits, and the terms of service are what stand
// in that case.

/** AI training, AI search/answer and AI "fetch for a user" robots, by the name each sends (2026-11). */
export const AI_CRAWLERS = [
  // OpenAI
  'GPTBot',
  'ChatGPT-User',
  'OAI-SearchBot',
  // Anthropic
  'ClaudeBot',
  'Claude-User',
  'Claude-SearchBot',
  'Claude-Web',
  'anthropic-ai',
  // Google's AI training switch (Googlebot itself stays allowed) and its other crawlers
  'Google-Extended',
  'GoogleOther',
  'Google-CloudVertexBot',
  // Apple's AI training switch (Applebot for search stays allowed)
  'Applebot-Extended',
  // Others
  'CCBot',
  'PerplexityBot',
  'Perplexity-User',
  'Bytespider',
  'TikTokSpider',
  'Amazonbot',
  'meta-externalagent',
  'meta-externalfetcher',
  'FacebookBot',
  'cohere-ai',
  'cohere-training-data-crawler',
  'MistralAI-User',
  'DuckAssistBot',
  'YouBot',
  'AI2Bot',
  'Ai2Bot-Dolma',
  'Diffbot',
  'Omgilibot',
  'omgili',
  'ImagesiftBot',
  'PanguBot',
  'Timpibot',
  'Kangaroo Bot',
  'Webzio-Extended',
  'VelenPublicWebCrawler',
  'ICC-Crawler',
  'iaskspider',
  'img2dataset',
  'Scrapy',
] as const;

/** Data harvesters and site-analysis robots (they map a site's pages and features for others). */
export const SCRAPERS = ['AhrefsBot', 'SemrushBot', 'MJ12bot', 'DotBot', 'BLEXBot', 'DataForSeoBot', 'Barkrowler', 'serpstatbot', 'SeekportBot', 'magpie-crawler'] as const;

/** Search engines named in the policy (any robot not listed above is treated like them on the marketing pages). */
export const SEARCH_ENGINES = ['Googlebot', 'Bingbot', 'YandexBot', 'DuckDuckBot', 'Applebot'] as const;

/**
 * Tools and headless browsers a person rarely uses on a public form: refused on
 * the unauthenticated public doors only (trial request, sign-up, portal sign-in,
 * the public assistant). An integration with its own API key is never refused for these.
 */
export const AUTOMATION_TOOLS = ['HeadlessChrome', 'PhantomJS', 'Puppeteer', 'Playwright', 'Selenium', 'python-requests', 'python-httpx', 'aiohttp', 'Go-http-client', 'curl/', 'Wget', 'libwww-perl', 'okhttp', 'node-fetch', 'axios/', 'undici', 'Java/', 'httpclient'] as const;

export type Surface = 'site' | 'docs-host' | 'closed';

export interface RobotsOptions {
  /** Absolute sitemap address, or several (the sales site names its own and the help centre's, which lives on the app host). */
  sitemap?: string | readonly string[];
  /** Let AI answer/search robots read the marketing pages or docs too (owner switch; default false). */
  allowAiAnswers?: boolean;
  /** Let site-analysis robots in (default false). */
  allowScrapers?: boolean;
}

/** The answer robots that fetch for a person or for an AI search index, as opposed to training crawlers. */
const AI_ANSWER = new Set<string>(['ChatGPT-User', 'OAI-SearchBot', 'Claude-User', 'Claude-SearchBot', 'Perplexity-User', 'PerplexityBot', 'MistralAI-User', 'DuckAssistBot', 'meta-externalfetcher']);

const group = (agents: readonly string[], lines: string[]) => [...agents.map((a) => `User-agent: ${a}`), ...lines, ''];

/** The words of a robots.txt for one surface. */
export function robotsTxt(surface: Surface, o: RobotsOptions = {}): string {
  const head = ['# Curahold crawler policy. Automated access, scraping and text-and-data mining need written permission (terms of service; TDM rights reserved under EU DSM Art. 4).', ''];
  if (surface === 'closed') return [...head, ...group(['*'], ['Disallow: /'])].join('\n');
  const ai = AI_CRAWLERS.filter((a) => !(o.allowAiAnswers && AI_ANSWER.has(a)));
  const blocked = [...ai, ...(o.allowScrapers ? [] : SCRAPERS)];
  const everyone =
    surface === 'site'
      ? // Marketing pages yes; the try-it demo and its hub are the product, not a page to index.
        ['Allow: /', 'Disallow: /demo/']
      : // The app's central host: the documentation only.
        ['Allow: /docs/', 'Disallow: /'];
  return [...head, ...group(blocked, ['Disallow: /']), ...group(['*'], everyone), ...(o.sitemap ? [...[o.sitemap].flat().map((u) => `Sitemap: ${u}`), ''] : [])].join('\n');
}

/** EU DSM Directive Art. 4(3) machine-readable reservation (W3C TDMRep): /.well-known/tdmrep.json. */
export const TDMREP_JSON = JSON.stringify([{ location: '/*', 'tdm-reservation': 1 }], null, 2) + '\n';

/** The same reservation as an HTTP header pair and as HTML meta tags. */
export const TDM_HEADER = { name: 'tdm-reservation', value: '1' } as const;
export const TDM_META = '<meta name="tdm-reservation" content="1">';

/** Robots meta for the product (app, portal, demo, hubs): no index, no follow, no AI use. */
export const CLOSED_ROBOTS = 'noindex, nofollow, noai, noimageai';
export const CLOSED_ROBOTS_META = `<meta name="robots" content="${CLOSED_ROBOTS}">`;
/** For the X-Robots-Tag header on every product and API answer. */
export const CLOSED_X_ROBOTS = 'noindex, nofollow';

const lower = (xs: readonly string[]) => xs.map((x) => x.toLowerCase());
const AI_LC = lower(AI_CRAWLERS);
const SCRAPER_LC = lower(SCRAPERS);
const TOOL_LC = lower(AUTOMATION_TOOLS);

export type AgentKind = 'ai' | 'scraper' | 'tool' | 'empty' | null;

/** What a User-Agent header says the caller is (case-insensitive, by name). */
export function agentKind(ua: string | null | undefined): AgentKind {
  const s = (ua ?? '').trim().toLowerCase();
  if (!s) return 'empty';
  if (AI_LC.some((a) => s.includes(a))) return 'ai';
  if (SCRAPER_LC.some((a) => s.includes(a))) return 'scraper';
  if (TOOL_LC.some((a) => s.includes(a))) return 'tool';
  return null;
}
