// Connected services, managed by an administrator: list, connect (OAuth or
// a webhook URL), test, rename, pause, remove. Credentials are sealed before
// they reach the database and never come back out through the API.
import { Hono } from 'hono';
import { zipSync, strToU8 } from 'fflate';
import { z } from 'zod';
import { translate } from '../../../shared/src/i18n';
import type { Connection } from '../../../shared/src/model';
import { ADAPTERS, loadConnection, markConnection, messagingProviders, upsertIdentity } from '../connectors/messaging';
import { DIRECTORY_SCOPE } from '../connectors/messaging/gchat';
import { slackAuthorizeUrl, slackExchange } from '../connectors/messaging/slack';
import { GRAPH_SCOPE } from '../connectors/messaging/teams';
import { FatalChatError } from '../connectors/messaging/types';
import { checkWebhookUrl, WEBHOOK_FLAVORS } from '../connectors/messaging/webhook';
import { centralUrl, fetchOf, nowOf, orgUrl, requirePerm, run, secretsKey, type AppEnv, type C, type Deps, type OrgRow } from '../context';
import { audit } from '../lib/audit';
import { randomToken, seal, sign, verify } from '../lib/crypto';
import { decodeJwt } from '../lib/jwt';
import { fail } from '../lib/errors';
import { iso } from '../lib/mappers';
import { loadRenderCtx, render } from '../lib/notify';
import { pngIcon } from '../lib/png';
import { body, param } from '../lib/validate';
import { crmProviders, isCrm } from '../sync/adapters';
import { crmCallback, crmStart, type CrmConnectState } from './sync';

export const connectionRoutes = new Hono<AppEnv>();

const toConnection = (r: any, linked: number): Connection => ({
  id: r.id,
  kind: r.kind,
  provider: r.provider,
  label: r.label,
  status: r.status,
  lastError: r.last_error ?? null,
  lastOkAt: iso(r.last_ok_at),
  createdAt: iso(r.created_at)!,
  twoWay: ADAPTERS[r.provider]?.twoWay ?? false,
  channels: r.provider === 'webhook' ? [{ id: '', name: r.config?.host ?? r.label }] : (r.config?.channels ?? []).map((x: any) => ({ id: x.id, name: x.name })),
  linkedPeople: linked,
  ...(r.kind === 'source'
    ? {
        sync: {
          startedAt: r.config?.sync?.startedAt ?? null,
          objects: (r.config?.sync?.objects ?? []).filter((o: any) => o.enabled).length,
          lastRun: r.state?.lastRun ? { id: r.state.lastRun.id, status: r.state.lastRun.status, at: r.state.lastRun.at } : null,
          pending: Number(r.pending ?? 0),
          failing: Number(r.failing ?? 0),
          file: r.config?.sync?.file ? { name: r.config.sync.file.name, url: r.config.sync.file.url } : null,
        },
      }
    : {}),
});

const COLUMNS = 'id, org_id, kind, provider, label, external_id, config, state, status, last_error, last_ok_at, created_by, created_at, updated_at';

connectionRoutes.get('/connections', async (c) => {
  const rows = await run(c, (q) =>
    q.query(
      `select ${COLUMNS}, (select count(*)::int from chat_identities i where i.connection_id = c.id) as linked,
              (select count(*)::int from sync_changes s where s.connection_id = c.id) as pending,
              (select count(*)::int from sync_changes s where s.connection_id = c.id and s.attempts > 0) as failing
         from connections c order by created_at`,
    ),
  );
  const cfg = c.get('deps').config;
  return c.json({ providers: [...messagingProviders(cfg), ...crmProviders(cfg)], connections: rows.map((r) => toConnection(r, r.linked ?? 0)) });
});

