// Mailboxes: Gmail and Outlook. Recent mail is attached to the matching
// customer as a timeline activity (the engine calls `messages` on a schedule;
// the match is by any email address on the message — see api/src/sync/mailbox.ts),
// and a reply can be sent from the connected mailbox and logged as an outgoing
// activity (`send`, driven by a route). These adapters carry no object mapping:
// `objects`, `fields`, `users` and `list` are empty, and the engine takes the
// mailbox branch instead.
//
// Signing in is OAuth (Google / Microsoft), reusing this server's Google and
// Microsoft app registrations. Where the server has no registration (local
// development, tests) a mailbox can be connected with an injected refresh token
// (and, for a test, an access token), through the keyed path below — clearly the
// escape hatch, not the normal flow. Tokens are sealed with the connection.
import { codeGrant, CrmError, call, refreshGrant, type Connected, type CrmAdapter, type CrmCtx, type MailItem, type MailSend, type OAuthSpec } from './types';

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
const GMAIL_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GMAIL_TOKEN = 'https://oauth2.googleapis.com/token';
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send openid email';
const GRAPH = 'https://graph.microsoft.com/v1.0/me';
const GRAPH_AUTH = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const GRAPH_TOKEN = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const GRAPH_SCOPE = 'offline_access openid email https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.Send';
const PAGE = 25;

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/** Every address in a header value ("Jo <jo@x.example>, Sam <sam@y.example>"), lower-cased. */
const emailsIn = (v: unknown): string[] => (typeof v === 'string' ? (v.match(EMAIL) ?? []).map((e) => e.toLowerCase()) : []);
const firstEmail = (v: unknown): string | null => emailsIn(v)[0] ?? null;
const b64urlOf = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** The mailbox owner's own address, to tell a sent message from a received one and to validate a connection. */
async function gmailProfile(ctx: Pick<CrmCtx, 'fetch' | 'token' | 'refresh' | 'now' | 'config'>): Promise<string> {
  const j = await call(ctx as CrmCtx, `${GMAIL}/profile`);
  if (!j?.emailAddress) throw new CrmError('That sign-in does not open a Gmail mailbox', 401, undefined, true);
  return String(j.emailAddress).toLowerCase();
}
async function graphProfile(ctx: Pick<CrmCtx, 'fetch' | 'token' | 'refresh' | 'now' | 'config'>): Promise<string> {
  const j = await call(ctx as CrmCtx, `${GRAPH}?$select=mail,userPrincipalName`);
  const email = j?.mail ?? j?.userPrincipalName;
  if (!email) throw new CrmError('That sign-in does not open an Outlook mailbox', 401, undefined, true);
  return String(email).toLowerCase();
}

/** A context for the moments right after sign-in, before a connection row exists. */
const freshCtx = (fetcher: typeof fetch, now: Date, token: string): CrmCtx => ({ fetch: fetcher, now: () => now, config: {}, token: async () => token, refresh: async () => token });

function gmailOAuth(): OAuthSpec {
  return {
    authorizeUrl(client, redirectUri, state) {
      const u = new URL(GMAIL_AUTH);
      u.searchParams.set('client_id', client.clientId);
      u.searchParams.set('redirect_uri', redirectUri);
      u.searchParams.set('response_type', 'code');
      u.searchParams.set('scope', GMAIL_SCOPE);
      u.searchParams.set('access_type', 'offline');
      u.searchParams.set('prompt', 'consent');
      u.searchParams.set('state', state);
      return u.toString();
    },
    async exchange(fetcher, client, code, redirectUri, _opts, now) {
      const j = await codeGrant(fetcher, GMAIL_TOKEN, client, code, redirectUri, now);
      const email = await gmailProfile(freshCtx(fetcher, now, j.access_token));
      return mailboxConnected('gmail', email, { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: j.expiresAt });
    },
  };
}

