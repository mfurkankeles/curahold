// Telegram Bot API, as documented (core.telegram.org/bots/api, /bots/faq): https://api.telegram.org/bot<token>/<method>;
// every answer is { ok, result } or { ok: false, error_code, description, parameters? }. getMe proves the token,
// getUpdates lists what the bot saw (a group's chat id among them), sendMessage takes chat_id + text (1–4096
// characters). Limits: about 1 message a second per chat and 20 a minute in a group; above them 429 with
// parameters.retry_after. A revoked token answers 401 Unauthorized; a bot removed from the group 403 Forbidden.
import { json, type Ctl, type MockReq, type VendorMock } from './kit';

export const TG_TOKEN = '7012345678:AAH-b19MockTokenForTestsOnly_x1';
export const TG_CHAT = -1001987654321;
export const tgSent: any[] = [];
let sawGroup = true;

const fail = (status: number, description: string, parameters?: Record<string, unknown>) => json({ ok: false, error_code: status, description, ...(parameters ? { parameters } : {}) }, status);

export const telegramMock: VendorMock = {
  id: 'telegram',
  hosts: /^api\.telegram\.org$/,
  reset() {
    tgSent.length = 0;
    sawGroup = true;
  },
  async handle(req: MockReq, ctl: Ctl) {
    const m = /^\/bot([^/]+)\/(\w+)$/.exec(req.url.pathname);
    if (!m) return fail(404, 'Not Found');
    if (m[1] !== TG_TOKEN || ctl.revoked()) return fail(401, 'Unauthorized');
    const method = m[2];
    if (method === 'getMe') return json({ ok: true, result: { id: 7012345678, is_bot: true, first_name: 'Curahold notices', username: 'quillfield_notices_bot', can_join_groups: true } });
    if (method === 'getUpdates') {
      const chat = { id: TG_CHAT, title: 'Quillfield success team', type: 'supergroup' };
      return json({ ok: true, result: sawGroup ? [{ update_id: 900001, my_chat_member: { chat, date: 1763540000 } }, { update_id: 900002, message: { message_id: 1, chat, date: 1763540100, text: 'hello' } }] : [] });
    }
    if (method === 'sendMessage') {
      if (ctl.take('ratelimit')) return fail(429, 'Too Many Requests: retry after 7', { retry_after: 7 });
      const b = req.body ?? {};
      if (String(b.chat_id) !== String(TG_CHAT)) return fail(400, 'Bad Request: chat not found');
      if (ctl.take('badfield') || !b.text || String(b.text).length > 4096) return fail(400, 'Bad Request: message text is empty');
      tgSent.push(b);
      return json({ ok: true, result: { message_id: tgSent.length + 1, chat: { id: TG_CHAT, type: 'supergroup' }, date: Math.floor(ctl.now().getTime() / 1000), text: b.text } });
    }
    return fail(404, 'Not Found: method not found');
  },
};

/** The bot has not been added to any group yet. */
export const telegramNoGroup = () => {
  sawGroup = false;
};
