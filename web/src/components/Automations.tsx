// Automations, built as sentences: "When … (only for …), then …".
// Every rule can be switched off in one click, run now, and shows what it did.
import { Icon } from './icons';
import { useEffect, useMemo, useState } from 'react';
import { ACCOUNT_TRIGGERS, TRIGGER_TYPES, type Action, type Automation, type AutomationRun, type Condition, type Trigger, type TriggerType } from '../../../shared/src/automation';
import { labelOf } from '../../../shared/src/fields';
import type { MessageKey, Locale } from '../../../shared/src/i18n';
import type { Board } from '../../../shared/src/model';
import { pick, TEMPLATES, TEMPLATE_KEYS } from '../../../shared/src/templates';
import { ApiFailure, del, get, patch, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useStore } from '../lib/store';
import { relativeTime } from '../lib/time';
import { Confirm, Dialog } from './ui';
import { useTrashToast } from '../lib/trash';

type Draft = { name: string; enabled: boolean; trigger: Trigger; conditions: Condition[]; action: Action; preset?: string | null };

const defaultTrigger = (type: TriggerType, dateField?: string): Trigger => {
  switch (type) {
    case 'account_date':
      return { type, field: dateField ?? 'renewal_date', daysBefore: 30 };
    case 'account_every':
      return { type, days: 90 };
    case 'account_inactive':
      return { type, days: 30 };
    case 'task_overdue':
      return { type, days: 1 };
    case 'task_moved':
      return { type, boardId: null, column: 'done' };
    default:
      return { type: 'account_created' };
  }
};

export function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className="switch" disabled={disabled} onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

/** One readable line for a rule, used in lists and in the editor's preview. */
export function useDescribe() {
  const { t, locale, words } = useI18n();
  const { me, boards, person } = useStore();
  const fieldName = (k: string) => (k === 'owner' ? t('auto.cond.owner') : labelOf(me.org.accountFields.find((f) => f.key === k)?.label, locale) || k);
  const boardName = (id: string | null | undefined) => boards.find((b) => b.id === id)?.name ?? t('auto.anyBoard');
  const who = (a: string) => (a.startsWith('user:') ? person(a.slice(5))?.name ?? t('common.unknownUser') : t(`auto.who.${a}` as MessageKey));
  return {
    when: (tr: Trigger) => {
      switch (tr.type) {
        case 'account_date':
          return t('auto.when.account_date.text', { field: fieldName(tr.field), n: tr.daysBefore });
        case 'account_every':
          return t('auto.when.account_every.text', { n: tr.days });
        case 'account_inactive':
          return t('auto.when.account_inactive.text', { n: tr.days });
        case 'task_overdue':
          return t('auto.when.task_overdue.text', { n: tr.days });
        case 'task_moved': {
          const b = boards.find((x) => x.id === tr.boardId);
          const col = b?.columns.find((c) => c.key === tr.column)?.name ?? tr.column;
          return t('auto.when.task_moved.text', { column: col, board: boardName(tr.boardId) });
        }
        default:
          return t('auto.when.account_created.text');
      }
    },
    then: (a: Action) =>
      a.type === 'notify'
        ? t('auto.then.notify.text', { who: a.to.map(who).join(', ') })
        : t('auto.then.create.text', {
            n: a.tasks.length,
            title: (a.tasks[0]?.title ?? '').replace(/\{account_name\}/g, `‹${words.one}›`),
            board: boardName(a.boardId),
            who: who(a.tasks[0]?.assignee ?? 'none'),
          }),
    fieldName,
  };
}

