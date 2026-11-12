// Asking Curahold for help, and Curahold support's way in (only with consent).
//
//   helpRoutes     — signed-in people: send a request, see their requests,
//                    grant / revoke support access, set the company policy.
//   supportEntry   — before sign-in: support's one-time entry link and its
//                    session, and the signed links to a request's files.
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import {
  GRANT_HOURS,
  HELP_CATEGORIES,
  HELP_IMPACTS,
  HELP_MAX_FILE_MB,
  HELP_MAX_FILES,
  SUPPORT_POLICIES,
  type HelpRequestDetail,
  type HelpRequestInfo,
  type SupportGrant,
} from '../../../shared/src/help';
import { translate } from '../../../shared/src/i18n';
import { defer, fetchOf, logoPath, orgUrl, requirePerm, run, type AppEnv, type C, type Deps, type OrgRow } from '../context';
import type { Q, Row } from '../db';
import { audit } from '../lib/audit';
import { hmacHex, randomToken, safeEqual, sha256Hex } from '../lib/crypto';
import { emailHtml } from '../lib/emailHtml';
import { fail } from '../lib/errors';
import {
  ENTRY_LINK_MINUTES,
  SUPPORT_COOKIE,
  SUPPORT_SESSION_HOURS,
  endSupportSessions,
  mayGrant,
  staffKeyOk,
  supportPolicy,
} from '../lib/support';
import { body, isoDate, param, uuid } from '../lib/validate';
import { addHelpMessage, toHelpMessage } from '../lib/helpThread';

export const helpRoutes = new Hono<AppEnv>();
export const supportEntry = new Hono<AppEnv>();

const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/json',
  'video/mp4',
  'video/webm',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
const FILE_LINK_DAYS = 14;
const DAILY_LIMIT = 20;

const short = (n: number) => z.string().trim().max(n);
const contextSchema = z
  .object({
    browser: short(300),
    screen: short(40),
    viewport: short(40),
    version: short(40),
    locale: short(20),
    timezone: short(60),
    at: short(40),
    pages: z.array(short(300)).max(10),
    errors: z.array(z.object({ at: short(40), message: short(500) })).max(10),
    failed: z.array(z.object({ at: short(40), method: short(10), path: short(300), status: z.number().int() })).max(10),
    refs: z
      .object({ accountId: uuid, accountName: short(200), taskId: uuid, boardId: uuid })
      .partial(),
  })
  .partial();

const helpInput = z.object({
  category: z.enum(HELP_CATEGORIES),
  impact: z.enum(HELP_IMPACTS).nullish(),
  subject: z.string().trim().min(3).max(200),
  description: z.string().trim().min(10).max(20000),
  steps: z.string().trim().max(10000).nullish(),
  pageUrl: z.string().trim().max(2000).regex(/^https?:\/\//).nullish(),
  context: contextSchema.default({}),
  grant: z.object({ hours: z.union(GRANT_HOURS.map((h) => z.literal(h)) as any), level: z.enum(['view', 'edit']) }).nullish(),
  /** Colleagues to keep in the loop: they read the request and can answer on it. */
  followers: z.array(uuid).max(10).optional(),
  /** The day an answer is needed by, if there is one. */
  neededBy: isoDate.nullish(),
});

/** The colleagues among these ids who can be kept in the loop: active people of this company, not the asker. */
async function followersOf(q: Q, ids: string[] | undefined, me: string): Promise<string[]> {
  const wanted = [...new Set(ids ?? [])].filter((id) => id !== me);
  if (!wanted.length) return [];
  const rows = await q.query<{ id: string }>(`select id from users where id = any ($1) and status = 'active'`, [wanted]);
  return rows.map((r) => r.id);
}

const grantInput = z.object({
  hours: z.union(GRANT_HOURS.map((h) => z.literal(h)) as any),
  level: z.enum(['view', 'edit']).default('view'),
  requestId: uuid.nullish(),
});

/** No secrets leave with a page address: the fragment and anything that looks like a token are dropped. */
export function cleanPageUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    u.hash = '';
    for (const k of [...u.searchParams.keys()]) {
      if (/token|code|key|secret|sig|session|password|auth/i.test(k)) u.searchParams.set(k, '…');
    }
    return u.toString().slice(0, 2000);
  } catch {
    return null;
  }
}

