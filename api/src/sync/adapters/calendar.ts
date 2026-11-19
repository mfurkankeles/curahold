// Calendars: Google Calendar (Calendar API v3) and Outlook Calendar (Microsoft Graph v1.0). A meeting with a
// customer's people becomes a meeting on that customer's timeline (so "last contact" counts it), and a meeting
// planned in Curahold can be put in the calendar with the customer's people invited. Signed in with the same
// Google / Microsoft app registrations as the mailboxes, asking only for calendar scopes.
//
// Read: the primary calendar's meetings that already took place, in a window from the last run (minus a week, so a
// renamed or cancelled meeting of the past days is seen again) to now; 90 days back on the first run. Google:
// events.list with timeMin/timeMax, singleEvents (recurring meetings as their instances), maxResults ≤ 2500,
// nextPageToken. Graph: /me/calendarView with startDateTime/endDateTime, @odata.nextLink, times in UTC. Private
// meetings are skipped, and only the title, the time, the length and the guests are kept: never the description,
// the place or the call link. Limits: Google answers 403 rateLimitExceeded / 429, Graph 429 with Retry-After; both
// become a wait and the run keeps its place.
import { call, codeGrant, CrmError, refreshGrant, type CalendarEvent, type Connected, type CrmAdapter, type CrmCtx, type MailItem, type OAuthSpec } from './types';

const GCAL = 'https://www.googleapis.com/calendar/v3';
const G_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const G_TOKEN = 'https://oauth2.googleapis.com/token';
const G_SCOPE = 'https://www.googleapis.com/auth/calendar.events openid email';
const GRAPH = 'https://graph.microsoft.com/v1.0/me';
const M_AUTH = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const M_TOKEN = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const M_SCOPE = 'offline_access openid email https://graph.microsoft.com/Calendars.ReadWrite';
const PAGE = 250;
const OVERLAP_MS = 7 * 86_400_000;
const FIRST_MS = 90 * 86_400_000;

const lower = (v: unknown) => (typeof v === 'string' && v.includes('@') ? v.trim().toLowerCase() : null);
/** The window to read: [since − a week, now], or the last 90 days. */
function windowOf(ctx: CrmCtx, since: string | null) {
  const now = ctx.now().getTime();
  const from = since ? Date.parse(since) - OVERLAP_MS : now - FIRST_MS;
  return { from: new Date(Math.max(from, now - FIRST_MS)).toISOString(), to: new Date(now).toISOString() };
}
const minutesBetween = (a: string | null, b: string | null) => (a && b ? Math.round((Date.parse(b) - Date.parse(a)) / 60_000) : null);
const noObjects = async () => [];
const refuse = async (): Promise<never> => {
  throw new CrmError('A calendar carries no object mapping');
};
const calendarConnected = (provider: 'gcal' | 'outlookcal', email: string, secret: Record<string, unknown>): Connected => ({ secret, config: { email }, label: email, instanceId: `${provider}:${email}` });

function oauth(provider: 'gcal' | 'outlookcal'): OAuthSpec {
  const google = provider === 'gcal';
  return {
    authorizeUrl(client, redirectUri, state) {
      const u = new URL(google ? G_AUTH : M_AUTH);
      u.searchParams.set('client_id', client.clientId);
      u.searchParams.set('redirect_uri', redirectUri);
      u.searchParams.set('response_type', 'code');
      u.searchParams.set('scope', google ? G_SCOPE : M_SCOPE);
      if (google) {
        u.searchParams.set('access_type', 'offline');
        u.searchParams.set('prompt', 'consent');
      } else {
        u.searchParams.set('response_mode', 'query');
        u.searchParams.set('prompt', 'select_account');
      }
      u.searchParams.set('state', state);
      return u.toString();
    },
    async exchange(fetcher, client, code, redirectUri, _opts, now) {
      const j = await codeGrant(fetcher, google ? G_TOKEN : M_TOKEN, client, code, redirectUri, now, false, google ? {} : { scope: M_SCOPE });
      const ctx: CrmCtx = { fetch: fetcher, now: () => now, config: {}, token: async () => j.access_token, refresh: async () => j.access_token };
      const email = google ? lower((await call(ctx, `${GCAL}/calendars/primary`))?.id) : lower((await call(ctx, `${GRAPH}?$select=mail,userPrincipalName`))?.mail ?? undefined);
      if (!email) throw new CrmError('That sign-in does not open a calendar', 401, undefined, true);
      return calendarConnected(provider, email, { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: j.expiresAt });
    },
  };
}

