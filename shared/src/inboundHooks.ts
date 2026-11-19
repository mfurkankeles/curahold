// Incoming webhooks: a tool that can call a web address posts to the company's own address for one hook, and each
// delivery becomes (or updates) a task, a support ticket, a customer timeline entry or a note on a deal. Shared so
// the mapping screen previews exactly what the receiver will do.

export const HOOK_TARGETS = ['task', 'ticket', 'activity', 'deal_note'] as const;
export type HookTarget = (typeof HOOK_TARGETS)[number];

export const HOOK_SCHEMES = ['curahold', 'hmac', 'token'] as const;
export type HookScheme = (typeof HOOK_SCHEMES)[number];

/** How a sender proves a delivery is theirs, and how a replay is recognised. */
export interface HookAuth {
  scheme: HookScheme;
  /** hmac / token: the header carrying the signature or the token (lower case). Token: absent = ?token= or a body field. */
  header?: string;
  algo?: 'sha256' | 'sha1';
  encoding?: 'hex' | 'base64';
  /** Text before the signature in the header ("sha256="). */
  prefix?: string;
  /** token: the payload field holding it (Aircall sends `token` in the body). */
  field?: string;
  /** A template naming the delivery's unique id ({{id}}); each one is processed once. */
  eventId?: string;
  /** A template giving when the sender made the delivery; older than maxAgeSec is refused. */
  timestamp?: string;
  maxAgeSec?: number;
  /** The sender generates the secret itself (it is typed in and sealed) instead of using the one Curahold gives. */
  senderSecret?: boolean;
}

/** What one delivery becomes. Every value is a template: plain text with {{path.to.value}} taken from the payload. */
export interface HookMapping {
  /** Only deliveries where this template renders to `equals` (or one of its comma-separated words) are used; others are logged as skipped. */
  when?: { value: string; equals: string } | null;
  /** The sender's own id for the item: the same id again updates what it made. */
  externalId?: string;
  customer?: { email?: string; domain?: string; name?: string; id?: string };
  // task
  boardId?: string;
  title?: string;
  description?: string;
  due?: string;
  /** Words that mean the task is finished (comma-separated), matched against `status`. */
  status?: string;
  doneWords?: string;
  assigneeEmail?: string;
  // ticket
  subject?: string;
  priority?: string;
  requester?: string;
  url?: string;
  // activity
  kind?: 'note' | 'call' | 'meeting' | 'email';
  body?: string;
  happenedAt?: string;
  /** How long (a call, a meeting): in minutes, or in seconds when `durationUnit` says so. */
  minutes?: string;
  durationUnit?: 'minutes' | 'seconds';
  // deal note
  dealId?: string;
  dealName?: string;
}

export interface InboundHook {
  id: string;
  name: string;
  source: string;
  target: HookTarget;
  auth: HookAuth;
  mapping: HookMapping;
  enabled: boolean;
  /** The address to give the sender. */
  url: string;
  /** The secret Curahold gives (absent when the sender generates its own). Administrators only. */
  secret: string | null;
  /** The sender's own secret is set (never shown back). */
  senderSecretSet: boolean;
  createdAt: string;
  lastDeliveryAt: string | null;
  counts: { ok: number; failed: number; skipped: number };
}

export interface HookDelivery {
  id: string;
  receivedAt: string;
  eventId: string | null;
  status: 'ok' | 'skipped' | 'failed' | 'rejected';
  test: boolean;
  error: string | null;
  result: { kind: HookTarget; id: string; action: 'created' | 'updated' } | null;
  payload: string | null;
}

/** A value out of the payload by a dot path: data.envelope.status, items[0].name, headers are not reachable. */
export function pick(payload: unknown, path: string): unknown {
  let cur: any = payload;
  for (const part of path.split('.').flatMap((p) => p.split(/\[(\d+)\]/).filter(Boolean))) {
    if (cur === null || cur === undefined) return undefined;
    cur = /^\d+$/.test(part) && Array.isArray(cur) ? cur[Number(part)] : cur[part];
  }
  return cur;
}

/** "Envelope {{data.envelopeId}} is {{data.status}}" with the payload's values; a missing value becomes empty. */
export function render(template: string | undefined | null, payload: unknown): string {
  if (!template) return '';
  return template
    .replace(/\{\{\s*([A-Za-z0-9_$][\w$.[\]-]*)\s*\}\}/g, (_m, path: string) => {
      const v = pick(payload, path);
      if (v === null || v === undefined) return '';
      return typeof v === 'object' ? JSON.stringify(v) : String(v);
    })
    .trim();
}

/** Every path in a sample payload (for the mapping screen's picker), at most 200, arrays by their first item. */
export function pathsOf(payload: unknown, prefix = '', out: string[] = []): string[] {
  if (out.length >= 200 || payload === null || typeof payload !== 'object') return out;
  if (Array.isArray(payload)) {
    if (payload.length) pathsOf(payload[0], `${prefix}[0]`, out);
    return out;
  }
  for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
    if (!/^[A-Za-z0-9_$][\w$-]*$/.test(k)) continue;
    const p = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object') pathsOf(v, p, out);
    else out.push(p);
    if (out.length >= 200) break;
  }
  return out;
}

/** Ready-made starts for the tools people connect this way; every field stays editable. */
export interface HookRecipe {
  /** Its name on screen is the dictionary's hooks.recipe.<key>. */
  key: string;
  target: HookTarget;
  auth: HookAuth;
  mapping: HookMapping;
  /** A delivery as the tool documents it, for the test screen. */
  sample: unknown;
}

