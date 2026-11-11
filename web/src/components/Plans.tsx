// Plans: a set of dated tasks put on a customer in one click (onboarding,
// renewal prep, a QBR). Admins write them once; anyone who can add tasks
// applies them.
import { useEffect, useRef, useState } from 'react';
import type { TaskBlueprint } from '../../../shared/src/automation';
import type { PlanTemplate } from '../../../shared/src/model';
import { ApiFailure, del, get, patch, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { tasksChanged } from '../lib/shell';
import { useStore } from '../lib/store';
import { todayIso } from '../lib/time';
import { Icon } from './icons';
import { useDismiss } from './Menus';
import { Dialog } from './ui';

export function PlanMenu({ accountId, accountName, onApplied }: { accountId: string; accountName: string; onApplied: () => void }) {
  const { t } = useI18n();
  const { can, toast, canWrite } = useStore();
  const [open, setOpen] = useState(false);
  const [plans, setPlans] = useState<PlanTemplate[] | null>(null);
  const [editing, setEditing] = useState<PlanTemplate | 'new' | null>(null);
  const [start, setStart] = useState(todayIso());
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  const load = () => get<{ plans: PlanTemplate[] }>('/plans').then((r) => setPlans(r.plans), () => setPlans([]));
  useEffect(() => {
    if (open) void load();
  }, [open]);
  if (!canWrite) return null;
  const apply = async (p: PlanTemplate) => {
    setOpen(false);
    try {
      const r = await post<{ tasks: unknown[] }>(`/accounts/${accountId}/plans`, { planId: p.id, start });
      toast(t('plans.applied', { n: r.tasks.length, plan: p.name, account: accountName }));
      tasksChanged();
      onApplied();
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    }
  };
  return (
    <div className="menuwrap" ref={ref}>
      <button className="btn btn--small" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="zap" size={15} />
        {t('plans.button')}
      </button>
      {open && (
        <div className="popmenu filterpop" role="menu" aria-label={t('plans.button')}>
          <label className="field">
            <span className="filterpop__label">{t('plans.start')}</span>
            <input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value || todayIso())} />
          </label>
          {plans === null && <span className="popmenu__note">{t('common.loading')}</span>}
          {plans?.length === 0 && <span className="popmenu__note">{can('org.manage') ? t('plans.noneAdmin') : t('plans.none')}</span>}
          {plans?.map((p) => (
            <div key={p.id} className="viewrow">
              <button role="menuitem" className="popmenu__item" onClick={() => apply(p)}>
                <Icon name="list" size={16} />
                <span className="popmenu__label">{p.name}</span>
                <span className="muted small num">{t('plans.tasksN', { n: p.tasks.length })}</span>
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
            </>
          )}
        </div>
      )}
      {editing && <PlanEditor plan={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function PlanEditor({ plan, onClose }: { plan: PlanTemplate | null; onClose: () => void }) {
  const { t } = useI18n();
  const { boards, toast } = useStore();
  const [name, setName] = useState(plan?.name ?? '');
  const [boardId, setBoardId] = useState(plan?.boardId ?? boards[0]?.id ?? '');
  const [tasks, setTasks] = useState<TaskBlueprint[]>(plan?.tasks ?? [{ title: '', dueInDays: 0, assignee: 'account_owner' }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (i: number, p: Partial<TaskBlueprint>) => setTasks((list) => list.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const ready = name.trim() && boardId && tasks.some((x) => x.title.trim());
  const save = async () => {
    setBusy(true);
    setError('');
    const body = { name: name.trim(), boardId, tasks: tasks.filter((x) => x.title.trim()).map((x) => ({ ...x, title: x.title.trim() })) };
    try {
      if (plan) await patch(`/plans/${plan.id}`, body);
      else await post('/plans', body);
      toast(t('common.saved'));
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
            <button
              className="btn btn--danger"
              style={{ marginRight: 'auto' }}
              onClick={async () => {
                await del(`/plans/${plan.id}`).catch(() => undefined);
                onClose();
              }}
            >
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
      <div className="field">
        <span className="field__label">{t('plans.tasks')}</span>
        <span className="field__hint">{t('plans.tasksHint')}</span>
        <div className="bfields">
          {tasks.map((x, i) => (
            <div key={i} className="planrow">
              <input className="input" value={x.title} maxLength={300} placeholder={t('plans.taskTitle')} aria-label={t('plans.taskTitle')} onChange={(e) => set(i, { title: e.target.value })} />
              <label className="planrow__days">
                <span>+</span>
                <input className="input input--num" type="number" min={0} max={730} value={x.dueInDays} aria-label={t('plans.days')} onChange={(e) => set(i, { dueInDays: Math.max(0, Math.min(730, Number(e.target.value) || 0)) })} />
                <span>{t('plans.days')}</span>
              </label>
              <select className="select" value={x.assignee} aria-label={t('task.assignees')} onChange={(e) => set(i, { assignee: e.target.value as TaskBlueprint['assignee'] })}>
                <option value="account_owner">{t('plans.owner')}</option>
                <option value="none">{t('task.unassigned')}</option>
              </select>
              <button type="button" className="btn btn--quiet btn--icon btn--small" aria-label={t('common.remove')} disabled={tasks.length < 2} onClick={() => setTasks(tasks.filter((_, j) => j !== i))}>
                <Icon name="trash" size={15} />
              </button>
            </div>
          ))}
          {tasks.length < 40 && (
            <button type="button" className="btn btn--small bfields__add" onClick={() => setTasks([...tasks, { title: '', dueInDays: (tasks[tasks.length - 1]?.dueInDays ?? 0) + 7, assignee: 'account_owner' }])}>
              <Icon name="plus" size={15} />
              {t('plans.addTask')}
            </button>
          )}
        </div>
      </div>
      {error && <p className="error-text">{error}</p>}
    </Dialog>
  );
}
