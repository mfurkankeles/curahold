import { useEffect, useState } from 'react';
import type { SessionInfo } from '../../../shared/src/model';
import { del, get } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { relativeTime } from '../lib/time';

export function DevicesPage() {
  const { t } = useI18n();
  const [data, setData] = useState<{ sessions: SessionInfo[]; maxDevices: number } | null>(null);
  const load = () => get<{ sessions: SessionInfo[]; maxDevices: number }>('/me/sessions').then(setData);
  useEffect(() => {
    void load();
  }, []);
  return (
    <>
      <header className="topbar">
        <h1 className="topbar__title">{t('devices.title')}</h1>
      </header>
      <div className="page">
        <div className="sheet" style={{ maxWidth: 640 }}>
          {data && <p className="sheet__hint">{t('devices.hint', { max: data.maxDevices })}</p>}
          {data?.sessions.map((s) => (
            <div key={s.id} className="filerow" style={{ borderTop: '1px solid var(--line)', padding: '12px 0' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>
                  {s.deviceLabel || t('devices.unknown')} {s.current && <span className="badge badge--active">{t('devices.thisDevice')}</span>}
                </div>
                <div className="muted" style={{ fontSize: 13 }}>
                  {t('devices.lastSeen', { when: relativeTime(s.lastSeenAt, t) })}
                </div>
              </div>
              <button
                className="btn btn--small"
                onClick={async () => {
                  await del(`/me/sessions/${s.id}`);
                  if (s.current) location.href = '/login';
                  else void load();
                }}
              >
                {t('devices.signOut')}
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
