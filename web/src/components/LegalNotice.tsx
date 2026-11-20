// The small legal notice at the foot of the sign-in, sign-up, trial and
// onboarding pages (and, with the keys written out, the portal's foot):
// copyright with the right years, Curahold™, and the copyright/trade-secret line.
// Only true statements: no patent claim (shared/src/compliance/notice.ts).
import type { MessageKey, Vars } from '../../../shared/src/i18n';
import { copyrightYears } from '../../../shared/src/compliance/notice';
import './legalNotice.css';

/** The short legal line under sign-in and sign-up forms (terms and privacy links). */
export function LegalNotice({ t }: { t: (k: MessageKey, v?: Vars) => string }) {
  return (
    <p className="legal-notice">
      <span>{t('legal.notice.rights', { years: copyrightYears() })}</span> <span>{t('legal.notice.protected')}</span>
    </p>
  );
}