export const HOOK_RECIPES: HookRecipe[] = [
  {
    key: 'curahold',
    target: 'activity',
    auth: { scheme: 'curahold', maxAgeSec: 300 },
    mapping: { externalId: '{{id}}', customer: { email: '{{email}}', domain: '{{domain}}' }, kind: 'note', body: '{{text}}', happenedAt: '{{at}}' },
    sample: { id: 'evt_1001', email: 'selin@pinecrest.example', text: 'Signed the renewal form', at: '2026-11-20T09:30:00Z' },
  },
  {
    // DocuSign Connect (JSON, HMAC on): X-DocuSign-Signature-1 = base64(HMAC-SHA256(key, body)), the key made in DocuSign.
    key: 'esign',
    target: 'deal_note',
    auth: { scheme: 'hmac', header: 'x-docusign-signature-1', algo: 'sha256', encoding: 'base64', senderSecret: true, eventId: '{{data.envelopeId}}:{{event}}', timestamp: '{{generatedDateTime}}', maxAgeSec: 86400 },
    mapping: {
      when: { value: '{{event}}', equals: 'envelope-sent,envelope-completed,envelope-declined,envelope-voided' },
      externalId: '{{data.envelopeId}}',
      customer: { email: '{{data.envelopeSummary.recipients.signers[0].email}}' },
      dealName: '{{data.envelopeSummary.emailSubject}}',
      body: '{{data.envelopeSummary.emailSubject}} · {{data.envelopeSummary.status}}',
    },
    sample: {
      event: 'envelope-completed',
      apiVersion: 'v2.1',
      generatedDateTime: '2026-11-20T09:30:00.000Z',
      data: { accountId: 'a1b2c3', envelopeId: '9f8e7d6c-0000-4000-8000-000000000001', envelopeSummary: { status: 'completed', emailSubject: 'Pinecrest renewal', recipients: { signers: [{ email: 'selin@pinecrest.example', name: 'Selin Akar', status: 'completed' }] } } },
    },
  },
  {
    // Aircall webhooks: the webhook's token travels in the body; ids are numbers; timestamp in seconds.
    key: 'aircall',
    target: 'activity',
    auth: { scheme: 'token', field: 'token', senderSecret: true, eventId: '{{data.id}}:{{event}}' },
    mapping: {
      when: { value: '{{event}}', equals: 'call.ended' },
      externalId: '{{data.id}}',
      customer: { email: '{{data.contact.emails[0].value}}' },
      kind: 'call',
      body: '{{data.direction}} · {{data.duration}} s · {{data.raw_digits}}',
      minutes: '{{data.duration}}',
      durationUnit: 'seconds',
    },
    sample: { resource: 'call', event: 'call.ended', timestamp: 1763631000, token: 'aircall-webhook-token', data: { id: 812345, direction: 'outbound', duration: 420, raw_digits: '+90 212 555 01 23', contact: { emails: [{ value: 'selin@pinecrest.example' }] }, user: { email: 'ada@demo.example' } } },
  },
  {
    // Tawk.to: X-Tawk-Signature = hex(HMAC-SHA1(webhook secret, body)).
    key: 'tawkto',
    target: 'ticket',
    auth: { scheme: 'hmac', header: 'x-tawk-signature', algo: 'sha1', encoding: 'hex', senderSecret: true, eventId: '{{chatId}}:{{event}}', timestamp: '{{time}}', maxAgeSec: 86400 },
    mapping: { when: { value: '{{event}}', equals: 'chat:end,ticket:create' }, externalId: '{{chatId}}', customer: { email: '{{visitor.email}}' }, subject: '{{visitor.name}} · {{property.name}}', requester: '{{visitor.email}}', status: 'solved' },
    sample: { event: 'chat:end', chatId: 'c-71a2b3', time: '2026-11-20T09:30:00.000Z', visitor: { name: 'Selin Akar', email: 'selin@pinecrest.example', city: 'Izmir' }, property: { id: 'p-1', name: 'Website' } },
  },
  {
    // Razorpay: X-Razorpay-Signature = hex(HMAC-SHA256(webhook secret, body)); x-razorpay-event-id per event.
    key: 'razorpay',
    target: 'activity',
    auth: { scheme: 'hmac', header: 'x-razorpay-signature', algo: 'sha256', encoding: 'hex', senderSecret: true, eventId: '{{payload.payment.entity.id}}:{{event}}' },
    mapping: { when: { value: '{{event}}', equals: 'payment.captured,payment.failed' }, externalId: '{{payload.payment.entity.id}}', customer: { email: '{{payload.payment.entity.email}}' }, kind: 'note', body: '{{event}} · {{payload.payment.entity.currency}} {{payload.payment.entity.amount}}' },
    sample: { entity: 'event', event: 'payment.captured', created_at: 1763631000, payload: { payment: { entity: { id: 'pay_29QQoUBi66xm2f', amount: 500000, currency: 'INR', email: 'selin@pinecrest.example', status: 'captured' } } } },
  },
  {
    key: 'custom',
    target: 'task',
    auth: { scheme: 'token', header: 'x-curahold-token' },
    mapping: { externalId: '{{id}}', title: '{{title}}', description: '{{text}}', customer: { email: '{{email}}' } },
    sample: { id: 'job-77', title: 'Call back about the invoice', text: 'Asked on the phone at 10:20', email: 'selin@pinecrest.example' },
  },
];
