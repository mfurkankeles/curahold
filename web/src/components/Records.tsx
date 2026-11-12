// Records under accounts — contacts, opportunities, risks and whatever else
// the company keeps: a list per kind, a section per kind on the account
// page, and one dialog to add or edit a record.
import { useMoney } from '../lib/money';
import { todayIso } from '../lib/time';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { labelOf } from '../../../shared/src/fields';
import type { Account } from '../../../shared/src/model';
import { CONTACT_COLUMNS, RECORD_BUILTIN_COLUMNS, fullName, splitName, typeLabel, type AppRecord, type LinkInfo, type RecordType } from '../../../shared/src/records';
import type { AccountField } from '../../../shared/src/model';
import { FieldInput, useFieldFormat } from '../pages/Accounts';
import { ExportMenu } from './Export';
import { allPages, cellOf } from '../lib/export';
import { ApiFailure, del, get, patch, post } from '../lib/api';
import { useLive } from '../lib/live';
import { useI18n } from '../lib/i18n';
import { navigate, navigateFresh, setQuery } from '../lib/router';
import { useStore } from '../lib/store';
import { useRecordTypes } from './AccountFields';
import { PROVIDER_NAMES } from './Connections';
import { OrgChart, StanceBadge } from './OrgChart';
import { Avatar, Confirm, Dialog } from './ui';
import { EmptyState, SkeletonCards, SkeletonRows } from './Empty';
import { Icon, PageIcon, RECORD_KIND_ICON } from './icons';
import { GroupBy, RecordBoard, groupChoices } from './Pipeline';
import { useTrashToast } from '../lib/trash';

/**
 * A table column: one of the record's own fields, or something every record
 * has (its customer, owner, who added it and when).
 */
export type Column = { key: string; builtin: (typeof RECORD_BUILTIN_COLUMNS)[number] } | { key: string; field: AccountField };

/** The columns a record table shows: the company's choice, or Curahold's (customer, a few fields, owner). */
export function tableColumns(type: RecordType): Column[] {
  const byKey = (k: string): Column | null =>
    (RECORD_BUILTIN_COLUMNS as readonly string[]).includes(k) ? { key: k, builtin: k as (typeof RECORD_BUILTIN_COLUMNS)[number] } : ((f) => (f ? { key: k, field: f } : null))(type.fields.find((f) => f.key === k));
  const keys = type.columns?.length ? type.columns : ['account', ...shownFields(type, 4).map((f) => f.key), 'owner'];
  return keys.map(byKey).filter((c): c is Column => !!c);
}

// ------------------------------------------------- deals: which close dates

/** The spans a deal list can show, by close date. The quarter first: targets are counted by it. */
const PERIODS = ['quarter', 'next_quarter', 'last_quarter', 'month', 'next_month', 'week', 'year', 'range', 'any'] as const;
type PeriodPick = (typeof PERIODS)[number];

/** The first and last day of a span (inclusive), or null for "any time". */
export function periodSpan(p: PeriodPick, range: { from: string; to: string }, today = todayIso()): { from: string; to: string } | null {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7)) - 1;
  const day = (yy: number, mm: number, dd: number) => new Date(Date.UTC(yy, mm, dd)).toISOString().slice(0, 10);
  const q0 = m - (m % 3);
  if (p === 'quarter') return { from: day(y, q0, 1), to: day(y, q0 + 3, 0) };
  if (p === 'next_quarter') return { from: day(y, q0 + 3, 1), to: day(y, q0 + 6, 0) };
  if (p === 'last_quarter') return { from: day(y, q0 - 3, 1), to: day(y, q0, 0) };
  if (p === 'month') return { from: day(y, m, 1), to: day(y, m + 1, 0) };
  if (p === 'next_month') return { from: day(y, m + 1, 1), to: day(y, m + 2, 0) };
  if (p === 'year') return { from: day(y, 0, 1), to: day(y, 12, 0) };
  if (p === 'week') {
    const d = new Date(`${today}T00:00:00Z`);
    const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
    return { from: monday, to: new Date(Date.parse(`${monday}T00:00:00Z`) + 6 * 86_400_000).toISOString().slice(0, 10) };
  }
  if (p === 'range') return range.from || range.to ? { from: range.from || '0000-01-01', to: range.to || '9999-12-31' } : null;
  return null;
}

