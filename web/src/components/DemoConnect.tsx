// In the try-it demo nothing can sign in to a real Slack or CRM: the page runs
// in the visitor's tab. The button is still there, and says what it does in the
// real product, so the demo shows how connecting goes.
import { useState } from 'react';
import { useI18n } from '../lib/i18n';
import { Dialog } from './ui';

export const IN_DEMO = !!import.meta.env.APP_DEMO;

export function DemoConnect({ app }: { app: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn--primary btn--small" onClick={() => setOpen(true)}>
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
