// The trash: what was deleted in the last 30 days. People see their own
// deletions; whoever runs the company or looks after privacy sees all of them
// and can also delete something for good.
import { useCallback, useEffect, useRef, useState } from 'react';
import { TRASH_KINDS, type TrashItem, type TrashKind, type TrashRestored } from '../../../shared/src/model';
import { EmptyState } from '../components/Empty';
import { Icon, type IconName } from '../components/icons';
import { Confirm } from '../components/ui';
import { ApiFailure, del, get, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { navigate } from '../lib/router';
import { useStore } from '../lib/store';
import { relativeTime } from '../lib/time';
import { placeOf } from '../lib/trash';

interface Answer {
  items: TrashItem[];
  more: boolean;
  manage: boolean;
  days: number;
}

const ICON: Record<TrashKind, IconName> = { account: 'building', record: 'idcard', task: 'checkCircle', activity: 'timeline', page: 'layout', report: 'chart', automation: 'zap' };
const PARTS = ['subtasks', 'records', 'entries', 'comments', 'files', 'portalPeople'] as const;
const ENTRY_KINDS = ['note', 'call', 'meeting', 'email', 'review'];
const DAY = 86_400_000;

export function TrashPage() {
  const { t, locale } = useI18n();
  const { me, person, toast } = useStore();
  const [data, setData] = useState<Answer | null>(null);
  const [text, setText] = useState('');
  const [kind, setKind] = useState<TrashKind | ''>('');
  const [busy, setBusy] = useState<string | null>(null);
  const [forever, setForever] = useState<TrashItem | null>(null);
  const asked = useRef(0);

  const load = useCallback(
    async (after?: TrashItem[]) => {
      const mine = ++asked.current;
      const query = new URLSearchParams();
      if (kind) query.set('kind', kind);
      if (text.trim()) query.set('q', text.trim());
      if (after?.length) query.set('before', after[after.length - 1].deletedAt);
      const r = await get<Answer>(`/trash?${query}`);
      // A slower, older answer never replaces a newer one.
      if (mine === asked.current) setData(after ? { ...r, items: [...after, ...r.items] } : r);
    },
    [kind, text],
  );
  useEffect(() => {
    const wait = setTimeout(() => void load().catch(() => undefined), text ? 250 : 0);
    return () => clearTimeout(wait);
  }, [load, text]);

  const fail = (e: unknown) => toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
  const nameOf = (i: Pick<TrashItem, 'kind' | 'label' | 'count'>) =>
    i.count > 1 ? t(i.kind === 'task' ? 'trash.fromImportTasks' : 'trash.fromImport', { n: i.count }) : i.label && i.label !== '-' ? i.label : t('trash.unnamed');
  const kindOf = (i: TrashItem) => {
    if (i.kind === 'record') return i.where.type?.[locale] ?? i.where.type?.en ?? i.where.type?.tr ?? t('trash.kind.record');
    if (i.kind === 'activity' && i.where.entry && ENTRY_KINDS.includes(i.where.entry)) return t(`timeline.kind.${i.where.entry}` as any);
    return t(`trash.kind.${i.kind}`);
  };
  const listOf = (parts: string[]) => {
    try {
      return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(parts);
    } catch {
      return parts.join(', ');
    }
  };
  const contentsOf = (i: TrashItem) => {
    const parts = PARTS.flatMap((p) => {
      const n = i.contents[p];
      return n ? [n === 1 ? t(`trash.part.${p}.one`) : t(`trash.part.${p}.many`, { n })] : [];
    });
    return parts.length ? t('trash.with', { list: listOf(parts) }) : null;
  };
  const leftOf = (i: TrashItem) => {
    const n = Math.ceil((Date.parse(i.purgeAt) - Date.now()) / DAY);
    return { n, text: n <= 0 ? t('trash.left.today') : n === 1 ? t('trash.left.one') : t('trash.left.many', { n }) };
  };

  const restore = async (i: TrashItem) => {
    setBusy(i.id);
    try {
      const { restored } = await post<{ restored: TrashRestored }>(`/trash/${i.id}/restore`);
      setData((d) => (d ? { ...d, items: d.items.filter((x) => x.id !== i.id) } : d));
      const lost = Object.values(restored.dropped).reduce((a, b) => a + b, 0);
      const to = placeOf(restored);
      const said = restored.already ? t('trash.already') : lost ? t('trash.restoredPartly', { name: nameOf(i), n: lost }) : t('trash.restored', { name: nameOf(i) });
      toast(said, 'info', to ? { label: t('trash.open'), run: () => navigate(to) } : undefined);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const days = data?.days ?? 30;
  const filtered = !!kind || !!text.trim();
  return (
    <>
      <header className="topbar">
        <div className="topbar__titles">
          <h1 className="topbar__title">{t('trash.title')}</h1>
          <p className="topbar__sub">{t(data?.manage ? 'trash.leadAll' : 'trash.leadMine', { days })}</p>
        </div>
      </header>
      <div className="page trashpage">
        <div className="toolbar trashpage__tools">
          <input className="input search" type="search" value={text} placeholder={t('trash.search')} aria-label={t('trash.search')} onChange={(e) => setText(e.target.value)} />
          <select className="select" value={kind} aria-label={t('trash.kind.all')} onChange={(e) => setKind(e.target.value as TrashKind | '')}>
            <option value="">{t('trash.kind.all')}</option>
            {TRASH_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`trash.kind.${k}`)}
              </option>
            ))}
          </select>
        </div>
        {data && data.items.length === 0 && (
          <div className="sheet">
            <EmptyState compact icon="trash" tone="calm" title={filtered ? t('trash.emptyFound') : t('trash.empty', { days })} />
          </div>
        )}
        {data && data.items.length > 0 && (
          <ul className="sheet trashlist">
            {data.items.map((i) => {
              const left = leftOf(i);
              const contents = contentsOf(i);
              const who = i.deletedBy === me.user.id ? null : (person(i.deletedBy)?.name ?? t('common.unknownUser'));
              const when = relativeTime(i.deletedAt, t);
              return (
                <li className="trashrow" key={i.id} data-kind={i.kind}>
                  <span className="trashrow__icon" aria-hidden="true">
                    <Icon name={ICON[i.kind]} size={18} />
                  </span>
                  <div className="trashrow__text">
                    <div className="trashrow__name">
                      <span className="trashrow__label">{nameOf(i)}</span>
                      <span className="badge">{kindOf(i)}</span>
                    </div>
                    {(i.where.board || i.where.account) && (
                      <div className="trashrow__where">
                        {i.where.board && <span>{i.where.board}</span>}
                        {i.where.account && <span>{i.where.account}</span>}
                      </div>
                    )}
                    {contents && <div className="trashrow__with">{contents}</div>}
                    <div className="trashrow__meta">
                      <span>{who ? t('trash.by', { name: who, when }) : t('trash.byMe', { when })}</span>
                      <span className="trashrow__left" data-soon={left.n <= 3 || undefined}>
                        {left.text}
                      </span>
                    </div>
                  </div>
                  <div className="trashrow__actions">
                    <button className="btn btn--small" disabled={busy === i.id} onClick={() => void restore(i)}>
                      <Icon name="undo" size={15} /> {t('trash.restore')}
                    </button>
                    {data.manage && (
                      <button className="btn btn--small btn--quiet trashrow__forever" disabled={busy === i.id} onClick={() => setForever(i)}>
                        {t('trash.forever')}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {data?.more && (
          <div className="trashpage__more">
            <button className="btn" onClick={() => void load(data.items).catch(fail)}>
              {t('trash.more')}
            </button>
          </div>
        )}
      </div>
      {forever && (
        <Confirm
          title={t('trash.foreverTitle', { name: nameOf(forever) })}
          body={t('trash.foreverBody')}
          confirmLabel={t('trash.forever')}
          danger
          onClose={() => setForever(null)}
          onConfirm={async () => {
            try {
              await del(`/trash/${forever.id}`);
              setData((d) => (d ? { ...d, items: d.items.filter((x) => x.id !== forever.id) } : d));
              toast(t('trash.forevered'));
            } catch (e) {
              fail(e);
            }
          }}
        />
      )}
    </>
  );
}
