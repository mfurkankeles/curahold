// Meetings with a customer.
//
// - LogDialog: one dialog to log anything that happened with a customer. A
//   note or an email is a few words; a meeting, a business review or a call
//   also asks for a title, the date and length, who was there (their people
//   and ours), notes and the next steps — each next step becomes a task on the
//   customer that remembers the meeting. It also edits a meeting logged before.
// - AccountMeetings: the customer page's list of every meeting, review and
//   call, newest first, with who was there, the notes and how the next steps
//   are doing.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Account } from '../../../shared/src/model';
import { reviewDue } from '../../../shared/src/rhythm';
import { ACTIVITY_KINDS, MEETING_KINDS, isMeetingKind, type ActivityKind, type Meeting, type MeetingKind, type MeetingsPage, type NextStep } from '../../../shared/src/timeline';
import { ApiFailure, del, get, patch, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { navigate, setQuery } from '../lib/router';
import { tasksChanged } from '../lib/shell';
import { useStore } from '../lib/store';
import { todayIso } from '../lib/time';
import { AccountPicker } from './AccountPicker';
import { EmptyState } from './Empty';
import { Icon, type IconName } from './icons';
import { useReviewText, useRhythm } from './Rhythm';
import { Avatars, Confirm, Dialog, DueLabel, PeoplePicker, RowMenu } from './ui';
import { useTrashToast } from '../lib/trash';

export const KIND_ICON: Record<ActivityKind, IconName> = { note: 'note', call: 'phone', meeting: 'people', email: 'mail', review: 'handshake' };

/** Told when something is logged, so the customer page, its timeline and the reviews list follow. */
export const TIMELINE_CHANGED = 'app:timeline-changed';
const changed = () => window.dispatchEvent(new Event(TIMELINE_CHANGED));

/** The board the last task went to (New task remembers it on this device). */
const lastBoard = () => {
  try {
    return localStorage.getItem('app_quick_board');
  } catch {
    return null;
  }
};

const LENGTHS = [15, 30, 45, 60, 90, 120];

/** A next step being written: what, who and by when. */
interface StepDraft {
  key: number;
  title: string;
  assigneeId: string;
  dueDate: string;
}

/** "YYYY-MM-DD" of a moment, in this browser's time zone. */
const localDay = (at: string | Date) => {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// =================================================================== the dialog

export function LogDialog({
  accountId,
  accountName,
  kind: asked,
  meeting,
  onClose,
}: {
  accountId?: string | null;
  accountName?: string | null;
  kind?: ActivityKind;
  /** A meeting logged before: the dialog edits it. */
  meeting?: Meeting;
  onClose: () => void;
}) {
  const { t, words, locale } = useI18n();
  const { toast, me, people, boards } = useStore();
  const editing = !!meeting;
  const [account, setAccount] = useState<{ id: string | null; name: string | null }>({ id: meeting?.accountId ?? accountId ?? null, name: accountName ?? null });
  const [kind, setKind] = useState<ActivityKind>(meeting?.kind ?? asked ?? 'meeting');
  const isMeeting = isMeetingKind(kind);

  // What is written.
  const [title, setTitle] = useState(meeting?.title ?? '');
  const [text, setText] = useState(meeting?.body ?? '');
  const today = todayIso();
  const [date, setDate] = useState(meeting ? localDay(meeting.happenedAt) : today);
  const [minutes, setMinutes] = useState<number | null>(meeting?.minutes ?? null);
  // Who was there: their people (contacts of the customer) and ours (me by default).
  const [contactIds, setContactIds] = useState<string[]>(meeting?.contactIds ?? []);
  const [userIds, setUserIds] = useState<string[]>(meeting?.userIds ?? [me.user.id]);
  const [contacts, setContacts] = useState<{ id: string; name: string }[] | null>(null);
  // Next steps: new ones to make (the ones made before are listed, done or not).
  const [steps, setSteps] = useState<StepDraft[]>([]);
  const [boardId, setBoardId] = useState(() => boards.find((b) => b.id === lastBoard())?.id ?? boards[0]?.id ?? '');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // The customer's people, to tick who was there.
  useEffect(() => {
    if (!account.id || !isMeeting) return setContacts(null);
    let live = true;
    void get<{ records: { id: string; name: string }[] }>(`/records?type=contact&account=${account.id}&limit=200`)
      .then((r) => live && setContacts(r.records))
      .catch(() => live && setContacts([]));
    return () => {
      live = false;
    };
  }, [account.id, isMeeting]);

  const attendees = useMemo(() => people.filter((p) => p.status === 'active' || p.status === 'invited'), [people]);
  const assignable = useMemo(() => attendees.filter((p) => p.seat === 'full'), [attendees]);
  const filledSteps = steps.filter((s) => s.title.trim());
  const ready = !!account.id && (isMeeting ? !!(title.trim() || text.trim() || filledSteps.length) : !!text.trim()) && (!filledSteps.length || !!boardId);

  /** The moment it happened: now for today, midday for another day; an edit keeps its time unless the day changed. */
  const happenedAt = () => {
    if (meeting && localDay(meeting.happenedAt) === date) return meeting.happenedAt;
    if (date === today) return new Date().toISOString();
    return new Date(`${date}T12:00:00`).toISOString();
  };

  const save = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError('');
    const nextSteps = filledSteps.map((s) => ({ title: s.title.trim(), assigneeIds: s.assigneeId ? [s.assigneeId] : [], dueDate: s.dueDate || null }));
    try {
      if (meeting) {
        await patch(`/activities/${meeting.id}`, { kind, title: title.trim(), body: text.trim(), happenedAt: happenedAt(), minutes, contactIds, userIds });
        if (nextSteps.length) await post(`/activities/${meeting.id}/next-steps`, { steps: nextSteps, boardId });
      } else if (isMeeting) {
        await post(`/accounts/${account.id}/meetings`, {
          kind,
          title: title.trim(),
          body: text.trim(),
          happenedAt: happenedAt(),
          minutes,
          contactIds,
          userIds,
          ...(nextSteps.length ? { nextSteps, boardId } : {}),
        });
      } else {
        await post(`/accounts/${account.id}/activities`, { kind, body: text.trim(), happenedAt: happenedAt() });
      }
      if (nextSteps.length) {
        try {
          localStorage.setItem('app_quick_board', boardId);
        } catch {
          /* per-device convenience */
        }
        tasksChanged();
      }
      const id = account.id!;
      const said = nextSteps.length ? t('meetingForm.savedSteps', { n: nextSteps.length }) : isMeeting ? t('meetingForm.saved', { account: account.name ?? '' }) : t('touch.saved', { account: account.name ?? '' });
      toast(said, 'info', editing ? undefined : { label: t('touch.open'), run: () => navigate(`/accounts/${id}`) });
      changed();
      onClose();
    } catch (e) {
      setError(e instanceof ApiFailure ? e.body.message : t('errors.server'));
    } finally {
      setBusy(false);
    }
  };

  const kinds: readonly ActivityKind[] = editing ? MEETING_KINDS : ACTIVITY_KINDS;
  const step = (key: number, change: Partial<StepDraft>) => setSteps((list) => list.map((s) => (s.key === key ? { ...s, ...change } : s)));

  return (
    <Dialog
      title={editing ? t('meetings.edit') : isMeeting ? t('meetings.log') : t('touch.title')}
      onClose={onClose}
      wide={isMeeting}
      footer={
        <>
          <button className="btn btn--quiet" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn--primary" disabled={!ready || busy} onClick={save}>
            {busy ? t('common.saving') : t('common.save')}
          </button>
        </>
      }
    >
      <div
        className="logform"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void save();
          }
        }}
      >
        {!editing && (
          <div className="field">
            <span className="field__label">{words.one}</span>
            <AccountPicker value={account.id} name={account.name} onChange={(id, name) => (setAccount({ id, name: name ?? null }), setContactIds([]))} />
          </div>
        )}
        <div className="field">
          <span className="field__label">{t('timeline.kindLabel')}</span>
          <div className="kindpick" role="radiogroup" aria-label={t('timeline.kindLabel')}>
            {kinds.map((k) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} className="kindpick__btn" onClick={() => setKind(k)}>
                <Icon name={KIND_ICON[k]} size={16} />
                {t(`timeline.kind.${k}` as any)}
              </button>
            ))}
          </div>
        </div>

        {isMeeting && (
          <>
            <label className="field">
              <span className="field__label">{t('meetingForm.title')}</span>
              <input className="input" value={title} maxLength={300} placeholder={t(`meetingForm.titlePh.${kind as MeetingKind}` as any)} onChange={(e) => setTitle(e.target.value)} autoFocus />
            </label>
            <div className="logform__row">
              <label className="field">
                <span className="field__label">{t('meetingForm.date')}</span>
                <input className="input num" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} />
              </label>
              <label className="field">
                <span className="field__label">{t('meetingForm.length')}</span>
                <select className="select" value={minutes ?? ''} onChange={(e) => setMinutes(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">—</option>
                  {[...new Set([...LENGTHS, ...(minutes ? [minutes] : [])])]
                    .sort((a, b) => a - b)
                    .map((n) => (
                      <option key={n} value={n}>
                        {t('meetings.minutes', { n })}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <div className="field">
              <span className="field__label">{t('meetingForm.theirs')}</span>
              {contacts === null ? (
                <span className="muted">{account.id ? t('common.loading') : t('quick.recordFirst', { account: words.one.toLocaleLowerCase(locale) })}</span>
              ) : contacts.length === 0 ? (
                <span className="muted">{t('meetingForm.noContacts', { account: words.one.toLocaleLowerCase(locale) })}</span>
              ) : (
                <div className="logform__contacts" role="group" aria-label={t('meetingForm.theirs')}>
                  {contacts.map((c) => (
                    <label key={c.id} className="chiptoggle" data-on={contactIds.includes(c.id) || undefined}>
                      <input type="checkbox" checked={contactIds.includes(c.id)} onChange={(e) => setContactIds(e.target.checked ? [...contactIds, c.id] : contactIds.filter((x) => x !== c.id))} />
                      {c.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="field">
              <span className="field__label">{t('meetingForm.ours')}</span>
              <PeoplePicker label={t('meetingForm.ours')} people={attendees} value={userIds} max={30} onChange={setUserIds} />
            </div>
          </>
        )}

        <label className="field">
          <span className="field__label">{isMeeting ? t('meetingForm.notes') : t('timeline.kindLabel')}</span>
          <textarea className="textarea" value={text} maxLength={20000} rows={isMeeting ? 4 : 5} placeholder={isMeeting ? t('meetingForm.notesPh') : t(`timeline.placeholder.${kind}` as any)} onChange={(e) => setText(e.target.value)} autoFocus={!isMeeting} />
        </label>

        {isMeeting && (
          <div className="field logform__steps">
            <span className="field__label">{t('meetingForm.steps')}</span>
            <span className="field__hint">{t('meetingForm.stepsHint', { account: words.one.toLocaleLowerCase(locale) })}</span>
            {meeting && meeting.nextSteps.length > 0 && (
              <ul className="meeting__steps">
                {meeting.nextSteps.map((s) => (
                  <StepLine key={s.id} step={s} />
                ))}
              </ul>
            )}
            {steps.map((s) => (
              <div key={s.key} className="logform__step">
                <input className="input" value={s.title} maxLength={300} placeholder={t('meetingForm.stepPh')} aria-label={t('meetingForm.stepPh')} onChange={(e) => step(s.key, { title: e.target.value })} />
                <select className="select" value={s.assigneeId} aria-label={t('meetingForm.stepWho')} onChange={(e) => step(s.key, { assigneeId: e.target.value })}>
                  <option value="">{t('meetingForm.stepWho')}</option>
                  {assignable.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <input className="input num" type="date" value={s.dueDate} min={today} aria-label={t('meetingForm.stepDue')} title={t('meetingForm.stepDue')} onChange={(e) => step(s.key, { dueDate: e.target.value })} />
                <button type="button" className="btn btn--quiet btn--icon btn--small" aria-label={t('meetingForm.removeStep')} title={t('meetingForm.removeStep')} onClick={() => setSteps((list) => list.filter((x) => x.key !== s.key))}>
                  <Icon name="close" size={14} />
                </button>
              </div>
            ))}
            <div className="logform__steprow">
              <button type="button" className="btn btn--small btn--quiet" onClick={() => setSteps((list) => [...list, { key: Date.now() + list.length, title: '', assigneeId: me.user.id, dueDate: '' }])}>
                <Icon name="plus" size={14} /> {t('meetingForm.addStep')}
              </button>
              {filledSteps.length > 0 && boards.length > 0 && (
                <label className="logform__board">
                  <span className="muted">{t('meetingForm.stepBoard')}</span>
                  <select className="select" value={boardId} onChange={(e) => setBoardId(e.target.value)}>
                    {boards.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </div>
        )}
        {isMeeting && !ready && account.id && <p className="field__hint">{t('meetingForm.needSomething')}</p>}
        {error && <p className="error-text">{error}</p>}
      </div>
    </Dialog>
  );
}

/** A next step: done or not, who has it, by when; opens the task. */
function StepLine({ step }: { step: NextStep }) {
  const { t } = useI18n();
  const { person } = useStore();
  return (
    <li className="meeting__step" data-done={step.done || undefined}>
      <Icon name={step.done ? 'checkCircle' : 'dot'} size={15} />
      <button type="button" className="linkbtn linkbtn--plain" onClick={() => setQuery('task', step.id)} title={t('quick.open')}>
        {step.title}
      </button>
      {step.assigneeIds.length > 0 && <Avatars people={step.assigneeIds.map(person)} max={2} />}
      {!step.done && <DueLabel due={step.dueDate} done={false} />}
    </li>
  );
}

// ============================================================ the customer page

export function AccountMeetings({ account }: { account: Account }) {
  const { t, fmtDate, locale } = useI18n();
  const { canWrite, person, me, can } = useStore();
  const trashed = useTrashToast();
  const rhythm = useRhythm();
  const reviewText = useReviewText();
  const [kind, setKind] = useState<MeetingKind | ''>('');
  const [page, setPage] = useState<MeetingsPage | null>(null);
  const [more, setMore] = useState<Meeting[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [logging, setLogging] = useState(false);
  const [editing, setEditing] = useState<Meeting | null>(null);
  const [removing, setRemoving] = useState<Meeting | null>(null);
  const [contactNames, setContactNames] = useState<Map<string, string>>(new Map());

  const load = useCallback(async () => {
    const r = await get<MeetingsPage>(`/accounts/${account.id}/meetings${kind ? `?kind=${kind}` : ''}`);
    setPage(r);
    setMore([]);
    setNext(r.next);
  }, [account.id, kind]);
  useEffect(() => {
    void load().catch(() => setPage({ meetings: [], next: null, counts: { meeting: 0, review: 0, call: 0 } }));
    const again = () => void load().catch(() => undefined);
    window.addEventListener(TIMELINE_CHANGED, again);
    return () => window.removeEventListener(TIMELINE_CHANGED, again);
  }, [load]);
  // The customer's people, to name who was there.
  useEffect(() => {
    void get<{ records: { id: string; name: string }[] }>(`/records?type=contact&account=${account.id}&limit=500`)
      .then((r) => setContactNames(new Map(r.records.map((x) => [x.id, x.name]))))
      .catch(() => undefined);
  }, [account.id]);

  const older = async () => {
    if (!next) return;
    const r = await get<MeetingsPage>(`/accounts/${account.id}/meetings?before=${encodeURIComponent(next)}${kind ? `&kind=${kind}` : ''}`);
    setMore((m) => [...m, ...r.meetings]);
    setNext(r.next);
  };

  const list = [...(page?.meetings ?? []), ...more];
  const counts = page?.counts ?? { meeting: 0, review: 0, call: 0 };
  const total = counts.meeting + counts.review + counts.call;
  const due = rhythm.reviewDays ? reviewDue(account, rhythm.reviewDays, todayIso()) : null;
  const mayChange = (m: Meeting) => canWrite && (m.authorId === me.user.id || can('accounts.manage'));

  return (
    <section className="sheet meetings" id="meetings" aria-labelledby="meetings-title">
      <div className="meetings__head">
        <h3 className="section__head" id="meetings-title">
          {t('meetings.title')} {total > 0 && <span className="muted num">{total}</span>}
        </h3>
        {due && due.state !== 'none' && (
          <span className="review__when meetings__next" data-state={due.state}>
            <Icon name="handshake" size={14} /> {t('meetings.nextReview', { when: reviewText(due) })}
          </span>
        )}
        {canWrite && (
          <button className="btn btn--small" onClick={() => setLogging(true)}>
            <Icon name="plus" size={14} /> {t('meetings.log')}
          </button>
        )}
      </div>

      {total > 0 && (
        <div className="seg meetings__filter" role="group" aria-label={t('timeline.kindLabel')}>
          <button type="button" aria-pressed={kind === ''} onClick={() => setKind('')}>
            {t('meetings.all')} <span className="num muted">{total}</span>
          </button>
          {MEETING_KINDS.filter((k) => counts[k] > 0).map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
              {t(`timeline.kind.${k}` as any)} <span className="num muted">{counts[k]}</span>
            </button>
          ))}
        </div>
      )}

      {page && list.length === 0 && (
        <EmptyState compact icon="people" title={t('meetings.emptyTitle')} body={t('meetings.emptyBody')}>
          {canWrite && (
            <button className="btn btn--primary btn--small" onClick={() => setLogging(true)}>
              {t('meetings.log')}
            </button>
          )}
        </EmptyState>
      )}

      <ol className="meetings__list">
        {list.map((m) => (
          <MeetingRow
            key={m.id}
            m={m}
            contactName={(id) => contactNames.get(id) ?? ''}
            authorName={person(m.authorId)?.name ?? ''}
            fmtDate={fmtDate}
            locale={locale}
            onEdit={mayChange(m) ? () => setEditing(m) : undefined}
            onRemove={mayChange(m) ? () => setRemoving(m) : undefined}
          />
        ))}
      </ol>
      {next && (
        <button className="btn btn--quiet btn--small meetings__older" onClick={() => void older()}>
          {t('meetings.older')}
        </button>
      )}

      {logging && <LogDialog accountId={account.id} accountName={account.name} kind="meeting" onClose={() => setLogging(false)} />}
      {editing && <LogDialog meeting={editing} accountName={account.name} onClose={() => setEditing(null)} />}
      {removing && (
        <Confirm
          title={t('meetings.deleteTitle')}
          body={t('meetings.deleteBody')}
          confirmLabel={t('common.delete')}
          danger
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            trashed(await del(`/activities/${removing.id}`), changed);
            setRemoving(null);
            changed();
          }}
        />
      )}
    </section>
  );
}

/** One meeting: when, what kind, who was there, the notes and the next steps. */
function MeetingRow({
  m,
  contactName,
  authorName,
  fmtDate,
  locale,
  onEdit,
  onRemove,
}: {
  m: Meeting;
  contactName: (id: string) => string;
  authorName: string;
  fmtDate: (d: string, o?: Intl.DateTimeFormatOptions) => string;
  locale: string;
  onEdit?: () => void;
  onRemove?: () => void;
}) {
  const { t } = useI18n();
  const { person } = useStore();
  const [open, setOpen] = useState(false);
  const day = localDay(m.happenedAt);
  const ours = m.userIds.map(person).filter(Boolean);
  const theirs = m.contactIds.map(contactName).filter(Boolean);
  const done = m.nextSteps.filter((s) => s.done).length;
  const long = m.body.length > 280 || m.body.split('\n').length > 4;
  return (
    <li className="meeting" data-kind={m.kind}>
      <time className="meeting__date" dateTime={m.happenedAt}>
        <span className="meeting__day num">{fmtDate(day, { day: 'numeric' })}</span>
        <span className="meeting__month">{fmtDate(day, { month: 'short', year: 'numeric' })}</span>
        <span className="meeting__weekday muted">{new Date(`${day}T12:00:00`).toLocaleDateString(locale, { weekday: 'short' })}</span>
      </time>
      <div className="meeting__main">
        <div className="meeting__head">
          <span className="meeting__kind" data-kind={m.kind}>
            <Icon name={KIND_ICON[m.kind]} size={13} /> {t(`timeline.kind.${m.kind}` as any)}
          </span>
          <strong className="meeting__title">{m.title || t(`timeline.kind.${m.kind}` as any)}</strong>
          <span className="muted meeting__meta">
            {m.minutes ? t('meetings.minutes', { n: m.minutes }) : null}
            {m.minutes && authorName ? ' · ' : null}
            {authorName ? t('meetings.by', { name: authorName }) : null}
          </span>
          {(onEdit || onRemove) && (
            <span className="meeting__tools">
              <RowMenu
                label={t('meetings.actions', { name: m.title || t(`timeline.kind.${m.kind}` as any) })}
                items={[...(onEdit ? [{ label: t('common.edit'), onClick: onEdit }] : []), ...(onRemove ? [{ label: t('common.delete'), onClick: onRemove, danger: true }] : [])]}
              />
            </span>
          )}
        </div>
        {(ours.length > 0 || theirs.length > 0) && (
          <p className="meeting__who">
            {ours.length > 0 && (
              <span>
                <span className="muted">{t('meetings.ours')}:</span> {ours.map((p) => p!.name).join(', ')}
              </span>
            )}
            {theirs.length > 0 && (
              <span>
                <span className="muted">{t('meetings.theirs')}:</span> {theirs.join(', ')}
              </span>
            )}
          </p>
        )}
        {m.body && (
          <div className="meeting__notes" data-open={open || !long || undefined}>
            <p>{m.body}</p>
            {long && (
              <button type="button" className="linkbtn" onClick={() => setOpen((o) => !o)}>
                {open ? t('meetings.less') : t('meetings.more')}
              </button>
            )}
          </div>
        )}
        {m.nextSteps.length > 0 && (
          <div className="meeting__stepsbox">
            <span className="meeting__stepshead">
              {t('meetings.nextSteps')} <span className="muted num">{t('meetings.stepsDone', { done, n: m.nextSteps.length })}</span>
            </span>
            <ul className="meeting__steps">
              {m.nextSteps.map((s) => (
                <StepLine key={s.id} step={s} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </li>
  );
}
