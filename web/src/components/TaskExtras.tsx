// The parts of a task beyond the basics: the board's own fields, who
// follows it, what it waits for, time spent, reusable checklists, and its
// history in plain words.
import { useEffect, useRef, useState } from 'react';
import { labelOf } from '../../../shared/src/fields';
import type { Board, ChecklistTemplate, Person, TaskDetail, TaskEvent, TaskField, TaskFieldValue, TaskLink } from '../../../shared/src/model';
import { ApiFailure, del, get, post, put } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { setQuery } from '../lib/router';
import { useStore } from '../lib/store';
import { relativeTime, todayIso } from '../lib/time';
import { hoursText } from '../pages/Reports';
import { Icon } from './icons';
import { useDismiss } from './Menus';
import { Avatar, Avatars } from './ui';

type Reload = () => void | Promise<void>;
const useFail = () => {
  const { t } = useI18n();
  const { toast } = useStore();
  return (e: unknown) => toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
};

/** One of the board's own fields, as the right kind of input. Saves on change or blur. */
export function TaskFieldInput({ field, value, disabled, people, onSave }: { field: TaskField; value: TaskFieldValue | undefined; disabled: boolean; people: Person[]; onSave: (v: TaskFieldValue) => void }) {
  const { locale, t } = useI18n();
  const label = labelOf(field.label, locale);
  const [v, setV] = useState(value == null ? '' : String(value));
  useEffect(() => setV(value == null ? '' : String(value)), [value]);
  if (field.type === 'checkbox') {
    return (
      <label className="checkbox">
        <input type="checkbox" checked={value === true} disabled={disabled} aria-label={label} onChange={(e) => onSave(e.target.checked)} />
        <span className="muted">{value === true ? t('common.yes') : t('common.no')}</span>
      </label>
    );
  }
  if (field.type === 'select' || field.type === 'person') {
    return (
      <select className="select" value={v} disabled={disabled} aria-label={label} onChange={(e) => (setV(e.target.value), onSave(e.target.value || null))}>
        <option value="">—</option>
        {field.type === 'select'
          ? (field.options ?? []).map((o) => (
              <option key={o.key} value={o.key}>
                {labelOf(o.label, locale)}
              </option>
            ))
          : people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
      </select>
    );
  }
  const type = field.type === 'date' ? 'date' : field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : 'text';
  const commit = () => {
    if (v === (value == null ? '' : String(value))) return;
    onSave(v.trim() === '' ? null : field.type === 'number' || field.type === 'money' ? (Number.isFinite(Number(v.replace(',', '.'))) ? Number(v.replace(',', '.')) : v) : v.trim());
  };
  return (
    <input
      className="input"
      type={type}
      inputMode={field.type === 'number' || field.type === 'money' ? 'decimal' : undefined}
      value={v}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => (setV(e.target.value), field.type === 'date' && onSave(e.target.value || null))}
      onBlur={field.type === 'date' ? undefined : commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

/** Follow / stop following, with the faces of who follows. */
export function FollowButton({ task, reload }: { task: TaskDetail; reload: Reload }) {
  const { t } = useI18n();
  const { me, person } = useStore();
  const fail = useFail();
  const watchers = task.watchers ?? [];
  const on = watchers.includes(me.user.id);
  if (me.previewBy) return null;
  return (
    <span className="follow">
      {watchers.length > 0 && <Avatars people={watchers.map((id) => person(id))} max={3} />}
      <button
        className="btn btn--small btn--quiet follow__btn"
        aria-pressed={on}
        title={on ? t('task.followingHint') : t('task.followHint')}
        onClick={async () => {
          try {
            if (on) await del(`/tasks/${task.id}/watch`);
            else await put(`/tasks/${task.id}/watch`, {});
            await reload();
          } catch (e) {
            fail(e);
          }
        }}
      >
        <Icon name="eye" size={15} />
        {on ? t('task.following') : t('task.follow')}
      </button>
    </span>
  );
}

const LINK_KINDS = ['blocked_by', 'blocks', 'relates'] as const;

export function LinksSection({ task, editable, reload }: { task: TaskDetail; editable: boolean; reload: Reload }) {
  const { t } = useI18n();
  const fail = useFail();
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<(typeof LINK_KINDS)[number]>('blocked_by');
  const [q, setQ] = useState('');
  const [found, setFound] = useState<{ id: string; title: string; boardName: string }[]>([]);
  const links = task.links ?? [];
  useEffect(() => {
    if (q.trim().length < 2) return setFound([]);
    let live = true;
    const id = setTimeout(() => {
      void get<{ tasks: { id: string; title: string; boardName: string }[] }>(`/search?q=${encodeURIComponent(q.trim())}`).then((r) => live && setFound(r.tasks.filter((x) => x.id !== task.id && !links.some((l) => l.taskId === x.id)).slice(0, 6)), () => undefined);
    }, 180);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [q, task.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const add = async (otherId: string) => {
    try {
      await post(`/tasks/${task.id}/links`, { otherId, kind });
      setQ('');
      setAdding(false);
      await reload();
    } catch (e) {
      fail(e);
    }
  };
  const groups = LINK_KINDS.map((k) => ({ k, list: links.filter((l) => l.kind === k) })).filter((g) => g.list.length);
  if (!links.length && !editable) return null;
  return (
    <section>
      <h3 className="section__head">
        <span>
          <Icon name="link" size={16} className="icon--lead" />
          {t('task.links')}
        </span>
        {editable && !adding && (
          <button className="linkbtn" onClick={() => setAdding(true)}>
            {t('task.links.add')}
          </button>
        )}
      </h3>
      {links.length === 0 && !adding && <p className="muted small" style={{ margin: 0 }}>{t('task.links.none')}</p>}
      {groups.map((g) => (
        <div key={g.k} className="tlinks">
          <span className="tlinks__kind">{t(`task.links.${g.k}` as any)}</span>
          <ul className="plainlist">
            {g.list.map((l: TaskLink) => (
              <li key={l.taskId} className="tlinks__row" data-done={l.done || undefined}>
                <Icon name={l.done ? 'checkCircle' : g.k === 'blocked_by' ? 'hourglass' : 'link'} size={15} />
                <button className="linkbtn linkbtn--plain tlinks__title" onClick={() => setQuery('task', l.taskId)}>
                  {l.title}
                </button>
                <span className="muted small hide-phone">{l.boardName}</span>
                {editable && (
                  <button
                    className="btn btn--quiet btn--icon btn--small"
                    aria-label={t('common.remove')}
                    title={t('common.remove')}
                    onClick={async () => {
                      await del(`/tasks/${task.id}/links/${l.taskId}?kind=${l.kind}`).catch(fail);
                      await reload();
                    }}
                  >
                    <Icon name="close" size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {adding && (
        <div className="tlinks__add">
          <select className="select" value={kind} aria-label={t('task.links.kind')} onChange={(e) => setKind(e.target.value as typeof kind)}>
            {LINK_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`task.links.${k}` as any)}
              </option>
            ))}
          </select>
          <input className="input" autoFocus value={q} placeholder={t('task.links.search')} aria-label={t('task.links.search')} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setAdding(false))} />
          <button className="btn btn--quiet btn--small" onClick={() => setAdding(false)}>
            {t('common.cancel')}
          </button>
          {found.length > 0 && (
            <ul className="tlinks__found plainlist">
              {found.map((x) => (
                <li key={x.id}>
                  <button className="pane-row" onClick={() => add(x.id)}>
                    <span className="pane-row__main">
                      <span className="pane-row__title">{x.title}</span>
                      <span className="pane-row__sub">{x.boardName}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

const QUICK_MINUTES = [15, 30, 60, 120];

export function TimeSection({ task, editable, reload }: { task: TaskDetail; editable: boolean; reload: Reload }) {
  const { t, locale, fmtDate } = useI18n();
  const { person, me, can } = useStore();
  const fail = useFail();
  const [custom, setCustom] = useState('');
  const [open, setOpen] = useState(false);
  const time = task.time ?? { total: 0, entries: [] };
  const add = async (minutes: number) => {
    if (!Number.isFinite(minutes) || minutes < 1) return;
    try {
      await post(`/tasks/${task.id}/time`, { minutes: Math.round(minutes), day: todayIso() });
      setCustom('');
      await reload();
    } catch (e) {
      fail(e);
    }
  };
  /** "1.5", "1,5", "90m", "1h 30m", "1:30" → minutes. */
  const parse = (s: string) => {
    const x = s.trim().toLowerCase().replace(',', '.');
    let m = /^(\d+):(\d{1,2})$/.exec(x);
    if (m) return Number(m[1]) * 60 + Number(m[2]);
    m = /^(?:(\d+(?:\.\d+)?)\s*(?:h|sa|s|saat))?\s*(?:(\d+)\s*(?:m|dk|d|min))?$/.exec(x);
    if (m && (m[1] || m[2])) return Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
    return /^\d+(\.\d+)?$/.test(x) ? Number(x) * 60 : NaN;
  };
  if (!editable && !time.total) return null;
  return (
    <section>
      <h3 className="section__head">
        <span>
          <Icon name="clock" size={16} className="icon--lead" />
          {t('task.time')} {time.total > 0 && <span className="muted num">{hoursText(time.total, locale)}</span>}
        </span>
        {time.entries.length > 0 && (
          <button className="linkbtn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? t('task.time.hide') : t('task.time.show', { n: time.entries.length })}
          </button>
        )}
      </h3>
      {editable && (
        <div className="timeadd">
          {QUICK_MINUTES.map((m) => (
            <button key={m} className="btn btn--small" onClick={() => add(m)}>
              + {hoursText(m, locale)}
            </button>
          ))}
          <input
            className="input timeadd__custom"
            value={custom}
            placeholder={t('task.time.custom')}
            aria-label={t('task.time.custom')}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const m = parse(custom);
                if (Number.isNaN(m) || m < 1 || m > 1440) fail(new Error('bad'));
                else void add(m);
              }
            }}
          />
        </div>
      )}
      {open && (
        <ul className="plainlist timelist">
          {time.entries.map((e) => (
            <li key={e.id}>
              <Avatar person={person(e.userId)} />
              <span className="num">{hoursText(e.minutes, locale)}</span>
              <span className="muted">{fmtDate(e.day)}</span>
              {e.note && <span className="muted">{e.note}</span>}
              {(e.userId === me.user.id || can('org.manage')) && editable && (
                <button
                  className="btn btn--quiet btn--icon btn--small"
                  aria-label={t('common.remove')}
                  onClick={async () => {
                    await del(`/time/${e.id}`).catch(fail);
                    await reload();
                  }}
                >
                  <Icon name="close" size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** "Add a checklist": saved lists become subtasks; the task's own subtasks can be saved as a new list. */
export function ChecklistMenu({ task, reload }: { task: TaskDetail; reload: Reload }) {
  const { t } = useI18n();
  const { toast } = useStore();
  const fail = useFail();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<ChecklistTemplate[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  useEffect(() => {
    if (open) void get<{ checklists: ChecklistTemplate[] }>('/checklists').then((r) => setList(r.checklists), () => setList([]));
  }, [open]);
  const apply = async (c: ChecklistTemplate) => {
    setOpen(false);
    try {
      const r = await post<{ added: number }>(`/tasks/${task.id}/checklist`, { templateId: c.id });
      toast(t('task.checklist.added', { n: r.added, name: c.name }));
      await reload();
    } catch (e) {
      fail(e);
    }
  };
  const [naming, setNaming] = useState<string | null>(null);
  const saveAs = async () => {
    const name = (naming ?? '').trim();
    if (!name) return;
    setOpen(false);
    setNaming(null);
    try {
      await post('/checklists', { name, items: task.subtasks.map((s) => s.title).slice(0, 50) });
      toast(t('task.checklist.saved', { name }));
    } catch (e) {
      fail(e);
    }
  };
  return (
    <div className="menuwrap" ref={ref}>
      <button className="linkbtn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {t('task.checklist')}
      </button>
      {open && (
        <div className="popmenu" role="menu">
          {list === null && <span className="popmenu__note">{t('common.loading')}</span>}
          {list?.length === 0 && <span className="popmenu__note">{t('task.checklist.none')}</span>}
          {list?.map((c) => (
            <button key={c.id} role="menuitem" className="popmenu__item" onClick={() => apply(c)}>
              <Icon name="list" size={16} />
              <span className="popmenu__label">{c.name}</span>
              <span className="muted small num">{c.items.length}</span>
            </button>
          ))}
          {task.subtasks.length > 0 && (
            <>
              <div className="popmenu__sep" role="separator" />
              {naming === null ? (
                <button role="menuitem" className="popmenu__item" onClick={() => setNaming(task.title)}>
                  <Icon name="bookmark" size={16} />
                  <span className="popmenu__label">{t('task.checklist.saveAs')}</span>
                </button>
              ) : (
                <div className="popmenu__form">
                  <input className="input" autoFocus value={naming} aria-label={t('task.checklist.namePrompt')} placeholder={t('task.checklist.namePrompt')} maxLength={120} onChange={(e) => setNaming(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void saveAs()} />
                  <button className="btn btn--primary btn--small" disabled={!naming.trim()} onClick={saveAs}>
                    {t('common.save')}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** What happened to the task, newest first, in words. */
export function HistorySection({ task, board }: { task: TaskDetail; board: Board | undefined }) {
  const { t, locale, fmtDate } = useI18n();
  const { person } = useStore();
  const [open, setOpen] = useState(false);
  const events = task.events ?? [];
  if (!events.length) return null;
  const col = (k: unknown) => board?.columns.find((c) => c.key === k)?.name ?? String(k ?? '');
  const names = (ids: unknown) => ((ids as string[]) ?? []).map((id) => person(id)?.name ?? t('common.unknownUser')).join(', ');
  const date = (d: unknown) => (d ? fmtDate(String(d)) : t('task.history.none'));
  const say = (e: TaskEvent): string => {
    const d = e.data as Record<string, any>;
    switch (e.kind) {
      case 'created':
        return d.plan ? t('task.history.createdPlan', { plan: d.plan }) : d.form ? t('task.history.createdForm') : t('task.history.created');
      case 'title':
        return t('task.history.title', { to: d.to });
      case 'status':
        return t('task.history.status', { from: col(d.from), to: col(d.to) });
      case 'assignees':
        return [d.added?.length ? t('task.history.assigned', { names: names(d.added) }) : '', d.removed?.length ? t('task.history.unassigned', { names: names(d.removed) }) : ''].filter(Boolean).join(' · ');
      case 'due':
        return t('task.history.due', { from: date(d.from), to: date(d.to) });
      case 'start':
        return t('task.history.start', { to: date(d.to) });
      case 'priority':
        return t('task.history.priority', { to: t(`task.priority.${d.to}` as any) });
      case 'account':
        return t('task.history.account', { to: d.to ?? t('task.history.none') });
      case 'description':
        return t('task.history.description');
      case 'fields':
        return t('task.history.fields', { fields: ((d.keys as string[]) ?? []).map((k) => labelOf(board?.taskFields.find((f) => f.key === k)?.label, locale) || k).join(', ') });
      case 'repeat':
        return d.to ? t('task.history.repeatOn') : t('task.history.repeatOff');
      case 'linked':
        return `${t(`task.links.${d.kind}` as any)}: ${d.title}`;
      case 'unlinked':
        return t('task.history.unlinked', { title: d.title });
      case 'time':
        return t('task.history.time', { time: hoursText(Number(d.minutes) || 0, locale) });
      case 'checklist':
        return t('task.history.checklist', { n: d.n });
      case 'archived':
        return d.auto ? t('task.history.archivedAuto') : t('task.history.archived');
      case 'restored':
        return t('task.history.restored');
      default:
        return e.kind;
    }
  };
  const shown = open ? events : events.slice(0, 3);
  return (
    <section>
      <h3 className="section__head">
        <span>
          <Icon name="history" size={16} className="icon--lead" />
          {t('task.history')}
        </span>
        {events.length > 3 && (
          <button className="linkbtn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? t('task.history.less') : t('task.history.all', { n: events.length })}
          </button>
        )}
      </h3>
      <ol className="thistory">
        {shown.map((e) => (
          <li key={e.id}>
            <span className="thistory__who">{e.actorId ? (person(e.actorId)?.name ?? t('common.unknownUser')) : t('task.history.system')}</span>
            <span className="thistory__what">{say(e)}</span>
            <time className="thistory__when" dateTime={e.createdAt} title={new Date(e.createdAt).toLocaleString(locale)}>
              {relativeTime(e.createdAt, t)}
            </time>
          </li>
        ))}
      </ol>
    </section>
  );
}
