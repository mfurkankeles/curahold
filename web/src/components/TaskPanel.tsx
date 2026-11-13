// The task panel: opens over any screen from ?task=<id>, so a link to a task
// is shareable. Edits save field by field and are merged, never overwritten,
// when someone else saved first.
import { Fragment, useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { MAX_FILE_MB, PRIORITIES, type Repeat, type Task, type TaskDetail } from '../../../shared/src/model';
import { repeatText } from '../pages/BoardPage';
import { ApiFailure, api, del, get, post, put } from '../lib/api';
import { useLive } from '../lib/live';
import { useI18n } from '../lib/i18n';
import { nameIt, navigate, setQuery } from '../lib/router';
import { PanelBack } from './BackBar';
import { useSaver } from '../lib/saver';
import { useStore } from '../lib/store';
import { AccountPicker } from './AccountPicker';
import { saveTask, type TaskChanges } from '../lib/tasks';
import { Confirm, PeoplePicker, useFocusTrap } from './ui';
import { Icon, type IconName } from './icons';
import { doneTarget } from '../lib/tasks';
import { useToggleDone } from './Tick';
import { labelOf } from '../../../shared/src/fields';
import { ChecklistMenu, FollowButton, HistorySection, LinksSection, TaskFieldInput, TimeSection } from './TaskExtras';
import { CommentView, Composer, FileItem } from './Thread';
import { useTrashToast } from '../lib/trash';
import { isPmBoard, PmRows } from './Pm';

/** A board's own field, by what it holds. */
const FIELD_ICON: Record<string, IconName> = { text: 'text', number: 'hash', money: 'coins', date: 'calendar', select: 'list', url: 'link', email: 'mail', person: 'user', checkbox: 'check' };

export function TaskPanel({ taskId, onChanged }: { taskId: string; onChanged: () => void }) {
  const { t, words, fmtDate, locale } = useI18n();
  const { boards, people, person, me, canWrite, can, toast } = useStore();
  const trashed = useTrashToast();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  useFocusTrap(panel);

  const load = useCallback(async () => {
    try {
      setTask((await get<{ task: TaskDetail }>(`/tasks/${taskId}`)).task);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiFailure ? e.body.message : t('errors.server'));
    }
  }, [taskId, t]);

  useEffect(() => {
    setTask(null);
    setNotice(null);
    void load();
  }, [load]);
  // Someone else commented or changed it: show that, unless this person is in the middle of typing here.
  useLive('tasks', () => {
    const at = document.activeElement;
    const typing = !!at && at !== panel.current && !!panel.current?.contains(at) && /^(INPUT|TEXTAREA|SELECT)$/.test(at.tagName);
    if (!typing && !document.querySelector('.dialog')) void load();
  });

  const close = useCallback(() => setQuery('task', null), []);
  // What the way back from another task or record calls this one.
  const taskTitle = task?.title;
  useEffect(() => nameIt(`task:${taskId}`, taskTitle), [taskId, taskTitle]);
  // One panel shows at a time: opening a record from here takes this task's place, and its way back leads here again.
  const openOver = (kind: 'task' | 'record', id: string, replace = false) => {
    const p = new URLSearchParams(location.search);
    p.delete('task');
    p.delete('record');
    p.set(kind, id);
    navigate(`${location.pathname}?${p}`, replace);
  };
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.dialog')) close();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [close]);

  const board = task ? boards.find((b) => b.id === task.boardId) : undefined;
  const doneKeys = new Set(board?.columns.filter((c) => c.done).map((c) => c.key));
  const editable = canWrite;

  async function save(changes: TaskChanges) {
    if (!task) return;
    try {
      const r = await saveTask(task, changes);
      setTask((cur) => (cur ? { ...cur, ...r.task } : cur));
      setNotice(r.conflicts.length ? t('task.conflictLost') : r.merged ? t('task.conflictMerged') : null);
      onChanged();
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
      void load();
    }
  }

  const toggleDone = useToggleDone();
  const target = task ? doneTarget(board, task) : null;
  const [cheer, setCheer] = useState(false);
  const [showStart, setShowStart] = useState(false);
  const assignable = people.filter((p) => p.seat === 'full' && (p.status === 'active' || p.status === 'invited'));
  const mayDelete = task && editable && (task.createdBy === me.user.id || can('tasks.delete_any'));

  return (
    <>
      <div className="scrim" onClick={close} />
      <aside className="panel" role="dialog" aria-modal="true" aria-label={task?.title ?? t('common.loading')} tabIndex={-1} ref={panel}>
        <div className="panel__head">
          <PanelBack up={task?.parent ? { title: task.parent.title, go: () => openOver('task', task.parent!.id, true) } : null} />
          {task && target && editable && (
            <button
              className={`btn btn--small panel__done${target.done ? '' : ' panel__done--reopen'}`}
              data-cheer={cheer || undefined}
              onAnimationEnd={() => setCheer(false)}
              onClick={() => {
                if (target.done) setCheer(true);
                void toggleDone(task, (next) => {
                  setTask((cur) => (cur ? { ...cur, ...next } : cur));
                  onChanged();
                });
              }}
            >
              <Icon name="check" size={15} />
              {target.done ? t('task.complete') : t('task.reopen')}
            </button>
          )}
          <span className="panel__crumb" data-sub={task?.parent ? true : undefined}>{board?.name}</span>
          {task && !task.parentId && <FollowButton task={task} reload={load} />}
          {task && (
            <button
              className="btn btn--quiet btn--icon btn--small"
              title={t('task.copyLink')}
              aria-label={t('task.copyLink')}
              onClick={async () => {
                const url = `${location.origin}${location.pathname}?task=${task.id}`;
                try {
                  await navigator.clipboard.writeText(url);
                  toast(t('task.linkCopied'));
                } catch {
                  toast(url);
                }
              }}
            >
              <Icon name="link" size={16} />
            </button>
          )}
          {mayDelete && (
            <button className="btn btn--quiet btn--icon btn--small" title={t('task.delete')} aria-label={t('task.delete')} onClick={() => setConfirmDelete(true)}>
              <Icon name="trash" size={16} />
            </button>
          )}
          <button className="btn btn--quiet btn--icon btn--small" onClick={close} aria-label={t('common.close')} title={`${t('common.close')} (Esc)`}>
            <Icon name="close" size={16} />
          </button>
        </div>
        {error && <div className="panel__body"><div className="notice notice--error">{error}</div></div>}
        {!task && !error && <div className="panel__body muted">{t('common.loading')}</div>}
        {task && (
          <div className="panel__body">
            <TitleField key={`${task.id}:${task.version}`} value={task.title} disabled={!editable} onSave={(title) => title !== task.title && save({ title })} />
            {notice && <div className="notice" role="status">{notice}</div>}
            {!!task.blockedBy && (
              <div className="notice notice--wait" role="status">
                <Icon name="hourglass" size={16} />
                <span>{t('task.waiting', { n: task.blockedBy, titles: (task.links ?? []).filter((l) => l.kind === 'blocked_by' && !l.done).map((l) => l.title).join(', ') })}</span>
              </div>
            )}

            <div className="props">
              <span className="props__label">
                <Icon name="columns" size={15} className="icon--lead" />
                {t('task.status')}
              </span>
              <select className="select" value={task.status} disabled={!editable} onChange={(e) => save({ status: e.target.value })}>
                {board?.columns.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.name}
                  </option>
                ))}
              </select>
              <span className="props__label">
                <Icon name="people" size={15} className="icon--lead" />
                {t('task.assignees')}
              </span>
              <PeoplePicker label={t('task.assignees')} people={assignable} value={task.assigneeIds} disabled={!editable} onChange={(assigneeIds) => save({ assigneeIds })} />
              <span className="props__label">
                <Icon name="calendar" size={15} className="icon--lead" />
                {t('task.due')}
              </span>
              <span className="daterange">
                {(task.startDate || showStart) && (
                  <>
                    <input className="input num" type="date" value={task.startDate ?? ''} max={task.dueDate ?? undefined} disabled={!editable} aria-label={t('task.start')} title={t('task.start')} onChange={(e) => save({ startDate: e.target.value || null })} />
                    <Icon name="arrowRight" size={14} />
                  </>
                )}
                <input className="input num" type="date" value={task.dueDate ?? ''} min={task.startDate ?? undefined} disabled={!editable} aria-label={t('task.due')} onChange={(e) => save({ dueDate: e.target.value || null })} />
                {!task.startDate && !showStart && editable && !task.parentId && (
                  <button className="linkbtn" onClick={() => setShowStart(true)}>
                    {t('task.addStart')}
                  </button>
                )}
              </span>
              <span className="props__label">
                <Icon name="flag" size={15} className="icon--lead" />
                {t('task.priority')}
              </span>
              <select className="select" value={task.priority} disabled={!editable} onChange={(e) => save({ priority: e.target.value as Task['priority'] })}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {t(`task.priority.${p}`)}
                  </option>
                ))}
              </select>
              <span className="props__label">
                <Icon name="building" size={15} className="icon--lead" />
                {words.one}
              </span>
              <AccountPicker value={task.accountId} name={task.accountName} disabled={!editable} onChange={(accountId) => save({ accountId })} />
              {task.recordId && (
                <>
                  <span className="props__label">
                <Icon name="layout" size={15} className="icon--lead" />
                {t('task.record')}
              </span>
                  <span className="props__record">
                    <button className="linkbtn linkbtn--plain" onClick={() => openOver('record', task.recordId!)}>
                      <Icon name="funnel" size={14} /> {task.recordName ?? t('task.recordGone')}
                    </button>
                    {editable && (
                      <button className="btn btn--quiet btn--icon btn--small" title={t('task.recordUnlink')} aria-label={t('task.recordUnlink')} onClick={() => save({ recordId: null })}>
                        <Icon name="close" size={13} />
                      </button>
                    )}
                  </span>
                </>
              )}
              {(isPmBoard(board) || (task.issueType && task.issueType !== 'task') || task.storyPoints != null || task.epicId || task.sprintId) && <PmRows task={task} editable={editable} onSaved={(next) => { setTask((cur) => (cur ? { ...cur, ...next } : cur)); onChanged(); }} />}
              {!task.parentId && (
                <>
                  <span className="props__label">
                <Icon name="repeat" size={15} className="icon--lead" />
                {t('task.repeat')}
              </span>
                  <RepeatPicker value={task.repeat ?? null} disabled={!editable} onChange={(repeat) => save({ repeat })} />
                </>
              )}
              {!task.parentId &&
                (board?.taskFields ?? []).map((f) => (
                  <Fragment key={f.key}>
                    <span className="props__label">
                      <Icon name={FIELD_ICON[f.type] ?? 'tag'} size={15} className="icon--lead" />
                      {labelOf(f.label, locale)}
                      {f.required === 'done' && (
                        <abbr className="props__req" title={t('task.fieldRequired')}>
                          *
                        </abbr>
                      )}
                    </span>
                    <TaskFieldInput field={f} value={task.fields?.[f.key]} disabled={!editable} people={assignable} onSave={(v) => save({ fields: { [f.key]: v } })} />
                  </Fragment>
                ))}
            </div>
            <div className="mute-row">
              <button
                className="linkbtn"
                onClick={async () => {
                  await post(`/tasks/${task.id}/mute`, { muted: !task.muted });
                  await load();
                }}
              >
                {task.muted ? t('task.unmute') : t('task.mute')}
              </button>
              <span className="field__hint">{task.muted ? t('task.mutedHint') : t('task.muteHint')}</span>
            </div>

            <Section title={t('task.description')} icon="text">
              <BlurInput key={`desc:${task.version}`} multiline value={task.description} placeholder={t('task.descriptionPlaceholder')} disabled={!editable} onSave={(v) => v !== task.description && save({ description: v })} />
            </Section>

            <Subtasks task={task} doneKeys={doneKeys} firstKey={board?.columns[0]?.key ?? 'todo'} doneKey={board?.columns.find((c) => c.done)?.key} editable={editable} reload={load} onChanged={onChanged} />
            {!task.parentId && <LinksSection task={task} editable={editable} reload={() => (void load(), onChanged())} />}
            {!task.parentId && <TimeSection task={task} editable={editable} reload={load} />}

            <Section title={t('task.files')} icon="paperclip">
              <Files task={task} editable={editable} reload={load} />
            </Section>

            {board?.portal?.enabled && task.accountId && (
              <div className="portal-share" data-on={task.portalShared || undefined}>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={!!task.portalShared}
                    disabled={!editable}
                    onChange={async (e) => {
                      try {
                        await put(`/tasks/${task.id}/portal`, { shared: e.target.checked });
                        await load();
                        onChanged();
                      } catch (err) {
                        toast(err instanceof ApiFailure ? err.body.message : t('errors.server'), 'error');
                      }
                    }}
                  />
                  <strong>{t('portal.share.label')}</strong>
                </label>
                <span className="field__hint">
                  {task.portalAuthorName ? t('portal.share.openedBy', { name: task.portalAuthorName }) : task.portalShared ? t('portal.share.on') : t('portal.share.off')}
                </span>
              </div>
            )}

            <Section title={t('task.comments')} icon="comment">
              {task.comments.length === 0 && <p className="muted" style={{ margin: 0 }}>{t('task.noComments')}</p>}
              {task.comments.map((c) => (
                <CommentView
                  key={c.id}
                  comment={c}
                  author={person(c.authorId)}
                  canDelete={(!!c.authorId && c.authorId === me.user.id) || can('privacy.manage')}
                  deleteUrl={`/comments/${c.id}`}
                  onDeleted={() => void load()}
                />
              ))}
              {editable && (
                <TaskComposer
                  task={task}
                  customer={!!task.portalShared && !!board?.portal?.enabled}
                  onPosted={() => {
                    void load();
                    onChanged();
                  }}
                />
              )}
            </Section>

            <HistorySection task={task} board={board} />

            <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
              {t('task.createdBy', { name: person(task.createdBy)?.name ?? t('common.unknownUser'), date: fmtDate(task.createdAt, { day: 'numeric', month: 'long', year: 'numeric' }) })}
            </p>
          </div>
        )}
      </aside>
      {confirmDelete && task && (
        <Confirm
          title={t('task.delete')}
          body={t('task.deleteConfirm', { title: task.title })}
          confirmLabel={t('common.delete')}
          danger
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            trashed(await del(`/tasks/${task.id}`), onChanged);
            onChanged();
            close();
          }}
        />
      )}
    </>
  );
}

