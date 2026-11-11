// The setup wizard's server side: progress that survives a reload, people
// and team suggestions gathered from everything connected so far, adding
// them in one go, and sending the invitations at the end.
import { Hono } from 'hono';
import { z } from 'zod';
import { SETUP_STEPS, type SetupStep } from '../../../shared/src/model';
import { pick, TEMPLATES, isTemplateKey } from '../../../shared/src/templates';
import { ADAPTERS, loadConnection } from '../connectors/messaging';
import { requirePerm, run, type AppEnv } from '../context';
import { audit } from '../lib/audit';
import { emailDomain } from '../lib/domains';
import { createInviteToken, sendInvite } from '../lib/people';
import { body, email } from '../lib/validate';
import { linkPendingOwners } from './accounts';

export const setupRoutes = new Hono<AppEnv>();

setupRoutes.use('*', async (c, next) => {
  requirePerm(c, 'org.manage');
  await next();
});

setupRoutes.post('/step', async (c) => {
  const input = await body(c, z.object({ step: z.enum(SETUP_STEPS), done: z.boolean() }));
  const org = c.get('org');
  const done = new Set<SetupStep>(org.setup?.done ?? []);
  if (input.done) done.add(input.step);
  else done.delete(input.step);
  await run(c, (q) => q.query(`update orgs set setup = jsonb_set(setup, '{done}', $2::jsonb) where id = $1`, [org.id, JSON.stringify([...done])]));
  return c.json({ done: [...done] });
});

interface Suggestion {
  email: string;
  name: string;
  sources: string[];
  member: boolean;
  accounts: number;
}

setupRoutes.get('/people', async (c) => {
  const deps = c.get('deps');
  const org = c.get('org');
  const { users, conns, ownerRows, teamRows, teams } = await run(c, async (q) => ({
    users: await q.query('select email, name, status from users'),
    conns: await q.query(`select id, provider from connections where kind = 'messaging' and status = 'active' and provider <> 'webhook'`),
    ownerRows: await q.query(`select fields->>'_owner' as v, count(*)::int as n from accounts where fields ? '_owner' group by 1`),
    teamRows: await q.query(`select fields->>'_team' as v, count(*)::int as n from accounts where fields ? '_team' group by 1`),
    teams: await q.query('select name from teams'),
  }));
  const members = new Map(users.map((u) => [u.email, u]));
  const people = new Map<string, Suggestion>();
  const groups: { name: string; emails: string[]; source: string }[] = [];
  const add = (mail: string, name: string, source: string, accounts = 0) => {
    const key = mail.toLowerCase();
    const s = people.get(key) ?? { email: key, name, sources: [], member: members.has(key), accounts: 0 };
    if (!s.sources.includes(source)) s.sources.push(source);
    s.accounts += accounts;
    if (!s.name || s.name === s.email) s.name = name;
    people.set(key, s);
  };
  const errors: string[] = [];
  for (const row of conns) {
    const conn = await loadConnection(deps, org.id, row.id);
    const adapter = conn && ADAPTERS[conn.provider];
    if (!conn || !adapter?.directory) continue;
    try {
      const dir = await adapter.directory(deps, conn);
      // Only people at the company's own domains: no guests, no vendors.
      const own = (e: string) => !org.domains.length || org.domains.includes(emailDomain(e));
      const byId = new Map(dir.people.map((p) => [p.externalId, p]));
      for (const p of dir.people) if (own(p.email)) add(p.email, p.name, conn.provider);
      for (const g of dir.groups) {
        const emails = g.memberIds.map((id) => byId.get(id)?.email).filter((e): e is string => !!e && own(e));
        if (emails.length) groups.push({ name: g.name, emails, source: conn.provider });
      }
    } catch {
      errors.push(row.provider);
    }
  }
  const nameOnly: { name: string; accounts: number }[] = [];
  for (const r of ownerRows) {
    const v = String(r.v ?? '').trim();
    if (!v) continue;
    if (v.includes('@')) add(v, people.get(v.toLowerCase())?.name ?? v.split('@')[0], 'file', r.n);
    else {
      const hit = [...people.values()].find((p) => p.name.toLocaleLowerCase('tr-TR') === v.toLocaleLowerCase('tr-TR'));
      if (hit) hit.accounts += r.n;
      else nameOnly.push({ name: v, accounts: r.n });
    }
  }
  const template = isTemplateKey(org.template) ? TEMPLATES[org.template] : TEMPLATES.blank;
  const teamNames = new Set<string>([
    ...template.teams.map((t) => pick(t, org.locale)),
    ...teamRows.map((r) => String(r.v)),
    ...groups.map((g) => g.name),
  ]);
  for (const t of teams) teamNames.delete(t.name);
  return c.json({
    people: [...people.values()].sort((a, b) => Number(a.member) - Number(b.member) || b.accounts - a.accounts || a.name.localeCompare(b.name)),
    /** Owners named in the file without an email: need an address before they can be invited. */
    nameOnly,
    groups,
    teams: [...teamNames].filter(Boolean).slice(0, 30),
    errors,
  });
});

