// Robots, scrapers and traffic bursts: the code side of the crawler policy
// (shared/src/compliance/crawlers.ts) and of the cost protection.
//
// - robots.txt and /.well-known/tdmrep.json are answered here, before any
//   database work: the central host (app.<domain>) lets search engines read the
//   documentation only; every company's host, the desk, the portal and a
//   self-hosted install say `Disallow: /`.
// - Known AI crawlers and site-analysis robots get 403 on the app and the API.
//   The AI connector's own doors (/mcp, /oauth, /.well-known) and any request
//   carrying an API key are left alone: a customer may point an AI tool at its
//   own data with its own key, under its terms.
// - On the public doors (trial request, sign-up, the public assistant, the
//   portal's sign-in steps) scripted HTTP tools and an empty User-Agent are
//   refused too ('strict', production). Local development and the tests run
//   'crawlers' (headless browser tests use those doors).
// - Behaviour: many unknown addresses (404) from one network address in a short
//   time is a scanner mapping the API; it waits like any other limit.
// - Unusual traffic (bursts of 429s, a single address limited again and again,
//   many refused robots) is logged and written once per quarter hour to the
//   owner console's alerts (company_log, kind 'alert').
//
// Honest limit: a robot that runs a real browser and sends a browser's name is
// not recognised here. The signed-in product, the per-person and per-company
// limits (lib/ratelimit.ts) and the terms of service are what stand then.
import { agentKind, robotsTxt, TDMREP_JSON, TDM_HEADER, CLOSED_X_ROBOTS } from '../../../shared/src/compliance/crawlers';
import type { Config, Deps } from '../context';

export type RobotGuard = 'strict' | 'crawlers' | 'off';

const hostOf = (req: Request) => (req.headers.get('host') ?? new URL(req.url).host).split(':')[0].toLowerCase();

/** robots.txt for the host asked: the central host shows its docs to search engines; everything else is closed. */
export function robotsFor(cfg: Pick<Config, 'centralHost' | 'singleTenantSlug' | 'crawlers'>, host: string): string {
  const docsHost = !cfg.singleTenantSlug && host === cfg.centralHost.split(':')[0].toLowerCase();
  return docsHost ? robotsTxt('docs-host', { allowAiAnswers: !!cfg.crawlers?.docsAiAnswers }) : robotsTxt('closed');
}