function Section({ title, icon, children, action }: { title: string; icon: IconName; children: ReactNode; action?: ReactNode }) {
  return (
    <section>
      <h3 className="section__head">
        <span>
          <Icon name={icon} size={16} className="icon--lead" />
          {title}
        </span>
        {action}
      </h3>
      <div style={{ display: 'grid', gap: 4 }}>{children}</div>
    </section>
  );
}

function TitleField({ value, disabled, onSave }: { value: string; disabled: boolean; onSave: (v: string) => void }) {
  const { t } = useI18n();
  const [v, setV] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [v]);
  return (
    <textarea
      ref={ref}
      className="panel__title"
      rows={1}
      aria-label={t('task.title')}
      value={v}
      maxLength={300}
      disabled={disabled}
      onChange={(e) => setV(e.target.value.replace(/\n/g, ' '))}
      onBlur={() => (v.trim() ? onSave(v.trim()) : setV(value))}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.target as HTMLTextAreaElement).blur();
        }
      }}
    />
  );
}

function BlurInput({ value, onSave, placeholder, multiline, disabled }: { value: string; onSave: (v: string) => void; placeholder: string; multiline?: boolean; disabled?: boolean }) {
  const [v, setV] = useState(value);
  const common = { value: v, placeholder, disabled, onChange: (e: any) => setV(e.target.value), onBlur: () => onSave(v.trim()) };
  return multiline ? <textarea className="textarea" {...common} /> : <input className="input" maxLength={200} {...common} />;
}

