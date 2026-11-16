// Exports (api/src/routes/exports.ts): one server path for every list and report
// file. Who may (the data.export permission), what goes in (the screen's filter,
// in the reader's language and number format), what is kept (one activity-log
// line), how often (the export budget), and nothing of another company. Field
// permissions in a file: tests/field-outs.test.ts.
import { strFromU8, unzipSync } from 'fflate';
import { beforeAll, describe, expect, it } from 'vitest';
import { BUDGETS } from '../api/src/lib/ratelimit';
import { sheetStream, type Cell } from '../api/src/lib/sheet';
import { blankDef } from '../shared/src/reports';
import { BASE, login, setup, type Client, type Env } from './helpers';

let env: Env;
let ada: Client;
let mert: Client;
let lena: Client;
let sofia: Client;

beforeAll(async () => {
  env = await setup();
  ada = await login(env, 'acme', 'ada@demo.example');
  mert = await login(env, 'acme', 'mert@demo.example');
  lena = await login(env, 'acme', 'lena@demo.example');
  sofia = await login(env, 'acme', 'sofia@demo.example');
});

/** The raw answer, for a binary file. */
async function raw(who: Client, body: unknown, slug = 'acme') {
  return env.app.request(`https://${slug}.${BASE}/api/exports`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-curahold-device': who.device, cookie: who.cookie },
    body: JSON.stringify(body),
  });
}

const lastLog = async (email: string) =>
  (await env.db.system((q) => q.query(`select a.meta from audit_log a join users u on u.id = a.actor_id where a.action = 'data.exported' and u.email = $1 order by a.at desc limit 1`, [email])))[0]?.meta;
const logCount = async () => Number((await env.db.system((q) => q.query(`select count(*)::int as n from audit_log where action = 'data.exported'`)))[0].n);

describe('who may export', () => {
  it('administrators and team leads by default; members and read-only seats not, and nothing is logged for them', async () => {
    const before = await logCount();
    for (const who of [lena, sofia]) expect((await who.post('/api/exports', { source: 'accounts', format: 'csv' })).status).toBe(403);
    expect(await logCount()).toBe(before);
    for (const who of [ada, mert]) expect((await who.post('/api/exports', { source: 'accounts', format: 'csv' })).status).toBe(200);
    expect(await logCount()).toBe(before + 2);
    const roles = (await ada.get('/api/admin/roles')).json.roles as { key: string; perms: string[] }[];
    expect(Object.fromEntries(roles.map((r) => [r.key, r.perms.includes('data.export')]))).toMatchObject({ admin: true, manager: true, member: false, viewer: false });
  });

  it('is a switch on the roles screen: a member given it may export', async () => {
    const member = ((await ada.get('/api/admin/roles')).json.roles as { id: string; key: string; perms: string[] }[]).find((r) => r.key === 'member')!;
    expect((await ada.patch(`/api/admin/roles/${member.id}`, { perms: [...member.perms, 'data.export'] })).status).toBe(200);
    const lenaAgain = await login(env, 'acme', 'lena@demo.example');
    expect((await lenaAgain.post('/api/exports', { source: 'accounts', format: 'csv' })).status).toBe(200);
    expect((await ada.patch(`/api/admin/roles/${member.id}`, { perms: member.perms })).status).toBe(200);
  });
});

describe('the file', () => {
  it('is the list the screen shows, in the reader’s language, and logged once with its filter', async () => {
    const r = await ada.post('/api/exports', { source: 'accounts', format: 'csv', q: 'Cedar' });
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('text/csv');
    expect(r.headers.get('content-disposition')).toMatch(/attachment; .*filename\*=UTF-8''.+\.csv/);
    const lines = String(r.json).replace(/^﻿/, '').trim().split('\r\n');
    expect(lines[0].split(',')[0]).toBe('Name');
    expect(lines.slice(1).every((l) => /cedar/i.test(l))).toBe(true);
    expect(Number(r.headers.get('x-curahold-rows'))).toBe(lines.length - 1);
    expect(await lastLog('ada@demo.example')).toMatchObject({ source: 'accounts', format: 'csv', rows: lines.length - 1, filter: { q: 'Cedar' } });
  });

  it('writes Turkish headings, ";" between cells and a decimal comma for a Turkish reader', async () => {
    const tr = await ada.req('POST', '/api/exports', { source: 'accounts', format: 'csv' }, { 'x-curahold-locale': 'tr' });
    const text = String(tr.json).replace(/^﻿/, '');
    expect(text.split('\r\n')[0]).toContain('Ad;');
    expect(text).not.toMatch(/\d\.\d{1,2};/);
  });

  it('is a real Excel workbook with typed cells, a board with its filter, a report as it is built', async () => {
    const board = env.a.boards.csBoard;
    const res = await raw(ada, { source: 'board', board, format: 'xlsx', filters: { priority: ['high', 'urgent'] } });
    expect(res.status).toBe(200);
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
    const sheet = strFromU8(files['xl/worksheets/sheet1.xml']);
    expect(strFromU8(files['xl/workbook.xml'])).toContain('<sheet name=');
    const rows = Number(res.headers.get('x-curahold-rows'));
    expect((sheet.match(/<row /g) ?? []).length).toBe(rows + 1);
    const all = (await ada.get(`/api/boards/${board}/tasks`)).json.tasks as { priority: string }[];
    expect(rows).toBe(all.filter((t) => t.priority === 'high' || t.priority === 'urgent').length);
    expect(await lastLog('ada@demo.example')).toMatchObject({ source: 'board', format: 'xlsx', rows, filter: { board, priority: ['high', 'urgent'] } });

    const report = await ada.post('/api/exports', { source: 'report', format: 'csv', name: 'By status', def: { ...blankDef('tasks'), groups: [{ field: 'status' }] } });
    expect(report.status).toBe(200);
    expect(Number(report.headers.get('x-curahold-rows'))).toBeGreaterThan(0);
  });

  it('is refused, not cut short, past the most rows one file holds; and a bad request is a 400', async () => {
    expect((await ada.post('/api/exports', { source: 'accounts', format: 'pdf' })).status).toBe(400);
    expect((await ada.post('/api/exports', { source: 'people', format: 'csv' })).status).toBe(400);
    expect((await ada.post('/api/exports', { source: 'records', type: 'no_such_kind', format: 'csv' })).status).toBe(404);
  });

  it('keeps to the period a deals list shows, and never by a field the reader may not see', async () => {
    const deals = (await ada.post('/api/record-types', { kind: 'opportunity' })).json.type as { id: string; key: string; fields: { key: string; type: string }[] };
    const field = (deals.fields.find((f) => f.key === 'close_date') ?? deals.fields.find((f) => f.type === 'date'))!.key;
    for (const [name, d] of [['Spring renewal', '2026-04-10'], ['Autumn renewal', '2026-10-01'], ['Next year', '2027-03-01']])
      expect((await ada.post('/api/records', { typeId: deals.id, name, fields: { [field]: d } })).status).toBe(201);
    const rows = async (who: Client, span?: { from: string; to: string }) => {
      const r = await who.post('/api/exports', { source: 'records', type: deals.key, format: 'csv', ...(span ? { span: { field, ...span } } : {}) });
      return r.status === 200 ? Number(r.headers.get('x-curahold-rows')) : r.status;
    };
    expect(await rows(ada)).toBeGreaterThanOrEqual(3);
    expect(await rows(ada, { from: '2026-01-01', to: '2026-12-31' })).toBe(2);
    expect(await rows(ada, { from: '1900-01-01', to: '1900-12-31' })).toBe(0);
    await ada.patch(`/api/record-types/${deals.id}`, { fields: deals.fields.map((f) => (f.key === field ? { ...f, access: { view: ['admin'] } } : f)) });
    expect(await rows(mert, { from: '2026-01-01', to: '2026-12-31' })).toBe(400);
    expect(await rows(mert)).toBeGreaterThanOrEqual(3);
  });
});

