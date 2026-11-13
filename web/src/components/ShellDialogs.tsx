// Dialogs the frame opens from anywhere: what is new, and a note on a customer.
import { docsHref, docsLink } from '../lib/docs';
import { useEffect } from 'react';
import { useI18n } from '../lib/i18n';
import { NEWS, markNewsSeen, type NewsAction } from '../lib/news';
import type { Locale } from '../../../shared/src/i18n';
import { Icon } from './icons';
import { Dialog } from './ui';

// Release notes are written English-first with a Turkish pass; every other
// locale reads the English until a native pass fills it in.
const pick = (m: { tr: string; en: string }, l: Locale) => (l === 'tr' ? m.tr : m.en);

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
          <a className="btn btn--quiet" href={docsHref(`${locale}/release-notes`)} {...docsLink}>
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
              <h3 className="news__title">{pick(n.title, locale)}</h3>
              <p className="news__body">{pick(n.body, locale)}</p>
              {n.action && (
                <button
                  className="btn btn--small"
                  onClick={() => {
                    onClose();
                    onAction(n.action!);
                  }}
                >
                  {pick(n.action.label, locale)}
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>
    </Dialog>
  );
}