function toGrant(r: Row): SupportGrant {
  return {
    id: r.id,
    userId: r.user_id,
    level: r.level,
    expiresAt: new Date(r.expires_at).toISOString(),
    createdAt: new Date(r.created_at).toISOString(),
    revokedAt: r.revoked_at ? new Date(r.revoked_at).toISOString() : null,
    lastUsedAt: r.last_used_at ? new Date(r.last_used_at).toISOString() : null,
    requestRef: r.request_ref ?? null,
    active: !r.revoked_at && new Date(r.expires_at).getTime() > Date.now(),
  };
}

/** Checks the person may give this grant, then writes it. */
async function giveGrant(c: C, q: any, hours: number, level: 'view' | 'edit', requestId: string | null) {
  const org = c.get('org');
  const auth = c.get('auth');
  if (c.get('supportBy') || c.get('previewBy') || c.get('tokenKind')) fail('forbidden');
  if (!mayGrant(org, auth.perms)) fail('support_not_allowed');
  // Changes need an administrator, and someone who could make them themselves.
  if (level === 'edit' && (!auth.perms.includes('org.manage') || auth.seat !== 'full')) fail('support_edit_admins');
  const [{ n }] = await q.query(
    `select count(*)::int as n from support_grants where user_id = $1 and revoked_at is null and expires_at > now()`,
    [auth.userId],
  );
  if (n >= 5) fail('support_too_many');
  const [g] = await q.query(
    `insert into support_grants (org_id, user_id, level, expires_at, request_id)
     values ($1, $2, $3, now() + make_interval(hours => $4), $5) returning *`,
    [org.id, auth.userId, level, hours, requestId],
  );
  await audit(q, { orgId: org.id, actorId: auth.userId, action: 'support.granted', entity: 'support_grant', entityId: g.id, meta: { level, hours } });
  return g;
}

async function fileLink(deps: Deps, org: OrgRow, fileId: string): Promise<string> {
  const e = Math.floor(Date.now() / 1000) + FILE_LINK_DAYS * 86400;
  const s = await hmacHex(deps.config.authSecret, `help-file.${org.id}.${fileId}.${e}`);
  return `${orgUrl(deps.config, org.slug)}/api/help-files/${fileId}?e=${e}&s=${s}`;
}

const LABEL: Record<string, string> = {
  bug: 'Something is not working',
  question: 'How do I…',
  idea: 'Idea',
  data: 'Data or connection',
  billing: 'Billing',
  blocking: 'blocks their work',
  workaround: 'has a workaround',
  minor: 'minor',
};