function Subtasks({ task, doneKeys, firstKey, doneKey, editable, reload, onChanged }: { task: TaskDetail; doneKeys: Set<string>; firstKey: string; doneKey?: string; editable: boolean; reload: () => Promise<void>; onChanged: () => void }) {
  const { t } = useI18n();
  const { toast } = useStore();
  const [title, setTitle] = useState('');
  async function add(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await post('/tasks', { boardId: task.boardId, parentId: task.id, title: title.trim() });
    setTitle('');
    await reload();
    onChanged();
  }
  async function toggle(s: Task) {
    const done = doneKeys.has(s.status);
    try {
      await saveTask(s, { status: done ? firstKey : doneKey ?? firstKey });
      await reload();
      onChanged();
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    }
  }
  return (
    <Section title={t('task.subtasks')} icon="subtasks" action={editable && !task.parentId ? <ChecklistMenu task={task} reload={reload} /> : undefined}>
      {task.subtasks.map((s) => (
        <div className="subtask" key={s.id} data-done={doneKeys.has(s.status)}>
          <input type="checkbox" className="checkbox" checked={doneKeys.has(s.status)} disabled={!editable || !doneKey} onChange={() => toggle(s)} aria-label={s.title} />
          <button className="rowlink subtask__title" onClick={() => setQuery('task', s.id)}>
            {s.title}
          </button>
        </div>
      ))}
      {editable && (
        <form onSubmit={add} style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <input className="input" placeholder={t('task.addSubtask')} aria-label={t('task.addSubtask')} value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} />
          <button className="btn" disabled={!title.trim()}>
            {t('common.add')}
          </button>
        </form>
      )}
    </Section>
  );
}

