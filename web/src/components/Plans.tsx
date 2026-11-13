// Playbooks: a company's way of doing something — onboarding, a renewal, a
// business review — written once as tasks with dates. Admins write them
// (Settings → Playbooks, or from a customer's page); anyone who can add tasks
// puts one on a customer (here) or on a deal (RecordPanel.tsx). A renewal
// playbook can also start by itself: Settings → Targets and rhythm → Renewals.
//
// What's in this file:
//   usePlaybooks()       the company's playbooks, loaded once per screen
//   useAnchorText()      "12 days after the start", "90 days before the renewal"
//   PlanMenu             the "Apply a playbook" button on a customer's page
//   PlanEditor           the dialog that writes or changes one
//   PlaybooksSettings    Settings → Playbooks: the list and examples to start from
//
// The server side is api/src/routes/work.ts (the routes) and
// api/src/lib/playbooks.ts (what applying one does).
import { useCallback, useEffect, useRef, useState } from 'react';
import type { TaskBlueprint } from '../../../shared/src/automation';
import { labelOf } from '../../../shared/src/fields';
import { PLAN_ANCHORS, type PlanAnchor, type PlanTemplate } from '../../../shared/src/model';
import { PLAYBOOK_EXAMPLES, type PlaybookExample } from '../../../shared/src/playbooks';
import { DEFAULT_RHYTHM } from '../../../shared/src/rhythm';
import { ApiFailure, del, get, patch, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { navigate } from '../lib/router';
import { tasksChanged } from '../lib/shell';
import { useStore } from '../lib/store';
import { todayIso } from '../lib/time';
import { EmptyState } from './Empty';
import { Icon, type IconName } from './icons';
import { useDismiss } from './Menus';
import { Confirm, Dialog } from './ui';

/** The icon that says what a playbook's dates count from. */
const ANCHOR_ICON: Record<PlanAnchor, IconName> = { start: 'play', renewal: 'repeat', close: 'funnel' };

/** The company's playbooks. `null` while loading. */
export function usePlaybooks(load = true) {
  const [plans, setPlans] = useState<PlanTemplate[] | null>(null);
  const reload = useCallback(() => get<{ plans: PlanTemplate[] }>('/plans').then((r) => setPlans(r.plans), () => setPlans([])), []);
  useEffect(() => {
    if (load) void reload();
  }, [load, reload]);
  return { plans, reload };
}

/** Words for when a step is due, relative to what the playbook counts from. */
export function useAnchorText() {
  const { t } = useI18n();
  return {
    /** "counts from the day it is put on" — a playbook's whole rhythm. */
    anchor: (a: PlanAnchor) => t(`plans.anchorShort.${a}` as const),
    /** "+3 days" or "90 days before" — one step. */
    step: (a: PlanAnchor, days: number) => (a === 'start' ? t('plans.stepAfter', { n: days }) : t('plans.stepBefore', { n: days })),
  };
}

// ---------------------------------------------------------------- apply

/** "Apply a playbook" on a customer's page: pick one, pick the start day, done. */
export function PlanMenu({ accountId, accountName, onApplied }: { accountId: string; accountName: string; onApplied: () => void }) {
  const { t } = useI18n();
  const { can, toast, canWrite } = useStore();
  const anchorText = useAnchorText();
  const [open, setOpen] = useState(false);
  const { plans, reload } = usePlaybooks(false);
  const [editing, setEditing] = useState<PlanTemplate | 'new' | null>(null);
  const [start, setStart] = useState(todayIso());
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  useEffect(() => {
    if (open) void reload();
  }, [open, reload]);
  if (!canWrite) return null;
  // A playbook that counts back from a deal's close date goes on the deal, not here.
  const usable = plans?.filter((p) => p.anchor !== 'close') ?? null;
  const anyFromStart = usable?.some((p) => p.anchor === 'start');

  const apply = async (p: PlanTemplate) => {
    setOpen(false);
    try {
      const r = await post<{ tasks: { id: string }[] }>(`/accounts/${accountId}/plans`, { planId: p.id, start });
      toast(t('plans.applied', { n: r.tasks.length, plan: p.name, account: accountName }));
      tasksChanged();
      onApplied();
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    }
  };

  return (
    <div className="menuwrap" ref={ref}>
      <button className="btn btn--small" data-tour="apply-playbook" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="zap" size={15} />
        {t('plans.button')}
      </button>
      {open && (
        <div className="popmenu filterpop planpop" role="menu" aria-label={t('plans.button')}>
          {anyFromStart && (
            <label className="field">
              <span className="filterpop__label">{t('plans.start')}</span>
              <input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value || todayIso())} />
            </label>
          )}
          {usable === null && <span className="popmenu__note">{t('common.loading')}</span>}
          {usable?.length === 0 && <span className="popmenu__note">{can('org.manage') ? t('plans.noneAdmin') : t('plans.none')}</span>}
          {usable?.map((p) => (
            <div key={p.id} className="viewrow">
              <button role="menuitem" className="popmenu__item planpop__item" onClick={() => apply(p)}>
                <Icon name={ANCHOR_ICON[p.anchor]} size={16} />
                <span className="planpop__text">
                  <span className="popmenu__label">{p.name}</span>
                  <span className="planpop__meta">
                    {t('plans.tasksN', { n: p.tasks.length })} · {anchorText.anchor(p.anchor)}
                  </span>
                </span>
              </button>
              {can('org.manage') && (
                <button className="btn btn--quiet btn--icon btn--small" aria-label={t('common.edit')} title={t('common.edit')} onClick={() => (setOpen(false), setEditing(p))}>
                  <Icon name="edit" size={14} />
                </button>
              )}
            </div>
          ))}
          {can('org.manage') && (
            <>
              <div className="popmenu__sep" role="separator" />
              <button role="menuitem" className="popmenu__item" onClick={() => (setOpen(false), setEditing('new'))}>
                <Icon name="plus" size={16} />
                <span className="popmenu__label">{t('plans.new')}</span>
              </button>
              <button role="menuitem" className="popmenu__item" onClick={() => (setOpen(false), navigate('/settings/playbooks'))}>
                <Icon name="sliders" size={16} />
                <span className="popmenu__label">{t('plans.manage')}</span>
              </button>
            </>
          )}
        </div>
      )}
      {editing && <PlanEditor plan={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------- write

/** What the editor starts from: a playbook to change, an example, or nothing. */
type Draft = Pick<PlanTemplate, 'name' | 'description' | 'anchor' | 'tasks'> & { boardId?: string };

/** An example, in the language of whoever is writing. */
function draftOf(ex: PlaybookExample, locale: 'en' | 'tr'): Draft {
  return {
    name: labelOf(ex.name, locale),
    description: labelOf(ex.description, locale),
    anchor: ex.anchor,
    tasks: ex.steps.map((s) => ({ title: labelOf(s.title, locale), dueInDays: s.days, assignee: 'account_owner' as const })),
  };
}

/**
 * Writes a playbook or changes one. Steps are saved in date order: first
 * due first, whichever way the days count.
 */
export function PlanEditor({ plan, draft, onClose, onSaved }: { plan: PlanTemplate | null; draft?: Draft; onClose: () => void; onSaved?: () => void }) {
  const { t } = useI18n();
  const { boards, people, toast } = useStore();
  const anchorText = useAnchorText();
  const from = plan ?? draft;
  const [name, setName] = useState(from?.name ?? '');
  const [description, setDescription] = useState(from?.description ?? '');
  const [anchor, setAnchor] = useState<PlanAnchor>(from?.anchor ?? 'start');
  // A renewal playbook goes on the renewals board when there is one.
  const [boardId, setBoardId] = useState(plan?.boardId ?? (anchor === 'renewal' ? boards.find((b) => /renew|yenile/i.test(b.name))?.id : undefined) ?? boards[0]?.id ?? '');
  const [tasks, setTasks] = useState<TaskBlueprint[]>(from?.tasks?.length ? from.tasks : [{ title: '', dueInDays: 0, assignee: 'account_owner' }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState(false);
  // Only people with a full seat can be given work (the server checks this too).
  const assignable = people.filter((p) => (p.status === 'active' || p.status === 'invited') && p.seat === 'full');

  const set = (i: number, p: Partial<TaskBlueprint>) => setTasks((list) => list.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const ready = name.trim() && boardId && tasks.some((x) => x.title.trim());

  const save = async () => {
    setBusy(true);
    setError('');
    const steps = tasks
      .filter((x) => x.title.trim())
      .map((x) => ({ ...x, title: x.title.trim() }))
      // Counting from the start: soonest first. Counting back: the furthest out first.
      .sort((a, b) => (anchor === 'start' ? a.dueInDays - b.dueInDays : b.dueInDays - a.dueInDays));
    const body = { name: name.trim(), description: description.trim(), boardId, anchor, tasks: steps };
    try {
      if (plan) await patch(`/plans/${plan.id}`, body);
      else await post('/plans', body);
      toast(t('common.saved'));
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e instanceof ApiFailure ? e.body.message : t('errors.server'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={plan ? t('plans.edit') : t('plans.new')}
      wide
      onClose={onClose}
      footer={
        <>
          {plan && (
            <button className="btn btn--danger" style={{ marginRight: 'auto' }} onClick={() => setRemoving(true)}>
              {t('common.delete')}
            </button>
          )}
          <button className="btn btn--quiet" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn--primary" disabled={!ready || busy} onClick={save}>
            {t('common.save')}
          </button>
        </>
      }
    >
      <div className="form__row">
        <label className="field">
          <span className="field__label">{t('plans.name')}</span>
          <input className="input" value={name} maxLength={120} placeholder={t('plans.namePlaceholder')} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">{t('plans.board')}</span>
          <select className="select" value={boardId} onChange={(e) => setBoardId(e.target.value)}>
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span className="field__label">{t('plans.description')}</span>
        <input className="input" value={description} maxLength={500} placeholder={t('plans.descriptionPlaceholder')} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <div className="field">
        <span className="field__label" id="plan-anchor">
          {t('plans.anchor')}
        </span>
        <div className="seg" role="radiogroup" aria-labelledby="plan-anchor">
          {PLAN_ANCHORS.map((a) => (
            <button key={a} type="button" role="radio" aria-checked={anchor === a} className="seg__item" onClick={() => setAnchor(a)}>
              <Icon name={ANCHOR_ICON[a]} size={14} /> {t(`plans.anchor.${a}` as const)}
            </button>
          ))}
        </div>
        <span className="field__hint">{t(`plans.anchorHint.${anchor}` as const)}</span>
      </div>
      <div className="field">
        <span className="field__label">{t('plans.tasks')}</span>
        <span className="field__hint">{t('plans.tasksHint')}</span>
        <div className="bfields">
          {tasks.map((x, i) => (
            <div key={i} className="planrow">
              <input className="input" value={x.title} maxLength={300} placeholder={t('plans.taskTitle')} aria-label={t('plans.taskTitle')} onChange={(e) => set(i, { title: e.target.value })} />
              <label className="planrow__days">
                {anchor === 'start' && <span>+</span>}
                <input className="input input--num" type="number" min={0} max={730} value={x.dueInDays} aria-label={t('plans.days')} onChange={(e) => set(i, { dueInDays: Math.max(0, Math.min(730, Number(e.target.value) || 0)) })} />
                <span>{anchor === 'start' ? t('plans.days') : t('plans.daysBefore')}</span>
              </label>
              <select className="select" value={x.assignee} aria-label={t('task.assignees')} onChange={(e) => set(i, { assignee: e.target.value as TaskBlueprint['assignee'] })}>
                <option value="account_owner">{t('plans.owner')}</option>
                <option value="none">{t('task.unassigned')}</option>
                {assignable.map((p) => (
                  <option key={p.id} value={`user:${p.id}`}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn--quiet btn--icon btn--small" aria-label={t('common.remove')} disabled={tasks.length < 2} onClick={() => setTasks(tasks.filter((_, j) => j !== i))}>
                <Icon name="trash" size={15} />
              </button>
            </div>
          ))}
          {tasks.length < 40 && (
            <button
              type="button"
              className="btn btn--small bfields__add"
              onClick={() => {
                // The next step lands a week further along, whichever way the days count.
                const last = tasks[tasks.length - 1]?.dueInDays ?? 0;
                setTasks([...tasks, { title: '', dueInDays: anchor === 'start' ? last + 7 : Math.max(0, last - 7), assignee: 'account_owner' }]);
              }}
            >
              <Icon name="plus" size={15} />
              {t('plans.addTask')}
            </button>
          )}
        </div>
        {tasks.some((x) => x.title.trim()) && (
          <p className="field__hint planrow__preview">
            {t('plans.preview', {
              first: anchorText.step(anchor, anchor === 'start' ? Math.min(...tasks.map((x) => x.dueInDays)) : Math.max(...tasks.map((x) => x.dueInDays))),
              last: anchorText.step(anchor, anchor === 'start' ? Math.max(...tasks.map((x) => x.dueInDays)) : Math.min(...tasks.map((x) => x.dueInDays))),
            })}
          </p>
        )}
      </div>
      {error && <p className="error-text">{error}</p>}
      {removing && plan && (
        <Confirm
          title={t('plans.deleteTitle', { name: plan.name })}
          body={t('plans.deleteBody')}
          confirmLabel={t('common.delete')}
          danger
          onClose={() => setRemoving(false)}
          onConfirm={async () => {
            await del(`/plans/${plan.id}`).catch(() => undefined);
            onSaved?.();
            onClose();
          }}
        />
      )}
    </Dialog>
  );
}

// ---------------------------------------------------------------- settings

/** Settings → Playbooks: every playbook, and the usual ones to start from. */
export function PlaybooksSettings() {
  const { t, locale } = useI18n();
  const { boards, me, can } = useStore();
  const anchorText = useAnchorText();
  const { plans, reload } = usePlaybooks();
  const [editing, setEditing] = useState<{ plan: PlanTemplate | null; draft?: Draft } | null>(null);
  const rhythm = me.org.rhythm ?? DEFAULT_RHYTHM;
  const manage = can('org.manage');
  const boardName = (id: string) => boards.find((b) => b.id === id)?.name ?? '—';
  // Examples the company already has (by name) are not offered again.
  const have = new Set((plans ?? []).map((p) => p.name.toLocaleLowerCase(locale)));
  const examples = PLAYBOOK_EXAMPLES.filter((ex) => !have.has(labelOf(ex.name, locale).toLocaleLowerCase(locale)));

  if (plans === null) return <div className="muted">{t('common.loading')}</div>;
  return (
    <div className="playbooks">
      <section className="sheet">
        <div className="section__head">
          <div>
            <h2 className="sheet__title">
            <Icon name="book" size={18} className="icon--lead" />
            {t('plans.title')}
          </h2>
            <p className="sheet__hint">{t('plans.settingsHint')}</p>
          </div>
          {manage && (
            <button className="btn btn--primary btn--small" onClick={() => setEditing({ plan: null })}>
              <Icon name="plus" size={15} /> {t('plans.new')}
            </button>
          )}
        </div>
        {plans.length === 0 ? (
          <EmptyState compact icon="zap" title={t('plans.emptyTitle')} body={t('plans.emptyBody')} />
        ) : (
          <ul className="pblist">
            {plans.map((p) => {
              const auto = rhythm.renewal.days > 0 && rhythm.renewal.planId === p.id;
              return (
                <li key={p.id} className="pblist__row">
                  <span className="pblist__icon" data-anchor={p.anchor} aria-hidden="true">
                    <Icon name={ANCHOR_ICON[p.anchor]} size={16} />
                  </span>
                  <div className="pblist__body">
                    <strong>{p.name}</strong>
                    {p.description && <p className="pblist__desc">{p.description}</p>}
                    <p className="pblist__meta">
                      {t('plans.tasksN', { n: p.tasks.length })} · {anchorText.anchor(p.anchor)} · {t('plans.onBoard', { board: boardName(p.boardId) })}
                    </p>
                    {auto && (
                      <span className="schip" data-tone="green">
                        <Icon name="refresh" size={12} /> {t('plans.autoRenewal', { n: rhythm.renewal.days })}
                      </span>
                    )}
                  </div>
                  {manage && (
                    <button className="btn btn--small" onClick={() => setEditing({ plan: p })}>
                      {t('common.edit')}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {plans.some((p) => p.anchor === 'renewal') && !(rhythm.renewal.days > 0) && manage && (
          <p className="pblist__tip">
            <Icon name="repeat" size={14} /> {t('plans.autoTip')}{' '}
            <a
              href="/settings/rhythm"
              onClick={(e) => {
                e.preventDefault();
                navigate('/settings/rhythm');
              }}
            >
              {t('plans.autoTipLink')}
            </a>
          </p>
        )}
      </section>

      {manage && examples.length > 0 && (
        <section className="sheet">
          <h2 className="sheet__title">
            <Icon name="copy" size={18} className="icon--lead" />
            {t('plans.examples')}
          </h2>
          <p className="sheet__hint">{t('plans.examplesHint')}</p>
          <div className="pbexamples">
            {examples.map((ex) => (
              <article key={ex.key} className="pbexample">
                <span className="pblist__icon" data-anchor={ex.anchor} aria-hidden="true">
                  <Icon name={ANCHOR_ICON[ex.anchor]} size={16} />
                </span>
                <h3>{labelOf(ex.name, locale)}</h3>
                <p>{labelOf(ex.description, locale)}</p>
                <p className="pblist__meta">
                  {t('plans.tasksN', { n: ex.steps.length })} · {anchorText.anchor(ex.anchor)}
                </p>
                <button className="btn btn--small" onClick={() => setEditing({ plan: null, draft: draftOf(ex, locale) })}>
                  {t('plans.useExample')}
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
      {editing && <PlanEditor plan={editing.plan} draft={editing.draft} onClose={() => setEditing(null)} onSaved={() => void reload()} />}
    </div>
  );
}