/** Curahold's support desk gets everything in one message, so nobody has to ask twice. */
async function tellSupport(deps: Deps, org: OrgRow, who: { name: string; email: string; role: string }, req: Row, files: Row[], grant: Row | null) {
  const dest = deps.config.support;
  if (!dest?.email && !dest?.webhookUrl) return;
  const ctx = req.context ?? {};
  const links = await Promise.all(files.map(async (f) => ({ name: f.name, size: f.size, url: await fileLink(deps, org, f.id) })));
  const lines = [
    `${req.ref} · ${org.name} (${org.slug}) · ${LABEL[req.category]}${req.impact ? ` · ${LABEL[req.impact]}` : ''}`,
    `From: ${who.name} <${who.email}>, role ${who.role}`,
    '',
    req.subject,
    '',
    req.description,
    ...(req.steps ? ['', 'Steps:', req.steps] : []),
    '',
    `Page: ${req.page_url ?? '—'}`,
    ...(ctx.refs?.accountName ? [`Customer: ${ctx.refs.accountName}`] : []),
    `Browser: ${ctx.browser ?? '—'} · screen ${ctx.screen ?? '—'} · window ${ctx.viewport ?? '—'} · app ${ctx.version ?? '—'} · ${ctx.timezone ?? ''}`,
    ...(ctx.pages?.length ? ['', 'Recent pages:', ...ctx.pages.map((p: string) => `  ${p}`)] : []),
    ...(ctx.errors?.length ? ['', 'Errors on the page:', ...ctx.errors.map((e: any) => `  ${e.at} ${e.message}`)] : []),
    ...(ctx.failed?.length ? ['', 'Failed requests:', ...ctx.failed.map((f: any) => `  ${f.at} ${f.method} ${f.path} → ${f.status}`)] : []),
    ...(links.length ? ['', `Files (links work for ${FILE_LINK_DAYS} days):`, ...links.map((l) => `  ${l.name} (${Math.ceil(l.size / 1024)} KB) ${l.url}`)] : []),
    '',
    grant
      ? `Access granted: ${grant.level === 'edit' ? 'may make changes' : 'read only'}, until ${new Date(grant.expires_at).toISOString()}. Grant ${grant.id}. Open an entry link with the staff key: POST ${orgUrl(deps.config, org.slug)}/api/support/enter-link`
      : 'No access granted. Ask in your reply if you need to look inside.',
  ];
  const text = lines.join('\n');
  const send: Promise<unknown>[] = [];
  if (dest.email) {
    send.push(deps.email.send({ to: dest.email, subject: `[${req.ref}] ${req.impact === 'blocking' ? 'BLOCKING · ' : ''}${req.subject}`, text }));
  }
  if (dest.webhookUrl) {
    const payload = JSON.stringify({
      ref: req.ref,
      org: { id: org.id, slug: org.slug, name: org.name },
      from: who,
      category: req.category,
      impact: req.impact,
      subject: req.subject,
      description: req.description,
      steps: req.steps,
      pageUrl: req.page_url,
      context: ctx,
      files: links,
      grant: grant ? { id: grant.id, level: grant.level, expiresAt: new Date(grant.expires_at).toISOString() } : null,
    });
    const t = Math.floor(Date.now() / 1000);
    const sig = await hmacHex(deps.config.staffKey || deps.config.authSecret, `${t}.${payload}`);
    send.push(
      fetchOf(deps)(dest.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'curahold-signature': `t=${t},v1=${sig}` },
        body: payload,
      }),
    );
  }
  await Promise.all(send);
}

// ------------------------------------------------------------- requests

