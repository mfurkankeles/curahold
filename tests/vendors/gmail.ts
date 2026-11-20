// Gmail API v1 as documented: Google sign-in (answered by the Google mock), users/me/profile, messages.list with
// q=after:<epoch seconds> and pageToken, messages.get?format=metadata with chosen headers and internalDate,
// messages/send with a base64url RFC 2822 message; errors as { error: { code, message, status } };
// 429 rateLimitExceeded.
import { allow, gate, json, type Ctl, type MockReq, type VendorMock } from './kit';

const ME = 'ada@demo.example';
let messages: { id: string; from: string; to: string; subject: string; snippet: string; at: number }[] = [];
const sent: string[] = [];
const err = (code: number, status: string, message: string) => json({ error: { code, message, status, errors: [{ message, reason: status }] } }, code);
const unauthorized = () => err(401, 'UNAUTHENTICATED', 'Request had invalid authentication credentials.');
const limited = () => err(429, 'RESOURCE_EXHAUSTED', 'User-rate limit exceeded.');

export const gmailMock: VendorMock = {
  id: 'gmail',
  hosts: /^gmail\.googleapis\.com$/,
  reset() {
    const t = Date.parse('2026-11-18T08:00:00Z');
    messages = [
      { id: '18c0a1', from: 'Buyer <buyer@quillfield.example>', to: ME, subject: 'Renewal question', snippet: 'When does our plan renew?', at: t },
      { id: '18c0a2', from: 'Newsletter <news@elsewhere.example>', to: ME, subject: 'Weekly digest', snippet: 'Nothing to see', at: t },
    ];
    sent.length = 0;
  },
  consent: (u, ctl) => allow('gmail', u, ctl),
  remoteEdit(ctl, name) {
    messages.push({ id: `18c0b${messages.length}`, from: 'Buyer <buyer@quillfield.example>', to: ME, subject: name, snippet: 'A new mail', at: ctl.now().getTime() });
    return { id: messages[messages.length - 1].id };
  },
  async handle(req: MockReq, ctl: Ctl) {
    const stop = gate('gmail', req, ctl, { unauthorized, limited });
    if (stop) return stop;
    const p = req.url.pathname.replace('/gmail/v1/users/me', '');
    if (p === '/profile') return json({ emailAddress: ME, messagesTotal: messages.length, historyId: '1' });
    if (p === '/messages' && req.method === 'GET') {
      const after = /after:(\d+)/.exec(req.url.searchParams.get('q') ?? '');
      const from = after ? Number(after[1]) * 1000 : 0;
      return json({ messages: messages.filter((m) => m.at >= from).map((m) => ({ id: m.id, threadId: `t-${m.id}` })), resultSizeEstimate: messages.length });
    }
    if (p === '/messages/send' && req.method === 'POST') {
      if (!req.body?.raw) return err(400, 'INVALID_ARGUMENT', "'raw' RFC822 payload message string or uploading message via /upload/* URL required");
      sent.push(req.body.raw);
      return json({ id: `sent-${sent.length}`, threadId: req.body.threadId ?? 'new', labelIds: ['SENT'] });
    }
    const one = /^\/messages\/(\w+)$/.exec(p);
    const m = one && messages.find((x) => x.id === one[1]);
    if (m) return json({ id: m.id, threadId: `t-${m.id}`, snippet: m.snippet, internalDate: String(m.at), payload: { headers: [{ name: 'From', value: m.from }, { name: 'To', value: m.to }, { name: 'Subject', value: m.subject }, { name: 'Date', value: new Date(m.at).toUTCString() }] } });
    return err(404, 'NOT_FOUND', 'Requested entity was not found.');
  },
};
