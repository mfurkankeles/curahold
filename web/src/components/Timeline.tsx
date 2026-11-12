// A customer's timeline (log a call in two clicks, see everything that
// happened), the health score with its reasons, and the score's settings.
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { MessageKey } from '../../../shared/src/i18n';
import { DEFAULT_HEALTH, HEALTH_SIGNALS, type HealthBand, type HealthConfig, type HealthPart, type HealthResult, type HealthSignal, type HealthSignalKey } from '../../../shared/src/health';
import type { AccountField } from '../../../shared/src/model';
import { ACTIVITY_KINDS, type Activity, type ActivityKind, type Timeline, type TimelineItem } from '../../../shared/src/timeline';
import { ApiFailure, del, get, patch, post, put } from '../lib/api';
import { labelOf } from '../../../shared/src/fields';
import { useI18n } from '../lib/i18n';
import { navigate } from '../lib/router';
import { useStore } from '../lib/store';
import { Icon, type IconName } from './icons';
import { Confirm, Dialog, RowMenu } from './ui';

function useFail() {
  const { t } = useI18n();
  const { toast } = useStore();
  return useCallback((e: unknown) => toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error'), [t, toast]);
}

// ---------------------------------------------------------------- the score

export function bandOf(score: number | null | undefined, bands: { watch: number; good: number } | undefined): HealthBand | null {
  if (score === null || score === undefined || !bands) return null;
  return score >= bands.good ? 'good' : score >= bands.watch ? 'watch' : 'risk';
}

/** The score as a small coloured number (lists, cards). */
export function ScoreChip({ value }: { value: unknown }) {
  const { me } = useStore();
  const { t } = useI18n();
  if (typeof value !== 'number') return null;
  const band = bandOf(value, me.org.health?.bands);
  return (
    <span className="score" data-band={band ?? undefined} title={band ? t(`health.band.${band}` as MessageKey) : undefined}>
      {value}
    </span>
  );
}

/** One line of the score's reasons. */
function partText(t: (k: MessageKey, v?: Record<string, string | number>) => string, p: HealthPart, fieldLabel: (key?: string) => string, optionLabel: (field?: string, value?: unknown) => string): string {
  const d = p.detail;
  const names = (list?: string[]) => (list ?? []).slice(0, 3).join(', ');
  switch (p.key) {
    case 'touch':
      return d.kind ? t('health.why.touch', { days: d.days ?? 0, kind: t(`health.touchKind.${d.kind}` as MessageKey) }) : t('health.why.touchNever', { days: d.days ?? 0 });
    case 'tasks':
      return d.count ? t('health.why.tasks', { n: d.count }) : t('health.why.tasksNone');
    case 'support':
      return p.points === null ? t('health.why.noTickets') : d.count ? t('health.why.support', { n: d.count, urgent: d.urgent ?? 0 }) : t('health.why.supportNone');
    case 'champion':
      return p.points === null ? t('health.why.noContacts') : d.names?.length ? t('health.why.champion', { names: names(d.names) }) : t('health.why.championNone');
    case 'decision':
      return p.points === null ? t('health.why.noContacts') : d.names?.length ? t('health.why.decision', { names: names(d.names) }) : t('health.why.decisionNone');
    case 'blockers':
      return p.points === null
        ? t('health.why.noContacts')
        : d.names?.length
          ? t('health.why.blockers', { names: names(d.names) })
          : d.skeptics?.length
            ? t('health.why.skeptics', { names: names(d.skeptics) })
            : t('health.why.blockersNone');
    case 'judgement':
      return p.points === null ? t('health.why.judgementNone', { field: fieldLabel(d.field) }) : t('health.why.judgement', { field: fieldLabel(d.field), value: optionLabel(d.field, d.value) });
    case 'number':
      return p.points === null ? t('health.why.numberNone', { field: fieldLabel(d.field) }) : t('health.why.number', { field: fieldLabel(d.field), value: String(d.value ?? '') });
  }
}

function Sparkline({ points }: { points: { day: string; score: number }[] }) {
  if (points.length < 2) return null;
  const w = 220;
  const h = 40;
  const step = w / (points.length - 1);
  const y = (s: number) => h - 2 - (s / 100) * (h - 4);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${(i * step).toFixed(1)},${y(p.score).toFixed(1)}`).join(' ');
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** On the customer page: the score, and on demand, why. */
export function HealthBadge({ accountId, field, value }: { accountId: string; field: AccountField; value: unknown }) {
  const { t, locale } = useI18n();
  const { me } = useStore();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ health: HealthResult | null; history: { day: string; score: number }[] } | null>(null);
  useEffect(() => {
    if (open && !data) void get<{ health: HealthResult | null; history: { day: string; score: number }[] }>(`/accounts/${accountId}/health`).then(setData).catch(() => setData({ health: null, history: [] }));
  }, [open, data, accountId]);
  const defs = me.org.accountFields;
  const fieldLabel = (key?: string) => labelOf(defs.find((f) => f.key === key)?.label, locale) || key || '';
  const optionLabel = (key?: string, v?: unknown) => labelOf(defs.find((f) => f.key === key)?.options?.find((o) => o.key === v)?.label, locale) || String(v ?? '');
  const score = typeof value === 'number' ? value : null;
  const band = bandOf(score, me.org.health?.bands);
  const first = data?.history[0];
  const change = first && score !== null ? score - first.score : null;
  return (
    <div className="field">
      <span className="field__label">{labelOf(field.label, locale)}</span>
      <div className="healthline">
        {score === null ? <span className="muted">—</span> : <ScoreChip value={score} />}
        {band && <span className="muted">{t(`health.band.${band}` as MessageKey)}</span>}
        <button type="button" className="btn btn--quiet btn--small" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? t('health.hide') : t('health.why')}
        </button>
      </div>
      {open && (
        <div className="healthwhy">
          {!data && <p className="muted">{t('common.loading')}</p>}
          {data?.health && (
            <>
              <ul>
                {data.health.parts
                  .filter((p) => p.weight > 0)
                  .map((p) => (
                    <li key={p.id} data-state={p.points === null ? 'none' : p.points >= 70 ? 'good' : p.points >= 40 ? 'watch' : 'risk'}>
                      <span>{partText(t, p, fieldLabel, optionLabel)}</span>
                      <span className="healthwhy__pts">{p.points === null ? '—' : `${p.earned}/${p.share}`}</span>
                    </li>
                  ))}
              </ul>
              {data.history.length > 1 && (
                <div className="healthwhy__trend">
                  <Sparkline points={data.history} />
                  {change !== null && <span className="muted">{t('health.trend', { days: data.history.length, change: change > 0 ? `+${change}` : String(change) })}</span>}
                </div>
              )}
              <p className="field__hint">{t('health.explain')}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------- the timeline
//
// Easy to read first: what people said and did with the customer (notes,
// calls, meetings, emails, reviews), support tickets and score moves are
// "what matters" and show as cards; task traffic (opened, finished, comments,
// new contacts) is quiet one-line rows, gathered per day under one line that
// opens. "Everything" shows both; the choice is kept on this device.

const KIND_ICON: Record<string, IconName> = {
  note: 'note',
  call: 'phone',
  meeting: 'people',
  email: 'mail',
  review: 'handshake',
  task_created: 'plus',
  task_done: 'check',
  comment: 'comment',
  contact: 'user',
  score: 'heart',
  ticket_opened: 'lifebuoy',
  ticket_solved: 'check',
};

/** Task traffic: shown quietly, and gathered when there is more than one on a day. */
const QUIET = new Set(['task_created', 'task_done', 'comment', 'contact']);
type Filter = 'important' | 'all';
const FILTER_KEY = 'app_tl_filter';

function dayLabel(iso: string, locale: string, t: (k: MessageKey) => string) {
  const d = new Date(iso);
  const now = new Date();
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const yesterday = new Date(now.getTime() - 86_400_000);
  const date = new Intl.DateTimeFormat(locale === 'tr' ? 'tr-TR' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' }).format(d);
  if (same(d, now)) return `${t('timeline.today')} · ${date}`;
  if (same(d, yesterday)) return `${t('timeline.yesterday')} · ${date}`;
  return date;
}
function timeLabel(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale === 'tr' ? 'tr-TR' : 'en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export function AccountTimeline({ accountId, hasContacts }: { accountId: string; hasContacts: boolean }) {
  const { t, locale } = useI18n();
  const { me, people, canWrite, can } = useStore();
  const fail = useFail();
  const [data, setData] = useState<Timeline | null>(null);
  const [older, setOlder] = useState<TimelineItem[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [kind, setKind] = useState<ActivityKind>('note');
  const [text, setText] = useState('');
  const [when, setWhen] = useState('');
  const [who, setWho] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [removing, setRemoving] = useState<Activity | null>(null);
  const [filter, setFilter] = useState<Filter>(() => {
    try {
      return localStorage.getItem(FILTER_KEY) === 'all' ? 'all' : 'important';
    } catch {
      return 'important';
    }
  });
  const [openDays, setOpenDays] = useState<Set<string>>(new Set());
  const area = useRef<HTMLTextAreaElement>(null);
  const [contacts, setContacts] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (hasContacts) void get<{ records: { id: string; name: string }[] }>(`/records?type=contact&account=${accountId}`).then((r) => setContacts(r.records)).catch(() => undefined);
  }, [accountId, hasContacts]);

  const load = useCallback(async () => {
    const r = await get<Timeline>(`/accounts/${accountId}/timeline`);
    setData(r);
    setOlder([]);
    setNext(r.next);
  }, [accountId]);
  useEffect(() => {
    void load().catch(() => setData({ items: [], pinned: [], next: null }));
    // A meeting or note logged elsewhere (the Meetings section, + New) shows here too.
    const again = () => void load().catch(() => undefined);
    window.addEventListener('app:timeline-changed', again);
    return () => window.removeEventListener('app:timeline-changed', again);
  }, [load]);

  const choose = (f: Filter) => {
    setFilter(f);
    try {
      localStorage.setItem(FILTER_KEY, f);
    } catch {
      /* per-device convenience */
    }
  };

  /** Who did it: a person, or an automation (no person: a rule, a playbook, the renewal round). */
  const nameOf = (id: string | null) => (id ? (people.find((p) => p.id === id)?.name ?? t('timeline.someone')) : t('timeline.automatic'));
  const contactName = (id: string) => contacts.find((c) => c.id === id)?.name;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      await post(`/accounts/${accountId}/activities`, { kind, body: text.trim(), contactIds: who, ...(when ? { happenedAt: new Date(when).toISOString() } : {}) });
      setText('');
      setWhen('');
      setWho([]);
      setComposing(false);
      await load();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };
  const more = async () => {
    if (!next) return;
    const r = await get<Timeline>(`/accounts/${accountId}/timeline?before=${encodeURIComponent(next)}`);
    setOlder((o) => [...o, ...r.items]);
    setNext(r.next);
  };
  const togglePin = async (a: Activity) => {
    try {
      await patch(`/activities/${a.id}`, { pinned: !a.pinned });
      await load();
    } catch (e) {
      fail(e);
    }
  };
  const mayChange = (a: Activity) => canWrite && (a.authorId === me.user.id || can('accounts.manage'));

  const items = useMemo(() => [...(data?.items ?? []), ...older], [data, older]);
  const shown = useMemo(() => (filter === 'all' ? items : items.filter((it) => !QUIET.has(it.type))), [items, filter]);
  const hiddenCount = items.length - shown.length;
  const groups = useMemo(() => {
    const out: { day: string; items: TimelineItem[] }[] = [];
    for (const it of shown) {
      const key = new Date(it.at).toDateString();
      if (out[out.length - 1]?.day !== key) out.push({ day: key, items: [] });
      out[out.length - 1].items.push(it);
    }
    return out;
  }, [shown]);

  const openTask = (boardId: string, taskId: string) => navigate(`/b/${boardId}?task=${taskId}`);

  /** A note, call, meeting, email or review: a card with what was said. */
  const card = (a: Activity, pinnedRow = false) => (
    <li key={`${pinnedRow ? 'p' : 'a'}-${a.id}`} className="tl__item tl__card" data-kind={a.kind}>
      <span className="tl__icon" aria-hidden="true">
        <Icon name={KIND_ICON[a.kind]} size={14} />
      </span>
      <div className="tl__body">
        <div className="tl__head">
          <span className="tl__kind">{t(`timeline.kind.${a.kind}` as MessageKey)}</span>
          {a.title && <strong className="tl__title">{a.title}</strong>}
          {a.pinned && !pinnedRow && <span className="badge">{t('timeline.pinned')}</span>}
          <span className="tl__meta">
            {nameOf(a.authorId)} · {pinnedRow ? dayLabel(a.happenedAt, locale, t) : timeLabel(a.happenedAt, locale)}
            {a.minutes ? ` · ${t('meetings.minutes', { n: a.minutes })}` : ''}
            {a.editedAt ? ` · ${t('timeline.edited')}` : ''}
          </span>
          {mayChange(a) && (
            <span className="tl__tools">
              <RowMenu
                label={t('timeline.actions')}
                items={[
                  { label: a.pinned ? t('timeline.unpin') : t('timeline.pin'), onClick: () => void togglePin(a) },
                  { label: t('common.edit'), onClick: () => setEditing(a) },
                  { label: t('common.delete'), onClick: () => setRemoving(a), danger: true },
                ]}
              />
            </span>
          )}
        </div>
        {a.body && <p className="tl__text">{a.body}</p>}
        {(a.contactIds.length > 0 || a.userIds.length > 0) && (
          <p className="tl__with">{t('timeline.with', { names: [...a.userIds.map((u) => nameOf(u)), ...a.contactIds.map(contactName)].filter(Boolean).join(', ') })}</p>
        )}
      </div>
    </li>
  );

  /** A task, comment or contact: one quiet line. */
  const quiet = (it: TimelineItem) => {
    const link = (boardId: string, taskId: string, title: string) => (
      <a className="tl__link" href={`/b/${boardId}?task=${taskId}`} onClick={(e) => (e.preventDefault(), openTask(boardId, taskId))}>
        {title}
      </a>
    );
    let line: ReactNode = null;
    let key = '';
    if (it.type === 'task_created' || it.type === 'task_done') {
      key = `${it.type}-${it.taskId}`;
      line = (
        <>
          {t(it.type === 'task_done' ? 'timeline.taskDone' : 'timeline.taskCreated', { name: nameOf(it.byId) })} {link(it.boardId, it.taskId, it.title)}
        </>
      );
    } else if (it.type === 'comment') {
      key = `c-${it.id}`;
      line = (
        <>
          {t('timeline.comment', { name: nameOf(it.byId) })} {link(it.boardId, it.taskId, it.title)}
          <span className="tl__quote">{it.body.replace(/@\[([^\]]+)\]\([0-9a-f-]{36}\)/g, '@$1').slice(0, 200)}</span>
        </>
      );
    } else if (it.type === 'contact') {
      key = `r-${it.recordId}`;
      line = t('timeline.contact', { name: nameOf(it.byId), contact: it.name });
    } else return null;
    return (
      <li key={key} className="tl__item tl__item--quiet" data-kind={it.type}>
        <span className="tl__icon" aria-hidden="true">
          <Icon name={KIND_ICON[it.type]} size={12} />
        </span>
        <div className="tl__line">{line}</div>
        <time className="tl__time" dateTime={it.at}>
          {timeLabel(it.at, locale)}
        </time>
      </li>
    );
  };

  /** Tickets and score moves: a short line that still stands out. */
  const signal = (it: TimelineItem, i: number) => {
    if (it.type === 'ticket_opened' || it.type === 'ticket_solved') {
      return (
        <li key={`${it.type}-${it.recordId}`} className="tl__item tl__signal" data-kind={it.type} data-urgent={it.type === 'ticket_opened' && it.priority === 'urgent' ? 'true' : undefined}>
          <span className="tl__icon" aria-hidden="true">
            <Icon name={KIND_ICON[it.type]} size={13} />
          </span>
          <div className="tl__line">
            {t(it.type === 'ticket_opened' ? (it.priority === 'urgent' ? 'timeline.ticketUrgent' : 'timeline.ticketOpened') : 'timeline.ticketSolved')}{' '}
            {it.url ? (
              <a className="tl__link" href={it.url} target="_blank" rel="noreferrer">
                {it.title}
              </a>
            ) : (
              <strong>{it.title}</strong>
            )}
          </div>
          <time className="tl__time" dateTime={it.at}>
            {timeLabel(it.at, locale)}
          </time>
        </li>
      );
    }
    if (it.type === 'score') {
      return (
        <li key={`s-${it.at}-${i}`} className="tl__item tl__signal" data-kind="score" data-dir={it.to < it.from ? 'down' : 'up'}>
          <span className="tl__icon" aria-hidden="true">
            <Icon name={KIND_ICON.score} size={13} />
          </span>
          <div className="tl__line">{t(it.to < it.from ? 'timeline.scoreDown' : 'timeline.scoreUp', { from: it.from, to: it.to })}</div>
        </li>
      );
    }
    return null;
  };

  /** A day: cards and signals as they come, the task traffic gathered under one line when there is more than one. */
  const day = (g: { day: string; items: TimelineItem[] }) => {
    const out: ReactNode[] = [];
    const traffic = g.items.filter((it) => QUIET.has(it.type));
    const gathered = traffic.length > 1;
    let placed = false;
    g.items.forEach((it, i) => {
      if (it.type === 'activity') out.push(card(it.activity));
      else if (!QUIET.has(it.type)) out.push(signal(it, i));
      else if (!gathered) out.push(quiet(it));
      else if (!placed) {
        placed = true;
        const open = openDays.has(g.day);
        const n = (k: string) => traffic.filter((x) => x.type === k).length;
        const parts = [
          n('task_created') && t('timeline.bundle.created', { n: n('task_created') }),
          n('task_done') && t('timeline.bundle.done', { n: n('task_done') }),
          n('comment') && t('timeline.bundle.comments', { n: n('comment') }),
          n('contact') && t('timeline.bundle.contacts', { n: n('contact') }),
        ].filter(Boolean);
        out.push(
          <li key={`b-${g.day}`} className="tl__bundle">
            <button
              type="button"
              className="tl__bundlebtn"
              aria-expanded={open}
              onClick={() =>
                setOpenDays((s) => {
                  const nextSet = new Set(s);
                  if (nextSet.has(g.day)) nextSet.delete(g.day);
                  else nextSet.add(g.day);
                  return nextSet;
                })
              }
            >
              <Icon name="list" size={13} />
              <span>{parts.join(' · ')}</span>
              <Icon name={open ? 'chevronDown' : 'chevronRight'} size={14} />
            </button>
            {open && <ul className="tl__list tl__sub">{traffic.map(quiet)}</ul>}
          </li>,
        );
      }
    });
    return (
      <div key={g.day} className="tl__day">
        <h4 className="tl__date">{dayLabel(g.items[0].at, locale, t)}</h4>
        <ul className="tl__list">{out}</ul>
      </div>
    );
  };

  return (
    <section className="sheet tl">
      <div className="tl__top">
        <h3 className="section__head">{t('timeline.title')}</h3>
        <div className="seg tl__filter" role="group" aria-label={t('timeline.filterLabel')}>
          <button type="button" aria-pressed={filter === 'important'} onClick={() => choose('important')}>
            {t('timeline.filter.important')}
          </button>
          <button type="button" aria-pressed={filter === 'all'} onClick={() => choose('all')}>
            {t('timeline.filter.all')}
          </button>
        </div>
      </div>
      {canWrite &&
        (!composing && !text ? (
          <button
            type="button"
            className="tl__start"
            onClick={() => {
              setComposing(true);
              requestAnimationFrame(() => area.current?.focus());
            }}
          >
            <Icon name="edit" size={15} />
            {t('timeline.start')}
          </button>
        ) : (
          <form className="tl__compose" onSubmit={submit}>
            <div className="seg" role="group" aria-label={t('timeline.kindLabel')}>
              {ACTIVITY_KINDS.map((k) => (
                <button key={k} type="button" aria-pressed={kind === k} onClick={() => (setKind(k), area.current?.focus())}>
                  {t(`timeline.kind.${k}` as MessageKey)}
                </button>
              ))}
            </div>
            <textarea ref={area} className="input" rows={3} value={text} maxLength={20000} placeholder={t(`timeline.placeholder.${kind}` as MessageKey)} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && submit(e as unknown as FormEvent)} />
            {text.trim() && (
              <div className="tl__extra">
                <label className="field">
                  <span className="field__label">{t('timeline.when')}</span>
                  <input className="input" type="datetime-local" value={when} max={localInput(new Date())} onChange={(e) => setWhen(e.target.value)} />
                </label>
                {contacts.length > 0 && (
                  <fieldset className="field tl__who">
                    <legend className="field__label">{t('timeline.withLabel')}</legend>
                    <div className="tl__chips">
                      {contacts.slice(0, 12).map((c) => (
                        <label key={c.id} className="checkbox">
                          <input type="checkbox" checked={who.includes(c.id)} onChange={(e) => setWho(e.target.checked ? [...who, c.id] : who.filter((x) => x !== c.id))} />
                          <span>{c.name}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}
              </div>
            )}
            <div className="toolbar">
              <button className="btn btn--primary btn--small" disabled={busy || !text.trim()}>
                {t('timeline.add')}
              </button>
              <button type="button" className="btn btn--quiet btn--small" onClick={() => (setComposing(false), setText(''))}>
                {t('common.cancel')}
              </button>
              <span className="field__hint">{t('timeline.addHint')}</span>
            </div>
          </form>
        ))}
      {data && data.pinned.length > 0 && (
        <ul className="tl__list tl__pinned" aria-label={t('timeline.pinned')}>
          {data.pinned.map((a) => card(a, true))}
        </ul>
      )}
      {!data && <p className="muted">{t('common.loading')}</p>}
      {data && !items.length && <p className="muted">{t('timeline.empty')}</p>}
      {groups.map(day)}
      {data && filter === 'important' && hiddenCount > 0 && (
        <button type="button" className="linkbtn tl__showall" onClick={() => choose('all')}>
          {t('timeline.showTraffic', { n: hiddenCount })}
        </button>
      )}
      {next && (
        <button type="button" className="btn btn--quiet btn--small tl__older" onClick={more}>
          {t('timeline.older')}
        </button>
      )}
      {editing && <EditActivity activity={editing} onClose={() => setEditing(null)} onSaved={load} />}
      {removing && (
        <Confirm
          title={t('timeline.deleteTitle')}
          body={t('timeline.deleteBody')}
          confirmLabel={t('common.delete')}
          danger
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            try {
              await del(`/activities/${removing.id}`);
              await load();
            } catch (e) {
              fail(e);
            }
            setRemoving(null);
          }}
        />
      )}
    </section>
  );
}

function EditActivity({ activity, onClose, onSaved }: { activity: Activity; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const fail = useFail();
  const [kind, setKind] = useState<ActivityKind>(activity.kind);
  const [text, setText] = useState(activity.body);
  const save = async () => {
    try {
      await patch(`/activities/${activity.id}`, { kind, body: text.trim() });
      onSaved();
      onClose();
    } catch (e) {
      fail(e);
    }
  };
  return (
    <Dialog
      title={t('common.edit')}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--quiet" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn--primary" disabled={!text.trim()} onClick={save}>
            {t('common.save')}
          </button>
        </>
      }
    >
      <div className="form">
        <div className="seg">
          {ACTIVITY_KINDS.map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
              {t(`timeline.kind.${k}` as MessageKey)}
            </button>
          ))}
        </div>
        <textarea className="input" rows={6} value={text} maxLength={20000} onChange={(e) => setText(e.target.value)} />
      </div>
    </Dialog>
  );
}

// ------------------------------------------------------- the score settings

const SIGNAL_ORDER: HealthSignalKey[] = ['touch', 'tasks', 'support', 'champion', 'decision', 'blockers', 'judgement'];

export function HealthSettings() {
  const { t, locale } = useI18n();
  const { me, reloadMe, toast } = useStore();
  const fail = useFail();
  const [cfg, setCfg] = useState<HealthConfig | null>(null);
  const [saved, setSaved] = useState<string>('');
  const [preview, setPreview] = useState<{ counts: Record<string, number>; lowest: { id: string; name: string; score: number | null; band: string | null; current: number | null }[] } | null>(null);
  useEffect(() => {
    void get<{ config: HealthConfig }>('/health/config').then((r) => {
      // Start from the recommended set the first time.
      const c = r.config.signals.length ? r.config : { ...DEFAULT_HEALTH, enabled: r.config.enabled };
      setCfg(c);
      setSaved(JSON.stringify(c));
    });
  }, []);
  // What these settings would give, a moment after each change.
  useEffect(() => {
    if (!cfg) return;
    const h = setTimeout(() => {
      void post<typeof preview>('/health/preview', { config: cfg })
        .then(setPreview)
        .catch(() => undefined);
    }, 350);
    return () => clearTimeout(h);
  }, [cfg]);
  if (!cfg) return <p className="muted">{t('common.loading')}</p>;

  const selects = me.org.accountFields.filter((f) => f.type === 'select');
  const numbers = me.org.accountFields.filter((f) => (f.type === 'number' || f.type === 'money') && !f.health);
  const set = (id: string, change: Partial<HealthSignal>) => setCfg({ ...cfg, signals: cfg.signals.map((s) => (s.id === id ? { ...s, ...change } : s)) });
  const has = (key: HealthSignalKey) => cfg.signals.some((s) => s.key === key);
  const total = cfg.signals.reduce((n, s) => n + s.weight, 0) || 1;
  const fieldName = (f: AccountField) => labelOf(f.label, locale);

  const save = async () => {
    try {
      await put('/health/config', { config: cfg });
      setSaved(JSON.stringify(cfg));
      await reloadMe();
      toast(t('common.saved'));
    } catch (e) {
      fail(e);
    }
  };

  return (
    <div className="form" style={{ maxWidth: 820 }}>
      <section className="sheet">
        <h2 className="sheet__title">{t('health.settings.title')}</h2>
        <p className="sheet__hint">{t('health.settings.hint')}</p>
        <label className="checkbox">
          <input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} />
          <span>{t('health.settings.enabled')}</span>
        </label>
      </section>

      <section className="sheet">
        <h2 className="sheet__title">{t('health.settings.signals')}</h2>
        <p className="sheet__hint">{t('health.settings.signalsHint')}</p>
        <ul className="signals">
          {cfg.signals.map((s) => (
            <li key={s.id} className="signal">
              <div className="signal__top">
                <strong>{t(`health.signal.${s.key}` as MessageKey)}</strong>
                <span className="muted">{t('health.settings.share', { n: Math.round((s.weight / total) * 100) })}</span>
                <button type="button" className="linkbtn" onClick={() => setCfg({ ...cfg, signals: cfg.signals.filter((x) => x.id !== s.id) })}>
                  {t('health.settings.remove')}
                </button>
              </div>
              <p className="field__hint">{t(`health.signalHint.${s.key}` as MessageKey)}</p>
              <label className="signal__weight">
                <span>{t('health.settings.weight')}</span>
                <input type="range" min={0} max={50} step={5} value={s.weight} onChange={(e) => set(s.id, { weight: Number(e.target.value) })} aria-label={t('health.settings.weight')} />
                <span className="num">{s.weight}</span>
              </label>
              {s.key === 'touch' && (
                <div className="signal__params">
                  <label className="field">
                    <span className="field__label">{t('health.settings.touchGood')}</span>
                    <input className="input" type="number" min={1} max={365} value={s.good ?? 14} onChange={(e) => set(s.id, { good: Number(e.target.value) })} />
                  </label>
                  <label className="field">
                    <span className="field__label">{t('health.settings.touchBad')}</span>
                    <input className="input" type="number" min={2} max={730} value={s.bad ?? 45} onChange={(e) => set(s.id, { bad: Number(e.target.value) })} />
                  </label>
                </div>
              )}
              {s.key === 'tasks' && (
                <div className="signal__params">
                  <label className="field">
                    <span className="field__label">{t('health.settings.tasksBad')}</span>
                    <input className="input" type="number" min={1} max={50} value={s.bad ?? 3} onChange={(e) => set(s.id, { bad: Number(e.target.value) })} />
                  </label>
                </div>
              )}
              {s.key === 'support' && (
                <div className="signal__params">
                  <label className="field">
                    <span className="field__label">{t('health.settings.supportBad')}</span>
                    <input className="input" type="number" min={1} max={100} value={s.bad ?? 5} onChange={(e) => set(s.id, { bad: Number(e.target.value) })} />
                  </label>
                </div>
              )}
              {s.key === 'judgement' && (
                <div className="signal__params">
                  <label className="field">
                    <span className="field__label">{t('health.settings.field')}</span>
                    <select className="select" value={s.field ?? ''} onChange={(e) => set(s.id, { field: e.target.value })}>
                      <option value="">—</option>
                      {selects.map((f) => (
                        <option key={f.key} value={f.key}>
                          {fieldName(f)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
              {s.key === 'number' && (
                <div className="signal__params">
                  <label className="field">
                    <span className="field__label">{t('health.settings.field')}</span>
                    <select className="select" value={s.field ?? ''} onChange={(e) => set(s.id, { field: e.target.value })}>
                      <option value="">—</option>
                      {numbers.map((f) => (
                        <option key={f.key} value={f.key}>
                          {fieldName(f)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field__label">{t('health.settings.numberGood')}</span>
                    <input className="input" type="number" value={s.good ?? ''} onChange={(e) => set(s.id, { good: e.target.value === '' ? undefined : Number(e.target.value) })} />
                  </label>
                  <label className="field">
                    <span className="field__label">{t('health.settings.numberBad')}</span>
                    <input className="input" type="number" value={s.bad ?? ''} onChange={(e) => set(s.id, { bad: e.target.value === '' ? undefined : Number(e.target.value) })} />
                  </label>
                </div>
              )}
            </li>
          ))}
        </ul>
        <div className="toolbar" style={{ marginTop: 12 }}>
          <select
            className="select"
            value=""
            aria-label={t('health.settings.add')}
            onChange={(e) => {
              const key = e.target.value as HealthSignalKey;
              if (!key) return;
              const id = key === 'number' ? `number_${Date.now().toString(36)}` : key;
              setCfg({ ...cfg, signals: [...cfg.signals, { id, key, weight: 10, ...(key === 'touch' ? { good: 14, bad: 45 } : key === 'tasks' ? { bad: 3 } : key === 'support' ? { bad: 5 } : {}) }] });
            }}
          >
            <option value="">{t('health.settings.add')}</option>
            {[...SIGNAL_ORDER.filter((k) => !has(k)), 'number' as const]
              .filter((k) => HEALTH_SIGNALS.includes(k))
              .map((k) => (
                <option key={k} value={k}>
                  {t(`health.signal.${k}` as MessageKey)}
                </option>
              ))}
          </select>
        </div>
      </section>

      <section className="sheet">
        <h2 className="sheet__title">{t('health.settings.bands')}</h2>
        <div className="signal__params">
          <label className="field">
            <span className="field__label">{t('health.settings.goodFrom')}</span>
            <input className="input" type="number" min={0} max={100} value={cfg.bands.good} onChange={(e) => setCfg({ ...cfg, bands: { ...cfg.bands, good: Number(e.target.value) } })} />
          </label>
          <label className="field">
            <span className="field__label">{t('health.settings.watchFrom')}</span>
            <input className="input" type="number" min={0} max={100} value={cfg.bands.watch} onChange={(e) => setCfg({ ...cfg, bands: { ...cfg.bands, watch: Number(e.target.value) } })} />
          </label>
        </div>
        {preview && (
          <div className="healthpreview">
            <div className="healthpreview__counts">
              {(['good', 'watch', 'risk'] as const).map((b) => (
                <span key={b} className="score" data-band={b}>
                  {t(`health.band.${b}` as MessageKey)}: {preview.counts[b] ?? 0}
                </span>
              ))}
              {preview.counts.none ? <span className="muted">{t('health.settings.noData', { n: preview.counts.none })}</span> : null}
            </div>
            {preview.lowest.length > 0 && (
              <>
                <p className="field__hint">{t('health.settings.lowest')}</p>
                <ul className="healthpreview__list">
                  {preview.lowest.map((a) => (
                    <li key={a.id}>
                      <span>{a.name}</span>
                      <span className="num">
                        {a.current !== null && a.current !== a.score ? `${a.current} → ` : ''}
                        {a.score ?? '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
        <div className="toolbar" style={{ marginTop: 14 }}>
          <button className="btn btn--primary" disabled={saved === JSON.stringify(cfg)} onClick={save}>
            {t('common.save')}
          </button>
          <span className="field__hint">{t('health.settings.saveHint')}</span>
        </div>
      </section>
    </div>
  );
}