helpRoutes.post('/help', async (c) => {
  const org = c.get('org');
  const auth = c.get('auth');
  const deps = c.get('deps');
  if (c.get('previewBy') || c.get('tokenKind')) fail('forbidden');
  const limit = HELP_MAX_FILE_MB * 1024 * 1024;
  if (Number(c.req.header('content-length') ?? 0) > HELP_MAX_FILES * limit + 256 * 1024) fail('file_too_large', { mb: HELP_MAX_FILE_MB });

  // JSON alone, or a form with the request in "data" and up to six files.
  let raw: unknown = {};
  let files: File[] = [];
  if ((c.req.header('content-type') ?? '').startsWith('multipart/form-data')) {
    const form = await c.req.parseBody({ all: true });
    try {
      raw = JSON.parse(String(form.data ?? '{}'));
    } catch {
      raw = {};
    }
    const f = form.files;
    files = (Array.isArray(f) ? f : f ? [f] : []).filter((x): x is File => x instanceof File);
  } else {
    raw = await c.req.json().catch(() => ({}));
  }
  const parsed = helpInput.safeParse(raw);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((i) => i.path.join('.') || '(body)'))];
    fail('validation', { fields: fields.join(', ') }, { fields });
  }
  const input = parsed.data!;
  if (files.length > HELP_MAX_FILES) fail('help_too_many_files', { n: HELP_MAX_FILES });
  for (const f of files) {
    if (f.size > limit) fail('file_too_large', { mb: HELP_MAX_FILE_MB });
    if (!ALLOWED_TYPES.has(f.type)) fail('help_file_type', { name: f.name.slice(0, 80) });
  }

  const { req, saved, grant } = await run(c, async (q) => {
    const [{ n }] = await q.query(`select count(*)::int as n from help_requests where user_id = $1 and created_at > now() - interval '1 day'`, [auth.userId]);
    if (n >= DAILY_LIMIT) fail('too_many_requests');
    // The open customer by name, for the desk; only one this person can see.
    const ctx = { ...(input.context ?? {}) };
    if (ctx.refs?.accountId) {
      const [a] = await q.query('select name from accounts where id = $1', [ctx.refs.accountId]);
      ctx.refs = a ? { ...ctx.refs, accountName: a.name } : (({ accountId: _, ...rest }) => rest)(ctx.refs);
    }
    const [req] = await q.query(
      `insert into help_requests (org_id, user_id, category, impact, subject, description, steps, page_url, context, followers, needed_by, reply_token, last_message_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now()) returning *`,
      [
        org.id,
        auth.userId,
        input.category,
        input.impact ?? null,
        input.subject,
        input.description,
        input.steps || null,
        cleanPageUrl(input.pageUrl),
        JSON.stringify(ctx),
        await followersOf(q, input.followers, auth.userId),
        input.neededBy ?? null,
        randomToken(18),
      ],
    );
    const saved: Row[] = [];
    for (const f of files) {
      const name = f.name.replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 200) || 'file';
      const key = `help/${org.id}/${req.id}/${crypto.randomUUID()}`;
      await deps.storage.put(key, await f.arrayBuffer(), f.type);
      const [r] = await q.query(
        `insert into help_files (org_id, request_id, name, mime, size, storage_key) values ($1, $2, $3, $4, $5, $6) returning *`,
        [org.id, req.id, name, f.type, f.size, key],
      );
      saved.push(r);
    }
    let grant: Row | null = null;
    if (input.grant) {
      grant = await giveGrant(c, q, input.grant.hours as number, input.grant.level, req.id);
      await q.query('update help_requests set grant_id = $1 where id = $2', [grant!.id, req.id]);
    }
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'help.created', entity: 'help_request', entityId: req.id, meta: { ref: req.ref } });
    return { req, saved, grant };
  });

  // The desk first, then a receipt with the reference for the person who asked.
  const locale = c.get('locale');
  defer(
    deps,
    (async () => {
      await tellSupport(deps, org, { name: auth.name, email: auth.email, role: auth.roleKey }, req, saved, grant);
      const link = `${orgUrl(deps.config, org.slug)}/home#help`;
      const text = translate(locale, 'help.email.body', { ref: req.ref, subject: req.subject }, org.terms);
      const logo = logoPath(org);
      await deps.email.send({
        to: auth.email,
        subject: translate(locale, 'help.email.subject', { ref: req.ref }, org.terms),
        text: `${text}\n\n${link}`,
        html: emailHtml({ org: org.name, logo: logo ? `${orgUrl(deps.config, org.slug)}${logo}` : null, text, link, cta: translate(locale, 'help.email.cta', {}, org.terms) }),
      });
    })(),
  );
  return c.json({ request: { id: req.id, ref: req.ref }, grant: grant ? toGrant(grant) : null }, 201);
});

/** Where a request stands as a conversation: when it last moved, and whether an answer waits unread. */
const threadInfo = (r: Row) => ({
  lastMessageAt: new Date(r.last_message_at ?? r.created_at).toISOString(),
  unread: r.status === 'answered' && !!r.last_message_at && (!r.seen_at || new Date(r.seen_at) < new Date(r.last_message_at)),
  followers: (r.followers ?? []) as string[],
  neededBy: r.needed_by ? new Date(r.needed_by).toISOString().slice(0, 10) : null,
});

