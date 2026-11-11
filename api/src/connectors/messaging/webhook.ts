// One-way posts to a channel through the service's own incoming webhook.
// Covers chat tools that have no Tendwell app (yet) and anything a company
// wires up through Zapier, Make or n8n (the "json" flavour).
import { fetchOf, nowOf, type Deps } from '../../context';
import { hmacHex } from '../../lib/crypto';
import { FatalChatError, plainText, type ChatMessage, type LoadedConnection, type MessagingAdapter } from './types';

export const WEBHOOK_FLAVORS = ['slack', 'teams', 'gchat', 'discord', 'mattermost', 'rocketchat', 'webex', 'zoom', 'json'] as const;
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
};

function privateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (/^[0-9.]+$/.test(h)) {
    const [a, b] = h.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  if (h.includes(':')) return true; // IPv6 literals: not needed by any service
  return false;
}

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
      headers['x-tendwell-signature'] = `sha256=${await hmacHex(String(conn.secret.signingSecret), body)}`;
    }
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