const textHeaders = { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600', 'x-robots-tag': CLOSED_X_ROBOTS };

/** The answers that need nothing but the address: robots.txt and the TDM reservation. Null for everything else. */
export function edgeAnswer(req: Request, cfg: Pick<Config, 'centralHost' | 'singleTenantSlug' | 'crawlers'>): Response | null {
  if (req.method !== 'GET' && req.method !== 'HEAD') return null;
  const p = new URL(req.url).pathname;
  if (p === '/robots.txt') return new Response(req.method === 'HEAD' ? null : robotsFor(cfg, hostOf(req)), { headers: textHeaders });
  if (p === '/.well-known/tdmrep.json')
    return new Response(req.method === 'HEAD' ? null : TDMREP_JSON, { headers: { ...textHeaders, 'content-type': 'application/json', [TDM_HEADER.name]: TDM_HEADER.value } });
  return null;
}

/** Doors anyone may knock on without an account, where a person types into a form. */
const PUBLIC_DOORS = [/^\/api\/trial\//, /^\/api\/signup\//, /^\/api\/assist\/public$/, /^\/api\/consent-event$/, /^\/papi\/auth\/(start|code|verify|password|forgot|reset)$/];
/** Never refused by name: the AI connector's sign-in and protocol, robots.txt, webhooks and health. */
const EXEMPT = [/^\/mcp$/, /^\/oauth\//, /^\/\.well-known\//, /^\/robots\.txt$/, /^\/api\/health$/, /^\/api\/(hooks|inbound|scim\/v2)\//, /^\/api\/billing\/webhook$/, /^\/api\/(oauth|connect)\/callback$/];

export const isPublicDoor = (path: string) => PUBLIC_DOORS.some((r) => r.test(path));

/** Why this request is refused by the robot rules, or null. */
export function robotRefusal(mode: RobotGuard | undefined, req: { path: string; ua: string | null | undefined; bearer: boolean }): 'ai' | 'scraper' | 'tool' | null {
  if (mode === 'off' || EXEMPT.some((r) => r.test(req.path))) return null;
  const kind = agentKind(req.ua);
  if ((kind === 'ai' || kind === 'scraper') && !req.bearer) return kind;
  if ((mode ?? 'crawlers') === 'strict' && (kind === 'tool' || kind === 'empty') && isPublicDoor(req.path)) return 'tool';
  return null;
}

// ---------------------------------------------------------------- unusual traffic

/** When the per-minute counts of this isolate or process are worth a look. */
export const TRAFFIC_RULES = {
  /** 429 answers in one minute, everyone together. */
  limitedPerMinute: 200,
  /** 429 answers to one network address in one minute. */
  limitedPerIpPerMinute: 50,
  /** Robots refused by name in one minute. */
  refusedPerMinute: 100,
  /** One alert per rule per this many minutes. */
  alertEveryMinutes: 15,
} as const;

export type TrafficRule = 'burst' | 'ip-burst' | 'robots';
export interface TrafficAlert {
  rule: TrafficRule;
  ref: string;
  body: string;
  meta: Record<string, unknown>;
}

/** Counts refused and limited answers per minute; says when a rule is crossed (once per window). */
export class TrafficWatch {
  private minute = -1;
  private limited = 0;
  private refused = 0;
  private perIp = new Map<string, number>();
  private fired = new Set<string>();
  /** Addresses that spent their allowance of unknown addresses (scanners), until when (ms). */
  private waiting = new Map<string, number>();
  constructor(private clock: () => number = () => Date.now()) {}

  /** Seconds this address still waits after a scan, or 0. */
  waitOf(ip: string): number {
    const until = this.waiting.get(ip);
    if (!until) return 0;
    const left = until - this.clock();
    if (left <= 0) this.waiting.delete(ip);
    return left > 0 ? Math.ceil(left / 1000) : 0;
  }
  /** Makes the address wait (bounded memory: a flood of addresses clears the oldest list). */
  hold(ip: string, seconds: number) {
    if (this.waiting.size >= 10_000) this.waiting.clear();
    this.waiting.set(ip, this.clock() + seconds * 1000);
  }

  note(kind: 'limited' | 'refused', ip: string | null, detail?: string): TrafficAlert | null {
    const now = this.clock();
    const m = Math.floor(now / 60_000);
    if (m !== this.minute) {
      this.minute = m;
      this.limited = 0;
      this.refused = 0;
      this.perIp.clear();
    }
    const windowKey = Math.floor(now / (TRAFFIC_RULES.alertEveryMinutes * 60_000));
    const fire = (rule: TrafficRule, body: string, meta: Record<string, unknown>): TrafficAlert | null => {
      const ref = `traffic:${rule}:${windowKey}`;
      if (this.fired.has(ref)) return null;
      if (this.fired.size > 100) this.fired.clear();
      this.fired.add(ref);
      return { rule, ref, body, meta: { rule, at: new Date(now).toISOString(), ...meta } };
    };
    if (kind === 'refused') {
      this.refused += 1;
      if (this.refused === TRAFFIC_RULES.refusedPerMinute) return fire('robots', `Traffic: ${this.refused} robot requests refused in one minute`, { count: this.refused, last: detail ?? null });
      return null;
    }
    this.limited += 1;
    if (ip) {
      const n = (this.perIp.get(ip) ?? 0) + 1;
      if (this.perIp.size < 10_000 || this.perIp.has(ip)) this.perIp.set(ip, n);
      // The address itself is personal data: the alert keeps a short fingerprint of it, never the address.
      if (n === TRAFFIC_RULES.limitedPerIpPerMinute) return fire('ip-burst', `Traffic: one network address was limited ${n} times in one minute`, { count: n, source: fingerprint(ip), path: detail ?? null });
    }
    if (this.limited === TRAFFIC_RULES.limitedPerMinute) return fire('burst', `Traffic: ${this.limited} requests limited (429) in one minute`, { count: this.limited, path: detail ?? null });
    return null;
  }
}

/** A random salt per isolate: the label below cannot be turned back into an address, nor matched across isolates. */
const SALT = globalThis.crypto.randomUUID();
/** A short label for an address (same address, same label, within this isolate's life). */
function fingerprint(ip: string): string {
  let h = 2166136261;
  const s = `${SALT}:${ip}`;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return `ip#${(h >>> 0).toString(36)}`;
}

/** The one watch of this isolate or process. */
export const sharedWatch = new TrafficWatch();

/** Logs the alert and writes it to the console's alerts (company_log); never throws. */
export async function raiseTrafficAlert(deps: Deps, a: TrafficAlert): Promise<void> {
  console.warn('[curahold] traffic alert', JSON.stringify({ ref: a.ref, ...a.meta }));
  try {
    await deps.db.system((q) =>
      q.query(
        `insert into company_log (seat, kind, body, ref, meta)
         select 'system', 'alert', $1, $2, $3 where not exists (select 1 from company_log where ref = $2)`,
        [a.body, a.ref, JSON.stringify(a.meta)],
      ),
    );
  } catch (e) {
    console.error('[curahold] traffic alert not stored', e instanceof Error ? e.message : String(e));
  }
}
