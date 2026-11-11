// The task panel: opens over any screen from ?task=<id>, so a link to a task
// is shareable. Edits save field by field and are merged, never overwritten,
// when someone else saved first.
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { MAX_FILE_MB, MENTION_RE, PRIORITIES, type Comment, type Person, type Task, type TaskDetail } from '../../../shared/src/model';
import { ApiFailure, api, del, get, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { setQuery } from '../lib/router';
import { useStore } from '../lib/store';
import { AccountPicker } from './AccountPicker';
import { saveTask, type TaskChanges } from '../lib/tasks';
import { relativeTime } from '../lib/time';
import { Avatar, Confirm, PeoplePicker } from './ui';

export function TaskPanel({ taskId, onChanged }: { taskId: string; onChanged: () => void }) {
  const { t, words, fmtDate } = useI18n();
  const { boards, people, person, me, canWrite, can, toast } = useStore();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

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

  const close = useCallback(() => setQuery('task', null), []);
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

  const assignable = people.filter((p) => p.seat === 'full' && (p.status === 'active' || p.status === 'invited'));
  const mayDelete = task && editable && (task.createdBy === me.user.id || can('tasks.delete_any'));

  return (
    <>
      <div className="scrim" onClick={close} />
      <aside className="panel" role="dialog" aria-modal="true" aria-label={task?.title ?? t('common.loading')} tabIndex={-1} ref={panel}>
        <div className="panel__head">
          <span className="panel__crumb">{board?.name}</span>
          {mayDelete && (
            <button className="btn btn--quiet btn--small" onClick={() => setConfirmDelete(true)}>
              {t('task.delete')}
            </button>
          )}
          <button className="btn btn--quiet btn--icon" onClick={close} aria-label={t('common.close')}>
            ×
          </button>
        </div>
        {error && <div className="panel__body"><div className="notice notice--error">{error}</div></div>}
        {!task && !error && <div className="panel__body muted">{t('common.loading')}</div>}
        {task && (
          <div className="panel__body">
            <TitleField key={`${task.id}:${task.version}`} value={task.title} disabled={!editable} onSave={(title) => title !== task.title && save({ title })} />
            {notice && <div className="notice" role="status">{notice}</div>}

            <div className="props">
              <span className="props__label">{t('task.status')}</span>
              <select className="select" value={task.status} disabled={!editable} onChange={(e) => save({ status: e.target.value })}>
                {board?.columns.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.name}
                  </option>
                ))}
              </select>
              <span className="props__label">{t('task.assignees')}</span>
              <PeoplePicker label={t('task.assignees')} people={assignable} value={task.assigneeIds} disabled={!editable} onChange={(assigneeIds) => save({ assigneeIds })} />
              <span className="props__label">{t('task.due')}</span>
              <input className="input num" type="date" value={task.dueDate ?? ''} disabled={!editable} onChange={(e) => save({ dueDate: e.target.value || null })} />
              <span className="props__label">{t('task.priority')}</span>
              <select className="select" value={task.priority} disabled={!editable} onChange={(e) => save({ priority: e.target.value as Task['priority'] })}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {t(`task.priority.${p}`)}
                  </option>
                ))}
              </select>
              <span className="props__label">{words.one}</span>
              <AccountPicker value={task.accountId} name={task.accountName} disabled={!editable} onChange={(accountId) => save({ accountId })} />
            </div>

            <Section title={t('task.description')}>
              <BlurInput key={`desc:${task.version}`} multiline value={task.description} placeholder={t('task.descriptionPlaceholder')} disabled={!editable} onSave={(v) => v !== task.description && save({ description: v })} />
            </Section>

            <Subtasks task={task} doneKeys={doneKeys} firstKey={board?.columns[0]?.key ?? 'todo'} doneKey={board?.columns.find((c) => c.done)?.key} editable={editable} reload={load} onChanged={onChanged} />

            <Section title={t('task.files')}>
              <Files task={task} editable={editable} reload={load} />
            </Section>

            <Section title={t('task.comments')}>
              {task.comments.length === 0 && <p className="muted" style={{ margin: 0 }}>{t('task.noComments')}</p>}
              {task.comments.map((c) => (
                <CommentView key={c.id} comment={c} author={person(c.authorId)} canDelete={c.authorId === me.user.id || can('privacy.manage')} onDeleted={load} />
              ))}
              {editable && <Composer people={people.filter((p) => p.status !== 'deleted')} taskId={task.id} onPosted={() => { void load(); onChanged(); }} />}
            </Section>

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
            await del(`/tasks/${task.id}`);
            onChanged();
            close();
          }}
        />
      )}
    </>
  );
}

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section>
      <h3 className="section__head">
        <span>{title}</span>
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
    <Section title={t('task.subtasks')}>
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
  const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  return (
    <>
      {task.files.map((f) => (
        <div className="filerow" key={f.id}>
          <a href={`/api/files/${f.id}`}>{f.name}</a>
          <span className="muted num">{kb(f.size)}</span>
          {editable && (
            <button className="btn btn--quiet btn--small" onClick={async () => { await del(`/files/${f.id}`); await reload(); }}>
              {t('common.delete')}
            </button>
          )}
        </div>
      ))}
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

function renderBody(body: string) {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of body.matchAll(MENTION_RE)) {
    out.push(body.slice(last, m.index));
    out.push(
      <span className="mention" key={m.index}>
        @{m[1]}
      </span>,
    );
    last = (m.index ?? 0) + m[0].length;
  }
  out.push(body.slice(last));
  return out;
}