function Files({ task, editable, reload }: { task: TaskDetail; editable: boolean; reload: () => Promise<void> }) {
  const { t } = useI18n();
  const { toast } = useStore();
  const save = useSaver();
  const input = useRef<HTMLInputElement>(null);
  async function upload(file: File) {
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      toast(t('errors.file_too_large', { mb: MAX_FILE_MB }), 'error');
      return;
    }
    const form = new FormData();
    form.append('file', file);
    try {
      await api('POST', `/tasks/${task.id}/files`, form);
      await reload();
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    }
  }
  return (
    <>
      {task.files.length > 0 && (
        <div className="comment__files">
          {task.files.map((f) => (
            <FileItem
              key={f.id}
              file={f}
              onDelete={
                editable
                  ? async () => {
                      if (await save(() => del(`/files/${f.id}`), false)) await reload();
                    }
                  : undefined
              }
            />
          ))}
        </div>
      )}
      {editable && (
        <>
          <input ref={input} type="file" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <button className="btn btn--small" style={{ justifySelf: 'start' }} onClick={() => input.current?.click()}>
            {t('task.upload')}
          </button>
        </>
      )}
    </>
  );
}

/** The task's comment box: the shared one, with the portal's choice of an internal note or a reply for the customer. */
function TaskComposer({ task, customer, onPosted }: { task: TaskDetail; customer: boolean; onPosted: () => void }) {
  const { t } = useI18n();
  const { people } = useStore();
  // On a task shared with the customer: an internal note unless a reply for them is chosen.
  const [toCustomer, setToCustomer] = useState(false);
  const reply = customer && toCustomer;
  return (
    <Composer
      people={people.filter((p) => p.status !== 'deleted')}
      uploadUrl={`/tasks/${task.id}/files`}
      placeholder={reply ? t('portal.comment.replyPlaceholder') : t('task.commentPlaceholder')}
      sendLabel={reply ? t('portal.comment.sendReply') : t('task.send')}
      tone={reply ? 'customer' : undefined}
      above={
        customer ? (
          <div className="seg composer__to" role="group" aria-label={t('portal.comment.to')}>
            <button type="button" aria-pressed={!toCustomer} onClick={() => setToCustomer(false)}>
              {t('portal.comment.internal')}
            </button>
            <button type="button" aria-pressed={toCustomer} onClick={() => setToCustomer(true)}>
              {t('portal.comment.reply')}
            </button>
          </div>
        ) : undefined
      }
      onSend={async (body, fileIds) => {
        await post(`/tasks/${task.id}/comments`, { body, fileIds, visibility: reply ? 'customer' : 'internal' });
        onPosted();
      }}
    />
  );
}

