// Curahold's fixed-address relay for Salesforce token requests.
//
// Salesforce asks partner apps to renew their tokens from addresses it has
// been told about. Curahold runs on Cloudflare Workers, which have no fixed
// address, so this small program runs on a server that has one and passes
// those requests on. It does one thing:
//
//   POST /            with  x-relay-key: <the shared key>
//                           x-relay-target: https://login.salesforce.com/services/oauth2/token
//                     →     the same form body, sent to that address; the answer comes back as it is
//
// It refuses every other address, method and caller, keeps nothing, and never
// writes a request's or an answer's content to its log. No dependencies:
//
//   RELAY_KEY=<24+ characters> PORT=8787 node relay.mjs
//
// Put it behind TLS (see README.md) and set SALESFORCE_RELAY_URL and
// SALESFORCE_RELAY_KEY on the Curahold server.
import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

const MAX_BODY = 8 * 1024;
const TIMEOUT_MS = 15_000;

/** Salesforce's token endpoint and nothing else: its login hosts or a company's own Salesforce domain. */
export function allowedTarget(raw) {
  try {
    const u = new URL(String(raw));
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && !u.search && !u.hash && /^([a-z0-9-]+\.)+salesforce\.com$/.test(u.hostname) && u.pathname === '/services/oauth2/token';
  } catch {
    return false;
  }
}

const sameKey = (a, b) => timingSafeEqual(createHash('sha256').update(String(a)).digest(), createHash('sha256').update(String(b)).digest());
const text = (status, body) => new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });

/** The whole relay as one function from a request to an answer, so it can be tested without a network. */
export function makeHandler({ key, fetcher = fetch, log = () => {} }) {
  if (!key || String(key).length < 24) throw new Error('RELAY_KEY must be at least 24 characters');
  return async function handle(request) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') return text(200, 'ok');
    if (url.pathname !== '/') return text(404, 'Not found');
    if (request.method !== 'POST') return text(405, 'Only POST');
    if (!sameKey(request.headers.get('x-relay-key') ?? '', key)) return text(401, 'Wrong key');
    const target = request.headers.get('x-relay-target') ?? '';
    if (!allowedTarget(target)) return text(403, 'Only Salesforce token requests are passed on');
    if (!/^application\/x-www-form-urlencoded\b/i.test(request.headers.get('content-type') ?? '')) return text(415, 'Only form bodies');
    const body = await request.text();
    if (body.length > MAX_BODY) return text(413, 'Too large');
    let answer;
    try {
      answer = await fetcher(target, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      log({ target: new URL(target).hostname, status: 502 });
      return text(502, 'Salesforce did not answer');
    }
    log({ target: new URL(target).hostname, status: answer.status });
    return new Response(await answer.text(), { status: answer.status, headers: { 'content-type': answer.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store' } });
  };
}

// Started directly (not imported by a test): listen.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || 8787;
  const handle = makeHandler({ key: process.env.RELAY_KEY, log: (l) => console.log(`${new Date().toISOString()} ${l.target} ${l.status}`) });
  createServer(async (req, res) => {
    try {
      const chunks = [];
      let size = 0;
      for await (const c of req) {
        size += c.length;
        if (size > MAX_BODY * 2) {
          res.writeHead(413).end('Too large');
          return;
        }
        chunks.push(c);
      }
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
      const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
      const answer = await handle(new Request(`http://relay${req.url}`, { method: req.method, headers, body: hasBody ? Buffer.concat(chunks) : undefined }));
      res.writeHead(answer.status, Object.fromEntries(answer.headers));
      res.end(await answer.text());
    } catch {
      res.writeHead(500).end('Relay error');
    }
  }).listen(port, '127.0.0.1', () => console.log(`Curahold relay on 127.0.0.1:${port}`));
}
