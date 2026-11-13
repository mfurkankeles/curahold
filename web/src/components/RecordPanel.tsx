// A record opened on its own — an opportunity, an agreement, a contact — over
// any screen, from ?record=<id> (so a link to it can be shared). It shows
// what the record says, the tasks that belong to it (with a button for a new
// one and for a whole playbook), its files, and its thread of comments.
// Editing the fields happens in the same dialog the lists use.
import { useCallback, useEffect, useRef, useState } from 'react';
import { labelOf } from '../../../shared/src/fields';
import type { PlanTemplate, Task } from '../../../shared/src/model';
import { typeLabel, type RecordDetail, type RecordType } from '../../../shared/src/records';
import { useFieldFormat } from '../pages/Accounts';
import { ApiFailure, get, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useLive } from '../lib/live';
import { useMoney } from '../lib/money';
import { nameIt, navigate, setQuery } from '../lib/router';
import { PanelBack } from './BackBar';
import { useShell } from '../lib/shell';
import { useStore } from '../lib/store';
import { dueState } from '../lib/time';
import { Icon } from './icons';
import { useRecordTypes } from './AccountFields';
import { FavoriteButton } from './Favorites';
import { useAnchorText } from './Plans';
import { OpenIn, RecordDialog } from './Records';
import { CommentView, Composer, FileItem, postRecordComment } from './Thread';
import { Avatar, Avatars, useFocusTrap } from './ui';