const REPEATS: { key: string; value: Repeat | null }[] = [
  { key: 'none', value: null },
  { key: 'day1', value: { every: 1, unit: 'day', from: 'due' } },
  { key: 'week1', value: { every: 1, unit: 'week', from: 'due' } },
  { key: 'week2', value: { every: 2, unit: 'week', from: 'due' } },
  { key: 'month1', value: { every: 1, unit: 'month', from: 'due' } },
  { key: 'month3', value: { every: 3, unit: 'month', from: 'due' } },
  { key: 'month12', value: { every: 12, unit: 'month', from: 'due' } },
];

/** Repeat: none, daily, weekly… and whether the next one counts from the due date or from when it was done. */
/** How often a task comes back (also used by the New task dialog). */
export function RepeatPicker({ value, disabled, onChange }: { value: Repeat | null; disabled: boolean; onChange: (r: Repeat | null) => void }) {
  const { t } = useI18n();
  const current = value ? (REPEATS.find((r) => r.value && r.value.every === value.every && r.value.unit === value.unit)?.key ?? 'custom') : 'none';
  return (
    <div className="repeat-picker">
      <select
        className="select"
        value={current}
        disabled={disabled}
        aria-label={t('task.repeat')}
        onChange={(e) => {
          const pick = REPEATS.find((r) => r.key === e.target.value);
          if (pick) onChange(pick.value ? { ...pick.value, from: value?.from ?? 'due' } : null);
        }}
      >
        {REPEATS.map((r) => (
          <option key={r.key} value={r.key}>
            {t(`repeat.pick.${r.key}` as any)}
          </option>
        ))}
        {current === 'custom' && value && <option value="custom">{repeatText(t, value)}</option>}
      </select>
      {value && (
        <label className="checkbox repeat-picker__from">
          <input type="checkbox" checked={value.from === 'done'} disabled={disabled} onChange={(e) => onChange({ ...value, from: e.target.checked ? 'done' : 'due' })} />
          <span>{t('repeat.fromDone')}</span>
        </label>
      )}
    </div>
  );
}
