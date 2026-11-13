// The calendar: what falls on which day. Tasks by their due date, meetings,
// calls and reviews that were held, renewals, and business reviews falling
// due — by day, week, month or year.
//
// Whose days: one's own, or everyone's one can see. Someone allowed to see
// teammates' calendars also picks one person or a whole team; that narrows
// what they may already see and shows nothing new (api/src/routes/calendar.ts).
//
// The view, the day and whose calendar it is live in the address
// (?view=week&date=2026-11-12&who=t:<team>), so a link opens the same thing.
import { useEffect, useMemo, useState } from 'react';
import type { CalendarItem, CalendarKind, CalendarReach } from '../../../shared/src/model';
import { CALENDAR_KINDS } from '../../../shared/src/model';
import { EmptyState, LoadError, SkeletonRows } from '../components/Empty';
import { Icon, PageIcon, type IconName } from '../components/icons';
import { Avatars, onTabKeys } from '../components/ui';
import { get } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { navigate, setQuery, useLocation } from '../lib/router';
import { useShell } from '../lib/shell';
import { useStore } from '../lib/store';
import { dueState, todayIso } from '../lib/time';

const VIEWS = ['day', 'week', 'month', 'year'] as const;
type View = (typeof VIEWS)[number];

const DAY = 86_400_000;
const at = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const plus = (day: string, n: number) => iso(new Date(at(day).getTime() + n * DAY));
/** Weeks start on Monday — the norm in Türkiye and most of Europe. */
const mondayOf = (day: string) => plus(day, -((at(day).getUTCDay() + 6) % 7));
const monthStart = (day: string) => `${day.slice(0, 7)}-01`;
const addMonths = (day: string, n: number) => {
  const d = at(monthStart(day));
  d.setUTCMonth(d.getUTCMonth() + n);
  return iso(d);
};
const lastOfMonth = (day: string) => plus(addMonths(day, 1), -1);
/** The same day of the month n months on, or that month's last day when it is shorter. */
const shiftMonths = (day: string, n: number) => {
  const first = addMonths(day, n);
  const want = `${first.slice(0, 8)}${day.slice(8)}`;
  return want > lastOfMonth(first) ? lastOfMonth(first) : want;
};

const KIND_ICON: Record<CalendarKind, IconName> = { task: 'checkCircle', meeting: 'people', call: 'phone', review: 'handshake', renewal: 'refresh', reviewDue: 'hourglass', planned: 'calendar' };

function remembered<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T | null) ?? fallback;
  } catch {
    return fallback;
  }
}
function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* per-device convenience */
  }
}

