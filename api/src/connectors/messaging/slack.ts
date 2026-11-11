// Slack: one Tendwell app, installed per workspace with OAuth v2. The bot
// token is sealed in the connection; people are matched by email.
import { fetchOf, nowOf, type Config, type Deps } from '../../context';
import { hmacHex, safeEqual } from '../../lib/crypto';
import { FatalChatError, readJson, type ChatMessage, type Directory, type LoadedConnection, type MessagingAdapter } from './types';

export const SLACK_SCOPES = [
  'chat:write',
  'im:write',
  'users:read',
  'users:read.email',
  'usergroups:read',
  'channels:read',
  'groups:read',
  'commands',
];

const FATAL = new Set(['invalid_auth', 'account_inactive', 'token_revoked', 'not_authed', 'missing_scope', 'team_access_not_granted']);

export async function slackApi(deps: Deps, token: string, method: string, params: Record<string, unknown> = {}, get = false) {
  const f = fetchOf(deps);
  let res: Response;
  if (get) {
    const u = new URL(`https://slack.com/api/${method}`);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
    res = await f(u.toString(), { headers: { authorization: `Bearer ${token}` } });
  } else {
    res = await f(`https://slack.com/api/${method}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(params),
    });
  }
  if (res.status === 429) throw new Error('slack rate limited');
  const json = await readJson(res);
  if (!json.ok) {
    if (FATAL.has(json.error)) throw new FatalChatError(`slack ${json.error}`);
    const err = new Error(`slack ${method}: ${json.error ?? res.status}`) as Error & { slackError?: string };
    err.slackError = json.error;
    throw err;
  }
  return json;
}

export function slackAuthorizeUrl(cfg: Config, redirectUri: string, state: string) {
  const u = new URL('https://slack.com/oauth/v2/authorize');
  u.searchParams.set('client_id', cfg.connectors.slack!.clientId);
  u.searchParams.set('scope', SLACK_SCOPES.join(','));
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('state', state);
  return u.toString();
}

export async function slackExchange(deps: Deps, code: string, redirectUri: string) {
  const s = deps.config.connectors.slack!;
  const res = await fetchOf(deps)('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: s.clientId, client_secret: s.clientSecret, code, redirect_uri: redirectUri }),
  });
  const json = await readJson(res);
  if (!json.ok || !json.access_token || !json.team?.id) return null;
  return {
    externalId: String(json.team.id),
    label: String(json.team.name ?? 'Slack'),
    config: { teamName: json.team.name ?? null, botUserId: json.bot_user_id ?? null, appId: json.app_id ?? null },
    secret: { botToken: String(json.access_token) },
  };
}

/** Slack signs every request: v0=HMAC-SHA256(signing secret, "v0:<timestamp>:<raw body>"). */
export async function verifySlackRequest(deps: Deps, raw: string, timestamp: string | undefined, signature: string | undefined) {
  const secret = deps.config.connectors.slack?.signingSecret;
  if (!secret || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowOf(deps).getTime() / 1000 - ts) > 300) return false;
  const expected = `v0=${await hmacHex(secret, `v0:${timestamp}:${raw}`)}`;
  return safeEqual(expected, signature);
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function slackBlocks(msg: ChatMessage, withActions = true) {
  const blocks: any[] = [
    { type: 'section', text: { type: 'mrkdwn', text: `*${esc(msg.title)}*${msg.body ? `\n${esc(msg.body)}` : ''}` } },
  ];
  if (msg.fields?.length) {
    blocks.push({ type: 'section', fields: msg.fields.slice(0, 10).map((f) => ({ type: 'mrkdwn', text: `*${esc(f.label)}*\n${esc(f.value)}` })) });
  }
  if (msg.note) blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: esc(msg.note) }] });
  const elements: any[] = [];
  if (withActions) {
    for (const a of msg.actions ?? []) {
      elements.push({
        type: 'button',
        action_id: `tw_${a.kind}`,
        value: a.taskId,
        text: { type: 'plain_text', text: a.label },
        ...(a.kind === 'done' ? { style: 'primary' } : {}),
      });
    }
  }
  if (msg.url) elements.push({ type: 'button', action_id: 'tw_open', url: msg.url, text: { type: 'plain_text', text: msg.openLabel } });
  if (elements.length) blocks.push({ type: 'actions', elements });
  return blocks;
}

const token = (conn: LoadedConnection) => {
  const t = conn.secret?.botToken;
  if (!t) throw new FatalChatError('slack token missing');
  return String(t);
};

export const slackAdapter: MessagingAdapter = {
  provider: 'slack',
  twoWay: true,
  async send(deps, conn, target, msg) {
    const channel = target.kind === 'user' ? target.externalId : target.channel;
    if (!channel) throw new FatalChatError('slack channel missing');
    await slackApi(deps, token(conn), 'chat.postMessage', {
      channel,
      text: msg.title,
      blocks: slackBlocks(msg),
      unfurl_links: false,
      unfurl_media: false,
    });
  },
  async lookupUser(deps, conn, email) {
    try {
      const r = await slackApi(deps, token(conn), 'users.lookupByEmail', { email }, true);
      return r.user?.id ? { externalId: String(r.user.id) } : null;
    } catch (e) {
      if ((e as any).slackError === 'users_not_found') return null;
      throw e;
    }
  },
  async directory(deps, conn): Promise<Directory> {
    const people: Directory['people'] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 20; page++) {
      const r = await slackApi(deps, token(conn), 'users.list', { limit: 200, cursor }, true);
      for (const m of r.members ?? []) {
        if (m.deleted || m.is_bot || m.is_app_user || m.id === 'USLACKBOT' || !m.profile?.email) continue;
        people.push({ externalId: m.id, email: String(m.profile.email).toLowerCase(), name: m.profile.real_name || m.real_name || m.name });
      }
      cursor = r.response_metadata?.next_cursor || undefined;
      if (!cursor) break;
    }
    let groups: Directory['groups'] = [];
    try {
      const g = await slackApi(deps, token(conn), 'usergroups.list', { include_users: true }, true);
      groups = (g.usergroups ?? []).filter((x: any) => !x.date_delete).map((x: any) => ({ name: x.name, memberIds: x.users ?? [] }));
    } catch {
      // Free workspaces have no user groups — teams are then suggested from the template.
    }
    return { people, groups };
  },
  async channels(deps, conn) {
    const out: { id: string; name: string }[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 10; page++) {
      const r = await slackApi(deps, token(conn), 'conversations.list', { types: 'public_channel,private_channel', exclude_archived: true, limit: 200, cursor }, true);
      for (const ch of r.channels ?? []) out.push({ id: ch.id, name: `#${ch.name}` });
      cursor = r.response_metadata?.next_cursor || undefined;
      if (!cursor) break;
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },
};