helpRoutes.get('/help', async (c) => {
  const auth = c.get('auth');
  const all = c.req.query('all') === '1' && auth.perms.includes('org.manage');
  const rows = await run(c, async (q) => {
    const reqs = await q.query(
      `select h.*, u.name as user_name from help_requests h left join users u on u.id = h.user_id
        where ($1 or h.user_id = $2 or $2 = any (h.followers)) order by coalesce(h.last_message_at, h.created_at) desc limit 100`,
      [all, auth.userId],
    );
    const ids = reqs.map((r) => r.id);
    const files = ids.length ? await q.query('select id, request_id, name, size from help_files where request_id = any($1) order by created_at', [ids]) : [];
    const grants = ids.length ? await q.query('select * from support_grants where request_id = any($1)', [ids]) : [];
    return reqs.map(
      (r): HelpRequestInfo & { userName: string | null } => ({
        id: r.id,
        ref: r.ref,
        userId: r.user_id,
        userName: r.user_name ?? null,
        category: r.category,
        impact: r.impact,
        subject: r.subject,
        status: r.status,
        createdAt: new Date(r.created_at).toISOString(),
        files: files.filter((f) => f.request_id === r.id).map((f) => ({ id: f.id, name: f.name, size: f.size })),
        grant: (() => {
          const g = grants.find((x) => x.id === r.grant_id);
          return g ? toGrant(g) : null;
        })(),
        ...threadInfo(r),
      }),
    );
  });
  return c.json({ requests: rows });
});

/** One request with its conversation. Opening it as the person who asked marks support's answer as read. */
helpRoutes.get('/help/:id', async (c) => {
  const id = param(c, 'id');
  const auth = c.get('auth');
  const out = await run(c, async (q) => {
    const [r] = await q.query('select h.*, u.name as user_name from help_requests h left join users u on u.id = h.user_id where h.id = $1', [id]);
    if (!r) fail('not_found');
    const canReply = r.user_id === auth.userId || (r.followers ?? []).includes(auth.userId);
    if (canReply && r.status === 'answered') await q.query('update help_requests set seen_at = now() where id = $1', [id]);
    const messages = await q.query('select * from help_messages where request_id = $1 order by created_at, id', [id]);
    const files = await q.query('select id, name, size from help_files where request_id = $1 order by created_at', [id]);
    const [g] = r.grant_id ? await q.query('select * from support_grants where id = $1', [r.grant_id]) : [];
    return { r, messages, files, g, canReply };
  });
  const { r } = out;
  const detail: HelpRequestDetail & { userName: string | null } = {
    id: r.id,
    ref: r.ref,
    userId: r.user_id,
    userName: r.user_name ?? null,
    category: r.category,
    impact: r.impact,
    subject: r.subject,
    status: r.status,
    createdAt: new Date(r.created_at).toISOString(),
    files: out.files.map((f) => ({ id: f.id, name: f.name, size: f.size })),
    grant: out.g ? toGrant(out.g) : null,
    ...threadInfo(r),
    unread: false,
    description: r.description,
    steps: r.steps ?? null,
    pageUrl: r.page_url ?? null,
    messages: out.messages.map(toHelpMessage),
    canReply: out.canReply,
  };
  return c.json({ request: detail });
});

