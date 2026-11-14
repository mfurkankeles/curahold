// A help request as a conversation: adding a message from either side,
// telling the other side about it, and taking an answer that arrived by email.
//
// Who hears what:
//   the person (or a colleague kept in the loop) writes  → Curahold's desk hears
//   support answers                                      → the person and those kept in the loop hear, by email
//   support leaves itself a note (internal)              → only the desk hears; it is never shown or sent to the company
//
// An answer by email finds its request through the token in the address it was
// sent to (reply+<token>@…), or, failing that, through the message it answers
// (In-Reply-To / References). Mail from someone who is neither on the request
// nor on Curahold's team is not taken.
import type { HelpMessage, HelpStatus } from '../../../shared/src/help';
import { translate, type Locale } from '../../../shared/src/i18n';
import { defer, orgUrl, type Deps } from '../context';
import type { Q, Row } from '../db';
import { randomToken } from './crypto';
import { emailHtml } from './emailHtml';
import { enqueue, kick } from './notify';

export const toHelpMessage = (m: Row): HelpMessage => ({
  id: m.id,
  author: m.author,
  userId: m.user_id ?? null,
  staff: m.staff ?? null,
  body: m.body,
  via: m.via,
  createdAt: new Date(m.created_at).toISOString(),
});

// --------------------------------------------------------------- email text

/** The line every email about a request starts with: what is above it is the answer. */
export const REPLY_LINE = {
  en: '— Write your reply above this line —',
  tr: '— Cevabını bu çizginin üstüne yaz —',
} as const;

const QUOTE_STARTS: RegExp[] = [
  /^—\s.*\s—\s*$/, // our own marker, in any language
  /^-{2,}\s*(original message|özgün i̇leti|orijinal mesaj|özgün ileti)\s*-{2,}\s*$/i,
  /^on .{6,200} wrote:\s*$/i,
  /^.{6,200} tarihinde .{2,200} (yazdı|şunu yazdı|şunları yazdı):\s*$/i,
  /^(from|kimden|gönderen):\s.+$/i,
  /^_{10,}\s*$/,
];

/**
 * What the person actually wrote: the text above the first quoted part
 * (our marker, "On … wrote:", a forwarded header, or a run of "> " lines).
 */
export function cleanReply(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (QUOTE_STARTS.some((re) => re.test(line))) {
      end = i;
      break;
    }
    // A quoted block that runs to the end of the mail.
    if (line.startsWith('>') && lines.slice(i).every((l) => !l.trim() || l.trim().startsWith('>'))) {
      end = i;
      break;
    }
  }
  return lines
    .slice(0, end)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 20000);
}

/** "#note" (or #not, #internal) on the first line: support leaving itself a note by email. */
export function noteCommand(text: string): { internal: boolean; text: string } {
  const m = /^\s*#(note|not|internal|iç)\b[ \t]*\n?/i.exec(text);
  return m ? { internal: true, text: text.slice(m[0].length).trim() } : { internal: false, text };
}

const addressOf = (s: string) => (/<([^>]+)>/.exec(s)?.[1] ?? s).trim().toLowerCase();
const nameOf = (s: string) => (/^\s*"?([^"<]+?)"?\s*</.exec(s)?.[1] ?? '').trim();
const idOf = (s: string | undefined | null) => (s ? (/<[^>]+>/.exec(s)?.[0] ?? s.trim()) : null);

// ----------------------------------------------------------------- the desk

async function tokenOf(q: Q, req: Row): Promise<string> {
  if (req.reply_token) return req.reply_token;
  const token = randomToken(18);
  await q.query('update help_requests set reply_token = $2 where id = $1 and reply_token is null', [req.id, token]);
  const [r] = await q.query<{ reply_token: string }>('select reply_token from help_requests where id = $1', [req.id]);
  return r.reply_token;
}

/** The address an answer by email should go to, or nothing when mail is not taken in. */
export function replyAddress(deps: Deps, token: string | null): string | undefined {
  const domain = deps.config.support?.replyDomain;
  return domain && token ? `reply+${token}@${domain}` : undefined;
}

const mailId = (deps: Deps, messageId: string) => `<help-${messageId}@${deps.config.baseDomain ?? 'curahold.local'}>`;

/** Curahold's desk hears about a message on a request (a reply from the company, or a colleague's note to the team). */
async function tellDesk(deps: Deps, org: Row, req: Row, msg: Row, who: string, token: string | null) {
  const dest = deps.config.support;
  if (!dest?.email) return;
  const label = msg.internal ? 'NOTE (not sent to the customer)' : msg.author === 'support' ? 'Reply sent' : 'Customer replied';
  await deps.email.send({
    to: dest.email,
    subject: `[${req.ref}] ${req.subject}`,
    text: [`${label} · ${org.name} (${org.slug}) · ${who}`, '', msg.body, '', `Answer by replying to this email. Start with #note to leave a note only the team sees.`].join('\n'),
    replyTo: replyAddress(deps, token),
    headers: { 'Message-ID': mailId(deps, msg.id) },
  });
}

