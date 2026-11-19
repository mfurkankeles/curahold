// The shared customer page: what each department has open for this customer, as
// counts. A department's own boards stay behind its wall; its band shows here only
// where the company lets this person's department see it (Settings → Departments).
import type { AccountDepartmentWork } from '../../../shared/src/model';
import { useDepartments } from '../lib/departments';
import { useI18n } from '../lib/i18n';

export function AccountDepartments({ work }: { work?: AccountDepartmentWork[] }) {
  const { t, fmtDate } = useI18n();
  const depts = useDepartments();
  // One department is the whole company: the band above already says it all.
  if (!work || work.length < 2) return null;
  return (
    <section className="acc-depts" aria-label={t('acc.depts.title')}>
      <div className="acc-depts__row">
        {work.map((w) => (
          <div className="acc-depts__card" key={w.key} data-dept={w.key}>
            <span className="acc-depts__name">
              {depts.name(w.key)}
              {w.mine && <span className="acc-depts__mine">{t('acc.depts.mine')}</span>}
            </span>
            <span className="acc-depts__open">{w.open ? t('acc.depts.open', { n: w.open }) : t('acc.depts.none')}</span>
            {w.overdue > 0 && (
              <span className="acc-depts__sub" data-late>
                {t('acc.depts.overdue', { n: w.overdue })}
              </span>
            )}
            {w.nextDue && <span className="acc-depts__sub">{t('acc.depts.next', { date: fmtDate(w.nextDue, { day: 'numeric', month: 'short' }) })}</span>}
          </div>
        ))}
      </div>
    </section>
  );
}
