// Segment as an event source: track / identify events are pushed to Curahold's
// signed inbound address (POST /api/inbound/segment/{source}) and become
// timeline activities under the customer matched by the event's email address
// (and link to a contact record with that address when there is one). Nothing is
// pulled on a schedule and nothing is written back, so this is a read-only
// source with no object mapping — `objects`, `fields` and `list` are empty and
// the generic engine does nothing for it. The real work is in the inbound route
// (api/src/routes/segment.ts), which verifies the signature below and calls the
// org-scoped segment_ingest() function (migration 0042).
//
// Connecting is a key: the administrator sets a shared secret on the Segment
// Webhook (Actions) destination and pastes the same secret here. Segment signs
// each delivery with it; we verify an HMAC-SHA256 hex digest of the raw body in
// the "x-signature" header (constant-time), the way the GitHub code webhook is
// verified. A public source id is generated so the inbound address carries no
// secret, and nothing identifying.
import { hmacHex, randomToken, safeEqual } from '../../lib/crypto';
import { CrmError, type CrmAdapter, type Page } from './types';

/** An event normalised for ingestion: what the activity and the customer match are built from. */
export interface SegmentEvent {
  type: 'track' | 'identify' | 'page' | 'screen' | 'group' | 'alias';
  /** Segment's own id for the delivery: the activity's external id, so a redelivery is attached once. */
  messageId: string;
  /** The person's email, from traits or properties, lower-cased: the customer is found from it. */
  email: string | null;
  /** A short, human summary for the activity body. */
  summary: string;
  happenedAt: string | null;
}

const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const emailOf = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return EMAIL.test(s) ? s : null;
};

/** The signing secret, verified HMAC-SHA256 of the raw body, hex. True when the "x-signature" header matches. */
export async function verifySegment(secret: string, rawBody: string, header: string | null): Promise<boolean> {
  if (!secret || !header) return false;
  const got = header.trim().replace(/^sha256=/i, '');
  return safeEqual(got, await hmacHex(secret, rawBody));
}

/** A Segment payload → the one field set we keep. Unknown shapes are rejected, so a stray post writes nothing. */
export function parseSegmentEvent(payload: any): SegmentEvent | null {
  const type = payload?.type;
  if (!['track', 'identify', 'page', 'screen', 'group', 'alias'].includes(type)) return null;
  const messageId = typeof payload.messageId === 'string' ? payload.messageId.slice(0, 200) : '';
  if (!messageId) return null;
  const traits = { ...(payload.traits ?? {}), ...(payload.context?.traits ?? {}) };
  const email = emailOf(traits.email) ?? emailOf(payload.properties?.email) ?? null;
  const name = typeof payload.event === 'string' ? payload.event : type === 'page' || type === 'screen' ? String(payload.name ?? type) : type;
  const who = typeof traits.name === 'string' ? traits.name : (email ?? '');
  const summary =
    type === 'identify'
      ? `Segment identify${who ? ` · ${who}` : ''}`.slice(0, 2000)
      : `Segment ${type}: ${name}`.slice(0, 2000);
  const ts = payload.timestamp ?? payload.sentAt ?? payload.originalTimestamp;
  const happenedAt = typeof ts === 'string' && !Number.isNaN(Date.parse(ts)) ? new Date(ts).toISOString() : null;
  return { type, messageId, email, summary, happenedAt };
}

const empty = async (): Promise<Page> => ({ rows: [], next: null });
const noList = async () => [];
const refuse = async (): Promise<never> => {
  throw new CrmError('Segment is read only: events are pushed to its inbound address, not pulled');
};

export const segment: CrmAdapter = {
  provider: 'segment',
  tabular: false,
  readOnly: true,
  inbound: true,
  keyed: {
    async connect(_fetcher, values) {
      const signingSecret = (values.signingSecret ?? '').trim();
      if (signingSecret.length < 16) throw new CrmError('Enter a shared secret of at least 16 characters, the same one you set on the Segment destination');
      const sourceId = randomToken(12);
      return { secret: { signingSecret }, config: { sourceId }, label: `Segment · ${sourceId.slice(0, 6)}`, instanceId: sourceId };
    },
  },
  async refresh() {
    throw new CrmError('Set a new shared secret in Segment and reconnect', 401, undefined, true);
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
