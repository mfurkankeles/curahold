// Microsoft Teams: one Tendwell bot (Azure Bot Service, single-tenant
// registration in Tendwell's own tenant, distributed through the Teams
// Store). A company connects by signing in as a Microsoft 365 admin, which
// tells us its tenant id; activities from that tenant then map to it.
//
// The bot can only message someone who has the app installed (personally
// or in a team), so a person's chat identity is created when Teams tells us
// about the install — until then their notifications go by email.
import { fetchOf, nowOf, type Deps } from '../../context';
import { FatalChatError, readJson, type ChatMessage, type Directory, type LoadedConnection, type MessagingAdapter } from './types';

export const BOT_JWKS = 'https://login.botframework.com/v1/.well-known/keys';
export const BOT_ISSUERS = ['https://api.botframework.com'];
export const GRAPH_SCOPE = 'openid email profile offline_access User.ReadBasic.All';

let tokenCache: { value: string; exp: number } | null = null;

export async function botToken(deps: Deps): Promise<string> {
  const t = deps.config.connectors.teams;
  if (!t) throw new FatalChatError('teams not configured');
  const now = nowOf(deps).getTime();
  if (tokenCache && tokenCache.exp - 60_000 > now) return tokenCache.value;
  const res = await fetchOf(deps)(`https://login.microsoftonline.com/${t.tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: t.appId,
      client_secret: t.appPassword,
      scope: 'https://api.botframework.com/.default',
    }),
  });
  const json = await readJson(res);
  if (!res.ok || !json.access_token) throw new FatalChatError(`teams token ${res.status}`);
  tokenCache = { value: json.access_token, exp: now + Number(json.expires_in ?? 3600) * 1000 };
  return tokenCache.value;
}

export function adaptiveCard(msg: ChatMessage, withActions = true) {
  return {
    contentType: 'application/vnd.microsoft.card.adaptive',
    content: {
      type: 'AdaptiveCard',
      $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
      version: '1.4',
      body: [
        { type: 'TextBlock', text: msg.title, weight: 'Bolder', wrap: true },
        ...(msg.body ? [{ type: 'TextBlock', text: msg.body, wrap: true }] : []),
        ...(msg.fields?.length ? [{ type: 'FactSet', facts: msg.fields.map((f) => ({ title: f.label, value: f.value })) }] : []),
        ...(msg.note ? [{ type: 'TextBlock', text: msg.note, isSubtle: true, wrap: true }] : []),
      ],
      actions: [
        ...(withActions ? (msg.actions ?? []).map((a) => ({ type: 'Action.Submit', title: a.label, data: { tw: a.kind, taskId: a.taskId } })) : []),
        ...(msg.url ? [{ type: 'Action.OpenUrl', title: msg.openLabel, url: msg.url }] : []),
      ],
    },
  };
}

function safeServiceUrl(raw: unknown): string {
  const u = new URL(String(raw));
  // Bot Framework service URLs are Microsoft hosts; never post a token anywhere else.
  if (u.protocol !== 'https:' || !/(^|\.)(trafficmanager\.net|botframework\.com|teams\.microsoft\.com|skype\.com)$/.test(u.hostname)) {
    throw new FatalChatError('teams service url');
  }
  return u.origin + u.pathname.replace(/\/+$/, '');
}

export async function botCall(deps: Deps, serviceUrl: string, path: string, method: string, body?: unknown) {
  const res = await fetchOf(deps)(`${safeServiceUrl(serviceUrl)}${path}`, {
    method,
    headers: { authorization: `Bearer ${await botToken(deps)}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 403 || res.status === 404) throw new FatalChatError(`teams ${res.status}`);
  if (!res.ok) throw new Error(`teams ${res.status}`);
  return readJson(res);
}

export async function teamsMember(deps: Deps, serviceUrl: string, conversationId: string, memberId: string) {
  const m = await botCall(deps, serviceUrl, `/v3/conversations/${encodeURIComponent(conversationId)}/members/${encodeURIComponent(memberId)}`, 'GET');
  const email = String(m.email ?? m.userPrincipalName ?? '').toLowerCase();
  return { email, name: String(m.name ?? m.givenName ?? email), aadObjectId: String(m.aadObjectId ?? '') };
}

/** Exchanges the admin's stored refresh token for a Graph token (directory suggestions only). */
async function graphToken(deps: Deps, conn: LoadedConnection) {
  const ms = deps.config.oauth.microsoft;
  const refresh = conn.secret?.refreshToken;
  if (!ms || !refresh) return null;
  const res = await fetchOf(deps)('https://login.microsoftonline.com/organizations/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: ms.clientId, client_secret: ms.clientSecret, refresh_token: String(refresh), scope: GRAPH_SCOPE }),
  });
  const json = await readJson(res);
  return res.ok && json.access_token ? String(json.access_token) : null;
}

export const teamsAdapter: MessagingAdapter = {
  provider: 'teams',
  twoWay: true,
  async send(deps, conn, target, msg) {
    let serviceUrl: string;
    let conversationId: string;
    if (target.kind === 'user') {
      serviceUrl = target.data.serviceUrl;
      conversationId = target.data.conversationId;
    } else {
      const ch = (conn.config.channels ?? []).find((c: any) => c.id === target.channel);
      if (!ch) throw new FatalChatError('teams channel unknown');
      serviceUrl = ch.serviceUrl;
      conversationId = ch.id;
    }
    if (!serviceUrl || !conversationId) throw new FatalChatError('teams conversation missing');
    await botCall(deps, serviceUrl, `/v3/conversations/${encodeURIComponent(conversationId)}/activities`, 'POST', {
      type: 'message',
      summary: msg.title,
      attachments: [adaptiveCard(msg)],
    });
  },
  async directory(deps, conn): Promise<Directory> {
    const tok = await graphToken(deps, conn);
    if (!tok) return { people: [], groups: [] };
    const people: Directory['people'] = [];
    let next: string | null = 'https://graph.microsoft.com/v1.0/users?$select=id,displayName,mail,userPrincipalName,accountEnabled&$top=999';
    for (let page = 0; next && page < 10; page++) {
      const res = await fetchOf(deps)(next, { headers: { authorization: `Bearer ${tok}` } });
      if (!res.ok) break;
      const json = await readJson(res);
      for (const u of json.value ?? []) {
        const email = String(u.mail ?? u.userPrincipalName ?? '').toLowerCase();
        if (u.accountEnabled === false || !email.includes('@') || email.includes('#ext#')) continue;
        people.push({ externalId: String(u.id), email, name: String(u.displayName ?? email) });
      }
      next = json['@odata.nextLink'] ?? null;
    }
    return { people, groups: [] };
  },
  async channels(_deps, conn) {
    return (conn.config.channels ?? []).map((c: any) => ({ id: c.id, name: c.name }));
  },
};

export const _testing = { resetToken: () => (tokenCache = null) };