/** Answering on a request: the person who asked, or a colleague kept in the loop. It goes back to support. */
helpRoutes.post('/help/:id/messages', async (c) => {
  const id = param(c, 'id');
  const auth = c.get('auth');
  const org = c.get('org');
  if (c.get('previewBy') || c.get('tokenKind')) fail('forbidden');
  const input = await body(c, z.object({ body: z.string().trim().min(1).max(20000) }));
  await run(c, async (q) => {
    const [r] = await q.query('select user_id, followers from help_requests where id = $1', [id]);
    if (!r) fail('not_found');
    if (r.user_id !== auth.userId && !(r.followers ?? []).includes(auth.userId)) fail('forbidden');
    const [{ n }] = await q.query(`select count(*)::int as n from help_messages where user_id = $1 and created_at > now() - interval '1 hour'`, [auth.userId]);
    if (n >= 60) fail('too_many_requests');
  });
  const msg = await addHelpMessage(c.get('deps'), org.id, id, { author: 'user', userId: auth.userId, body: input.body, via: 'app' });
  if (!msg) fail('not_found');
  return c.json({ message: toHelpMessage(msg!) }, 201);
});

/** "This is settled": the person who asked, or a colleague kept in the loop. A later message opens it again. */
helpRoutes.post('/help/:id/solve', async (c) => {
  const id = param(c, 'id');
  const auth = c.get('auth');
  const org = c.get('org');
  if (c.get('previewBy') || c.get('tokenKind')) fail('forbidden');
  await run(c, async (q) => {
    const rows = await q.query(`update help_requests set status = 'solved' where id = $1 and (user_id = $2 or $2 = any (followers)) returning ref`, [id, auth.userId]);
    if (!rows.length) fail('not_found');
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'help.solved', entity: 'help_request', entityId: id, meta: { ref: rows[0].ref } });
  });
  return c.json({ ok: true });
});

/** Who is kept in the loop on a request: set by the person who asked. */
helpRoutes.put('/help/:id/followers', async (c) => {
  const id = param(c, 'id');
  const auth = c.get('auth');
  if (c.get('previewBy') || c.get('tokenKind')) fail('forbidden');
  const input = await body(c, z.object({ userIds: z.array(uuid).max(10) }));
  const followers = await run(c, async (q) => {
    const [r] = await q.query('select user_id from help_requests where id = $1', [id]);
    if (!r) fail('not_found');
    if (r.user_id !== auth.userId) fail('forbidden');
    const list = await followersOf(q, input.userIds, auth.userId);
    await q.query('update help_requests set followers = $2 where id = $1', [id, list]);
    return list;
  });
  return c.json({ followers });
});

helpRoutes.get('/help/files/:id', async (c) => {
  const id = param(c, 'id');
  const row = await run(c, async (q) => {
    const [r] = await q.query('select * from help_files where id = $1', [id]);
    if (!r) fail('not_found');
    return r;
  });
  return sendFile(c, row);
});

async function sendFile(c: C, row: Row) {
  const obj = await c.get('deps').storage.get(row.storage_key);
  if (!obj) fail('not_found');
  return c.body(obj!.data, 200, {
    'content-type': row.mime,
    'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(row.name)}`,
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
  });
}

// --------------------------------------------------------------- grants

helpRoutes.get('/support/grants', async (c) => {
  const auth = c.get('auth');
  const org = c.get('org');
  const all = c.req.query('all') === '1' && auth.perms.includes('org.manage');
  const grants = await run(c, (q) =>
    q.query(
      `select g.*, h.ref as request_ref, u.name as user_name
         from support_grants g
         left join help_requests h on h.id = g.request_id
         left join users u on u.id = g.user_id
        where ($1 or g.user_id = $2) and (g.revoked_at is null and g.expires_at > now() or g.created_at > now() - interval '30 days')
        order by g.created_at desc limit 100`,
      [all, auth.userId],
    ),
  );
  return c.json({
    policy: supportPolicy(org),
    canGrant: mayGrant(org, auth.perms),
    canGrantEdit: mayGrant(org, auth.perms) && auth.perms.includes('org.manage') && auth.seat === 'full',
    grants: grants.map((g) => ({ ...toGrant(g), userName: g.user_name ?? null })),
  });
});

