// Planned meetings on the customer page: the meetings put on the calendar but
// not held yet. Plan one, mark it held (which logs it on the timeline),
// postpone it or cancel it. Nothing is deleted — a meeting that is off is
// cancelled and stays on the record. A company can save its own meeting types
// with an agenda prompt; picking one fills the agenda.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Account } from '../../../shared/src/model';
import {
  MEETING_KINDS,
  MEETING_REPEATS,
  type MeetingKind,
  type MeetingRepeat,
  type MeetingType,
  type PlannedMeeting,
} from '../../../shared/src/timeline';
import { ApiFailure, get, patch, post, put } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useStore } from '../lib/store';
import { TIMELINE_CHANGED } from './Meetings';
import { Avatars, Dialog, PeoplePicker, RowMenu } from './ui';
import { EmptyState } from './Empty';
import { Icon } from './icons';

interface PlannedPage {
  upcoming: PlannedMeeting[];
  past: PlannedMeeting[];
}

const changed = () => window.dispatchEvent(new Event(TIMELINE_CHANGED));

/** An ISO moment as the value a datetime-local input wants (local clock). */
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocalInput = (v: string) => new Date(v).toISOString();
/** A sensible default when planning: the next whole hour. */
const nextHour = () => {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return toLocalInput(d.toISOString());
};

const LENGTHS = [15, 30, 45, 60, 90, 120];

