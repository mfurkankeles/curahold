// Google Chat: one Tendwell Chat app (HTTP endpoint) published on the
// Google Workspace Marketplace. A company connects by signing in with a
// Workspace account, which gives us its domain; Chat events are matched to
// the company by the sender's email domain. The app posts with its service
// account; it can message people who added it (admins can add it for all).
import { fetchOf, nowOf, type Deps } from '../../context';
import { signRs256 } from '../../lib/jwt';
import { FatalChatError, readJson, type ChatMessage, type Directory, type LoadedConnection, type MessagingAdapter } from './types';

export const CHAT_ISSUER = 'chat@system.gserviceaccount.com';
export const CHAT_JWKS = 'https://www.googleapis.com/service_accounts/v1/jwk/chat@system.gserviceaccount.com';
export const DIRECTORY_SCOPE = 'openid email profile https://www.googleapis.com/auth/directory.readonly';

let tokenCache: { value: string; exp: number } | null = null;

async function appToken(deps: Deps): Promise<string> {
  const g = deps.config.connectors.gchat;
  if (!g) throw new FatalChatError('google chat not configured');
  const now = nowOf(deps).getTime();
  if (tokenCache && tokenCache.exp - 60_000 > now) return tokenCache.value;
  const iat = Math.floor(now / 1000);
  const assertion = await signRs256(
    { iss: g.serviceAccountEmail, scope: 'https://www.googleapis.com/auth/chat.bot', aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600 },
    g.privateKey,
  );
  const res = await fetchOf(deps)('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const json = await readJson(res);
  if (!res.ok || !json.access_token) throw new FatalChatError(`google token ${res.status}`);
  tokenCache = { value: json.access_token, exp: now + Number(json.expires_in ?? 3600) * 1000 };
  return tokenCache.value;
}

export function chatCard(msg: ChatMessage, withActions = true) {
  const widgets: any[] = [];
  if (msg.body) widgets.push({ textParagraph: { text: msg.body.replace(/</g, '&lt;') } });
  for (const f of msg.fields ?? []) widgets.push({ decoratedText: { topLabel: f.label, text: f.value.replace(/</g, '&lt;') } });
  if (msg.note) widgets.push({ textParagraph: { text: `<i>${msg.note.replace(/</g, '&lt;')}</i>` } });
  const buttons: any[] = [];
  if (withActions) {
    for (const a of msg.actions ?? []) {
      buttons.push({ text: a.label, onClick: { action: { function: `tw_${a.kind}`, parameters: [{ key: 'taskId', value: a.taskId }] } } });
    }
  }
  if (msg.url) buttons.push({ text: msg.openLabel, onClick: { openLink: { url: msg.url } } });
  if (buttons.length) widgets.push({ buttonList: { buttons } });
  return {
    text: msg.title,
    cardsV2: [{ cardId: 'tendwell', card: { header: { title: msg.title.slice(0, 200) }, sections: widgets.length ? [{ widgets }] : [] } }],
  };
}

const SPACE_RE = /^spaces\/[A-Za-z0-9_-]{1,100}$/;

async function directoryToken(deps: Deps, conn: LoadedConnection) {
  const g = deps.config.oauth.google;
  const refresh = conn.secret?.refreshToken;
  if (!g || !refresh) return null;
  const res = await fetchOf(deps)('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: g.clientId, client_secret: g.clientSecret, refresh_token: String(refresh) }),
  });
  const json = await readJson(res);
  return res.ok && json.access_token ? String(json.access_token) : null;
}

export const gchatAdapter: MessagingAdapter = {
  provider: 'gchat',
  twoWay: true,
  async send(deps, conn, target, msg) {
    const space = target.kind === 'user' ? target.data.space : target.channel;
    if (!space || !SPACE_RE.test(space)) throw new FatalChatError('google chat space missing');
    const res = await fetchOf(deps)(`https://chat.googleapis.com/v1/${space}/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${await appToken(deps)}`, 'content-type': 'application/json' },
      body: JSON.stringify(chatCard(msg)),
    });
    if (res.status === 403 || res.status === 404) throw new FatalChatError(`google chat ${res.status}`);
    if (!res.ok) throw new Error(`google chat ${res.status}`);
  },
  async directory(deps, conn): Promise<Directory> {
    const tok = await directoryToken(deps, conn);
    if (!tok) return { people: [], groups: [] };
    const people: Directory['people'] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < 10; page++) {
      const u = new URL('https://people.googleapis.com/v1/people:listDirectoryPeople');
      u.searchParams.set('readMask', 'names,emailAddresses');
      u.searchParams.set('sources', 'DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE');
      u.searchParams.set('pageSize', '1000');
      if (pageToken) u.searchParams.set('pageToken', pageToken);
      const res = await fetchOf(deps)(u.toString(), { headers: { authorization: `Bearer ${tok}` } });
      if (!res.ok) break;
      const json = await readJson(res);
      for (const p of json.people ?? []) {
        const email = String(p.emailAddresses?.[0]?.value ?? '').toLowerCase();
        if (!email) continue;
        people.push({ externalId: String(p.resourceName ?? email), email, name: String(p.names?.[0]?.displayName ?? email) });
      }
      pageToken = json.nextPageToken;
      if (!pageToken) break;
    }
    return { people, groups: [] };
  },
  async channels(_deps, conn) {
    return (conn.config.channels ?? []).map((c: any) => ({ id: c.id, name: c.name }));
  },
};

export const _testing = { resetToken: () => (tokenCache = null) };
