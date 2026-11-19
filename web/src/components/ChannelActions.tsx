// Two actions on a customer's timeline that go out through a connected tool:
//   WhatsAppReply  under a WhatsApp message: answer from the company's own number (free text within 24 hours of the
//                  customer's last message; after that WhatsApp only accepts an approved template, so the form offers
//                  one). POST /connections/:id/whatsapp/send, logged as a note.
//   CalendarPlan   above the timeline: put a meeting with the customer's people in the connected calendar
//                  (Google or Outlook); the calendar sends the invitations. POST /connections/:id/calendar/events.
// Both are shown only where such a connection exists (Timeline.tsx finds it, like the mail reply).
import { useState, type FormEvent } from 'react';
import type { MessageKey } from '../../../shared/src/i18n';
import type { Activity } from '../../../shared/src/timeline';
import { ApiFailure, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useStore } from '../lib/store';
import { Icon } from './icons';

/** The sender's number out of a WhatsApp note ("WhatsApp · Name +905…"). */
export const whatsappNumber = (body: string) => /^WhatsApp · .*?\+(\d{7,20})\s*$/m.exec(body.split('\n')[0] ?? '')?.[1] ?? null;

export function WhatsAppReply({ connectionId, accountId, activity, onSent }: { connectionId: string; accountId: string; activity: Activity; onSent: () => void }) {
  const { t } = useI18n();
  const { toast } = useStore();
  const to = whatsappNumber(activity.body);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [template, setTemplate] = useState('');
  const [language, setLanguage] = useState('en');
  const [needsTemplate, setNeedsTemplate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!to) return null;

  const send = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post(`/connections/${connectionId}/whatsapp/send`, needsTemplate ? { accountId, to: `+${to}`, template: { name: template.trim(), language: language.trim() } } : { accountId, to: `+${to}`, body: text.trim(), inReplyTo: activity.externalId ?? undefined });
      toast(t('whatsapp.reply.sent' as MessageKey));
      setOpen(false);
      setText('');
      onSent();
    } catch (err) {
      const reason = err instanceof ApiFailure ? String((err.body as any)?.reason ?? err.body.message ?? '') : '';
      if (reason.startsWith('131047')) {
        setNeedsTemplate(true);
        setError(t('whatsapp.reply.window' as MessageKey));
      } else setError(err instanceof ApiFailure ? err.body.message : t('errors.server'));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div className="tl__reply">
        <button type="button" className="btn btn--quiet btn--small" onClick={() => setOpen(true)}>
          <Icon name="send" size={14} />
          {t('whatsapp.reply.action' as MessageKey)}
        </button>
      </div>
    );
  }
  const ready = needsTemplate ? /^[a-z0-9_]{1,512}$/.test(template.trim()) && /^[a-z]{2,3}(_[A-Z]{2})?$/.test(language.trim()) : text.trim().length > 0;
  return (
    <form className="tl__compose tl__reply tl__reply--open" onSubmit={send}>
      {needsTemplate ? (
        <div className="form__row">
          <label className="field">
            <span className="field__label">{t('whatsapp.reply.template' as MessageKey)}</span>
            <input className="input" value={template} placeholder="renewal_reminder" onChange={(e) => setTemplate(e.target.value)} />
          </label>
          <label className="field">
            <span className="field__label">{t('whatsapp.reply.language' as MessageKey)}</span>
            <input className="input" value={language} placeholder="en_US" onChange={(e) => setLanguage(e.target.value)} />
          </label>
        </div>
      ) : (
        <textarea className="input" rows={3} value={text} maxLength={4096} placeholder={t('whatsapp.reply.placeholder' as MessageKey)} onChange={(e) => setText(e.target.value)} />
      )}
      {error && (
        <div className="notice notice--error" role="alert">
          {error}
        </div>
      )}
      <div className="toolbar">
        <button className="btn btn--primary btn--small" disabled={!ready || busy}>
          <Icon name="send" size={15} />
          {busy ? t('mailbox.reply.sending' as MessageKey) : t('mailbox.reply.send' as MessageKey)}
        </button>
        <button type="button" className="btn btn--quiet btn--small" onClick={() => (setOpen(false), setError(null))}>
          {t('common.cancel')}
        </button>
        <span className="field__hint">{t('whatsapp.reply.hint' as MessageKey)}</span>
      </div>
    </form>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');
/** Tomorrow at 10:00, local, as a datetime-local value. */
const tomorrow = () => {
  const d = new Date(Date.now() + 86_400_000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T10:00`;
};

export function CalendarPlan({ connectionId, app, accountId, guests }: { connectionId: string; app: string; accountId: string; guests: string[] }) {
  const { t } = useI18n();
  const { toast } = useStore();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [start, setStart] = useState(tomorrow);
  const [minutes, setMinutes] = useState(30);
  const [who, setWho] = useState(guests.join(', '));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emails = who.split(/[\s,;]+/).map((x) => x.trim()).filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));

  const plan = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post(`/connections/${connectionId}/calendar/events`, { accountId, title: title.trim(), start: new Date(start).toISOString(), minutes, attendees: emails });
      toast(t('calendar.plan.done' as MessageKey, { app }));
      setOpen(false);
      setTitle('');
    } catch (err) {
      setError(err instanceof ApiFailure ? err.body.message : t('errors.server'));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button type="button" className="btn btn--quiet btn--small" data-tour="calendar-plan" onClick={() => setOpen(true)}>
        <Icon name="calendar" size={14} />
        {t('calendar.plan.action' as MessageKey, { app })}
      </button>
    );
  }
  return (
    <form className="tl__compose tl__reply--open" onSubmit={plan}>
      <label className="field">
        <span className="field__label">{t('calendar.plan.title' as MessageKey)}</span>
        <input className="input" value={title} maxLength={300} required onChange={(e) => setTitle(e.target.value)} />
      </label>
      <div className="form__row">
        <label className="field">
          <span className="field__label">{t('calendar.plan.when' as MessageKey)}</span>
          <input className="input" type="datetime-local" value={start} required onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">{t('calendar.plan.minutes' as MessageKey)}</span>
          <select className="select" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            {[15, 30, 45, 60, 90].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span className="field__label">{t('calendar.plan.guests' as MessageKey)}</span>
        <input className="input" value={who} placeholder="name@customer.com" onChange={(e) => setWho(e.target.value)} />
      </label>
      {error && (
        <div className="notice notice--error" role="alert">
          {error}
        </div>
      )}
      <div className="toolbar">
        <button className="btn btn--primary btn--small" disabled={busy || !title.trim() || !emails.length}>
          <Icon name="calendar" size={15} />
          {t('calendar.plan.send' as MessageKey, { app })}
        </button>
        <button type="button" className="btn btn--quiet btn--small" onClick={() => setOpen(false)}>
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}
