// WhatsApp Business (Cloud API), with the customer's own Meta app and number: Curahold never becomes a Meta
// "Tech Provider" and pays nothing; every message is billed on the customer's own Meta invoice. The administrator
// brings, from their Meta app: a permanent access token of a system user (whatsapp_business_messaging), the phone
// number's id, and the app secret. Curahold gives back a callback address and a verify token for the app's
// "Webhooks → WhatsApp Business Account → messages" subscription.
//
// In: Meta checks the address once (GET with hub.mode=subscribe, hub.verify_token, hub.challenge: answer the
// challenge), then posts each change signed with X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(app secret, body).
// Messages arrive under entry[].changes[].value.messages[] (from, id, timestamp, type, text.body) with the sender's
// profile in contacts[]. Meta retries a failed delivery for up to 7 days and may deliver twice: the message id is the
// activity's external id, so each message is kept once. Payloads are at most 3 MB.
// Out: POST graph.facebook.com/<version>/<phone number id>/messages. A free-form reply only within 24 hours of the
// customer's last message (else error 131047: an approved template is needed); templates any time. Errors are
// { error: { code, message, error_data.details, fbtrace_id } }: 190 an expired token, 10/200 a missing permission,
// 4 / 80007 / 130429 / 131056 rate limits, 100 / 131009 a bad parameter.
import { hmacHex, randomToken, safeEqual } from '../../lib/crypto';
import { CrmError, type CrmAdapter, type CrmCtx, type MailSend, type Page } from './types';

/** Meta keeps a Graph version about two years; this one is checked in the real-account test plan. */
export const GRAPH_VERSION = 'v23.0';
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
const RATE = [4, 80007, 130429, 131056];
const AUTH = [190, 0, 102];

/** A message normalised for the timeline. */
export interface WaMessage {
  id: string;
  /** The sender's number, digits only (E.164 without "+"). */
  from: string;
  name: string | null;
  text: string;
  at: string | null;
}

export async function verifyMeta(appSecret: string, raw: string, header: string | null): Promise<boolean> {
  if (!appSecret || !header?.startsWith('sha256=')) return false;
  return safeEqual(header.slice(7).toLowerCase(), await hmacHex(appSecret, raw));
}

/** Every customer message in one webhook delivery (status updates and other fields are left out). */
export function parseWhatsApp(payload: any, phoneNumberId: string): WaMessage[] {
  if (payload?.object !== 'whatsapp_business_account') return [];
  const out: WaMessage[] = [];
  for (const entry of Array.isArray(payload.entry) ? payload.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const v = change?.value;
      if (change?.field !== 'messages' || !v || String(v.metadata?.phone_number_id ?? '') !== phoneNumberId) continue;
      const names = new Map<string, string>((v.contacts ?? []).map((c: any) => [String(c.wa_id ?? ''), String(c.profile?.name ?? '')]));
      for (const m of Array.isArray(v.messages) ? v.messages.slice(0, 100) : []) {
        if (!m?.id || !m.from) continue;
        const from = String(m.from).replace(/\D/g, '');
        const text =
          m.type === 'text' ? String(m.text?.body ?? '') : m.type === 'button' ? String(m.button?.text ?? '') : m.type === 'interactive' ? String(m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? '') : `[${String(m.type ?? 'message')}]`;
        const ts = Number(m.timestamp);
        out.push({ id: String(m.id).slice(0, 200), from, name: names.get(from) || null, text: text.slice(0, 4000) || `[${String(m.type)}]`, at: Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000).toISOString() : null });
      }
    }
  }
  return out;
}

/** Meta's error as a CrmError the routes and the engine understand. */
async function metaFail(res: Response): Promise<never> {
  const j: any = await res.json().catch(() => null);
  const code = Number(j?.error?.code ?? 0);
  const details = String(j?.error?.error_data?.details ?? j?.error?.message ?? res.statusText).slice(0, 300);
  if (code === 131047) throw new CrmError(`131047: more than 24 hours since the customer last wrote: send an approved template instead`, 400);
  if (RATE.includes(code) || res.status === 429) throw new CrmError(`${code}: ${details}`, 429, 60);
  if (AUTH.includes(code) || res.status === 401) throw new CrmError(`${code}: ${details}`, 401, undefined, true);
  if (code === 10 || code === 200) throw new CrmError(`${code}: ${details}`, 403);
  throw new CrmError(`${code || res.status}: ${details}`, res.status >= 400 && res.status < 500 ? 400 : res.status);
}

async function graph(fetcher: typeof fetch, token: string, path: string, init: RequestInit & { json?: unknown } = {}) {
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${token}`);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(init.json);
  }
  const res = await fetcher(`${GRAPH}${path}`, { ...init, headers, body });
  if (!res.ok) await metaFail(res);
  return res.json();
}

const refuse = async (): Promise<never> => {
  throw new CrmError('WhatsApp messages arrive at the callback address; nothing is pulled or mapped');
};
const empty = async (): Promise<Page> => ({ rows: [], next: null });
const noList = async () => [];

export const whatsapp: CrmAdapter = {
  provider: 'whatsapp',
  tabular: false,
  inbound: true,
  keyed: {
    async connect(fetcher, values) {
      const accessToken = (values.accessToken ?? '').trim();
      const phoneNumberId = (values.phoneNumberId ?? '').trim();
      const appSecret = (values.appSecret ?? '').trim();
      if (!/^\d{6,25}$/.test(phoneNumberId)) throw new CrmError('Enter the phone number id from WhatsApp → API Setup (digits only)', 400);
      if (accessToken.length < 30 || /\s/.test(accessToken)) throw new CrmError('Paste the access token of the system user', 400);
      if (!/^[0-9a-f]{32}$/i.test(appSecret)) throw new CrmError('Paste the app secret from App settings → Basic (32 characters)', 400);
      const n = await graph(fetcher, accessToken, `/${phoneNumberId}?fields=display_phone_number,verified_name`);
      const sourceId = randomToken(12);
      return {
        secret: { accessToken, appSecret, verifyToken: randomToken(18) },
        config: { sourceId, phoneNumberId, number: String(n?.display_phone_number ?? '') },
        label: `${String(n?.verified_name ?? 'WhatsApp')} · ${String(n?.display_phone_number ?? phoneNumberId)}`,
        instanceId: `whatsapp:${phoneNumberId}`,
      };
    },
  },
  // A system user's token does not expire; one that was revoked has to be replaced (reconnect).
  async refresh(_ctx, secret) {
    if (!secret.accessToken) throw new CrmError('Reconnect WhatsApp with a new access token', 401, undefined, true);
    return secret;
  },
  /** A reply (free text inside the 24-hour window) or an approved template, to one number. */
  async send(ctx: CrmCtx, input: MailSend) {
    const to = input.to.replace(/\D/g, '');
    const message = input.template
      ? { type: 'template', template: { name: input.template.name, language: { code: input.template.language } } }
      : { type: 'text', text: { body: input.body.slice(0, 4096), preview_url: false } };
    const j = await graph(ctx.fetch, await ctx.token(), `/${encodeURIComponent(String(ctx.config.phoneNumberId))}/messages`, {
      method: 'POST',
      json: { messaging_product: 'whatsapp', recipient_type: 'individual', to, ...(input.inReplyTo ? { context: { message_id: input.inReplyTo } } : {}), ...message },
    });
    const id = j?.messages?.[0]?.id;
    if (!id) throw new CrmError('WhatsApp did not return the message id');
    return { externalId: String(id) };
  },
  objects: noList,
  fields: noList,
  users: noList,
  list: empty,
  update: refuse,
  create: refuse,
  url() {
    return null;
  },
};
