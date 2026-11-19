// What an erasure (KVKK m.7, GDPR Art. 17) removes beyond the person's own
// row, for a company user and for a person at a customer who uses the portal.
// Called inside the owner-level transaction of the erase routes
// (routes/admin.ts), every statement filtered by the company.
//
// Kept, because a law asks for it or the record is the company's: invoices
// (the company's, not the person's), contract acceptance evidence
// (agreement_evidence: who accepted the terms for the company — the contract
// record, append-only and hash-chained), consent records (anonymised: the
// address becomes its SHA-256, so the proof stays without naming anyone), the
// activity log until its retention period ends (append-only; it names the
// person only by an id that now points at "—"), and the work itself: tasks,
// comments and time entries stay with no name on them.
import type { Q } from '../db';

/** A pattern matching the text exactly, case aside (no regular-expression characters let through). */
const literal = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The parts of a company user's erasure that the original route did not
 * cover: what they asked CuraAI, their notifications, chat links, sign-in
 * factors and keys, recordings, follows and mutes, department and customer
 * team places, and mentions of them in the AI team's memory and threads
 * (Curahold's own, outside any company). A name is only redacted when it is a
 * full name (two words, five letters or more), so "Ada" alone never rewrites
 * other people's text.
 */
export async function eraseUserExtras(sq: Q, orgId: string, userId: string, who: { email: string; name: string }) {
  const p = [orgId, userId];
  for (const t of ['assistant_log', 'chat_identities', 'task_watchers', 'task_mutes', 'undo_log', 'saved_views', 'replay_sessions', 'identity_steps', 'user_passkeys', 'user_recovery_codes', 'user_totp', 'department_members', 'account_team', 'support_grants', 'oauth_codes']) {
    await sq.query(`delete from ${t} where org_id = $1 and user_id = $2`, p);
  }
  await sq.query('delete from notifications where org_id = $1 and user_id = $2', p);
  await sq.query('update notifications set actor_id = null where org_id = $1 and actor_id = $2', p);
  await sq.query(`update api_tokens set revoked_at = coalesce(revoked_at, now()) where org_id = $1 and user_id = $2`, p);
  await sq.query(`update help_requests set user_id = null where org_id = $1 and user_id = $2`, p);
  await redactMentions(sq, orgId, who);
}

/** Mentions of the person in the AI team's memory and threads, and in this company's cached answers. */
async function redactMentions(sq: Q, orgId: string, who: { email: string; name: string }) {
  const email = who.email.trim().toLowerCase();
  const name = who.name.trim();
  const fullName = /\S+\s+\S+/.test(name) && name.length >= 5 ? name : null;
  if (!email && !fullName) return;
  // One pattern for both, matched case-insensitively; parameters only, never text spliced into SQL.
  const pattern = [email && literal(email), fullName && `\\m${literal(fullName)}\\M`].filter(Boolean).join('|');
  const hit = (col: string) => `${col} ~* $1`;
  const redact = (col: string) => `regexp_replace(${col}, $1, '[erased]', 'gi')`;
  await sq.query(`delete from assistant_cache where org_id = $2 and ${hit('reply::text')}`, [pattern, orgId]);
  await sq.query(`update agent_memory set value = ${redact('value')} where ${hit('value')}`, [pattern]);
  await sq.query(`update agent_messages set body = ${redact('body')} where ${hit('body')}`, [pattern]);
  await sq.query(`update agent_threads set summary = ${redact('summary')}, title = ${redact('title')} where ${hit("coalesce(summary, '')")} or ${hit('title')}`, [pattern]);
}

/**
 * A person at a customer erased from the portal: the row goes (passwords,
 * passkeys, sign-in links, sessions and one-time codes cascade with it), what
 * they wrote stays with no author (the foreign keys set it to null), and
 * mentions of them are redacted like a user's.
 */
export async function erasePortalUser(sq: Q, orgId: string, portalUserId: string): Promise<boolean> {
  const [row] = await sq.query<{ email: string; name: string }>('delete from portal_users where org_id = $1 and id = $2 returning email, name', [orgId, portalUserId]);
  if (!row) return false;
  await sq.query(`delete from portal_challenges where org_id = $1 and portal_user_id = $2`, [orgId, portalUserId]);
  await redactMentions(sq, orgId, row);
  return true;
}
