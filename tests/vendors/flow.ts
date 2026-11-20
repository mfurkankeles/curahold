// One customer-style run of an integration, the same steps an administrator takes in Settings → Data
// sources, through the API those screens call: find it → connect → pick and map → preview → first sync →
// a change there → a change here → both at once → expired token → withdrawn access → rate limit →
// bad field → reconnect → disconnect. Each step is timed; the result says what happened, not what should.
import { pmColumns } from '../../shared/src/templates';
import type { VendorWorld } from './kit';

export interface Http {
  get(path: string): Promise<{ status: number; json: any }>;
  post(path: string, body?: unknown): Promise<{ status: number; json: any }>;
  put(path: string, body?: unknown): Promise<{ status: number; json: any }>;
  patch(path: string, body?: unknown): Promise<{ status: number; json: any }>;
  del(path: string): Promise<{ status: number; json: any }>;
  /** GET without following redirects; returns the Location. */
  location(pathOrUrl: string): Promise<string | null>;
  /** Waits for work the app runs after answering (a change written to the vendor). */
  settle(): Promise<void>;
  /** Moves the app's clock on. */
  advance(ms: number): void;
}

export interface FlowSpec {
  provider: string;
  /** remote object → what it becomes here (the choices on the "pick what comes over" screen). */
  objects: { remote: string; target: 'account' | 'record'; kind?: string }[];
  /** Name of a customer the first sync must bring. */
  expect: string;
  twoWay: boolean;
  /** Spreadsheets: the file link pasted after signing in, and the column that identifies a row. */
  file?: string;
  key?: string;
  /** Spreadsheets keep no change time per row, so "the newer wins" cannot be told: the change made here wins. */
  hereWins?: boolean;
}

export interface Step {
  step: string;
  ok: boolean;
  ms: number;
  note?: string;
}

export interface RealSide {
  /** The key values for a key-based vendor (from the environment). */
  keyValues?: Record<string, string>;
  /** OAuth: the person opens this address, clicks Allow, and the promise ends when the app has the connection. */
  signIn?: (startUrl: string) => Promise<string | null>;
  /**
   * What the sandbox was seeded with by hand (scripts/integrations/onboard.ts lists it per vendor): the ticket, task or
   * mail subject the first read must bring. Without it the first read only has to finish cleanly.
   */
  expect?: string;
  /** Jira: the project key to read. */
  project?: string;
  /** A spreadsheet: the sheet's address. */
  file?: string;
}

/** The note on a step a real sandbox cannot run: it needs the vendor's side changed or broken on purpose. */
const BY_HAND = 'skipped: needs a change made by hand in the vendor';

/** A step timed and recorded; `fn` answers true, or the reason it failed. */
function stepper(steps: Step[]) {
  return async (name: string, fn: () => Promise<boolean | string>) => {
    const s = Date.now();
    let r: boolean | string = false;
    try {
      r = await fn();
    } catch (e) {
      r = (e as Error).message.slice(0, 200);
    }
    steps.push({ step: name, ok: r === true, ms: Date.now() - s, ...(typeof r === 'string' ? { note: r } : {}) });
    return r === true;
  };
}

/**
 * With a real sandbox, a change made here is checked by the app reporting no problem for it after a run (there is no
 * call log to read); against the mocks, by the write the vendor received (`wrote`).
 */
async function wroteThere(http: Http, id: string, real: RealSide | undefined, wrote: () => boolean | string): Promise<boolean | string> {
  if (!real) return wrote();
  await http.post(`/api/connections/${id}/sync/run`, {});
  const problems = (await http.get(`/api/connections/${id}/problems`)).json;
  const list = problems?.problems ?? problems?.items ?? [];
  return list.length ? `the vendor refused the change: ${JSON.stringify(list).slice(0, 160)}` : true;
}

