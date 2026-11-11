// Records under accounts — contacts, opportunities, risks and whatever else
// the company keeps: a list per kind, a section per kind on the account
// page, and one dialog to add or edit a record.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { labelOf } from '../../../shared/src/fields';
import type { Account } from '../../../shared/src/model';
import { typeLabel, type AppRecord, type LinkInfo, type RecordType } from '../../../shared/src/records';
import { FieldInput, useFieldFormat } from '../pages/Accounts';
import { ApiFailure, del, get, patch, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { navigate } from '../lib/router';
import { useStore } from '../lib/store';
import { useRecordTypes } from './AccountFields';
import { PROVIDER_NAMES } from './Connections';
import { Avatar, Confirm, Dialog } from './ui';

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
  const fmt = useFieldFormat();
  const { types, load: loadTypes } = useRecordTypes();
  const type = types?.find((x) => x.key === typeKey) ?? null;
  const [q, setQ] = useState('');
  const [owner, setOwner] = useState('');
  const [data, setData] = useState<{ records: AppRecord[]; total: number } | null>(null);
  const [editing, setEditing] = useState<AppRecord | 'new' | null>(null);
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
  if (types && !type) return <div className="empty">{t('errors.not_found')}</div>;
  const cols = (type?.fields ?? []).slice(0, 4);
  return (
    <>
      <header className="topbar">
        <h1 className="topbar__title">{type ? typeLabel(type, locale) : ''}</h1>
        {data && <span className="topbar__sub num">{t('records.total', { n: data.total })}</span>}
        <div className="topbar__spacer" />
        {canWrite && type && (
          <button className="btn btn--primary" onClick={() => setEditing('new')}>
            {t('records.new', { type: typeLabel(type, locale, false) })}
          </button>
        )}
      </header>
      <div className="page">
        <RecordTabs current={typeKey} types={types} />
        <div className="toolbar" style={{ marginBottom: 12 }}>
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
          <div className="empty">{t('common.loading')}</div>
        ) : data.records.length === 0 ? (
          <div className="empty">{q || owner ? t('records.noMatch') : t('records.empty')}</div>
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
                        {fmt(f, r.fields[f.key])}
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

/** The account page's section for one kind of record. */
export function AccountRecords({ account, types, onChange }: { account: Account; types: RecordType[]; onChange: () => void }) {
  const { t, locale } = useI18n();
  const { canWrite } = useStore();
  const fmt = useFieldFormat();
  const [lists, setLists] = useState<Record<string, AppRecord[]>>({});
  const [editing, setEditing] = useState<{ type: RecordType; record: AppRecord | null } | null>(null);
  const load = useCallback(async () => {
    const all = await Promise.all(types.map((ty) => get<{ records: AppRecord[] }>(`/records?type=${ty.id}&account=${account.id}&limit=100`).then((r) => [ty.id, r.records] as const)));
    setLists(Object.fromEntries(all));
  }, [types, account.id]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <>
      {types.map((ty) => {
        const list = lists[ty.id] ?? [];
        const cols = ty.fields.slice(0, 3);
        return (
          <section className="sheet" key={ty.id}>
            <div className="section__row">
              <h3 className="section__head">
                <span>
                  {typeLabel(ty, locale)}
                  <span className="muted num">{list.length}</span>
                </span>
              </h3>
              {canWrite && (
                <button className="btn btn--small" onClick={() => setEditing({ type: ty, record: null })}>
                  {t('common.add')}
                </button>
              )}
            </div>
            {list.length === 0 ? (
              <p className="muted">{t('records.noneHere', { type: typeLabel(ty, locale).toLocaleLowerCase(locale === 'tr' ? 'tr-TR' : 'en-US') })}</p>
            ) : (
              <ul className="plainlist record-lines">
                {list.map((r) => (
                  <li key={r.id}>
                    <button className="record-line" onClick={() => setEditing({ type: ty, record: r })}>
                      <span className="record-line__name">{r.name}</span>
                      {cols.map((f) => {
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

export function RecordDialog({ type, record, accountId, onClose, onDone }: { type: RecordType; record: AppRecord | null; accountId?: string; onClose: () => void; onDone: () => unknown }) {
  const { t, locale, words } = useI18n();
  const { me, people, canWrite, can, toast } = useStore();
  const [name, setName] = useState(record?.name ?? '');
  const [ownerId, setOwnerId] = useState(record?.ownerId ?? (record ? '' : me.user.id));
  const [account, setAccount] = useState<string>(record?.accountId ?? accountId ?? '');
  const [values, setValues] = useState<Record<string, string | number | null>>(record?.fields ?? {});
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
          ...(name.trim() !== record.name ? { name: name.trim() } : {}),
          ...(ownerId !== (record.ownerId ?? '') ? { ownerId: ownerId || null } : {}),
          ...(account !== (record.accountId ?? '') ? { accountId: account || null } : {}),
          ...(Object.keys(changed).length ? { fields: changed } : {}),
        });
      } else {
        await post('/records', { typeId: type.id, name: name.trim(), ownerId: ownerId || null, accountId: account || null, fields: values });
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
      title={record ? record.name : t('records.new', { type: one })}
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
            <button className="btn btn--primary" disabled={!name.trim() || busy} onClick={save}>
              {record ? t('common.save') : t('common.create')}
            </button>
          )}
        </>
      }
    >
      {record && <OpenIn links={record.links} />}
      <div className="form">
        <label className="field">
          <span className="field__label">{t('records.name')}</span>
          <input className="input" autoFocus={!record} value={name} maxLength={300} disabled={!canWrite} onChange={(e) => setName(e.target.value)} />
        </label>
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
          {type.fields.map((f) => (
            <label className="field" key={f.key}>
              <span className="field__label">{labelOf(f.label, locale)}</span>
              <FieldInput field={f} value={values[f.key]} disabled={!canWrite} onSave={(v) => setValues((x) => ({ ...x, [f.key]: v }))} />
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