connectionRoutes.post('/connections/webhook', async (c) => {
  requirePerm(c, 'connections.manage');
  const input = await body(
    c,
    z.object({
      flavor: z.enum(WEBHOOK_FLAVORS),
      url: z.string().trim().max(2000),
      label: z.string().trim().min(1).max(120),
      token: z.string().trim().max(500).optional(),
      signingSecret: z.string().trim().max(200).optional(),
    }),
  );
  const problem = checkWebhookUrl(input.flavor, input.url);
  if (problem) fail('validation', { fields: 'url' }, { fields: ['url'], reason: problem });
  if (input.flavor === 'zoom' && !input.token) fail('validation', { fields: 'token' }, { fields: ['token'] });
  const deps = c.get('deps');
  const org = c.get('org');
  const auth = c.get('auth');
  const id = crypto.randomUUID();
  const secret = await seal({ url: input.url, token: input.token || undefined, signingSecret: input.signingSecret || undefined }, secretsKey(deps.config));
  await run(c, async (q) => {
    await q.query(
      `insert into connections (id, org_id, kind, provider, label, config, secret, created_by) values ($1, $2, 'messaging', 'webhook', $3, $4, $5, $6)`,
      [id, org.id, input.label, JSON.stringify({ flavor: input.flavor, host: new URL(input.url).hostname }), secret, auth.userId],
    );
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'connection.created', entity: 'connection', entityId: id, meta: { provider: 'webhook', flavor: input.flavor } });
  });
  return c.json({ id }, 201);
});

connectionRoutes.patch('/connections/:id', async (c) => {
  requirePerm(c, 'connections.manage');
  const id = param(c, 'id');
  const input = await body(c, z.object({ label: z.string().trim().min(1).max(120).optional(), paused: z.boolean().optional() }));
  const org = c.get('org');
  const auth = c.get('auth');
  await run(c, async (q) => {
    const rows = await q.query(
      `update connections set label = coalesce($2, label),
              status = case when $3::boolean is null then status when $3 then 'disabled' else 'active' end,
              updated_at = now()
        where id = $1 returning id`,
      [id, input.label ?? null, input.paused ?? null],
    );
    if (!rows.length) fail('not_found');
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'connection.updated', entity: 'connection', entityId: id, meta: { fields: Object.keys(input) } });
  });
  return c.json({ ok: true });
});

connectionRoutes.delete('/connections/:id', async (c) => {
  requirePerm(c, 'connections.manage');
  const id = param(c, 'id');
  const org = c.get('org');
  const auth = c.get('auth');
  await run(c, async (q) => {
    const rows = await q.query('delete from connections where id = $1 returning id, provider', [id]);
    if (!rows.length) fail('not_found');
    // Boards stop posting to it; people fall back to their next channel.
    await q.query(
      `update boards set notify = coalesce((select jsonb_agg(e) from jsonb_array_elements(notify) e where e->>'connectionId' <> $1), '[]'::jsonb)
        where notify @> jsonb_build_array(jsonb_build_object('connectionId', $1::text))`,
      [id],
    );
    await q.query(`update users set prefs = jsonb_set(prefs, '{channel}', '"auto"') where prefs->>'channel' = $1`, [id]);
    await audit(q, { orgId: org.id, actorId: auth.userId, action: 'connection.deleted', entity: 'connection', entityId: id, meta: { provider: rows[0].provider } });
  });
  return c.json({ ok: true });
});

/** Sends a test message: to the admin on a two-way app, or into the webhook's channel. */
connectionRoutes.post('/connections/:id/test', async (c) => {
  requirePerm(c, 'connections.manage');
  const id = param(c, 'id');
  const deps = c.get('deps');
  const org = c.get('org');
  const auth = c.get('auth');
  const input = await body(c, z.object({ channel: z.string().max(200).nullable().optional() }));
  const conn = await loadConnection(deps, org.id, id);
  if (!conn) fail('not_found');
  const adapter = ADAPTERS[conn!.provider];
  const ctx = await deps.db.system((q) => loadRenderCtx(q, deps, { org_id: org.id, user_id: auth.userId, kind: 'test', data: {} }, c.get('locale')));
  const msg = render(ctx);
  try {
    if (!adapter.twoWay || input.channel) {
      await adapter.send(deps, conn!, { kind: 'channel', channel: input.channel ?? null }, msg);
    } else {
      const [ident] = await run(c, (q) => q.query('select external_id, data from chat_identities where connection_id = $1 and user_id = $2', [id, auth.userId]));
      let target = ident ? { externalId: ident.external_id as string, data: ident.data ?? {} } : null;
      if (!target && adapter.lookupUser) {
        const found = await adapter.lookupUser(deps, conn!, auth.email);
        if (found) {
          await upsertIdentity(deps, conn!, auth.userId, found.externalId, found.data ?? {});
          target = { externalId: found.externalId, data: found.data ?? {} };
        }
      }
      if (!target) fail('connection_failed', {}, { reason: 'not_linked' });
      await adapter.send(deps, conn!, { kind: 'user', ...target! }, msg);
    }
  } catch (err) {
    if (err instanceof FatalChatError || (err as Error).message?.startsWith('webhook') || (err as Error).message?.startsWith('slack')) {
      await deps.db.system((q) => markConnection(q, id, false, (err as Error).message));
      fail('connection_failed', {}, { reason: (err as Error).message });
    }
    throw err;
  }
  await deps.db.system((q) => markConnection(q, id, true));
  return c.json({ ok: true });
});

