// Accounts: the customers the team looks after. A sortable list with the
// company's own fields, bulk changes, import with undo, and a page per
// account with its tasks.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { labelOf } from '../../../shared/src/fields';
import { calculated, type Account, type AccountField, type Task } from '../../../shared/src/model';
import type { LinkInfo } from '../../../shared/src/records';
import { useRecordTypes } from '../components/AccountFields';
import { Importer } from '../components/Importer';
import { ExportMenu } from '../components/Export';
import { allPages, cellOf } from '../lib/export';
import { AccountRecords, OpenIn, RecordTabs } from '../components/Records';
import { PROVIDER_NAMES } from '../components/Connections';
import { Avatar, Confirm, Dialog, DueLabel } from '../components/ui';
import { ApiFailure, del, get, patch, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { navigate, useLocation } from '../lib/router';
import { useStore } from '../lib/store';
import { AccountTimeline, HealthBadge, ScoreChip } from '../components/Timeline';
import { PortalPeople } from '../components/PortalAdmin';
import { AccountCards, RenewalsView, SIGNAL_FILTERS, WhitespaceView, keyFields, matchesSignal, signalsOf, type SignalFilter } from '../components/AccountViews';
import { relativeTime } from '../lib/time';
import { EmptyState, SkeletonCards, SkeletonRows } from '../components/Empty';
import { Icon } from '../components/icons';
import { parseQuick } from '../lib/quickparse';
import { tasksChanged, usePageDefaults } from '../lib/shell';
import { PlanMenu } from '../components/Plans';
import { ReviewField, ReviewsView } from '../components/Rhythm';
import { hoursText } from './Reports';

/** A choice shown in its colour when it has one; anything else as plain text. */
export function OptionValue({ field, value, text }: { field: AccountField; value: unknown; text: string }) {
  if (field.health) return <ScoreChip value={value} />;
  const color = field.type === 'select' ? field.options?.find((o) => o.key === value)?.color : undefined;
  if (!color || !text) return <>{text}</>;
  return (
    <span className="optchip" data-color={color}>
      {text}
    </span>
  );
}

export function useFieldFormat() {
  const { locale } = useI18n();
  const { me } = useStore();
  const tag = locale === 'tr' ? 'tr-TR' : 'en-GB';
  return useCallback(
    (f: AccountField, v: unknown): string => {
      if (v === null || v === undefined || v === '') return '';
      if (f.type === 'money') {
        try {
          return new Intl.NumberFormat(tag, { style: 'currency', currencyDisplay: 'narrowSymbol', currency: me.org.currency, maximumFractionDigits: 0 }).format(Number(v));
        } catch {
          return String(v);
        }
      }
      if (f.type === 'number') return new Intl.NumberFormat(tag).format(Number(v));
      if (f.type === 'date') return new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${v}T12:00:00Z`));
      if (f.type === 'select') return labelOf(f.options?.find((o) => o.key === v)?.label, locale) || String(v);
      if (f.type === 'url') return String(v).replace(/^https?:\/\//, '').replace(/\/$/, '');
      return String(v);
    },
    [tag, me.org.currency, locale],
  );
}

export function AccountsPage() {
  const { t, words, locale } = useI18n();
  const { me, people, person, can, canWrite, toast } = useStore();
  const fmt = useFieldFormat();
  const [q, setQ] = useState('');
  const [owner, setOwner] = useState<'all' | 'me' | string>(() => new URLSearchParams(location.search).get('owner') ?? 'all');
  const [archived, setArchived] = useState(false);
  const [data, setData] = useState<{ accounts: Account[]; total: number } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: 'name', dir: 1 });
  const [importing, setImporting] = useState(false);
  const [creating, setCreating] = useState(false);
  // "+ New → Customer" from anywhere opens the form here.
  const { search: qs } = useLocation();
  useEffect(() => {
    if (new URLSearchParams(qs).get('new') !== '1') return;
    setCreating(true);
    navigate('/accounts', true);
  }, [qs]);
  const [bulkOwner, setBulkOwner] = useState('');
  const manage = can('accounts.manage');
  const fields = me.org.accountFields.slice(0, 5);
  const { types } = useRecordTypes();
  const { search: qs0 } = useLocation();
  // How the list is shown, remembered on this device: cards say what needs attention.
  const remembered = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
    try {
      const v = localStorage.getItem(key) as T | null;
      return v && allowed.includes(v) ? v : fallback;
    } catch {
      return fallback;
    }
  };
  const VIEWS = ['cards', 'table', 'renewals', 'reviews', 'products'] as const;
  // The menu's "Renewals" opens this page on that view (?view=renewals).
  const asked = new URLSearchParams(qs0).get('view') as (typeof VIEWS)[number] | null;
  const [view, setViewState] = useState<(typeof VIEWS)[number]>(() => (asked && VIEWS.includes(asked) ? asked : remembered('tw_accounts_view', VIEWS, 'cards')));
  useEffect(() => {
    if (asked && VIEWS.includes(asked)) setViewState(asked);
    else if (!asked) setViewState(remembered('tw_accounts_view', VIEWS, 'cards'));
  }, [asked]); // eslint-disable-line react-hooks/exhaustive-deps
  const setView = (v: (typeof VIEWS)[number]) => {
    setViewState(v);
    if (asked) navigate('/accounts', true);
    try {
      localStorage.setItem('tw_accounts_view', v);
    } catch {
      /* per-viewer convenience */
    }
  };
  const CARD_SORTS = ['attention', 'name', 'health', 'value', 'renewal', 'open'] as const;
  const [cardSort, setCardSort] = useState<(typeof CARD_SORTS)[number]>(() => remembered('tw_accounts_sort', CARD_SORTS, 'attention'));
  const [signal, setSignal] = useState<SignalFilter>('');
  const { renewal: renewalField, value: valueField } = keyFields(me.org.accountFields);
  const defaultShown = [valueField, renewalField].filter(Boolean).map((f) => f!.key);
  const [shownKeys, setShownKeys] = useState<string[]>(() => {
    try {
      const v = JSON.parse(localStorage.getItem('tw_accounts_card_fields') ?? 'null');
      return Array.isArray(v) ? v : defaultShown;
    } catch {
      return defaultShown;
    }
  });
  const shown = me.org.accountFields.filter((f) => shownKeys.includes(f.key) && f.key !== 'health_score');
  const toggleShown = (key: string) => {
    const next = shownKeys.includes(key) ? shownKeys.filter((k) => k !== key) : [...shownKeys, key].slice(-6);
    setShownKeys(next);
    try {
      localStorage.setItem('tw_accounts_card_fields', JSON.stringify(next));
    } catch {
      /* per-viewer convenience */
    }
  };

  const load = useCallback(async () => {
    const p = new URLSearchParams({ limit: '500', signals: '1' });
    if (q.trim()) p.set('q', q.trim());
    if (owner !== 'all') p.set('owner', owner);
    if (archived) p.set('archived', '1');
    setData(await get(`/accounts?${p}`));
  }, [q, owner, archived]);
  useEffect(() => {
    const id = setTimeout(() => void load(), 200);
    return () => clearTimeout(id);
  }, [load]);

  const rows = useMemo(() => {
    const list = [...(data?.accounts ?? [])];
    const val = (a: Account): string | number => {
      if (sort.key === 'name') return a.name.toLocaleLowerCase(locale);
      if (sort.key === 'owner') return person(a.ownerId)?.name ?? '~';
      if (sort.key === 'open') return a.openTasks ?? 0;
      if (sort.key === 'activity') return a.lastActivityAt ?? '';
      const v = a.fields[sort.key];
      return v === null || v === undefined ? (sort.dir === 1 ? '￿' : '') : (v as any);
    };
    return list.sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [data, sort, person, locale]);

  const signalRows = useMemo(() => {
    const list = (data?.accounts ?? []).map((a) => ({ a, ...signalsOf(a, me.org.accountFields, me.org.health, t, me.org.rhythm?.reviewDays ?? 0) }));
    const num = (v: unknown) => (typeof v === 'number' ? v : v === null || v === undefined || v === '' ? null : Number(v));
    const by: Record<string, (x: (typeof list)[number], y: (typeof list)[number]) => number> = {
      attention: (x, y) => y.attention - x.attention,
      name: () => 0,
      health: (x, y) => (num(x.a.fields.health_score) ?? 999) - (num(y.a.fields.health_score) ?? 999),
      value: (x, y) => (valueField ? (num(y.a.fields[valueField.key]) ?? -1) - (num(x.a.fields[valueField.key]) ?? -1) : 0),
      renewal: (x, y) => (renewalField ? String(x.a.fields[renewalField.key] ?? '9999').localeCompare(String(y.a.fields[renewalField.key] ?? '9999')) : 0),
      open: (x, y) => (y.a.openTasks ?? 0) - (x.a.openTasks ?? 0),
    };
    return list
      .filter((r) => matchesSignal(signal, r.chips, r.attention))
      .sort((x, y) => by[cardSort](x, y) || x.a.name.localeCompare(y.a.name, locale));
  }, [data, me.org.accountFields, me.org.health, me.org.rhythm?.reviewDays, t, signal, cardSort, valueField, renewalField, locale]);
  const needing = signalRows.filter((r) => r.attention > 0).length;
  const atStake = valueField
    ? signalRows.filter((r) => r.band === 'risk' || r.chips.some((c) => c.key === 'renewal' && c.tone !== 'slate')).reduce((n, r) => n + (Number(r.a.fields[valueField.key]) || 0), 0)
    : 0;

  const head = (key: string, label: string) => (
    <th aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
      <button className="th-sort" onClick={() => setSort({ key, dir: sort.key === key ? (sort.dir === 1 ? -1 : 1) : 1 })}>
        {label}
        {sort.key === key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
      </button>
    </th>
  );

  const bulk = async (body: Record<string, unknown>, msg: string) => {
    try {
      const r = await post<{ updated: number; undoId: string | null }>('/accounts/bulk', { ids: [...selected], ...body });
      toast(
        t(msg as any, { n: r.updated }),
        'info',
        r.undoId
          ? {
              label: t('undo.button'),
              run: async () => {
                await post(`/undo/${r.undoId}`);
                toast(t('undo.done'));
                await load();
              },
            }
          : undefined,
      );
      setSelected(new Set());
      setBulkOwner('');
      await load();
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    }
  };

  const allOn = rows.length > 0 && rows.every((a) => selected.has(a.id));
  return (
    <>
      <header className="topbar">
        <h1 className="topbar__title">{words.other}</h1>
        {data && <span className="topbar__sub num">{t('accounts.total', { n: data.total })}</span>}
        <div className="topbar__spacer" />
        <ExportMenu
          disabled={!data?.total}
          make={async () => {
            const base = new URLSearchParams({ limit: '500' });
            if (q.trim()) base.set('q', q.trim());
            if (owner !== 'all') base.set('owner', owner);
            if (archived) base.set('archived', '1');
            const list = await allPages(async (offset) => {
              base.set('offset', String(offset));
              const r = await get<{ accounts: Account[]; total: number }>(`/accounts?${base}`);
              return { items: r.accounts, total: r.total };
            });
            const defs = me.org.accountFields;
            return {
              name: words.other,
              headers: [t('accounts.name'), t('accounts.owner'), ...defs.map((f) => labelOf(f.label, locale)), t('accounts.openTasks'), t('accounts.lastActivity')],
              rows: list.map((a) => [
                a.name,
                person(a.ownerId)?.name ?? '',
                ...defs.map((f) => cellOf(f, a.fields[f.key], locale)),
                a.openTasks ?? 0,
                a.lastActivityAt ? a.lastActivityAt.slice(0, 10) : '',
              ]),
            };
          }}
        />
        {manage && can('accounts.view_all') && canWrite && (
          <button className="btn" onClick={() => setImporting(true)}>
            {t('accounts.import')}
          </button>
        )}
        {canWrite && (
          <button className="btn btn--primary" onClick={() => setCreating(true)}>
            <Icon name="plus" size={16} />
            {t('accounts.new')}
          </button>
        )}
      </header>
      <div className="page">
        <RecordTabs current="accounts" types={types} />
        <div className="viewbar">
          <div className="seg seg--views" role="tablist" aria-label={t('acards.viewLabel')}>
            {VIEWS.map((v) => (
              <button key={v} role="tab" aria-selected={view === v} aria-pressed={view === v} onClick={() => setView(v)}>
                <Icon name={({ cards: 'cards', table: 'list', renewals: 'calendar', reviews: 'handshake', products: 'target' } as const)[v]} size={15} />
                {t(`acards.view.${v}` as any)}
              </button>
            ))}
          </div>
          {data && (view === 'cards' || view === 'table') && (
            <p className="viewbar__lead">
              {t('acards.lead', { n: signalRows.length })}
              {needing > 0 && (
                <>
                  {' '}
                  <button className="linkbtn" onClick={() => setSignal(signal === 'attention' ? '' : 'attention')}>
                    {t('acards.needing', { n: needing })}
                  </button>
                </>
              )}
              {atStake > 0 && valueField && <> {t('acards.stakeLead', { value: fmt(valueField, atStake) })}</>}
            </p>
          )}
        </div>
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <input className="input search" type="search" value={q} placeholder={t('accounts.search')} aria-label={t('accounts.search')} onChange={(e) => setQ(e.target.value)} />
          <div className="seg">
            <button aria-pressed={owner === 'all'} onClick={() => setOwner('all')}>
              {t('accounts.filter.all')}
            </button>
            <button aria-pressed={owner === 'me'} onClick={() => setOwner('me')}>
              {t('accounts.filter.mine')}
            </button>
          </div>
          <select className="select" value={owner !== 'all' && owner !== 'me' ? owner : ''} aria-label={t('accounts.owner')} onChange={(e) => setOwner(e.target.value || 'all')}>
            <option value="">{t('accounts.anyOwner')}</option>
            {people
              .filter((p) => p.status !== 'deleted')
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
          {(view === 'cards' || view === 'renewals' || view === 'reviews') && (
            <select className="select" value={signal} aria-label={t('acards.signalFilter')} onChange={(e) => setSignal(e.target.value as SignalFilter)}>
              <option value="">{t('acards.signal.any')}</option>
              {SIGNAL_FILTERS.map((s) => (
                <option key={s} value={s}>
                  {t(`acards.signal.${s}` as any)}
                </option>
              ))}
            </select>
          )}
          {view === 'cards' && (
            <>
              <select
                className="select"
                value={cardSort}
                aria-label={t('acards.sortLabel')}
                onChange={(e) => {
                  const v = e.target.value as (typeof CARD_SORTS)[number];
                  setCardSort(v);
                  try {
                    localStorage.setItem('tw_accounts_sort', v);
                  } catch {
                    /* per-viewer convenience */
                  }
                }}
              >
                {CARD_SORTS.filter((s) => (s !== 'value' || valueField) && (s !== 'renewal' || renewalField) && (s !== 'health' || me.org.health?.enabled)).map((s) => (
                  <option key={s} value={s}>
                    {t(`acards.sort.${s}` as any)}
                  </option>
                ))}
              </select>
            </>
          )}
          <details className="fieldsmenu">
            <summary className="btn" aria-label={t('acards.viewOptions')}>
              <Icon name="sliders" size={16} />
              <span className="hide-phone">{t('acards.viewOptions')}</span>
            </summary>
            <div className="fieldsmenu__pop" role="group" aria-label={t('acards.viewOptions')}>
              <label className="checkbox">
                <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
                <span>{t('accounts.showArchived')}</span>
              </label>
              {view === 'cards' && (
                <>
                  <p className="fieldsmenu__h">{t('acards.fields')}</p>
                  {me.org.accountFields
                    .filter((f) => f.key !== 'health_score')
                    .map((f) => (
                      <label key={f.key} className="checkbox">
                        <input type="checkbox" checked={shownKeys.includes(f.key)} onChange={() => toggleShown(f.key)} />
                        <span>{labelOf(f.label, locale)}</span>
                      </label>
                    ))}
                </>
              )}
            </div>
          </details>
        </div>

        {manage && selected.size > 0 && (
          <div className="bulkbar" role="region" aria-label={t('accounts.bulk')}>
            <strong>{t('accounts.selected', { n: selected.size })}</strong>
            <select className="select" value={bulkOwner} aria-label={t('accounts.newOwner')} onChange={(e) => setBulkOwner(e.target.value)}>
              <option value="">{t('accounts.newOwner')}</option>
              {people
                .filter((p) => p.status === 'active' || p.status === 'invited')
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
            <button className="btn btn--small" disabled={!bulkOwner} onClick={() => bulk({ ownerId: bulkOwner }, 'accounts.reassigned')}>
              {t('accounts.reassign')}
            </button>
            <button className="btn btn--small btn--quiet" onClick={() => bulk({ archived: !archived }, archived ? 'accounts.restored' : 'accounts.archivedN')}>
              {archived ? t('accounts.restore') : t('accounts.archive')}
            </button>
            <button className="btn btn--small btn--quiet" onClick={() => setSelected(new Set())}>
              {t('common.cancel')}
            </button>
          </div>
        )}

        {!data ? (
          view === 'cards' ? <SkeletonCards count={6} label={t('common.loading')} /> : <SkeletonRows rows={8} label={t('common.loading')} />
        ) : rows.length === 0 ? (
          <div className="sheet">
            {q || owner !== 'all' || archived ? (
              <EmptyState icon="search" title={t('accounts.noMatch')} />
            ) : (
              <EmptyState icon="building" title={t('accounts.emptyTitle')} body={t('accounts.empty')}>
                {manage && can('accounts.view_all') && canWrite && (
                  <button className="btn btn--primary" onClick={() => setImporting(true)}>
                    <Icon name="upload" size={16} />
                    {t('accounts.import')}
                  </button>
                )}
                {canWrite && (
                  <button className="btn" onClick={() => setCreating(true)}>
                    <Icon name="plus" size={16} />
                    {t('accounts.new')}
                  </button>
                )}
              </EmptyState>
            )}
          </div>
        ) : view === 'cards' ? (
          signalRows.length ? (
            <AccountCards rows={signalRows} shown={shown} fmt={fmt} OptionValue={OptionValue} />
          ) : (
            <div className="sheet">
              <EmptyState compact icon="filter" title={t('acards.noSignalMatch')}>
                <button className="btn" onClick={() => setSignal('')}>
                  {t('acards.clearFilter')}
                </button>
              </EmptyState>
            </div>
          )
        ) : view === 'renewals' ? (
          <RenewalsView rows={signalRows} fmt={fmt} />
        ) : view === 'reviews' ? (
          <ReviewsView rows={signalRows} />
        ) : view === 'products' ? (
          <WhitespaceView types={types} />
        ) : (
          <div className="table-wrap">
            <table className="table accounts-table">
              <thead>
                <tr>
                  {manage && (
                    <th style={{ width: 36 }}>
                      <input type="checkbox" aria-label={t('accounts.selectAll')} checked={allOn} onChange={() => setSelected(allOn ? new Set() : new Set(rows.map((a) => a.id)))} />
                    </th>
                  )}
                  {head('name', words.one)}
                  {head('owner', t('accounts.owner'))}
                  {fields.map((f) => (
                    <th key={f.key} className="hide-phone">
                      <button className="th-sort" onClick={() => setSort({ key: f.key, dir: sort.key === f.key ? (sort.dir === 1 ? -1 : 1) : 1 })}>
                        {labelOf(f.label, locale)}
                        {sort.key === f.key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
                      </button>
                    </th>
                  ))}
                  {head('open', t('accounts.openTasks'))}
                  <th className="hide-phone">{t('accounts.lastActivity')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id} className="rowlink-row" onClick={(e) => (e.target as HTMLElement).closest('input,button,a') || navigate(`/accounts/${a.id}`)}>
                    {manage && (
                      <td>
                        <input
                          type="checkbox"
                          aria-label={a.name}
                          checked={selected.has(a.id)}
                          onChange={() => {
                            const next = new Set(selected);
                            if (next.has(a.id)) next.delete(a.id);
                            else next.add(a.id);
                            setSelected(next);
                          }}
                        />
                      </td>
                    )}
                    <td>
                      <a
                        href={`/accounts/${a.id}`}
                        className="rowlink"
                        onClick={(e) => {
                          e.preventDefault();
                          navigate(`/accounts/${a.id}`);
                        }}
                      >
                        {a.name}
                      </a>
                    </td>
                    <td>
                      {person(a.ownerId) ? (
                        <span className="owner">
                          <Avatar person={person(a.ownerId)} /> {person(a.ownerId)!.name}
                        </span>
                      ) : (
                        <span className="muted">{t('accounts.noOwner')}</span>
                      )}
                    </td>
                    {fields.map((f) => (
                      <td key={f.key} className={`hide-phone${f.type === 'money' || f.type === 'number' ? ' num' : ''}`} data-type={f.type} data-value={f.type === 'select' ? String(a.fields[f.key] ?? '') : undefined}>
                        <OptionValue field={f} value={a.fields[f.key]} text={fmt(f, a.fields[f.key])} />
                      </td>
                    ))}
                    <td className="num">{a.openTasks ?? 0}</td>
                    <td className="hide-phone muted">{a.lastActivityAt ? relativeTime(a.lastActivityAt, t) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {importing && (
        <Dialog title={t('accounts.importTitle', { accounts: words.other })} onClose={() => { setImporting(false); void load(); }} wide>
          <Importer onImported={() => void load()} />
          <ImportHistory />
        </Dialog>
      )}
      {creating && (
        <NewAccount
          onClose={() => setCreating(false)}
          onDone={(id) => {
            setCreating(false);
            navigate(`/accounts/${id}`);
          }}
        />
      )}
    </>
  );
}

function ImportHistory() {
  const { t, fmtDate } = useI18n();
  const { toast } = useStore();
  const [list, setList] = useState<any[] | null>(null);
  const load = () => get<{ imports: any[] }>('/imports').then((r) => setList(r.imports));
  useEffect(() => {
    void load();
  }, []);
  if (!list?.length) return null;
  return (
    <details className="import-history">
      <summary>{t('import.history')}</summary>
      <ul>
        {list.map((b) => (
          <li key={b.id}>
            <span>
              {b.fileName ?? t('import.untitled')} · <span className="muted">{fmtDate(b.createdAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
            </span>
            <span className="muted">{t('import.summary', { created: b.summary?.created ?? 0, updated: b.summary?.updated ?? 0 })}</span>
            {b.undoneAt ? (
              <span className="badge">{t('import.wasUndone')}</span>
            ) : b.undoable ? (
              <button
                className="btn btn--small btn--quiet"
                onClick={async () => {
                  await post(`/imports/${b.id}/undo`, {});
                  toast(t('import.undone'));
                  void load();
                }}
              >
                {t('import.undo')}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
}

export function FieldInput({ field, value, onSave, disabled }: { field: AccountField; value: unknown; onSave: (v: string | number | null) => void; disabled?: boolean }) {
  const { locale } = useI18n();
  const [v, setV] = useState(value === null || value === undefined ? '' : String(value));
  useEffect(() => setV(value === null || value === undefined ? '' : String(value)), [value]);
  const commit = () => {
    const next = v.trim() === '' ? null : field.type === 'number' || field.type === 'money' ? Number(v) : v.trim();
    if ((next ?? '') !== (value ?? '')) onSave(next);
  };
  if (field.type === 'select') {
    return (
      <select className="select" value={v} disabled={disabled} aria-label={labelOf(field.label, locale)} onChange={(e) => { setV(e.target.value); onSave(e.target.value || null); }}>
        <option value="" />
        {(field.options ?? []).map((o) => (
          <option key={o.key} value={o.key}>
            {labelOf(o.label, locale)}
          </option>
        ))}
      </select>
    );
  }
  const type = field.type === 'date' ? 'date' : field.type === 'number' || field.type === 'money' ? 'number' : field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : 'text';
  return <input className="input" type={type} value={v} disabled={disabled} aria-label={labelOf(field.label, locale)} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />;
}

function NewAccount({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
  const { t, words } = useI18n();
  const { me, people } = useStore();
  const [name, setName] = useState('');
  const [ownerId, setOwnerId] = useState(me.user.id);
  const [error, setError] = useState('');
  const submit = async () => {
    try {
      const r = await post<{ account: Account }>('/accounts', { name: name.trim(), ownerId: ownerId || null });
      onDone(r.account.id);
    } catch (e) {
      setError(e instanceof ApiFailure ? e.body.message : t('errors.server'));
    }
  };
  return (
    <Dialog
      title={t('accounts.newTitle', { account: words.one })}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--quiet" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn--primary" disabled={!name.trim()} onClick={submit}>
            {t('common.create')}
          </button>
        </>
      }
    >
      <div className="form">
        <label className="field">
          <span className="field__label">{t('accounts.name')}</span>
          <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && submit()} maxLength={200} />
        </label>
        <label className="field">
          <span className="field__label">{t('accounts.owner')}</span>
          <select className="select" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">{t('accounts.noOwner')}</option>
            {people
              .filter((p) => p.status === 'active' || p.status === 'invited')
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </label>
        <p className="field__hint">{t('accounts.newHint')}</p>
        {error && <p className="error-text">{error}</p>}
      </div>
    </Dialog>
  );
}

export function AccountPage({ id }: { id: string }) {
  const { t, words, locale } = useI18n();
  const { me, people, boards, canWrite, can, toast } = useStore();
  const [data, setData] = useState<{ account: Account & { links?: LinkInfo[] }; tasks: (Task & { boardName: string })[] } | null>(null);
  const [missing, setMissing] = useState(false);
  const { types } = useRecordTypes();
  const fmt = useFieldFormat();
  const [removing, setRemoving] = useState(false);
  const [title, setTitle] = useState('');
  const [boardId, setBoardId] = useState(boards[0]?.id ?? '');
  const [hours, setHours] = useState<{ total: number; recent: number } | null>(null);
  useEffect(() => {
    void get<{ total: number; recent: number }>(`/accounts/${id}/time`).then(setHours, () => undefined);
  }, [id]);
  // "Tasks" on a customer card opens the page at its tasks.
  const ready = !!data;
  usePageDefaults(data ? { accountId: data.account.id, accountName: data.account.name } : null);
  useEffect(() => {
    if (ready && location.hash === '#tasks') requestAnimationFrame(() => document.getElementById('tasks')?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  }, [ready]);
  const load = useCallback(async () => {
    try {
      setData(await get(`/accounts/${id}`));
    } catch {
      setMissing(true);
    }
  }, [id]);
  useEffect(() => {
    void load();
    // A review logged from anywhere moves the next one.
    const again = () => void load();
    window.addEventListener('tw:timeline-changed', again);
    return () => window.removeEventListener('tw:timeline-changed', again);
  }, [load]);
  useEffect(() => {
    if (!boardId && boards[0]) setBoardId(boards[0].id);
  }, [boards, boardId]);

  const save = async (body: Record<string, unknown>) => {
    try {
      const r = await patch<{ account: Account }>(`/accounts/${id}`, body);
      setData((d) => (d ? { ...d, account: r.account } : d));
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
      void load();
    }
  };

  if (missing)
    return (
      <div className="page">
        <EmptyState icon="building" title={t('errors.not_found')}>
          <button className="btn" onClick={() => navigate('/accounts')}>
            {words.other}
          </button>
        </EmptyState>
      </div>
    );
  if (!data)
    return (
      <div className="page" style={{ paddingTop: 24 }}>
        <SkeletonRows rows={5} label={t('common.loading')} />
      </div>
    );
  const a = data.account;
  const done = (task: Task) => !!boards.find((b) => b.id === task.boardId)?.columns.find((c) => c.key === task.status)?.done;
  const open = data.tasks.filter((x) => !done(x));
  const finished = data.tasks.filter(done);

  const addTask = async () => {
    if (!title.trim() || !boardId) return;
    // Read the same way as quick add: "QBR deck nov 15 @Ayşe !high". Without a name it goes to the owner.
    const pick = people.filter((x) => x.seat === 'full' && (x.status === 'active' || x.status === 'invited')).map((x) => ({ id: x.id, name: x.name }));
    const q = parseQuick(title, pick, [], { id: me.user.id, name: me.user.name });
    if (!q.title) return;
    try {
      await post('/tasks', {
        boardId,
        title: q.title,
        accountId: id,
        assigneeIds: q.assignees.length ? q.assignees.map((x) => x.id) : a.ownerId ? [a.ownerId] : [],
        dueDate: q.dueDate,
        ...(q.priority ? { priority: q.priority } : {}),
        ...(q.repeat ? { repeat: q.repeat } : {}),
      });
      setTitle('');
      tasksChanged();
      await load();
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    }
  };

  return (
    <>
      <header className="topbar">
        <a
          href="/accounts"
          className="btn btn--quiet btn--small"
          onClick={(e) => {
            e.preventDefault();
            navigate('/accounts');
          }}
        >
          <Icon name="chevronLeft" size={16} />
          {words.other}
        </a>
        <div className="topbar__spacer" />
        {can('accounts.manage') && (
          <>
            <button className="btn btn--small" onClick={() => save({ archived: !a.archivedAt })}>
              {a.archivedAt ? t('accounts.restore') : t('accounts.archive')}
            </button>
            <button className="btn btn--small btn--danger" onClick={() => setRemoving(true)}>
              {t('common.delete')}
            </button>
          </>
        )}
      </header>
      <div className="page account-page">
        <div className="account-page__main">
          <input className="title-input" defaultValue={a.name} key={a.name} disabled={!canWrite} aria-label={t('accounts.name')} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== a.name && save({ name: e.target.value.trim() })} />
          <section className="sheet" id="tasks">
            <h3 className="section__head">
              <span>{t('accounts.openTasksN', { n: open.length })}</span>
              <PlanMenu accountId={a.id} accountName={a.name} onApplied={() => void load()} />
            </h3>
            {hours && hours.total > 0 && <p className="field__hint" style={{ margin: '-2px 0 10px' }}>{t('accounts.hours', { total: hoursText(hours.total, locale), recent: hoursText(hours.recent, locale) })}</p>}
            {canWrite && boards.length > 0 && (
              <div className="toolbar" style={{ marginBottom: 10 }}>
                <input className="input" style={{ flex: 1, minWidth: 200 }} value={title} placeholder={t('accounts.addTaskFor', { name: a.name })} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTask()} />
                <select className="select" value={boardId} aria-label={t('task.board')} onChange={(e) => setBoardId(e.target.value)}>
                  {boards.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <button className="btn" disabled={!title.trim()} onClick={addTask}>
                  {t('common.add')}
                </button>
              </div>
            )}
            {open.length === 0 && <EmptyState compact icon="checkCircle" tone="done" title={t('accounts.noOpenTasks')} />}
            {open.map((task) => (
              <TaskLine key={task.id} task={task} />
            ))}
            {finished.length > 0 && (
              <details style={{ marginTop: 10 }}>
                <summary className="muted">{t('accounts.finishedN', { n: finished.length })}</summary>
                {finished.map((task) => (
                  <TaskLine key={task.id} task={task} done />
                ))}
              </details>
            )}
          </section>
          <AccountTimeline accountId={a.id} hasContacts={!!types?.some((x) => x.kind === 'contact')} />
          {types && types.length > 0 && <AccountRecords account={a} types={types} onChange={load} />}
          {me.org.portal && (can('org.manage') || a.ownerId === me.user.id) && (
            <section className="sheet">
              <h3 className="section__head">{t('portal.people.forAccount')}</h3>
              <PortalPeople accountId={a.id} accountName={a.name} />
            </section>
          )}
        </div>
        <aside className="sheet account-page__side">
          <OpenIn links={data.account.links} />
          <label className="field">
            <span className="field__label">{t('accounts.owner')}</span>
            <select className="select" value={a.ownerId ?? ''} disabled={!canWrite} onChange={(e) => save({ ownerId: e.target.value || null })}>
              <option value="">{t('accounts.noOwner')}</option>
              {people
                .filter((p) => p.status === 'active' || p.status === 'invited' || p.id === a.ownerId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
          <ReviewField account={a} onSave={save} />
          {me.org.accountFields.map((f) =>
            f.health ? (
              <HealthBadge key={f.key} accountId={a.id} field={f} value={a.fields[f.key]} />
            ) : calculated(f) ? (
              <div className="field" key={f.key}>
                <span className="field__label">{labelOf(f.label, locale)}</span>
                <span className="calc-value">{fmt(f, a.fields[f.key]) || '—'}</span>
              </div>
            ) : (
              <label className="field" key={f.key}>
                <span className="field__label">{labelOf(f.label, locale)}</span>
                <FieldInput field={f} value={a.fields[f.key]} disabled={!canWrite || f.locked} onSave={(v) => save({ fields: { [f.key]: v } })} />
                {f.locked && <span className="field__hint">{t('fields.access.readOnlyForYou')}</span>}
              </label>
            ),
          )}
          {me.org.accountFields.length === 0 && can('accounts.manage') && (
            <p className="field__hint">
              <a href="/settings/fields" onClick={(e) => { e.preventDefault(); navigate('/settings/fields'); }}>
                {t('accounts.addFields')}
              </a>
            </p>
          )}
          <p className="field__hint">{a.links?.length ? t('accounts.fromCrm', { crm: PROVIDER_NAMES[a.links[0].provider] ?? a.links[0].provider }) : t(a.source === 'import' ? 'accounts.fromImport' : 'accounts.addedHere')}</p>
        </aside>
      </div>
      {removing && (
        <Confirm
          title={t('accounts.deleteTitle', { name: a.name })}
          body={t('accounts.deleteBody')}
          confirmLabel={t('common.delete')}
          danger
          onClose={() => setRemoving(false)}
          onConfirm={async () => {
            await del(`/accounts/${id}`);
            navigate('/accounts');
          }}
        />
      )}
    </>
  );
}

function TaskLine({ task, done }: { task: Task & { boardName: string }; done?: boolean }) {
  const { person } = useStore();
  return (
    <a
      className="taskline"
      href={`/b/${task.boardId}?task=${task.id}`}
      onClick={(e) => {
        e.preventDefault();
        navigate(`${location.pathname}?task=${task.id}`);
      }}
    >
      <span className="taskline__title" data-done={done ? 'true' : undefined}>
        {task.title}
      </span>
      <span className="muted hide-phone">{task.boardName}</span>
      <span className="taskline__who">{task.assigneeIds.slice(0, 2).map((id) => <Avatar key={id} person={person(id)} />)}</span>
      <DueLabel due={task.dueDate} done={!!done} />
    </a>
  );
}