/** With `real`, the vendor is the real sandbox: steps that need the vendor's side changed by hand are skipped and say so. */
export async function runFlow(http: Http, world: VendorWorld | null, spec: FlowSpec, real?: RealSide) {
  const steps: Step[] = [];
  const mock = real ? null : world!.mock(spec.provider);
  mock?.reset();
  world?.clear(spec.provider);
  let id = '';
  const t0 = Date.now();
  const step = async (name: string, fn: () => Promise<boolean | string>) => {
    const s = Date.now();
    let ok = false;
    let note: string | undefined;
    try {
      const r = await fn();
      ok = r === true;
      if (typeof r === 'string') note = r;
    } catch (e) {
      note = (e as Error).message.slice(0, 200);
    }
    steps.push({ step: name, ok, ms: Date.now() - s, ...(note ? { note } : {}) });
    return ok;
  };
  const runNow = async () => (await http.post(`/api/connections/${id}/sync/run`, {})).json?.run;
  const accounts = async (q: string) => ((await http.get(`/api/accounts?q=${encodeURIComponent(q)}`)).json.accounts as any[]).filter((a) => a.name === q);

  await step('find', async () => {
    const p = (await http.get('/api/connections')).json.providers.find((x: any) => x.id === spec.provider);
    return p?.available ? true : `not offered: ${JSON.stringify(p)}`;
  });

  const keyValues = real ? real.keyValues : mock!.keyValues;
  const connect = async () => {
    if (keyValues) {
      const r = await http.post('/api/connections/key', { provider: spec.provider, values: keyValues });
      if (r.status >= 300) return `key refused ${r.status} ${JSON.stringify(r.json)}`;
      id = r.json.id;
      return true;
    }
    const q = new URLSearchParams(mock?.startQuery ?? {});
    const go = await http.location(`/api/connect/${spec.provider}/start?${q}`);
    if (!go || !/^https:/.test(go)) return `start went to ${go}`;
    const done = real ? await real.signIn!(go) : await http.location(mock!.consent!(new URL(go), world!.ctl(spec.provider)));
    const m = done && /\/settings\/sources\/([0-9a-f-]{36})/.exec(done);
    if (!m) return `callback went to ${done}`;
    id = m[1];
    return true;
  };
  await step('connect', connect);
  const connectedMs = Date.now() - t0;
  if (!id) return { steps, connectedMs, firstDataMs: null as number | null };

  const file = real?.file ?? spec.file;
  if (file) {
    await step('pick-file', async () => {
      const r = await http.post(`/api/connections/${id}/file`, { url: file });
      return r.status < 300 ? true : `file refused ${r.status} ${JSON.stringify(r.json).slice(0, 160)}`;
    });
  }

  await step('map', async () => {
    const objects = (await http.get(`/api/connections/${id}/objects`)).json.objects as any[];
    const picked = [];
    for (const o of spec.objects) {
      if (!objects.some((x) => x.name === o.remote)) return `object ${o.remote} not offered`;
      const query = o.target === 'account' ? 'kind=account' : `kind=${o.kind}`;
      const suggested = (await http.get(`/api/connections/${id}/objects/${o.remote}/fields?${query}`)).json.suggested;
      picked.push({ remote: o.remote, label: o.remote, target: o.target, ...(o.target === 'record' ? { typeKey: '__new', kind: o.kind } : {}), ...(spec.key ? { key: spec.key } : {}), enabled: true, create: true, fields: suggested });
    }
    const saved = await http.put(`/api/connections/${id}/sync`, { objects: picked, conflict: 'latest' });
    return saved.status === 200 ? true : `mapping refused ${saved.status} ${JSON.stringify(saved.json).slice(0, 200)}`;
  });

  await step('preview', async () => {
    const r = await http.post(`/api/connections/${id}/preview`, {});
    return r.status === 200 ? true : `preview ${r.status}`;
  });

  let firstDataMs: number | null = null;
  await step('first-sync', async () => {
    const run = await runNow();
    firstDataMs = Date.now() - t0;
    if (!run || run.status !== 'ok') return `run ${run?.status}: ${JSON.stringify(run?.errors ?? run).slice(0, 300)}`;
    const want = real?.expect ?? spec.expect;
    return (await accounts(want)).length === 1 ? true : `${want} not here after first sync`;
  });

  const vendorSide = async (name: string, fn: () => Promise<boolean | string>) => (real ? void steps.push({ step: name, ok: true, ms: 0, note: 'skipped: needs a change made by hand in the vendor' }) : step(name, fn));

  await vendorSide('edit-there', async () => {
    http.advance(60_000);
    mock!.remoteEdit!(world!.ctl(spec.provider), `Orbital Freight Ltd (${spec.provider})`);
    const run = await runNow();
    if (run?.status === 'error') return `run error ${JSON.stringify(run.errors)}`;
    return (await accounts(`Orbital Freight Ltd (${spec.provider})`)).length === 1 ? true : 'change there did not arrive';
  });

  let mine: any = null;
  await step('edit-here', async () => {
    mine = (await accounts(spec.expect))[0];
    await http.patch(`/api/accounts/${mine.id}`, { name: `${spec.expect} Group` });
    await http.settle();
    if (!spec.twoWay) return true;
    const link = (await http.get(`/api/accounts/${mine.id}`)).json.account.links?.find((l: any) => l.provider === spec.provider);
    if (real) return link ? true : 'no link to the vendor record';
    const row = link && mock!.remoteRow!(spec.objects[0].remote, link.remoteId);
    return row && Object.values(row).includes(`${spec.expect} Group`) ? true : `change here not written there: ${JSON.stringify(row)}`;
  });

  await vendorSide('conflict', async () => {
    if (!spec.twoWay) return true;
    // Both sides change the same customer before a run: the change here waits (the vendor is busy and
    // refuses the write for now), the vendor's change is a minute newer. The default rule: the newer wins.
    const other = (await accounts(`Orbital Freight Ltd (${spec.provider})`))[0];
    world!.arm(spec.provider, 'ratelimit', 3);
    await http.patch(`/api/accounts/${other.id}`, { name: `Orbital Freight (${spec.provider}, here)` });
    await http.settle();
    world!.clear(spec.provider);
    http.advance(60_000);
    mock!.remoteEdit!(world!.ctl(spec.provider), `Orbital Freight (${spec.provider}, there)`);
    http.advance(60_000);
    const run = await runNow();
    if (run?.status === 'error') return `run error ${JSON.stringify(run.errors)}`;
    const now = (await http.get(`/api/accounts/${other.id}`)).json.account.name;
    const want = spec.hereWins ? `Orbital Freight (${spec.provider}, here)` : `Orbital Freight (${spec.provider}, there)`;
    return now === want ? true : `expected "${want}" to win, here shows "${now}"`;
  });

  await vendorSide('expired-token', async () => {
    world!.arm(spec.provider, 'expired');
    http.advance(60_000);
    const run = await runNow();
    const conn = (await http.get(`/api/connections/${id}/sync`)).json.connection;
    return run?.status !== 'error' && conn.status !== 'error' ? true : `expired token broke the run: ${run?.status} ${JSON.stringify(run?.errors)}`;
  });

  await vendorSide('rate-limit', async () => {
    world!.arm(spec.provider, 'ratelimit');
    http.advance(60_000);
    const run = await runNow();
    const conn = (await http.get(`/api/connections/${id}/sync`)).json.connection;
    world!.clear(spec.provider);
    // A rate limit is not an error: the run stops with its place kept, the connection stays healthy.
    if (conn.status === 'error') return `rate limit marked the connection broken (${run?.status}: ${JSON.stringify(run?.errors).slice(0, 160)})`;
    return run?.status === 'error' ? `rate limit made the run an error: ${JSON.stringify(run?.errors).slice(0, 160)}` : true;
  });

  await vendorSide('bad-field', async () => {
    if (!spec.twoWay) return true;
    world!.arm(spec.provider, 'badfield');
    await http.patch(`/api/accounts/${mine.id}`, { name: `${spec.expect} Holding` });
    await http.settle();
    await runNow();
    const problems = (await http.get(`/api/connections/${id}/problems`)).json;
    world!.clear(spec.provider);
    const list = problems.problems ?? problems.items ?? [];
    return list.length ? true : `refused write not listed as a problem: ${JSON.stringify(problems).slice(0, 160)}`;
  });

  await vendorSide('revoked', async () => {
    world!.arm(spec.provider, 'revoked');
    http.advance(3_700_000);
    await runNow();
    const conn = (await http.get(`/api/connections/${id}/sync`)).json.connection;
    return conn.status === 'error' ? true : `revoked access not shown as a problem (status ${conn.status})`;
  });

  await step('reconnect', async () => {
    world?.clear(spec.provider);
    if (keyValues) {
      const r = await http.post('/api/connections/key', { provider: spec.provider, values: keyValues });
      if (r.json?.id !== id) return `reconnect made a second connection (${r.status})`;
    } else {
      const go = await http.location(`/api/connect/${spec.provider}/start?reconnect=${id}`);
      const done = real ? await real.signIn!(go!) : await http.location(mock!.consent!(new URL(go!), world!.ctl(spec.provider)));
      if (!done?.includes(id)) return `reconnect went to ${done}`;
    }
    const run = await runNow();
    const conn = (await http.get(`/api/connections/${id}/sync`)).json.connection;
    return conn.status !== 'error' && run?.status !== 'error' ? true : `still broken after reconnect: ${conn.status}`;
  });

  await step('disconnect', async () => {
    const r = await http.del(`/api/connections/${id}`);
    if (r.status !== 200) return `disconnect ${r.status}`;
    // Customers stay (they are the company's now); the link to the vendor goes.
    const kept = await http.get(`/api/accounts/${mine.id}`);
    if (kept.status !== 200) return 'customers were removed with the connection';
    const links = kept.json.account.links ?? [];
    return links.some((l: any) => l.provider === spec.provider) ? 'link to the vendor kept after disconnect' : true;
  });

  return { steps, connectedMs, firstDataMs };
}

