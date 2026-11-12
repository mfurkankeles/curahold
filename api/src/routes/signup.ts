// Self-serve company sign-up on the central address (app.curahold.com):
//   1. POST /signup/start     — email address → link mailed (proves it)
//   2. POST /signup/verify    — token from the link → signed ticket + suggestions
//   3. GET  /signup/slug      — is this address free?
//   4. POST /signup/complete  — company, address, language, template → the new
//      company exists; the browser goes to <slug>.curahold.com already signed in.
import { Hono } from 'hono';
import { z } from 'zod';
import { translate } from '../../../shared/src/i18n';
import { TEMPLATE_KEYS } from '../../../shared/src/templates';
import { centralUrl, nowOf, orgUrl, type AppEnv } from '../context';
import { audit } from '../lib/audit';
import { randomToken, sha256Hex, sign, verify } from '../lib/crypto';
import { companyFromDomain, emailDomain, isPublicDomain, slugify, slugProblem } from '../lib/domains';
import { fail } from '../lib/errors';
import { createOrg } from '../lib/orgs';
import { body, email } from '../lib/validate';

export const signupRoutes = new Hono<AppEnv>();

const LINK_HOURS = 24;
const TICKET_MINUTES = 120;
const MAX_LINKS_PER_HOUR = 5;
const MAX_LINKS_PER_IP_HOUR = 30;
const MAX_COMPANIES_PER_DAY = 3;

interface Ticket {
  s: string; // signup id
  e: string; // verified email
  x: number; // expiry (ms)
}

signupRoutes.use('*', async (c, next) => {
  const cfg = c.get('deps').config;
  if (!cfg.signupEnabled || cfg.singleTenantSlug) fail('not_found');
  if (c.req.method !== 'GET' && !c.req.header('x-curahold-device')) fail('forbidden');
  await next();
});

signupRoutes.post('/start', async (c) => {
  const input = await body(c, z.object({ email, locale: z.enum(['en', 'tr']).optional() }));
  const deps = c.get('deps');
  const ip = c.req.header('cf-connecting-ip') ?? null;
  const locale = input.locale ?? 'en';
  const token = randomToken(32);
  await deps.db.system(async (q) => {
    const [byEmail] = await q.query<{ n: number }>(
      `select count(*)::int as n from signups where email = $1 and created_at > now() - interval '1 hour'`,
      [input.email],
    );
    if (byEmail.n >= MAX_LINKS_PER_HOUR) fail('too_many_requests');
    if (ip) {
      const [byIp] = await q.query<{ n: number }>(`select count(*)::int as n from signups where ip = $1 and created_at > now() - interval '1 hour'`, [ip]);
      if (byIp.n >= MAX_LINKS_PER_IP_HOUR) fail('too_many_requests');
    }
    await q.query(
      `insert into signups (email, token_hash, locale, ip, expires_at) values ($1, $2, $3, $4, now() + make_interval(hours => $5::int))`,
      [input.email, await sha256Hex(token), locale, ip, LINK_HOURS],
    );
  });
  const link = `${centralUrl(deps.config)}/signup/verify#token=${token}`;
  await deps.email.send({
    to: input.email,
    subject: translate(locale, 'email.signup.subject'),
    text: translate(locale, 'email.signup.body', { link }),
  });
  return c.json({ ok: true, ...(deps.config.devExposeTokens ? { devToken: token } : {}) });
});

signupRoutes.post('/verify', async (c) => {
  const input = await body(c, z.object({ token: z.string().min(20).max(200) }));
  const deps = c.get('deps');
  const now = nowOf(deps);
  const found = await deps.db.system(async (q) => {
    const [s] = await q.query(
      `update signups set verified_at = coalesce(verified_at, now())
        where token_hash = $1 and expires_at > now() and org_id is null returning id, email`,
      [await sha256Hex(input.token)],
    );
    if (!s) return null;
    const domain = emailDomain(s.email);
    const existing = isPublicDomain(domain)
      ? []
      : await q.query<{ slug: string; name: string; join_requests: boolean }>(
          `select slug, name, join_requests from orgs where $1 = any(domains) order by created_at limit 5`,
          [domain],
        );
    return { s, domain, existing };
  });
  if (!found) fail('invalid_token');
  const { s, domain, existing } = found!;
  const pub = isPublicDomain(domain);
  const suggestedName = pub ? '' : companyFromDomain(domain);
  const ticket = await sign({ s: s.id, e: s.email, x: now.getTime() + TICKET_MINUTES * 60_000 } satisfies Ticket, deps.config.authSecret);
  return c.json({
    ticket,
    email: s.email,
    domain: pub ? null : domain,
    suggestedName,
    suggestedSlug: slugify(suggestedName),
    existing: existing.map((o) => ({ name: o.name, url: orgUrl(deps.config, o.slug), joinRequests: o.join_requests })),
  });
});