helpRoutes.post('/support/grants', async (c) => {
  const input = await body(c, grantInput);
  const g = await run(c, async (q) => {
    if (input.requestId) {
      const [r] = await q.query('select id from help_requests where id = $1 and user_id = $2', [input.requestId, c.get('auth').userId]);
      if (!r) fail('not_found');
    }
    const g = await giveGrant(c, q, input.hours as number, input.level, input.requestId ?? null);
    if (input.requestId) await q.query('update help_requests set grant_id = $1 where id = $2', [g.id, input.requestId]);
    return g;
  });
  return c.json({ grant: toGrant(g) }, 201);
});

helpRoutes.delete('/support/grants/:id', async (c) => {
  const id = param(c, 'id');
  const org = c.get('org');
  const auth = c.get('auth');
  if (c.get('previewBy')) fail('preview_read_only');
  const n = await run(c, async (q) => {
    const rows = await q.query(
      `update support_grants set revoked_at = now(), revoked_by = $2 where id = $1 and revoked_at is null returning id`,
      [id, auth.userId],
    );
    if (rows.length) await audit(q, { orgId: org.id, actorId: auth.userId, action: 'support.revoked', entity: 'support_grant', entityId: id });
    return rows.length;
  });
  if (!n) fail('not_found');
  await endSupportSessions(c.get('deps'), org.id, id);
  return c.json({ ok: true });
});

helpRoutes.put('/support/policy', async (c) => {
  requirePerm(c, 'org.manage');
  if (c.get('previewBy')) fail('preview_read_only');
  const { policy } = await body(c, z.object({ policy: z.enum(SUPPORT_POLICIES) }));
  const org = c.get('org');
  const auth = c.get('auth');
  const ended = await run(c, async (q) => {
    await q.query(`update orgs set settings = settings || jsonb_build_object('supportAccess', $2::text) where id = $1`, [org.id, policy]);
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'support.policy', entity: 'org', entityId: org.id, meta: { policy } });
    // Closing the door ends the grants it no longer allows.
    if (policy === 'anyone') return [];
    const rows = await q.query(
      `update support_grants g set revoked_at = now(), revoked_by = $1
        where g.revoked_at is null and g.expires_at > now()
          and ($2 = 'off' or not exists (
            select 1 from users u join roles r on r.id = u.role_id
             where u.id = g.user_id and 'org.manage' = any (r.perms)))
        returning g.id`,
      [auth.userId, policy],
    );
    return rows.map((r) => r.id as string);
  });
  for (const id of ended) await endSupportSessions(c.get('deps'), org.id, id);
  return c.json({ policy, ended: ended.length });
});

// ------------------------------------------------- support's way in

/** Support asks for a one-time entry link, with its staff key, for an active grant. */
supportEntry.post('/support/enter-link', async (c) => {
  if (!staffKeyOk(c)) fail('forbidden');
  const org = c.get('org');
  const deps = c.get('deps');
  const input = await body(c, z.object({ grantId: uuid, staff: z.string().trim().min(3).max(200) }));
  const entry = randomToken(32);
  const ok = await deps.db.system(async (q) => {
    const [g] = await q.query(
      `select g.id, g.expires_at, r.perms from support_grants g
         join users u on u.id = g.user_id and u.org_id = g.org_id join roles r on r.id = u.role_id
        where g.id = $1 and g.org_id = $2 and g.revoked_at is null and g.expires_at > now() and u.status = 'active'`,
      [input.grantId, org.id],
    );
    if (!g || !mayGrant(org, g.perms ?? [])) return false;
    await q.query(
      `insert into support_sessions (org_id, grant_id, staff, entry_hash, expires_at)
       values ($1, $2, $3, $4, least($5::timestamptz, now() + make_interval(hours => $6)))`,
      [org.id, g.id, input.staff, await sha256Hex(entry), g.expires_at, SUPPORT_SESSION_HOURS],
    );
    return true;
  });
  if (!ok) fail('support_ended');
  return c.json({ url: `${orgUrl(deps.config, org.slug)}/support/enter#token=${entry}`, validMinutes: ENTRY_LINK_MINUTES }, 201);
});

