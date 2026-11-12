// Curahold's own support desk: the queue of help requests across companies,
// one request with everything on it (the team's own notes included), an
// answer or a note, and the door incoming mail comes through.
//
// These addresses are central (no company in the host). A member of
// Curahold's team signs in with a one-time code sent to their own address
// (the addresses in SUPPORT_STAFF); tooling can still use the staff key. The
// mail door opens with its own key. Nothing here is reachable with a
// company's session, an API key or an app token, and the desk's own tables
// have no grant for the application's database role.
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import { HELP_STATUSES } from '../../../shared/src/help';
import { nowOf, orgUrl, type AppEnv, type C } from '../context';
import type { Q } from '../db';
import { hmacHex, randomDigits, randomToken, safeEqual, sha256Hex, sign, verify } from '../lib/crypto';
import { fail } from '../lib/errors';
import { addHelpMessage, takeMail } from '../lib/helpThread';
import { ENTRY_LINK_MINUTES, mayGrant, SUPPORT_SESSION_HOURS } from '../lib/support';
import { body } from '../lib/validate';

export const deskRoutes = new Hono<AppEnv>();

export const DESK_COOKIE = 'desk_session';
const SESSION_HOURS = 8;
const CODE_MINUTES = 10;
const CODES_PER_HOUR = 5;
const TRIES_PER_CODE = 5;
const REF = /^CH-\d{6,}$/;

interface Staff {
  /** Who is acting; "key" when tooling uses the staff key and names nobody. */
  email: string;
  via: 'session' | 'key';
}

const staffList = (c: C) => c.get('deps').config.support?.staff ?? [];
/** A separate secret for desk sessions, so nothing else this server signs can pass for one. */
const deskSecret = (c: C) => `${c.get('deps').config.authSecret}:desk`;
/** The desk answers at the central address only (its port, if any, is not part of the name). */
const onCentral = (c: C) => (c.req.header('host') ?? new URL(c.req.url).host).toLowerCase().split(':')[0] === c.get('deps').config.centralHost.toLowerCase().split(':')[0];

/** The staff key (tooling), or the session of someone still on the staff list. */
async function staffOnly(c: C): Promise<Staff> {
  const key = c.get('deps').config.staffKey;
  const given = c.req.header('x-curahold-staff-key') ?? '';
  if (key && key.length >= 24 && given && safeEqual(given, key)) return { email: 'key', via: 'key' };
  const token = getCookie(c, DESK_COOKIE);
  if (token && onCentral(c)) {
    const t = await verify<{ desk: number; e: string; x: number }>(token, deskSecret(c));
    if (t && t.desk === 1 && typeof t.e === 'string' && t.x > nowOf(c.get('deps')).getTime() && staffList(c).includes(t.e)) {
      // A form on another site cannot set a header: every change made with the cookie must carry this one.
      if (c.req.method !== 'GET' && c.req.method !== 'HEAD' && c.req.header('x-curahold-desk') !== '1') fail('forbidden');
      return { email: t.e, via: 'session' };
    }
  }
  return fail('forbidden');
}
const note = (q: Q, staff: Staff, action: string, ref?: string | null, orgId?: string | null, messageId?: string | null) =>
  q.query('insert into desk_log (staff_email, action, ref, org_id, message_id) values ($1, $2, $3, $4, $5)', [staff.email, action, ref ?? null, orgId ?? null, messageId ?? null]);
