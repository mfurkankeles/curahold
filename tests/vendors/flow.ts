// One customer-style run of an integration, the same steps an administrator takes in Settings → Data
// sources, through the API those screens call: find it → connect → pick and map → preview → first sync →
// a change there → a change here → both at once → expired token → withdrawn access → rate limit →
// bad field → reconnect → disconnect. Each step is timed; the result says what happened, not what should.
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

  await step('map', async () => {
    const objects = (await http.get(`/api/connections/${id}/objects`)).json.objects as any[];
    const picked = [];
    for (const o of spec.objects) {
      if (!objects.some((x) => x.name === o.remote)) return `object ${o.remote} not offered`;
      const query = o.target === 'account' ? 'kind=account' : `kind=${o.kind}`;
      const suggested = (await http.get(`/api/connections/${id}/objects/${o.remote}/fields?${query}`)).json.suggested;
      picked.push({ remote: o.remote, label: o.remote, target: o.target, ...(o.target === 'record' ? { typeKey: '__new', kind: o.kind } : {}), enabled: true, create: true, fields: suggested });
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
    return (await accounts(spec.expect)).length === 1 ? true : `${spec.expect} not here after first sync`;
  });

  const vendorSide = async (name: string, fn: () => Promise<boolean | string>) => (real ? void steps.push({ step: name, ok: true, ms: 0, note: 'skipped: needs a change made by hand in the vendor' }) : step(name, fn));

  await vendorSide('edit-there', async () => {
    http.advance(60_000);
    mock!.remoteEdit!(world!.ctl(spec.provider), 'Orbital Freight Ltd');
    const run = await runNow();
    if (run?.status === 'error') return `run error ${JSON.stringify(run.errors)}`;
    return (await accounts('Orbital Freight Ltd')).length === 1 ? true : 'change there did not arrive';
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
    const other = (await accounts('Orbital Freight Ltd'))[0];
    world!.arm(spec.provider, 'ratelimit', 3);
    await http.patch(`/api/accounts/${other.id}`, { name: 'Orbital Freight (here)' });
    await http.settle();
    world!.clear(spec.provider);
    http.advance(60_000);
    mock!.remoteEdit!(world!.ctl(spec.provider), 'Orbital Freight (there)');
    http.advance(60_000);
    const run = await runNow();
    if (run?.status === 'error') return `run error ${JSON.stringify(run.errors)}`;
    const now = (await http.get(`/api/accounts/${other.id}`)).json.account.name;
    return now === 'Orbital Freight (there)' ? true : `newer change did not win (here shows "${now}")`;
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
export async function runAccountingFlow(http: Http, world: VendorWorld, spec: { provider: string; customer: string }) {
  const steps: Step[] = [];
  const mock = world.mock(spec.provider);
  mock.reset();
  world.clear(spec.provider);
  let id = '';
  const t0 = Date.now();
  const step = async (name: string, fn: () => Promise<boolean | string>) => {
    const s = Date.now();
    let r: boolean | string = false;
    try {
      r = await fn();
    } catch (e) {
      r = (e as Error).message.slice(0, 200);
    }
    steps.push({ step: name, ok: r === true, ms: Date.now() - s, ...(typeof r === 'string' ? { note: r } : {}) });
  };
  const runNow = async () => (await http.post(`/api/connections/${id}/sync/run`, {})).json?.run;
  const customer = async () => ((await http.get(`/api/accounts?q=${encodeURIComponent(spec.customer)}`)).json.accounts as any[]).find((a) => a.name === spec.customer);

  await step('find', async () => ((await http.get('/api/connections')).json.providers.find((x: any) => x.id === spec.provider)?.available ? true : 'not offered'));
  await step('connect', async () => {
    const r = await http.post('/api/connections/key', { provider: spec.provider, values: mock.keyValues });
    if (r.status >= 300) return `refused ${r.status}`;
    id = r.json.id;
    return true;
  });
  const connectedMs = Date.now() - t0;
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
    const f = (await http.get(`/api/accounts/${c.id}/finance`)).json.finance;
    return f ? true : 'no money on the customer page';
  });
  await step('rate-limit', async () => {
    world.arm(spec.provider, 'ratelimit');
    http.advance(3_600_000);
    const run = await runNow();
    world.clear(spec.provider);
    const conn = (await http.get(`/api/connections/${id}/sync`)).json.connection;
    return run?.status !== 'error' && conn.status !== 'error' ? true : `rate limit: run ${run?.status}, connection ${conn.status}`;
  });
  await step('revoked', async () => {
    world.arm(spec.provider, 'revoked');
    http.advance(3_600_000);
    await runNow();
    const conn = (await http.get(`/api/connections/${id}/sync`)).json.connection;
    return conn.status === 'error' ? true : `withdrawn key not shown as a problem (${conn.status})`;
  });
  await step('reconnect', async () => {
    world.clear(spec.provider);
    const r = await http.post('/api/connections/key', { provider: spec.provider, values: mock.keyValues });
    if (r.json?.id !== id) return 'reconnect made a second connection';
    await runNow();
    return (await http.get(`/api/connections/${id}/sync`)).json.connection.status !== 'error' ? true : 'still broken';
  });
  await step('disconnect', async () => {
    const c = await customer();
    if ((await http.del(`/api/connections/${id}`)).status !== 200) return 'disconnect refused';
    if (!(await customer())) return 'customer removed';
    const f = (await http.get(`/api/accounts/${c.id}/finance`)).json.finance;
    return f ? 'money from the program still shown after disconnect' : true;
  });
  return { steps, connectedMs, firstDataMs };
}