export function AutomationList() {
  const { t } = useI18n();
  const { can, toast } = useStore();
  const trashed = useTrashToast();
  const describe = useDescribe();
  const [list, setList] = useState<Automation[] | null>(null);
  const [editing, setEditing] = useState<Automation | 'new' | null>(null);
  const [history, setHistory] = useState<Automation | null>(null);
  const [removing, setRemoving] = useState<Automation | null>(null);
  const manage = can('automations.manage');
  const load = async () => setList((await get<{ automations: Automation[] }>('/automations')).automations);
  useEffect(() => {
    void load();
  }, []);

  const toggle = async (a: Automation, enabled: boolean) => {
    setList((l) => l?.map((x) => (x.id === a.id ? { ...x, enabled } : x)) ?? l);
    try {
      await patch(`/automations/${a.id}`, { enabled });
      toast(enabled ? t('auto.switchedOn', { name: a.name }) : t('auto.paused', { name: a.name }));
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
      void load();
    }
  };
  const runNow = async (a: Automation) => {
    const r = await post<{ fired: number }>(`/automations/${a.id}/run`, {});
    toast(r.fired ? t('auto.ranN', { n: r.fired }) : t('auto.ranNone'));
    void load();
  };

  if (!list) return <div className="muted">{t('common.loading')}</div>;
  return (
    <div className="rules">
      <div className="section__head">
        <span>{t('auto.count', { n: list.filter((a) => a.enabled).length, total: list.length })}</span>
        {manage && (
          <button className="btn btn--primary btn--small" onClick={() => setEditing('new')}>
            <Icon name="plus" size={16} />
            {t('auto.new')}
          </button>
        )}
      </div>
      {list.length === 0 && (
        <div className="empty sheet">
          <p>{t('auto.empty')}</p>
          {manage && (
            <button className="btn btn--primary" onClick={() => setEditing('new')}>
              <Icon name="plus" size={16} />
              {t('auto.new')}
            </button>
          )}
        </div>
      )}
      {list.map((a) => (
        <div className="rule" key={a.id} data-on={a.enabled ? 'true' : 'false'}>
          <Switch on={a.enabled} disabled={!manage} label={t('auto.toggle', { name: a.name })} onChange={(v) => toggle(a, v)} />
          <div className="rule__body">
            <strong>{a.name}</strong>
            <p className="rule__sentence">
              <span className="rule__when">{describe.when(a.trigger)}</span>
              {a.conditions.length > 0 && <span className="muted"> · {t('auto.onlyIfN', { n: a.conditions.length })}</span>}
              <span className="rule__arrow" aria-hidden="true">
                {' → '}
              </span>
              <span>{describe.then(a.action)}</span>
            </p>
            <p className="muted rule__stats">
              {a.runs30d ? t('auto.runs30', { n: a.runs30d }) : t('auto.neverRan')}
              {a.lastRunAt ? ` · ${t('auto.lastRun', { when: relativeTime(a.lastRunAt, t) })}` : ''}
            </p>
          </div>
          {manage && (
            <div className="inline-actions">
              {ACCOUNT_TRIGGERS.includes(a.trigger.type) && a.trigger.type !== 'account_created' || a.trigger.type === 'task_overdue' ? (
                <button className="btn btn--small btn--quiet" onClick={() => runNow(a)}>
                  {t('auto.runNow')}
                </button>
              ) : null}
              <button className="btn btn--small btn--quiet" onClick={() => setHistory(a)}>
                {t('auto.history')}
              </button>
              <button className="btn btn--small" onClick={() => setEditing(a)}>
                {t('common.edit')}
              </button>
              <button className="btn btn--small btn--quiet" aria-label={t('common.delete')} onClick={() => setRemoving(a)}>
                ✕
              </button>
            </div>
          )}
        </div>
      ))}
      {editing && (
        <RuleEditor
          rule={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
      {history && <RunHistory rule={history} onClose={() => setHistory(null)} />}
      {removing && (
        <Confirm
          title={t('auto.deleteTitle', { name: removing.name })}
          body={t('auto.deleteBody')}
          confirmLabel={t('common.delete')}
          danger
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            trashed(await del(`/automations/${removing.id}`), load);
            setRemoving(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function RunHistory({ rule, onClose }: { rule: Automation; onClose: () => void }) {
  const { t, fmtDate } = useI18n();
  const [runs, setRuns] = useState<AutomationRun[] | null>(null);
  useEffect(() => {
    void get<{ runs: AutomationRun[] }>(`/automations/${rule.id}/runs`).then((r) => setRuns(r.runs));
  }, [rule.id]);
  return (
    <Dialog title={t('auto.historyTitle', { name: rule.name })} onClose={onClose}>
      {!runs ? (
        <p className="muted">{t('common.loading')}</p>
      ) : runs.length === 0 ? (
        <p className="muted">{t('auto.neverRan')}</p>
      ) : (
        <ul className="runs">
          {runs.map((r) => (
            <li key={r.key}>
              <span className="muted num">{fmtDate(r.at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              <span>
                {r.result.error
                  ? t('auto.run.error')
                  : r.result.tasks
                    ? t('auto.run.tasks', { n: r.result.tasks.length })
                    : t('auto.run.notified', { n: r.result.notified ?? 0 })}
              </span>
              {r.result.account && (
                <a href={`/accounts/${r.result.account}`} className="rowlink">
                  {t('auto.run.account')}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

function presetDrafts(locale: Locale, boards: Board[]): { key: string; template: string; draft: Draft }[] {
  const out: { key: string; template: string; draft: Draft }[] = [];
  const firstBoard = boards[0]?.id ?? '';
  for (const tk of TEMPLATE_KEYS) {
    for (const p of TEMPLATES[tk].automations) {
      const boardFor = (key: string) => {
        const name = pick(TEMPLATES[tk].boards.find((b) => b.key === key)?.name, locale);
        return boards.find((b) => b.name === name)?.id ?? firstBoard;
      };
      const action: Action =
        p.action.type === 'notify'
          ? { type: 'notify', to: p.action.to, message: pick(p.action.message, locale) }
          : {
              type: 'create_tasks',
              boardId: boardFor(p.action.board),
              tasks: p.action.tasks.map((x) => ({ title: pick(x.title, locale), dueInDays: x.dueInDays, assignee: x.assignee, subtasks: (x.subtasks ?? []).map((s) => pick(s, locale)) })),
            };
      const trigger = p.trigger.type === 'task_moved' ? { ...p.trigger, boardId: p.trigger.boardId ? boardFor(p.trigger.boardId) : null } : p.trigger;
      if (out.some((o) => o.key === p.key && JSON.stringify(o.draft.trigger) === JSON.stringify(trigger))) continue;
      out.push({ key: `${tk}:${p.key}`, template: pick(TEMPLATES[tk].name, locale), draft: { name: pick(p.name, locale), enabled: true, trigger, conditions: p.conditions ?? [], action, preset: p.key } });
    }
  }
  return out;
}

export function RuleEditor({ rule, onClose, onSaved }: { rule: Automation | null; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const { t, locale } = useI18n();
  const { me, boards, people, toast } = useStore();
  const describe = useDescribe();
  const fields = me.org.accountFields;
  const dateFields = fields.filter((f) => f.type === 'date');
  const presets = useMemo(() => presetDrafts(locale, boards), [locale, boards]);
  const [draft, setDraft] = useState<Draft | null>(
    rule ? { name: rule.name, enabled: rule.enabled, trigger: rule.trigger, conditions: rule.conditions, action: rule.action } : null,
  );
  const [preview, setPreview] = useState<{ count: number | null; sample: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const blank = (): Draft => ({
    name: '',
    enabled: true,
    trigger: defaultTrigger(dateFields.length ? 'account_date' : 'task_overdue', dateFields[0]?.key),
    conditions: [],
    action: { type: 'create_tasks', boardId: boards[0]?.id ?? '', tasks: [{ title: '', dueInDays: 3, assignee: 'account_owner', subtasks: [] }] },
  });

  // Live preview: how many accounts / tasks this would act on today.
  useEffect(() => {
    if (!draft) return;
    const tr = draft.trigger;
    if (tr.type === 'account_created' || tr.type === 'task_moved') {
      setPreview(null);
      return;
    }
    const id = setTimeout(() => {
      post<{ count: number | null; sample: string[] }>('/automations/preview', { trigger: tr, conditions: draft.conditions.filter((c) => c.field) })
        .then(setPreview)
        .catch(() => setPreview(null));
    }, 300);
    return () => clearTimeout(id);
  }, [draft]);

  if (!draft) {
    return (
      <Dialog title={t('auto.new')} onClose={onClose}>
        <div className="preset-list">
          <button className="preset" onClick={() => setDraft(blank())}>
            <strong>{t('auto.blank')}</strong>
            <span className="muted">{t('auto.blankHint')}</span>
          </button>
          {presets.map((p) => (
            <button key={p.key} className="preset" onClick={() => setDraft({ ...p.draft })}>
              <strong>{p.draft.name}</strong>
              <span className="muted">
                {p.template} · {describe.when(p.draft.trigger)}
              </span>
            </button>
          ))}
        </div>
      </Dialog>
    );
  }

  const set = (d: Partial<Draft>) => setDraft({ ...draft, ...d });
  const tr = draft.trigger;
  const setTr = (x: Partial<Trigger>) => set({ trigger: { ...tr, ...x } as Trigger });
  const accountBased = ACCOUNT_TRIGGERS.includes(tr.type);
  const act = draft.action;
  const num = (v: string, min = 0) => Math.max(min, Math.min(3650, Math.round(Number(v) || 0)));
  const moveBoard = tr.type === 'task_moved' ? boards.find((b) => b.id === tr.boardId) : undefined;
  const allColumns = [...new Map(boards.flatMap((b) => b.columns).map((c) => [c.key, c])).values()];

  const save = async () => {
    setBusy(true);
    setError('');
    const body = { ...draft, name: draft.name.trim() || describe.when(draft.trigger).slice(0, 120), conditions: draft.conditions.filter((c) => c.field) };
    try {
      if (rule) await patch(`/automations/${rule.id}`, body);
      else await post('/automations', body);
      toast(t('common.saved'));
      await onSaved();
    } catch (e) {
      setError(e instanceof ApiFailure ? e.body.message : t('errors.server'));
    } finally {
      setBusy(false);
    }
  };

  const assigneeSelect = (value: string, onChange: (v: string) => void) => (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)} aria-label={t('auto.assignee')}>
      {accountBased && <option value="account_owner">{t('auto.who.account_owner')}</option>}
      {!accountBased && <option value="assignees">{t('auto.who.assignees')}</option>}
      <option value="none">{t('auto.who.none')}</option>
      {people
        .filter((p) => p.status === 'active' && p.seat === 'full')
        .map((p) => (
          <option key={p.id} value={`user:${p.id}`}>
            {p.name}
          </option>
        ))}
    </select>
  );

  return (
    <Dialog
      title={rule ? t('auto.edit') : t('auto.new')}
      onClose={onClose}
      wide
      footer={
        <>
          <label className="checkbox" style={{ marginRight: 'auto' }}>
            <input type="checkbox" checked={draft.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
            <span>{t('auto.enabled')}</span>
          </label>
          <button className="btn btn--quiet" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn--primary" disabled={busy || (act.type === 'create_tasks' && (!act.boardId || act.tasks.some((x) => !x.title.trim()))) || (act.type === 'notify' && (!act.to.length || !act.message.trim()))} onClick={save}>
            {busy ? t('common.saving') : t('common.save')}
          </button>
        </>
      }
    >
      <div className="rule-editor">
        <label className="field">
          <span className="field__label">{t('auto.name')}</span>
          <input className="input" value={draft.name} placeholder={describe.when(tr)} onChange={(e) => set({ name: e.target.value })} maxLength={120} />
        </label>

        <section className="clause" data-kind="when">
          <h4 className="clause__label">{t('auto.when')}</h4>
          <select className="select" value={tr.type} onChange={(e) => set({ trigger: defaultTrigger(e.target.value as TriggerType, dateFields[0]?.key) })}>
            {TRIGGER_TYPES.filter((x) => x !== 'account_date' || dateFields.length).map((x) => (
              <option key={x} value={x}>
                {t(`auto.when.${x}` as MessageKey)}
              </option>
            ))}
          </select>
          <div className="clause__params">
            {tr.type === 'account_date' && (
              <>
                <select className="select" value={tr.field} onChange={(e) => setTr({ field: e.target.value })} aria-label={t('auto.dateField')}>
                  {dateFields.map((f) => (
                    <option key={f.key} value={f.key}>
                      {labelOf(f.label, locale)}
                    </option>
                  ))}
                </select>
                <input className="input input--num" type="number" min={0} value={tr.daysBefore} onChange={(e) => setTr({ daysBefore: num(e.target.value) })} aria-label={t('auto.days')} />
                <span>{t('auto.daysBefore')}</span>
              </>
            )}
            {(tr.type === 'account_every' || tr.type === 'account_inactive' || tr.type === 'task_overdue') && (
              <>
                <input className="input input--num" type="number" min={tr.type === 'task_overdue' ? 0 : 1} value={tr.days} onChange={(e) => setTr({ days: num(e.target.value, tr.type === 'task_overdue' ? 0 : 1) })} aria-label={t('auto.days')} />
                <span>{t(`auto.unit.${tr.type}` as MessageKey)}</span>
              </>
            )}
            {tr.type === 'task_moved' && (
              <>
                <select className="select" value={tr.boardId ?? ''} onChange={(e) => setTr({ boardId: e.target.value || null })} aria-label={t('auto.board')}>
                  <option value="">{t('auto.anyBoard')}</option>
                  {boards.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <select className="select" value={tr.column} onChange={(e) => setTr({ column: e.target.value })} aria-label={t('auto.column')}>
                  {(moveBoard?.columns ?? allColumns).map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
        </section>

        <section className="clause" data-kind="if">
          <h4 className="clause__label">
            {t('auto.onlyIf')} <span className="muted">({t('common.optional')})</span>
          </h4>
          {draft.conditions.map((c, i) => {
            const f = fields.find((x) => x.key === c.field);
            const upd = (x: Partial<Condition>) => set({ conditions: draft.conditions.map((y, j) => (j === i ? { ...y, ...x } : y)) });
            return (
              <div className="clause__params" key={i}>
                <select className="select" value={c.field} onChange={(e) => upd({ field: e.target.value, value: '' })} aria-label={t('auto.cond.field')}>
                  <option value="owner">{t('auto.cond.owner')}</option>
                  {fields.map((x) => (
                    <option key={x.key} value={x.key}>
                      {labelOf(x.label, locale)}
                    </option>
                  ))}
                </select>
                <select className="select" value={c.op} onChange={(e) => upd({ op: e.target.value as Condition['op'] })} aria-label={t('auto.cond.op')}>
                  {(['eq', 'neq', ...(f && ['number', 'money', 'date'].includes(f.type) ? ['gt', 'lt'] : []), 'empty', 'not_empty'] as Condition['op'][]).map((op) => (
                    <option key={op} value={op}>
                      {t(`auto.op.${op}` as MessageKey)}
                    </option>
                  ))}
                </select>
                {!['empty', 'not_empty'].includes(c.op) &&
                  (c.field === 'owner' ? (
                    <select className="select" value={String(c.value ?? '')} onChange={(e) => upd({ value: e.target.value })} aria-label={t('auto.cond.value')}>
                      <option value="" />
                      {people.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  ) : f?.type === 'select' ? (
                    <select className="select" value={String(c.value ?? '')} onChange={(e) => upd({ value: e.target.value })} aria-label={t('auto.cond.value')}>
                      <option value="" />
                      {(f.options ?? []).map((o) => (
                        <option key={o.key} value={o.key}>
                          {labelOf(o.label, locale)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input className="input" type={f?.type === 'date' ? 'date' : f && ['number', 'money'].includes(f.type) ? 'number' : 'text'} value={String(c.value ?? '')} onChange={(e) => upd({ value: f && ['number', 'money'].includes(f.type) ? Number(e.target.value) : e.target.value })} aria-label={t('auto.cond.value')} />
                  ))}
                <button className="btn btn--quiet btn--small" aria-label={t('common.remove')} onClick={() => set({ conditions: draft.conditions.filter((_, j) => j !== i) })}>
                  ✕
                </button>
              </div>
            );
          })}
          <button className="btn btn--quiet btn--small" onClick={() => set({ conditions: [...draft.conditions, { field: fields[0]?.key ?? 'owner', op: 'eq', value: '' }] })}>
            {t('auto.addCondition')}
          </button>
        </section>

        <section className="clause" data-kind="then">
          <h4 className="clause__label">{t('auto.then')}</h4>
          <div className="seg">
            <button type="button" aria-pressed={act.type === 'create_tasks'} onClick={() => set({ action: { type: 'create_tasks', boardId: boards[0]?.id ?? '', tasks: [{ title: '', dueInDays: 3, assignee: accountBased ? 'account_owner' : 'assignees', subtasks: [] }] } })}>
              {t('auto.then.create')}
            </button>
            <button type="button" aria-pressed={act.type === 'notify'} onClick={() => set({ action: { type: 'notify', to: [accountBased ? 'account_owner' : 'assignees'], message: '' } })}>
              {t('auto.then.notify')}
            </button>
          </div>
          {act.type === 'create_tasks' ? (
            <>
              <div className="clause__params">
                <span>{t('auto.onBoard')}</span>
                <select className="select" value={act.boardId} onChange={(e) => set({ action: { ...act, boardId: e.target.value } })} aria-label={t('auto.board')}>
                  {boards.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              {act.tasks.map((task, i) => {
                const upd = (x: Partial<typeof task>) => set({ action: { ...act, tasks: act.tasks.map((y, j) => (j === i ? { ...y, ...x } : y)) } });
                return (
                  <div className="blueprint" key={i}>
                    <input className="input" value={task.title} placeholder={t('auto.taskTitle')} onChange={(e) => upd({ title: e.target.value })} aria-label={t('auto.taskTitle')} />
                    {task.title.includes('{account_name}') && <span className="field__hint">{t('auto.tokenHint')}</span>}
                    {accountBased && !task.title.includes('{account_name}') && (
                      <button type="button" className="btn btn--quiet btn--small" onClick={() => upd({ title: `${task.title}${task.title ? ' ' : ''}{account_name}` })}>
                        {t('auto.insertAccount')}
                      </button>
                    )}
                    <div className="clause__params">
                      <span>{t('auto.dueIn')}</span>
                      <input className="input input--num" type="number" min={0} value={task.dueInDays} onChange={(e) => upd({ dueInDays: num(e.target.value) })} aria-label={t('auto.days')} />
                      <span>{t('auto.daysLater')}</span>
                      <span>{t('auto.assignTo')}</span>
                      {assigneeSelect(task.assignee, (v) => upd({ assignee: v as any }))}
                      {act.tasks.length > 1 && (
                        <button className="btn btn--quiet btn--small" aria-label={t('common.remove')} onClick={() => set({ action: { ...act, tasks: act.tasks.filter((_, j) => j !== i) } })}>
                          ✕
                        </button>
                      )}
                    </div>
                    <textarea className="textarea" rows={2} value={(task.subtasks ?? []).join('\n')} placeholder={t('auto.subtasks')} aria-label={t('auto.subtasks')} onChange={(e) => upd({ subtasks: e.target.value.split('\n').map((s) => s.trimStart()).filter((s, k, arr) => s || k < arr.length - 1).slice(0, 20) })} />
                  </div>
                );
              })}
              {act.tasks.length < 10 && (
                <button className="btn btn--quiet btn--small" onClick={() => set({ action: { ...act, tasks: [...act.tasks, { title: '', dueInDays: 7, assignee: act.tasks[0]?.assignee ?? 'none', subtasks: [] }] } })}>
                  {t('auto.addTask')}
                </button>
              )}
            </>
          ) : (
            <>
              <div className="clause__params clause__params--wrap">
                {(['account_owner', 'assignees', 'team_lead', 'admins'] as const)
                  .filter((w) => (w === 'account_owner' ? true : w === 'assignees' ? !accountBased : true))
                  .map((w) => (
                    <label key={w} className="checkbox">
                      <input type="checkbox" checked={act.to.includes(w)} onChange={(e) => set({ action: { ...act, to: e.target.checked ? [...act.to, w] : act.to.filter((x) => x !== w) } })} />
                      <span>{t(`auto.who.${w}` as MessageKey)}</span>
                    </label>
                  ))}
              </div>
              <textarea className="textarea" rows={2} value={act.message} placeholder={t('auto.message')} aria-label={t('auto.message')} onChange={(e) => set({ action: { ...act, message: e.target.value } })} maxLength={500} />
            </>
          )}
        </section>

        <div className="rule-preview" aria-live="polite">
          <strong>{t('auto.inPlainWords')}</strong>
          <p>
            {describe.when(tr)} → {describe.then(act)}
          </p>
          {preview?.count != null && (
            <p className={preview.count ? '' : 'muted'}>
              {preview.count
                ? t('auto.wouldAct', { n: preview.count, list: preview.sample.join(', ') + (preview.count > preview.sample.length ? '…' : '') })
                : t('auto.wouldActNone')}
            </p>
          )}
          {(tr.type === 'account_created' || tr.type === 'task_moved') && <p className="muted">{t('auto.eventHint')}</p>}
          <p className="muted">{t('auto.onceHint')}</p>
        </div>
        {error && <p className="error-text">{error}</p>}
      </div>
    </Dialog>
  );
}