// ------------------------------------------------------------ the columns

/**
 * Which columns a record table shows, for everyone in the company: the
 * built-ins (customer, owner, who added it, when) and any of its fields,
 * in the order picked. Up to twelve.
 */
function ColumnChooser({ type, onClose, onSaved }: { type: RecordType; onClose: () => void; onSaved: () => void }) {
  const { t, locale, words } = useI18n();
  const { toast } = useStore();
  const [keys, setKeys] = useState<string[]>(() => tableColumns(type).map((c) => c.key));
  const all: { key: string; label: string }[] = [
    ...RECORD_BUILTIN_COLUMNS.map((k) => ({ key: k, label: t(`records.col.${k}` as any, { account: words.one }) })),
    ...type.fields.filter((f) => !(type.kind === 'contact' && (f.key === 'first_name' || f.key === 'last_name'))).map((f) => ({ key: f.key, label: labelOf(f.label, locale) })),
  ];
  const label = (k: string) => all.find((x) => x.key === k)?.label ?? k;
  const move = (k: string, by: number) =>
    setKeys((list) => {
      const i = list.indexOf(k);
      const j = i + by;
      if (i < 0 || j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const save = async (value: string[] | null) => {
    try {
      await patch(`/record-types/${type.id}`, { columns: value });
      onSaved();
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    }
  };
  return (
    <Dialog
      title={t('records.columnsTitle', { type: typeLabel(type, locale) })}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--quiet" style={{ marginRight: 'auto' }} onClick={() => void save(null)}>
            {t('records.columnsReset')}
          </button>
          <button className="btn btn--quiet" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn--primary" onClick={() => void save(keys)}>
            {t('common.save')}
          </button>
        </>
      }
    >
      <p className="field__hint" style={{ marginTop: 0 }}>
        {t('records.columnsLead')}
      </p>
      <ol className="colpick">
        {keys.map((k, i) => (
          <li key={k}>
            <span className="colpick__name">{label(k)}</span>
            <button className="btn btn--quiet btn--icon btn--small" disabled={i === 0} aria-label={t('records.columnUp', { name: label(k) })} onClick={() => move(k, -1)}>
              ↑
            </button>
            <button className="btn btn--quiet btn--icon btn--small" disabled={i === keys.length - 1} aria-label={t('records.columnDown', { name: label(k) })} onClick={() => move(k, 1)}>
              ↓
            </button>
            <button className="btn btn--quiet btn--icon btn--small" aria-label={t('records.columnRemove', { name: label(k) })} onClick={() => setKeys((list) => list.filter((x) => x !== k))}>
              <Icon name="close" size={13} />
            </button>
          </li>
        ))}
      </ol>
      <div className="rb-chips">
        {all
          .filter((x) => !keys.includes(x.key))
          .map((x) => (
            <button key={x.key} type="button" className="rb-chip" disabled={keys.length >= 12} onClick={() => setKeys((list) => [...list, x.key])}>
              + {x.label}
            </button>
          ))}
      </div>
    </Dialog>
  );
}

/** The fields worth a column: for contacts the stakeholder ones, otherwise the first few. */
export function shownFields(type: RecordType, n: number): AccountField[] {
  if (type.kind === 'contact') {
    const picked = CONTACT_COLUMNS.map((k) => type.fields.find((f) => f.key === k)).filter((f): f is AccountField => !!f);
    const rest = type.fields.filter((f) => !CONTACT_COLUMNS.includes(f.key) && f.key !== 'first_name' && f.key !== 'last_name');
    return [...picked, ...rest].slice(0, n);
  }
  return type.fields.slice(0, n);
}

/** A field value in a table cell; stance as its coloured label. */
function Cell({ field, value, currency }: { field: AccountField; value: unknown; currency?: string | null }) {
  const fmt = useFieldFormat();
  if (field.key === 'stance') return <StanceBadge field={field} value={value} />;
  if (field.key === 'phone' && value) {
    return (
      <a href={`tel:${String(value).replace(/\s+/g, '')}`} onClick={(e) => e.stopPropagation()}>
        {String(value)}
      </a>
    );
  }
  if (field.type === 'email' && value) {
    return (
      <a href={`mailto:${value}`} onClick={(e) => e.stopPropagation()}>
        {String(value)}
      </a>
    );
  }
  if (field.type === 'money') return <>{fmt(field, value, currency)}</>;
  if (field.type === 'url' && value) {
    return (
      <a href={String(value)} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()}>
        {fmt(field, value)}
      </a>
    );
  }
  return <>{fmt(field, value)}</>;
}

/** Accounts | Contacts | Opportunities | Risks … — shown above both lists. */
export function RecordTabs({ current, types }: { current: string; types: RecordType[] | null }) {
  const { words, locale } = useI18n();
  if (!types?.length) return null;
  const go = (path: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    navigateFresh(path);
  };
  return (
    <nav className="record-tabs" aria-label={words.other}>
      <a href="/accounts" aria-current={current === 'accounts' ? 'page' : undefined} onClick={go('/accounts')}>
        {words.other}
      </a>
      {types.map((ty) => (
        <a key={ty.id} href={`/records/${ty.key}`} aria-current={current === ty.key ? 'page' : undefined} onClick={go(`/records/${ty.key}`)}>
          {typeLabel(ty, locale)}
          <span className="record-tabs__n num">{ty.count ?? 0}</span>
        </a>
      ))}
    </nav>
  );
}

export function OpenIn({ links }: { links?: LinkInfo[] }) {
  const { t } = useI18n();
  const shown = (links ?? []).filter((l) => l.url);
  if (!shown.length) return null;
  return (
    <span className="open-in">
      {shown.map((l) => (
        <a key={l.connectionId} href={l.url!} target="_blank" rel="noreferrer noopener">
          {t('records.openIn', { name: PROVIDER_NAMES[l.provider] ?? l.provider })} ↗
        </a>
      ))}
    </span>
  );
}

export function RecordsPage({ typeKey }: { typeKey: string }) {
  const { t, locale, fmtDate, words } = useI18n();
  const { people, person, canWrite, can } = useStore();
  const { types, load: loadTypes } = useRecordTypes();
  const type = types?.find((x) => x.key === typeKey) ?? null;
  const [q, setQ] = useState('');
  const [owner, setOwner] = useState('');
  const [data, setData] = useState<{ records: AppRecord[]; total: number } | null>(null);
  // New records open the dialog; an existing one opens its panel (with its thread and tasks).
  const [editing, setEditing] = useState<'new' | null>(null);
  const openRecord = (r: AppRecord) => setQuery('record', r.id);
  const [choosing, setChoosing] = useState(false);
  // Deals: which close dates are shown. The target period first; any other span on request.

  // Board or table, and which field makes the columns: remembered per kind of record, on this device.
  const choices = type ? groupChoices(type) : [];
  const stored = (k: string) => {
    try {
      return localStorage.getItem(`app_records_${k}_${typeKey}`);
    } catch {
      return null;
    }
  };
  const [viewPick, setViewPick] = useState<'board' | 'table' | null>(() => stored('view') as 'board' | 'table' | null);
  const [period, setPeriod] = useState<PeriodPick>(() => (stored('period') as PeriodPick | null) ?? 'quarter');
  const [range, setRange] = useState<{ from: string; to: string }>({ from: '', to: '' });
  const [groupPick, setGroupPick] = useState<string | null>(() => stored('group'));
  const keep = (k: string, v: string) => {
    try {
      localStorage.setItem(`app_records_${k}_${typeKey}`, v);
    } catch {
      /* per-device convenience */
    }
  };
  const view = !choices.length ? 'table' : (viewPick ?? (type?.kind === 'opportunity' ? 'board' : 'table'));
  const groupKey = choices.some((f) => f.key === groupPick) ? groupPick! : (choices.find((f) => f.key === 'stage') ?? choices[0])?.key ?? '';
  const load = useCallback(async () => {
    const p = new URLSearchParams({ type: typeKey, limit: '500' });
    if (q.trim()) p.set('q', q.trim());
    if (owner) p.set('owner', owner);
    setData(await get(`/records?${p}`));
  }, [typeKey, q, owner]);
  useEffect(() => {
    const id = setTimeout(() => void load(), 200);
    return () => clearTimeout(id);
  }, [load]);
  useLive('records', () => void load());
  if (types && !type)
    return (
      <div className="page">
        <EmptyState icon="layout" title={t('errors.not_found')} />
      </div>
    );
  const cols = type ? tableColumns(type) : [];
  const isDeal = type?.kind === 'opportunity';
  const closeField = isDeal ? (type!.fields.find((f) => f.key === 'close_date' && f.type === 'date') ?? type!.fields.find((f) => f.type === 'date')) : undefined;
  const span = closeField ? periodSpan(period, range) : null;
  // Deals outside the chosen span are left out; one with no close date shows only under "Any time".
  const rows = (data?.records ?? []).filter((r) => {
    if (!span || !closeField) return true;
    const d = String(r.fields[closeField.key] ?? '').slice(0, 10);
    return !!d && d >= span.from && d <= span.to;
  });
  const builtinCell = (c: Extract<Column, { builtin: string }>, r: AppRecord) => {
    if (c.builtin === 'account')
      return r.accountId ? (
        <a
          href={`/accounts/${r.accountId}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            navigate(`/accounts/${r.accountId}`);
          }}
        >
          {r.accountName}
        </a>
      ) : (
        <span className="muted">—</span>
      );
    if (c.builtin === 'owner') return r.ownerId ? <span className="owner"><Avatar person={person(r.ownerId)} /> {person(r.ownerId)?.name}</span> : <span className="muted">—</span>;
    if (c.builtin === 'created_by') return r.createdBy ? <span className="owner"><Avatar person={person(r.createdBy)} /> {person(r.createdBy)?.name}</span> : <span className="muted">{t('records.byImport')}</span>;
    if (c.builtin === 'created_at') return fmtDate(r.createdAt, { day: 'numeric', month: 'short', year: 'numeric' });
    return fmtDate(r.updatedAt, { day: 'numeric', month: 'short', year: 'numeric' });
  };
  const colLabel = (c: Column) => ('field' in c ? labelOf(c.field.label, locale) : t(`records.col.${c.builtin}` as any, { account: words.one }));
  return (
    <>
      <header className="topbar">
        <h1 className="topbar__title topbar__title--icon">
          <PageIcon name={RECORD_KIND_ICON[type?.kind ?? ''] ?? 'layout'} />
          <span>{type ? typeLabel(type, locale) : ''}</span>
        </h1>
        {data && <span className="topbar__sub num">{t('records.total', { n: data.total })}</span>}
        <div className="topbar__spacer" />
        {type && (
          <ExportMenu
            disabled={!data?.total}
            make={async () => {
              const base = new URLSearchParams({ type: typeKey, limit: '500' });
              if (q.trim()) base.set('q', q.trim());
              if (owner) base.set('owner', owner);
              const list = await allPages(async (offset) => {
                base.set('offset', String(offset));
                const r = await get<{ records: AppRecord[]; total: number }>(`/records?${base}`);
                return { items: r.records, total: r.total };
              });
              return {
                name: typeLabel(type, locale),
                headers: [t('records.name'), t('records.account'), t('records.owner'), ...type.fields.map((f) => labelOf(f.label, locale))],
                rows: list.map((r) => [r.name, r.accountName ?? '', person(r.ownerId)?.name ?? '', ...type.fields.map((f) => cellOf(f, r.fields[f.key], locale))]),
              };
            }}
          />
        )}
        {canWrite && type && (
          <button className="btn btn--primary" onClick={() => setEditing('new')}>
            <Icon name="plus" size={16} />
            {t('records.new', { type: typeLabel(type, locale, false) })}
          </button>
        )}
      </header>
      <div className={view === 'board' ? 'page page--board' : 'page'}>
        <RecordTabs current={typeKey} types={types} />
        <div className="toolbar" style={{ marginBottom: 12 }}>
          {choices.length > 0 && (
            <div className="seg seg--views" role="tablist">
              <button role="tab" aria-selected={view === 'board'} aria-pressed={view === 'board'} onClick={() => (setViewPick('board'), keep('view', 'board'))}>
                <Icon name="board" size={15} />
                {t('board.view.board')}
              </button>
              <button role="tab" aria-selected={view === 'table'} aria-pressed={view === 'table'} onClick={() => (setViewPick('table'), keep('view', 'table'))}>
                <Icon name="list" size={15} />
                {t('acards.view.table')}
              </button>
            </div>
          )}
          {view === 'board' && <GroupBy fields={choices} value={groupKey} onChange={(k) => (setGroupPick(k), keep('group', k))} />}
          {closeField && (
            <label className="toolbar__field">
              <span className="sr-only">{labelOf(closeField.label, locale)}</span>
              <select className="select" value={period} title={labelOf(closeField.label, locale)} onChange={(e) => (setPeriod(e.target.value as PeriodPick), keep('period', e.target.value))}>
                {PERIODS.map((p) => (
                  <option key={p} value={p}>
                    {t(`records.period.${p}` as any, { field: labelOf(closeField.label, locale) })}
                  </option>
                ))}
              </select>
            </label>
          )}
          {closeField && period === 'range' && (
            <span className="toolbar__range">
              <input className="input" type="date" value={range.from} aria-label={t('records.period.from')} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
              <span aria-hidden="true">–</span>
              <input className="input" type="date" value={range.to} aria-label={t('records.period.to')} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
            </span>
          )}
          <input className="input search" type="search" value={q} placeholder={t('records.search')} aria-label={t('records.search')} onChange={(e) => setQ(e.target.value)} />
          <select className="select" value={owner} aria-label={t('accounts.owner')} onChange={(e) => setOwner(e.target.value)}>
            <option value="">{t('accounts.anyOwner')}</option>
            <option value="me">{t('accounts.filter.mine')}</option>
            {people
              .filter((p) => p.status !== 'deleted')
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
          {view === 'table' && type && can('accounts.manage') && (
            <button className="btn" onClick={() => setChoosing(true)} title={t('records.columnsHint')}>
              <Icon name="columns" size={15} /> {t('records.columns')}
            </button>
          )}
        </div>
        {!data ? (
          view === 'board' ? <SkeletonCards columns count={4} label={t('common.loading')} /> : <SkeletonRows rows={8} label={t('common.loading')} />
        ) : rows.length === 0 ? (
          <div className="sheet">
            <EmptyState
              icon={q || owner || span ? 'search' : type?.kind === 'opportunity' ? 'funnel' : type?.kind === 'contact' ? 'idcard' : 'layout'}
              title={q || owner ? t('records.noMatch') : span && data.records.length ? t('records.noneInPeriod') : t('records.empty')}
            >
              {span && data.records.length > 0 && (
                <button className="btn" onClick={() => (setPeriod('any'), keep('period', 'any'))}>
                  {t('records.period.showAll')}
                </button>
              )}
              {!q && !owner && !(span && data.records.length) && canWrite && type && (
                <button className="btn btn--primary" onClick={() => setEditing('new')}>
                  <Icon name="plus" size={16} />
                  {t('records.new', { type: typeLabel(type, locale, false) })}
                </button>
              )}
            </EmptyState>
          </div>
        ) : view === 'board' && type ? (
          <RecordBoard
            type={type}
            records={rows}
            groupKey={groupKey}
            onOpen={openRecord}
            onChanged={(r) => setData((d) => (d ? { ...d, records: d.records.map((x) => (x.id === r.id ? r : x)) } : d))}
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('records.name')}</th>
                  {cols.map((c, i) => (
                    <th key={c.key} className={i > 0 ? 'hide-phone' : undefined}>
                      {colLabel(c)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="row-link" onClick={() => openRecord(r)}>
                    <td>
                      <button
                        className="linkbtn linkbtn--plain"
                        onClick={(e) => {
                          e.stopPropagation();
                          openRecord(r);
                        }}
                      >
                        {r.name}
                      </button>
                    </td>
                    {cols.map((c, i) => (
                      <td key={c.key} className={i > 0 ? 'hide-phone' : undefined}>
                        {'field' in c ? <Cell field={c.field} value={r.fields[c.key]} currency={r.currency} /> : builtinCell(c, r)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {choosing && type && (
        <ColumnChooser
          type={type}
          onClose={() => setChoosing(false)}
          onSaved={async () => {
            setChoosing(false);
            await loadTypes();
          }}
        />
      )}
      {editing && type && (
        <RecordDialog
          type={type}
          record={null}
          onClose={() => setEditing(null)}
          onDone={async () => {
            await load();
            await loadTypes();
          }}
        />
      )}
    </>
  );
}

/** The account page's section for one kind of record; contacts can be shown as an org chart. */
export function AccountRecords({ account, types, onChange }: { account: Account; types: RecordType[]; onChange: () => void }) {
  const { t, locale } = useI18n();
  const { canWrite } = useStore();
  const fmt = useFieldFormat();
  const [lists, setLists] = useState<Record<string, AppRecord[]>>({});
  const [editing, setEditing] = useState<{ type: RecordType; record: AppRecord | null; parentId?: string | null } | null>(null);
  const [view, setView] = useState<'chart' | 'list'>(() => {
    try {
      return localStorage.getItem('app-contacts-view') === 'list' ? 'list' : 'chart';
    } catch {
      return 'chart';
    }
  });
  const pickView = (v: 'chart' | 'list') => {
    setView(v);
    try {
      localStorage.setItem('app-contacts-view', v);
    } catch {
      // only a convenience
    }
  };
  const load = useCallback(async () => {
    const all = await Promise.all(types.map((ty) => get<{ records: AppRecord[] }>(`/records?type=${ty.id}&account=${account.id}&limit=500`).then((r) => [ty.id, r.records] as const)));
    setLists(Object.fromEntries(all));
  }, [types, account.id]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <>
      {types.map((ty) => {
        const list = lists[ty.id] ?? [];
        const isContact = ty.kind === 'contact';
        const cols = shownFields(ty, 3);
        return (
          <section className="sheet" key={ty.id}>
            <div className="section__row">
              <h3 className="section__head">
                <span>
                  <Icon name={RECORD_KIND_ICON[ty.kind] ?? 'layout'} size={16} className="icon--lead" />
                  {isContact ? t('org.stakeholders') : typeLabel(ty, locale)}
                  <span className="muted num">{list.length}</span>
                </span>
              </h3>
              {isContact && (
                <div className="seg" role="group" aria-label={t('org.view')}>
                  <button aria-pressed={view === 'chart'} onClick={() => pickView('chart')}>
                    {t('org.chart')}
                  </button>
                  <button aria-pressed={view === 'list'} onClick={() => pickView('list')}>
                    {t('org.list')}
                  </button>
                </div>
              )}
              {canWrite && !(isContact && view === 'chart') && (
                <button className="btn btn--small" onClick={() => setEditing({ type: ty, record: null })}>
                  {t('common.add')}
                </button>
              )}
            </div>
            {isContact && view === 'chart' ? (
              <OrgChart
                type={ty}
                records={list}
                onChanged={() => {
                  void load();
                  onChange();
                }}
                onOpen={(r) => setEditing({ type: ty, record: r })}
                onAdd={(parentId) => setEditing({ type: ty, record: null, parentId })}
              />
            ) : list.length === 0 ? (
              <p className="muted">{t('records.noneHere', { type: typeLabel(ty, locale).toLocaleLowerCase(locale === 'tr' ? 'tr-TR' : 'en-US') })}</p>
            ) : (
              <ul className="plainlist record-lines">
                {list.map((r) => (
                  <li key={r.id}>
                    <button className="record-line" onClick={() => (ty.kind === 'contact' ? setEditing({ type: ty, record: r }) : setQuery('record', r.id))}>
                      <span className="record-line__name">{r.name}</span>
                      {cols.map((f) => {
                        if (f.key === 'stance') return r.fields.stance ? <StanceBadge key={f.key} field={f} value={r.fields.stance} /> : null;
                        const v = fmt(f, r.fields[f.key]);
                        return v ? (
                          <span key={f.key} className="record-line__val">
                            {v}
                          </span>
                        ) : null;
                      })}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
      {editing && (
        <RecordDialog
          type={editing.type}
          record={editing.record}
          accountId={account.id}
          parentId={editing.parentId}
          siblings={lists[editing.type.id] ?? []}
          onClose={() => setEditing(null)}
          onDone={async () => {
            await load();
            onChange();
          }}
        />
      )}
    </>
  );
}

export function RecordDialog({
  type,
  record,
  accountId,
  parentId,
  siblings,
  onClose,
  onDone,
}: {
  type: RecordType;
  record: AppRecord | null;
  accountId?: string;
  parentId?: string | null;
  /** Others of the same kind at the account, for "reports to". */
  siblings?: AppRecord[];
  onClose: () => void;
  onDone: () => unknown;
}) {
  const { t, locale, words } = useI18n();
  const { me, people, canWrite, can, toast } = useStore();
  const trashed = useTrashToast();
  const isContact = type.kind === 'contact';
  const [name, setName] = useState(record?.name ?? '');
  const initialSplit = record && isContact && !record.fields.first_name && !record.fields.last_name ? splitName(record.name) : null;
  const [parent, setParent] = useState<string>(record?.parentId ?? parentId ?? '');
  const [ownerId, setOwnerId] = useState(record?.ownerId ?? (record ? '' : me.user.id));
  const [account, setAccount] = useState<string>(record?.accountId ?? accountId ?? '');
  const [values, setValues] = useState<Record<string, string | number | null>>(
    initialSplit ? { ...(record?.fields ?? {}), first_name: initialSplit.first, last_name: initialSplit.last } : (record?.fields ?? {}),
  );
  const contactName = fullName(values.first_name, values.last_name);
  const effectiveName = isContact ? contactName || name : name;
  // Who can be the manager: anyone at the account who is not this person or below them.
  const managers = useMemo(() => {
    if (!siblings || !isContact) return [];
    const below = new Set<string>();
    if (record) {
      const walk = (id: string) => siblings.filter((x) => x.parentId === id).forEach((x) => !below.has(x.id) && (below.add(x.id), walk(x.id)));
      walk(record.id);
    }
    return siblings.filter((x) => x.id !== record?.id && !below.has(x.id));
  }, [siblings, record, isContact]);
  const [accounts, setAccounts] = useState<{ id: string; name: string; currency?: string | null }[]>([]);
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  // The currency of this record's amounts: its own, else its customer's, else the company's.
  const money = useMoney();
  const hasMoney = type.fields.some((f) => f.type === 'money');
  const [currency, setCurrency] = useState<string>(record?.currency ?? '');
  useEffect(() => {
    if (accountId) return;
    get<{ accounts: Account[] }>('/accounts?limit=500').then((r) => setAccounts(r.accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency ?? null }))));
  }, [accountId]);
  const changed = useMemo(() => {
    const out: Record<string, string | number | null> = {};
    for (const [k, v] of Object.entries(values)) if ((record?.fields[k] ?? null) !== v) out[k] = v;
    return out;
  }, [values, record]);
  const save = async () => {
    setBusy(true);
    try {
      if (record) {
        await patch(`/records/${record.id}`, {
          ...(!isContact && name.trim() !== record.name ? { name: name.trim() } : {}),
          ...(ownerId !== (record.ownerId ?? '') ? { ownerId: ownerId || null } : {}),
          ...(account !== (record.accountId ?? '') ? { accountId: account || null } : {}),
          ...(isContact && siblings && parent !== (record.parentId ?? '') ? { parentId: parent || null } : {}),
          ...(Object.keys(changed).length ? { fields: changed } : {}),
          ...(currency !== (record.currency ?? '') ? { currency: currency || null } : {}),
        });
      } else {
        await post('/records', {
          typeId: type.id,
          ...(isContact ? {} : { name: name.trim() }),
          ownerId: ownerId || null,
          accountId: account || null,
          ...(isContact && parent ? { parentId: parent } : {}),
          fields: values,
          ...(currency ? { currency } : {}),
        });
      }
      await onDone();
      onClose();
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    } finally {
      setBusy(false);
    }
  };
  const one = typeLabel(type, locale, false);
  return (
    <Dialog
      title={record ? effectiveName || record.name : t('records.new', { type: one })}
      onClose={onClose}
      wide
      footer={
        <>
          {record && can('accounts.manage') && (
            <button className="btn btn--quiet btn--danger" style={{ marginRight: 'auto' }} onClick={() => setRemoving(true)}>
              {t('common.delete')}
            </button>
          )}
          <button className="btn btn--quiet" onClick={onClose}>
            {t('common.cancel')}
          </button>
          {canWrite && (
            <button className="btn btn--primary" disabled={!effectiveName.trim() || busy} onClick={save}>
              {record ? t('common.save') : t('common.create')}
            </button>
          )}
        </>
      }
    >
      {record && <OpenIn links={record.links} />}
      {isContact && record && <ContactLinks fields={values} name={effectiveName} />}
      <div className="form">
        {isContact ? (
          <div className="form__row">
            {(['first_name', 'last_name'] as const).map((k) => (
              <label className="field" key={k}>
                <span className="field__label">{labelOf(type.fields.find((f) => f.key === k)?.label, locale) || t(k === 'first_name' ? 'org.firstName' : 'org.lastName')}</span>
                <input className="input" autoFocus={!record && k === 'first_name'} value={String(values[k] ?? '')} maxLength={150} disabled={!canWrite} onChange={(e) => setValues((x) => ({ ...x, [k]: e.target.value }))} />
              </label>
            ))}
          </div>
        ) : (
          <label className="field">
            <span className="field__label">{t('records.name')}</span>
            <input className="input" autoFocus={!record} value={name} maxLength={300} disabled={!canWrite} onChange={(e) => setName(e.target.value)} />
          </label>
        )}
        {isContact && siblings && (
          <label className="field">
            <span className="field__label">{t('org.reportsTo')}</span>
            <select className="select" value={parent} disabled={!canWrite} onChange={(e) => setParent(e.target.value)}>
              <option value="">{t('org.nobodyTop')}</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.fields.title ? ` — ${m.fields.title}` : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="form__row">
          {!accountId && (
            <label className="field">
              <span className="field__label">{words.one}</span>
              <select className="select" value={account} disabled={!canWrite} onChange={(e) => setAccount(e.target.value)}>
                <option value="">—</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            <span className="field__label">{t('accounts.owner')}</span>
            <select className="select" value={ownerId} disabled={!canWrite} onChange={(e) => setOwnerId(e.target.value)}>
              <option value="">{t('accounts.noOwner')}</option>
              {people
                .filter((p) => p.status === 'active' || p.status === 'invited' || p.id === record?.ownerId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <div className="record-fields">
          {type.fields.filter((f) => !(isContact && (f.key === 'first_name' || f.key === 'last_name'))).map((f) => (
            <label className="field" key={f.key}>
              <span className="field__label">
                {labelOf(f.label, locale)}
                {f.type === 'money' && <span className="muted"> · {currency || accounts.find((a) => a.id === account)?.currency || money.base}</span>}
              </span>
              <FieldInput field={f} value={values[f.key]} disabled={!canWrite || f.locked} onSave={(v) => setValues((x) => ({ ...x, [f.key]: v }))} />
            </label>
          ))}
          {hasMoney && money.multi && (
            <label className="field">
              <span className="field__label">{t('money.currency')}</span>
              <select className="select" value={currency} disabled={!canWrite} onChange={(e) => setCurrency(e.target.value)}>
                <option value="">{t('money.followCustomer', { code: accounts.find((a) => a.id === account)?.currency || money.base })}</option>
                {money.usable.map((c) => (
                  <option key={c} value={c}>
                    {c} · {money.nameOf(c)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>
      {removing && record && (
        <Confirm
          title={t('records.deleteTitle', { name: record.name })}
          body={t(record.links?.length ? 'records.deleteLinked' : 'records.deleteBody')}
          confirmLabel={t('common.delete')}
          danger
          onClose={() => setRemoving(false)}
          onConfirm={async () => {
            trashed(await del(`/records/${record.id}`), onDone);
            await onDone();
            onClose();
          }}
        />
      )}
    </Dialog>
  );
}

/** Email, call and LinkedIn in one tap. */
function ContactLinks({ fields, name }: { fields: Record<string, unknown>; name: string }) {
  const { t } = useI18n();
  const links = [
    fields.email ? { href: `mailto:${fields.email}`, label: t('org.email', { name }), text: String(fields.email) } : null,
    fields.phone ? { href: `tel:${String(fields.phone).replace(/\s+/g, '')}`, label: t('org.phone', { name }), text: String(fields.phone) } : null,
    fields.linkedin ? { href: String(fields.linkedin), label: t('org.linkedin', { name }), text: 'LinkedIn' } : null,
  ].filter((x): x is { href: string; label: string; text: string } => !!x);
  if (!links.length) return null;
  return (
    <div className="contact-links">
      {links.map((l) => (
        <a key={l.href} href={l.href} aria-label={l.label} target={l.href.startsWith('http') ? '_blank' : undefined} rel="noreferrer noopener">
          {l.text}
        </a>
      ))}
    </div>
  );
}
