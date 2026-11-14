// Notifications: written to the outbox inside the transaction that caused
// them, delivered after it commits. Each person decides where theirs go
// (a linked chat app, email, or only the in-app list) and which kinds they
// want; a chat failure falls back to email so nothing is lost silently.
import { translate, normalizeLocale, type Locale, type MessageKey, type Terms } from '../../../shared/src/i18n';
import { MAX_FAVORITES, type NotifyPrefs } from '../../../shared/src/model';
import { ADAPTERS, loadConnection, markConnection, upsertIdentity } from '../connectors/messaging';
import { FatalChatError, type ChatMessage } from '../connectors/messaging/types';
import { defer, nowOf, orgUrl, type Deps } from '../context';
import type { Q, Row } from '../db';
import { day } from './mappers';

export interface NewNotification {
  orgId: string;
  userId?: string | null;
  connectionId?: string | null;
  channel?: string | null;
  kind: string;
  taskId?: string | null;
  actorId?: string | null;
  data?: Record<string, unknown>;
  dedupeKey?: string | null;
}

export async function enqueue(q: Q, list: NewNotification[]) {
  for (const n of list) {
    if (n.userId && n.actorId && n.userId === n.actorId) continue; // nobody is told about their own action
    // ON CONFLICT would make Postgres apply the SELECT policy to the new row
    // (someone else's notification), so it is only used for keyed inserts,
    // which run with owner access (scheduler, automations).
    await q.query(
      `insert into notifications (org_id, user_id, connection_id, channel, kind, task_id, actor_id, data, dedupe_key)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ${n.dedupeKey ? 'on conflict (org_id, dedupe_key) where dedupe_key is not null do nothing' : ''}`,
      [n.orgId, n.userId ?? null, n.connectionId ?? null, n.channel ?? null, n.kind, n.taskId ?? null, n.actorId ?? null, JSON.stringify(n.data ?? {}), n.dedupeKey ?? null],
    );
  }
}

/** Deliver whatever is waiting, after the response has gone out. */
export function kick(deps: Deps) {
  defer(deps, deliverPending(deps));
}

export const DEFAULT_PREFS: NotifyPrefs = {
  channel: 'auto',
  events: { assigned: true, mentioned: true, comment: true, following: true, digest: true, weekly: true, nudges: true, automation: true },
  digestHour: 8,
  defaultBoardId: null,
};

export function prefsOf(raw: unknown): NotifyPrefs {
  const p = (raw ?? {}) as Partial<NotifyPrefs>;
  const hour = Number(p.digestHour);
  return {
    channel: typeof p.channel === 'string' && p.channel ? p.channel : 'auto',
    events: { ...DEFAULT_PREFS.events, ...(p.events ?? {}) },
    digestHour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 8,
    defaultBoardId: p.defaultBoardId ?? null,
    quiet: validQuiet(p.quiet),
    ...(p.startHidden ? { startHidden: true } : {}),
    ...(Array.isArray(p.favorites) && p.favorites.length ? { favorites: p.favorites.slice(0, MAX_FAVORITES) } : {}),
  };
}

const validQuiet = (q: unknown): NotifyPrefs['quiet'] => {
  const v = q as { from?: unknown; to?: unknown } | null;
  if (!v || !Number.isInteger(v.from) || !Number.isInteger(v.to)) return null;
  const from = Number(v.from);
  const to = Number(v.to);
  return from >= 0 && from <= 23 && to >= 0 && to <= 23 && from !== to ? { from, to } : null;
};

function hourIn(at: Date, timeZone: string): number {
  try {
    return Number(new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(at));
  } catch {
    return at.getUTCHours();
  }
}

/** Inside quiet hours ("20 → 8" spans midnight)? */
export function isQuiet(quiet: NotifyPrefs['quiet'], hour: number): boolean {
  if (!quiet) return false;
  return quiet.from < quiet.to ? hour >= quiet.from && hour < quiet.to : hour >= quiet.from || hour < quiet.to;
}

/** The first whole hour, in the company's time zone, when quiet hours are over. */
export function quietUntil(quiet: NonNullable<NotifyPrefs['quiet']>, now: Date, timeZone: string): Date {
  const t = new Date(now);
  t.setUTCMinutes(0, 0, 0);
  for (let i = 1; i <= 26; i++) {
    const at = new Date(t.getTime() + i * 3600_000);
    if (!isQuiet(quiet, hourIn(at, timeZone))) return at;
  }
  return new Date(now.getTime() + 12 * 3600_000);
}

