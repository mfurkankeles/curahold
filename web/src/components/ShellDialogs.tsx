// Dialogs the frame opens from anywhere: what is new, and a note on a customer.
import { useEffect, useState } from 'react';
import { ACTIVITY_KINDS, type ActivityKind } from '../../../shared/src/timeline';
import { ApiFailure, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { NEWS, markNewsSeen, type NewsAction } from '../lib/news';
import { navigate } from '../lib/router';
import { useStore } from '../lib/store';
import { AccountPicker } from './AccountPicker';
import { Icon, type IconName } from './icons';
import { Dialog } from './ui';

export function WhatsNew({ onClose, onAction }: { onClose: () => void; onAction: (a: NewsAction) => void }) {
  const { t, locale, fmtDate } = useI18n();
  useEffect(() => markNewsSeen(), []);
  return (
    <Dialog
      title={t('news.title')}
      onClose={onClose}
      wide
      footer={
        <>
          <a className="btn btn--quiet" href={`/docs/${locale}/release-notes`} target="_blank" rel="noreferrer">
            {t('news.all')}
            <Icon name="external" size={14} />
          </a>
          <button className="btn" onClick={onClose}>
            {t('common.close')}
          </button>
        </>
      }
    >
      <ol className="news">
        {NEWS.map((n) => (
          <li key={n.id} className="news__item">
            <time className="news__date" dateTime={n.date}>
              {fmtDate(n.date, { day: 'numeric', month: 'long' })}
            </time>
            <div className="news__text">
              <h3 className="news__title">{n.title[locale]}</h3>
              <p className="news__body">{n.body[locale]}</p>
              {n.action && (
                <button
                  className="btn btn--small"
                  onClick={() => {
                    onClose();
                    onAction(n.action!);
                  }}
                >
                  {n.action.label[locale]}
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>
    </Dialog>
  );
}

const KIND_ICON: Record<ActivityKind, IconName> = { note: 'note', call: 'phone', meeting: 'people', email: 'mail', review: 'handshake' };

/** A call, meeting, email or note on a customer, from anywhere. */
export function LogTouch({ accountId, accountName, kind: asked, onClose }: { accountId?: string | null; accountName?: string | null; kind?: ActivityKind; onClose: () => void }) {
  const { t, words } = useI18n();
  const { toast } = useStore();
  const [account, setAccount] = useState<{ id: string | null; name: string | null }>({ id: accountId ?? null, name: accountName ?? null });
  const [kind, setKind] = useState<ActivityKind>(asked ?? 'call');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ready = !!account.id && !!text.trim();
  const save = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError('');
    try {
      await post(`/accounts/${account.id}/activities`, { kind, body: text.trim() });
      const id = account.id!;
      toast(t('touch.saved', { account: account.name ?? '' }), 'info', { label: t('touch.open'), run: () => navigate(`/accounts/${id}`) });
      window.dispatchEvent(new Event('tw:timeline-changed'));
      onClose();
    } catch (e) {
      setError(e instanceof ApiFailure ? e.body.message : t('errors.server'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      title={t('touch.title')}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--quiet" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn--primary" disabled={!ready || busy} onClick={save}>
            {busy ? t('common.saving') : t('timeline.add')}
          </button>
        </>
      }
    >
      <div className="field">
        <span className="field__label">{words.one}</span>
        <AccountPicker value={account.id} name={account.name} onChange={(id, name) => setAccount({ id, name: name ?? null })} />
      </div>
      <div className="field">
        <span className="field__label">{t('timeline.kindLabel')}</span>
        <div className="kindpick" role="radiogroup" aria-label={t('timeline.kindLabel')}>
          {ACTIVITY_KINDS.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} className="kindpick__btn" onClick={() => setKind(k)}>
              <Icon name={KIND_ICON[k]} size={16} />
              {t(`timeline.kind.${k}` as any)}
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        <span className="sr-only">{t('timeline.kindLabel')}</span>
        <textarea
          className="textarea"
          value={text}
          placeholder={t(`timeline.placeholder.${kind}` as any)}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void save();
            }
          }}
          maxLength={20000}
        />
        <span className="field__hint">{t('timeline.addHint')}</span>
      </label>
      {error && <p className="error-text">{error}</p>}
    </Dialog>
  );
}
