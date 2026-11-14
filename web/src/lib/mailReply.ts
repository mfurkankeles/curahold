// Pure helpers for the mailbox reply composer (no React), so the call shape can
// be unit-tested on its own. The composer lives in components/MailReply.tsx.
import type { Activity } from '../../../shared/src/timeline';

/** Mailbox providers that attach mail and can send a reply. Mirrors the mailbox adapters' providers. */
export const MAILBOX_PROVIDERS = ['gmail', 'outlook'] as const;
export const isMailboxProvider = (p: string): boolean => (MAILBOX_PROVIDERS as readonly string[]).includes(p);

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
export const looksLikeEmail = (v: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

/**
 * The reply target read off a synced mail activity's body. Mailbox activities are
 * stored as "From <addr>\n<subject>\n\n<snippet>" (received) or "Sent to <addrs>\n<subject>…"
 * (sent) — see api/src/sync/mailsync.ts — so the first address and the second line
 * seed the reply. Both stay editable in the composer.
 */
export function parseMailHeader(body: string): { to: string; subject: string } {
  const lines = (body ?? '').split('\n');
  const to = lines[0]?.match(EMAIL)?.[0] ?? '';
  const subject = (lines[1] ?? '').trim();
  return { to, subject };
}

/** A reply subject: the original with a single "Re:" prefix. */
export function replySubject(subject: string): string {
  const s = (subject ?? '').trim();
  if (!s) return '';
  return /^re:/i.test(s) ? s : `Re: ${s}`;
}

/** The exact request body POST /connections/:id/mail/reply expects. inReplyTo threads onto the original when it has an external id. */
export function replyPayload(
  activity: Pick<Activity, 'externalId'>,
  accountId: string,
  draft: { to: string; subject: string; body: string },
): { accountId: string; to: string; subject: string; body: string; inReplyTo?: string } {
  return {
    accountId,
    to: draft.to.trim(),
    subject: draft.subject.trim(),
    body: draft.body.trim(),
    ...(activity.externalId ? { inReplyTo: activity.externalId } : {}),
  };
}
