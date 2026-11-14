// The in-app list of notifications — always there, whatever else a person
// chose (chat, email or nothing).
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Notification } from '../../../shared/src/model';
import { get, post } from '../lib/api';
import { useLive } from '../lib/live';
import { useI18n } from '../lib/i18n';
import { navigate } from '../lib/router';
import { relativeTime } from '../lib/time';
import { EmptyState } from './Empty';
import { Icon } from './icons';

export function Bell() {
  const { t } = useI18n();
  const [data, setData] = useState<{ notifications: Notification[]; unread: number }>({ notifications: [], unread: 0 });
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // The number arrives with the live pulse; the list is asked for only when the bell is opened.
  const load = useCallback(
    () =>
      get<{ notifications: Notification[]; unread: number }>('/notifications?limit=20')
        .then((r) => {
          setData(r);
          window.dispatchEvent(new Event('app:inbox-changed'));
        })
        .catch(() => undefined),
    [],
  );
  const count = useCallback(() => get<{ unread: number }>('/notifications/count').then((r) => setData((d) => ({ ...d, unread: r.unread }))).catch(() => undefined), []);

  useEffect(() => {
    void count();
  }, [count]);
  // The number comes with the pulse; an open list follows it.
  useLive('unread', (p) => {
    setData((d) => ({ ...d, unread: p.unread }));
    if (open) void load();
  });
  useEffect(() => {
    if (open) void load();
  }, [open, load]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const openItem = async (n: Notification) => {
    setOpen(false);
    if (!n.readAt) await post('/notifications/read', { ids: [n.id] }).catch(() => undefined);
    void load();
    if (n.url) {
      const u = new URL(n.url, location.origin);
      // Keep the fragment: a help notice opens the person's requests at "#help".
      navigate(u.pathname + u.search + u.hash);
    }
  };

  return (
    <div className="bell" ref={ref}>
      <button className="bell__btn" aria-haspopup="dialog" aria-expanded={open} aria-label={t('bell.label', { n: data.unread })} title={t('bell.label', { n: data.unread })} onClick={() => setOpen((o) => !o)}>
        <Icon name="bell" size={19} />
        {data.unread > 0 && <span className="bell__count num">{data.unread > 99 ? '99+' : data.unread}</span>}
      </button>
      {open && (
        <div className="bell__pop" role="dialog" aria-label={t('bell.title')}>
          <div className="bell__head">
            <strong>{t('bell.title')}</strong>
            {data.unread > 0 && (
              <button className="btn btn--quiet btn--small" onClick={() => post('/notifications/read', { all: true }).then(load)}>
                {t('bell.readAll')}
              </button>
            )}
          </div>
          {data.notifications.length === 0 ? (
            <EmptyState compact icon="inbox" tone="done" title={t('bell.empty')} />
          ) : (
            <ul className="bell__list">
              {data.notifications.slice(0, 12).map((n) => (
                <li key={n.id}>
                  <button className="bell__item" data-unread={n.readAt ? undefined : 'true'} onClick={() => openItem(n)}>
                    <strong>{n.title}</strong>
                    {n.body && <span className="bell__body">{n.body}</span>}
                    <span className="muted bell__time">{relativeTime(n.createdAt, t)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <a
            className="bell__all"
            href="/inbox"
            onClick={(e) => {
              e.preventDefault();
              setOpen(false);
              navigate('/inbox');
            }}
          >
            {t('inbox.openAll')}
          </a>
        </div>
      )}
    </div>
  );
}