// Kinds that may go by email when no chat app is linked. Comments are
// chat/in-app only — email for every comment is noise.
const EMAIL_KINDS = new Set(['assigned', 'mentioned', 'digest', 'weekly', 'stale', 'escalated', 'automation', 'join_request']);
const PREF_OF_KIND: Record<string, keyof NotifyPrefs['events']> = {
  assigned: 'assigned',
  mentioned: 'mentioned',
  comment: 'comment',
  followed: 'following',
  unblocked: 'assigned',
  digest: 'digest',
  weekly: 'weekly',
  stale: 'nudges',
  escalated: 'nudges',
  automation: 'automation',
};

interface RenderCtx {
  locale: Locale;
  terms: Terms;
  orgName: string;
  base: string;
  n: Row;
  task: Row | null;
  actorName: string | null;
}

const fmtDate = (iso: string | null, locale: Locale) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale === 'tr' ? 'tr-TR' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
};

/** "last touch 32 days ago" — the signal that cost a falling score the most. */
function weeklyReason(t: (k: MessageKey, v?: Record<string, string | number>) => string, r: Record<string, any>): string {
  switch (r.key) {
    case 'touch':
      return t('weekly.why.touch', { days: r.days ?? 0 });
    case 'tasks':
      return t('weekly.why.tasks', { n: r.count ?? 0 });
    case 'support':
      return t('weekly.why.support', { n: r.count ?? 0 });
    case 'champion':
      return t('weekly.why.champion');
    case 'decision':
      return t('weekly.why.decision');
    case 'blockers':
      return t('weekly.why.blockers');
    case 'judgement':
      return t('weekly.why.judgement');
    default:
      return t('weekly.why.number');
  }
}

