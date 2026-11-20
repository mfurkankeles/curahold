// One-way posts to a channel through the service's own incoming webhook.
// Covers chat tools that have no Curahold app (yet) and anything a company
// wires up through Zapier, Make or n8n (the "json" flavour).
//
// Lark / Feishu: a group's custom bot address (open.larksuite.com or
// open.feishu.cn /open-apis/bot/v2/hook/…), signed when the bot has "signature
// verification" on: sign = base64(HMAC-SHA256(key = "<seconds>\n<secret>", empty
// message)). Lark answers HTTP 200 with a non-zero `code` on failure (19021 a bad
// signature, 9499 a bad request, 11232 too frequent), so the body is read.
// Telegram: a bot from @BotFather posts to one group or channel with the Bot API
// (api.telegram.org/bot<token>/sendMessage); plain text, 4,096 characters at most;
// Telegram allows about 20 messages a minute in a group, and answers 429 with
// parameters.retry_after when it is exceeded.
import { fetchOf, nowOf, type Deps } from '../../context';
import { hmacHex } from '../../lib/crypto';
import { larkSign } from './lark';
import { FatalChatError, plainText, readJson, type ChatMessage, type LoadedConnection, type MessagingAdapter } from './types';

export const WEBHOOK_FLAVORS = ['slack', 'teams', 'gchat', 'discord', 'mattermost', 'rocketchat', 'webex', 'zoom', 'lark', 'telegram', 'json'] as const;
export type WebhookFlavor = (typeof WEBHOOK_FLAVORS)[number];

// Where each service's webhooks live. A URL elsewhere is refused, so a
// webhook cannot be pointed at an arbitrary address by mistake.
const HOSTS: Partial<Record<WebhookFlavor, RegExp>> = {
  slack: /^hooks\.slack\.com$/,
  teams: /(^|\.)(logic\.azure\.com|powerplatform\.com|powerautomate\.com)$/,
  gchat: /^chat\.googleapis\.com$/,
  discord: /^(discord\.com|discordapp\.com|ptb\.discord\.com|canary\.discord\.com)$/,
  webex: /^webexapis\.com$/,
  zoom: /^(integrations\.zoom\.us|inbots\.zoom\.us)$/,
  lark: /^(open\.larksuite\.com|open\.feishu\.cn)$/,
  telegram: /^api\.telegram\.org$/,
};

/** This machine or a private network: never a place to send a company's data or a key. */
export function privateHost(host: string): boolean {
  // A name may end in a dot ("localhost.", "metadata.google.internal."): the same host to DNS.
  const h = host.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (/^[0-9.]+$/.test(h)) {
    const [a, b] = h.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (h.includes(':')) return true; // IPv6 literals: not needed by any service
  return false;
}

/**
 * Why a webhook address cannot be used for this flavour (wrong host for the tool, not https, private address), or null.
 */
export function checkWebhookUrl(flavor: WebhookFlavor, raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return 'url';
  }
  if (u.protocol !== 'https:' || u.username || u.password) return 'url';
  if (privateHost(u.hostname)) return 'url';
  const allowed = HOSTS[flavor];
  if (allowed && !allowed.test(u.hostname.toLowerCase())) return 'host';
  if (flavor === 'discord' && !u.pathname.startsWith('/api/webhooks/')) return 'host';
  if (flavor === 'lark' && !/^\/open-apis\/bot\/v2\/hook\/[\w-]{8,}$/.test(u.pathname)) return 'host';
  if (flavor === 'telegram' && !/^\/bot\d{3,}:[\w-]{20,}\/sendMessage$/.test(u.pathname)) return 'host';
  return null;
}

const md = (msg: ChatMessage, link: (url: string, label: string) => string, bold: (s: string) => string) => {
  const lines = [bold(msg.title)];
  if (msg.body) lines.push(msg.body);
  for (const f of msg.fields ?? []) lines.push(`${f.label}: ${f.value}`);
  if (msg.note) lines.push(msg.note);
  if (msg.url) lines.push(link(msg.url, msg.openLabel));
  return lines.join('\n');
};

