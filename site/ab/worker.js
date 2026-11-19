// The edge script for the sales site's A/B test (a Cloudflare Pages advanced-mode
// worker). scripts/build-site.ts writes it to dist/site/_worker.js, with the config
// from site/ab/config.ts inlined as AB, ONLY when AB.enabled is true. Until then the
// site is plain static files and this file is not deployed.
//
// Rules: GET/HEAD of a landing page only; bots and visitors without analytics consent
// get the classic page and no cookie; a participant keeps the variant they were given.

/* global AB, HTMLRewriter */
const BOT = /bot|crawl|spider|slurp|bing|google|yandex|baidu|duckduck|facebookexternalhit|embedly|preview|lighthouse|headless/i;

function cookies(header) {
  const out = {};
  for (const part of (header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

/** The landing page's language prefix ('' for English, 'tr/' …), or null if the path is not a landing page. */
export function landingPrefix(path, ab) {
  if (path === '/' || path === '/index.html') return ab.locales === 'all' || ab.locales.includes('en') ? '' : null;
  const m = /^\/([a-zA-Z-]{2,7})\/(?:index\.html)?$/.exec(path);
  if (!m) return null;
  return ab.locales === 'all' || ab.locales.includes(m[1]) ? `${m[1]}/` : null;
}

/** Weighted choice; `r` in [0, 1). */
export function pick(variants, r) {
  const total = variants.reduce((s, v) => s + Math.max(0, v.weight), 0);
  let x = r * total;
  for (const v of variants) {
    x -= Math.max(0, v.weight);
    if (x < 0) return v;
  }
  return variants[0];
}

/**
 * What to serve: { variant, page, setCookie } or null for "the classic page, untouched".
 * Pure, so tests/site-ab.test.ts can hold it to the rules.
 */
export function decide({ method, path, ua, cookie }, ab, r) {
  if (!ab.enabled || (method !== 'GET' && method !== 'HEAD')) return null;
  const prefix = landingPrefix(path, ab);
  if (prefix === null || BOT.test(ua || '')) return null;
  const jar = cookies(cookie);
  // The consent banner mirrors the visitor's choice here (site/consent.js): analytics "1" or "0".
  if (jar.cura_consent !== 'a1') return null;
  const [exp, id] = (jar[ab.cookie] || '').split('.');
  let v = exp === ab.experiment ? ab.variants.find((x) => x.id === id) : undefined;
  const fresh = !v;
  if (!v) v = pick(ab.variants, r);
  return {
    variant: v.id,
    page: `/${prefix}${v.page}`,
    setCookie: fresh ? `${ab.cookie}=${ab.experiment}.${v.id}; Max-Age=${ab.cookieDays * 86400}; Path=/; SameSite=Lax; Secure` : null,
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const d = decide({ method: request.method, path: url.pathname, ua: request.headers.get('user-agent'), cookie: request.headers.get('cookie') }, AB, Math.random());
    if (!d) return env.ASSETS.fetch(request);
    const res = await env.ASSETS.fetch(new Request(new URL(d.page, url), request));
    const tagged = new HTMLRewriter()
      .on('head', { element: (e) => e.append(`<meta name="cura-ab" content="${AB.experiment}.${d.variant}">`, { html: true }) })
      .transform(res);
    const out = new Response(tagged.body, tagged);
    out.headers.set('Cache-Control', 'private, no-store');
    out.headers.append('Vary', 'Cookie');
    if (d.setCookie) out.headers.append('Set-Cookie', d.setCookie);
    return out;
  },
};
