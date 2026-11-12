// Spreadsheets as a source: Google Sheets and Excel files in OneDrive or
// SharePoint. Each tab is an object, the header row gives the fields, and
// rows are matched by a key column the administrator picks (a customer
// number, or the name). Every run reads the whole tab; only rows whose
// mapped values changed are applied.
import { guessFieldType, HEADER_HINTS } from '../../../../shared/src/fields';
import type { RemoteField, RemoteFieldType, RemoteObject } from '../../../../shared/src/sync';
import { base64url } from '../../lib/crypto';
import { call, codeGrant, CrmError, refreshGrant, type CrmAdapter, type CrmCtx } from './types';

const MAX_ROWS = 20_000;

interface Grid {
  header: string[];
  /** Data rows (header excluded); sheet row number = index + firstRow + 1. */
  rows: unknown[][];
  /** Sheet row number of the header (1-based). */
  firstRow: number;
  /** Column offset of the header's first cell (0-based). */
  firstCol: number;
}

export function colLetter(n: number): string {
  let s = '';
  for (n += 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function parseA1(address: string): { row: number; col: number } {
  const cell = address.split('!').pop()!.split(':')[0].replace(/\$/g, '');
  const m = /^([A-Z]+)(\d+)$/i.exec(cell);
  if (!m) return { row: 1, col: 0 };
  let col = 0;
  for (const ch of m[1].toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { row: Number(m[2]), col: col - 1 };
}

const cellText = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

function header(rows: unknown[][]): string[] {
  const seen = new Set<string>();
  return (rows[0] ?? []).map((h, i) => {
    let name = cellText(h) || colLetter(i);
    while (seen.has(name)) name = `${name} (${colLetter(i)})`;
    seen.add(name);
    return name;
  });
}

function fieldsOf(grid: Grid): RemoteField[] {
  return grid.header.map((name, i) => {
    const values = grid.rows.slice(0, 200).map((r) => cellText(r[i]));
    let type: RemoteFieldType;
    if (HEADER_HINTS.owner.test(name)) type = 'person';
    else {
      const g = guessFieldType(values, 'tr');
      const filled = values.filter(Boolean);
      // A column where every value is different is an identifier or a name, not a choice.
      type = g === 'select' && new Set(filled).size === filled.length ? 'text' : g;
    }
    const distinct = [...new Set(values.filter(Boolean))];
    return {
      name,
      label: name,
      type,
      options: type === 'select' ? distinct.slice(0, 100).map((v) => ({ value: v, label: v })) : undefined,
      updatable: true,
      createable: true,
    };
  });
}

/** One read per tab per run, shared by every update in that run. */
const cache = new WeakMap<CrmCtx, Map<string, Grid>>();

interface Backend {
  tabs(ctx: CrmCtx): Promise<string[]>;
  read(ctx: CrmCtx, tab: string): Promise<Grid>;
  write(ctx: CrmCtx, tab: string, cells: { row: number; col: number; value: unknown }[]): Promise<void>;
}

async function grid(ctx: CrmCtx, b: Backend, tab: string, fresh = false): Promise<Grid> {
  let m = cache.get(ctx);
  if (!m) cache.set(ctx, (m = new Map()));
  if (!fresh && m.has(tab)) return m.get(tab)!;
  const g = await b.read(ctx, tab);
  if (g.rows.length > MAX_ROWS) throw new CrmError(`The tab "${tab}" has more than ${MAX_ROWS} rows`);
  m.set(tab, g);
  return g;
}

function tabular(provider: 'gsheets' | 'excel', b: Backend, rest: Pick<CrmAdapter, 'oauth' | 'refresh' | 'url'>): CrmAdapter {
  const keyIndex = (g: Grid, key: string | undefined) => {
    const i = g.header.indexOf(key ?? '');
    if (i < 0) throw new CrmError(`Column "${key}" is missing in the sheet`);
    return i;
  };
  return {
    provider,
    tabular: true,
    ...rest,
    async objects(ctx) {
      if (!ctx.config.file?.id) return [];
      const tabs = await b.tabs(ctx);
      return tabs.map<RemoteObject>((t, i) => ({ name: t, label: t, labelPlural: t, custom: false, hint: i === 0 ? 'account' : null }));
    },
    async fields(ctx, object) {
      return fieldsOf(await grid(ctx, b, object, true));
    },
    async users() {
      return [];
    },
    async list(ctx, object, opts) {
      const g = await grid(ctx, b, object, true);
      const k = keyIndex(g, opts.key);
      const seen = new Set<string>();
      const rows = [];
      for (const r of g.rows) {
        const id = cellText(r[k]);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const values: Record<string, unknown> = {};
        g.header.forEach((h, i) => (values[h] = r[i] === '' ? null : (r[i] ?? null)));
        rows.push({ id, modifiedAt: null, values });
      }
      return { rows, next: null };
    },
    async update(ctx, object, id, values, _fields, key) {
      const g = await grid(ctx, b, object);
      const k = keyIndex(g, key);
      const idx = g.rows.findIndex((r) => cellText(r[k]) === id);
      if (idx < 0) throw new CrmError(`Row "${id}" is no longer in the sheet`, 404);
      const cells = Object.entries(values)
        .map(([h, v]) => ({ col: g.header.indexOf(h), value: v }))
        .filter((c) => c.col >= 0)
        .map((c) => ({ row: g.firstRow + 1 + idx, col: g.firstCol + c.col, value: c.value ?? '' }));
      if (cells.length) await b.write(ctx, object, cells);
      for (const c of cells) g.rows[idx][c.col - g.firstCol] = c.value;
    },
    async create(ctx, object, values, _fields, key) {
      const g = await grid(ctx, b, object);
      const k = keyIndex(g, key);
      const id = cellText(values[g.header[k]]) || `CH-${base64url(crypto.getRandomValues(new Uint8Array(6)))}`;
      const row = g.header.map((h, i) => (i === k ? id : (values[h] ?? '')));
      const at = g.firstRow + 1 + g.rows.length;
      await b.write(ctx, object, row.map((value, i) => ({ row: at, col: g.firstCol + i, value })));
      g.rows.push(row);
      return id;
    },
  };
}

// ------------------------------------------------------------- Google Sheets

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const quoteTab = (t: string) => `'${t.replace(/'/g, "''")}'`;

export function googleSheetId(url: string): string | null {
  const m = /\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/.exec(url) ?? /^([A-Za-z0-9_-]{30,})$/.exec(url.trim());
  return m ? m[1] : null;
}

const googleBackend: Backend = {
  async tabs(ctx) {
    const j = await call(ctx, `${SHEETS}/${ctx.config.file.id}?fields=sheets.properties(title,index)`);
    return (j?.sheets ?? []).sort((a: any, b: any) => a.properties.index - b.properties.index).map((s: any) => s.properties.title);
  },
  async read(ctx, tab) {
    const j = await call(ctx, `${SHEETS}/${ctx.config.file.id}/values/${encodeURIComponent(quoteTab(tab))}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`);
    const values: unknown[][] = j?.values ?? [];
    const start = parseA1(j?.range ?? 'A1');
    return { header: header(values), rows: values.slice(1), firstRow: start.row, firstCol: start.col };
  },
  async write(ctx, tab, cells) {
    await call(ctx, `${SHEETS}/${ctx.config.file.id}/values:batchUpdate`, {
      method: 'POST',
      json: { valueInputOption: 'USER_ENTERED', data: cells.map((c) => ({ range: `${quoteTab(tab)}!${colLetter(c.col)}${c.row}`, values: [[c.value]] })) },
    });
  },
};

export const gsheets = tabular('gsheets', googleBackend, {
  oauth: {
    authorizeUrl(client, redirectUri, state) {
      const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      u.searchParams.set('client_id', client.clientId);
      u.searchParams.set('redirect_uri', redirectUri);
      u.searchParams.set('response_type', 'code');
      u.searchParams.set('scope', 'openid email https://www.googleapis.com/auth/spreadsheets');
      u.searchParams.set('access_type', 'offline');
      u.searchParams.set('prompt', 'consent');
      u.searchParams.set('state', state);
      return u.toString();
    },
    async exchange(fetcher, client, code, redirectUri, _opts, now) {
      const j = await codeGrant(fetcher, GOOGLE_TOKEN, client, code, redirectUri, now);
      const email = j.id_token ? String(JSON.parse(atob(j.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).email ?? '') : '';
      return { secret: { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: j.expiresAt }, config: { account: email || null }, label: email || 'Google Sheets', instanceId: email || 'google' };
    },
  },
  async refresh(ctx, secret, client) {
    if (!secret.refreshToken) throw new CrmError('Reconnect Google Sheets', 401, undefined, true);
    return refreshGrant(ctx.fetch, GOOGLE_TOKEN, client, secret.refreshToken, ctx.now());
  },
  url(config) {
    return config.file?.id ? `https://docs.google.com/spreadsheets/d/${config.file.id}/edit` : null;
  },
});

export async function resolveGoogleFile(ctx: CrmCtx, url: string) {
  const id = googleSheetId(url);
  if (!id) throw new CrmError('That is not a Google Sheets link', 400);
  const j = await call(ctx, `${SHEETS}/${id}?fields=properties.title`);
  return { id, name: j?.properties?.title ?? 'Sheet', url: `https://docs.google.com/spreadsheets/d/${id}/edit` };
}

// ------------------------------------------------------------ Excel (Graph)

const GRAPH = 'https://graph.microsoft.com/v1.0';
const MS = 'https://login.microsoftonline.com/organizations/oauth2/v2.0';
const MS_SCOPE = 'openid email offline_access User.Read Files.ReadWrite.All';
const book = (ctx: CrmCtx) => `${GRAPH}/drives/${encodeURIComponent(ctx.config.file.driveId)}/items/${encodeURIComponent(ctx.config.file.id)}/workbook`;
const sheet = (ctx: CrmCtx, tab: string) => `${book(ctx)}/worksheets('${encodeURIComponent(tab.replace(/'/g, "''"))}')`;

const excelBackend: Backend = {
  async tabs(ctx) {
    const j = await call(ctx, `${book(ctx)}/worksheets?$select=name,position`);
    return (j?.value ?? []).sort((a: any, b: any) => a.position - b.position).map((w: any) => w.name);
  },
  async read(ctx, tab) {
    const j = await call(ctx, `${sheet(ctx, tab)}/usedRange(valuesOnly=true)?$select=address,text`);
    const values: unknown[][] = j?.text ?? [];
    const start = parseA1(j?.address ?? 'A1');
    return { header: header(values), rows: values.slice(1), firstRow: start.row, firstCol: start.col };
  },
  async write(ctx, tab, cells) {
    // Neighbouring cells of a row go in one call (a new row is one call).
    const sorted = [...cells].sort((a, b) => a.row - b.row || a.col - b.col);
    let run: typeof cells = [];
    const flush = async () => {
      if (!run.length) return;
      const a = run[0];
      const z = run[run.length - 1];
      await call(ctx, `${sheet(ctx, tab)}/range(address='${colLetter(a.col)}${a.row}:${colLetter(z.col)}${z.row}')`, { method: 'PATCH', json: { values: [run.map((c) => c.value)] } });
      run = [];
    };
    for (const c of sorted) {
      const last = run[run.length - 1];
      if (last && (last.row !== c.row || last.col + 1 !== c.col)) await flush();
      run.push(c);
    }
    await flush();
  },
};

export const excel = tabular('excel', excelBackend, {
  oauth: {
    authorizeUrl(client, redirectUri, state) {
      const u = new URL(`${MS}/authorize`);
      u.searchParams.set('client_id', client.clientId);
      u.searchParams.set('response_type', 'code');
      u.searchParams.set('redirect_uri', redirectUri);
      u.searchParams.set('scope', MS_SCOPE);
      u.searchParams.set('prompt', 'select_account');
      u.searchParams.set('state', state);
      return u.toString();
    },
    async exchange(fetcher, client, code, redirectUri, _opts, now) {
      const res = await fetcher(`${MS}/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: client.clientId, client_secret: client.clientSecret, scope: MS_SCOPE }),
      });
      const j: any = await res.json().catch(() => ({}));
      if (!res.ok || !j.access_token) throw new CrmError(`Sign-in failed (${res.status})`, res.status, undefined, true);
      const claims = j.id_token ? JSON.parse(atob(j.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) : {};
      const email = String(claims.email ?? claims.preferred_username ?? '');
      return {
        secret: { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: j.expires_in ? now.getTime() + j.expires_in * 1000 : undefined },
        config: { account: email || null },
        label: email || 'Excel',
        instanceId: claims.tid ? String(claims.tid) : email || 'microsoft',
      };
    },
  },
  async refresh(ctx, secret, client) {
    if (!secret.refreshToken) throw new CrmError('Reconnect Microsoft 365', 401, undefined, true);
    return refreshGrant(ctx.fetch, `${MS}/token`, client, secret.refreshToken, ctx.now(), { scope: MS_SCOPE });
  },
  url(config) {
    return config.file?.url ?? null;
  },
});

export async function resolveExcelFile(ctx: CrmCtx, url: string) {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    throw new CrmError('That is not a OneDrive or SharePoint link', 400);
  }
  if (!/(sharepoint\.com|onedrive\.live\.com|1drv\.ms|sharepoint\.us)$/i.test(u.hostname)) throw new CrmError('That is not a OneDrive or SharePoint link', 400);
  const share = `u!${base64url(new TextEncoder().encode(u.toString()))}`;
  const j = await call(ctx, `${GRAPH}/shares/${share}/driveItem?$select=id,name,webUrl,parentReference`);
  if (!j?.id || !/\.xls[xm]$/i.test(j.name ?? '')) throw new CrmError('That link is not an Excel file', 400);
  return { id: j.id, name: j.name, url: j.webUrl ?? u.toString(), driveId: j.parentReference?.driveId };
}
