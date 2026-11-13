// The founder's "see all pages" dashboard: every screen the product has, grouped
// by area, each a live link so the founder can jump straight to it. The screens
// are read from a plain manifest (web/src/platform/pages-manifest.ts) — add a row
// there to add a link here. Owner/staff only; owner-only screens are hidden from
// anyone who is not the platform owner.
import { useEffect, useState } from 'react';
import { EmptyState, SkeletonRows } from '../components/Empty';
import { Icon } from '../components/icons';
import { get } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { navigate } from '../lib/router';
import type { MessageKey } from '../../../shared/src/i18n';
import type { PlatformAccess } from '../../../shared/src/platform';
import { PAGE_AREAS } from '../platform/pages-manifest';

export function FounderPagesPage() {
  const { t } = useI18n();
  const [access, setAccess] = useState<PlatformAccess | null>(null);

  useEffect(() => {
    let live = true;
    get<PlatformAccess>('/platform/access')
      .then((a) => live && setAccess(a))
      .catch(() => live && setAccess({ owner: false, staff: false, platform: false }));
    return () => {
      live = false;
    };
  }, []);

  if (!access) return <div className="pf"><SkeletonRows rows={5} label={t('common.loading')} /></div>;
  if (!access.platform) {
    return (
      <div className="pf">
        <EmptyState icon="lock" title={t('platform.denied' as MessageKey)} />
      </div>
    );
  }

  const go = (to: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    navigate(to);
  };

  return (
    <div className="pf pf-founder">
      <header className="pf__head">
        <div>
          <h1 className="pf__title">{t('founder.title' as MessageKey)}</h1>
          <p className="pf__sub">{t('founder.subtitle' as MessageKey)}</p>
        </div>
      </header>

      {PAGE_AREAS.map((area) => {
        const pages = area.pages.filter((p) => !p.owner || access.owner);
        if (pages.length === 0) return null;
        return (
          <section className="pf-area" key={area.labelKey}>
            <h2 className="pf-area__title">{t(area.labelKey as MessageKey)}</h2>
            <div className="pf-area__grid">
              {pages.map((p) => (
                <a key={p.path} className="pf-pagelink" href={p.path} onClick={go(p.path)}>
                  <span className="pf-pagelink__label">{t(p.labelKey as MessageKey)}</span>
                  <code className="pf-pagelink__path">{p.path}</code>
                  <Icon name="external" size={14} className="pf-pagelink__go" />
                </a>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
