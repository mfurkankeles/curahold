// Google Calendar API v3 + Google OAuth, as documented (developers.google.com/workspace/calendar/api/v3/reference/
// events/list): GET calendars/primary (its id is the address), events.list with timeMin/timeMax, singleEvents,
// maxResults ≤ 2500, nextPageToken; POST events (sendUpdates). Errors { error: { code, message, errors[{ reason }] } }:
// 401 authError, 403 rateLimitExceeded / 429, 400 badRequest. Tokens: oauth2.googleapis.com/token (form body).
import { allow, gate, json, tokenEndpoint, type Ctl, type MockReq, type VendorMock } from './kit';

export const GCAL_ME = 'ada@demo.example';
const PAGE = 2;
type Ev = Record<string, any>;
let events: Ev[] = [];
let seq = 1;
export const gcalCreated: Ev[] = [];

const gerr = (code: number, reason: string, message: string) => json({ error: { code, message, errors: [{ domain: 'global', reason, message }] } }, code);
const iso = (base: number, min: number) => new Date(base + min * 60_000).toISOString();

export const gcalMock: VendorMock = {
  id: 'gcal',
  hosts: /^(www\.googleapis\.com|oauth2\.googleapis\.com|accounts\.google\.com)$/,
  reset() {
    const b = Date.parse('2026-11-18T09:00:00Z');
    events = [
      { id: 'ev1', status: 'confirmed', summary: 'Pinecrest quarterly review', start: { dateTime: iso(b, 0) }, end: { dateTime: iso(b, 45) }, organizer: { email: GCAL_ME }, attendees: [{ email: GCAL_ME }, { email: 'deniz@quarry.example' }, { email: 'room-3@resource.calendar.google.com', resource: true }], description: 'Pricing for next year (private notes)', updated: iso(b, -60) },
      { id: 'ev2', status: 'confirmed', summary: 'Team stand-up', start: { dateTime: iso(b, 60) }, end: { dateTime: iso(b, 75) }, organizer: { email: GCAL_ME }, attendees: [{ email: GCAL_ME }, { email: 'lena@demo.example' }], updated: iso(b, -60) },
      { id: 'ev3', status: 'confirmed', visibility: 'private', summary: 'Doctor', start: { dateTime: iso(b, 120) }, end: { dateTime: iso(b, 150) }, organizer: { email: GCAL_ME }, updated: iso(b, -60) },
      { id: 'ev4', status: 'confirmed', summary: 'Holiday', start: { date: '2026-11-19' }, end: { date: '2026-11-20' }, organizer: { email: GCAL_ME }, updated: iso(b, -60) },
      { id: 'ev5', status: 'confirmed', summary: 'Pinecrest onboarding call', start: { dateTime: iso(b, 1440) }, end: { dateTime: iso(b, 1470) }, organizer: { email: 'deniz@quarry.example' }, attendees: [{ email: GCAL_ME }, { email: 'deniz@quarry.example' }], updated: iso(b, -60) },
      { id: 'ev6', status: 'confirmed', summary: 'Next month planning with Quarry', start: { dateTime: iso(Date.now(), 60 * 24 * 30) }, end: { dateTime: iso(Date.now(), 60 * 24 * 30 + 30) }, organizer: { email: GCAL_ME }, attendees: [{ email: 'deniz@quarry.example' }], updated: iso(b, -60) },
    ];
    gcalCreated.length = 0;
    seq = 1;
  },
  consent: (u, ctl) => allow('gcal', u, ctl),
  /** The first meeting is renamed (and made longer) in Google Calendar. */
  remoteEdit(ctl, name) {
    const e = events[0];
    e.summary = name;
    e.end = { dateTime: iso(Date.parse(e.start.dateTime), 60) };
    e.updated = ctl.now().toISOString();
    return { id: `gcal:${e.id}` };
  },
  async handle(req: MockReq, ctl: Ctl) {
    const p = req.url.pathname;
    if (req.url.host === 'oauth2.googleapis.com' && p === '/token') return tokenEndpoint('gcal', req, ctl, () => ({ scope: 'https://www.googleapis.com/auth/calendar.events openid email' }));
    const stop = gate('gcal', req, ctl, { unauthorized: () => gerr(401, 'authError', 'Request had invalid authentication credentials.'), limited: () => gerr(403, 'rateLimitExceeded', 'Rate Limit Exceeded') });
    if (stop) return stop;
    if (p === '/calendar/v3/calendars/primary') return json({ kind: 'calendar#calendar', id: GCAL_ME, summary: GCAL_ME, timeZone: 'Europe/Istanbul' });
    if (p === '/calendar/v3/calendars/primary/events' && req.method === 'GET') {
      const q = req.url.searchParams;
      if (q.get('singleEvents') !== 'true' || !q.get('timeMin')) return gerr(400, 'badRequest', 'Bad Request');
      const max = Math.min(Number(q.get('maxResults') ?? 250), 2500);
      if (!(max > 0)) return gerr(400, 'invalid', 'Invalid value for: maxResults');
      const from = Date.parse(q.get('timeMin')!);
      const to = q.get('timeMax') ? Date.parse(q.get('timeMax')!) : Infinity;
      const end = (e: Ev) => Date.parse(e.end.dateTime ?? `${e.end.date}T00:00:00Z`);
      const start = (e: Ev) => Date.parse(e.start.dateTime ?? `${e.start.date}T00:00:00Z`);
      const hit = events.filter((e) => end(e) > from && start(e) < to && (e.status !== 'cancelled' || q.get('showDeleted') === 'true')).sort((a, b) => start(a) - start(b));
      const offset = Number(q.get('pageToken') ?? 0);
      const items = hit.slice(offset, offset + PAGE);
      return json({ kind: 'calendar#events', items, ...(offset + PAGE < hit.length ? { nextPageToken: String(offset + PAGE) } : { nextSyncToken: 'sync-1' }) });
    }
    if (p === '/calendar/v3/calendars/primary/events' && req.method === 'POST') {
      if (ctl.take('badfield') || !req.body?.start?.dateTime || !req.body?.summary) return gerr(400, 'required', 'Missing end time.');
      const e = { id: `new${seq++}`, status: 'confirmed', htmlLink: `https://www.google.com/calendar/event?eid=new${seq}`, ...req.body, organizer: { email: GCAL_ME } };
      events.push(e);
      gcalCreated.push(e);
      return json(e);
    }
    return gerr(404, 'notFound', 'Not Found');
  },
};

/** The meeting is cancelled on Google's side. */
export const gcalCancel = (id: string) => {
  const e = events.find((x) => x.id === id);
  if (e) e.status = 'cancelled';
};