/** The entry link, opened in support's browser: one use, ten minutes. */
supportEntry.post('/support/enter', async (c) => {
  const org = c.get('org');
  const deps = c.get('deps');
  const { token } = await body(c, z.object({ token: z.string().min(20).max(200) }));
  const session = randomToken(32);
  const s = await deps.db.system(async (q) => {
    const [s] = await q.query(
      `update support_sessions ss set entry_hash = null, token_hash = $3, entered_at = now(), last_seen_at = now()
        from support_grants g
        where ss.entry_hash = $1 and ss.org_id = $2 and g.id = ss.grant_id
          and ss.created_at > now() - make_interval(mins => $4) and ss.revoked_at is null
          and g.revoked_at is null and g.expires_at > now() and ss.expires_at > now()
        returning ss.id, ss.staff, ss.grant_id, g.user_id, g.level, least(ss.expires_at, g.expires_at) as until`,
      [await sha256Hex(token), org.id, await sha256Hex(session), ENTRY_LINK_MINUTES],
    );
    if (s) await audit(q, { orgId: org.id, actorId: s.user_id, action: 'support.entered', entity: 'support_grant', entityId: s.grant_id, meta: { staff: s.staff, level: s.level } });
    return s;
  });
  if (!s) fail('support_link_used');
  const seconds = Math.max(60, Math.floor((new Date(s.until).getTime() - Date.now()) / 1000));
  setCookie(c, SUPPORT_COOKIE, session, {
    httpOnly: true,
    secure: deps.config.scheme === 'https',
    sameSite: 'Strict',
    path: '/',
    maxAge: seconds,
  });
  return c.json({ ok: true, until: new Date(s.until).toISOString() });
});

supportEntry.post('/support/leave', async (c) => {
  const token = getCookie(c, SUPPORT_COOKIE);
  if (token) {
    const org = c.get('org');
    const hash = await sha256Hex(token);
    await c.get('deps').db.system((q) => q.query('update support_sessions set revoked_at = now() where token_hash = $1 and org_id = $2 and revoked_at is null', [hash, org.id]));
  }
  deleteCookie(c, SUPPORT_COOKIE, { path: '/' });
  return c.json({ ok: true });
});

/** A request's files, for the support desk: links signed per file, for two weeks. */
supportEntry.get('/help-files/:id', async (c) => {
  const id = param(c, 'id');
  const org = c.get('org');
  const deps = c.get('deps');
  const e = Number(c.req.query('e'));
  const s = c.req.query('s') ?? '';
  if (!Number.isInteger(e) || e < Date.now() / 1000) fail('not_found');
  const want = await hmacHex(deps.config.authSecret, `help-file.${org.id}.${id}.${e}`);
  if (!safeEqual(s, want)) fail('not_found');
  const [row] = await deps.db.system((q) => q.query('select * from help_files where id = $1 and org_id = $2', [id, org.id]));
  if (!row) fail('not_found');
  return sendFile(c, row);
});

/** The support desk marks a request answered or solved (shown to the person in "My requests"). */
supportEntry.put('/support/requests/:ref', async (c) => {
  if (!staffKeyOk(c)) fail('forbidden');
  const ref = c.req.param('ref');
  if (!/^CH-\d{6,}$/.test(ref)) fail('not_found');
  const { status } = await body(c, z.object({ status: z.enum(['received', 'answered', 'solved']) }));
  const org = c.get('org');
  const rows = await c.get('deps').db.system((q) =>
    q.query('update help_requests set status = $3, updated_at = now() where ref = $1 and org_id = $2 returning id', [ref, org.id, status]),
  );
  if (!rows.length) fail('not_found');
  return c.json({ ok: true });
});
