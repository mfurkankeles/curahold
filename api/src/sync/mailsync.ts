// The mailbox branch of a sync run. A mailbox adapter (Gmail, Outlook) does not
// map objects: instead, recent messages are read and attached to the matching
// customer as timeline activities (kind 'email'), found by any email address on
// the message — a contact record with that address first, then a customer whose
// web-address field is that domain. Runs with owner access like the rest of the
// engine, filtering by company on every statement; the activity's (source,
// external id) keep a message from being attached twice, so a run that stops on
// its time budget resumes without making duplicates.
import type { AccountField } from '../../../shared/src/model';
import { emptyStats, type SyncStats } from '../../../shared/src/sync';
import type { Deps } from '../context';
import type { Q } from '../db';
import type { LoadedCrm } from './engine';
import type { CrmAdapter, CrmCtx, MailItem } from './adapters/types';

const PUBLIC_MAIL = /^(gmail|googlemail|outlook|hotmail|live|yahoo|icloud|me|aol|proton|protonmail|yandex|mail|gmx)\./;
const domainOf = (email: string) => (email.includes('@') ? email.split('@').pop()!.trim().toLowerCase() : '');

interface MailState {
  cursor: string;
  since: string | null;
  startedAt: string;
  maxSeen: string | null;
}

/** The customer a message belongs to: a contact record with one of the addresses, else a customer whose web address is that domain. */
async function accountForEmails(q: Q, orgId: string, emails: string[], urlKeys: string[]): Promise<string | null> {
  if (!emails.length) return null;
  const [contact] = await q.query(
    `select r.account_id from records r join record_types rt on rt.id = r.type_id
      where r.org_id = $1 and rt.kind = 'contact' and r.archived_at is null and r.account_id is not null
        and lower(r.fields->>'email') = any($2::text[]) order by r.created_at limit 1`,
    [orgId, emails],
  );
  if (contact?.account_id) return contact.account_id;
  const domains = [...new Set(emails.map(domainOf).filter((d) => d && !PUBLIC_MAIL.test(d)))];
  if (!domains.length || !urlKeys.length) return null;
  const [hit] = await q.query(
    `select a.id from accounts a where a.org_id = $1 and a.archived_at is null
        and exists (select 1 from jsonb_each_text(a.fields) f where f.key = any ($2::text[])
                     and lower(regexp_replace(regexp_replace(f.value, '^https?://(www\\.)?', '', 'i'), '[/:?#].*$', '')) = any ($3::text[]))
      order by a.created_at limit 1`,
    [orgId, urlKeys, domains],
  );
  return hit?.id ?? null;
}

const bodyOf = (m: MailItem): string => {
  const who = m.direction === 'out' ? `Sent to ${m.participants.filter((p) => p !== (m.from ?? '')).join(', ') || '—'}` : `From ${m.from ?? '—'}`;
  return `${who}\n${m.subject}${m.snippet ? `\n\n${m.snippet}` : ''}`.slice(0, 20_000);
};

/** Attaches one page of messages to their customers, idempotently. Returns how many new activities were written. */
async function applyMail(deps: Deps, conn: LoadedCrm, items: MailItem[], urlKeys: string[], st: SyncStats): Promise<void> {
  if (!items.length) return;
  await deps.db.system(async (q) => {
    for (const m of items) {
      if (!m.externalId) continue;
      const account = await accountForEmails(q, conn.orgId, m.participants, urlKeys);
      if (!account) continue;
      const rows = await q.query(
        `insert into activities (org_id, account_id, author_id, kind, body, happened_at, source, external_id)
         values ($1, $2, null, 'email', $3, coalesce($4::timestamptz, now()), $5, $6)
         on conflict (org_id, source, external_id) where external_id is not null do nothing
         returning id`,
        [conn.orgId, account, bodyOf(m), m.happenedAt, conn.provider, m.externalId.slice(0, 200)],
      );
      if (rows.length) st.created++;
    }
  });
}

/**
 * Reads recent mail and attaches it to customers. `stats` is the run's; `deadline` is when to stop and save the place.
 * Returns true when it read to the end, false when it stopped on the budget (the next run carries on).
 */
export async function syncMailbox(deps: Deps, conn: LoadedCrm, adapter: CrmAdapter, ctx: CrmCtx, full: boolean, stats: Record<string, SyncStats>, deadline: number): Promise<boolean> {
  if (!adapter.messages) return true;
  const st = (stats.messages ??= emptyStats());
  const [org] = await deps.db.system((q) => q.query('select account_fields from orgs where id = $1', [conn.orgId]));
  const urlKeys = ((org?.account_fields ?? []) as AccountField[]).filter((f) => f.type === 'url').map((f) => f.key);

  const saved = conn.state.mailPage as MailState | undefined;
  const since = saved ? saved.since : full ? null : ((conn.state.mailAt as string | null) ?? null);
  const startedAt = saved?.startedAt ?? ctx.now().toISOString();
  let maxSeen = saved?.maxSeen ?? since;
  let cursor: string | null = saved?.cursor ?? null;

  while (true) {
    const { items, next } = await adapter.messages(ctx, { since, cursor });
    await applyMail(deps, conn, items, urlKeys, st);
    for (const m of items) if (m.happenedAt && (!maxSeen || m.happenedAt > maxSeen)) maxSeen = m.happenedAt;
    cursor = next;
    if (!cursor) break;
    if (Date.now() > deadline) {
      conn.state = { ...conn.state, mailPage: { cursor, since, startedAt, maxSeen } };
      return false;
    }
  }
  // Next run starts from the newest message seen, but never past when this read began (a message that arrived mid-read
  // is read again next time rather than skipped) — the same cap the object pull uses.
  const begun = Date.parse(startedAt);
  const nextAt = maxSeen && Date.parse(maxSeen) < begun ? maxSeen : startedAt;
  const { mailPage, ...rest } = conn.state;
  void mailPage;
  conn.state = { ...rest, mailAt: nextAt };
  return true;
}