function outlookOAuth(): OAuthSpec {
  return {
    authorizeUrl(client, redirectUri, state) {
      const u = new URL(GRAPH_AUTH);
      u.searchParams.set('client_id', client.clientId);
      u.searchParams.set('redirect_uri', redirectUri);
      u.searchParams.set('response_type', 'code');
      u.searchParams.set('scope', GRAPH_SCOPE);
      u.searchParams.set('response_mode', 'query');
      u.searchParams.set('prompt', 'select_account');
      u.searchParams.set('state', state);
      return u.toString();
    },
    async exchange(fetcher, client, code, redirectUri, _opts, now) {
      const j = await codeGrant(fetcher, GRAPH_TOKEN, client, code, redirectUri, now, false, { scope: GRAPH_SCOPE });
      const email = await graphProfile(freshCtx(fetcher, now, j.access_token));
      return mailboxConnected('outlook', email, { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: j.expiresAt });
    },
  };
}

function mailboxConnected(provider: 'gmail' | 'outlook', email: string, secret: Record<string, unknown>): Connected {
  return { secret, config: { email }, label: email, instanceId: `${provider}:${email}` };
}

/** The injected-token path (no app registration): store what is handed in and validate it with a whoami. */
function keyedConnect(provider: 'gmail' | 'outlook') {
  return async (fetcher: typeof fetch, values: Record<string, string>, now: Date): Promise<Connected> => {
    const refreshToken = (values.refreshToken ?? '').trim();
    const accessToken = (values.accessToken ?? '').trim();
    if (!refreshToken && !accessToken) throw new CrmError('Paste a refresh token for the mailbox');
    // Validate with whatever token can be used now: a provided access token, else the refresh token has to be exchanged by the server at run time.
    let email = (values.email ?? '').trim().toLowerCase();
    if (accessToken) {
      email = provider === 'gmail' ? await gmailProfile(freshCtx(fetcher, now, accessToken)) : await graphProfile(freshCtx(fetcher, now, accessToken));
    } else if (!email) {
      throw new CrmError('With only a refresh token, also give the mailbox address so it can be connected');
    }
    return mailboxConnected(provider, email, { refreshToken: refreshToken || undefined, accessToken: accessToken || undefined, expiresAt: accessToken ? now.getTime() + 55 * 60_000 : undefined });
  };
}

// ------------------------------------------------------------------- Gmail

async function gmailMessages(ctx: CrmCtx, opts: { since: string | null; cursor: string | null }): Promise<{ items: MailItem[]; next: string | null }> {
  const me = String(ctx.config.email ?? '').toLowerCase();
  const after = opts.since ? Math.floor(new Date(opts.since).getTime() / 1000) : 0;
  const q = after ? `after:${after}` : '';
  const url = `${GMAIL}/messages?maxResults=${PAGE}${q ? `&q=${encodeURIComponent(q)}` : ''}${opts.cursor ? `&pageToken=${encodeURIComponent(opts.cursor)}` : ''}`;
  const list = await call(ctx, url);
  const items: MailItem[] = [];
  for (const m of list?.messages ?? []) {
    const full = await call(ctx, `${GMAIL}/messages/${encodeURIComponent(m.id)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date`);
    const headers = new Map<string, string>((full?.payload?.headers ?? []).map((h: any) => [String(h.name).toLowerCase(), String(h.value ?? '')]));
    const from = firstEmail(headers.get('from'));
    const participants = [...new Set([...emailsIn(headers.get('from')), ...emailsIn(headers.get('to')), ...emailsIn(headers.get('cc'))])];
    const internal = full?.internalDate ? new Date(Number(full.internalDate)).toISOString() : null;
    items.push({
      externalId: String(m.id),
      participants,
      from,
      subject: headers.get('subject') || '(no subject)',
      snippet: String(full?.snippet ?? '').slice(0, 2000),
      direction: from && from === me ? 'out' : 'in',
      happenedAt: internal ?? (headers.get('date') ? new Date(headers.get('date')!).toISOString() : null),
    });
  }
  return { items, next: list?.nextPageToken ?? null };
}

async function gmailSend(ctx: CrmCtx, input: MailSend): Promise<{ externalId: string }> {
  const me = String(ctx.config.email ?? '');
  const raw = [`From: ${me}`, `To: ${input.to}`, `Subject: ${input.subject}`, 'Content-Type: text/plain; charset="UTF-8"', '', input.body].join('\r\n');
  const j = await call(ctx, `${GMAIL}/messages/send`, { method: 'POST', json: { raw: b64urlOf(raw), ...(input.inReplyTo ? { threadId: input.inReplyTo } : {}) } });
  if (!j?.id) throw new CrmError('Gmail did not return the sent message');
  return { externalId: String(j.id) };
}

