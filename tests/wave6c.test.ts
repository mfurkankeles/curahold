// Wave-6C: the mailbox reply composer's call shape and the all-departments
// board/workflow templates.
//
// Part 1 — the composer builds the exact body POST /connections/:id/mail/reply
// expects, seeded from a synced mail activity; the timeline now exposes the
// activity's external id so the reply threads onto the original; and the reply
// is sent and logged as an outgoing activity (mirrors tests/wave5c.test.ts).
// Part 2 — every template (existing and new) is well-formed, and a new template
// applies: createOrg builds its boards, including the Product delivery board
// that carries the PM stages.
import { beforeAll, describe, expect, it } from 'vitest';
import { createOrg } from '../api/src/lib/orgs';
import { PM_STAGE_KEYS, TEMPLATES, TEMPLATE_KEYS, pick } from '../shared/src/templates';
import { isMailboxProvider, MAILBOX_PROVIDERS, parseMailHeader, replyPayload, replySubject } from '../web/src/lib/mailReply';
import { Client, login, setup, type Env } from './helpers';

// --------------------------------------------------- Part 1: composer call shape (pure)

describe('mailbox reply composer — call shape', () => {
  it('reads the reply target off a received mail activity body', () => {
    const body = 'From buyer@quillfield.example\nRenewal question\n\nWhen does our plan renew?';
    expect(parseMailHeader(body)).toEqual({ to: 'buyer@quillfield.example', subject: 'Renewal question' });
  });

  it('reads the first recipient off a sent mail activity body', () => {
    const body = 'Sent to buyer@quillfield.example, cc@quillfield.example\nRe: Renewal question\n\nIt renews on 1 February.';
    expect(parseMailHeader(body)).toEqual({ to: 'buyer@quillfield.example', subject: 'Re: Renewal question' });
  });

  it('prefixes the subject with a single Re:', () => {
    expect(replySubject('Renewal question')).toBe('Re: Renewal question');
    expect(replySubject('Re: Renewal question')).toBe('Re: Renewal question');
    expect(replySubject('RE: already')).toBe('RE: already');
    expect(replySubject('')).toBe('');
  });

  it('builds the request body the route expects, threading when the activity has an external id', () => {
    const payload = replyPayload({ externalId: 'm1' }, '00000000-0000-0000-0000-000000000001', { to: '  buyer@quillfield.example ', subject: ' Re: Renewal question ', body: '  Thanks!  ' });
    expect(payload).toEqual({
      accountId: '00000000-0000-0000-0000-000000000001',
      to: 'buyer@quillfield.example',
      subject: 'Re: Renewal question',
      body: 'Thanks!',
      inReplyTo: 'm1',
    });
  });

  it('omits inReplyTo for an activity with no external id', () => {
    const payload = replyPayload({ externalId: null }, 'acc', { to: 'a@b.example', subject: 's', body: 'b' });
    expect('inReplyTo' in payload).toBe(false);
  });

  it('knows which providers are mailboxes', () => {
    expect(MAILBOX_PROVIDERS).toEqual(['gmail', 'outlook']);
    expect(isMailboxProvider('gmail')).toBe(true);
    expect(isMailboxProvider('outlook')).toBe(true);
    expect(isMailboxProvider('salesforce')).toBe(false);
  });
});

// --------------------------------------------------- Part 2: templates (pure)

describe('department templates are well-formed', () => {
  it('offers the new department templates alongside the originals', () => {
    for (const k of ['marketing', 'hr', 'it', 'finance', 'legal', 'product'] as const) expect(TEMPLATE_KEYS).toContain(k);
    // blank stays the last choice in the chooser.
    expect(TEMPLATE_KEYS[TEMPLATE_KEYS.length - 1]).toBe('blank');
  });

  it('every template has localized names, boards with unique columns and a done stage, and rules that point at its own boards', () => {
    for (const key of TEMPLATE_KEYS) {
      const tpl = TEMPLATES[key];
      expect(tpl.key, key).toBe(key);
      for (const field of [tpl.name, tpl.description]) {
        expect(pick(field, 'en').trim(), `${key} en`).not.toBe('');
        expect(pick(field, 'tr').trim(), `${key} tr`).not.toBe('');
      }
      expect(tpl.boards.length, key).toBeGreaterThan(0);
      const boardKeys = new Set<string>();
      for (const b of tpl.boards) {
        expect(boardKeys.has(b.key), `${key}/${b.key} duplicate board`).toBe(false);
        boardKeys.add(b.key);
        expect(pick(b.name, 'en').trim(), `${key}/${b.key} en`).not.toBe('');
        expect(pick(b.name, 'tr').trim(), `${key}/${b.key} tr`).not.toBe('');
        expect(b.columns.length, `${key}/${b.key} columns`).toBeGreaterThan(1);
        const colKeys = new Set<string>();
        for (const col of b.columns) {
          expect(colKeys.has(col.key), `${key}/${b.key}/${col.key} duplicate column`).toBe(false);
          colKeys.add(col.key);
          expect(pick(col.name, 'en').trim(), `${key}/${b.key}/${col.key} en`).not.toBe('');
          expect(pick(col.name, 'tr').trim(), `${key}/${b.key}/${col.key} tr`).not.toBe('');
        }
        expect(b.columns.some((c) => c.done), `${key}/${b.key} needs a done column`).toBe(true);
      }
      for (const a of tpl.automations) {
        if (a.action.type === 'create_tasks') expect(boardKeys.has(a.action.board), `${key}:${a.key} board`).toBe(true);
        if (a.trigger.type === 'task_moved' && a.trigger.boardId) expect(boardKeys.has(a.trigger.boardId), `${key}:${a.key} trigger board`).toBe(true);
      }
    }
  });

  it('the Product template delivery board carries the PM stages in order', () => {
    const delivery = TEMPLATES.product.boards.find((b) => b.key === 'delivery');
    expect(delivery).toBeTruthy();
    expect(delivery!.columns.map((c) => c.key)).toEqual([...PM_STAGE_KEYS]);
    expect(delivery!.columns.filter((c) => c.done).map((c) => c.key)).toEqual(['done']);
  });
});

