// Settings › Company: the log of requests people make about their personal data (api/src/routes/admin.ts
// /admin/privacy-requests, migration 0250). Access and erasure have their own tools (export, erase on each person);
// this is where every request is written down — objections and restrictions included — with the date it is due under
// the law that applies (shared/src/privacyRequests.ts), so none is answered late or forgotten. Only people with
// privacy.manage see it; the server checks the same, and so does row security.
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { PRIVACY_LAWS, PRIVACY_LAW_KEYS, PRIVACY_REQUEST_KINDS, privacyDueOn, type PrivacyLaw, type PrivacyRequestKind } from '../../../shared/src/privacyRequests';
import { bcp47Of, type MessageKey } from '../../../shared/src/i18n';
import { get, patch, post } from '../lib/api';
import { formatDate } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { useSaver } from '../lib/saver';
import { todayIso } from '../lib/time';
import { DateField } from './DateField';
import { Icon } from './icons';
import '../surfaces/admin.css';

interface PrivacyRequest {
  id: string;
  kind: PrivacyRequestKind;
  subjectName: string;
  subjectEmail: string | null;
  law: PrivacyLaw;
  receivedOn: string;
  dueOn: string;
  status: 'open' | 'done' | 'refused';
  note: string | null;
  closedAt: string | null;
}

/** The "Requests about personal data" card: the log, and a short form to add to it. */
export function PrivacyRequests() {
  const { t, locale } = useI18n();
  const save = useSaver();
  const [list, setList] = useState<PrivacyRequest[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<PrivacyRequestKind>('access');
  const [name, setName] = useState('');
  const [mail, setMail] = useState('');
  const [law, setLaw] = useState<PrivacyLaw>('gdpr');
  const [received, setReceived] = useState(todayIso());
  const [note, setNote] = useState('');
  const load = () => get<{ requests: PrivacyRequest[] }>('/admin/privacy-requests').then((r) => setList(r.requests), () => setList(null));
  useEffect(() => {
    void load();
  }, []);

  // A law is shown as its short name and where it applies, in the reader's language ("GDPR · European Union").
  const lawName = useMemo(() => {
    let regions: Intl.DisplayNames | null = null;
    try {
      regions = new Intl.DisplayNames([bcp47Of(locale)], { type: 'region' });
    } catch {
      regions = null;
    }
    return (k: PrivacyLaw) => (k === 'other' ? t('privacyReq.lawOther') : `${PRIVACY_LAWS[k].name} · ${regions?.of(PRIVACY_LAWS[k].region) ?? PRIVACY_LAWS[k].region}`);
  }, [locale, t]);
  const day = (d: string) => formatDate(`${d}T12:00:00Z`, locale, { day: 'numeric', month: 'short', year: 'numeric' });
  const today = todayIso();

  if (!list) return null;

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const ok = await save(() => post('/admin/privacy-requests', { kind, subjectName: name.trim(), subjectEmail: mail.trim() || null, law, receivedOn: received, note: note.trim() || null }), t('privacyReq.logged'));
    if (!ok) return;
    setName('');
    setMail('');
    setNote('');
    setAdding(false);
    void load();
  };
  const close = async (r: PrivacyRequest, status: 'done' | 'refused') => {
    if (await save(() => patch(`/admin/privacy-requests/${r.id}`, { status }), t('privacyReq.closed'))) void load();
  };

  return (
    <section className="sheet" data-test="privacy-requests" aria-labelledby="privacy-requests-title">
      <h3 className="section__head" id="privacy-requests-title">
        <span>
          <Icon name="shield" size={16} className="icon--lead" />
          {t('privacyReq.title')}
        </span>
      </h3>
      <p className="field__hint">{t('privacyReq.lead')}</p>
      {list.length === 0 && !adding && <p className="muted">{t('privacyReq.empty')}</p>}
      {list.length > 0 && (
        <ul className="plainlist privreq__list">
          {list.map((r) => {
            const late = r.status === 'open' && r.dueOn < today;
            return (
              <li key={r.id} className="privreq" data-status={r.status} data-late={late || undefined}>
                <div className="privreq__main">
                  <strong>{t(`privacyReq.kind.${r.kind}` as MessageKey)}</strong> · {r.subjectName}
                  {r.subjectEmail && <span className="muted"> · {r.subjectEmail}</span>}
                  <div className="privreq__meta muted">
                    {lawName(r.law)} · {t('privacyReq.receivedOn', { date: day(r.receivedOn) })}
                  </div>
                  {r.note && <div className="privreq__note">{r.note}</div>}
                </div>
                <div className="privreq__side">
                  {r.status === 'open' ? (
                    <>
                      <span className="privreq__state" data-late={late || undefined}>
                        <Icon name={late ? 'alert' : 'clock'} size={14} />
                        {late ? t('privacyReq.overdue', { date: day(r.dueOn) }) : t('privacyReq.due', { date: day(r.dueOn) })}
                      </span>
                      <button type="button" className="btn btn--small" onClick={() => void close(r, 'done')}>
                        <Icon name="check" size={14} />
                        {t('privacyReq.markDone')}
                      </button>
                      <button type="button" className="btn btn--small btn--quiet" onClick={() => void close(r, 'refused')}>
                        <Icon name="close" size={14} />
                        {t('privacyReq.markRefused')}
                      </button>
                    </>
                  ) : (
                    <span className="privreq__state" data-closed="">
                      <Icon name={r.status === 'done' ? 'checkCircle' : 'close'} size={14} />
                      {t(`privacyReq.status.${r.status}` as MessageKey)}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {adding ? (
        <form className="form" onSubmit={(e) => void add(e)}>
          <div className="form__row">
            <label className="field">
              <span className="field__label">{t('privacyReq.kind')}</span>
              <select className="select" value={kind} onChange={(e) => setKind(e.target.value as PrivacyRequestKind)}>
                {PRIVACY_REQUEST_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`privacyReq.kind.${k}` as MessageKey)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">{t('privacyReq.law')}</span>
              <select className="select" value={law} onChange={(e) => setLaw(e.target.value as PrivacyLaw)}>
                {PRIVACY_LAW_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {lawName(k)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form__row">
            <label className="field">
              <span className="field__label">{t('privacyReq.subject')}</span>
              <input className="input" value={name} required maxLength={200} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="field">
              <span className="field__label">{t('privacyReq.email')}</span>
              <input className="input" type="email" value={mail} maxLength={320} onChange={(e) => setMail(e.target.value)} />
            </label>
          </div>
          <div className="form__row">
            <DateField label={t('privacyReq.received')} value={received} max={today} onChange={(v) => setReceived(v || today)} />
            <p className="field__hint">{'months' in PRIVACY_LAWS[law] ? t('privacyReq.dueHintMonth', { date: day(privacyDueOn(received, law)) }) : t('privacyReq.dueHint', { date: day(privacyDueOn(received, law)), days: PRIVACY_LAWS[law].days })}</p>
          </div>
          <label className="field">
            <span className="field__label">{t('privacyReq.note')}</span>
            <textarea className="input" rows={2} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="form__actions">
            <button type="button" className="btn btn--quiet" onClick={() => setAdding(false)}>
              <Icon name="close" size={16} />
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn btn--primary" disabled={!name.trim()}>
              <Icon name="check" size={16} />
              {t('privacyReq.save')}
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn" onClick={() => setAdding(true)}>
          <Icon name="plus" size={16} />
          {t('privacyReq.add')}
        </button>
      )}
    </section>
  );
}