// ------------------------------------------------------------------ Outlook

async function graphMessages(ctx: CrmCtx, opts: { since: string | null; cursor: string | null }): Promise<{ items: MailItem[]; next: string | null }> {
  const me = String(ctx.config.email ?? '').toLowerCase();
  let url: string;
  if (opts.cursor && opts.cursor.startsWith('https://graph.microsoft.com/')) {
    url = opts.cursor;
  } else {
    const select = '$select=id,subject,from,toRecipients,ccRecipients,bodyPreview,receivedDateTime,sentDateTime';
    const filter = opts.since ? `&$filter=${encodeURIComponent(`receivedDateTime ge ${new Date(opts.since).toISOString()}`)}` : '';
    url = `${GRAPH}/messages?${select}&$top=${PAGE}&$orderby=${encodeURIComponent('receivedDateTime asc')}${filter}`;
  }
  const j = await call(ctx, url);
  const addr = (r: any) => (r?.emailAddress?.address ? String(r.emailAddress.address).toLowerCase() : null);
  const items: MailItem[] = (j?.value ?? []).map((m: any) => {
    const from = addr(m.from);
    const participants = [...new Set([from, ...(m.toRecipients ?? []).map(addr), ...(m.ccRecipients ?? []).map(addr)].filter((e): e is string => !!e))];
    return {
      externalId: String(m.id),
      participants,
      from,
      subject: m.subject || '(no subject)',
      snippet: String(m.bodyPreview ?? '').slice(0, 2000),
      direction: from && from === me ? 'out' : 'in',
      happenedAt: m.receivedDateTime ?? m.sentDateTime ?? null,
    };
  });
  const nextLink = typeof j?.['@odata.nextLink'] === 'string' && j['@odata.nextLink'].startsWith('https://graph.microsoft.com/') ? j['@odata.nextLink'] : null;
  return { items, next: nextLink };
}

async function graphSend(ctx: CrmCtx, input: MailSend): Promise<{ externalId: string }> {
  // Graph's sendMail returns no id; a stable external id keeps the logged reply from being attached twice.
  await call(ctx, `${GRAPH}/sendMail`, {
    method: 'POST',
    json: { message: { subject: input.subject, body: { contentType: 'Text', content: input.body }, toRecipients: [{ emailAddress: { address: input.to } }] }, saveToSentItems: true },
  });
  return { externalId: `sent:${ctx.now().getTime()}` };
}

// ------------------------------------------------------------------ adapters

const noObjects = async () => [];
const refuse = async (): Promise<never> => {
  throw new CrmError('A mailbox carries no object mapping');
};

export const gmail: CrmAdapter = {
  provider: 'gmail',
  tabular: false,
  mailbox: true,
  oauth: gmailOAuth(),
  keyed: { connect: keyedConnect('gmail') },
  async refresh(ctx, secret, client) {
    if (!secret.refreshToken) throw new CrmError('Reconnect Gmail: the saved sign-in has no refresh token', 401, undefined, true);
    return refreshGrant(ctx.fetch, GMAIL_TOKEN, client, String(secret.refreshToken), ctx.now());
  },
  objects: noObjects,
  fields: noObjects,
  users: noObjects,
  async list() {
    return { rows: [], next: null };
  },
  messages: gmailMessages,
  send: gmailSend,
  update: refuse,
  create: refuse,
  url() {
    return null;
  },
};

export const outlook: CrmAdapter = {
  provider: 'outlook',
  tabular: false,
  mailbox: true,
  oauth: outlookOAuth(),
  keyed: { connect: keyedConnect('outlook') },
  async refresh(ctx, secret, client) {
    if (!secret.refreshToken) throw new CrmError('Reconnect Outlook: the saved sign-in has no refresh token', 401, undefined, true);
    return refreshGrant(ctx.fetch, GRAPH_TOKEN, client, String(secret.refreshToken), ctx.now(), { scope: GRAPH_SCOPE });
  },
  objects: noObjects,
  fields: noObjects,
  users: noObjects,
  async list() {
    return { rows: [], next: null };
  },
  messages: graphMessages,
  send: graphSend,
  update: refuse,
  create: refuse,
  url() {
    return null;
  },
};

