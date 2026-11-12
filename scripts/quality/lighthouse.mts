// Lighthouse (mobile) for the pages anyone can open without signing in: the
// sales site and the help pages. Needs `npm run build` and `npm run build:site`.
// Lighthouse itself is fetched by npx when this runs; it is not a dependency.
//
//   npx tsx scripts/quality/lighthouse.mts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { gzipSync } from 'node:zlib';

const root = join(import.meta.dirname, '..', '..');
// Not the blocking kind: this same process is serving the pages Lighthouse asks for.
const run = promisify(execFile);
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json', '.md': 'text/markdown; charset=utf-8' };

/** Files as a real host would send them: compressed, with a type. */
function serve(dir: string, port: number) {
  const srv = http.createServer((req, res) => {
    let rel = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    let file = join(dir, rel);
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!file.startsWith(dir) || !existsSync(file)) return void (res.writeHead(404), res.end());
    const type = TYPES[extname(file)] ?? 'application/octet-stream';
    let body: Buffer = readFileSync(file);
    const headers: Record<string, string> = { 'content-type': type, 'cache-control': /\/assets\//.test(file) ? 'public, max-age=31536000, immutable' : 'public, max-age=300' };
    if (/text|javascript|json|svg/.test(type) && body.length > 512) {
      body = gzipSync(body);
      headers['content-encoding'] = 'gzip';
    }
    res.writeHead(200, headers);
    res.end(body);
  });
  return new Promise<http.Server>((r) => srv.listen(port, () => r(srv)));
}

const site = await serve(join(root, 'dist', 'site'), 8941);
const web = await serve(join(root, 'dist', 'web'), 8942);
const pages: [string, string][] = [
  ['sales site, English', 'http://localhost:8941/'],
  ['sales site, Turkish', 'http://localhost:8941/tr/'],
  ['help, front page (EN)', 'http://localhost:8942/docs/en/'],
  ['help, a long page (TR)', 'http://localhost:8942/docs/tr/billing/'],
];
const chrome = ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => existsSync(p));
for (const [name, url] of pages) {
  const outFile = join(tmpdir(), `lh-${Date.now()}.json`);
  try {
    await run('npx', ['-y', 'lighthouse', url, '--quiet', '--output=json', `--output-path=${outFile}`, '--chrome-flags=--headless=new --no-sandbox --disable-dev-shm-usage', '--only-categories=performance,accessibility,best-practices,seo'], {
      env: { ...process.env, CHROME_PATH: chrome },
      timeout: 120000,
      maxBuffer: 1 << 26,
    });
    const r = JSON.parse(readFileSync(outFile, 'utf8'));
    const score = (k: string) => Math.round((r.categories[k]?.score ?? 0) * 100);
    const a = r.audits;
    const failing = Object.values<any>(a).filter((x) => x.score !== null && x.score < 0.9 && x.scoreDisplayMode !== 'informative' && x.scoreDisplayMode !== 'manual' && x.scoreDisplayMode !== 'notApplicable').map((x) => x.id);
    console.log(`${name.padEnd(26)} performance ${score('performance')}, accessibility ${score('accessibility')}, best practices ${score('best-practices')}, SEO ${score('seo')}; largest paint ${a['largest-contentful-paint']?.displayValue}, layout shift ${a['cumulative-layout-shift']?.displayValue}${failing.length ? `; to fix: ${failing.slice(0, 6).join(', ')}` : ''}`);
  } catch (e) {
    console.log(`${name.padEnd(26)} could not be measured (${String(e).slice(0, 80)})`);
  }
}
site.close();
web.close();
process.exit(0);