export function render(ctx: RenderCtx): ChatMessage {
  const { locale, terms, n, task } = ctx;
  const t = (k: MessageKey, v: Record<string, string | number> = {}) => translate(locale, k, v, terms);
  const data = (n.data ?? {}) as Record<string, any>;
  // Someone at the customer (the portal) is named in the notification itself.
  const actor = ctx.actorName ?? (data.by ? String(data.by) : data.rule ? `“${data.rule}”` : t('notify.someone'));
  // A thread under a record (an opportunity) opens the record itself.
  const taskUrl = task
    ? `${ctx.base}/b/${task.board_id}?task=${task.id}`
    : data.recordId && data.typeKey
      ? `${ctx.base}/records/${encodeURIComponent(String(data.typeKey))}?record=${encodeURIComponent(String(data.recordId))}`
      : undefined;
  const fields: { label: string; value: string }[] = [];
  if (task) {
    if (task.due_date) fields.push({ label: t('notify.field.due'), value: fmtDate(day(task.due_date), locale) });
    if (task.account_name) fields.push({ label: t('notify.field.account'), value: task.account_name });
    if (task.board_name) fields.push({ label: t('notify.field.board'), value: task.board_name });
  }
  const actions = task && !task.is_done
    ? [
        { kind: 'done' as const, label: t('notify.done'), taskId: task.id },
        { kind: 'snooze' as const, label: t('notify.snooze'), taskId: task.id },
      ]
    : undefined;
  const base = { openLabel: t('notify.open'), url: taskUrl, fields, actions };
  switch (n.kind) {
    case 'assigned':
      return { ...base, title: data.rule ? t('notify.assignedAuto', { rule: data.rule }) : t('notify.assigned', { actor }), body: task?.title };
    case 'mentioned':
      return { ...base, title: t('notify.mentioned', { actor }), body: `${task?.title ?? data.recordName ?? ''}\n“${data.excerpt ?? ''}”` };
    case 'comment':
      return { ...base, title: t('notify.comment', { actor }), body: `${task?.title ?? data.recordName ?? ''}\n“${data.excerpt ?? ''}”` };
    case 'automation':
      return { ...base, title: t('notify.automation', { rule: data.rule ?? '' }), body: [data.message, task?.title ?? data.account].filter(Boolean).join('\n') };
    case 'followed':
      return data.what === 'comment'
        ? { ...base, title: t('notify.followedComment', { actor }), body: `${task?.title ?? ''}\n“${data.excerpt ?? ''}”` }
        : { ...base, title: t('notify.followedStatus', { actor, column: data.column ?? '' }), body: task?.title };
    case 'unblocked':
      return { ...base, title: t('notify.unblocked', { blocker: data.blocker ?? '' }), body: task?.title };
    case 'digest': {
      const lines: string[] = [];
      const list = (items: any[], total: number, key: MessageKey) => {
        if (!total) return;
        lines.push(t(key, { n: total }));
        for (const it of items) lines.push(`• ${it.title}${it.due ? ` (${fmtDate(it.due, locale)})` : ''}`);
        if (total > items.length) lines.push(t('notify.digestMore', { n: total - items.length }));
      };
      list(data.overdue ?? [], data.overdueCount ?? 0, 'notify.digestOverdue');
      list(data.today ?? [], data.todayCount ?? 0, 'notify.digestToday');
      return { title: t('notify.digestTitle'), body: lines.join('\n'), url: `${ctx.base}/my`, openLabel: t('notify.open') };
    }
    case 'weekly': {
      const lines: string[] = [];
      const more = (total: number, shown: number) => total > shown && lines.push(t('notify.digestMore', { n: total - shown }));
      if (data.renewalCount) {
        lines.push(data.renewalTotal ? t('weekly.renewalsTotal', { n: data.renewalCount, total: data.renewalTotal }) : t('weekly.renewals', { n: data.renewalCount }));
        for (const r of data.renewals ?? []) lines.push(`• ${r.name} — ${fmtDate(r.due, locale)}${r.amount ? ` · ${r.amount}` : ''}`);
        more(data.renewalCount, data.renewals?.length ?? 0);
      }
      if (data.dropCount) {
        lines.push(t('weekly.drops', { n: data.dropCount }));
        for (const d of data.drops ?? []) {
          const why = d.reason ? weeklyReason(t, d.reason) : '';
          lines.push(`• ${d.name}: ${d.from} → ${d.to}${why ? ` (${why})` : ''}`);
        }
        more(data.dropCount, data.drops?.length ?? 0);
      }
      if (data.quietCount) {
        lines.push(t('weekly.quiet', { n: data.quietCount }));
        for (const a of data.quiet ?? []) lines.push(`• ${a.name}`);
        more(data.quietCount, data.quiet?.length ?? 0);
      }
      if (data.tickets) lines.push(t('weekly.tickets', { n: data.tickets, urgent: data.urgentTickets ?? 0 }));
      if (data.done || data.overdue) lines.push(t('weekly.work', { done: data.done ?? 0, overdue: data.overdue ?? 0 }));
      return { title: t('weekly.title', { n: data.accounts ?? 0 }), body: lines.join('\n'), url: `${ctx.base}/home`, openLabel: t('notify.open') };
    }
    case 'stale': {
      const lines: string[] = (data.items ?? []).map((it: any) => `• ${it.title} (${t('nudge.days', { n: it.days ?? 0 })})`);
      if ((data.count ?? 0) > lines.length) lines.push(t('notify.digestMore', { n: data.count - lines.length }));
      return { title: t(data.count === 1 ? 'nudge.staleOne' : 'nudge.staleTitle', { n: data.count ?? 0, days: data.days ?? 0 }), body: [...lines, t('nudge.staleHint')].join('\n'), url: `${ctx.base}/my`, openLabel: t('notify.open') };
    }
    case 'escalated': {
      const items = (data.items ?? []) as any[];
      if (data.count === 1 && items[0]) {
        const who = items[0].who || t('nudge.nobody');
        return { ...base, actions: undefined, title: t('nudge.escalatedOne', { who, n: items[0].days ?? 0 }), body: task?.title ?? items[0].title };
      }
      const lines = items.map((it) => `• ${it.title} — ${it.who || t('nudge.nobody')} (${t('nudge.late', { n: it.days ?? 0 })})`);
      if ((data.count ?? 0) > lines.length) lines.push(t('notify.digestMore', { n: data.count - lines.length }));
      return { title: t('nudge.escalatedMany', { n: data.count ?? 0, days: data.days ?? 0 }), body: lines.join('\n'), url: `${ctx.base}/team`, openLabel: t('notify.open') };
    }
    case 'join_request':
      return {
        title: t('notify.joinRequest', { name: data.name ?? '', org: ctx.orgName }),
        body: t('notify.joinRequestBody', { email: data.email ?? '' }),
        url: `${ctx.base}/settings/people?view=requests`,
        openLabel: t('notify.open'),
      };
    case 'board_created':
      return { ...base, actions: undefined, title: t('notify.boardCreated', { board: task?.board_name ?? '' }), body: task?.title };
    case 'board_done':
      return { ...base, actions: undefined, title: t('notify.boardDone', { board: task?.board_name ?? '' }), body: task?.title, note: ctx.actorName ? t('notify.markedDone', { name: ctx.actorName }) : undefined };
    case 'test':
      return { title: t('notify.test'), body: t('notify.testBody', { org: ctx.orgName }), url: ctx.base, openLabel: t('notify.open') };
    case 'help':
      // Curahold support answered a help request: it opens the person's own requests.
      return {
        title: t('notify.help.reply' as MessageKey, { ref: data.ref ?? '', staff: data.staff || 'Curahold' }),
        body: data.subject ?? '',
        url: `${ctx.base}/home#help`,
        openLabel: t('notify.open'),
      };
    default:
      return { ...base, title: n.kind, body: task?.title };
  }
}