setupRoutes.post('/people', async (c) => {
  requirePerm(c, 'users.manage');
  const input = await body(
    c,
    z.object({
      people: z
        .array(z.object({ email, name: z.string().trim().min(1).max(120), role: z.enum(['admin', 'manager', 'member', 'viewer']), teams: z.array(z.string().trim().min(1).max(80)).max(10) }))
        .max(500),
      teams: z.array(z.object({ name: z.string().trim().min(1).max(80), leadEmail: email.nullable().optional() })).max(50),
    }),
  );
  const org = c.get('org');
  const auth = c.get('auth');
  const out = await run(c, async (q) => {
    const roles = await q.query<{ id: string; key: string }>('select id, key from roles where system');
    const roleId = Object.fromEntries(roles.map((r) => [r.key, r.id]));
    const teamIds = new Map<string, string>((await q.query('select id, name from teams')).map((t) => [t.name.toLowerCase(), t.id]));
    let teamsCreated = 0;
    const wanted = new Set([...input.teams.map((t) => t.name), ...input.people.flatMap((p) => p.teams)]);
    for (const name of wanted) {
      if (teamIds.has(name.toLowerCase())) continue;
      const [t] = await q.query<{ id: string }>('insert into teams (org_id, name) values ($1, $2) returning id', [org.id, name]);
      teamIds.set(name.toLowerCase(), t.id);
      teamsCreated++;
    }
    let created = 0;
    const userIds = new Map<string, string>((await q.query('select id, email from users')).map((u) => [u.email, u.id]));
    for (const p of input.people) {
      let id = userIds.get(p.email);
      if (!id) {
        const seat = p.role === 'viewer' ? 'viewer' : 'full';
        const [u] = await q.query<{ id: string }>(
          `insert into users (org_id, email, name, role_id, seat, status) values ($1, $2, $3, $4, $5, 'invited') returning id`,
          [org.id, p.email, p.name, roleId[p.role], seat],
        );
        id = u.id;
        userIds.set(p.email, id);
        created++;
        await audit(q, { orgId: org.id, actorId: auth.userId, action: 'user.invited', entity: 'user', entityId: id, meta: { via: 'setup' } });
      }
      for (const t of p.teams) {
        await q.query('insert into team_members (org_id, team_id, user_id) values ($1, $2, $3) on conflict do nothing', [org.id, teamIds.get(t.toLowerCase()), id]);
      }
    }
    for (const t of input.teams) {
      if (!t.leadEmail) continue;
      const lead = userIds.get(t.leadEmail);
      const tid = teamIds.get(t.name.toLowerCase());
      if (!lead || !tid) continue;
      await q.query('update teams set lead_id = $2 where id = $1', [tid, lead]);
      await q.query('insert into team_members (org_id, team_id, user_id) values ($1, $2, $3) on conflict do nothing', [org.id, tid, lead]);
    }
    await linkPendingOwners(q, org.id);
    return { created, teamsCreated };
  });
  return c.json(out);
});

setupRoutes.post('/finish', async (c) => {
  const input = await body(c, z.object({ sendInvites: z.boolean() }));
  const deps = c.get('deps');
  const org = c.get('org');
  const auth = c.get('auth');
  const invites = await run(c, async (q) => {
    const list: { email: string; name: string; token: string }[] = [];
    if (input.sendInvites) {
      const pending = await q.query(
        `select u.email, u.name from users u where u.status = 'invited'
           and not exists (select 1 from login_tokens t where t.email = u.email and t.kind = 'magic' and t.used_at is null and t.expires_at > now())`,
      );
      for (const p of pending) list.push({ email: p.email, name: p.name, token: await createInviteToken(q, org.id, p.email) });
    }
    await q.query(`update orgs set setup = (setup - 'ownerHints') || jsonb_build_object('finishedAt', now()) where id = $1`, [org.id]);
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'org.setup_finished', entity: 'org', entityId: org.id, meta: { invites: list.length } });
    return list;
  });
  for (const i of invites) await sendInvite(deps, org, { email: i.email, name: i.name }, i.token, auth.name);
  return c.json({ invited: invites.length, ...(deps.config.devExposeTokens ? { devTokens: invites.map((i) => i.token) } : {}) });
});

setupRoutes.post('/reopen', async (c) => {
  const org = c.get('org');
  await run(c, (q) => q.query(`update orgs set setup = setup - 'finishedAt' where id = $1`, [org.id]));
  return c.json({ ok: true });
});