connectionRoutes.get('/connections/:id/channels', async (c) => {
  const id = param(c, 'id');
  const deps = c.get('deps');
  const conn = await loadConnection(deps, c.get('org').id, id);
  if (!conn) fail('not_found');
  const adapter = ADAPTERS[conn!.provider];
  if (!adapter.channels) return c.json({ channels: [] });
  try {
    return c.json({ channels: await adapter.channels(deps, conn!) });
  } catch (err) {
    fail('connection_failed', {}, { reason: (err as Error).message });
  }
});

connectionRoutes.get('/connections/:id/directory', async (c) => {
  requirePerm(c, 'users.manage');
  const id = param(c, 'id');
  const deps = c.get('deps');
  const conn = await loadConnection(deps, c.get('org').id, id);
  if (!conn) fail('not_found');
  const adapter = ADAPTERS[conn!.provider];
  if (!adapter.directory) return c.json({ people: [], groups: [] });
  try {
    return c.json(await adapter.directory(deps, conn!));
  } catch (err) {
    fail('connection_failed', {}, { reason: (err as Error).message });
  }
});

// ------------------------------------------------------------------ OAuth

interface ConnectState {
  o: string; // company slug
  p: 'slack' | 'teams' | 'gchat';
  q?: Record<string, string>;
  u: string; // admin's user id
  r: string; // where to return in the app
  n: string;
  x: number;
}

const connectCallback = (cfg: Deps['config']) => `${centralUrl(cfg)}/api/connect/callback`;

connectionRoutes.get('/connect/:provider/start', async (c) => {
  requirePerm(c, 'connections.manage');
  const deps = c.get('deps');
  const cfg = deps.config;
  const org = c.get('org');
  const provider = c.req.param('provider');
  const back = c.req.query('back') === 'setup' ? (isCrm(provider) ? '/setup/accounts' : '/setup/messaging') : '/settings/connections';
  if (isCrm(provider)) return crmStart(c, provider, back);
  const home = `${orgUrl(cfg, org.slug)}${back}`;
  const info = messagingProviders(cfg).find((p) => p.id === provider && p.setup === 'oauth');
  if (!info || !info.available) return c.redirect(`${home}?error=not_configured&provider=${provider}`);
  const state: ConnectState = { o: org.slug, p: provider as ConnectState['p'], u: c.get('auth').userId, r: back, n: randomToken(12), x: nowOf(deps).getTime() + 15 * 60_000 };
  const signed = await sign(state, cfg.authSecret);
  if (provider === 'slack') return c.redirect(slackAuthorizeUrl(cfg, connectCallback(cfg), signed));
  const isMs = provider === 'teams';
  const client = isMs ? cfg.oauth.microsoft! : cfg.oauth.google!;
  const u = new URL(isMs ? 'https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize' : 'https://accounts.google.com/o/oauth2/v2/auth');
  u.searchParams.set('client_id', client.clientId);
  u.searchParams.set('redirect_uri', connectCallback(cfg));
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', isMs ? GRAPH_SCOPE : DIRECTORY_SCOPE);
  u.searchParams.set('state', signed);
  u.searchParams.set('prompt', isMs ? 'select_account' : 'consent');
  if (!isMs) u.searchParams.set('access_type', 'offline');
  return c.redirect(u.toString());
});

