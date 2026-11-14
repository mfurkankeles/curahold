// Reply to a customer's email from their timeline. A mail activity that came
// from a connected mailbox (Gmail/Outlook) gets a "Reply" button; it opens an
// inline composer pre-filled from the original, and sending calls
// POST /connections/:id/mail/reply, which sends from the mailbox and logs the
// reply as a new outgoing activity on the same customer. The composer is only
// rendered by the timeline when such a connection exists (see Timeline.tsx).
import { useMemo, useState, type FormEvent } from 'react';
import type { MessageKey } from '../../../shared/src/i18n';
import type { Activity } from '../../../shared/src/timeline';
import { ApiFailure, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { looksLikeEmail, parseMailHeader, replyPayload, replySubject } from '../lib/mailReply';
import { useStore } from '../lib/store';
import { Icon } from './icons';

export { MAILBOX_PROVIDERS, isMailboxProvider } from '../lib/mailReply';

export function MailReply({ connectionId, accountId, activity, onSent }: { connectionId: string; accountId: string; activity: Activity; onSent: () => void }) {
  const { t } = useI18n();
  const { toast } = useStore();
  const seed = useMemo(() => parseMailHeader(activity.body), [activity.body]);
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(seed.to);
  const [subject, setSubject] = useState(replySubject(seed.subject));
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = looksLikeEmail(to) && subject.trim().length > 0 && text.trim().length > 0;

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const sent = await post<{ ok: boolean; id: string }>(`/connections/${connectionId}/mail/reply`, replyPayload(activity, accountId, { to, subject, body: text }));
      if (!sent.ok) throw new Error('not_logged');
      toast(t('mailbox.reply.sent' as MessageKey));
      setText('');
      setOpen(false);
      onSent();
    } catch (err) {
      setError(err instanceof ApiFailure ? err.body.message : t('errors.server'));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div className="tl__reply">
        <button type="button" className="btn btn--quiet btn--small" onClick={() => setOpen(true)}>
          <Icon name="mail" size={14} />
          {t('mailbox.reply.action' as MessageKey)}
        </button>
      </div>
    );
  }

  return (
    <form className="tl__compose tl__reply tl__reply--open" onSubmit={send}>
      <label className="field">
        <span className="field__label">{t('mailbox.reply.to' as MessageKey)}</span>
        <input className="input" type="email" value={to} maxLength={254} onChange={(e) => setTo(e.target.value)} />
      </label>
      <label className="field">
        <span className="field__label">{t('mailbox.reply.subject' as MessageKey)}</span>
        <input className="input" type="text" value={subject} maxLength={500} onChange={(e) => setSubject(e.target.value)} />
      </label>
      <textarea
        className="input"
        rows={4}
        value={text}
        maxLength={20000}
        placeholder={t('mailbox.reply.placeholder' as MessageKey)}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && send(e as unknown as FormEvent)}
      />
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
        <span className="field__hint">{t('mailbox.reply.hint' as MessageKey)}</span>
      </div>
    </form>
  );
}