export function RecordPanel({ recordId, onChanged }: { recordId: string; onChanged: () => void }) {
  const { t, locale, fmtDate, words } = useI18n();
  const { person, people, me, canWrite, can, toast } = useStore();
  const shell = useShell();
  const fmt = useFieldFormat();
  const money = useMoney();
  const { types, load: loadTypes } = useRecordTypes();
  const [rec, setRec] = useState<RecordDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [plans, setPlans] = useState<PlanTemplate[] | null>(null);
  const anchorText = useAnchorText();
  const [planId, setPlanId] = useState('');
  const panel = useRef<HTMLDivElement>(null);
  useFocusTrap(panel);

  const load = useCallback(async () => {
    try {
      setRec((await get<{ record: RecordDetail }>(`/records/${recordId}?full=1`)).record);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiFailure ? e.body.message : t('errors.server'));
    }
  }, [recordId, t]);
  useEffect(() => {
    setRec(null);
    void load();
  }, [load]);
  // A new comment or task from someone else shows up, unless this person is typing here.
  useLive('records', () => {
    const at = document.activeElement;
    if (!(at && panel.current?.contains(at) && /^(INPUT|TEXTAREA|SELECT)$/.test(at.tagName)) && !document.querySelector('.dialog')) void load();
  });
  useLive('tasks', () => void load());

  const close = useCallback(() => setQuery('record', null), []);
  const recName = rec?.name;
  useEffect(() => nameIt(`record:${recordId}`, recName), [recordId, recName]);
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

  const type: RecordType | undefined = types?.find((x) => x.id === rec?.typeId);
  useEffect(() => {
    if (canWrite && rec?.accountId) void get<{ plans: PlanTemplate[] }>('/plans').then((r) => setPlans(r.plans), () => setPlans([]));
  }, [canWrite, rec?.accountId]);

  const applyPlan = async () => {
    if (!rec || !planId) return;
    try {
      const r = await post<{ tasks: Task[] }>(`/records/${rec.id}/plans`, { planId });
      toast(t('recordPanel.planApplied', { n: r.tasks.length }), 'info', r.tasks[0] ? { label: t('quick.open'), run: () => setQuery('task', r.tasks[0].id) } : undefined);
      setPlanId('');
      await load();
      onChanged();
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    }
  };

  const newTask = () => {
    if (!rec) return;
    shell.quickAdd({ accountId: rec.accountId, accountName: rec.accountName ?? null, recordId: rec.id, recordName: rec.name, assigneeIds: rec.ownerId ? [rec.ownerId] : [] });
  };

  const shown = type ? type.fields.filter((f) => !(type.kind === 'contact' && (f.key === 'first_name' || f.key === 'last_name'))) : [];
  const ownFiles = rec?.files.filter((f) => !f.commentId) ?? [];
  // Open work first, then what was finished in the last ninety days (struck through).
  const tasks = rec?.tasks ?? [];
  const openCount = tasks.filter((x) => !x.done).length;

  return (
    <>
      <div className="scrim" onClick={close} />
      <aside className="panel recpanel" role="dialog" aria-modal="true" aria-label={rec?.name ?? t('common.loading')} tabIndex={-1} ref={panel}>
        <header className="panel__head">
          <PanelBack />
          {type && <span className="recpanel__type">{typeLabel(type, locale, false)}</span>}
          <span className="topbar__spacer" />
          {rec && canWrite && type && (
            <button className="btn btn--small" onClick={() => setEditing(true)}>
              <Icon name="edit" size={14} /> {t('common.edit')}
            </button>
          )}
          {rec && <FavoriteButton kind="record" id={rec.id} name={rec.name} to={`/records/${type?.key ?? ''}?record=${rec.id}`} />}
          <button
            className="btn btn--quiet btn--icon"
            aria-label={t('recordPanel.copyLink')}
            title={t('recordPanel.copyLink')}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(location.href);
                toast(t('recordPanel.linkCopied'));
              } catch {
                /* the address bar has it */
              }
            }}
          >
            <Icon name="link" size={16} />
          </button>
          <button className="btn btn--quiet btn--icon" aria-label={t('common.close')} onClick={close}>
            <Icon name="close" size={18} />
          </button>
        </header>
        {error ? (
          <div className="panel__body">
            <p className="field__hint">{error}</p>
          </div>
        ) : !rec || !type ? (
          <div className="panel__body">
            <div className="pane__wait" style={{ height: 160 }} />
          </div>
        ) : (
          <div className="panel__body">
            <h2 className="recpanel__name">{rec.name}</h2>
            <div className="recpanel__meta">
              {rec.accountId && (
                <a
                  href={`/accounts/${rec.accountId}`}
                  onClick={(e) => {
                    e.preventDefault();
                    close();
                    navigate(`/accounts/${rec.accountId}`);
                  }}
                >
                  <Icon name="building" size={14} /> {rec.accountName ?? words.one}
                </a>
              )}
              {rec.ownerId && (
                <span className="owner">
                  <Avatar person={person(rec.ownerId)} /> {person(rec.ownerId)?.name}
                </span>
              )}
              {money.multi && <span className="badge">{rec.currency ?? money.base}</span>}
            </div>
            <OpenIn links={rec.links} />

            <dl className="recpanel__fields">
              {shown.map((f) => {
                const v = rec.fields[f.key];
                const empty = v === null || v === undefined || v === '';
                const text = fmt(f, v, rec.currency);
                return (
                  <div key={f.key}>
                    <dt>{labelOf(f.label, locale)}</dt>
                    <dd>
                      {empty ? (
                        <span className="muted">—</span>
                      ) : f.type === 'url' ? (
                        <a href={String(v)} target="_blank" rel="noreferrer noopener">
                          {text}
                        </a>
                      ) : f.type === 'email' ? (
                        <a href={`mailto:${v}`}>{text}</a>
                      ) : f.type === 'select' ? (
                        <span className="optchip" data-color={f.options?.find((o) => o.key === v)?.color}>
                          {text}
                        </span>
                      ) : (
                        text
                      )}
                      {f.type === 'money' && !empty && rec.currency && rec.currency !== money.base && <span className="recpanel__conv muted"> ≈ {money.format(money.toBase(Number(v), rec.currency))}</span>}
                    </dd>
                  </div>
                );
              })}
            </dl>

            <section className="recpanel__section">
              <h3 className="section__head">
                <span>
                  <Icon name="checkCircle" size={16} className="icon--lead" />
                  {t('recordPanel.tasks', { n: openCount })}
                </span>
                {canWrite && (
                  <button className="btn btn--small" onClick={newTask}>
                    <Icon name="plus" size={14} /> {t('recordPanel.newTask')}
                  </button>
                )}
              </h3>
              {tasks.length === 0 && <p className="muted" style={{ margin: 0 }}>{t('recordPanel.noTasks')}</p>}
              <ul className="recpanel__tasks">
                {tasks.map((x) => {
                  const state = dueState(x.dueDate, !!x.done);
                  return (
                    <li key={x.id} data-done={x.done || undefined}>
                      <button className="recpanel__task" onClick={() => setQuery('task', x.id)}>
                        <span className="recpanel__tasktitle">{x.title}</span>
                        <span className="recpanel__taskmeta">
                          {x.dueDate && (
                            <span className={`due due--${state}`}>
                              {fmtDate(x.dueDate, { day: 'numeric', month: 'short' })}
                            </span>
                          )}
                          <Avatars people={x.assigneeIds.map((id) => person(id))} />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {canWrite && rec.accountId && plans && plans.length > 0 && (
                <div className="recpanel__plan">
                  <select className="select" value={planId} aria-label={t('recordPanel.playbook')} onChange={(e) => setPlanId(e.target.value)}>
                    <option value="">{t('recordPanel.playbookPick')}</option>
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {t('recordPanel.steps', { n: p.tasks.length })} · {anchorText.anchor(p.anchor)}
                      </option>
                    ))}
                  </select>
                  <button className="btn btn--small" disabled={!planId} onClick={applyPlan}>
                    {t('recordPanel.apply')}
                  </button>
                </div>
              )}
            </section>

            {ownFiles.length > 0 && (
              <section className="recpanel__section">
                <h3 className="section__head">
                  <span>
                    <Icon name="paperclip" size={16} className="icon--lead" />
                    {t('task.files')}
                  </span>
                </h3>
                <div className="comment__files">
                  {ownFiles.map((f) => (
                    <FileItem key={f.id} file={f} />
                  ))}
                </div>
              </section>
            )}

            <section className="recpanel__section">
              <h3 className="section__head">
                <span>
                  <Icon name="comment" size={16} className="icon--lead" />
                  {t('task.comments')}
                </span>
              </h3>
              {rec.comments.length === 0 && <p className="muted" style={{ margin: 0 }}>{t('recordPanel.noComments')}</p>}
              {rec.comments.map((c) => (
                <CommentView
                  key={c.id}
                  comment={c}
                  author={person(c.authorId)}
                  canDelete={(!!c.authorId && c.authorId === me.user.id) || can('privacy.manage')}
                  deleteUrl={`/record-comments/${c.id}`}
                  onDeleted={() => void load()}
                />
              ))}
              {canWrite && (
                <Composer
                  people={people.filter((p) => p.status !== 'deleted')}
                  uploadUrl={`/records/${rec.id}/files`}
                  placeholder={t('recordPanel.commentPlaceholder')}
                  sendLabel={t('task.send')}
                  onSend={async (body, fileIds) => {
                    await postRecordComment(rec.id)(body, fileIds);
                    await load();
                  }}
                />
              )}
            </section>

            <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
              {rec.createdBy
                ? t('task.createdBy', { name: person(rec.createdBy)?.name ?? t('common.unknownUser'), date: fmtDate(rec.createdAt, { day: 'numeric', month: 'long', year: 'numeric' }) })
                : t('recordPanel.createdAt', { date: fmtDate(rec.createdAt, { day: 'numeric', month: 'long', year: 'numeric' }) })}
            </p>
          </div>
        )}
      </aside>
      {editing && rec && type && (
        <RecordDialog
          type={type}
          record={rec}
          onClose={() => setEditing(false)}
          onDone={async () => {
            await load();
            await loadTypes();
            onChanged();
          }}
        />
      )}
    </>
  );
}
