// Lark / Feishu custom bot, as documented (open.larksuite.com/document/client-docs/bot-v3/add-custom-bot and the
// open-lark SDK that implements it): POST to /open-apis/bot/v2/hook/<token> on open.larksuite.com or open.feishu.cn;
// with signature verification on, `timestamp` (seconds) and `sign` = base64(HMAC-SHA256(key "<ts>\n<secret>", ""))
// must be in the body and the timestamp within an hour. Lark answers HTTP 200 with { code, msg }: 0 success,
// 19021 sign match fail, 19001 a removed bot / unknown token, 11232 frequency limited (100 a minute, 5 a second),
// 9499 bad request (a malformed message).
import { json, type Ctl, type MockReq, type VendorMock } from './kit';

export const LARK_TOKEN = 'b19lark-0f3c2a9e-7d1b-4c55-9a7e-2b8f6c1d3e4f';
export const LARK_SECRET = 'lark-signing-secret-b19';
export const larkPosts: any[] = [];

async function expected(ts: number) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(`${ts}\n${LARK_SECRET}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, new Uint8Array(0)))));
}

export const larkMock: VendorMock = {
  id: 'lark',
  hosts: /^open\.(larksuite\.com|feishu\.cn)$/,
  reset() {
    larkPosts.length = 0;
  },
  async handle(req: MockReq, ctl: Ctl) {
    const m = /^\/open-apis\/bot\/v2\/hook\/([\w-]+)$/.exec(req.url.pathname);
    if (!m || req.method !== 'POST') return json({ code: 9499, msg: 'Bad Request' }, 404);
    if (m[1] !== LARK_TOKEN || ctl.revoked()) return json({ code: 19001, msg: 'param invalid: incoming webhook access token invalid' });
    if (ctl.take('ratelimit')) return json({ code: 11232, msg: 'frequency limited psm[lark.oapi.app_platform_runtime]appID[1]' });
    const b = req.body ?? {};
    const ts = Number(b.timestamp);
    if (!b.sign || Math.abs(ctl.now().getTime() / 1000 - ts) > 3600 || b.sign !== (await expected(ts))) return json({ code: 19021, msg: 'sign match fail or timestamp is not within one hour from current time' });
    if (ctl.take('badfield') || !['text', 'post', 'interactive', 'image', 'share_chat'].includes(b.msg_type)) return json({ code: 9499, msg: 'Bad Request' });
    larkPosts.push(b);
    return json({ code: 0, msg: 'success', data: {} });
  },
};
