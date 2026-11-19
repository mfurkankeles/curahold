// Microsoft Graph v1.0 calendar + Microsoft identity platform, as documented (learn.microsoft.com/graph/api/
// user-list-calendarview, event-delta): /me?$select=mail, /me/calendarView with startDateTime/endDateTime,
// $top, @odata.nextLink; Prefer outlook.timezone. POST /me/events. Errors { error: { code, message } }: 401
// InvalidAuthenticationToken, 429 TooManyRequests with Retry-After, 400 ErrorInvalidRequest. Tokens:
// login.microsoftonline.com/common/oauth2/v2.0/token (form body, scope required on refresh).
import { allow, gate, json, tokenEndpoint, type Ctl, type MockReq, type VendorMock } from './kit';

export const MS_ME = 'ada@demo.example';
const G = 'https://graph.microsoft.com/v1.0/me';
type Ev = Record<string, any>;
let events: Ev[] = [];
let seq = 1;
export const msCreated: Ev[] = [];
const merr = (status: number, code: string, message: string, headers: Record<string, string> = {}) => json({ error: { code, message } }, status, headers);
const local = (base: number, min: number) => new Date(base + min * 60_000).toISOString().replace('Z', '0000');

export const outlookcalMock: VendorMock = {
  id: 'outlookcal',
  hosts: /^(graph\.microsoft\.com|login\.microsoftonline\.com)$/,
  reset() {
    const b = Date.parse('2026-11-18T09:00:00Z');
    const who = (address: string) => ({ emailAddress: { address, name: address.split('@')[0] }, type: 'required' });
    events = [
      { id: 'AAMk-1', subject: 'Orbital Freight check-in', start: { dateTime: local(b, 0), timeZone: 'UTC' }, end: { dateTime: local(b, 30), timeZone: 'UTC' }, isAllDay: false, isCancelled: false, sensitivity: 'normal', organizer: who(MS_ME), attendees: [who('ops@heron.example')], bodyPreview: 'Contract numbers inside' },
      { id: 'AAMk-2', subject: 'Private appointment', start: { dateTime: local(b, 60), timeZone: 'UTC' }, end: { dateTime: local(b, 90), timeZone: 'UTC' }, isAllDay: false, isCancelled: false, sensitivity: 'private', organizer: who(MS_ME), attendees: [] },
      { id: 'AAMk-3', subject: 'Orbital Freight renewal', start: { dateTime: local(b, 120), timeZone: 'UTC' }, end: { dateTime: local(b, 180), timeZone: 'UTC' }, isAllDay: false, isCancelled: false, sensitivity: 'normal', organizer: who('ops@heron.example'), attendees: [who(MS_ME), who('ops@heron.example'), { ...who('room@demo.example'), type: 'resource' }] },
    ];
    msCreated.length = 0;
    seq = 1;
  },
  consent: (u, ctl) => allow('outlookcal', u, ctl),
  /** The first meeting is renamed in Outlook. */
  remoteEdit(_ctl, name) {
    events[0].subject = name;
    return { id: 'outlookcal:AAMk-1' };
  },
  async handle(req: MockReq, ctl: Ctl) {
    const p = req.url.pathname;
    if (req.url.host === 'login.microsoftonline.com' && p.endsWith('/oauth2/v2.0/token')) {
      if (req.body?.grant_type === 'refresh_token' && !req.body?.scope) return json({ error: 'invalid_request', error_description: "AADSTS90014: The required field 'scope' is missing." }, 400);
      return tokenEndpoint('outlookcal', req, ctl);
    }
    const stop = gate('outlookcal', req, ctl, { unauthorized: () => merr(401, 'InvalidAuthenticationToken', 'Access token has expired or is not yet valid.'), limited: () => merr(429, 'TooManyRequests', 'Too many requests', { 'retry-after': '12' }) });
    if (stop) return stop;
    if (p === '/v1.0/me') return json({ mail: MS_ME, userPrincipalName: MS_ME });
    if (p === '/v1.0/me/calendarView') {
      const q = req.url.searchParams;
      const from = Date.parse(q.get('startDateTime') ?? '');
      const to = Date.parse(q.get('endDateTime') ?? '');
      if (!Number.isFinite(from) || !Number.isFinite(to)) return merr(400, 'ErrorInvalidParameter', "This request requires a time window specified by the query string parameters StartDateTime and EndDateTime.");
      if (!String(req.headers.get('prefer') ?? '').includes('outlook.timezone="UTC"')) return merr(400, 'ErrorInvalidRequest', 'test mock: ask for UTC');
      const at = (t: any) => Date.parse(`${t.dateTime.replace(/0000$/, '')}Z`);
      const hit = events.filter((e) => at(e.end) > from && at(e.start) < to);
      const top = Number(q.get('$top') ?? 10);
      const skip = Number(q.get('$skip') ?? 0);
      const value = hit.slice(skip, skip + Math.min(top, 2));
      return json({ '@odata.context': 'x', value, ...(skip + 2 < hit.length ? { '@odata.nextLink': `${G}/calendarView?startDateTime=${encodeURIComponent(q.get('startDateTime')!)}&endDateTime=${encodeURIComponent(q.get('endDateTime')!)}&$top=${top}&$skip=${skip + 2}` } : {}) });
    }
    if (p === '/v1.0/me/events' && req.method === 'POST') {
      if (ctl.take('badfield') || !req.body?.start?.timeZone) return merr(400, 'ErrorInvalidRequest', 'Your request is invalid.');
      const e = { id: `AAMk-new${seq++}`, webLink: `https://outlook.office365.com/owa/?itemid=AAMk-new${seq}`, isCancelled: false, isAllDay: false, sensitivity: 'normal', ...req.body };
      events.push(e);
      msCreated.push(e);
      return json(e, 201);
    }
    return merr(404, 'ResourceNotFound', 'Resource not found');
  },
};

export const outlookCancel = (id: string) => {
  const e = events.find((x) => x.id === id);
  if (e) e.isCancelled = true;
};