/** The person who asked, and everyone kept in the loop, hear that support has answered. */
async function tellPeople(deps: Deps, org: Row, req: Row, msg: Row, people: { email: string; locale: Locale | null }[], token: string | null) {
  const link = `${orgUrl(deps.config, org.slug)}/home#help`;
  for (const p of people) {
    const locale = (p.locale ?? org.locale ?? 'en') as Locale;
    const canReply = !!replyAddress(deps, token);
    const intro = translate(locale, canReply ? 'help.reply.email.intro' : 'help.reply.email.introApp', { ref: req.ref, staff: msg.staff ?? 'Curahold' }, org.terms);
    const text = [...(canReply ? [REPLY_LINE[locale === 'tr' ? 'tr' : 'en'], ''] : []), intro, '', msg.body].join('\n');
    await deps.email.send({
      to: p.email,
      subject: `Re: [${req.ref}] ${req.subject}`,
      text: `${text}\n\n${link}`,
      html: emailHtml({ org: org.name, logo: null, text, link, cta: translate(locale, 'help.email.cta', {}, org.terms) }),
      replyTo: replyAddress(deps, token),
      headers: { 'Message-ID': mailId(deps, msg.id) },
    });
  }
}

export interface NewHelpMessage {
  author: 'user' | 'support';
  userId?: string | null;
  staff?: string | null;
  body: string;
  internal?: boolean;
  via: 'app' | 'email' | 'desk';
  emailId?: string | null;
  /** Support may say where the request stands after its answer; otherwise an answer hands the turn over. */
  status?: HelpStatus;
}

/**
 * Adds a message to a request as the system (the caller has already decided
 * this author may write here), moves the turn, and tells the other side.
 * Returns null when this very email was already taken.
 */
export async function addHelpMessage(deps: Deps, orgId: string, requestId: string, m: NewHelpMessage): Promise<Row | null> {
  const out = await deps.db.system(async (q) => {
    const [req] = await q.query('select h.*, u.name as user_name, u.email as user_email, u.locale as user_locale from help_requests h left join users u on u.id = h.user_id where h.id = $1 and h.org_id = $2', [requestId, orgId]);
    if (!req) return null;
    if (m.emailId) {
      const dup = await q.query('select 1 from help_messages where email_id = $1', [m.emailId]);
      if (dup.length) return null;
    }
    const [msg] = await q.query(
      `insert into help_messages (org_id, request_id, author, user_id, staff, body, internal, via, email_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning *`,
      [orgId, requestId, m.author, m.author === 'user' ? (m.userId ?? null) : null, m.author === 'support' ? (m.staff ?? 'Curahold') : null, m.body, !!m.internal, m.via, m.emailId ?? null],
    );
    // An internal note changes nothing the company can see: not the status, not "last message".
    if (!m.internal) {
      const status: HelpStatus = m.author === 'user' ? 'received' : (m.status ?? 'answered');
      await q.query('update help_requests set status = $2, last_message_at = now(), updated_at = now() where id = $1', [requestId, status]);
    }
    const [org] = await q.query('select id, slug, name, locale, terms from orgs where id = $1', [orgId]);
    const token = await tokenOf(q, req);
    const followers = req.followers?.length ? await q.query<{ id: string; name: string; email: string; locale: Locale | null }>(`select id, name, email, locale from users where id = any ($1) and org_id = $2 and status = 'active'`, [req.followers, orgId]) : [];
    const writer = m.author === 'user' && m.userId ? ((await q.query<{ name: string; email: string }>('select name, email from users where id = $1 and org_id = $2', [m.userId, orgId]))[0] ?? null) : null;
    // A support answer the company can see also reaches the in-app bell/inbox, for
    // the person who asked and everyone kept in the loop — the email below is the
    // other half. A note the team keeps to itself, or a reply from the company,
    // raises neither (the desk hears those by email instead).
    if (m.author === 'support' && !m.internal) {
      const recipients = [...new Set([req.user_id, ...(req.followers ?? [])].filter((id: string | null): id is string => !!id))];
      await enqueue(
        q,
        recipients.map((uid) => ({ orgId, userId: uid, kind: 'help', data: { ref: req.ref, subject: req.subject, requestId: req.id, event: 'reply', status: 'answered', staff: msg.staff ?? 'Curahold' } })),
      );
    }
    return { req, msg, org, token, followers, writer };
  });
  if (!out) return null;
  const { req, msg, org, token, followers, writer } = out;
  defer(
    deps,
    (async () => {
      if (m.author === 'user') await tellDesk(deps, org, req, msg, writer ? `${writer.name} <${writer.email}>` : 'someone on the request', token);
      else if (m.internal) await tellDesk(deps, org, req, msg, msg.staff ?? 'Curahold', token);
      else {
        const people = [...(req.user_email ? [{ email: req.user_email as string, locale: (req.user_locale ?? null) as Locale | null }] : []), ...followers.map((f) => ({ email: f.email, locale: f.locale }))];
        await tellPeople(deps, org, req, msg, people, token);
      }
    })().catch((e) => console.error('[curahold] help message notice failed', e)),
  );
  // A support answer may also need pushing to a linked chat app; the in-app row is
  // already written. Nothing new to deliver for a reply from the company or a note.
  if (m.author === 'support' && !m.internal) kick(deps);
  return msg;
}