async function exchangeOidc(deps: Deps, provider: 'teams' | 'gchat', code: string) {
  const cfg = deps.config;
  const isMs = provider === 'teams';
  const client = isMs ? cfg.oauth.microsoft : cfg.oauth.google;
  if (!client) return null;
  const res = await fetchOf(deps)(isMs ? 'https://login.microsoftonline.com/organizations/oauth2/v2.0/token' : 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: connectCallback(cfg), client_id: client.clientId, client_secret: client.clientSecret }),
  });
  if (!res.ok) return null;
  const json: any = await res.json();
  // Straight from the provider's token endpoint over TLS (OIDC Core §3.1.3.7).
  const claims = json.id_token ? decodeJwt(json.id_token)?.claims : null;
  if (!claims || claims.aud !== client.clientId || (claims.exp ?? 0) * 1000 < nowOf(deps).getTime()) return null;
  return { claims: claims as Record<string, any>, refreshToken: (json.refresh_token as string | undefined) ?? null };
}

/** Central address: the service sends the admin back here, then on to their company. */
export async function connectCallback_(c: C) {
  const deps = c.get('deps');
  const cfg = deps.config;
  const state = await verify<ConnectState>(c.req.query('state') ?? '', cfg.authSecret);
  if (!state || state.x < nowOf(deps).getTime()) return c.text('Invalid state', 400);
  const home = `${orgUrl(cfg, state.o)}${state.r}`;
  const code = c.req.query('code');
  if (!code) return c.redirect(`${home}?error=connection_failed&provider=${state.p}`);
  const [org] = await deps.db.tenant({ orgId: null, userId: null }, (q) => q.query<OrgRow>('select * from resolve_org($1)', [state.o]));
  if (!org) return c.text('Unknown workspace', 404);
  // The person who started must still be allowed to connect tools.
  const [admin] = await deps.db.system((q) =>
    q.query(
      `select u.id from users u join roles r on r.id = u.role_id where u.id = $1 and u.org_id = $2 and u.status = 'active' and 'connections.manage' = any(r.perms)`,
      [state.u, org.id],
    ),
  );
  if (!admin) return c.redirect(`${home}?error=forbidden`);
  if (isCrm(state.p)) return crmCallback(c, state as unknown as CrmConnectState, code, org);

  let made: { externalId: string; label: string; config: Record<string, unknown>; secret: Record<string, unknown> } | null = null;
  if (state.p === 'slack') {
    made = await slackExchange(deps, code, connectCallback(cfg));
  } else {
    const got = await exchangeOidc(deps, state.p, code);
    if (got) {
      if (state.p === 'teams' && got.claims.tid) {
        const email = String(got.claims.email ?? got.claims.preferred_username ?? '');
        made = {
          externalId: String(got.claims.tid),
          label: email.includes('@') ? email.split('@')[1] : 'Microsoft Teams',
          config: { tenantId: got.claims.tid, channels: [] },
          secret: got.refreshToken ? { refreshToken: got.refreshToken } : {},
        };
      } else if (state.p === 'gchat') {
        if (!got.claims.hd) return c.redirect(`${home}?error=workspace_required&provider=gchat`);
        made = { externalId: String(got.claims.hd), label: String(got.claims.hd), config: { domain: got.claims.hd, channels: [] }, secret: got.refreshToken ? { refreshToken: got.refreshToken } : {} };
      }
    }
  }
  if (!made) return c.redirect(`${home}?error=connection_failed&provider=${state.p}`);

  const sealed = await seal(made.secret, secretsKey(cfg));
  const result = await deps.db.system(async (q) => {
    const [other] = await q.query('select org_id from connections where provider = $1 and external_id = $2', [state.p, made!.externalId]);
    if (other && other.org_id !== org.id) return 'taken' as const;
    if (other) {
      await q.query(
        `update connections set label = $3, config = config || $4::jsonb, secret = $5, status = 'active', last_error = null, updated_at = now()
          where provider = $1 and external_id = $2`,
        [state.p, made!.externalId, made!.label, JSON.stringify({ ...made!.config, channels: undefined }), sealed],
      );
    } else {
      await q.query(
        `insert into connections (org_id, kind, provider, label, external_id, config, secret, created_by) values ($1, 'messaging', $2, $3, $4, $5, $6, $7)`,
        [org.id, state.p, made!.label, made!.externalId, JSON.stringify(made!.config), sealed, state.u],
      );
    }
    await q.query(`insert into audit_log (org_id, actor_id, action, entity, meta) values ($1, $2, 'connection.created', 'connection', $3)`, [
      org.id,
      state.u,
      JSON.stringify({ provider: state.p }),
    ]);
    return 'ok' as const;
  });
  if (result === 'taken') return c.redirect(`${home}?error=connection_taken&provider=${state.p}`);

  // Slack lets us match everyone by email right away; Teams and Google Chat
  // link each person when they open the app.
  if (state.p === 'slack') {
    const conn = await deps.db.system((q) => q.query('select id from connections where provider = $1 and external_id = $2', ['slack', made!.externalId]));
    const loaded = conn[0] ? await loadConnection(deps, org.id, conn[0].id) : null;
    if (loaded) {
      try {
        const dir = await ADAPTERS.slack.directory!(deps, loaded);
        const users = await deps.db.system((q) => q.query(`select id, email from users where org_id = $1 and status in ('active', 'invited')`, [org.id]));
        const byEmail = new Map(users.map((u) => [u.email, u.id]));
        for (const p of dir.people) {
          const uid = byEmail.get(p.email);
          if (uid) await upsertIdentity(deps, loaded, uid, p.externalId);
        }
      } catch {
        // Matching is a convenience; notifications still look people up one by one.
      }
    }
  }
  return c.redirect(`${home}?connected=${state.p}`);
}