/** A notification in the JSON shape each webhook flavour expects (Slack-like, Lark post, Telegram, generic). */
export function webhookPayload(flavor: WebhookFlavor, msg: ChatMessage, at: Date): unknown {
  const slackish = md(msg, (u, l) => `<${u}|${l}>`, (s) => `*${s}*`);
  const markdown = md(msg, (u, l) => `[${l}](${u})`, (s) => `**${s}**`);
  switch (flavor) {
    case 'slack':
    case 'gchat':
      return { text: slackish };
    case 'mattermost':
    case 'rocketchat':
      return { text: markdown };
    case 'discord':
      return { content: markdown.slice(0, 1990), allowed_mentions: { parse: [] } };
    case 'webex':
      return { markdown };
    case 'lark':
      // A rich-text ("post") message: a bold title line, then the text, then a link with the button's words.
      return {
        msg_type: 'post',
        content: {
          post: {
            en_us: {
              title: msg.title.slice(0, 200),
              content: [
                ...[msg.body, ...(msg.fields ?? []).map((f) => `${f.label}: ${f.value}`), msg.note].filter((x): x is string => !!x).map((text) => [{ tag: 'text', text }]),
                ...(msg.url ? [[{ tag: 'a', text: msg.openLabel, href: msg.url }]] : []),
              ],
            },
          },
        },
      };
    case 'telegram':
      // Plain text: nothing in a task title can break Telegram's formatting rules, and links still open.
      return { text: plainText(msg).slice(0, 4096), link_preview_options: { is_disabled: true } };
    case 'zoom':
      return {
        content: {
          head: { text: msg.title.slice(0, 120) },
          body: [{ type: 'message', text: [msg.body, ...(msg.fields ?? []).map((f) => `${f.label}: ${f.value}`), msg.note, msg.url].filter(Boolean).join('\n') }],
        },
      };
    case 'teams':
      return {
        type: 'message',
        attachments: [
          {
            contentType: 'application/vnd.microsoft.card.adaptive',
            content: {
              type: 'AdaptiveCard',
              $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
              version: '1.4',
              body: [
                { type: 'TextBlock', text: msg.title, weight: 'Bolder', wrap: true },
                ...(msg.body ? [{ type: 'TextBlock', text: msg.body, wrap: true }] : []),
                ...(msg.fields?.length ? [{ type: 'FactSet', facts: msg.fields.map((f) => ({ title: f.label, value: f.value })) }] : []),
              ],
              actions: msg.url ? [{ type: 'Action.OpenUrl', title: msg.openLabel, url: msg.url }] : [],
            },
          },
        ],
      };
    case 'json':
    default:
      return { title: msg.title, body: msg.body ?? null, fields: msg.fields ?? [], url: msg.url ?? null, text: plainText(msg), sentAt: at.toISOString() };
  }
}

export const webhookAdapter: MessagingAdapter = {
  provider: 'webhook',
  twoWay: false,
  async send(deps: Deps, conn: LoadedConnection, _target, msg) {
    const flavor = (conn.config.flavor ?? 'json') as WebhookFlavor;
    const url = String(conn.secret?.url ?? '');
    if (checkWebhookUrl(flavor, url)) throw new FatalChatError('webhook_url');
    const body = JSON.stringify(webhookPayload(flavor, msg, nowOf(deps)));
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (flavor === 'zoom' && conn.secret?.token) headers.authorization = String(conn.secret.token);
    if (flavor === 'json' && conn.secret?.signingSecret) {
      headers['x-curahold-signature'] = `sha256=${await hmacHex(String(conn.secret.signingSecret), body)}`;
    }
    if (flavor === 'lark' || flavor === 'telegram') return sendChecked(deps, flavor, url, conn, body);
    let target = url;
    if (flavor === 'zoom') {
      const u = new URL(url);
      u.searchParams.set('format', 'full');
      target = u.toString();
    }
    const res = await fetchOf(deps)(target, { method: 'POST', headers, body });
    if (res.status === 404 || res.status === 410 || res.status === 401 || res.status === 403) throw new FatalChatError(`webhook ${res.status}`);
    if (!res.ok) throw new Error(`webhook ${res.status}`);
  },
};

/** Lark and Telegram: say what went wrong in the body, so it is read; a signature or a chat is added first. */
async function sendChecked(deps: Deps, flavor: 'lark' | 'telegram', url: string, conn: LoadedConnection, raw: string) {
  const payload = JSON.parse(raw);
  if (flavor === 'lark' && conn.secret?.signingSecret) {
    const ts = Math.floor(nowOf(deps).getTime() / 1000);
    Object.assign(payload, { timestamp: String(ts), sign: await larkSign(String(conn.secret.signingSecret), ts) });
  }
  if (flavor === 'telegram') payload.chat_id = conn.config.chatId;
  const res = await fetchOf(deps)(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  const j = await readJson(res);
  if (flavor === 'telegram') {
    if (res.ok && j?.ok) return;
    // 401: the token was revoked in @BotFather; 403: the bot was removed from the group; 400 "chat not found".
    if (res.status === 401 || res.status === 403 || (res.status === 400 && /chat not found|upgraded to a supergroup/i.test(String(j?.description)))) throw new FatalChatError(`webhook telegram ${res.status} ${String(j?.description ?? '').slice(0, 120)}`);
    // Busy or a passing fault: thrown as a plain error so the delivery is retried and the connection is not marked.
    if (res.status === 429) throw new Error(`busy telegram 429 retry after ${Number(j?.parameters?.retry_after ?? 30)}s`);
    throw new Error(`busy telegram ${res.status}`);
  }
  if (!res.ok) {
    if (res.status === 404 || res.status === 410 || res.status === 401 || res.status === 403) throw new FatalChatError(`webhook lark ${res.status}`);
    throw new Error(`busy lark ${res.status}`);
  }
  const code = Number(j?.code ?? j?.StatusCode ?? 0);
  if (!code) return;
  // A wrong signature, a removed bot or a keyword the message lacks will not pass by retrying.
  if ([19021, 19022, 19024, 19001, 19002, 9499].includes(code)) throw new FatalChatError(`webhook lark ${code} ${String(j?.msg ?? '').slice(0, 120)}`);
  throw new Error(`busy lark ${code}`);
}