// ------------------------------------------------------------ mail coming in

export interface IncomingMail {
  from: string;
  /** Every address it was sent to. */
  to: string[];
  subject?: string;
  text: string;
  messageId?: string | null;
  inReplyTo?: string | null;
  references?: string[];
  /**
   * Whoever received the mail checked that it really comes from the domain it
   * says (DMARC passed). Mail claiming to be from Curahold's own people is
   * taken only with this: a "From" line alone is easy to forge.
   */
  authenticated?: boolean;
}

export type MailOutcome = { taken: true; ref: string; internal: boolean; author: 'user' | 'support' } | { taken: false; reason: 'unknown_request' | 'unknown_sender' | 'empty' | 'repeat' };

/** Takes one incoming email: finds its request, checks who sent it, keeps what they wrote. */
export async function takeMail(deps: Deps, mail: IncomingMail): Promise<MailOutcome> {
  const tokens = mail.to.map((a) => /reply\+([A-Za-z0-9_-]{16,80})@/i.exec(a)?.[1]).filter((x): x is string => !!x);
  const answered = [idOf(mail.inReplyTo), ...(mail.references ?? []).map(idOf)].filter((x): x is string => !!x);
  const sender = addressOf(mail.from);
  const found = await deps.db.system(async (q) => {
    let [req] = tokens.length ? await q.query('select * from help_requests where reply_token = any ($1)', [tokens]) : [];
    if (!req && answered.length) {
      [req] = await q.query('select h.* from help_requests h join help_messages m on m.request_id = h.id where m.email_id = any ($1) limit 1', [answered]);
      // Our own emails carry the message's id in theirs: <help-<message id>@…>.
      if (!req) {
        const ids = answered.map((a) => /^<help-([0-9a-f-]{36})@/i.exec(a)?.[1]).filter((x): x is string => !!x);
        if (ids.length) [req] = await q.query('select h.* from help_requests h join help_messages m on m.request_id = h.id where m.id = any ($1::uuid[]) limit 1', [ids]);
      }
    }
    if (!req) return null;
    const [person] = await q.query<{ id: string }>(
      `select u.id from users u where u.org_id = $1 and lower(u.email) = $2 and u.status = 'active' and (u.id = $3 or u.id = any ($4::uuid[]))`,
      [req.org_id, sender, req.user_id, req.followers ?? []],
    );
    return { req, personId: person?.id ?? null };
  });
  if (!found) return { taken: false, reason: 'unknown_request' };
  const staff = mail.authenticated === true && ((deps.config.support?.staff ?? []).includes(sender) || (!!deps.config.support?.email && addressOf(deps.config.support.email) === sender));
  if (!found.personId && !staff) return { taken: false, reason: 'unknown_sender' };

  const cleaned = cleanReply(mail.text);
  // Only Curahold's own people can leave a note; from anyone else "#note" is just text.
  const note = staff && !found.personId ? noteCommand(cleaned) : { internal: false, text: cleaned };
  if (!note.text) return { taken: false, reason: 'empty' };
  const author = found.personId ? 'user' : 'support';
  const msg = await addHelpMessage(deps, found.req.org_id, found.req.id, {
    author,
    userId: found.personId,
    staff: author === 'support' ? nameOf(mail.from) || sender : null,
    body: note.text,
    internal: note.internal,
    via: 'email',
    emailId: idOf(mail.messageId),
  });
  if (!msg) return { taken: false, reason: 'repeat' };
  return { taken: true, ref: found.req.ref, internal: note.internal, author };
}

/**
 * A raw email (RFC 822), as an email worker or a mail server hands it over,
 * read into what `takeMail` needs. Only the plain-text part is used.
 */
export async function readRawMail(raw: string | ArrayBuffer | Uint8Array, envelope: { from?: string; to?: string } = {}): Promise<IncomingMail> {
  const { default: PostalMime } = await import('postal-mime');
  const m = await PostalMime.parse(raw);
  const header = (name: string) => m.headers.find((h) => h.key === name)?.value ?? '';
  const list = (a: unknown) => (Array.isArray(a) ? a : a ? [a] : []).flatMap((x: any) => (x.group ? x.group : [x])).map((x: any) => String(x.address ?? '')).filter(Boolean);
  const from = m.from?.address ? (m.from.name ? `${m.from.name} <${m.from.address}>` : m.from.address) : (envelope.from ?? '');
  // Readable text when the mail has only an HTML part.
  const text = m.text ?? (m.html ? m.html.replace(/<(br|\/p|\/div)\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : '');
  return {
    from,
    to: [...new Set([...list(m.to), ...list(m.cc), ...(envelope.to ? [envelope.to] : [])])],
    subject: m.subject ?? '',
    text,
    messageId: m.messageId ?? null,
    inReplyTo: m.inReplyTo ?? null,
    references: (m.references ?? '').split(/\s+/).filter(Boolean),
    authenticated: /\bdmarc=pass\b/i.test(header('authentication-results')),
  };
}
