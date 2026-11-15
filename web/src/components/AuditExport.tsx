// Settings → Activity log: download the whole log (a fresh confirmation first,
// lib/api.ts asks). Each row carries a running SHA-256; the last one is also
// written to the log itself, so the file handed out can be checked later.
import { useState } from 'react';
import { get } from '../lib/api';
import { download } from '../lib/export';
import { useI18n } from '../lib/i18n';
import { useSaver } from '../lib/saver';

interface Row {
  at: string;
  actorName: string | null;
  actorEmail: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  meta: Record<string, unknown>;
  chain: string;
}

export function AuditExport() {
  const { t, locale } = useI18n();
  const save = useSaver();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn btn--small"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await save(async () => {
          const r = await get<{ entries: Row[]; digest: string }>('/admin/audit/export');
          download(
            {
              name: t('settings.tab.audit'),
              headers: [t('settings.audit.when'), t('settings.audit.who'), t('settings.audit.email'), t('settings.audit.what'), t('settings.audit.entity'), 'Id', t('settings.audit.details'), 'SHA-256'],
              rows: r.entries.map((e) => [e.at, e.actorName, e.actorEmail, e.action, e.entity, e.entityId, JSON.stringify(e.meta), e.chain]),
            },
            'csv',
            locale,
          );
        }, t('settings.audit.exported'));
        setBusy(false);
      }}
    >
      {t('settings.audit.export')}
    </button>
  );
}