const TASK_SQL = `
  select t.id, t.title, t.due_date, t.board_id, t.status, t.assignee_ids, b.name as board_name, a.name as account_name,
         t.done_at is not null as is_done
    from tasks t join boards b on b.id = t.board_id left join accounts a on a.id = t.account_id
   where t.id = $1 and t.org_id = $2`;

/** Everything needed to show a notification, read with owner access and filtered by company. */
export async function loadRenderCtx(q: Q, deps: Deps, n: Row, locale?: Locale): Promise<RenderCtx & { org: Row; user: Row | null }> {
  const [org] = await q.query('select id, slug, name, locale, terms, timezone from orgs where id = $1', [n.org_id]);
  const [user] = n.user_id ? await q.query('select id, email, name, locale, prefs, status from users where id = $1 and org_id = $2', [n.user_id, n.org_id]) : [null];
  const [task] = n.task_id ? await q.query(TASK_SQL, [n.task_id, n.org_id]) : [null];
  const [actor] = n.actor_id ? await q.query('select name from users where id = $1 and org_id = $2', [n.actor_id, n.org_id]) : [null];
  return {
    org,
    user: user ?? null,
    locale: locale ?? normalizeLocale(user?.locale ?? org.locale),
    terms: org.terms ?? {},
    orgName: org.name,
    base: orgUrl(deps.config, org.slug),
    n,
    task: task ?? null,
    actorName: actor?.name ?? null,
  };
}

/**
 * The same for a whole list of one person's notifications (the inbox, the bell):
 * the company and the person are read once, the tasks and the people who acted in one query each.
 */
export async function loadRenderCtxMany(q: Q, deps: Deps, rows: Row[], locale?: Locale): Promise<RenderCtx[]> {
  if (!rows.length) return [];
  const orgId = rows[0].org_id;
  const [org] = await q.query('select id, slug, name, locale, terms, timezone from orgs where id = $1', [orgId]);
  const userIds = [...new Set(rows.map((n) => n.user_id).filter(Boolean))];
  const users = userIds.length ? await q.query('select id, locale from users where id = any($1::uuid[]) and org_id = $2', [userIds, orgId]) : [];
  const taskIds = [...new Set(rows.map((n) => n.task_id).filter(Boolean))];
  const tasks = taskIds.length ? await q.query(TASK_SQL.replace('where t.id = $1 and t.org_id = $2', 'where t.id = any($1::uuid[]) and t.org_id = $2'), [taskIds, orgId]) : [];
  const actorIds = [...new Set(rows.map((n) => n.actor_id).filter(Boolean))];
  const actors = actorIds.length ? await q.query('select id, name from users where id = any($1::uuid[]) and org_id = $2', [actorIds, orgId]) : [];
  const taskOf = new Map(tasks.map((t) => [t.id, t]));
  const actorOf = new Map(actors.map((a) => [a.id, a.name as string]));
  const localeOf = new Map(users.map((u) => [u.id, u.locale]));
  return rows.map((n) => ({
    locale: locale ?? normalizeLocale(localeOf.get(n.user_id) ?? org.locale),
    terms: org.terms ?? {},
    orgName: org.name,
    base: orgUrl(deps.config, org.slug),
    n,
    task: (n.task_id && taskOf.get(n.task_id)) || null,
    actorName: (n.actor_id && actorOf.get(n.actor_id)) || null,
  }));
}

type Outcome = { via: string; state: 'sent' | 'skipped' | 'held'; notBefore?: Date };

