// WhatsApp Cloud API (Meta Graph), as documented (developers.facebook.com/docs/whatsapp/cloud-api/reference/messages,
// /support/error-codes, graph-api/webhooks/getting-started): GET /<version>/<phone number id>?fields=… names the
// number; POST /<version>/<phone number id>/messages sends, answering { messaging_product, contacts[{ input, wa_id }],
// messages[{ id }] }. Errors { error: { message, type, code, error_data: { messaging_product, details }, fbtrace_id } }:
// 190 token expired (401), 131047 outside the 24-hour window, 130429 throughput reached, 100 bad parameter.
// The other half is Meta calling Curahold: `metaDelivery` builds a webhook body and its X-Hub-Signature-256.
import { json, type Ctl, type MockReq, type VendorMock } from './kit';

export const WA_PHONE_ID = '106540352242922';
export const WA_TOKEN = 'EAAGb19MockSystemUserTokenForTestsOnly0000000000';
export const WA_APP_SECRET = '0123456789abcdef0123456789abcdef';
export const waSent: any[] = [];
/** Numbers that wrote within the last 24 hours (free-form replies allowed). */
const recent = new Set<string>();

const werr = (status: number, code: number, message: string, details: string) => json({ error: { message: `(#${code}) ${message}`, type: 'OAuthException', code, error_data: { messaging_product: 'whatsapp', details }, fbtrace_id: 'AbCdEfGh123' } }, status);

export const whatsappMock: VendorMock = {
  id: 'whatsapp',
  hosts: /^graph\.facebook\.com$/,
  keyValues: { phoneNumberId: WA_PHONE_ID, accessToken: WA_TOKEN, appSecret: WA_APP_SECRET },
  reset() {
    waSent.length = 0;
    recent.clear();
  },
  async handle(req: MockReq, ctl: Ctl) {
    const m = /^\/v(\d+)\.0\/(\d+)(\/messages)?$/.exec(req.url.pathname);
    if (!m) return werr(400, 100, 'Unsupported get request.', 'unknown path');
    if (Number(m[1]) < 21) return werr(400, 2635, 'You are calling a deprecated version of the Graph API.', 'version');
    if (ctl.revoked() || req.headers.get('authorization') !== `Bearer ${WA_TOKEN}`) return werr(401, 190, 'Error validating access token: Session has expired.', 'token');
    if (m[2] !== WA_PHONE_ID) return werr(400, 100, 'Object with ID does not exist', 'phone number id');
    if (!m[3]) return json({ display_phone_number: '+90 212 555 0199', verified_name: 'Quillfield Support', id: WA_PHONE_ID });
    if (ctl.take('ratelimit')) return werr(400, 130429, 'Rate limit hit', 'Cloud API message throughput has been reached.');
    const b = req.body ?? {};
    if (b.messaging_product !== 'whatsapp' || !b.to) return werr(400, 100, 'Invalid parameter', 'messaging_product');
    if (ctl.take('badfield')) return werr(400, 131009, 'Parameter value is not valid', 'text.body');
    if (b.type === 'text' && !recent.has(b.to)) return werr(400, 131047, 'Re-engagement message', 'Message failed to send because more than 24 hours have passed since the customer last replied to this number.');
    const id = `wamid.HBgM${waSent.length + 1}`;
    waSent.push(b);
    return json({ messaging_product: 'whatsapp', contacts: [{ input: b.to, wa_id: b.to }], messages: [{ id }] });
  },
};

/** What Meta posts when a customer writes; the sender counts as within the 24-hour window from now on. */
export async function metaDelivery(from: string, text: string, id: string, at: Date, secret = WA_APP_SECRET) {
  recent.add(from);
  const body = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ id: '102290129340398', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { display_phone_number: '902125550199', phone_number_id: WA_PHONE_ID }, contacts: [{ profile: { name: 'Selin Akar' }, wa_id: from }], messages: [{ from, id, timestamp: String(Math.floor(at.getTime() / 1000)), type: 'text', text: { body: text } }] } }] }],
  });
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))), (b) => b.toString(16).padStart(2, '0')).join('');
  return { body, signature: `sha256=${sig}` };
}
