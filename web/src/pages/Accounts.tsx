// Accounts: the customers the team looks after. A sortable list with the
// company's own fields, bulk changes, import with undo, and a page per
// account with its tasks.
import { AccountDepartments } from '../components/AccountDepartments';
import type { AccountDepartmentWork } from '../../../shared/src/model';
import { AccountTeam, HandoverCard, useAccountFlow, WaitingFor } from '../components/CustomerFlow';
import { useMoney } from '../lib/money';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useWindow } from '../lib/windowing';
import { labelOf } from '../../../shared/src/fields';
import { calculated, type Account, type AccountField, type Task } from '../../../shared/src/model';
import type { LinkInfo } from '../../../shared/src/records';
import { useRecordTypes } from '../components/AccountFields';
import { Importer } from '../components/Importer';
import { ExportMenu, useExport } from '../components/Export';
import { SavedViews, useSavedViews } from '../components/SavedViews';
import { BULK_MAX, SelectMatching } from '../components/ListBulk';
import type { ExportRequest } from '../lib/export';
import { AccountRecords, OpenIn, RecordTabs } from '../components/Records';
import { PROVIDER_NAMES } from '../components/Connections';
import { Avatar, Confirm, ConvertedNote, Dialog, DueLabel, onTabKeys } from '../components/ui';
import { ApiFailure, del, get, patch, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { nameIt, navigate, navigateFresh, useLocation } from '../lib/router';
import { useStore } from '../lib/store';
import { FinanceBand } from '../components/FinanceBand';
import { AccountTimeline, HealthBadge, HealthWhy, ScoreChip, bandOf as scoreBand, useHealthText, useHealthWhy, weakestPart } from '../components/Timeline';
import { PortalPeople } from '../components/PortalAdmin';
import '../surfaces/employee-customers.css';
import { AccountCards, RenewalsView, SIGNAL_FILTERS, WhitespaceView, bandOf, keyFields, matchesSignal, signalsOf, type SignalFilter } from '../components/AccountViews';
import { relativeTime, todayIso } from '../lib/time';
import { HEALTH_FIELD } from '../../../shared/src/health';
import type { MessageKey } from '../../../shared/src/i18n';
import { MenuButton } from '../components/Menus';
import { DateField } from '../components/DateField';
import { EmptyState, LoadError, SkeletonCards, SkeletonRows } from '../components/Empty';
import { Icon, PageIcon } from '../components/icons';
import { parseQuick } from '../lib/quickparse';
import { TASKS_CHANGED, tasksChanged, usePageDefaults } from '../lib/shell';
import { PlanMenu } from '../components/Plans';
import { FavoriteButton } from '../components/Favorites';
import { ReviewField, ReviewsView } from '../components/Rhythm';
import { AccountMeetings, TIMELINE_CHANGED } from '../components/Meetings';
import { AccountPlanned } from '../components/PlannedMeetings';
import { useLiveScope, usePresence } from '../lib/live';
import { Presence } from '../components/Presence';
import { hoursText } from './Reports';
import { useTrashToast } from '../lib/trash';
import { FilterGroup, FilterSheet, usePhone } from '../components/FilterSheet';
import { useServerUndo } from '../lib/undo';
import { formatDate, formatMoney, formatNumber } from '../lib/format';

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
  const money = useMoney();
  return useCallback(
    /**
     * `currency`: the customer's or record's own; none is the company's. `inBase`: a list
     * shows one currency — an amount in another is converted and marked "≈" (ConvertedNote
     * under the list says at which rates).
     */
    (f: AccountField, v: unknown, currency?: string | null, inBase = false): string => {
      if (v === null || v === undefined || v === '') return '';
      if (f.type === 'money' && inBase && currency && currency !== me.org.currency && money.rates[currency]) return `≈ ${formatMoney(money.toBase(Number(v), currency), me.org.currency, locale)}`;
      if (f.type === 'money') {
        return formatMoney(Number(v), currency || me.org.currency, locale);
      }
      if (f.type === 'number') return formatNumber(Number(v), locale, { digits: 2 });
      if (f.type === 'date') return formatDate(String(v), locale, { day: 'numeric', month: 'short', year: 'numeric' });
      if (f.type === 'select') return labelOf(f.options?.find((o) => o.key === v)?.label, locale) || String(v);
      if (f.type === 'url') return String(v).replace(/^https?:\/\//, '').replace(/\/$/, '');
      return String(v);
    },
    [money, me.org.currency, locale],
  );
}

export function AccountsPage() {
  const { t, words, locale } = useI18n();
  const { me, people, person, can, canWrite, toast } = useStore();
  const fmt = useFieldFormat();
  const money = useMoney();
  const [q, setQ] = useState(() => new URLSearchParams(location.search).get('q') ?? '');
  const [owner, setOwner] = useState<'all' | 'me' | string>(() => new URLSearchParams(location.search).get('owner') ?? 'all');
  const [archived, setArchived] = useState(false);
  const phone = usePhone();
  const exporter = useExport();
  const undoable = useServerUndo();
  const [data, setData] = useState<{ accounts: Account[]; total: number } | null>(null);
  const [failed, setFailed] = useState(false);
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
  // Renewals, business reviews and products are places of their own: each has its
  // address (?view=…), its entry in the menu and its title. Cards and table are two
  // ways to lay out the list of all customers, remembered on this device.
  const LAYOUTS = ['cards', 'table'] as const;
  const PLACES = ['renewals', 'reviews', 'products'] as const;
  const reviewsOn = (me.org.rhythm?.reviewDays ?? 0) > 0;
  const asked = new URLSearchParams(qs0).get('view') as (typeof PLACES)[number] | null;
  // A company that holds no business reviews has no Reviews view; a link to it shows the list.
  const place = asked && PLACES.includes(asked) && (asked !== 'reviews' || reviewsOn) ? asked : null;
  const [layout, setLayout] = useState<(typeof LAYOUTS)[number]>(() => remembered('app_accounts_view', LAYOUTS, 'cards'));
  const view: (typeof VIEWS)[number] = place ?? layout;
  const setView = (v: (typeof VIEWS)[number]) => {
    if (v === 'cards' || v === 'table') {
      setLayout(v);
      try {
        localStorage.setItem('app_accounts_view', v);
      } catch {
        /* per-viewer convenience */
      }
      if (place) navigateFresh('/accounts');
    } else navigateFresh(`/accounts?view=${v}`);
  };
  const CARD_SORTS = ['attention', 'name', 'health', 'value', 'renewal', 'open'] as const;
  const [cardSort, setCardSort] = useState<(typeof CARD_SORTS)[number]>(() => remembered('app_accounts_sort', CARD_SORTS, 'attention'));
  const [signal, setSignal] = useState<SignalFilter>('');
  const { renewal: renewalField, value: valueField } = keyFields(me.org.accountFields);
  const defaultShown = [valueField, renewalField].filter(Boolean).map((f) => f!.key);
  const [shownKeys, setShownKeys] = useState<string[]>(() => {
    try {
      const v = JSON.parse(localStorage.getItem('app_accounts_card_fields') ?? 'null');
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
      localStorage.setItem('app_accounts_card_fields', JSON.stringify(next));
    } catch {
      /* per-viewer convenience */
    }
  };

  // The first page draws at once; the rest follows in pages, so sorting and the signal filters
  // (worked out here, from each customer's numbers) always see every customer, not only the first page.
  const seq = useRef(0);
  const load = useCallback(async () => {
    const n = ++seq.current;
    const p = new URLSearchParams({ signals: '1' });
    if (q.trim()) p.set('q', q.trim());
    if (owner !== 'all') p.set('owner', owner);
    if (archived) p.set('archived', '1');
    let have: Account[] = [];
    try {
      for (let page = 0; page < 40; page++) {
        p.set('limit', page ? '500' : '200');
        p.set('offset', String(have.length));
        const r = await get<{ accounts: Account[]; total: number }>(`/accounts?${p}`);
        if (n !== seq.current) return;
        have = [...have, ...r.accounts];
        setData({ accounts: have, total: r.total });
        setFailed(false);
        if (!r.accounts.length || have.length >= r.total) break;
      }
    } catch {
      // A failed load says so and offers to try again; it never shows as an empty list.
      if (n === seq.current && !have.length) setFailed(true);
    }
  }, [q, owner, archived]);
  useEffect(() => {
    const id = setTimeout(() => void load(), 200);
    // A review or meeting logged from here (the Reviews view's "Done") moves its customer.
    const again = () => void load();
    window.addEventListener(TIMELINE_CHANGED, again);
    return () => {
      clearTimeout(id);
      window.removeEventListener(TIMELINE_CHANGED, again);
    };
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
  // A long table draws only the rows in sight.
  const tableWin = view === 'table' && rows.length > 80;
  const rowsWin = useWindow<HTMLTableRowElement, HTMLTableRowElement>(rows.length, tableWin, 49);
  const atStake = valueField
    ? signalRows.filter((r) => r.band === 'risk' || r.chips.some((c) => c.key === 'renewal' && c.tone !== 'slate')).reduce((n, r) => n + money.toBase(Number(r.a.fields[valueField.key]) || 0, r.a.currency), 0)
    : 0;

  const head = (key: string, label: string, className?: string) => (
    <th className={className} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
      <button className="th-sort" onClick={() => setSort({ key, dir: sort.key === key ? (sort.dir === 1 ? -1 : 1) : 1 })}>
        {label}
        {sort.key === key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
      </button>
    </th>
  );

  const bulk = async (body: Record<string, unknown>, msg: string) => {
    try {
      const r = await post<{ updated: number; undoId: string | null }>('/accounts/bulk', { ids: [...selected], ...body });
      undoable(t(msg as any, { n: r.updated }), r.undoId, load);
      setSelected(new Set());
      setBulkOwner('');
      await load();
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    }
  };

  // At most 500 per change: the header box and "select all that match" stop there.
  const allOn = rows.length > 0 && rows.slice(0, BULK_MAX).every((a) => selected.has(a.id));
  const pickOne = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else if (next.size < BULK_MAX) next.add(id);
      return next;
    });
  const viewsSeg = (
    <div className="seg seg--views" role="tablist" aria-label={t('acards.viewLabel')} onKeyDown={onTabKeys}>
      {VIEWS.filter((v) => v !== 'reviews' || reviewsOn).map((v) => (
        <button key={v} role="tab" aria-selected={view === v} tabIndex={view === v ? 0 : -1} onClick={() => setView(v)}>
          <Icon name={({ cards: 'cards', table: 'list', renewals: 'calendar', reviews: 'handshake', products: 'target' } as const)[v]} size={15} />
          {t(`acards.view.${v}` as any)}
        </button>
      ))}
    </div>
  );
  // One currency on the screen: amounts in another are converted (≈) and this says at which rates — under the list on a phone.
  const convertedNote = data && (view === 'cards' || view === 'table' || view === 'renewals') && rows.some((a) => a.currency && a.currency !== me.org.currency && money.rates[a.currency]) ? <ConvertedNote currency={me.org.currency} ratesAt={me.org.fx?.updatedAt} /> : null;
  // On a phone the filters, the order and the view switch fold into one sheet (FilterSheet).
  const activeFilters = (owner !== 'all' ? 1 : 0) + (signal ? 1 : 0) + (archived ? 1 : 0);
  // A saved view keeps the filter, the order, the card fields and the layout (components/SavedViews.tsx).
  const viewState = { q: q.trim(), owner, archived, signal, layout, cardSort, sortKey: sort.key, sortDir: sort.dir, fields: shownKeys };
  const applyView = (v: Partial<typeof viewState>) => {
    setQ(typeof v.q === 'string' ? v.q : '');
    setOwner(typeof v.owner === 'string' && v.owner ? v.owner : 'all');
    setArchived(v.archived === true);
    setSignal(((typeof v.signal === 'string' ? v.signal : '') as SignalFilter) || '');
    if (v.layout === 'cards' || v.layout === 'table') setLayout(v.layout);
    if (typeof v.cardSort === 'string' && (CARD_SORTS as readonly string[]).includes(v.cardSort)) setCardSort(v.cardSort as (typeof CARD_SORTS)[number]);
    if (typeof v.sortKey === 'string') setSort({ key: v.sortKey, dir: v.sortDir === -1 ? -1 : 1 });
    if (Array.isArray(v.fields)) setShownKeys(v.fields.filter((k): k is string => typeof k === 'string').slice(0, 6));
  };
  const savedViews = useSavedViews({ scope: 'accounts', state: viewState, onApply: applyView });
  // The file is made by the server from the same filter the list shows (POST /exports).
  const exportAsk = (): ExportRequest => ({ source: 'accounts', q: q.trim() || undefined, owner: owner !== 'all' ? owner : undefined, archived: archived || undefined });
  const exportItems = exporter.items(exportAsk, !!data?.total);
  // Without the export permission and import rights the phone's "More" has nothing in it, and is not shown.
  const moreItems = [...exportItems, ...(manage && can('accounts.view_all') && canWrite ? [{ key: 'import', label: t('accounts.import'), icon: 'upload' as const, onSelect: () => setImporting(true) }] : [])];
  return (
    <>
      <header className="topbar listtop" data-place={place ?? undefined}>
        {place ? (
          <div className="topbar__titles topbar__titles--icon">
            <PageIcon name={({ renewals: 'refresh', reviews: 'handshake', products: 'target' } as const)[place]} />
            <h1 className="topbar__title">{t(`accounts.place.${place}` as any)}</h1>
            <p className="topbar__sub">{t(`accounts.place.${place}.lead` as any, { accounts: words.other })}</p>
          </div>
        ) : (
          <>
            <h1 className="topbar__title topbar__title--icon">
              <PageIcon name="building" />
              <span>{words.other}</span>
            </h1>
            {data && <span className="topbar__sub num">{t('accounts.total', { n: data.total })}</span>}
          </>
        )}
        <div className="topbar__spacer" />
        {/* Saved views sit here on a desktop (the filter row is full); on a phone, in the filter sheet. */}
        {!phone && <SavedViews ctl={savedViews} />}
        <div className="listtop__wide">
          <ExportMenu disabled={!data?.total} ask={exportAsk} />
        </div>
        {manage && can('accounts.view_all') && canWrite && (
          <button className="btn listtop__wide" onClick={() => setImporting(true)}>
            {t('accounts.import')}
          </button>
        )}
        {/* On a phone, export and import fold into one quiet menu beside the one main action. */}
        {moreItems.length > 0 && (
          <MenuButton className="listtop__more" label={t('acc.more')} title={t('acc.more')} place="down-end" buttonClass="btn btn--icon" button={<Icon name="more" size={18} />} items={moreItems} />
        )}
        {canWrite && (
          <button className="btn btn--primary listtop__new" aria-label={t('accounts.new')} onClick={() => setCreating(true)}>
            <Icon name="plus" size={16} />
            <span className="listtop__newlabel">{t('accounts.new')}</span>
          </button>
        )}
      </header>
      <div className="page">
        <RecordTabs current="accounts" types={types} />
        <div className="viewbar">
          {!phone && viewsSeg}
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
        <div className="toolbar u-mb-12">
          <FilterSheet
            count={activeFilters}
            onClear={() => (setOwner('all'), setSignal(''), setArchived(false))}
            search={<input className="input search" type="search" value={q} placeholder={t('accounts.search')} aria-label={t('accounts.search')} onChange={(e) => setQ(e.target.value)} />}
          >
          {phone && <FilterGroup label={t('acards.viewLabel')}>{viewsSeg}</FilterGroup>}
          <FilterGroup label={t('accounts.owner')}>
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
          </FilterGroup>
          {(view === 'cards' || view === 'renewals' || view === 'reviews') && (
            <FilterGroup label={t('acards.signalFilter')}>
            <select className="select" value={signal} aria-label={t('acards.signalFilter')} onChange={(e) => setSignal(e.target.value as SignalFilter)}>
              <option value="">{t('acards.signal.any')}</option>
              {SIGNAL_FILTERS.filter((s) => s !== 'review' || reviewsOn).map((s) => (
                <option key={s} value={s}>
                  {t(`acards.signal.${s}` as any)}
                </option>
              ))}
            </select>
            </FilterGroup>
          )}
          {view === 'cards' && (
            <FilterGroup label={t('acards.sortLabel')}>
              <select
                className="select"
                value={cardSort}
                aria-label={t('acards.sortLabel')}
                onChange={(e) => {
                  const v = e.target.value as (typeof CARD_SORTS)[number];
                  setCardSort(v);
                  try {
                    localStorage.setItem('app_accounts_sort', v);
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
            </FilterGroup>
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
          {phone && <SavedViews ctl={savedViews} />}
          </FilterSheet>
        </div>

        {manage && selected.size > 0 && (
          <div className="bulkbar" role="region" aria-label={t('accounts.bulk')}>
            <strong>{t('accounts.selected', { n: selected.size })}</strong>
            <SelectMatching picked={selected.size} matching={(view === 'table' ? rows : signalRows).length} onPick={() => setSelected(new Set((view === 'table' ? rows : signalRows.map((x) => x.a)).slice(0, BULK_MAX).map((a) => a.id)))} />
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

        {!phone && convertedNote}
        {failed && !data ? (
          <LoadError onRetry={() => void load()} />
        ) : !data ? (
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
            <AccountCards rows={signalRows} shown={shown} fmt={fmt} OptionValue={OptionValue} picked={manage && canWrite ? selected : undefined} onPick={manage && canWrite ? pickOne : undefined} />
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
                    <th className="u-width-36">
                      <input type="checkbox" aria-label={t('accounts.selectAll')} checked={allOn} onChange={() => setSelected(allOn ? new Set() : new Set(rows.slice(0, BULK_MAX).map((a) => a.id)))} />
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
                  {head('open', t('accounts.openTasks'), 'accounts-table__open')}
                  <th className="hide-phone">{t('accounts.lastActivity')}</th>
                </tr>
              </thead>
              <tbody>
                {tableWin && (
                  <tr ref={rowsWin.topRef} className="vspacer" aria-hidden="true">
                    <td colSpan={99} style={{ height: rowsWin.before }} />
                  </tr>
                )}
                {rows.slice(rowsWin.start, rowsWin.end).map((a) => (
                  <tr key={a.id} className="rowlink-row" onClick={(e) => (e.target as HTMLElement).closest('input,button,a') || navigate(`/accounts/${a.id}`)}>
                    {manage && (
                      <td>
                        <input
                          type="checkbox"
                          aria-label={a.name}
                          checked={selected.has(a.id)}
                          onChange={() => pickOne(a.id)}
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
                        <OptionValue field={f} value={a.fields[f.key]} text={fmt(f, a.fields[f.key], a.currency, true)} />
                      </td>
                    ))}
                    <td className="num accounts-table__open">{a.openTasks ?? 0}</td>
                    <td className="hide-phone muted">{a.lastActivityAt ? relativeTime(a.lastActivityAt, t) : '—'}</td>
                  </tr>
                ))}
                {tableWin && (
                  <tr ref={rowsWin.bottomRef} className="vspacer" aria-hidden="true">
                    <td colSpan={99} style={{ height: rowsWin.after }} />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {phone && convertedNote}
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

/**
 * The currency this customer's amounts are in, when the company works in more
 * than one. Its deals follow it unless they have their own.
 */
function CurrencyField({ account, onSave }: { account: Account; onSave: (body: { currency: string | null }) => void }) {
  const { t } = useI18n();
  const { canWrite } = useStore();
  const money = useMoney();
  if (!money.multi && !account.currency) return null;
  return (
    <label className="field">
      <span className="field__label">{t('money.currency')}</span>
      <select className="select" value={account.currency ?? ''} disabled={!canWrite} onChange={(e) => onSave({ currency: e.target.value || null })}>
        <option value="">{t('money.company', { code: money.base })}</option>
        {money.usable
          .filter((c) => c !== money.base)
          .map((c) => (
            <option key={c} value={c}>
              {c} · {money.nameOf(c)}
            </option>
          ))}
      </select>
    </label>
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
  // A date is typed and picked in the person's own format, through the product's date field.
  if (field.type === 'date')
    return (
      <DateField
        value={v.slice(0, 10)}
        disabled={disabled}
        label={labelOf(field.label, locale)}
        onChange={(d) => {
          setV(d);
          if ((d || null) !== ((value as string | null | undefined) || null)) onSave(d || null);
        }}
      />
    );
  const type = field.type === 'number' || field.type === 'money' ? 'number' : field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : 'text';
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
        {error && <p className="error-text" role="alert">{error}</p>}
      </div>
    </Dialog>
  );
}

type AccountTab = 'overview' | 'timeline' | 'people' | 'records' | 'details';
type AccountData = { account: Account & { links?: LinkInfo[] }; tasks: (Task & { boardName: string })[]; departments?: AccountDepartmentWork[] };
// The page is drawn again after changes elsewhere in the app (a new key): it starts from what it last
// showed for this customer and refreshes, instead of flashing back to a skeleton.
const lastSeen = new Map<string, AccountData>();

export function AccountPage({ id }: { id: string }) {
  const { t, words, locale } = useI18n();
  const { flow, reload: reloadFlow } = useAccountFlow(id);
  const here = usePresence(`a:${id}`);
  const { me, people, boards, canWrite, can, toast } = useStore();
  const trashed = useTrashToast();
  const [data, setData] = useState<AccountData | null>(() => lastSeen.get(id) ?? null);
  const [missing, setMissing] = useState(false);
  const { types } = useRecordTypes();
  const fmt = useFieldFormat();
  const phone = usePhone();
  useEffect(() => {
    if (data) lastSeen.set(id, data);
  }, [id, data]);
  const { search } = useLocation();
  const [removing, setRemoving] = useState(false);
  const [title, setTitle] = useState('');
  const [boardId, setBoardId] = useState(boards[0]?.id ?? '');
  const [hours, setHours] = useState<{ total: number; recent: number } | null>(null);
  // Bumped after every load, so the health reasons in the band are asked again.
  const [again, setAgain] = useState(0);
  const addRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    void get<{ total: number; recent: number }>(`/accounts/${id}/time`).then(setHours, () => undefined);
  }, [id]);
  // "Tasks" on a customer card opens the page at its tasks.
  const ready = !!data;
  const accountName = data?.account.name;
  useEffect(() => nameIt(`/accounts/${id}`, accountName), [id, accountName]);
  usePageDefaults(data ? { accountId: data.account.id, accountName: data.account.name } : null);
  useEffect(() => {
    if (ready && location.hash === '#tasks') requestAnimationFrame(() => document.getElementById('tasks')?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  }, [ready]);
  const load = useCallback(async () => {
    try {
      setData(await get(`/accounts/${id}`));
      setAgain((n) => n + 1);
    } catch {
      setMissing(true);
    }
  }, [id]);
  useEffect(() => {
    void load();
    // A review logged from anywhere moves the next one; a task finished here moves the band.
    const again = () => void load();
    window.addEventListener('app:timeline-changed', again);
    window.addEventListener(TASKS_CHANGED, again);
    return () => {
      window.removeEventListener('app:timeline-changed', again);
      window.removeEventListener(TASKS_CHANGED, again);
    };
  }, [load]);
  // Someone else changed this company — its fields, a meeting, a task, a record:
  // the page follows, and its sections refetch, without polling the whole company.
  useLiveScope('account', id, () => {
    void load();
    window.dispatchEvent(new Event(TIMELINE_CHANGED));
  });
  useEffect(() => {
    if (!boardId && boards[0]) setBoardId(boards[0].id);
  }, [boards, boardId]);

  // Saves go one after another, each from the version the last one left (lib/versions.ts on the server):
  // a change to another field merges; the same field changed by someone else meanwhile is refused and shown.
  const version = useRef<number | undefined>(undefined);
  version.current = data?.account.version ?? version.current;
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const clashLabel = (name: string) =>
    name.startsWith('fields.')
      ? labelOf(me.org.accountFields.find((f) => f.key === name.slice(7))?.label, locale) || name.slice(7)
      : name === 'ownerId' || name === 'teamId'
        ? t('accounts.owner')
        : name === 'currency'
          ? t('money.currency')
          : t('accounts.name');
  const save = (body: Record<string, unknown>) =>
    (queue.current = queue.current.then(async () => {
      try {
        const base = version.current;
        const r = await patch<{ account: Account }>(`/accounts/${id}`, base ? { ...body, baseVersion: base } : body);
        version.current = r.account.version ?? version.current;
        setData((d) => (d ? { ...d, account: { ...d.account, ...r.account } } : d));
        setAgain((n) => n + 1);
      } catch (e) {
        if (e instanceof ApiFailure && e.code === 'conflict' && e.body.current) {
          const current = e.body.current as Account;
          version.current = current.version;
          setData((d) => (d ? { ...d, account: { ...d.account, ...current } } : d));
          const names = ((e.body.fields as string[] | undefined) ?? []).map(clashLabel);
          toast(t('versions.clashShown', { fields: new Intl.ListFormat(locale, { type: 'conjunction' }).format([...new Set(names)]) }), 'error');
          return;
        }
        toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
        void load();
      }
    }));

  // The sections below the band, one at a time. The address keeps the open one (?tab=…), so a reload
  // or a shared link lands in the same place. On a phone the customer's fields are a section of their own.
  const hasContacts = !!types?.some((x) => x.kind === 'contact');
  const recordTypes = types?.filter((x) => x.kind !== 'contact') ?? [];
  const contactTypes = types?.filter((x) => x.kind === 'contact') ?? [];
  const showPortal = !!me.org.portal && (can('org.manage') || data?.account.ownerId === me.user.id);
  const tabs: AccountTab[] = (['overview', 'timeline', 'people', 'records', 'details'] as const).filter(
    (k) => k === 'overview' || k === 'timeline' || (k === 'people' && hasContacts) || (k === 'records' && (recordTypes.length > 0 || showPortal)) || (k === 'details' && phone),
  );
  const asked = new URLSearchParams(search).get('tab') as AccountTab | null;
  // Until the record types are known, a link to their tab waits for them instead of jumping to the overview.
  const tab: AccountTab = asked && (tabs.includes(asked) || (types === null && (asked === 'people' || asked === 'records'))) ? asked : 'overview';
  // The open section's tab stays in sight in the strip (on a phone the strip scrolls sideways).
  useEffect(() => {
    const el = document.getElementById(`acc-tab-${tab}`);
    const strip = el?.parentElement;
    if (!el || !strip || strip.scrollWidth <= strip.clientWidth) return;
    const box = el.getBoundingClientRect();
    const bar = strip.getBoundingClientRect();
    if (box.left < bar.left || box.right > bar.right) el.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [tab, ready]);
  const pickTab = (k: AccountTab) => {
    const p = new URLSearchParams(location.search);
    if (k === 'overview') p.delete('tab');
    else p.set('tab', k);
    const qs = p.toString();
    navigate(location.pathname + (qs ? `?${qs}` : ''), true);
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
      <div className="page u-pt-24">
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
  const startTask = () => {
    pickTab('overview');
    requestAnimationFrame(() => addRef.current?.focus());
  };

  const healthInBand = bandShowsHealth(me.org);
  const details = (
    <>
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
      <AccountTeam account={a} flow={flow} reload={() => void reloadFlow()} />
      <ReviewField account={a} onSave={save} />
      <CurrencyField account={a} onSave={save} />
      {me.org.accountFields.map((f) =>
        f.health ? (
          healthInBand ? null : <HealthBadge key={f.key} accountId={a.id} field={f} value={a.fields[f.key]} />
        ) : calculated(f) ? (
          <div className="field" key={f.key}>
            <span className="field__label">{labelOf(f.label, locale)}</span>
            <span className="calc-value">{fmt(f, a.fields[f.key], a.currency) || '—'}</span>
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
    </>
  );

  const tabLabel: Record<AccountTab, string> = {
    overview: t('acc.tab.overview'),
    timeline: t('timeline.title'),
    people: t('org.stakeholders'),
    records: t('acc.tab.records'),
    details: t('acc.tab.details'),
  };

  return (
    <>
      <header className="topbar account-top">
        <PageIcon name="building" />
        <input className="title-input" defaultValue={a.name} key={a.name} disabled={!canWrite} aria-label={t('accounts.name')} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== a.name && save({ name: e.target.value.trim() })} />
        <FavoriteButton kind="account" id={a.id} name={a.name} to={`/accounts/${a.id}`} />
        <div className="topbar__spacer" />
        <span className="account-top__here">
          <Presence who={here.who} />
        </span>
        {a.archivedAt && <span className="badge">{t('acc.archived')}</span>}
        {can('accounts.manage') && (
          <MenuButton
            label={t('acc.more')}
            title={t('acc.more')}
            place="down-end"
            buttonClass="btn btn--quiet btn--icon"
            button={<Icon name="more" size={18} />}
            items={[
              { key: 'archive', label: a.archivedAt ? t('accounts.restore') : t('accounts.archive'), icon: a.archivedAt ? 'undo' : 'inbox', onSelect: () => save({ archived: !a.archivedAt }) },
              'sep',
              { key: 'delete', label: t('common.delete'), icon: 'trash', danger: true, onSelect: () => setRemoving(true) },
            ]}
          />
        )}
      </header>
      <div className="page account-page">
        <AccountBand account={a} tasks={open} again={again} onAddTask={canWrite && boards.length > 0 ? startTask : undefined} />
        <AccountDepartments work={data.departments} />
        <FinanceBand accountId={a.id} today={todayIso()} />
        <div className="account-page__main">
          <div className="tabs acc-tabs" role="tablist" aria-label={t('acc.sections')} onKeyDown={onTabKeys}>
            {tabs.map((k) => (
              <button key={k} id={`acc-tab-${k}`} className="tab" role="tab" aria-selected={tab === k} aria-controls="acc-panel" tabIndex={tab === k ? 0 : -1} onClick={() => pickTab(k)}>
                {tabLabel[k]}
                {k === 'overview' && open.length > 0 && <span className="acc-tabs__n num">{formatNumber(open.length, locale)}</span>}
              </button>
            ))}
          </div>
          <div className="acc-panel" id="acc-panel" role="tabpanel" aria-labelledby={`acc-tab-${tab}`}>
            {tab === 'overview' && (
              <>
                {(flow?.handovers ?? []).filter((h) => h.status === 'open').map((h) => (
                  <HandoverCard key={h.id} id={h.id} onDone={() => void reloadFlow()} />
                ))}
                <section className="sheet" id="tasks">
                  <h3 className="section__head">
                    <span>
                      <Icon name="checkCircle" size={16} className="icon--lead" />
                      {t('accounts.openTasksN', { n: open.length })}
                    </span>
                    <PlanMenu accountId={a.id} accountName={a.name} onApplied={() => void load()} />
                  </h3>
                  {hours && hours.total > 0 && <p className="field__hint u-m-n4-0-8">{t('accounts.hours', { total: hoursText(hours.total, locale), recent: hoursText(hours.recent, locale) })}</p>}
                  {canWrite && boards.length > 0 && (
                    <div className="toolbar acc-add">
                      <input ref={addRef} className="input acc-add__text" value={title} placeholder={t('accounts.addTaskFor', { name: a.name })} aria-label={t('accounts.addTaskFor', { name: a.name })} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTask()} />
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
                    <details className="u-mt-8">
                      <summary className="muted">{t('accounts.finishedN', { n: finished.length })}</summary>
                      {finished.map((task) => (
                        <TaskLine key={task.id} task={task} done />
                      ))}
                    </details>
                  )}
                </section>
                <WaitingFor account={a} flow={flow} reload={() => void reloadFlow()} />
                <AccountPlanned account={a} />
                <AccountMeetings account={a} />
              </>
            )}
            {tab === 'timeline' && <AccountTimeline accountId={a.id} hasContacts={hasContacts} />}
            {tab === 'people' && contactTypes.length > 0 && <AccountRecords account={a} types={contactTypes} onChange={load} />}
            {tab === 'records' && (
              <>
                {recordTypes.length > 0 && <AccountRecords account={a} types={recordTypes} onChange={load} />}
                {showPortal && (
                  <section className="sheet">
                    <h3 className="section__head">
                      <span>
                        <Icon name="globe" size={16} className="icon--lead" />
                        {t('portal.people.forAccount')}
                      </span>
                    </h3>
                    <PortalPeople accountId={a.id} accountName={a.name} />
                  </section>
                )}
              </>
            )}
            {tab === 'details' && phone && (
              <div className="sheet account-page__fields" onInput={here.typing}>
                {details}
              </div>
            )}
          </div>
        </div>
        {!phone && (
          <aside className="sheet account-page__side" aria-label={t('acc.tab.details')} onInput={here.typing}>
            {details}
          </aside>
        )}
      </div>
      {removing && (
        <Confirm
          title={t('accounts.deleteTitle', { name: a.name })}
          body={t('accounts.deleteBody')}
          confirmLabel={t('common.delete')}
          danger
          onClose={() => setRemoving(false)}
          onConfirm={async () => {
            trashed(await del(`/accounts/${id}`), () => navigate(`/accounts/${id}`));
            navigate('/accounts');
          }}
        />
      )}
    </>
  );
}

/** Whether the band carries the health tile: the worked-out score, or else the team's own judgement. */
function bandShowsHealth(org: { health?: { enabled: boolean } | null; accountFields: AccountField[] }) {
  return !!(org.health?.enabled && org.accountFields.some((f) => f.health)) || org.accountFields.some((f) => f.key === 'health' && f.type === 'select');
}

const DAY_MS = 86400000;

/**
 * The top of a customer's page, read at a glance: health and the reason for it (all reasons one tap
 * away), days to renewal, what the contract is worth in the customer's own currency, and the next
 * promised step with its owner and date. Each tile appears only when the company keeps that field.
 */
function AccountBand({ account, tasks, again, onAddTask }: { account: Account; tasks: (Task & { boardName: string })[]; again: number; onAddTask?: () => void }) {
  const { t, locale } = useI18n();
  const { me, person } = useStore();
  const fmt = useFieldFormat();
  const { renewal, value } = keyFields(me.org.accountFields);
  const scoreOn = !!(me.org.health?.enabled && me.org.accountFields.some((f) => f.health));
  const judgement = me.org.accountFields.find((f) => f.key === 'health' && f.type === 'select');
  const healthTile = bandShowsHealth(me.org);
  const [why, setWhy] = useState(false);
  const whyId = useId();
  const reasons = useHealthWhy(account.id, scoreOn, again);
  const healthText = useHealthText();
  const stored = account.fields[HEALTH_FIELD];
  const score = scoreOn ? (reasons?.health?.score ?? (typeof stored === 'number' ? stored : null)) : null;
  const band = scoreOn ? scoreBand(score, me.org.health?.bands) : bandOf(account, me.org.health);
  const weakest = weakestPart(reasons?.health?.parts);

  const renewOn = typeof account.fields[renewal?.key ?? ''] === 'string' && account.fields[renewal!.key] ? String(account.fields[renewal!.key]) : null;
  const days = renewOn ? Math.round((Date.parse(renewOn.slice(0, 10)) - Date.parse(todayIso())) / DAY_MS) : null;
  const renewTone = days === null ? undefined : days < 30 ? 'late' : days < 90 ? 'soon' : 'calm';
  const worth = value ? account.fields[value.key] : null;

  // The next promise: the open step due soonest; one with no date comes after every dated one.
  const next = [...tasks].sort((x, y) => (x.dueDate ?? '9999').localeCompare(y.dueDate ?? '9999'))[0];
  const owner = next ? person(next.assigneeIds[0]) : undefined;

  return (
    <section className="acc-band" aria-label={t('acc.band')}>
      <div className="acc-band__tiles">
      {healthTile && (
        <div className="acc-tile acc-tile--health" data-band={band ?? undefined}>
          <span className="acc-tile__label">{t('acc.band.health')}</span>
          <span className="acc-tile__value">
            {score !== null && <span className="acc-tile__score num">{formatNumber(score, locale)}</span>}
            <span className="acc-tile__state">{band ? t(`health.band.${band}` as MessageKey) : judgement ? t('acc.band.noJudgement') : '—'}</span>
          </span>
          {scoreOn ? (
            <span className="acc-tile__sub">
              <span className="acc-tile__reason">{weakest ? healthText(weakest) : reasons ? t('acards.clear') : ''}</span>
              <button type="button" className="linkbtn acc-tile__why" aria-expanded={why} aria-controls={whyId} onClick={() => setWhy((o) => !o)}>
                {why ? t('health.hide') : t('health.why')}
              </button>
            </span>
          ) : (
            <span className="acc-tile__sub">{t('acc.band.judged')}</span>
          )}
        </div>
      )}
      {renewal && (
        <div className="acc-tile" data-tone={renewTone}>
          <span className="acc-tile__label">{labelOf(renewal.label, locale)}</span>
          <span className="acc-tile__value">
            {days === null ? (
              <span className="acc-tile__state">—</span>
            ) : days === 0 ? (
              <span className="acc-tile__state">{t('acc.band.today')}</span>
            ) : (
              <>
                <span className="acc-tile__score num">{formatNumber(Math.abs(days), locale)}</span>
                <span className="acc-tile__state">{days > 0 ? t('acc.band.daysLeft') : t('acc.band.daysLate')}</span>
              </>
            )}
          </span>
          <span className="acc-tile__sub">{renewOn ? formatDate(renewOn, locale, { day: 'numeric', month: 'long', year: 'numeric' }) : t('acc.band.noDate')}</span>
        </div>
      )}
      {value && (
        <div className="acc-tile">
          <span className="acc-tile__label">{labelOf(value.label, locale)}</span>
          <span className="acc-tile__value">
            <span className="acc-tile__money num">{worth === null || worth === undefined || worth === '' ? '—' : fmt(value, worth, account.currency)}</span>
          </span>
          {account.currency && account.currency !== me.org.currency && <span className="acc-tile__sub">{t('acc.band.ownCurrency', { code: account.currency })}</span>}
        </div>
      )}
      <div className="acc-tile acc-tile--next">
        <span className="acc-tile__label">{t('acc.band.next')}</span>
        {next ? (
          <>
            <a
              className="acc-tile__task"
              href={`/b/${next.boardId}?task=${next.id}`}
              onClick={(e) => {
                e.preventDefault();
                const p = new URLSearchParams(location.search);
                p.set('task', next.id);
                navigate(`${location.pathname}?${p}`);
              }}
            >
              {next.title}
            </a>
            <span className="acc-tile__sub acc-tile__who">
              {owner && <Avatar person={owner} />}
              <span className="acc-tile__name">{owner ? owner.name.split(/\s+/)[0] : t('acc.band.nobody')}</span>
              <DueLabel due={next.dueDate} done={false} />
            </span>
          </>
        ) : (
          <>
            <span className="acc-tile__value">
              <span className="acc-tile__state">{t('acc.band.noNext')}</span>
            </span>
            {onAddTask ? (
              <button type="button" className="linkbtn acc-tile__sub" onClick={onAddTask}>
                {t('acc.band.addNext')}
              </button>
            ) : null}
          </>
        )}
      </div>
      </div>
      {why && scoreOn && (
        <div className="acc-band__why" id={whyId}>
          <HealthWhy data={reasons} score={score} />
        </div>
      )}
    </section>
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
        const p = new URLSearchParams(location.search);
        p.set('task', task.id);
        navigate(`${location.pathname}?${p}`);
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