/** No app registration on this server (development, tests): a refresh token and the calendar's address. */
function keyedConnect(provider: 'gcal' | 'outlookcal') {
  return async (_fetcher: typeof fetch, values: Record<string, string>): Promise<Connected> => {
    const refreshToken = (values.refreshToken ?? '').trim();
    const email = lower(values.email);
    if (!refreshToken || !email) throw new CrmError('Paste a refresh token and the calendar address');
    return calendarConnected(provider, email, { refreshToken });
  };
}

// ------------------------------------------------------------------ Google Calendar

async function googleMeetings(ctx: CrmCtx, opts: { since: string | null; cursor: string | null }): Promise<{ items: MailItem[]; next: string | null }> {
  const { from, to } = opts.cursor ? JSON.parse(opts.cursor) : windowOf(ctx, opts.since);
  const q = new URLSearchParams({ timeMin: from, timeMax: to, singleEvents: 'true', orderBy: 'startTime', showDeleted: 'true', maxResults: String(PAGE) });
  if (opts.cursor) q.set('pageToken', JSON.parse(opts.cursor).page);
  const j = await call(ctx, `${GCAL}/calendars/primary/events?${q}`);
  const me = String(ctx.config.email ?? '').toLowerCase();
  const items: MailItem[] = [];
  for (const e of j?.items ?? []) {
    const start = e.start?.dateTime ?? null;
    const end = e.end?.dateTime ?? null;
    // All-day entries (holidays, out of office) are not meetings; a meeting still to come is read once it happened.
    if (!start || Date.parse(end ?? start) > ctx.now().getTime()) continue;
    if (e.visibility === 'private' || e.visibility === 'confidential') continue;
    const guests = (e.attendees ?? []).filter((a: any) => !a.resource).map((a: any) => lower(a.email)).filter(Boolean) as string[];
    const organizer = lower(e.organizer?.email);
    items.push({
      externalId: `gcal:${e.id}`,
      participants: [...new Set([organizer, ...guests].filter((x): x is string => !!x && x !== me))],
      from: organizer,
      subject: String(e.summary ?? '').trim() || '(no title)',
      snippet: '',
      direction: organizer === me ? 'out' : 'in',
      happenedAt: new Date(start).toISOString(),
      kind: 'meeting',
      minutes: minutesBetween(start, end),
      cancelled: e.status === 'cancelled',
    });
  }
  return { items, next: j?.nextPageToken ? JSON.stringify({ from, to, page: j.nextPageToken }) : null };
}

async function googleSchedule(ctx: CrmCtx, input: CalendarEvent) {
  const j = await call(ctx, `${GCAL}/calendars/primary/events?sendUpdates=all`, {
    method: 'POST',
    json: { summary: input.title, description: input.description ?? undefined, start: { dateTime: input.start }, end: { dateTime: input.end }, attendees: input.attendees.map((email) => ({ email })) },
  });
  if (!j?.id) throw new CrmError('Google Calendar did not return the new meeting');
  return { externalId: `gcal:${j.id}`, url: typeof j.htmlLink === 'string' ? j.htmlLink : null };
}

// ------------------------------------------------------------------ Outlook Calendar