signupRoutes.get('/slug', async (c) => {
  const slug = (c.req.query('slug') ?? '').toLowerCase();
  const problem = slugProblem(slug);
  if (problem) return c.json({ available: false, reason: problem });
  const taken = await c.get('deps').db.system((q) => q.query('select 1 from orgs where slug = $1', [slug]));
  return c.json(taken.length ? { available: false, reason: 'taken' } : { available: true });
});

const tz = z
  .string()
  .max(64)
  .refine((v) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: v });
      return true;
    } catch {
      return false;
    }
  });

signupRoutes.post('/complete', async (c) => {
  const input = await body(
    c,
    z.object({
      ticket: z.string().min(20).max(1000),
      company: z.string().trim().min(1).max(120),
      slug: z.string().trim().toLowerCase().max(40),
      name: z.string().trim().min(1).max(120),
      locale: z.enum(['en', 'tr']),
      timezone: tz,
      currency: z.string().regex(/^[A-Z]{3}$/),
      template: z.enum(TEMPLATE_KEYS),
    }),
  );
  const deps = c.get('deps');
  const now = nowOf(deps);
  const ticket = await verify<Ticket>(input.ticket, deps.config.authSecret);
  if (!ticket || ticket.x < now.getTime()) fail('invalid_token');
  const problem = slugProblem(input.slug);
  if (problem) fail('validation', { fields: 'slug' }, { fields: ['slug'], reason: problem });

  const ok = await deps.db.system(async (q) => {
    const [s] = await q.query('select id from signups where id = $1 and email = $2 and org_id is null and verified_at is not null', [ticket!.s, ticket!.e]);
    if (!s) return 'invalid_token' as const;
    const [made] = await q.query<{ n: number }>(
      `select count(*)::int as n from signups where email = $1 and org_id is not null and created_at > now() - interval '1 day'`,
      [ticket!.e],
    );
    if (made.n >= MAX_COMPANIES_PER_DAY) return 'too_many_requests' as const;
    const taken = await q.query('select 1 from orgs where slug = $1', [input.slug]);
    if (taken.length) return 'slug_taken' as const;
    return 'ok' as const;
  });
  if (ok !== 'ok') fail(ok);

  const domain = emailDomain(ticket!.e);
  let created: Awaited<ReturnType<typeof createOrg>>;
  try {
    created = await createOrg(deps.db, {
      slug: input.slug,
      name: input.company,
      locale: input.locale,
      timezone: input.timezone,
      currency: input.currency,
      template: input.template,
      domains: isPublicDomain(domain) ? [] : [domain],
      admin: { email: ticket!.e, name: input.name },
    });
  } catch (err) {
    // Someone took the address a moment ago.
    if (/orgs_slug_key|duplicate key/.test(String((err as Error).message))) fail('slug_taken');
    throw err;
  }
  const token = randomToken(32);
  await deps.db.system(async (q) => {
    await q.query('update signups set org_id = $2 where id = $1', [ticket!.s, created.orgId]);
    await q.query(
      `insert into login_tokens (org_id, email, token_hash, kind, expires_at) values ($1, $2, $3, 'magic', now() + interval '10 minutes')`,
      [created.orgId, ticket!.e, await sha256Hex(token)],
    );
    await audit(q, { orgId: created.orgId, actorId: created.adminId, action: 'org.created', entity: 'org', entityId: created.orgId, meta: { template: input.template } });
  });
  return c.json({ url: `${orgUrl(deps.config, input.slug)}/auth/verify#token=${token}&m=signup` }, 201);
});