export function CalendarPage({ refreshKey }: { refreshKey: number }) {
  const { t, locale, fmtDate } = useI18n();
  const { boards, canWrite, me, person, teams } = useStore();
  const { quickAdd } = useShell();
  const { search } = useLocation();
  const today = todayIso();
  const tag = locale === 'tr' ? 'tr-TR' : 'en-GB';

  // ---- what the address asks for ------------------------------------------
  const params = new URLSearchParams(search);
  const view: View = VIEWS.includes(params.get('view') as View) ? (params.get('view') as View) : remembered<View>('app_cal_view', 'month');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') ?? '') ? params.get('date')! : today;
  const asked = params.get('who');
  const [reach, setReach] = useState<CalendarReach | null>(null);
  useEffect(() => {
    void get<CalendarReach>('/calendars').then(setReach, () => setReach({ can: false, everyone: false, teams: [], personIds: [] }));
  }, []);
  // Someone else's days only for a person who may ask; anyone can look at their own or at everyone's.
  const allowed = (w: string | null) => w === 'me' || w === 'all' || (!!w && /^[pt]:/.test(w) && !!reach?.can && (w.startsWith('t:') ? reach.teams.some((x) => `t:${x.id}` === w) : w === `p:${me.user.id}` || reach.personIds.includes(w.slice(2))));
  const who = allowed(asked) ? asked! : remembered<string>('app_cal_who', 'me') === 'all' ? 'all' : 'me';

  const go = (next: { view?: View; date?: string; who?: string }) => {
    const p = new URLSearchParams(search);
    p.set('view', next.view ?? view);
    p.set('date', next.date ?? date);
    p.set('who', next.who ?? who);
    if (next.view) remember('app_cal_view', next.view);
    if (next.who === 'me' || next.who === 'all') remember('app_cal_who', next.who);
    // Moving around the calendar is one visit to one place: it replaces the address instead of piling up steps.
    navigate(`/calendar?${p}`, true);
  };

  // ---- the stretch of days on show ----------------------------------------
  const [from, to] = useMemo((): [string, string] => {
    if (view === 'day') return [date, date];
    if (view === 'week') return [mondayOf(date), plus(mondayOf(date), 6)];
    if (view === 'year') return [`${date.slice(0, 4)}-01-01`, `${date.slice(0, 4)}-12-31`];
    const start = mondayOf(monthStart(date));
    return [start, plus(start, 41)];
  }, [view, date]);

  const [items, setItems] = useState<CalendarItem[] | null>(null);
  // A load that failed is not an empty calendar: it says so and offers a retry.
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let off = false;
    // Until it is known whether this person may ask for someone else's days, an address that names one waits.
    if (asked && /^[pt]:/.test(asked) && !reach) return;
    get<{ items: CalendarItem[] }>(`/calendar?from=${from}&to=${to}&who=${encodeURIComponent(who)}`).then(
      (r) => {
        if (off) return;
        setItems(r.items);
        setFailed(false);
      },
      () => !off && setFailed(true),
    );
    return () => {
      off = true;
    };
  }, [from, to, who, refreshKey, reach, asked, attempt]);

  // ---- which kinds show ---------------------------------------------------
  const [hidden, setHidden] = useState<Set<CalendarKind>>(() => new Set(remembered('app_cal_hidden', '').split(',').filter((k): k is CalendarKind => (CALENDAR_KINDS as readonly string[]).includes(k))));
  const toggle = (k: CalendarKind) =>
    setHidden((cur) => {
      const next = new Set(cur);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      remember('app_cal_hidden', [...next].join(','));
      return next;
    });
  const counts = useMemo(() => {
    const n = Object.fromEntries(CALENDAR_KINDS.map((k) => [k, 0])) as Record<CalendarKind, number>;
    for (const x of items ?? []) n[x.kind] += 1;
    return n;
  }, [items]);
  const byDay = useMemo(() => {
    const m = new Map<string, CalendarItem[]>();
    for (const x of items ?? []) {
      if (hidden.has(x.kind)) continue;
      const list = m.get(x.date);
      if (list) list.push(x);
      else m.set(x.date, [x]);
    }
    // Within a day: what has a clock time first, in order; then the rest as it came.
    for (const list of m.values()) list.sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99'));
    return m;
  }, [items, hidden]);

  const doneKeys = useMemo(() => {
    const s = new Set<string>();
    for (const b of boards) for (const c of b.columns) if (c.done) s.add(`${b.id}:${c.key}`);
    return s;
  }, [boards]);
  const stateOf = (x: CalendarItem) => (x.kind === 'task' ? dueState(x.date, !!x.done || doneKeys.has(`${x.boardId}:${x.status}`), today) : undefined);
  const open = (x: CalendarItem) => (x.kind === 'task' && x.taskId ? setQuery('task', x.taskId) : x.accountId && navigate(`/accounts/${x.accountId}`));
  const labelOf = (x: CalendarItem) => (x.kind === 'renewal' ? t('calendar.renewalOf', { name: x.title }) : x.kind === 'reviewDue' ? t('calendar.reviewDueOf', { name: x.title }) : x.title);
  // Whose it is only needs saying when more than one person's days are on show.
  const many = who === 'all' || who.startsWith('t:');

  // ---- words for the period and for whose calendar this is ----------------
  const long = (d: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(tag, { ...o, timeZone: 'UTC' }).format(at(d));
  const title =
    view === 'day'
      ? long(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : view === 'week'
        ? `${long(from, { day: 'numeric', month: from.slice(0, 7) === to.slice(0, 7) ? undefined : 'short' })} – ${long(to, { day: 'numeric', month: 'long', year: 'numeric' })}`
        : view === 'year'
          ? date.slice(0, 4)
          : long(date, { month: 'long', year: 'numeric' });
  const team = who.startsWith('t:') ? (reach?.teams.find((x) => `t:${x.id}` === who) ?? teams.find((x) => `t:${x.id}` === who)) : null;
  const whose = who === 'me' ? t('calendar.who.me') : who === 'all' ? t('calendar.who.all') : team ? t('calendar.who.team', { name: team.name }) : (person(who.slice(2))?.name ?? t('calendar.who.me'));
  const step = (n: number) => go({ date: view === 'day' ? plus(date, n) : view === 'week' ? plus(date, 7 * n) : view === 'year' ? shiftMonths(date, 12 * n) : shiftMonths(date, n) });

  const chip = (x: CalendarItem) => (
    <button key={x.id} className="calitem" data-kind={x.kind} data-due={stateOf(x)} onClick={() => open(x)} title={`${labelOf(x)}${x.accountName && x.kind !== 'renewal' && x.kind !== 'reviewDue' ? ` · ${x.accountName}` : ''}`}>
      <Icon name={KIND_ICON[x.kind]} size={13} />
      {x.time && <span className="calitem__time num">{x.time}</span>}
      <span className="calitem__title">{labelOf(x)}</span>
    </button>
  );
  const addOn = (day: string) =>
    canWrite && (
      <button className="cal__add" aria-label={t('calendar.addOn', { date: fmtDate(day, { day: 'numeric', month: 'long' }) })} title={t('calendar.addOn', { date: fmtDate(day, { day: 'numeric', month: 'long' }) })} onClick={() => quickAdd({ dueDate: day })}>
        <Icon name="plus" size={14} />
      </button>
    );

  const weekdays = Array.from({ length: 7 }, (_, i) => long(plus(mondayOf(today), i), { weekday: 'short' }));

  return (
    <>
      <header className="topbar cal-top">
        <div className="topbar__titles topbar__titles--icon">
          <PageIcon name="calendar" />
          <h1 className="topbar__title">{title}</h1>
          <p className="topbar__sub">{whose}</p>
        </div>
        <div className="topbar__spacer" />
        <div className="toolbar">
          <div className="seg seg--views" role="tablist" aria-label={t('calendar.viewLabel')} onKeyDown={onTabKeys}>
            {VIEWS.map((v) => (
              <button key={v} role="tab" aria-selected={view === v} tabIndex={view === v ? 0 : -1} onClick={() => go({ view: v })}>
                {t(`calendar.view.${v}`)}
              </button>
            ))}
          </div>
          {reach?.can ? (
            <label className="cal-who">
              <Icon name="people" size={15} />
              <select className="select" value={who} aria-label={t('calendar.who.label')} onChange={(e) => go({ who: e.target.value })}>
                <option value="me">{t('calendar.who.me')}</option>
                <option value="all">{t('calendar.who.all')}</option>
                {reach.teams.length > 0 && (
                  <optgroup label={t('calendar.who.teams')}>
                    {reach.teams.map((x) => (
                      <option key={x.id} value={`t:${x.id}`}>
                        {x.name} ({x.memberIds.length})
                      </option>
                    ))}
                  </optgroup>
                )}
                {reach.personIds.length > 0 && (
                  <optgroup label={t('calendar.who.people')}>
                    {reach.personIds
                      .map((id) => person(id))
                      .filter((p): p is NonNullable<typeof p> => !!p)
                      .sort((a, b) => a.name.localeCompare(b.name, locale))
                      .map((p) => (
                        <option key={p.id} value={`p:${p.id}`}>
                          {p.name}
                        </option>
                      ))}
                  </optgroup>
                )}
              </select>
            </label>
          ) : (
            <div className="seg" role="group" aria-label={t('calendar.who.label')}>
              <button aria-pressed={who === 'me'} onClick={() => go({ who: 'me' })}>
                {t('board.filter.mine')}
              </button>
              <button aria-pressed={who === 'all'} onClick={() => go({ who: 'all' })}>
                {t('board.filter.everyone')}
              </button>
            </div>
          )}
          <div className="cal-step">
            <button className="btn btn--icon" onClick={() => step(-1)} aria-label={t('calendar.prev')} title={t('calendar.prev')}>
              <Icon name="chevronLeft" size={16} />
            </button>
            <button className="btn" onClick={() => go({ date: today })}>
              {t('calendar.today')}
            </button>
            <button className="btn btn--icon" onClick={() => step(1)} aria-label={t('calendar.next')} title={t('calendar.next')}>
              <Icon name="chevronRight" size={16} />
            </button>
          </div>
        </div>
      </header>
      <div className="page">
        <div className="cal-kinds" role="group" aria-label={t('calendar.kinds')}>
          {CALENDAR_KINDS.map((k) => (
            <button key={k} className="cal-kind" data-kind={k} aria-pressed={!hidden.has(k)} onClick={() => toggle(k)}>
              <Icon name={KIND_ICON[k]} size={14} />
              {t(`calendar.kind.${k}`)}
              <span className="num">{counts[k]}</span>
            </button>
          ))}
        </div>

        {failed && <LoadError onRetry={() => { setFailed(false); setItems(null); setAttempt((n) => n + 1); }} />}
        {!failed && !items && <SkeletonRows rows={view === 'day' ? 4 : 8} label={t('common.loading')} />}
        {!failed && items && view === 'month' && (
          <div className="cal" role="grid" aria-label={t('calendar.title')}>
            {weekdays.map((w) => (
              <div className="cal__dow" key={w} role="columnheader">
                {w}
              </div>
            ))}
            {Array.from({ length: 42 }, (_, i) => plus(from, i)).map((day) => {
              const list = byDay.get(day) ?? [];
              return (
                <div className="cal__day" key={day} role="gridcell" data-out={day.slice(0, 7) !== date.slice(0, 7)} data-today={day === today} aria-label={fmtDate(day, { day: 'numeric', month: 'long' })}>
                  <span className="cal__top">
                    <button className="cal__date" onClick={() => go({ view: 'day', date: day })} title={t('calendar.openDay', { date: fmtDate(day, { day: 'numeric', month: 'long' }) })}>
                      {at(day).getUTCDate()}
                    </button>
                    {addOn(day)}
                  </span>
                  {list.slice(0, 3).map(chip)}
                  {list.length > 3 && (
                    <button className="cal__more" onClick={() => go({ view: 'day', date: day })}>
                      {t('calendar.more', { n: list.length - 3 })}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!failed && items && view === 'week' && (
          <div className="calweek">
            {Array.from({ length: 7 }, (_, i) => plus(from, i)).map((day) => {
              const list = byDay.get(day) ?? [];
              return (
                <section key={day} className="calweek__day" data-today={day === today || undefined} aria-label={fmtDate(day, { weekday: 'long', day: 'numeric', month: 'long' })}>
                  <header className="calweek__head">
                    <button className="calweek__date" onClick={() => go({ view: 'day', date: day })} title={t('calendar.openDay', { date: fmtDate(day, { day: 'numeric', month: 'long' }) })}>
                      <span>{long(day, { weekday: 'short' })}</span>
                      <strong>{at(day).getUTCDate()}</strong>
                    </button>
                    {addOn(day)}
                  </header>
                  <div className="calweek__list">
                    {list.map(chip)}
                    {list.length === 0 && <span className="calweek__none">—</span>}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {!failed && items && view === 'day' && (
          <div className="sheet calday">
            {(byDay.get(date) ?? []).length === 0 ? (
              <EmptyState compact icon="calendar" title={t('calendar.emptyDay')}>
                {canWrite && (
                  <button className="btn" onClick={() => quickAdd({ dueDate: date })}>
                    <Icon name="plus" size={16} />
                    {t('calendar.addOn', { date: fmtDate(date, { day: 'numeric', month: 'long' }) })}
                  </button>
                )}
              </EmptyState>
            ) : (
              <ul className="calday__list">
                {(byDay.get(date) ?? []).map((x) => {
                  const state = stateOf(x);
                  return (
                    <li key={x.id}>
                      <button className="calrow" data-kind={x.kind} data-due={state} onClick={() => open(x)}>
                        <span className="calrow__icon">
                          <Icon name={KIND_ICON[x.kind]} size={17} />
                        </span>
                        <span className="calrow__main">
                          <strong>{labelOf(x)}</strong>
                          <span className="calrow__meta">
                            {[t(`calendar.one.${x.kind}`), x.time, x.minutes ? t('calendar.minutes', { n: x.minutes }) : null, x.kind !== 'renewal' && x.kind !== 'reviewDue' ? x.accountName : null].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                        {(many || x.personIds.length > 1) && <Avatars people={x.personIds.map((id) => person(id))} max={4} />}
                        {state === 'late' && <span className="flag flag--late">{t('calendar.late')}</span>}
                        {state === 'done' && <span className="flag flag--ok">{t('calendar.done')}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {!failed && items && view === 'year' && (
          <div className="calyear">
            {Array.from({ length: 12 }, (_, m) => `${date.slice(0, 4)}-${String(m + 1).padStart(2, '0')}-01`).map((first) => {
              const start = mondayOf(first);
              const total = Array.from({ length: 42 }, (_, i) => plus(start, i)).filter((d) => d.slice(0, 7) === first.slice(0, 7)).reduce((n, d) => n + (byDay.get(d)?.length ?? 0), 0);
              return (
                <section key={first} className="calyear__month" data-now={first.slice(0, 7) === today.slice(0, 7) || undefined}>
                  <button className="calyear__name" onClick={() => go({ view: 'month', date: first })}>
                    <strong>{long(first, { month: 'long' })}</strong>
                    <span className="num">{total || ''}</span>
                  </button>
                  <div className="calyear__grid" aria-hidden="true">
                    {weekdays.map((w) => (
                      <span key={w} className="calyear__dow">
                        {w.slice(0, 1)}
                      </span>
                    ))}
                  </div>
                  <div className="calyear__grid">
                    {Array.from({ length: 42 }, (_, i) => plus(start, i)).map((day) => {
                      if (day.slice(0, 7) !== first.slice(0, 7)) return <span key={day} />;
                      const n = byDay.get(day)?.length ?? 0;
                      const label = fmtDate(day, { day: 'numeric', month: 'long' });
                      return (
                        <button key={day} className="calyear__day" data-n={n === 0 ? undefined : n < 3 ? 1 : n < 6 ? 2 : 3} data-today={day === today || undefined} onClick={() => go({ view: 'day', date: day })} title={n ? `${label}: ${t('calendar.items', { n })}` : label} aria-label={n ? `${label}: ${t('calendar.items', { n })}` : label}>
                          {at(day).getUTCDate()}
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
        {!failed && items && items.length === 0 && view !== 'day' && <p className="cal-none">{t('calendar.emptyRange')}</p>}
      </div>
    </>
  );
}
