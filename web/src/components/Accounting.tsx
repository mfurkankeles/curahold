// Accounting programs in Settings → Data sources, read only: the tiles to
// connect one (a sign-in, a key, or a file for every other program), the plain
// steps before connecting, the first read, the review list of accounting
// customers matched to Curahold's customers, and the file upload.
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ACCOUNTING_ALL, FILE_COLUMNS, type FinKind } from '../../../shared/src/accounting';
import { PAYMENT_SIGNAL, type HealthConfig } from '../../../shared/src/health';
import type { MessageKey } from '../../../shared/src/i18n';
import type { ProviderInfo } from '../../../shared/src/model';
import { KEY_FIELDS } from '../../../shared/src/sync';
import { ApiFailure, get, post, put } from '../lib/api';
import { formatMoney } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { navigate } from '../lib/router';
import { readSheet } from '../lib/sheet';
import { useStore } from '../lib/store';
import { PROVIDER_NAMES } from './Connections';
import { Icon } from './icons';
import { Dialog } from './ui';
import './finance.css';

const name = (id: string) => PROVIDER_NAMES[id] ?? id;

function useErr() {
  const { t } = useI18n();
  const { toast } = useStore();
  return useCallback((e: unknown) => toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error'), [t, toast]);
}

/** Settings → Data sources: the accounting programs, in the order they were built, the file last. */
export function AccountingTiles({ providers }: { providers: ProviderInfo[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState<ProviderInfo | null>(null);
  const list = ACCOUNTING_ALL.map((id) => providers.find((p) => p.id === id)).filter((p): p is ProviderInfo => !!p);
  if (!list.length) return null;
  return (
    <>
      <h3 className="section__head u-mt-20">{t('fin.add' as MessageKey)}</h3>
      <p className="field__hint">{t('fin.addHint' as MessageKey)}</p>
      <div className="tiles">
        {list.map((p) => (
          <div className="tile" key={p.id} data-state={p.available ? 'ready' : 'off'} data-tour={`fin-${p.id}`}>
            <div className="tile__head">
              <span className="tile__badge" aria-hidden="true">
                {p.id === 'finfile' ? <Icon name="upload" size={16} /> : name(p.id)[0]}
              </span>
              <strong>{p.id === 'finfile' ? t('fin.file.title' as MessageKey) : name(p.id)}</strong>
            </div>
            <p className="field__hint tile__line">{t(`fin.what.${p.id}` as MessageKey)}</p>
            {p.available ? (
              <button className="btn btn--small" onClick={() => setOpen(p)}>
                <Icon name={p.id === 'finfile' ? 'upload' : 'plug'} size={16} />
                {p.id === 'finfile' ? t('fin.file.start' as MessageKey) : t('conn.connect', { app: name(p.id) })}
              </button>
            ) : (
              <p className="field__hint tile__line">{t('conn.notOnServer')}</p>
            )}
          </div>
        ))}
      </div>
      {open && <AccountingConnect provider={open} onClose={() => setOpen(null)} />}
    </>
  );
}

/** The plain steps for one program, then its sign-in, its key, or a new file connection. */
export function AccountingConnect({ provider, onClose }: { provider: ProviderInfo; onClose: () => void }) {
  const { t } = useI18n();
  const onErr = useErr();
  const spec = KEY_FIELDS[provider.id as keyof typeof KEY_FIELDS] ?? [];
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const app = provider.id === 'finfile' ? t('fin.file.title' as MessageKey) : name(provider.id);
  const signIn = provider.setup === 'oauth';
  const ok = signIn || spec.every((f) => f.optional || (values[f.key] ?? '').trim());
  const steps = t(`fin.steps.${provider.id}` as MessageKey).split('\n').filter(Boolean);
  const go = async (e?: FormEvent) => {
    e?.preventDefault();
    if (signIn) {
      location.href = `/api/connect/${provider.id}/start`;
      return;
    }
    setBusy(true);
    try {
      const r = await post<{ id: string }>('/connections/key', { provider: provider.id, values: provider.id === 'finfile' ? { label: t('fin.file.title' as MessageKey) } : values });
      onClose();
      navigate(`/settings/sources/${r.id}`);
    } catch (err) {
      onErr(err);
      setBusy(false);
    }
  };
  return (
    <Dialog
      title={provider.id === 'finfile' ? t('fin.file.title' as MessageKey) : t('conn.connect', { app })}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--quiet" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn--primary" form="finconnect" disabled={!ok || busy}>
            {busy ? t('support.checking') : signIn ? t('sync.continueSignIn') : provider.id === 'finfile' ? t('fin.file.start' as MessageKey) : t('support.connect')}
          </button>
        </>
      }
    >
      <form id="finconnect" className="form" onSubmit={go}>
        <ol className="fin-steps">
          {steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
        {spec.map((f) => (
          <label className="field" key={f.key}>
            <span className="field__label">
              {t(`support.field.${provider.id}.${f.key}` as MessageKey)}
              {f.optional ? ` (${t('common.optional')})` : ''}
            </span>
            <input className="input" type={f.secret ? 'password' : 'text'} autoComplete="off" spellCheck={false} placeholder={f.placeholder} value={values[f.key] ?? ''} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
          </label>
        ))}
        <p className="notice fin-readonly">
          <Icon name="lock" size={16} className="icon--lead" />
          {t('fin.readOnlyNote' as MessageKey, { app })}
        </p>
      </form>
    </Dialog>
  );
}

/** Before the first read: what will happen, and whether late payments count in the health score. */
export function AccountingStart({ provider, onStart, running }: { provider: string; onStart: () => Promise<void>; running: string | null }) {
  const { t } = useI18n();
  const { can } = useStore();
  const onErr = useErr();
  const mayScore = can('accounts.manage');
  const [score, setScore] = useState(true);
  const start = async () => {
    if (mayScore && score) {
      try {
        const { config } = await get<{ config: HealthConfig }>('/health/config');
        if (!config.signals.some((s) => s.key === 'payment')) await put('/health/config', { config: { ...config, signals: [...config.signals, PAYMENT_SIGNAL] } });
      } catch (e) {
        onErr(e);
      }
    }
    await onStart();
  };
  return (
    <section className="sheet fin-start">
      <h3 className="section__head">{t('fin.startTitle' as MessageKey)}</h3>
      <p className="field__hint">{t('fin.startHint' as MessageKey, { app: name(provider) })}</p>
      {mayScore && (
        <label className="checkbox">
          <input type="checkbox" checked={score} onChange={(e) => setScore(e.target.checked)} />
          <span>{t('fin.startScore' as MessageKey)}</span>
        </label>
      )}
      <div className="row u-gap-8">
        <button className="btn btn--primary" disabled={!!running} onClick={start}>
          <Icon name="refresh" size={16} />
          {running ?? t('fin.start' as MessageKey)}
        </button>
      </div>
    </section>
  );
}

// ------------------------------------------------------------ the review list

interface MatchRow {
  remoteId: string;
  name: string;
  taxId: string | null;
  email: string | null;
  website: string | null;
  currency: string | null;
  balance: number | null;
  open: number | null;
  account: { id: string; name: string } | null;
  state: 'none' | 'auto' | 'manual' | 'ignored';
  reason: 'tax' | 'domain' | 'name' | null;
  candidates: { id: string; name: string }[];
}
type Show = 'review' | 'matched' | 'all';

/** Accounting customers and the Curahold customer each one is: confirm, change, or leave out. */
export function AccountingMatches({ id }: { id: string }) {
  const { t, locale } = useI18n();
  const { me } = useStore();
  const onErr = useErr();
  const [show, setShow] = useState<Show>('review');
  const [data, setData] = useState<{ counts: { total: number; matched: number; review: number; ignored: number }; customers: MatchRow[] } | null>(null);
  const load = useCallback(async () => setData(await get(`/connections/${id}/finance/matches?show=${show}`)), [id, show]);
  useEffect(() => {
    void load().catch(onErr);
  }, [load, onErr]);
  const choose = async (r: MatchRow, accountId: string | null, ignore = false) => {
    try {
      await put(`/connections/${id}/finance/matches/${encodeURIComponent(r.remoteId)}`, { accountId, ignore });
      await load();
    } catch (e) {
      onErr(e);
    }
  };
  const create = async (r: MatchRow) => {
    try {
      const made = await post<{ account: { id: string } }>('/accounts', { name: r.name });
      await choose(r, made.account.id);
    } catch (e) {
      onErr(e);
    }
  };
  if (!data) return <p className="muted">{t('common.loading')}</p>;
  const reason = (r: MatchRow) => (r.state === 'manual' ? t('fin.match.manual' as MessageKey) : r.reason ? t(`fin.match.by.${r.reason}` as MessageKey) : '');
  return (
    <section className="sheet fin-matches">
      <h3 className="section__head">{t('fin.match.title' as MessageKey)}</h3>
      <p className="field__hint">{t('fin.match.hint' as MessageKey)}</p>
      <div className="seg" role="group" aria-label={t('fin.match.title' as MessageKey)}>
        {(['review', 'matched', 'all'] as const).map((k) => (
          <button key={k} type="button" aria-pressed={show === k} onClick={() => setShow(k)}>
            {t(`fin.match.show.${k}` as MessageKey, { n: k === 'review' ? data.counts.review : k === 'matched' ? data.counts.matched : data.counts.total })}
          </button>
        ))}
      </div>
      {data.customers.length === 0 ? (
        <p className="field__hint fin-matches__none">{show === 'review' ? t('fin.match.allDone' as MessageKey) : t('fin.match.none' as MessageKey)}</p>
      ) : (
        <ul className="fin-matches__list">
          {data.customers.map((r) => (
            <li key={r.remoteId} className="fin-match" data-state={r.state}>
              <div className="fin-match__them">
                <strong className="fin-match__name">{r.name}</strong>
                <span className="muted fin-match__meta">{[r.taxId, r.email ?? r.website].filter(Boolean).join(' · ') || '—'}</span>
              </div>
              <span className="num fin-match__open">{r.open ? formatMoney(r.open, r.currency ?? me.org.currency ?? 'USD', locale) : ''}</span>
              <div className="fin-match__us">
                {r.account ? (
                  <>
                    <a
                      href={`/accounts/${r.account.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        navigate(`/accounts/${r.account!.id}`);
                      }}
                    >
                      {r.account.name}
                    </a>
                    <span className="badge">{reason(r)}</span>
                  </>
                ) : r.state === 'ignored' ? (
                  <span className="muted">{t('fin.match.ignored' as MessageKey)}</span>
                ) : r.candidates.length ? (
                  <>
                    <span className="muted">{t('fin.match.several' as MessageKey)}:</span>
                    {r.candidates.map((c) => (
                      <button key={c.id} type="button" className="btn btn--small fin-match__fit" title={t('fin.match.pick' as MessageKey, { name: r.name })} onClick={() => choose(r, c.id)}>
                        {c.name}
                      </button>
                    ))}
                  </>
                ) : (
                  <>
                    <span className="muted">{t('fin.match.noMatch' as MessageKey)}</span>
                    {/* Nobody here yet (a company that starts from its books): bring this one in as a new customer. */}
                    <button type="button" className="btn btn--small" onClick={() => void create(r)}>
                      {t('fin.match.create' as MessageKey)}
                    </button>
                  </>
                )}
              </div>
              <div className="fin-match__act">
                <AccountPicker label={t('fin.match.pick' as MessageKey, { name: r.name })} onPick={(accountId) => choose(r, accountId)} />
                {r.state !== 'ignored' ? (
                  <button type="button" className="btn btn--small btn--quiet" onClick={() => choose(r, null, true)}>
                    {t('fin.match.ignore' as MessageKey)}
                  </button>
                ) : (
                  <button type="button" className="btn btn--small btn--quiet" onClick={() => choose(r, null, false)}>
                    {t('fin.match.unignore' as MessageKey)}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Pick a customer by searching for it (the ones that fit are offered as buttons beside it). */
function AccountPicker({ label, onPick }: { label: string; onPick: (id: string) => void }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [found, setFound] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) return setFound([]);
    let live = true;
    const h = setTimeout(() => {
      void get<{ accounts: { id: string; name: string }[] }>(`/accounts?q=${encodeURIComponent(q.trim())}&limit=8`)
        .then((r) => live && setFound(r.accounts))
        .catch(() => live && setFound([]));
    }, 200);
    return () => {
      live = false;
      clearTimeout(h);
    };
  }, [q]);
  const list = q.trim().length >= 2 ? found : [];
  return (
    <div className="fin-pick">
      <input className="input fin-pick__q" value={q} placeholder={t('fin.match.search' as MessageKey)} aria-label={label} onChange={(e) => setQ(e.target.value)} />
      {list.length > 0 && (
        <ul className="fin-pick__list" role="listbox" aria-label={label}>
          {list.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                className="linkbtn"
                onClick={() => {
                  setQ('');
                  onPick(a.id);
                }}
              >
                {a.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ------------------------------------------------------------ a file

const KINDS: FinKind[] = ['customers', 'invoices', 'payments'];
const CHUNK = 1000;

/** The template's columns as a CSV with only the header row, to fill in from the program's export. */
function template(kind: FinKind) {
  const blob = new Blob([`${FILE_COLUMNS[kind].join(',')}\n`], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `curahold-${kind}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A file in the template's columns, one kind at a time: customers first, then invoices, then payments. */
export function AccountingFile({ id, onDone }: { id: string; onDone: () => void }) {
  const { t } = useI18n();
  const { toast } = useStore();
  const onErr = useErr();
  const [busy, setBusy] = useState<FinKind | null>(null);
  const [done, setDone] = useState<Partial<Record<FinKind, string>>>({});
  const upload = async (kind: FinKind, file: File) => {
    setBusy(kind);
    try {
      const sheet = await readSheet(file);
      const wanted = new Set(FILE_COLUMNS[kind]);
      const key = (h: string) => h.trim().toLowerCase().replace(/\s+/g, '_');
      const rows = sheet.rows.map((r) => Object.fromEntries(Object.entries(r).map(([h, v]) => [key(h), v]).filter(([h]) => wanted.has(h))));
      if (!sheet.headers.some((h) => wanted.has(key(h)))) {
        toast(t('fin.file.wrongColumns' as MessageKey, { columns: FILE_COLUMNS[kind].join(', ') }), 'error');
        return;
      }
      let added = 0;
      let changed = 0;
      let skipped = 0;
      for (let i = 0; i < Math.max(1, rows.length); i += CHUNK) {
        const part = rows.slice(i, i + CHUNK);
        const r = await post<{ added: number; changed: number; skipped: number }>(`/connections/${id}/finance/import`, { kind, rows: part, replace: i === 0, last: i + CHUNK >= rows.length });
        added += r.added;
        changed += r.changed;
        skipped += r.skipped;
      }
      setDone((d) => ({ ...d, [kind]: t('fin.file.result' as MessageKey, { added, changed, skipped }) }));
      onDone();
    } catch (e) {
      onErr(e);
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="sheet fin-file">
      <h3 className="section__head">{t('fin.file.uploadTitle' as MessageKey)}</h3>
      <p className="field__hint">{t('fin.file.uploadHint' as MessageKey)}</p>
      <ol className="fin-file__kinds">
        {KINDS.map((k) => (
          <li key={k} className="fin-file__kind">
            <div className="fin-file__what">
              <strong>{t(`fin.kind.${k}` as MessageKey)}</strong>
              <span className="muted fin-file__cols">{FILE_COLUMNS[k].join(', ')}</span>
              {done[k] && <span className="fin-file__done">{done[k]}</span>}
            </div>
            <div className="row u-gap-8 u-flex-wrap-wrap">
              <button type="button" className="btn btn--small btn--quiet" onClick={() => template(k)}>
                <Icon name="download" size={16} />
                {t('fin.file.template' as MessageKey)}
              </button>
              <label className="btn btn--small">
                <Icon name="upload" size={16} />
                {busy === k ? t('fin.file.reading' as MessageKey) : t('fin.file.choose' as MessageKey)}
                <input
                  type="file"
                  className="sr-only"
                  accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  disabled={!!busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) void upload(k, f);
                  }}
                />
              </label>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
