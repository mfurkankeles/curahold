// Stripe API, as documented (docs.stripe.com/api, /pagination, /rate-limits, /keys/restricted-api-keys): Bearer
// restricted key; lists { object: 'list', data, has_more } newest first with limit (1–100) and starting_after;
// Events list with type wildcards ("invoice.*") and created[gte]. A restricted key without a permission answers 403
// with an invalid_request_error naming it; a rolled key 401; beyond the limit 429 with Stripe-Rate-Limited-Reason.
// Amounts in the smallest unit (JPY has none).
import { json, type Ctl, type MockReq, type VendorMock } from './kit';

export const STRIPE_KEY = 'rk_test_51QuillfieldB19MockOnly0000';
type O = Record<string, any>;
let customers: O[] = [];
let invoices: O[] = [];
let events: O[] = [];
let noEvents = false;
const serr = (status: number, type: string, message: string, extra: O = {}, headers: Record<string, string> = {}) => json({ error: { type, message, ...extra } }, status, headers);
const sec = (iso: string) => Math.floor(Date.parse(iso) / 1000);

function list(rows: O[], q: URLSearchParams) {
  const limit = Number(q.get('limit') ?? 10);
  if (!(limit >= 1 && limit <= 100)) return serr(400, 'invalid_request_error', 'Invalid integer: limit', { param: 'limit' });
  const after = q.get('starting_after');
  const start = after ? rows.findIndex((r) => r.id === after) + 1 : 0;
  // Small pages, so the walk through has_more is exercised.
  const data = rows.slice(start, start + Math.min(limit, 2));
  return json({ object: 'list', url: '/v1/x', has_more: start + data.length < rows.length, data });
}

export const stripeMock: VendorMock = {
  id: 'stripe',
  hosts: /^api\.stripe\.com$/,
  keyValues: { key: STRIPE_KEY },
  reset() {
    const t = (d: number) => sec('2026-11-01T09:00:00Z') + d * 86400;
    customers = [
      { id: 'cus_Q3', object: 'customer', name: 'Larkspur Clinics', email: 'billing@larkspur.example', currency: 'jpy', created: t(2) },
      { id: 'cus_Q2', object: 'customer', name: null, email: 'ap@orbital.example', currency: 'eur', created: t(1) },
      { id: 'cus_Q1', object: 'customer', name: 'Pinecrest Foods', email: 'finance@pinecrest.example', currency: 'usd', created: t(0), tax_ids: { data: [{ value: 'TR1234567890' }] } },
    ];
    invoices = [
      { id: 'in_4', object: 'invoice', customer: 'cus_Q3', number: 'Q-0004', status: 'open', currency: 'jpy', total: 120000, amount_paid: 0, amount_remaining: 120000, due_date: t(10), created: t(5), status_transitions: { finalized_at: t(5) } },
      { id: 'in_3', object: 'invoice', customer: 'cus_Q2', number: 'Q-0003', status: 'uncollectible', currency: 'eur', total: 9900, amount_paid: 0, amount_remaining: 9900, due_date: t(3), created: t(2), status_transitions: { finalized_at: t(2) } },
      { id: 'in_2', object: 'invoice', customer: 'cus_Q1', number: 'Q-0002', status: 'paid', currency: 'usd', total: 250000, amount_paid: 250000, amount_remaining: 0, due_date: t(4), created: t(1), status_transitions: { finalized_at: t(1), paid_at: t(3) } },
      { id: 'in_1', object: 'invoice', customer: 'cus_Q1', number: 'Q-0001', status: 'open', currency: 'usd', total: 125050, amount_paid: 0, amount_remaining: 125050, due_date: t(2), created: t(0), status_transitions: { finalized_at: t(0) } },
      { id: 'in_0', object: 'invoice', customer: 'cus_Q1', number: null, status: 'draft', currency: 'usd', total: 1000, amount_paid: 0, amount_remaining: 1000, due_date: null, created: t(0), status_transitions: {} },
    ];
    events = [];
    noEvents = false;
  },
  /** An open invoice is paid in Stripe: the event list says so. */
  remoteEdit(ctl, _name) {
    const i = invoices.find((x) => x.id === 'in_1')!;
    Object.assign(i, { status: 'paid', amount_paid: i.total, amount_remaining: 0, status_transitions: { ...i.status_transitions, paid_at: Math.floor(ctl.now().getTime() / 1000) } });
    events.unshift({ id: `evt_${events.length + 1}`, object: 'event', type: 'invoice.paid', created: Math.floor(ctl.now().getTime() / 1000), data: { object: { ...i } } });
    return { id: 'in_1' };
  },
  async handle(req: MockReq, ctl: Ctl) {
    if (req.headers.get('stripe-version') !== '2024-06-20') return serr(400, 'invalid_request_error', 'test mock: pin the API version');
    const auth = req.headers.get('authorization');
    if (ctl.revoked() || auth !== `Bearer ${STRIPE_KEY}`) return serr(401, 'invalid_request_error', 'Invalid API Key provided: rk_test_*********0000');
    if (ctl.take('ratelimit')) return serr(429, 'rate_limit_error', 'Too many requests made to the API too quickly', {}, { 'stripe-rate-limited-reason': 'global-rate' });
    const p = req.url.pathname;
    const q = req.url.searchParams;
    if (p === '/v1/account') return serr(403, 'invalid_request_error', 'The provided key does not have the required permissions for this endpoint. Having the rak_account_read permission would allow this request to continue.');
    if (p === '/v1/customers') return list(customers, q);
    if (p === '/v1/invoices') return list(invoices, q);
    if (p === '/v1/events') {
      if (noEvents) return serr(403, 'invalid_request_error', 'The provided key does not have the required permissions for this endpoint. Having the rak_event_read permission would allow this request to continue.');
      const type = q.get('type') ?? '';
      const since = Number(q.get('created[gte]') ?? 0);
      const hit = events.filter((e) => (!type || (type.endsWith('.*') ? e.type.startsWith(type.slice(0, -1)) : e.type === type)) && e.created >= since);
      return list(hit, q);
    }
    return serr(404, 'invalid_request_error', `Unrecognized request URL (GET: ${p}).`);
  },
};

/** A key made without Read on Events. */
export const stripeWithoutEvents = () => {
  noEvents = true;
};