// --------------------------------------------------- integration (shared company)

let env: Env;
let ada: Client;
let accountId: string;
let gmailId: string;

const MAILBOX = 'sales@acme.example';
const PARTNER = 'buyer@quillfield.example';

const gmailStub = async (url: string): Promise<Response> => {
  if (/oauth2\.googleapis\.com\/token/.test(url)) return Response.json({ access_token: 'a2', expires_in: 3600 });
  if (/\/users\/me\/profile/.test(url)) return Response.json({ emailAddress: MAILBOX });
  if (/\/users\/me\/messages\/send/.test(url)) return Response.json({ id: 'sent-1', threadId: 't1' });
  return new Response('no route', { status: 404 });
};

beforeAll(async () => {
  env = await setup();
  ada = await login(env, 'acme', 'ada@demo.example');
  env.fetchHolder.impl = gmailStub;
  accountId = (await ada.get('/api/accounts')).json.accounts[0].id;
  gmailId = (await ada.post('/api/connections/key', { provider: 'gmail', values: { refreshToken: 'r1', accessToken: 'a1' } })).json.id;
  // A synced inbound mail activity on the customer, exactly as mailsync writes it.
  await env.db.system((q) =>
    q.query(
      `insert into activities (org_id, account_id, author_id, kind, body, happened_at, source, external_id)
       values ($1, $2, null, 'email', $3, now(), 'gmail', $4)`,
      [env.a.orgId, accountId, `From ${PARTNER}\nRenewal question\n\nWhen does our plan renew?`, 'm-ext-1'],
    ),
  );
});

describe('the timeline exposes the mail external id for threading', () => {
  it('returns externalId on a synced mail activity', async () => {
    const tl = (await ada.get(`/api/accounts/${accountId}/timeline`)).json;
    const mail = tl.items.find((i: any) => i.type === 'activity' && i.activity.source === 'gmail');
    expect(mail, JSON.stringify(tl.items.map((i: any) => i.type))).toBeTruthy();
    expect(mail.activity).toMatchObject({ kind: 'email', externalId: 'm-ext-1' });
  });
});

describe('the reply endpoint accepts the composer payload and logs an outgoing activity', () => {
  it('sends with inReplyTo from the original and logs the reply', async () => {
    const payload = replyPayload({ externalId: 'm-ext-1' }, accountId, { to: PARTNER, subject: replySubject('Renewal question'), body: 'Happy to help — it renews on 1 February.' });
    const r = await ada.post(`/api/connections/${gmailId}/mail/reply`, payload);
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.json).toMatchObject({ ok: true, id: 'sent-1' });
    const [sent] = await env.db.system((q) => q.query(`select account_id, body from activities where org_id = $1 and source = 'gmail' and external_id = 'sent-1'`, [env.a.orgId]));
    expect(sent.account_id).toBe(accountId);
    expect(sent.body).toContain('Happy to help');
  });

  it('rejects a reply with no body (the composer disables Send until all fields are set)', async () => {
    const r = await ada.post(`/api/connections/${gmailId}/mail/reply`, { accountId, to: PARTNER, subject: 'Re: Renewal question', body: '' });
    expect(r.status).toBeGreaterThanOrEqual(400);
  });
});

describe('a new department template applies on company creation', () => {
  it('createOrg builds the Product template boards, delivery carrying the PM stages', async () => {
    const made = await createOrg(env.db, { slug: 'prodco6c', name: 'ProdCo', locale: 'en', template: 'product', admin: { email: 'founder@prodco.example', name: 'Pat Lee' } });
    const boards = await env.db.system((q) => q.query<{ name: string; columns: any }>('select name, columns from boards where org_id = $1 order by created_at', [made.orgId]));
    expect(boards.map((b) => b.name)).toEqual(['Delivery', 'Discovery']);
    const delivery = boards.find((b) => b.name === 'Delivery')!;
    expect((delivery.columns as { key: string }[]).map((c) => c.key)).toEqual([...PM_STAGE_KEYS]);
  });
});