// ------------------------------------------------------- Teams app package

/** The app package an admin uploads in the Teams admin center (until the Store listing is live). */
connectionRoutes.get('/connections/teams/package', async (c) => {
  requirePerm(c, 'connections.manage');
  const deps = c.get('deps');
  const t = deps.config.connectors.teams;
  if (!t) fail('not_configured');
  const host = deps.config.centralHost;
  const L = (k: Parameters<typeof translate>[1]) => translate('en', k);
  const manifest = {
    $schema: 'https://developer.microsoft.com/en-us/json-schemas/teams/v1.17/MicrosoftTeams.schema.json',
    manifestVersion: '1.17',
    version: '1.0.0',
    id: t!.appId,
    developer: { name: 'Tendwell', websiteUrl: `https://${deps.config.baseDomain}`, privacyUrl: `https://${deps.config.baseDomain}/privacy`, termsOfUseUrl: `https://${deps.config.baseDomain}/terms` },
    name: { short: 'Tendwell', full: 'Tendwell' },
    description: { short: L('teams.package.short'), full: L('teams.package.full') },
    icons: { color: 'color.png', outline: 'outline.png' },
    accentColor: '#12786B',
    bots: [{ botId: t!.appId, scopes: ['personal', 'team'], supportsFiles: false, isNotificationOnly: false }],
    composeExtensions: [
      {
        botId: t!.appId,
        commands: [
          {
            id: 'createTask',
            type: 'action',
            context: ['message'],
            title: L('teams.package.command'),
            fetchTask: false,
            parameters: [{ name: 'title', title: L('teams.package.titleParam'), description: L('teams.package.titleParam') }],
          },
        ],
      },
    ],
    validDomains: [host, `*.${deps.config.baseDomain}`],
  };
  const zip = zipSync({
    'manifest.json': strToU8(JSON.stringify(manifest, null, 2)),
    'color.png': pngIcon(192, [18, 120, 107, 255], [243, 245, 244, 255]),
    'outline.png': pngIcon(32, [0, 0, 0, 0], [255, 255, 255, 255]),
  });
  return c.body(zip as unknown as ArrayBuffer, 200, {
    'content-type': 'application/zip',
    'content-disposition': 'attachment; filename="tendwell-teams.zip"',
  });
});