/** "ada.lovelace@…" → "Ada Lovelace", for the name an answer is signed with when none is given. */
const nameFrom = (email: string) =>
  email
    .split('@')[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ') || 'Curahold';

// ------------------------------------------------------------- signing in

/** Step one: a code goes to the address if it is on the staff list. The answer is the same either way. */
deskRoutes.post('/sign-in', async (c) => {
  if (!onCentral(c)) fail('not_found');
  const { email } = await body(c, z.object({ email: z.string().trim().toLowerCase().email().max(320) }));
  const deps = c.get('deps');
  let devCode: string | undefined;
  if (staffList(c).includes(email)) {
    const code = randomDigits(6);
    const made = await deps.db.system(async (q) => {
      const [{ n }] = await q.query<{ n: number }>(`select count(*)::int as n from desk_codes where email = $1 and created_at > now() - interval '1 hour'`, [email]);
      if (n >= CODES_PER_HOUR) return false;
      await q.query(`delete from desk_codes where expires_at < now() - interval '1 day'`);
      await q.query('insert into desk_codes (email, code_hash, expires_at) values ($1, $2, now() + make_interval(mins => $3))', [email, await sha256Hex(`${email}:${code}`), CODE_MINUTES]);
      return true;
    });
    if (made) {
      await deps.email.send({ to: email, subject: `${code} is your Curahold desk code`, text: `Your code for the Curahold support desk is ${code}.\n\nIt works for ${CODE_MINUTES} minutes and only once. If you did not ask for it, you can ignore this message.` });
      if (deps.config.devExposeTokens) devCode = code;
    }
  }
  return c.json({ ok: true, ...(devCode ? { devCode } : {}) });
});

/** Step two: the code. Right once, it opens a session for this browser; five wrong tries spend it. */
deskRoutes.post('/sign-in/verify', async (c) => {
  if (!onCentral(c)) fail('not_found');
  const input = await body(c, z.object({ email: z.string().trim().toLowerCase().email().max(320), code: z.string().trim().regex(/^\d{6}$/) }));
  const deps = c.get('deps');
  const want = await sha256Hex(`${input.email}:${input.code}`);
  const ok = await deps.db.system(async (q) => {
    if (!staffList(c).includes(input.email)) return false;
    const [row] = await q.query<{ id: string; code_hash: string; attempts: number }>(
      'select id, code_hash, attempts from desk_codes where email = $1 and expires_at > now() order by created_at desc limit 1 for update',
      [input.email],
    );
    if (!row || row.attempts >= TRIES_PER_CODE) return false;
    if (!safeEqual(row.code_hash, want)) {
      await q.query('update desk_codes set attempts = attempts + 1 where id = $1', [row.id]);
      return false;
    }
    await q.query('delete from desk_codes where email = $1', [input.email]);
    await note(q, { email: input.email, via: 'session' }, 'signed_in');
    return true;
  });
  if (!ok) fail('unauthenticated');
  const until = nowOf(deps).getTime() + SESSION_HOURS * 3600_000;
  setCookie(c, DESK_COOKIE, await sign({ desk: 1, e: input.email, x: until, n: randomToken(8) }, deskSecret(c)), {
    httpOnly: true,
    secure: deps.config.scheme === 'https',
    sameSite: 'Strict',
    path: '/api/desk',
    maxAge: SESSION_HOURS * 3600,
  });
  return c.json({ staff: { email: input.email, name: nameFrom(input.email) }, until: new Date(until).toISOString() });
});

deskRoutes.post('/sign-out', async (c) => {
  deleteCookie(c, DESK_COOKIE, { path: '/api/desk' });
  return c.json({ ok: true });
});

/** Who is signed in, and how much is waiting where. */
deskRoutes.get('/me', async (c) => {
  // The screen asks this first, before anyone has signed in: "not signed in" (401), like a company's own /me.
  const staff = await staffOnly(c).catch(() => fail('unauthenticated'));
  const [n] = await c.get('deps').db.system((q) =>
    q.query(
      `select count(*) filter (where h.status = 'received')::int as received, count(*) filter (where h.status = 'answered')::int as answered,
              count(*) filter (where h.status = 'solved')::int as solved,
              count(*) filter (where h.status <> 'solved' and k.staff_email = $1)::int as mine,
              count(*) filter (where h.status = 'received' and k.request_id is null)::int as unclaimed
         from help_requests h left join desk_claims k on k.request_id = h.id`,
      [staff.email],
    ),
  );
  return c.json({ staff: { email: staff.email, name: staff.via === 'key' ? 'Curahold' : nameFrom(staff.email) }, counts: n });
});

/** The queue: whose turn it is decides the order. `status` narrows; `q` searches subjects and companies. */
deskRoutes.get('/requests', async (c) => {
  const staff = await staffOnly(c);
  const mine = c.req.query('mine') === '1';
  const unclaimed = c.req.query('unclaimed') === '1';
  const status = c.req.query('status');
  const q = (c.req.query('q') ?? '').trim().slice(0, 100);
  if (status && !(HELP_STATUSES as readonly string[]).includes(status)) fail('validation', { fields: 'status' }, { fields: ['status'] });
  const rows = await c.get('deps').db.system((db) =>
    db.query(
      `select h.ref, h.subject, h.category, h.impact, h.status, h.created_at, h.last_message_at, h.needed_by,
              o.slug as org_slug, o.name as org_name, u.name as user_name, u.email as user_email, k.staff_email as owner,
              (select count(*)::int from help_messages m where m.request_id = h.id) as messages,
              (select count(*)::int from help_messages m where m.request_id = h.id and m.internal) as notes
         from help_requests h join orgs o on o.id = h.org_id left join users u on u.id = h.user_id
         left join desk_claims k on k.request_id = h.id
        where ($1::text is null or h.status = $1)
          and ($2 = '' or h.subject ilike '%' || $2 || '%' or o.name ilike '%' || $2 || '%' or h.ref = upper($2))
          and ($3::text is null or k.staff_email = $3)
          and (not $4::boolean or k.request_id is null)
        order by case h.status when 'received' then 0 when 'answered' then 1 else 2 end,
                 (h.impact = 'blocking') desc nulls last, coalesce(h.last_message_at, h.created_at)
        limit 200`,
      [status ?? null, q, mine ? staff.email : null, unclaimed],
    ),
  );
  return c.json({
    requests: rows.map((r) => ({
      ref: r.ref,
      subject: r.subject,
      category: r.category,
      impact: r.impact,
      status: r.status,
      createdAt: new Date(r.created_at).toISOString(),
      lastMessageAt: new Date(r.last_message_at ?? r.created_at).toISOString(),
      neededBy: r.needed_by ? new Date(r.needed_by).toISOString().slice(0, 10) : null,
      company: { slug: r.org_slug, name: r.org_name },
      from: { name: r.user_name ?? null, email: r.user_email ?? null },
      owner: r.owner ?? null,
      messages: r.messages,
      notes: r.notes,
    })),
  });
});

/** One request, whole: what was asked, the conversation, and the team's own notes among it. */
deskRoutes.get('/requests/:ref', async (c) => {
  const staff = await staffOnly(c);
  const ref = c.req.param('ref');
  if (!REF.test(ref)) fail('not_found');
  const deps = c.get('deps');
  const out = await deps.db.system(async (db) => {
    const [h] = await db.query(
      `select h.*, o.slug as org_slug, o.name as org_name, o.plan as org_plan, o.created_at as org_created_at, o.trial_ends_at,
              (select count(*)::int from users x where x.org_id = o.id and x.status = 'active') as org_people,
              u.name as user_name, u.email as user_email, r.name as role_name, k.staff_email as owner
         from help_requests h join orgs o on o.id = h.org_id left join users u on u.id = h.user_id
         left join roles r on r.id = u.role_id left join desk_claims k on k.request_id = h.id
        where h.ref = $1`,
      [ref],
    );
    if (!h) return null;
    const messages = await db.query(
      `select m.*, u.name as user_name from help_messages m left join users u on u.id = m.user_id where m.request_id = $1 order by m.created_at, m.id`,
      [h.id],
    );
    const files = await db.query('select id, name, size from help_files where request_id = $1 order by created_at', [h.id]);
    // Whether the person who asked has let support look inside, and until when.
    const [grant] = h.user_id
      ? await db.query(`select id, level, expires_at from support_grants where org_id = $1 and user_id = $2 and revoked_at is null and expires_at > now() order by expires_at desc limit 1`, [h.org_id, h.user_id])
      : [];
    const others = await db.query(`select ref, subject, status from help_requests where org_id = $1 and id <> $2 order by created_at desc limit 5`, [h.org_id, h.id]);
    if (staff.via === 'session') await note(db, staff, 'opened', h.ref, h.org_id);
    return { h, messages, files, grant, others };
  });
  if (!out) fail('not_found');
  const { h, messages, files, grant, others } = out!;
  // Links to the files that work for two weeks without anything else, like the ones in the desk's emails.
  const expires = Math.floor(nowOf(deps).getTime() / 1000) + 14 * 86400;
  const fileLinks = await Promise.all(
    files.map(async (f) => ({ name: f.name as string, size: Number(f.size), url: `${orgUrl(deps.config, h.org_slug)}/api/help-files/${f.id}?e=${expires}&s=${await hmacHex(deps.config.authSecret, `help-file.${h.org_id}.${f.id}.${expires}`)}` })),
  );
  return c.json({
    request: {
      ref: h.ref,
      subject: h.subject,
      description: h.description,
      steps: h.steps ?? null,
      pageUrl: h.page_url ?? null,
      category: h.category,
      impact: h.impact,
      status: h.status,
      createdAt: new Date(h.created_at).toISOString(),
      neededBy: h.needed_by ? new Date(h.needed_by).toISOString().slice(0, 10) : null,
      company: { slug: h.org_slug, name: h.org_name, url: orgUrl(deps.config, h.org_slug), plan: h.org_plan ?? null, people: h.org_people, since: new Date(h.org_created_at).toISOString(), trialEndsAt: h.trial_ends_at ? new Date(h.trial_ends_at).toISOString() : null },
      from: { name: h.user_name ?? null, email: h.user_email ?? null, role: h.role_name ?? null },
      owner: h.owner ?? null,
      files: fileLinks,
      access: grant ? { level: grant.level, until: new Date(grant.expires_at).toISOString() } : null,
      others: others.map((o) => ({ ref: o.ref, subject: o.subject, status: o.status })),
      messages: messages.map((m) => ({
        id: m.id,
        author: m.author,
        name: m.author === 'support' ? m.staff : (m.user_name ?? null),
        body: m.body,
        internal: m.internal,
        via: m.via,
        createdAt: new Date(m.created_at).toISOString(),
      })),
    },
  });
});

/**
 * An answer to the company, or (internal: true) a note for the team only.
 * An answer hands the turn to the person who asked unless `status` says otherwise.
 */
deskRoutes.post('/requests/:ref/messages', async (c) => {
  const staff = await staffOnly(c);
  const ref = c.req.param('ref');
  if (!REF.test(ref)) fail('not_found');
  const input = await body(
    c,
    z.object({
      body: z.string().trim().min(1).max(20000),
      // The name the answer is signed with. Tooling must give one; someone signed in is named after their address unless they say otherwise.
      staff: z.string().trim().min(2).max(200).optional(),
      internal: z.boolean().default(false),
      status: z.enum(HELP_STATUSES).optional(),
    }),
  );
  if (staff.via === 'key' && !input.staff) fail('validation', { fields: 'staff' }, { fields: ['staff'] });
  const deps = c.get('deps');
  const [h] = await deps.db.system((db) => db.query<{ id: string; org_id: string }>('select id, org_id from help_requests where ref = $1', [ref]));
  if (!h) fail('not_found');
  const msg = await addHelpMessage(deps, h.org_id, h.id, { author: 'support', staff: input.staff ?? nameFrom(staff.email), body: input.body, internal: input.internal, via: 'desk', status: input.internal ? undefined : input.status });
  if (!msg) fail('not_found');
  await deps.db.system(async (db) => {
    await note(db, staff, input.internal ? 'noted' : 'answered', ref, h.org_id, msg!.id);
    // Whoever answers a request nobody has taken, has taken it.
    if (staff.via === 'session' && !input.internal) await db.query('insert into desk_claims (request_id, staff_email) values ($1, $2) on conflict (request_id) do nothing', [h.id, staff.email]);
  });
  return c.json({ message: { id: msg!.id, internal: msg!.internal, createdAt: new Date(msg!.created_at).toISOString() } }, 201);
});

/** Take a request, or let it go. One person has it at a time; taking one that is taken moves it. */
deskRoutes.put('/requests/:ref/owner', async (c) => {
  const staff = await staffOnly(c);
  if (staff.via !== 'session') fail('forbidden');
  const ref = c.req.param('ref');
  if (!REF.test(ref)) fail('not_found');
  const { mine } = await body(c, z.object({ mine: z.boolean() }));
  const owner = await c.get('deps').db.system(async (db) => {
    const [h] = await db.query<{ id: string; org_id: string }>('select id, org_id from help_requests where ref = $1', [ref]);
    if (!h) return undefined;
    if (mine) await db.query('insert into desk_claims (request_id, staff_email) values ($1, $2) on conflict (request_id) do update set staff_email = excluded.staff_email, at = now()', [h.id, staff.email]);
    else await db.query('delete from desk_claims where request_id = $1', [h.id]);
    await note(db, staff, mine ? 'took' : 'released', ref, h.org_id);
    return mine ? staff.email : null;
  });
  if (owner === undefined) fail('not_found');
  return c.json({ owner });
});

/** Close a request, or open it again, without writing anything to the company. */
deskRoutes.put('/requests/:ref/status', async (c) => {
  const staff = await staffOnly(c);
  const ref = c.req.param('ref');
  if (!REF.test(ref)) fail('not_found');
  const { status } = await body(c, z.object({ status: z.enum(HELP_STATUSES) }));
  const done = await c.get('deps').db.system(async (db) => {
    const [h] = await db.query<{ id: string; org_id: string }>('update help_requests set status = $2, updated_at = now() where ref = $1 returning id, org_id', [ref, status]);
    if (h) await note(db, staff, `status:${status}`, ref, h.org_id);
    return !!h;
  });
  if (!done) fail('not_found');
  return c.json({ status });
});

/**
 * A one-time link into the company's workspace, as the person who asked — only
 * while that person has let support in, at the level they chose, and written
 * to their company's activity log when it is used.
 */
deskRoutes.post('/requests/:ref/enter-link', async (c) => {
  const staff = await staffOnly(c);
  if (staff.via !== 'session') fail('forbidden');
  const ref = c.req.param('ref');
  if (!REF.test(ref)) fail('not_found');
  const deps = c.get('deps');
  const entry = randomToken(32);
  const out = await deps.db.system(async (db) => {
    const [g] = await db.query(
      `select g.id, g.expires_at, g.org_id, o.slug, o.settings, r.perms
         from help_requests h join orgs o on o.id = h.org_id
         join support_grants g on g.org_id = h.org_id and g.user_id = h.user_id
         join users u on u.id = g.user_id and u.org_id = g.org_id join roles r on r.id = u.role_id
        where h.ref = $1 and g.revoked_at is null and g.expires_at > now() and u.status = 'active'
        order by g.expires_at desc limit 1`,
      [ref],
    );
    if (!g || !mayGrant({ settings: g.settings ?? {} }, g.perms ?? [])) return null;
    await db.query(
      `insert into support_sessions (org_id, grant_id, staff, entry_hash, expires_at)
       values ($1, $2, $3, $4, least($5::timestamptz, now() + make_interval(hours => $6)))`,
      [g.org_id, g.id, `${nameFrom(staff.email)} <${staff.email}>`, await sha256Hex(entry), g.expires_at, SUPPORT_SESSION_HOURS],
    );
    await note(db, staff, 'entry_link', ref, g.org_id);
    return g.slug as string;
  });
  if (!out) fail('support_ended');
  return c.json({ url: `${orgUrl(deps.config, out!)}/support/enter#token=${entry}`, validMinutes: ENTRY_LINK_MINUTES }, 201);
});

/**
 * The door for incoming mail: whatever receives mail for the reply domain (the
 * email worker, or a mail server's webhook) hands each message over here.
 * Always answers 200 with what became of it, so a mail that is not for us is
 * dropped rather than retried.
 */
deskRoutes.post('/mail', async (c) => {
  const key = c.get('deps').config.support?.mailKey;
  const given = c.req.header('x-curahold-mail-key') ?? '';
  if (!key || key.length < 24 || !safeEqual(given, key)) fail('forbidden');
  const input = await body(
    c,
    z.object({
      from: z.string().trim().min(3).max(400),
      to: z.array(z.string().trim().min(3).max(400)).min(1).max(50),
      subject: z.string().max(1000).optional(),
      text: z.string().max(200_000),
      messageId: z.string().max(400).nullish(),
      inReplyTo: z.string().max(400).nullish(),
      references: z.array(z.string().max(400)).max(100).optional(),
      /** The sender's domain was checked by whoever received the mail (DMARC passed). */
      authenticated: z.boolean().optional(),
    }),
  );
  return c.json(await takeMail(c.get('deps'), input));
});