/**
 * An accounting program (read only): connect → first read → the matches the admin checks → the money on a
 * customer's page → rate limit → withdrawn access → reconnect → disconnect (the money goes, the customer stays).
 */
export async function runAccountingFlow(http: Http, world: VendorWorld | null, spec: { provider: string; customer: string }, real?: RealSide) {
  const steps: Step[] = [];
  const mock = real ? null : world!.mock(spec.provider);
  mock?.reset();
  world?.clear(spec.provider);
  let id = '';
  const t0 = Date.now();
  const step = stepper(steps);
  const byHand = async (name: string, fn: () => Promise<boolean | string>) => (real ? void steps.push({ step: name, ok: true, ms: 0, note: BY_HAND }) : step(name, fn));
  const runNow = async () => (await http.post(`/api/connections/${id}/sync/run`, {})).json?.run;
  const name = real?.expect ?? spec.customer;
  const customer = async () => ((await http.get(`/api/accounts?q=${encodeURIComponent(name)}`)).json.accounts as any[]).find((a) => a.name === name);

  await step('find', async () => ((await http.get('/api/connections')).json.providers.find((x: any) => x.id === spec.provider)?.available ? true : 'not offered'));
  // A key (Odoo, Paraşüt) or the program's own sign-in (Xero, QuickBooks, Zoho Books, freee).
  const keyValues = real ? real.keyValues : mock!.keyValues;
  const signIn = async (reconnect: string) => {
    if (keyValues) {
      const r = await http.post('/api/connections/key', { provider: spec.provider, values: keyValues });
      return r.status < 300 ? (r.json.id as string) : `refused ${r.status} ${JSON.stringify(r.json).slice(0, 160)}`;
    }
    const q = new URLSearchParams({ ...(mock?.startQuery ?? {}), ...(reconnect ? { reconnect } : {}) });
    const go = await http.location(`/api/connect/${spec.provider}/start?${q}`);
    if (!go || (mock ? !mock.hosts.test(new URL(go).host) : !/^https:/.test(go))) return `start went to ${go}`;
    const done = real ? await real.signIn!(go) : await http.location(mock!.consent!(new URL(go), world!.ctl(spec.provider)));
    const m = done && /\/settings\/sources\/([0-9a-f-]{36})/.exec(done);
    return m ? m[1] : `callback went to ${done}`;
  };
  await step('connect', async () => {
    const r = await signIn('');
    if (!/^[0-9a-f-]{36}$/.test(r)) return r;
    id = r;
    return true;
  });
  const connectedMs = Date.now() - t0;
  if (!id) return { steps, connectedMs, firstDataMs: null as number | null };
  let firstDataMs: number | null = null;
  await step('first-read', async () => {
    const run = await runNow();
    firstDataMs = Date.now() - t0;
    return run?.status === 'ok' ? true : `run ${run?.status} ${JSON.stringify(run?.errors).slice(0, 200)}`;
  });
  await step('matches', async () => {
    const r = (await http.get(`/api/connections/${id}/finance/matches?show=all`)).json;
    return r.counts?.matched >= 1 ? true : `nothing matched: ${JSON.stringify(r.counts)}`;
  });
  await step('money-on-customer', async () => {
    const c = await customer();
    if (!c) return `no customer named "${name}" here`;
    const f = (await http.get(`/api/accounts/${c.id}/finance`)).json.finance;
    return f ? true : 'no money on the customer page';
  });
  await byHand('rate-limit', async () => {
    world!.arm(spec.provider, 'ratelimit');
    http.advance(3_600_000);
    const run = await runNow();
    world!.clear(spec.provider);
    const conn = (await http.get(`/api/connections/${id}/sync`)).json.connection;
    return run?.status !== 'error' && conn.status !== 'error' ? true : `rate limit: run ${run?.status}, connection ${conn.status}`;
  });
  await byHand('revoked', async () => {
    world!.arm(spec.provider, 'revoked');
    http.advance(3_600_000);
    await runNow();
    const conn = (await http.get(`/api/connections/${id}/sync`)).json.connection;
    return conn.status === 'error' ? true : `withdrawn key not shown as a problem (${conn.status})`;
  });
  await step('reconnect', async () => {
    world?.clear(spec.provider);
    if ((await signIn(id)) !== id) return 'reconnect did not come back to the same connection';
    await runNow();
    return (await http.get(`/api/connections/${id}/sync`)).json.connection.status !== 'error' ? true : 'still broken';
  });
  await step('disconnect', async () => {
    const c = await customer();
    if ((await http.del(`/api/connections/${id}`)).status !== 200) return 'disconnect refused';
    if (!c) return true;
    if (!(await customer())) return 'customer removed';
    const f = (await http.get(`/api/accounts/${c.id}/finance`)).json.finance;
    return f ? 'money from the program still shown after disconnect' : true;
  });
  return { steps, connectedMs, firstDataMs };
}