export function AccountPlanned({ account }: { account: Account }) {
  const { t, fmtDate, locale } = useI18n();
  const { canWrite, person } = useStore();
  const [page, setPage] = useState<PlannedPage | null>(null);
  const [planning, setPlanning] = useState(false);
  const [editing, setEditing] = useState<PlannedMeeting | null>(null);
  const [holding, setHolding] = useState<PlannedMeeting | null>(null);
  const [postponing, setPostponing] = useState<PlannedMeeting | null>(null);
  const [cancelling, setCancelling] = useState<PlannedMeeting | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [contactNames, setContactNames] = useState<Map<string, string>>(new Map());

  const load = useCallback(async () => {
    const r = await get<PlannedPage>(`/accounts/${account.id}/planned`);
    setPage(r);
  }, [account.id]);
  useEffect(() => {
    void load().catch(() => setPage({ upcoming: [], past: [] }));
    const again = () => void load().catch(() => undefined);
    window.addEventListener(TIMELINE_CHANGED, again);
    return () => window.removeEventListener(TIMELINE_CHANGED, again);
  }, [load]);
  useEffect(() => {
    void get<{ records: { id: string; name: string }[] }>(`/records?type=contact&account=${account.id}&limit=500`)
      .then((r) => setContactNames(new Map(r.records.map((x) => [x.id, x.name]))))
      .catch(() => undefined);
  }, [account.id]);

  const upcoming = page?.upcoming ?? [];
  const past = page?.past ?? [];
  const who = (ids: string[], contacts: boolean) =>
    contacts ? ids.map((id) => ({ id, name: contactNames.get(id) ?? '' })) : ids.map((id) => person(id)).filter(Boolean);

  if (!page) return null;
  if (!canWrite && upcoming.length === 0 && past.length === 0) return null;

  return (
    <section className="sheet planned" id="planned" aria-labelledby="planned-title">
      <div className="meetings__head">
        <h3 className="section__head" id="planned-title">
          <span>
            <Icon name="calendar" size={16} className="icon--lead" />
            {t('planned.title')} {upcoming.length > 0 && <span className="muted num">{upcoming.length}</span>}
          </span>
        </h3>
        {canWrite && (
          <button className="btn btn--small" onClick={() => setPlanning(true)}>
            <Icon name="plus" size={14} /> {t('planned.plan')}
          </button>
        )}
      </div>

      {upcoming.length === 0 && past.length === 0 && (
        <EmptyState compact icon="calendar" title={t('planned.title')} body={t('planned.empty')}>
          {canWrite && (
            <button className="btn btn--primary btn--small" onClick={() => setPlanning(true)}>
              <Icon name="plus" size={16} /> {t('planned.plan')}
            </button>
          )}
        </EmptyState>
      )}

      <ol className="planned__list">
        {upcoming.map((m) => {
          const title = m.title || m.typeLabel || t('planned.untitled');
          return (
            <li key={m.id} className="planned__item" data-kind={m.kind}>
              <div className="planned__when" aria-hidden="true">
                <strong>{fmtDate(m.startsAt, { day: 'numeric', month: 'short' })}</strong>
                <span>{new Date(m.startsAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div className="planned__main">
                <div className="planned__row">
                  <span className="meeting__kind" data-kind={m.kind}>
                    {m.typeLabel || t(`calendar.one.${m.kind}`)}
                  </span>
                  <strong className="planned__name">{title}</strong>
                  {m.repeat !== 'none' && (
                    <span className="planned__repeat">
                      <Icon name="repeat" size={12} /> {t(`planned.repeat.${m.repeat}`)}
                    </span>
                  )}
                </div>
                {m.agenda && <p className="planned__agenda">{m.agenda}</p>}
                <div className="planned__meta">
                  <span>
                    {fmtDate(m.startsAt, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    {m.minutes ? ` · ${t('calendar.minutes', { n: m.minutes })}` : ''}
                  </span>
                  {(m.userIds.length > 0 || m.contactIds.length > 0) && <Avatars people={[...who(m.userIds, false), ...who(m.contactIds, true)] as never} max={5} />}
                </div>
              </div>
              {canWrite && (
                <RowMenu
                  label={t('planned.actions', { title })}
                  items={[
                    { label: t('planned.markHeld'), onClick: () => setHolding(m) },
                    { label: t('planned.edit'), onClick: () => setEditing(m) },
                    { label: t('planned.postpone'), onClick: () => setPostponing(m) },
                    { label: t('planned.cancel'), onClick: () => setCancelling(m), danger: true },
                  ]}
                />
              )}
            </li>
          );
        })}
      </ol>

      {past.length > 0 && (
        <div className="planned__past">
          <button className="btn btn--quiet btn--small" aria-expanded={showPast} onClick={() => setShowPast((v) => !v)}>
            {t('planned.recent')} <span className="num muted">{past.length}</span>
          </button>
          {showPast && (
            <ol className="planned__pastlist">
              {past.map((m) => (
                <li key={m.id} className="planned__pastitem">
                  <span className="pill" data-status={m.status}>
                    {t(`planned.status.${m.status}`)}
                  </span>
                  <span className="planned__pastname">{m.title || m.typeLabel || t('planned.untitled')}</span>
                  <span className="muted">{fmtDate(m.startsAt, { day: 'numeric', month: 'short' })}</span>
                  {m.reason && <span className="planned__reason">{t('planned.reasonLabel', { reason: m.reason })}</span>}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {(planning || editing) && (
        <PlanDialog account={account} planned={editing ?? undefined} onClose={() => (setPlanning(false), setEditing(null))} onSaved={() => (setPlanning(false), setEditing(null), changed())} />
      )}
      {holding && <HoldDialog account={account} planned={holding} onClose={() => setHolding(null)} onDone={() => (setHolding(null), changed())} />}
      {postponing && <PostponeDialog planned={postponing} onClose={() => setPostponing(null)} onDone={() => (setPostponing(null), changed())} />}
      {cancelling && <CancelDialog planned={cancelling} onClose={() => setCancelling(null)} onDone={() => (setCancelling(null), changed())} />}
    </section>
  );
}

// ---------------------------------------------------------------- plan / edit

function PlanDialog({ account, planned, onClose, onSaved }: { account: Account; planned?: PlannedMeeting; onClose: () => void; onSaved: () => void }) {
  const { t, words, locale } = useI18n();
  const { toast, me, people, can } = useStore();
  const editing = !!planned;
  const [kind, setKind] = useState<MeetingKind>(planned?.kind ?? 'meeting');
  const [typeLabel, setTypeLabel] = useState(planned?.typeLabel ?? '');
  const [title, setTitle] = useState(planned?.title ?? '');
  const [agenda, setAgenda] = useState(planned?.agenda ?? '');
  const [when, setWhen] = useState(planned ? toLocalInput(planned.startsAt) : nextHour());
  const [minutes, setMinutes] = useState<number | null>(planned?.minutes ?? 60);
  const [repeat, setRepeat] = useState<MeetingRepeat>(planned?.repeat ?? 'none');
  const [contactIds, setContactIds] = useState<string[]>(planned?.contactIds ?? []);
  const [userIds, setUserIds] = useState<string[]>(planned?.userIds ?? [me.user.id]);
  const [contacts, setContacts] = useState<{ id: string; name: string }[] | null>(null);
  const [types, setTypes] = useState<MeetingType[]>([]);
  const [manageTypes, setManageTypes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    void get<{ records: { id: string; name: string }[] }>(`/records?type=contact&account=${account.id}&limit=200`)
      .then((r) => live && setContacts(r.records))
      .catch(() => live && setContacts([]));
    void get<{ types: MeetingType[] }>('/meeting-types')
      .then((r) => live && setTypes(r.types))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [account.id]);

  const attendees = useMemo(() => people.filter((p) => p.status === 'active' || p.status === 'invited'), [people]);
  const ready = !!(title.trim() || typeLabel.trim()) && !!when;

  const pickType = (value: string) => {
    if (value === 'meeting' || value === 'review' || value === 'call') {
      setKind(value);
      setTypeLabel('');
      return;
    }
    const ty = types.find((x) => x.id === value);
    if (!ty) return;
    setKind(ty.kind);
    setTypeLabel(ty.label);
    if (ty.minutes) setMinutes(ty.minutes);
    if (ty.prompt && !agenda.trim()) setAgenda(ty.prompt);
  };

  const save = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError('');
    const payload = { kind, typeLabel: typeLabel.trim(), title: title.trim(), agenda: agenda.trim(), startsAt: fromLocalInput(when), minutes, contactIds, userIds, repeat };
    try {
      if (planned) await patch(`/planned/${planned.id}`, payload);
      else await post(`/accounts/${account.id}/planned`, payload);
      toast(editing ? t('plannedForm.updated') : t('plannedForm.saved', { account: account.name }), 'info');
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof ApiFailure ? e.body.message : t('errors.server'));
    } finally {
      setBusy(false);
    }
  };

  const typeValue = typeLabel ? types.find((x) => x.label === typeLabel && x.kind === kind)?.id ?? '' : kind;

  return (
    <Dialog
      title={editing ? t('plannedForm.editTitle') : t('plannedForm.planTitle')}
      onClose={onClose}
      footer={
        <>
          {error && <span className="error-text">{error}</span>}
          <button className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn--primary" disabled={!ready || busy} onClick={() => void save()}>
            {editing ? t('plannedForm.saveEdit') : t('plannedForm.save')}
          </button>
        </>
      }
    >
      <label className="field">
        <span className="field__label">{t('plannedForm.type')}</span>
        <select className="select" value={typeValue} onChange={(e) => pickType(e.target.value)}>
          <optgroup label={t('plannedForm.custom')}>
            {MEETING_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`calendar.one.${k}`)}
              </option>
            ))}
          </optgroup>
          {types.length > 0 && (
            <optgroup label={t('plannedTypes.manage')}>
              {types.map((ty) => (
                <option key={ty.id} value={ty.id}>
                  {ty.label}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>

      <label className="field">
        <span className="field__label">{t('plannedForm.title')}</span>
        <input className="input" value={title} maxLength={300} placeholder={t('plannedForm.titlePh')} onChange={(e) => setTitle(e.target.value)} />
      </label>

      <div className="planned__grid">
        <label className="field">
          <span className="field__label">{t('plannedForm.when')}</span>
          <input className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">{t('plannedForm.length')}</span>
          <select className="select" value={minutes ?? ''} onChange={(e) => setMinutes(e.target.value ? Number(e.target.value) : null)}>
            <option value="">—</option>
            {LENGTHS.map((n) => (
              <option key={n} value={n}>
                {t('calendar.minutes', { n })}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">{t('plannedForm.repeat')}</span>
          <select className="select" value={repeat} onChange={(e) => setRepeat(e.target.value as MeetingRepeat)}>
            {MEETING_REPEATS.map((r) => (
              <option key={r} value={r}>
                {t(`planned.repeat.${r}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="field">
        <span className="field__label">{t('plannedForm.theirs')}</span>
        {contacts === null ? (
          <span className="muted">{t('common.loading')}</span>
        ) : contacts.length === 0 ? (
          <span className="muted">{t('plannedForm.noContacts', { account: words.one.toLocaleLowerCase(locale) })}</span>
        ) : (
          <div className="logform__contacts" role="group" aria-label={t('plannedForm.theirs')}>
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
        <span className="field__label">{t('plannedForm.ours')}</span>
        <PeoplePicker label={t('plannedForm.ours')} people={attendees} value={userIds} max={30} onChange={setUserIds} />
      </div>

      <label className="field">
        <span className="field__label">{t('plannedForm.agenda')}</span>
        <textarea className="input" rows={4} value={agenda} maxLength={20000} placeholder={t('plannedForm.agendaPh')} onChange={(e) => setAgenda(e.target.value)} />
      </label>

      {can('org.manage') && (
        <div className="planned__types">
          <button type="button" className="btn btn--quiet btn--small" aria-expanded={manageTypes} onClick={() => setManageTypes((v) => !v)}>
            <Icon name="sliders" size={13} /> {t('plannedTypes.manage')}
          </button>
          {manageTypes && <TypeManager types={types} onChange={setTypes} />}
        </div>
      )}
    </Dialog>
  );
}

// -------------------------------------------------------------- mark as held

function HoldDialog({ account, planned, onClose, onDone }: { account: Account; planned: PlannedMeeting; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const { toast } = useStore();
  const [body, setBody] = useState(planned.agenda ?? '');
  const [when, setWhen] = useState(toLocalInput(new Date().toISOString()));
  const [minutes, setMinutes] = useState<number | null>(planned.minutes ?? 60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await post<{ next: PlannedMeeting | null }>(`/planned/${planned.id}/hold`, { body: body.trim(), happenedAt: fromLocalInput(when), minutes });
      toast(t('plannedHold.done', { account: account.name }), 'info');
      if (r.next) toast(t('plannedHold.nextMade', { date: new Date(r.next.startsAt).toLocaleDateString() }), 'info');
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof ApiFailure ? e.body.message : t('errors.server'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={t('plannedHold.title')}
      onClose={onClose}
      footer={
        <>
          {error && <span className="error-text">{error}</span>}
          <button className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn--primary" disabled={busy} onClick={() => void confirm()}>
            {t('plannedHold.confirm')}
          </button>
        </>
      }
    >
      <p className="muted">{t('plannedHold.intro')}</p>
      <div className="planned__grid">
        <label className="field">
          <span className="field__label">{t('plannedHold.when')}</span>
          <input className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">{t('plannedHold.length')}</span>
          <select className="select" value={minutes ?? ''} onChange={(e) => setMinutes(e.target.value ? Number(e.target.value) : null)}>
            <option value="">—</option>
            {LENGTHS.map((n) => (
              <option key={n} value={n}>
                {t('calendar.minutes', { n })}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span className="field__label">{t('plannedHold.notes')}</span>
        <textarea className="input" rows={4} value={body} maxLength={20000} placeholder={t('plannedHold.notesPh')} onChange={(e) => setBody(e.target.value)} />
      </label>
    </Dialog>
  );
}

// ---------------------------------------------------------------- postpone

function PostponeDialog({ planned, onClose, onDone }: { planned: PlannedMeeting; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const { toast } = useStore();
  const [reason, setReason] = useState('');
  const [newDate, setNewDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await post<{ next: PlannedMeeting | null }>(`/planned/${planned.id}/postpone`, { reason: reason.trim(), ...(newDate ? { startsAt: fromLocalInput(newDate) } : {}) });
      toast(r.next ? t('plannedPostpone.rescheduled', { date: new Date(r.next.startsAt).toLocaleDateString() }) : t('plannedPostpone.done'), 'info');
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof ApiFailure ? e.body.message : t('errors.server'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={t('plannedPostpone.title')}
      onClose={onClose}
      footer={
        <>
          {error && <span className="error-text">{error}</span>}
          <button className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn--primary" disabled={busy} onClick={() => void confirm()}>
            {t('plannedPostpone.confirm')}
          </button>
        </>
      }
    >
      <label className="field">
        <span className="field__label">{t('plannedPostpone.reason')}</span>
        <input className="input" value={reason} maxLength={2000} placeholder={t('plannedPostpone.reasonPh')} onChange={(e) => setReason(e.target.value)} />
      </label>
      <label className="field">
        <span className="field__label">{t('plannedPostpone.newDate')}</span>
        <input className="input" type="datetime-local" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
      </label>
    </Dialog>
  );
}

// ------------------------------------------------------------------ cancel

function CancelDialog({ planned, onClose, onDone }: { planned: PlannedMeeting; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const { toast } = useStore();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await post(`/planned/${planned.id}/cancel`, { reason: reason.trim() });
      toast(t('plannedCancel.done'), 'info');
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof ApiFailure ? e.body.message : t('errors.server'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={t('plannedCancel.title')}
      onClose={onClose}
      footer={
        <>
          {error && <span className="error-text">{error}</span>}
          <button className="btn" onClick={onClose}>
            {t('plannedCancel.keep')}
          </button>
          <button className="btn btn--danger" disabled={busy} onClick={() => void confirm()}>
            {t('plannedCancel.confirm')}
          </button>
        </>
      }
    >
      <p className="muted">{t('plannedCancel.body')}</p>
      <label className="field">
        <span className="field__label">{t('plannedCancel.reason')}</span>
        <input className="input" value={reason} maxLength={2000} onChange={(e) => setReason(e.target.value)} />
      </label>
    </Dialog>
  );
}

// ------------------------------------------------------- saved meeting types

function TypeManager({ types, onChange }: { types: MeetingType[]; onChange: (t: MeetingType[]) => void }) {
  const { t } = useI18n();
  const { toast } = useStore();
  const [draft, setDraft] = useState<MeetingType[]>(types);
  const [busy, setBusy] = useState(false);

  const set = (id: string, change: Partial<MeetingType>) => setDraft((list) => list.map((x) => (x.id === id ? { ...x, ...change } : x)));
  const add = () => setDraft((list) => [...list, { id: crypto.randomUUID().slice(0, 8), label: '', kind: 'meeting' as MeetingKind, minutes: null, prompt: '' }]);
  const remove = (id: string) => setDraft((list) => list.filter((x) => x.id !== id));

  const save = async () => {
    if (busy) return;
    setBusy(true);
    const clean = draft.filter((x) => x.label.trim()).map((x) => ({ ...x, label: x.label.trim(), prompt: x.prompt.trim() }));
    try {
      const r = await put<{ types: MeetingType[] }>('/meeting-types', { types: clean });
      onChange(r.types);
      setDraft(r.types);
      toast(t('plannedTypes.saved'), 'info');
    } catch {
      /* surfaced by the toast system */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="typemgr">
      <p className="muted small">{t('plannedTypes.hint')}</p>
      {draft.length === 0 && <p className="muted small">{t('plannedTypes.none')}</p>}
      {draft.map((ty) => (
        <div key={ty.id} className="typemgr__row">
          <input className="input" value={ty.label} placeholder={t('plannedTypes.labelPh')} maxLength={80} onChange={(e) => set(ty.id, { label: e.target.value })} />
          <select className="select" value={ty.kind} aria-label={t('plannedTypes.kind')} onChange={(e) => set(ty.id, { kind: e.target.value as MeetingKind })}>
            {MEETING_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`calendar.one.${k}`)}
              </option>
            ))}
          </select>
          <input className="input" value={ty.prompt} placeholder={t('plannedTypes.promptPh')} maxLength={4000} onChange={(e) => set(ty.id, { prompt: e.target.value })} />
          <button type="button" className="iconbtn" aria-label={t('plannedTypes.remove')} onClick={() => remove(ty.id)}>
            <Icon name="trash" size={14} />
          </button>
        </div>
      ))}
      <div className="typemgr__foot">
        <button type="button" className="btn btn--quiet btn--small" onClick={add}>
          <Icon name="plus" size={13} /> {t('plannedTypes.add')}
        </button>
        <button type="button" className="btn btn--small" disabled={busy} onClick={() => void save()}>
          {t('plannedTypes.save')}
        </button>
      </div>
    </div>
  );
}
