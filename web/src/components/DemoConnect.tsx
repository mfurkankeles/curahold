// In the try-it demo nothing can sign in to a real Slack or CRM: the page runs
// in the visitor's tab. The button is still there, and says what it does in the
// real product, so the demo shows how connecting goes.
import { Icon } from './icons';
import { useState } from 'react';
import { post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { navigate } from '../lib/router';
import { Dialog } from './ui';

export const IN_DEMO = !!import.meta.env.APP_DEMO;

export function DemoConnect({ app }: { app: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn--primary btn--small" onClick={() => setOpen(true)}>
        <Icon name="plug" size={16} />
        {t('conn.connect', { app })}
      </button>
      {open && (
        <Dialog
          title={t('conn.demo.title', { app })}
          onClose={() => setOpen(false)}
          footer={
            <button className="btn btn--primary" onClick={() => setOpen(false)}>
              {t('common.close')}
            </button>
          }
        >
          <ol className="steps-list">
            <li>{t('conn.demo.step1', { app })}</li>
            <li>{t('conn.demo.step2', { app })}</li>
            <li>{t('conn.demo.step3')}</li>
          </ol>
          <p className="field__hint">{t('conn.demo.note')}</p>
        </Dialog>
      )}
    </>
  );
}

/**
 * A CRM's own button in the demo. Nothing here can sign in to a real CRM, so a
 * pretend one with made-up data stands in — and from the consent step on it
 * is the real product: the same connection page, field matching and sync.
 */
export function DemoCrmConnect({ id, app, onError }: { id: string; app: string; onError: (e: unknown) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const allow = async () => {
    setBusy(true);
    try {
      const r = await post<{ id: string }>('/connections/demo', { as: id });
      setOpen(false);
      navigate(`/settings/sources/${r.id}`);
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button className="btn btn--primary btn--small" onClick={() => setOpen(true)}>
        <Icon name="plug" size={16} />
        {t('conn.connect', { app })}
      </button>
      {open && (
        <Dialog
          title={t('conn.demo.crm.title', { app })}
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setOpen(false)}>
                {t('common.cancel')}
              </button>
              <button className="btn btn--primary" disabled={busy} onClick={allow}>
                {t('conn.demo.crm.allow')}
              </button>
            </>
          }
        >
          <p>{t('conn.demo.crm.lede', { app })}</p>
          <p className="field__label">{t('conn.demo.crm.asks')}</p>
          <ul className="steps-list">
            <li>{t('conn.demo.crm.ask1')}</li>
            <li>{t('conn.demo.crm.ask2')}</li>
            <li>{t('conn.demo.crm.ask3')}</li>
          </ul>
          <p className="field__hint">{t('conn.demo.crm.note')}</p>
        </Dialog>
      )}
    </>
  );
}