/**
 * A support tool (tickets): connect → map organisations (link only) and tickets → first sync files tickets under the
 * right customer → a change there → a change here (where the tool takes changes back) → a reply → rate limit →
 * withdrawn key → reconnect → disconnect (tickets stay as records; the link goes).
 */
export async function runSupportFlow(http: Http, world: VendorWorld | null, spec: { provider: string; ticket: string; twoWay: boolean; reply: boolean; edit?: Record<string, unknown> }, real?: RealSide) {
  const steps: Step[] = [];
  const mock = real ? null : world!.mock(spec.provider);
  mock?.reset();
  world?.clear(spec.provider);
  let id = '';
  const t0 = Date.now();
  const step = stepper(steps);
  const byHand = async (name: string, fn: () => Promise<boolean | string>) => (real ? void steps.push({ step: name, ok: true, ms: 0, note: BY_HAND }) : step(name, fn));
  const runNow = async () => (await http.post(`/api/connections/${id}/sync/run`, {})).json?.run;
  const tickets = async () => ((await http.get('/api/records?type=ticket&limit=200')).json.records ?? []) as any[];
  const linkOf = (t: any) => t?.links?.find((l: any) => l.provider === spec.provider);
  const keyValues = real ? real.keyValues : mock!.keyValues;
  // The ticket worked on: the seeded one, renamed by the "change there" step against the mocks.
  const seeded = real?.expect ?? spec.ticket;
  let current = seeded;

  await step('find', async () => ((await http.get('/api/connections')).json.providers.find((x: any) => x.id === spec.provider)?.available ? true : 'not offered'));
  await step('connect', async () => {
    const r = await http.post('/api/connections/key', { provider: spec.provider, values: keyValues });
    if (r.status >= 300) return `refused ${r.status} ${JSON.stringify(r.json).slice(0, 160)}`;
    id = r.json.id;
    return true;
  });
  const connectedMs = Date.now() - t0;
  if (!id) return { steps, connectedMs, firstDataMs: null as number | null };
  await step('map', async () => {
    const objects = (await http.get(`/api/connections/${id}/objects`)).json.objects as any[];
    const picked = [];
    for (const o of objects) {
      const ticket = o.hint === 'ticket' || o.name === 'tickets';
      const sug = (await http.get(`/api/connections/${id}/objects/${o.name}/fields?kind=${ticket ? 'ticket' : 'account'}`)).json.suggested;
      picked.push({ remote: o.name, label: o.labelPlural ?? o.name, target: ticket ? 'record' : 'account', ...(ticket ? { typeKey: '__new', kind: 'ticket' } : {}), enabled: true, create: false, linkOnly: true, fields: sug });
    }
    const saved = await http.put(`/api/connections/${id}/sync`, { objects: picked, conflict: 'latest' });
    return saved.status === 200 ? true : `mapping refused ${saved.status} ${JSON.stringify(saved.json).slice(0, 200)}`;
  });
  let firstDataMs: number | null = null;
  await step('first-sync', async () => {
    const run = await runNow();
    firstDataMs = Date.now() - t0;
    if (run?.status !== 'ok') return `run ${run?.status} ${JSON.stringify(run?.errors).slice(0, 200)}`;
    if (real && !real.expect) return true;
    const t = (await tickets()).find((x) => x.name === seeded);
    return t?.accountId ? true : `ticket "${seeded}" ${t ? 'not filed under a customer' : 'missing'}`;
  });
  await byHand('edit-there', async () => {
    http.advance(60_000);
    mock!.remoteEdit!(world!.ctl(spec.provider), `${spec.ticket} (updated)`);
    const run = await runNow();
    if (run?.status === 'error') return `run error ${JSON.stringify(run.errors).slice(0, 160)}`;
    current = `${spec.ticket} (updated)`;
    return (await tickets()).some((x) => x.name === current) ? true : 'change there did not arrive';
  });
  await step('edit-here', async () => {
    if (!spec.twoWay) return true;
    const t = (await tickets()).find((x) => x.name === current);
    if (!t) return real && !real.expect ? 'skipped: no seeded ticket named (set the expected ticket)' : `ticket "${current}" missing`;
    const from = world?.calls.length ?? 0;
    await http.patch(`/api/records/${t.id}`, { fields: spec.edit ?? { priority: 'low' } });
    await http.settle();
    // Each tool writes priority its own way (a word, a number): the check is that the write reached it and was taken.
    return wroteThere(http, id, real, () => {
      const wrote = world!.calls.slice(from).find((c) => c.vendor === spec.provider && /PUT|PATCH|POST/i.test(c.method) && c.status < 300);
      return wrote ? true : `change here not written there (${JSON.stringify(world!.calls.slice(from).map((c) => `${c.method} ${c.status}`))})`;
    });
  });
  await step('reply', async () => {
    if (!spec.reply) return true;
    const t = (await tickets()).find((x) => x.name === current);
    if (!t) return real && !real.expect ? 'skipped: no seeded ticket named (set the expected ticket)' : `ticket "${current}" missing`;
    const r = await http.post(`/api/connections/${id}/tickets/${encodeURIComponent(linkOf(t)?.remoteId)}/reply`, { body: 'Thanks, we are on it.' });
    return r.status < 300 ? true : `reply refused ${r.status} ${JSON.stringify(r.json).slice(0, 160)}`;
  });
  await byHand('rate-limit', async () => {
    world!.arm(spec.provider, 'ratelimit');
    http.advance(60_000);
    const run = await runNow();
    world!.clear(spec.provider);
    const conn = (await http.get(`/api/connections/${id}/sync`)).json.connection;
    return run?.status !== 'error' && conn.status !== 'error' ? true : `rate limit: run ${run?.status}, connection ${conn.status}`;
  });
  await byHand('revoked', async () => {
    world!.arm(spec.provider, 'revoked');
    http.advance(60_000);
    await runNow();
    const conn = (await http.get(`/api/connections/${id}/sync`)).json.connection;
    return conn.status === 'error' ? true : `withdrawn key not shown as a problem (${conn.status})`;
  });
  await step('reconnect', async () => {
    world?.clear(spec.provider);
    const r = await http.post('/api/connections/key', { provider: spec.provider, values: keyValues });
    if (r.json?.id !== id) return `reconnect made a second connection (${r.status})`;
    const run = await runNow();
    return run?.status !== 'error' && (await http.get(`/api/connections/${id}/sync`)).json.connection.status !== 'error' ? true : 'still broken';
  });
  await step('disconnect', async () => {
    const before = (await tickets()).filter((x) => linkOf(x)).length;
    if ((await http.del(`/api/connections/${id}`)).status !== 200) return 'disconnect refused';
    const after = await tickets();
    if (real && !before) return after.some((x) => linkOf(x)) ? 'links kept after disconnect' : true;
    return before && after.length >= before && !after.some((x) => linkOf(x)) ? true : `tickets after disconnect: ${after.length} (had ${before} linked)`;
  });
  return { steps, connectedMs, firstDataMs };
}

