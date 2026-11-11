// The in-app list of notifications — always there, whatever else a person
// chose (chat, email or nothing).
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Notification } from '../../../shared/src/model';
import { get, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { navigate } from '../lib/router';
import { relativeTime } from '../lib/time';

export function Bell() {
  const { t } = useI18n();
  const [data, setData] = useState<{ notifications: Notification[]; unread: number }>({ notifications: [], unread: 0 });
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const load = useCallback(() => get<{ notifications: Notification[]; unread: number }>('/notifications').then(setData).catch(() => undefined), []);

  useEffect(() => {
    void load();
    const id = setInterval(load, 60_000);
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);
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
      navigate(u.pathname + u.search);
    }
  };

  return (
    <div className="bell" ref={ref}>
      <button className="bell__btn" aria-haspopup="dialog" aria-expanded={open} aria-label={t('bell.label', { n: data.unread })} title={t('bell.label', { n: data.unread })} onClick={() => setOpen((o) => !o)}>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3a6 6 0 0 0-6 6v3.6L4.3 15.4A1 1 0 0 0 5.2 17h13.6a1 1 0 0 0 .9-1.6L18 12.6V9a6 6 0 0 0-6-6Zm0 19a2.5 2.5 0 0 0 2.4-2h-4.8A2.5 2.5 0 0 0 12 22Z" fill="currentColor" />
        </svg>
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
            <p className="muted bell__empty">{t('bell.empty')}</p>
          ) : (
            <ul className="bell__list">
              {data.notifications.map((n) => (
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
        </div>
      )}
    </div>
  );
}
