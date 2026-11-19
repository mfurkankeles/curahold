// Draws the sales site's share card (site/og.png, 1200 × 630): the mark, the wordmark and the
// brand arc on the night background, with no words in any language, so one picture serves
// every page and language. Social networks do not show SVG share cards; scripts/build-site.ts
// uses site/og.png when it exists and the SVG otherwise.
//
//   npx tsx scripts/site-og.mts          (needs Chrome; CHROME_PATH if it is not /usr/bin/google-chrome)
//
// Run it again only when the brand changes; the PNG is committed.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const ROOT = join(import.meta.dirname, '..');
const font = readFileSync(join(ROOT, 'node_modules', '@fontsource-variable', 'bricolage-grotesque', 'files', 'bricolage-grotesque-latin-wght-normal.woff2')).toString('base64');

// Brand colours only (site/site.css :root): night, iris, fern and the mark's ink.
const html = `<!doctype html><html><head><style>
@font-face { font-family: 'Bricolage Grotesque'; font-weight: 200 800; src: url(data:font/woff2;base64,${font}) format('woff2'); }
html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
body { background: radial-gradient(70% 90% at 82% 18%, #33299a 0%, transparent 62%), linear-gradient(160deg, #17133a, #0f0c2b); }
.arc { position: absolute; right: -60px; top: 50%; width: 560px; height: 560px; transform: translateY(-50%); }
.lock { position: absolute; left: 104px; top: 50%; transform: translateY(-50%); display: flex; align-items: center; gap: 36px; }
.lock svg { width: 148px; height: 148px; }
.lock b { font: 700 128px/1 'Bricolage Grotesque', sans-serif; letter-spacing: -0.03em; color: #fff; }
</style></head><body>
<svg class="arc" viewBox="0 0 420 420"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8c7dff"/><stop offset=".55" stop-color="#5b4de8"/><stop offset="1" stop-color="#3fb596"/></linearGradient></defs><path d="M319.3 79.8A170 170 0 1 0 319.3 340.2" fill="none" stroke="url(#g)" stroke-width="22" stroke-linecap="round" opacity=".55"/></svg>
<div class="lock"><svg viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#241f52"/><path d="M20.8 10.3A7.5 7.5 0 1 0 20.8 21.7" fill="none" stroke="#eceafe" stroke-width="3" stroke-linecap="round"/><circle cx="16.5" cy="16" r="2.6" fill="#3fb596"/></svg><b>Curahold</b></div>
</body></html>`;

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
const loaded = await page.evaluate(() => document.fonts.check("700 128px 'Bricolage Grotesque'") && [...document.fonts].some((f) => f.status === 'loaded'));
if (!loaded) throw new Error('site-og: the brand font did not load');
const png = await page.screenshot({ type: 'png' });
await browser.close();
writeFileSync(join(ROOT, 'site', 'og.png'), png);
console.log(`site/og.png: 1200 × 630, ${png.length} bytes`);