/**
 * Jira: connect with an API token → choose projects and the board → first sync brings epics, issues and sprints
 * as tasks → a change there → a change here (goes out, status as a transition) → rate limit → withdrawn token →
 * reconnect → disconnect (the tasks stay on the board).
 */
export async function runJiraFlow(http: Http, world: VendorWorld | null, spec: { provider: string; project: string; task: string }, real?: RealSide) {
  const steps: Step[] = [];
  const mock = real ? null : world!.mock(spec.provider);
  mock?.reset();
  world?.clear(spec.provider);
  let id = '';
  let board = '';
  const t0 = Date.now();
  const step = stepper(steps);
  const byHand = async (name: string, fn: () => Promise<boolean | string>) => (real ? void steps.push({ step: name, ok: true, ms: 0, note: BY_HAND }) : step(name, fn));
  const runNow = async () => (await http.post(`/api/connections/${id}/sync/run`, {})).json?.run;
  const tasks = async () => ((await http.get(`/api/boards/${board}/tasks`)).json.tasks ?? []) as any[];
  const keyValues = real ? real.keyValues : mock!.keyValues;
  const project = real?.project ?? spec.project;
  const seeded = real?.expect ?? spec.task;
  let current = seeded;
  await step('find', async () => ((await http.get('/api/connections')).json.providers.find((x: any) => x.id === spec.provider)?.available ? true : 'not offered'));
  await step('connect', async () => {
    const r = await http.post('/api/connections/key', { provider: spec.provider, values: keyValues });
    if (r.status >= 300) return `refused ${r.status} ${JSON.stringify(r.json).slice(0, 160)}`;
    id = r.json.id;
    return true;
  });
  const connectedMs = Date.now() - t0;
  if (!id) return { steps, connectedMs, firstDataMs: null as number | null };
  await step('map', async () => {
    const b = await http.post('/api/boards', { name: `Product (${Date.now().toString(36)})`, visibility: 'org', columns: pmColumns('en') });
    board = b.json?.board?.id;
    const saved = await http.put(`/api/connections/${id}/jira`, { projects: [project], boardId: board });
    return saved.status === 200 ? true : `mapping refused ${saved.status} ${JSON.stringify(saved.json).slice(0, 160)}`;
  });
  let firstDataMs: number | null = null;
  await step('first-sync', async () => {
    const run = await runNow();
    firstDataMs = Date.now() - t0;
    if (run?.status !== 'ok') return `run ${run?.status} ${JSON.stringify(run?.errors).slice(0, 200)}`;
    if (real && !real.expect) return (await tasks()).length ? true : `nothing came from project ${project}`;
    return (await tasks()).some((t) => t.title === seeded) ? true : `"${seeded}" not on the board`;
  });
  await byHand('edit-there', async () => {
    http.advance(120_000);
    mock!.remoteEdit!(world!.ctl(spec.provider), `${spec.task} (renamed)`);
    const run = await runNow();
    if (run?.status === 'error') return `run error ${JSON.stringify(run.errors).slice(0, 160)}`;
    current = `${spec.task} (renamed)`;
    return (await tasks()).some((t) => t.title === current) ? true : 'change there did not arrive';
  });
  await step('edit-here', async () => {
    const all = await tasks();
    const t = all.find((x) => x.title === current) ?? (real ? all[0] : undefined);
    if (!t) return `"${current}" not on the board`;
    const from = world?.calls.length ?? 0;
    const moved = await http.patch(`/api/tasks/${t.id}`, { baseVersion: t.version, status: 'code_review' });
    if (moved.status !== 200) return `move refused ${moved.status} ${JSON.stringify(moved.json).slice(0, 120)}`;
    await http.settle();
    return wroteThere(http, id, real, () => {
      const wrote = world!.calls.slice(from).find((c) => c.vendor === spec.provider && /transitions/.test(c.url) && c.method === 'POST' && c.status < 300);
      return wrote ? true : `status change not sent as a transition (${JSON.stringify(world!.calls.slice(from).map((c) => `${c.method} ${c.status}`))})`;
    });
  });
  await byHand('rate-limit', async () => {
    world!.arm(spec.provider, 'ratelimit');
    http.advance(60_000);
    const run = await runNow();
    world!.clear(spec.provider);
    const conn = (await http.get(`/api/connections/${id}/sync`)).json.connection;
    return run?.status !== 'error' && conn.status !== 'error' ? true : `rate limit: run ${run?.status}, connection ${conn.status}`;
  });
  await byHand('revoked', async () => {
    world!.arm(spec.provider, 'revoked');
    http.advance(60_000);
    await runNow();
    return (await http.get(`/api/connections/${id}/sync`)).json.connection.status === 'error' ? true : 'withdrawn token not shown as a problem';
  });
  await step('reconnect', async () => {
    world?.clear(spec.provider);
    const r = await http.post('/api/connections/key', { provider: spec.provider, values: keyValues });
    if (r.json?.id !== id) return `reconnect made a second connection (${r.status})`;
    const run = await runNow();
    return run?.status !== 'error' ? true : `still broken: ${JSON.stringify(run?.errors).slice(0, 160)}`;
  });
  await step('disconnect', async () => {
    const before = (await tasks()).length;
    if ((await http.del(`/api/connections/${id}`)).status !== 200) return 'disconnect refused';
    return (await tasks()).length === before ? true : 'tasks were removed with the connection';
  });
  return { steps, connectedMs, firstDataMs };
}