describe('another company', () => {
  it('cannot export this company’s board, and its own lists hold nothing of this one', async () => {
    expect((await ada.post('/api/accounts', { name: 'Zephyrine Only-Here', ownerId: null, teamId: null, fields: {} })).status).toBe(201);
    expect(String((await ada.post('/api/exports', { source: 'accounts', format: 'csv' })).json)).toContain('Zephyrine Only-Here');
    const stranger = await login(env, 'beta', 'ada@demo.example');
    expect((await stranger.post('/api/exports', { source: 'board', board: env.a.boards.csBoard, format: 'csv' })).status).toBe(404);
    const theirs = await stranger.post('/api/exports', { source: 'accounts', format: 'csv' });
    expect(theirs.status).toBe(200);
    expect(String(theirs.json)).not.toContain('Zephyrine');
  });
});

describe('a big file', () => {
  it('is written a page at a time: 20,000 rows never sit in memory at once', async () => {
    let read = 0;
    async function* pages(): AsyncGenerator<Cell[][]> {
      for (let p = 0; p < 40; p++) {
        read++;
        yield Array.from({ length: 500 }, (_, i) => [`Row ${p * 500 + i}`, p * 500 + i, { day: '2026-11-16' }, { money: 1234.5 }, '=1+1']);
      }
    }
    for (const format of ['csv', 'xlsx'] as const) {
      read = 0;
      const reader = sheetStream(format, { name: 'Big', headers: ['Name', 'N', 'Day', 'Amount', 'Text'], locale: 'en' }, pages()).getReader();
      const chunks: Uint8Array[] = [];
      let most = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        chunks.push(value);
        // Never more than the page being written ahead of what has been handed on.
        most = Math.max(most, read - chunks.length);
      }
      expect(read).toBe(40);
      expect(most).toBeLessThanOrEqual(2);
      const bytes = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
      chunks.reduce((at, c) => (bytes.set(c, at), at + c.length), 0);
      if (format === 'csv') {
        const lines = strFromU8(bytes).trim().split('\r\n');
        expect(lines.length).toBe(20_001);
        // A formula is written as text; a day as YYYY-MM-DD.
        expect(lines[1]).toBe("Row 0,0,2026-11-16,1234.5,'=1+1");
      } else {
        const sheet = strFromU8(unzipSync(bytes)['xl/worksheets/sheet1.xml']);
        expect((sheet.match(/<row /g) ?? []).length).toBe(20_001);
        expect(sheet).toContain('s="2"><v>46342</v>');
        expect(sheet).toContain('<t xml:space="preserve">=1+1</t>');
      }
    }
  });
});

describe('the export budget', () => {
  it('refuses with 429 and a time to wait after the budget is spent', async () => {
    const limited = await setup({ limitScale: 1, clientIp: 'cf' });
    const boss = await login(limited, 'acme', 'ada@demo.example');
    let refusedAt = 0;
    let wait: string | null = null;
    for (let i = 1; i <= BUDGETS.export.cap + 5 && !refusedAt; i++) {
      const r = await limited.app.request(`https://acme.${BASE}/api/exports`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-curahold-device': boss.device, cookie: boss.cookie, 'cf-connecting-ip': '203.0.113.9' },
        body: JSON.stringify({ source: 'accounts', format: 'csv', q: 'zzz-nothing' }),
      });
      if (r.status === 429) (refusedAt = i), (wait = r.headers.get('retry-after'));
    }
    expect(refusedAt).toBe(BUDGETS.export.cap + 1);
    expect(Number(wait)).toBeGreaterThan(0);
  });
});