function CommentView({ comment, author, canDelete, onDeleted }: { comment: Comment; author?: Person; canDelete: boolean; onDeleted: () => void }) {
  const { t } = useI18n();
  return (
    <div className="comment">
      <Avatar person={author} large />
      <div>
        <div className="comment__head">
          <span className="comment__author">{author?.name ?? t('common.unknownUser')}</span>
          <span className="comment__time">{relativeTime(comment.createdAt, t)}</span>
          {canDelete && (
            <button className="btn btn--quiet btn--small" style={{ marginLeft: 'auto' }} onClick={async () => { await del(`/comments/${comment.id}`); onDeleted(); }}>
              {t('common.delete')}
            </button>
          )}
        </div>
        <div className="comment__body">{renderBody(comment.body)}</div>
      </div>
    </div>
  );
}

// Typing @ opens a list of people; picking one inserts "@Name" and remembers
// who it was, so the saved comment carries a real mention.
function Composer({ people, taskId, onPosted }: { people: Person[]; taskId: string; onPosted: () => void }) {
  const { t } = useI18n();
  const { toast } = useStore();
  const [text, setText] = useState('');
  const [query, setQueryText] = useState<string | null>(null);
  const [sel, setSel] = useState(0);
  const [chosen, setChosen] = useState<Person[]>([]);
  const ref = useRef<HTMLTextAreaElement>(null);
  const matches = query === null ? [] : people.filter((p) => p.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())).slice(0, 6);

  function onChange(v: string) {
    setText(v);
    const caret = ref.current?.selectionStart ?? v.length;
    const m = /(^|\s)@([^\s@]{0,30})$/.exec(v.slice(0, caret));
    setQueryText(m ? m[2] : null);
    setSel(0);
  }
  function pick(p: Person) {
    const el = ref.current!;
    const caret = el.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@([^\s@]{0,30})$/, `@${p.name} `);
    const next = before + text.slice(caret);
    setText(next);
    setChosen((c) => (c.some((x) => x.id === p.id) ? c : [...c, p]));
    setQueryText(null);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(before.length, before.length);
    });
  }
  async function submit(e?: FormEvent) {
    e?.preventDefault();
    let body = text.trim();
    if (!body) return;
    for (const p of chosen) body = body.split(`@${p.name}`).join(`@[${p.name}](${p.id})`);
    try {
      await post(`/tasks/${taskId}/comments`, { body });
      setText('');
      setChosen([]);
      onPosted();
    } catch (err) {
      toast(err instanceof ApiFailure ? err.body.message : t('errors.server'), 'error');
    }
  }
  return (
    <form className="composer" onSubmit={submit}>
      {matches.length > 0 && (
        <div className="suggest" role="listbox">
          {matches.map((p, i) => (
            <button type="button" key={p.id} role="option" aria-selected={i === sel} onMouseDown={(e) => { e.preventDefault(); pick(p); }}>
              <Avatar person={p} /> {p.name}
            </button>
          ))}
        </div>
      )}
      <textarea
        ref={ref}
        className="textarea"
        style={{ minHeight: 72 }}
        placeholder={t('task.commentPlaceholder')}
        aria-label={t('task.comments')}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (matches.length) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => (s + 1) % matches.length); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => (s - 1 + matches.length) % matches.length); }
            else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(matches[sel]); }
            else if (e.key === 'Escape') { e.stopPropagation(); setQueryText(null); }
          } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit();
        }}
      />
      <button className="btn btn--primary" style={{ justifySelf: 'end' }} disabled={!text.trim()}>
        {t('task.send')}
      </button>
    </form>
  );
}