/**
 * A mailbox (Gmail, Outlook): sign in → first read attaches a customer's mail to that customer's timeline → a new
 * mail arrives → a reply is sent from Curahold and logged → rate limit → withdrawn access → reconnect →
 * disconnect (what was attached stays).
 */
export async function runMailboxFlow(http: Http, world: VendorWorld | null, spec: { provider: string; customer: string; subject: string }, real?: RealSide) {
  const steps: Step[] = [];
  const mock = real ? null : world!.mock(spec.provider);
  mock?.reset();
  world?.clear(spec.provider);
  let id = '';
  let account = '';
  const t0 = Date.now();
  const step = stepper(steps);
  const byHand = async (name: string, fn: () => Promise<boolean | string>) => (real ? void steps.push({ step: name, ok: true, ms: 0, note: BY_HAND }) : step(name, fn));
  const runNow = async () => (await http.post(`/api/connections/${id}/sync/run`, {})).json?.run;
  const mail = async () => ((await http.get(`/api/accounts/${account}/timeline`)).json.items ?? []).filter((i: any) => i.type === 'activity' && i.activity?.source === spec.provider);
  const subject = real?.expect ?? spec.subject;
  const signIn = async (reconnect: string) => {
    const go = await http.location(`/api/connect/${spec.provider}/start${reconnect ? `?reconnect=${reconnect}` : ''}`);
    if (!go || !/^https:/.test(go)) return `start went to ${go}`;
    const done = real ? await real.signIn!(go) : await http.location(mock!.consent!(new URL(go), world!.ctl(spec.provider)));
    const m = done && /\/settings\/sources\/([0-9a-f-]{36})/.exec(done);
    return m ? m[1] : `callback went to ${done}`;
  };
  await step('find', async () => ((await http.get('/api/connections')).json.providers.find((x: any) => x.id === spec.provider)?.available ? true : 'not offered'));
  await step('connect', async () => {
    const r = await signIn('');
    if (!/^[0-9a-f-]{36}$/.test(r)) return r;
    id = r;
    return true;
  });
  const connectedMs = Date.now() - t0;
  if (!id) return { steps, connectedMs, firstDataMs: null as number | null };
  let firstDataMs: number | null = null;
  await step('first-read', async () => {
    account = ((await http.get(`/api/accounts?q=${encodeURIComponent(spec.customer)}`)).json.accounts as any[]).find((a) => a.name === spec.customer)?.id;
    const run = await runNow();
    firstDataMs = Date.now() - t0;
    if (run?.status === 'error') return `run error ${JSON.stringify(run.errors).slice(0, 160)}`;
    if (real && !real.expect) return true;
    const got = await mail();
    return got.some((i: any) => JSON.stringify(i).includes(subject)) ? true : `no "${subject}" on ${spec.customer}'s timeline (${got.length} mails)`;
  });
  await byHand('new-mail', async () => {
    http.advance(120_000);
    mock!.remoteEdit!(world!.ctl(spec.provider), 'Second question');
    await runNow();
    return (await mail()).some((i: any) => JSON.stringify(i).includes('Second question')) ? true : 'the new mail did not arrive';
  });
  await step('reply', async () => {
    const first = (await mail()).find((i: any) => JSON.stringify(i).includes(subject));
    if (real && !first) return 'skipped: no seeded mail to answer (set the expected subject)';
    // Against a real mailbox the reply goes to the address named for it (REAL_MAIL_TO), never to an invented one.
    const to = real ? process.env.REAL_MAIL_TO : 'buyer@quillfield.example';
    if (!to) return 'skipped: REAL_MAIL_TO not set';
    const r = await http.post(`/api/connections/${id}/mail/reply`, { accountId: account, to, subject: `Re: ${subject}`, body: 'It renews on 1 February.', inReplyTo: first?.activity?.externalId });
    return r.status === 200 ? true : `reply refused ${r.status} ${JSON.stringify(r.json).slice(0, 160)}`;
  });
  await byHand('rate-limit', async () => {
    world!.arm(spec.provider, 'ratelimit');
    http.advance(60_000);
    const run = await runNow();
    world!.clear(spec.provider);
    const conn = (await http.get(`/api/connections/${id}/sync`)).json.connection;
    return run?.status !== 'error' && conn.status !== 'error' ? true : `rate limit: run ${run?.status}, connection ${conn.status}`;
  });
  await byHand('revoked', async () => {
    world!.arm(spec.provider, 'revoked');
    http.advance(3_700_000);
    await runNow();
    return (await http.get(`/api/connections/${id}/sync`)).json.connection.status === 'error' ? true : 'withdrawn access not shown as a problem';
  });
  await step('reconnect', async () => {
    world?.clear(spec.provider);
    if ((await signIn(id)) !== id) return 'reconnect did not come back to the same connection';
    const run = await runNow();
    return run?.status !== 'error' ? true : 'still broken';
  });
  await step('disconnect', async () => {
    const before = (await mail()).length;
    if ((await http.del(`/api/connections/${id}`)).status !== 200) return 'disconnect refused';
    return (await mail()).length === before ? true : 'attached mail was removed with the connection';
  });
  return { steps, connectedMs, firstDataMs };
}