async function graphMeetings(ctx: CrmCtx, opts: { since: string | null; cursor: string | null }): Promise<{ items: MailItem[]; next: string | null }> {
  let url: string;
  if (opts.cursor) {
    if (!opts.cursor.startsWith(`${GRAPH}/calendarView?`)) throw new CrmError('Unexpected next page address');
    url = opts.cursor;
  } else {
    const { from, to } = windowOf(ctx, opts.since);
    url = `${GRAPH}/calendarView?${new URLSearchParams({ startDateTime: from, endDateTime: to, $top: '100', $select: 'id,subject,start,end,attendees,organizer,sensitivity,isCancelled,isAllDay,showAs' })}`;
  }
  const j = await call(ctx, url, { headers: { prefer: 'outlook.timezone="UTC"' } });
  const me = String(ctx.config.email ?? '').toLowerCase();
  const utc = (t: any) => (t?.dateTime ? new Date(/Z|[+-]\d\d:?\d\d$/.test(t.dateTime) ? t.dateTime : `${t.dateTime}Z`).toISOString() : null);
  const items: MailItem[] = [];
  for (const e of j?.value ?? []) {
    const start = utc(e.start);
    const end = utc(e.end);
    if (!start || e.isAllDay || Date.parse(end ?? start) > ctx.now().getTime()) continue;
    if (e.sensitivity === 'private' || e.sensitivity === 'confidential') continue;
    const organizer = lower(e.organizer?.emailAddress?.address);
    const guests = (e.attendees ?? []).filter((a: any) => a.type !== 'resource').map((a: any) => lower(a.emailAddress?.address)).filter(Boolean) as string[];
    items.push({
      externalId: `outlookcal:${e.id}`,
      participants: [...new Set([organizer, ...guests].filter((x): x is string => !!x && x !== me))],
      from: organizer,
      subject: String(e.subject ?? '').trim() || '(no title)',
      snippet: '',
      direction: organizer === me ? 'out' : 'in',
      happenedAt: start,
      kind: 'meeting',
      minutes: minutesBetween(start, end),
      cancelled: !!e.isCancelled,
    });
  }
  const next = typeof j?.['@odata.nextLink'] === 'string' ? j['@odata.nextLink'] : null;
  return { items, next };
}

async function graphSchedule(ctx: CrmCtx, input: CalendarEvent) {
  const j = await call(ctx, `${GRAPH}/events`, {
    method: 'POST',
    json: {
      subject: input.title,
      ...(input.description ? { body: { contentType: 'text', content: input.description } } : {}),
      start: { dateTime: input.start.replace(/Z$/, ''), timeZone: 'UTC' },
      end: { dateTime: input.end.replace(/Z$/, ''), timeZone: 'UTC' },
      attendees: input.attendees.map((address) => ({ emailAddress: { address }, type: 'required' })),
    },
  });
  if (!j?.id) throw new CrmError('Outlook did not return the new meeting');
  return { externalId: `outlookcal:${j.id}`, url: typeof j.webLink === 'string' ? j.webLink : null };
}

function calendarAdapter(provider: 'gcal' | 'outlookcal'): CrmAdapter {
  const google = provider === 'gcal';
  return {
    provider,
    tabular: false,
    mailbox: true,
    calendar: true,
    oauth: oauth(provider),
    keyed: { connect: keyedConnect(provider) },
    async refresh(ctx, secret, client) {
      if (!secret.refreshToken) throw new CrmError('Reconnect the calendar: the saved sign-in has no refresh token', 401, undefined, true);
      return refreshGrant(ctx.fetch, google ? G_TOKEN : M_TOKEN, client, String(secret.refreshToken), ctx.now(), google ? {} : { scope: M_SCOPE });
    },
    objects: noObjects,
    fields: noObjects,
    users: noObjects,
    async list() {
      return { rows: [], next: null };
    },
    messages: google ? googleMeetings : graphMeetings,
    schedule: google ? googleSchedule : graphSchedule,
    update: refuse,
    create: refuse,
    url() {
      return null;
    },
  };
}

export const gcal = calendarAdapter('gcal');
export const outlookcal = calendarAdapter('outlookcal');