async function sendToPerson(deps: Deps, ctx: Awaited<ReturnType<typeof loadRenderCtx>>): Promise<Outcome> {
  const { n, user } = ctx;
  if (!user || !['active', 'invited'].includes(user.status)) return { via: 'inapp', state: 'skipped' };
  const prefs = prefsOf(user.prefs);
  const prefKey = PREF_OF_KIND[n.kind];
  if (prefKey && prefs.events[prefKey] === false) return { via: 'inapp', state: 'skipped' };
  if (prefs.channel === 'none') return { via: 'inapp', state: 'skipped' };
  // Quiet hours: the notice waits (the morning digest is the person's own choice of hour).
  if (prefs.quiet && n.kind !== 'digest' && n.kind !== 'weekly') {
    const now = nowOf(deps);
    const tz = ctx.org?.timezone || 'UTC';
    if (isQuiet(prefs.quiet, hourIn(now, tz))) return { via: 'inapp', state: 'held', notBefore: quietUntil(prefs.quiet, now, tz) };
  }
  const msg = render(ctx);

  if (prefs.channel !== 'email') {
    const ids = await deps.db.system((q) =>
      q.query(
        `select c.id, c.provider, i.external_id, i.data from connections c
           left join chat_identities i on i.connection_id = c.id and i.user_id = $2
          where c.org_id = $1 and c.kind = 'messaging' and c.status = 'active' and c.provider <> 'webhook'
            and ($3::text = 'auto' or c.id::text = $3)
          order by (i.user_id is null), c.created_at`,
        [n.org_id, user.id, prefs.channel],
      ),
    );
    for (const row of ids) {
      const adapter = ADAPTERS[row.provider];
      const conn = await loadConnection(deps, n.org_id, row.id);
      if (!adapter || !conn) continue;
      let externalId: string | null = row.external_id ?? null;
      let data: Record<string, any> = row.data ?? {};
      if (!externalId && adapter.lookupUser) {
        try {
          const found = await adapter.lookupUser(deps, conn, user.email);
          if (found) {
            externalId = found.externalId;
            data = found.data ?? {};
            await upsertIdentity(deps, conn, user.id, externalId, data);
          }
        } catch {
          // Lookup is best effort; email below still works.
        }
      }
      if (!externalId) continue;
      try {
        await adapter.send(deps, conn, { kind: 'user', externalId, data }, msg);
        await deps.db.system((q) => markConnection(q, conn.id, true));
        return { via: row.provider, state: 'sent' };
      } catch (err) {
        if (err instanceof FatalChatError) await deps.db.system((q) => markConnection(q, conn.id, false, err.message));
        // fall through to the next app, then email
      }
    }
  }
  if (!EMAIL_KINDS.has(n.kind)) return { via: 'inapp', state: 'skipped' };
  const lines = [msg.body, ...(msg.fields ?? []).map((f) => `${f.label}: ${f.value}`), msg.url].filter(Boolean);
  lines.push('', translate(ctx.locale, 'notify.emailFooter', { url: `${ctx.base}/profile` }));
  await deps.email.send({ to: user.email, subject: msg.title, text: lines.join('\n') });
  return { via: 'email', state: 'sent' };
}

async function postToChannel(deps: Deps, ctx: Awaited<ReturnType<typeof loadRenderCtx>>): Promise<Outcome> {
  const conn = await loadConnection(deps, ctx.n.org_id, ctx.n.connection_id);
  if (!conn) return { via: 'none', state: 'skipped' };
  const adapter = ADAPTERS[conn.provider];
  if (!adapter) return { via: 'none', state: 'skipped' };
  try {
    await adapter.send(deps, conn, { kind: 'channel', channel: ctx.n.channel ?? null }, render(ctx));
    await deps.db.system((q) => markConnection(q, conn.id, true));
    return { via: conn.provider, state: 'sent' };
  } catch (err) {
    if (err instanceof FatalChatError) {
      await deps.db.system((q) => markConnection(q, conn.id, false, err.message));
      return { via: conn.provider, state: 'skipped' };
    }
    throw err;
  }
}

const MAX_ATTEMPTS = 5;

export async function deliverPending(deps: Deps, limit = 50): Promise<number> {
  const claimed = await deps.db.system((q) =>
    q.query(
      `update notifications set attempts = attempts + 1
        where id in (select id from notifications where state = 'pending' and attempts < $2
                        and (not_before is null or not_before <= now())
                      order by created_at limit $1 for update skip locked)
        returning *`,
      [limit, MAX_ATTEMPTS],
    ),
  );
  for (const n of claimed) {
    try {
      const ctx = await deps.db.system((q) => loadRenderCtx(q, deps, n));
      const out = n.connection_id && !n.user_id ? await postToChannel(deps, ctx) : await sendToPerson(deps, ctx);
      if (out.state === 'held') {
        await deps.db.system((q) => q.query('update notifications set attempts = attempts - 1, not_before = $2 where id = $1', [n.id, out.notBefore]));
        continue;
      }
      await deps.db.system((q) =>
        q.query(`update notifications set state = $2, via = $3, sent_at = now(), error = null where id = $1`, [n.id, out.state, out.via]),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await deps.db.system((q) =>
        q.query(`update notifications set state = case when attempts >= $3 then 'failed' else 'pending' end, error = $2 where id = $1`, [
          n.id,
          msg.slice(0, 300),
          MAX_ATTEMPTS,
        ]),
      );
    }
  }
  return claimed.length;
}
