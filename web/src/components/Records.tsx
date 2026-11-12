// Records under accounts — contacts, opportunities, risks and whatever else
// the company keeps: a list per kind, a section per kind on the account
// page, and one dialog to add or edit a record.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { labelOf } from '../../../shared/src/fields';
import type { Account } from '../../../shared/src/model';
import { CONTACT_COLUMNS, fullName, splitName, typeLabel, type AppRecord, type LinkInfo, type RecordType } from '../../../shared/src/records';
import type { AccountField } from '../../../shared/src/model';
import { FieldInput, useFieldFormat } from '../pages/Accounts';
import { ExportMenu } from './Export';
import { allPages, cellOf } from '../lib/export';
import { ApiFailure, del, get, patch, post } from '../lib/api';
import { useLive } from '../lib/live';
import { useI18n } from '../lib/i18n';
import { navigate } from '../lib/router';
import { useStore } from '../lib/store';
import { useRecordTypes } from './AccountFields';
import { PROVIDER_NAMES } from './Connections';
import { OrgChart, StanceBadge } from './OrgChart';
import { Avatar, Confirm, Dialog } from './ui';
import { EmptyState, SkeletonCards, SkeletonRows } from './Empty';
import { Icon } from './icons';
import { GroupBy, RecordBoard, groupChoices } from './Pipeline';

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
function Cell({ field, value }: { field: AccountField; value: unknown }) {
  const fmt = useFieldFormat();
  if (field.key === 'stance') return <StanceBadge field={field} value={value} />;
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
    navigate(path);
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
  const { t, locale } = useI18n();
  const { people, person, canWrite } = useStore();
  const { types, load: loadTypes } = useRecordTypes();
  const type = types?.find((x) => x.key === typeKey) ?? null;
  const [q, setQ] = useState('');
  const [owner, setOwner] = useState('');
  const [data, setData] = useState<{ records: AppRecord[]; total: number } | null>(null);
  const [editing, setEditing] = useState<AppRecord | 'new' | null>(null);
  // Board or table, and which field makes the columns: remembered per kind of record, on this device.
  const choices = type ? groupChoices(type) : [];
  const stored = (k: string) => {
    try {
      return localStorage.getItem(`tw_records_${k}_${typeKey}`);
    } catch {
      return null;
    }
  };
  const [viewPick, setViewPick] = useState<'board' | 'table' | null>(() => stored('view') as 'board' | 'table' | null);
  const [groupPick, setGroupPick] = useState<string | null>(() => stored('group'));
  const keep = (k: string, v: string) => {
    try {
      localStorage.setItem(`tw_records_${k}_${typeKey}`, v);
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
  const cols = type ? shownFields(type, 4) : [];
  return (
    <>
      <header className="topbar">
        <h1 className="topbar__title">{type ? typeLabel(type, locale) : ''}</h1>
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
        </div>
        {!data ? (
          view === 'board' ? <SkeletonCards columns count={4} label={t('common.loading')} /> : <SkeletonRows rows={8} label={t('common.loading')} />
        ) : data.records.length === 0 ? (
          <div className="sheet">
            <EmptyState icon={q || owner ? 'search' : type?.kind === 'opportunity' ? 'funnel' : type?.kind === 'contact' ? 'idcard' : 'layout'} title={q || owner ? t('records.noMatch') : t('records.empty')}>
              {!q && !owner && canWrite && type && (
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
            records={data.records}
            groupKey={groupKey}
            onOpen={setEditing}
            onChanged={(r) => setData((d) => (d ? { ...d, records: d.records.map((x) => (x.id === r.id ? r : x)) } : d))}
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('records.name')}</th>
                  <th>{t('records.account')}</th>
                  {cols.map((f) => (
                    <th key={f.key} className="hide-phone">
                      {labelOf(f.label, locale)}
                    </th>
                  ))}
                  <th className="hide-phone">{t('accounts.owner')}</th>
                </tr>
              </thead>
              <tbody>
                {data.records.map((r) => (
                  <tr key={r.id} className="row-link" onClick={() => setEditing(r)}>
                    <td>
                      <button className="linkbtn linkbtn--plain" onClick={(e) => { e.stopPropagation(); setEditing(r); }}>
                        {r.name}
                      </button>
                    </td>
                    <td>
                      {r.accountId ? (
                        <a href={`/accounts/${r.accountId}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/accounts/${r.accountId}`); }}>
                          {r.accountName}
                        </a>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    {cols.map((f) => (
                      <td key={f.key} className="hide-phone">
                        <Cell field={f} value={r.fields[f.key]} />
                      </td>
                    ))}
                    <td className="hide-phone">{r.ownerId && <Avatar person={person(r.ownerId)} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editing && type && (
        <RecordDialog
          type={type}
          record={editing === 'new' ? null : editing}
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
      return localStorage.getItem('tw-contacts-view') === 'list' ? 'list' : 'chart';
    } catch {
      return 'chart';
    }
  });
  const pickView = (v: 'chart' | 'list') => {
    setView(v);
    try {
      localStorage.setItem('tw-contacts-view', v);
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
                    <button className="record-line" onClick={() => setEditing({ type: ty, record: r })}>
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
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (accountId) return;
    get<{ accounts: Account[] }>('/accounts?limit=500').then((r) => setAccounts(r.accounts.map((a) => ({ id: a.id, name: a.name }))));
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
        });
      } else {
        await post('/records', {
          typeId: type.id,
          ...(isContact ? {} : { name: name.trim() }),
          ownerId: ownerId || null,
          accountId: account || null,
          ...(isContact && parent ? { parentId: parent } : {}),
          fields: values,
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
              <span className="field__label">{labelOf(f.label, locale)}</span>
              <FieldInput field={f} value={values[f.key]} disabled={!canWrite || f.locked} onSave={(v) => setValues((x) => ({ ...x, [f.key]: v }))} />
            </label>
          ))}
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
            await del(`/records/${record.id}`);
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
