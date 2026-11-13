// CRMs and spreadsheets: connect, choose what comes over, match fields and
// people, preview, start — then watch the sync and fix what it reports.
// Everything an administrator needs, without anyone writing a mapping file.
import { Icon } from './icons';
import { DemoConnect, DemoCrmConnect, IN_DEMO } from './DemoConnect';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { labelOf } from '../../../shared/src/fields';
import type { MessageKey, Locale } from '../../../shared/src/i18n';
import type { AccountField, Connection, ProviderInfo } from '../../../shared/src/model';
import { BUILTIN_TYPES, typeLabel } from '../../../shared/src/records';
import { DEV_HOSTS, KEY_FIELDS, devKey, type DevHookInfo, type DevHost, type FieldMap, type ObjectMap, type RemoteField, type RemoteObject, type SyncConfig, type SyncPreview, type SyncProblem, type SyncRun, type SyncStats } from '../../../shared/src/sync';
import { ApiFailure, api, del, get, patch, post, put } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { navigate } from '../lib/router';
import { useStore } from '../lib/store';
import { relativeTime } from '../lib/time';
import { PROVIDER_NAMES, useConnections } from './Connections';
import { Confirm, Dialog, RowMenu, onTabKeys } from './ui';

/** What the screens call the app on the other side; in the try-it demo, the CRM the pretend one stands in for. */
const appName = (c: { provider: string; standsFor?: string | null }) => PROVIDER_NAMES[c.standsFor ?? c.provider] ?? c.provider;

const DYNAMICS_HINT = 'https://yourcompany.crm4.dynamics.com';
const SOURCES = ['salesforce', 'hubspot', 'dynamics', 'pipedrive', 'zoho', 'bitrix24', 'freshsales', 'zendesksell', 'gsheets', 'excel', 'demo'];
/** Connected with a key the administrator brings; the newest connectors, marked as such. */
const KEYED_CRMS = ['bitrix24', 'freshsales', 'zendesksell'];
const SUPPORT = ['zendesk', 'freshdesk', 'intercom', 'front', 'jsm'];
/** Data warehouses: rows from a query, connected with a service-account key. */
const WAREHOUSES = ['bigquery'];
/** Developer tools: Jira syncs; GitHub and GitLab link branches, pull requests and commits to tasks. */
const DEV_TOOLS = ['jira'];
/** Fields typed as several lines. */
const LONG_FIELDS = ['serviceAccount', 'query'];
/** In the try-it demo these buttons run the real steps against the pretend CRM. */
const DEMO_CRMS = ['salesforce', 'hubspot', 'dynamics', 'pipedrive', 'zoho', ...KEYED_CRMS];

function useErr() {
  const { t } = useI18n();
  const { toast } = useStore();
  return useCallback((e: unknown) => toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error'), [t, toast]);
}

export function SyncBadge({ c }: { c: Connection }) {
  const { t } = useI18n();
  if (c.status === 'disabled') return <span className="badge">{t('conn.paused')}</span>;
  if (c.status === 'error' || c.sync?.lastRun?.status === 'error') return <span className="badge badge--disabled">{t('conn.problem')}</span>;
  if (!c.sync?.startedAt) return <span className="badge badge--invited">{t('sync.notStarted')}</span>;
  if (c.sync.failing || c.sync.lastRun?.status === 'partial') return <span className="badge badge--invited">{t('sync.needsLook')}</span>;
  return <span className="badge badge--active">{t('conn.working')}</span>;
}

/** Settings → CRMs and spreadsheets. */
export function Sources() {
  const { t } = useI18n();
  const { data, reload } = useConnections();
  const onErr = useErr();
  const [asking, setAsking] = useState<ProviderInfo | null>(null);
  const [keyed, setKeyed] = useState<ProviderInfo | null>(null);
  const [hooking, setHooking] = useState<DevHost | null>(null);
  const { toast } = useStore();

  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const err = p.get('error');
    if (err) {
      toast(t(err === 'dynamics_url' ? 'sync.error.dynamicsUrl' : err === 'not_configured' ? 'conn.error.not_configured' : err === 'wrong_account' ? 'conn.error.wrong_account' : 'conn.error.connection_failed', { app: PROVIDER_NAMES[p.get('provider') ?? ''] ?? '' }), 'error');
      history.replaceState(null, '', location.pathname);
    }
  }, [t, toast]);

  if (!data) return <div className="muted">{t('common.loading')}</div>;
  const providers = data.providers.filter((p) => p.kind === 'source' && SOURCES.includes(p.id));
  const support = data.providers.filter((p) => p.kind === 'source' && SUPPORT.includes(p.id));
  const warehouses = data.providers.filter((p) => p.kind === 'source' && WAREHOUSES.includes(p.id));
  const jiraTool = data.providers.find((p) => p.kind === 'source' && DEV_TOOLS.includes(p.id));
  const mine = data.connections.filter((c) => c.kind === 'source');
  const broken = mine.filter((c) => c.status === 'error');

  const connect = async (p: ProviderInfo) => {
    if (p.id === 'demo') {
      try {
        const r = await post<{ id: string }>('/connections/demo', {});
        navigate(`/settings/sources/${r.id}`);
      } catch (e) {
        onErr(e);
      }
      return;
    }
    if (p.setup === 'key') return setKeyed(p);
    if (p.id === 'dynamics' || p.id === 'salesforce') return setAsking(p);
    location.href = `/api/connect/${p.id}/start`;
  };

  return (
    <div className="conns sources">
      <p className="lede">{t('sync.intro')}</p>
      {broken.length > 0 && (
        <div className="notice notice--error" role="alert" style={{ marginBottom: 12 }}>
          <strong>{t('conn.alert', { n: broken.length })}</strong> {t('conn.alertHint')}
        </div>
      )}
      {mine.length > 0 && (
        <>
          <h3 className="section__head">{t('sync.connected')}</h3>
          <div className="source-list">
            {mine.map((c) => (
              <a
                key={c.id}
                className="source-row"
                href={`/settings/sources/${c.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(`/settings/sources/${c.id}`);
                }}
              >
                <span className="tile__badge" aria-hidden="true">
                  {appName(c)[0]}
                </span>
                <span className="source-row__main">
                  <strong>{c.label}</strong>
                  <span className="muted">
                    {appName(c)}
                    {c.sync?.lastRun ? ` · ${t('sync.lastSync', { when: relativeTime(c.sync.lastRun.at, t) })}` : ''}
                    {c.sync?.pending ? ` · ${t('sync.waiting', { n: c.sync.pending })}` : ''}
                  </span>
                  {c.status === 'error' && (
                    <span className="error-text">
                      {t('conn.reconnectNeeded')}
                      {c.lastError ? ` · ${c.lastError}` : ''}
                    </span>
                  )}
                </span>
                <SyncBadge c={c} />
              </a>
            ))}
          </div>
        </>
      )}
      <h3 className="section__head" style={{ marginTop: mine.length ? 22 : 0 }}>
        {t('sync.add')}
      </h3>
      <div className="tiles">
        {providers.map((p) => (
          <div className="tile" key={p.id} data-state={p.available ? 'ready' : 'off'} data-tour={`crm-${p.id}`}>
            <div className="tile__head">
              <span className="tile__badge" aria-hidden="true">
                {(PROVIDER_NAMES[p.id] ?? p.id)[0]}
              </span>
              <strong>{PROVIDER_NAMES[p.id] ?? p.id}</strong>
              {KEYED_CRMS.includes(p.id) && (
                <span className="badge" title={t('sync.betaHint')}>
                  {t('sync.beta')}
                </span>
              )}
            </div>
            <p className="field__hint tile__line">{t(`sync.what.${p.id}` as MessageKey)}</p>
            {IN_DEMO && DEMO_CRMS.includes(p.id) ? (
              // The demo runs in the browser and cannot reach a real CRM: every CRM's button opens the pretend one.
              <DemoCrmConnect id={p.id} app={PROVIDER_NAMES[p.id] ?? p.id} onError={onErr} />
            ) : p.available ? (
              <button className="btn btn--primary btn--small" onClick={() => connect(p)}>
                <Icon name="plug" size={16} />
                {t('conn.connect', { app: PROVIDER_NAMES[p.id] ?? p.id })}
              </button>
            ) : IN_DEMO ? (
              <DemoConnect app={PROVIDER_NAMES[p.id] ?? p.id} />
            ) : (
              <p className="field__hint tile__line">{t('conn.notOnServer')}</p>
            )}
          </div>
        ))}
      </div>
      <h3 className="section__head" style={{ marginTop: 22 }}>
        {t('support.add')}
      </h3>
      <p className="field__hint">{t('support.addHint')}</p>
      <div className="tiles">
        {support.map((p) => (
          <div className="tile" key={p.id} data-state="ready">
            <div className="tile__head">
              <span className="tile__badge" aria-hidden="true">
                {(PROVIDER_NAMES[p.id] ?? p.id)[0]}
              </span>
              <strong>{PROVIDER_NAMES[p.id] ?? p.id}</strong>
            </div>
            <p className="field__hint tile__line">{t(`support.what.${p.id}` as MessageKey)}</p>
            <button className="btn btn--primary btn--small" onClick={() => connect(p)}>
              <Icon name="plug" size={16} />
              {t('conn.connect', { app: PROVIDER_NAMES[p.id] ?? p.id })}
            </button>
          </div>
        ))}
        <div className="tile" data-state="ready">
          <div className="tile__head">
            <span className="tile__badge" aria-hidden="true">
              {'{ }'}
            </span>
            <strong>{t('support.custom')}</strong>
          </div>
          <p className="field__hint tile__line">{t('support.customHint')}</p>
          <a
            className="btn btn--small"
            href="/settings/developer"
            onClick={(e) => {
              e.preventDefault();
              navigate('/settings/developer');
            }}
          >
            {t('support.customOpen')}
          </a>
        </div>
      </div>
      {warehouses.length > 0 && (
        <>
          <h3 className="section__head" style={{ marginTop: 22 }}>
            {t('warehouse.add')}
          </h3>
          <p className="field__hint">{t('warehouse.addHint')}</p>
          <div className="tiles">
            {warehouses.map((p) => (
              <div className="tile" key={p.id} data-state="ready" data-tour={`crm-${p.id}`}>
                <div className="tile__head">
                  <span className="tile__badge" aria-hidden="true">
                    {(PROVIDER_NAMES[p.id] ?? p.id)[0]}
                  </span>
                  <strong>{PROVIDER_NAMES[p.id] ?? p.id}</strong>
                </div>
                <p className="field__hint tile__line">{t(`support.what.${p.id}` as MessageKey)}</p>
                <button className="btn btn--primary btn--small" onClick={() => connect(p)}>
                  <Icon name="plug" size={16} />
                  {t('conn.connect', { app: PROVIDER_NAMES[p.id] ?? p.id })}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
      <h3 className="section__head" style={{ marginTop: 22 }}>
        {t('devtools.add')}
      </h3>
      <p className="field__hint">{t('devtools.addHint')}</p>
      <div className="tiles">
        {jiraTool && (
          <div className="tile" data-state="ready" data-tour="crm-jira">
            <div className="tile__head">
              <span className="tile__badge" aria-hidden="true">
                J
              </span>
              <strong>{PROVIDER_NAMES.jira}</strong>
            </div>
            <p className="field__hint tile__line">{t('devtools.what.jira')}</p>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              {jiraTool.setup === 'oauth' && (
                <a className="btn btn--primary btn--small" href="/api/connect/jira/start">
                  <Icon name="plug" size={16} />
                  {t('devtools.jira.signIn')}
                </a>
              )}
              <button className={`btn btn--small${jiraTool.setup === 'oauth' ? '' : ' btn--primary'}`} onClick={() => setKeyed({ ...jiraTool, setup: 'key' })}>
                {jiraTool.setup === 'oauth' ? t('devtools.jira.useToken') : t('conn.connect', { app: PROVIDER_NAMES.jira })}
              </button>
            </div>
          </div>
        )}
        {DEV_HOSTS.map((h) => (
          <div className="tile" key={h} data-state="ready" data-tour={`dev-${h}`}>
            <div className="tile__head">
              <span className="tile__badge" aria-hidden="true">
                {PROVIDER_NAMES[h][0]}
              </span>
              <strong>{PROVIDER_NAMES[h]}</strong>
            </div>
            <p className="field__hint tile__line">{t('devtools.what.host', { key: devKey('1a2b3c4d') })}</p>
            <button className="btn btn--primary btn--small" onClick={() => setHooking(h)}>
              <Icon name="plug" size={16} />
              {t('devtools.hook.set', { app: PROVIDER_NAMES[h] })}
            </button>
          </div>
        ))}
      </div>
      {keyed && <KeyConnect provider={keyed} onClose={() => setKeyed(null)} />}
      {hooking && <DevHookDialog host={hooking} onClose={() => setHooking(null)} />}
      {asking && <BeforeSignIn provider={asking} onClose={() => setAsking(null)} />}
      <button className="sr-only" onClick={() => reload()}>
        {t('common.refresh')}
      </button>
    </div>
  );
}

/**
 * Support tools, warehouses and key-based CRMs: the tool's address and a key, checked right away. When
 * `reconnect` is given, a new key for a connection that stopped working: it keeps its mapping and history.
 */
export function KeyConnect({ provider, onClose, reconnect }: { provider: ProviderInfo; onClose: () => void; reconnect?: { id: string; prefill: Record<string, string> } }) {
  const { t } = useI18n();
  const { toast } = useStore();
  const onErr = useErr();
  const spec = KEY_FIELDS[provider.id as keyof typeof KEY_FIELDS] ?? [];
  const [values, setValues] = useState<Record<string, string>>({ ...(provider.id === 'intercom' ? { region: 'us' } : {}), ...(reconnect?.prefill ?? {}) });
  const [busy, setBusy] = useState(false);
  const name = PROVIDER_NAMES[provider.id] ?? provider.id;
  const ok = spec.every((f) => f.optional || (values[f.key] ?? '').trim());
  const go = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await post<{ id: string }>('/connections/key', { provider: provider.id, values, ...(reconnect ? { reconnect: reconnect.id } : {}) });
      if (reconnect) toast(t('conn.reconnected', { app: name }));
      navigate(`/settings/sources/${r.id}`);
      if (reconnect) onClose();
    } catch (err) {
      onErr(err);
      setBusy(false);
    }
  };
  return (
    <Dialog
      title={t(reconnect ? 'conn.reconnectTitle' : 'conn.connect', { app: name })}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--quiet" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn--primary" form="keyconnect" disabled={!ok || busy}>
            {busy ? t('support.checking') : t(reconnect ? 'conn.reconnect' : 'support.connect')}
          </button>
        </>
      }
    >
      <form id="keyconnect" className="form" onSubmit={go}>
        <p className="field__hint">{t(`support.how.${provider.id}` as MessageKey)}</p>
        {spec.map((f) =>
          f.key === 'region' ? (
            <label className="field" key={f.key}>
              <span className="field__label">{t('support.field.region')}</span>
              <select className="select" value={values.region ?? 'us'} onChange={(e) => setValues({ ...values, region: e.target.value })}>
                <option value="us">{t('support.region.us')}</option>
                <option value="eu">{t('support.region.eu')}</option>
                <option value="au">{t('support.region.au')}</option>
              </select>
            </label>
          ) : (
            <label className="field" key={f.key}>
              <span className="field__label">
                {t(`support.field.${provider.id}.${f.key}` as MessageKey)}
                {f.optional ? ` (${t('common.optional')})` : ''}
              </span>
              {LONG_FIELDS.includes(f.key) ? (
                <textarea className="textarea" rows={f.key === 'query' ? 4 : 5} autoComplete="off" spellCheck={false} placeholder={f.placeholder} value={values[f.key] ?? ''} maxLength={10_000} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
              ) : (
                <input className="input" type={f.secret ? 'password' : 'text'} autoComplete="off" spellCheck={false} placeholder={f.placeholder} value={values[f.key] ?? ''} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
              )}
            </label>
          ),
        )}
        <p className="field__hint">{t(provider.twoWay ? 'sync.keyed.note' : 'support.readOnly', { app: name })}</p>
      </form>
    </Dialog>
  );
}

/** Dynamics needs its address, Salesforce whether it is a sandbox — before the sign-in page. */
function BeforeSignIn({ provider, onClose }: { provider: ProviderInfo; onClose: () => void }) {
  const { t } = useI18n();
  const [orgUrl, setOrgUrl] = useState('');
  const [sandbox, setSandbox] = useState(false);
  const go = () => {
    const q = provider.id === 'dynamics' ? `?orgUrl=${encodeURIComponent(orgUrl.trim())}` : sandbox ? '?sandbox=1' : '';
    location.href = `/api/connect/${provider.id}/start${q}`;
  };
  const ok = provider.id !== 'dynamics' || /\.dynamics\.com|\.microsoftdynamics\./i.test(orgUrl);
  return (
    <Dialog
      title={t('conn.connect', { app: PROVIDER_NAMES[provider.id] })}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--quiet" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn--primary" disabled={!ok} onClick={go}>
            {t('sync.continueSignIn')}
          </button>
        </>
      }
    >
      {provider.id === 'dynamics' ? (
        <label className="field">
          <span className="field__label">{t('sync.dynamicsUrl')}</span>
          <input className="input" autoFocus value={orgUrl} placeholder={DYNAMICS_HINT} onChange={(e) => setOrgUrl(e.target.value)} />
          <span className="field__hint">{t('sync.dynamicsUrlHint')}</span>
        </label>
      ) : (
        <div className="choice-list">
          <label className="choice" data-on={!sandbox || undefined}>
            <input type="radio" checked={!sandbox} onChange={() => setSandbox(false)} />
            <span>
              <strong>{t('sync.sfProduction')}</strong>
              <span className="muted">{t('sync.sfProductionHint')}</span>
            </span>
          </label>
          <label className="choice" data-on={sandbox || undefined}>
            <input type="radio" checked={sandbox} onChange={() => setSandbox(true)} />
            <span>
              <strong>{t('sync.sfSandbox')}</strong>
              <span className="muted">{t('sync.sfSandboxHint')}</span>
            </span>
          </label>
          {provider.installUrl && (
            <p className="field__hint sf-install">
              {t('sync.sfInstall')}{' '}
              <a href={sandbox ? provider.installUrl.replace('//login.', '//test.') : provider.installUrl} target="_blank" rel="noreferrer">
                {t('sync.sfInstallOpen')}
              </a>
            </p>
          )}
        </div>
      )}
    </Dialog>
  );
}

// ----------------------------------------------------------- one source

interface Detail {
  connection: { id: string; provider: string; standsFor?: string | null; label: string; status: string; lastError?: string | null; reconnect?: 'oauth' | 'key' | null; prefill?: Record<string, string>; tabular: boolean; readOnly?: boolean; canReply?: boolean };
  sync: SyncConfig;
  state: { lastRun: { id: string; status: SyncRun['status']; at: string; stats: Record<string, SyncStats> } | null; fullAt: string | null };
  recordTypes: { id: string; key: string; name: any; kind: string; fields: AccountField[] }[];
  boards: { id: string; name: string }[];
  pending: { n: number; failing: number };
}

/** What the administrator is choosing for one CRM object, before it is saved. */
interface Draft extends ObjectMap {
  kind?: 'contact' | 'opportunity' | 'ticket' | 'custom';
  custom: boolean;
  hint: RemoteObject['hint'];
  /** Loaded on demand for the fields step. */
  meta?: RemoteField[];
}

type Step = 'file' | 'objects' | 'fields' | 'start';

export function SourceDetail({ id }: { id: string }) {
  const { t, words } = useI18n();
  const onErr = useErr();
  const { toast } = useStore();
  const [d, setD] = useState<Detail | null>(null);
  const [missing, setMissing] = useState(false);
  const [tab, setTab] = useState<'status' | 'mapping' | 'people' | 'settings'>('status');
  const [step, setStep] = useState<Step | null>(null);
  const [removing, setRemoving] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const load = useCallback(async () => {
    try {
      const r = await get<Detail>(`/connections/${id}/sync`);
      setD(r);
      return r;
    } catch {
      setMissing(true);
      return null;
    }
  }, [id]);
  useEffect(() => {
    void load().then((r) => {
      if (r && !r.sync.startedAt) setStep(r.connection.tabular && !r.sync.file ? 'file' : 'objects');
    });
  }, [load]);
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    if (p.get('connected')) {
      toast(t('conn.connected', { app: PROVIDER_NAMES[p.get('connected')!] ?? '' }));
      history.replaceState(null, '', location.pathname + (p.get('from') ? '?from=setup' : ''));
    }
  }, [t, toast]);

  /** Runs until done: each call does a slice of work and the next one carries on. */
  const syncNow = async (opts: { full?: boolean; start?: boolean } = {}) => {
    setRunning(t('sync.running'));
    let totals = 0;
    try {
      for (let i = 0; i < 60; i++) {
        const r = await post<{ run: SyncRun }>(`/connections/${id}/sync/run`, i === 0 ? opts : {});
        totals += Object.values(r.run.stats).reduce((n, s) => n + s.created + s.updated, 0);
        setRunning(t('sync.runningN', { n: totals }));
        if (!r.run.more) break;
      }
      toast(t('sync.done'));
    } catch (e) {
      onErr(e);
    } finally {
      setRunning(null);
      await load();
      setRefresh((x) => x + 1);
    }
  };

  if (missing) return <div className="empty">{t('errors.not_found')}</div>;
  if (!d) return <div className="center-note muted">{t('common.loading')}</div>;
  const name = appName(d.connection);
  const started = !!d.sync.startedAt;
  let fromSetup = new URLSearchParams(location.search).get('from') === 'setup';
  try {
    fromSetup ||= sessionStorage.getItem('app-from-setup') === '1';
  } catch {
    // ignore
  }

  return (
    <div className="source">
      <div className="source__head">
        <a
          href="/settings/sources"
          className="btn btn--quiet btn--small"
          onClick={(e) => {
            e.preventDefault();
            navigate('/settings/sources');
          }}
        >
          ← {t('settings.tab.sources')}
        </a>
        <div className="source__title">
          <span className="tile__badge" aria-hidden="true">
            {name[0]}
          </span>
          <span>
            <strong>{d.connection.label}</strong>
            {!d.connection.label.startsWith(name) && <span className="muted"> · {name}</span>}
          </span>
        </div>
        {started && (
          <>
            <button className="btn btn--primary btn--small" disabled={!!running || d.connection.status === 'disabled'} onClick={() => syncNow()}>
              <Icon name="refresh" size={16} />
              {running ?? t('sync.now')}
            </button>
            <RowMenu
              label={t('sync.more')}
              items={[
                { label: t('sync.full'), onClick: () => syncNow({ full: true }) },
                { label: d.connection.status === 'disabled' ? t('conn.resume') : t('conn.pause'), onClick: async () => { await patch(`/connections/${id}`, { paused: d.connection.status !== 'disabled' }).catch(onErr); await load(); } },
                { label: t('common.remove'), danger: true, onClick: () => setRemoving(true) },
              ]}
            />
          </>
        )}
      </div>

      {d.connection.status === 'error' && (
        <div className="notice notice--error" role="alert" style={{ margin: '12px 0', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 200 }}>
            <strong>{t('conn.reconnectNeeded')}</strong> {t('conn.reconnectBody', { app: name })}
            {d.connection.lastError && <span className="muted"> · {d.connection.lastError}</span>}
          </span>
          {d.connection.reconnect && (
            <button
              className="btn btn--primary btn--small"
              onClick={() => (d.connection.reconnect === 'oauth' ? (location.href = `/api/connect/${d.connection.provider}/start?reconnect=${id}`) : setReconnecting(true))}
            >
              <Icon name="plug" size={16} />
              {t('conn.reconnect')}
            </button>
          )}
        </div>
      )}
      {reconnecting && (
        <KeyConnect
          provider={{ id: d.connection.provider, kind: 'source', twoWay: !d.connection.readOnly, available: true, setup: 'key' }}
          reconnect={{ id, prefill: d.connection.prefill ?? {} }}
          onClose={() => {
            setReconnecting(false);
            void load();
          }}
        />
      )}
      {!started && step && d.connection.provider === 'jira' ? (
        <JiraSetup id={id} onStart={async () => { await syncNow({ start: true }); setTab('status'); }} running={running} />
      ) : !started && step ? (
        <SetupFlow d={d} step={step} setStep={setStep} reload={load} onStart={async () => { await syncNow({ start: true }); setTab('status'); }} running={running} />
      ) : (
        <>
          <div className="seg source__tabs" role="tablist" onKeyDown={onTabKeys}>
            {(['status', 'mapping', 'people', 'settings'] as const).map((k) => (
              <button key={k} role="tab" aria-selected={tab === k} tabIndex={tab === k ? 0 : -1} onClick={() => setTab(k)}>
                {t(`sync.tab.${k}` as MessageKey)}
              </button>
            ))}
          </div>
          {fromSetup && (
            <div className="notice" style={{ marginBottom: 12 }}>
              {t('sync.backToSetup')}{' '}
              <a
                href="/setup/accounts"
                onClick={(e) => {
                  e.preventDefault();
                  try {
                    sessionStorage.removeItem('app-from-setup');
                  } catch {
                    // ignore
                  }
                  navigate('/setup/accounts');
                }}
              >
                {t('setup.title')}
              </a>
            </div>
          )}
          {tab === 'status' && <StatusTab id={id} d={d} refresh={refresh} reload={load} />}
          {tab === 'mapping' && <MappingEditor d={d} reload={load} />}
          {tab === 'people' && <OwnersEditor id={id} crm={name} />}
          {tab === 'settings' && <SettingsTab id={id} d={d} reload={load} />}
        </>
      )}
      {removing && (
        <Confirm
          title={t('conn.removeTitle', { name: d.connection.label })}
          body={t('sync.removeBody', { accounts: words.other.toLocaleLowerCase() })}
          confirmLabel={t('common.remove')}
          danger
          onClose={() => setRemoving(false)}
          onConfirm={async () => {
            await del(`/connections/${id}`).catch(onErr);
            navigate('/settings/sources');
          }}
        />
      )}
    </div>
  );
}


/** GitHub and GitLab: the address and secret to paste into the host's webhook settings, and the key that names a task. */
function DevHookDialog({ host, onClose }: { host: DevHost; onClose: () => void }) {
  const { t } = useI18n();
  const onErr = useErr();
  const { toast } = useStore();
  const [hook, setHook] = useState<DevHookInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const app = PROVIDER_NAMES[host];
  useEffect(() => {
    get<{ hooks: DevHookInfo[] }>('/dev-hooks')
      .then((r) => setHook(r.hooks.find((h) => h.provider === host) ?? null))
      .catch(onErr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host]);
  const turnOn = async () => {
    setBusy(true);
    try {
      setHook((await post<{ hook: DevHookInfo }>(`/dev-hooks/${host}`, {})).hook);
    } catch (e) {
      onErr(e);
    } finally {
      setBusy(false);
    }
  };
  const turnOff = async () => {
    setBusy(true);
    try {
      await del(`/dev-hooks/${host}`);
      setHook((h) => (h ? { ...h, enabled: false, url: null, secret: null } : h));
      toast(t('devtools.hook.off', { app }));
    } catch (e) {
      onErr(e);
    } finally {
      setBusy(false);
    }
  };
  const copy = (text: string) => void navigator.clipboard?.writeText(text).then(() => toast(t('devtools.copied')));
  return (
    <Dialog
      title={t('devtools.hook.title', { app })}
      onClose={onClose}
      footer={
        <>
          {hook?.enabled && (
            <button className="btn btn--quiet" disabled={busy} onClick={turnOff}>
              {t('devtools.hook.turnOff')}
            </button>
          )}
          <button className="btn btn--primary" onClick={hook?.enabled ? onClose : turnOn} disabled={busy || !hook}>
            {hook?.enabled ? t('dev.done') : t('devtools.hook.turnOn')}
          </button>
        </>
      }
    >
      <div className="form">
        <p className="field__hint">{t('devtools.hook.how', { key: devKey('1a2b3c4d') })}</p>
        {hook?.enabled && hook.url && hook.secret && (
          <>
            <label className="field">
              <span className="field__label">{t('devtools.hook.url')}</span>
              <input className="input" readOnly value={hook.url} onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className="btn btn--quiet btn--small" onClick={() => copy(hook.url!)}>
                {t('devtools.copy')}
              </button>
            </label>
            <label className="field">
              <span className="field__label">{t(host === 'github' ? 'devtools.hook.secretGithub' : 'devtools.hook.secretGitlab')}</span>
              <input className="input" readOnly value={hook.secret} onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className="btn btn--quiet btn--small" onClick={() => copy(hook.secret!)}>
                {t('devtools.copy')}
              </button>
            </label>
            <p className="field__hint">{t(host === 'github' ? 'devtools.hook.eventsGithub' : 'devtools.hook.eventsGitlab')}</p>
            <p className="field__hint">{t('devtools.hook.linked', { n: hook.links })}</p>
          </>
        )}
      </div>
    </Dialog>
  );
}

/** Jira, before the first run: which projects to bring over, and which board they land on. */
function JiraSetup({ id, onStart, running }: { id: string; onStart: () => Promise<void>; running: string | null }) {
  const { t } = useI18n();
  const onErr = useErr();
  const [info, setInfo] = useState<{ projects: { key: string; name: string }[]; selected: string[]; boardId: string | null; boards: { id: string; name: string }[] } | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [boardId, setBoardId] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    get<{ projects: { key: string; name: string }[]; selected: string[]; boardId: string | null; boards: { id: string; name: string }[] }>(`/connections/${id}/jira`)
      .then((r) => {
        setInfo(r);
        setPicked(r.selected);
        setBoardId(r.boardId ?? r.boards[0]?.id ?? '');
      })
      .catch(onErr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  if (!info) return <div className="muted">{t('common.loading')}</div>;
  const start = async () => {
    setBusy(true);
    try {
      await put(`/connections/${id}/jira`, { projects: picked, boardId });
      await onStart();
    } catch (e) {
      onErr(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="source-setup">
      <p className="field__hint">{t('devtools.jira.setupHint')}</p>
      <fieldset className="field">
        <legend className="field__label">{t('devtools.jira.projects')}</legend>
        {info.projects.map((p) => (
          <label key={p.key} className="check">
            <input type="checkbox" checked={picked.includes(p.key)} onChange={(e) => setPicked(e.target.checked ? [...picked, p.key] : picked.filter((k) => k !== p.key))} />
            <span>
              {p.name} <span className="muted">{p.key}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <label className="field">
        <span className="field__label">{t('devtools.jira.board')}</span>
        <select className="select" value={boardId} onChange={(e) => setBoardId(e.target.value)}>
          {info.boards.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <span className="field__hint">{t('devtools.jira.boardHint')}</span>
      </label>
      <button className="btn btn--primary" disabled={busy || !!running || !picked.length || !boardId} onClick={start}>
        {running ?? t('devtools.jira.start')}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- set-up

function SetupFlow({ d, step, setStep, reload, onStart, running }: { d: Detail; step: Step; setStep: (s: Step) => void; reload: () => Promise<Detail | null>; onStart: () => Promise<void>; running: string | null }) {
  const { t } = useI18n();
  const steps: Step[] = d.connection.tabular ? ['file', 'objects', 'fields', 'start'] : ['objects', 'fields', 'start'];
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  return (
    <div className="source-setup">
      <ol className="steps" aria-label={t('sync.steps')}>
        {steps.map((s, i) => (
          <li key={s} aria-current={s === step ? 'step' : undefined} data-done={steps.indexOf(step) > i || undefined}>
            <span className="steps__n" aria-hidden="true">{i + 1}</span>
            <span>{t(`sync.step.${s}` as MessageKey)}</span>
          </li>
        ))}
      </ol>
      {step === 'file' && <FileStep d={d} onDone={async () => { await reload(); setStep('objects'); }} />}
      {step === 'objects' && <ObjectsStep d={d} drafts={drafts} setDrafts={setDrafts} onNext={() => setStep('fields')} />}
      {step === 'fields' && drafts && (
        <FieldsStep
          d={d}
          drafts={drafts}
          setDrafts={setDrafts}
          onBack={() => setStep('objects')}
          onSaved={async () => {
            await reload();
            setStep('start');
          }}
        />
      )}
      {step === 'start' && <StartStep d={d} onBack={() => setStep('fields')} onStart={onStart} running={running} />}
    </div>
  );
}

function FileStep({ d, onDone }: { d: Detail; onDone: () => Promise<void> }) {
  const { t } = useI18n();
  const onErr = useErr();
  const [url, setUrl] = useState(d.sync.file?.url ?? '');
  const [busy, setBusy] = useState(false);
  const gs = d.connection.provider === 'gsheets';
  return (
    <section className="sheet">
      <h3 className="section__head">{t(gs ? 'sync.file.titleSheets' : 'sync.file.titleExcel')}</h3>
      <p className="field__hint">{t(gs ? 'sync.file.hintSheets' : 'sync.file.hintExcel')}</p>
      <div className="toolbar">
        <input className="input" style={{ flex: 1, minWidth: 240 }} value={url} placeholder={gs ? 'https://docs.google.com/spreadsheets/d/…' : 'https://…sharepoint.com/…xlsx'} onChange={(e) => setUrl(e.target.value)} aria-label={t('sync.file.link')} />
        <button
          className="btn btn--primary"
          disabled={busy || url.trim().length < 10}
          onClick={async () => {
            setBusy(true);
            try {
              await post(`/connections/${d.connection.id}/file`, { url: url.trim() });
              await onDone();
            } catch (e) {
              onErr(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          {t('common.continue')}
        </button>
      </div>
    </section>
  );
}

/** Which Curahold thing a CRM object becomes. Encoded as "account", "task", "record:<key>", "new:<kind>". */
function targetValue(o: Draft): string {
  if (o.target === 'account') return 'account';
  if (o.target === 'task') return 'task';
  if (o.typeKey && o.typeKey !== '__new') return `record:${o.typeKey}`;
  return `new:${o.kind ?? 'custom'}`;
}

function draftsFrom(d: Detail, objects: RemoteObject[]): Draft[] {
  const saved = d.sync.objects;
  const hasType = (kind: string) => d.recordTypes.find((r) => r.kind === kind)?.key;
  return objects.map((o) => {
    const s = saved.find((x) => x.remote === o.name);
    if (s) return { ...s, custom: o.custom, hint: o.hint, kind: d.recordTypes.find((r) => r.key === s.typeKey)?.kind as Draft['kind'] };
    const base: Draft = { remote: o.name, label: o.labelPlural, target: 'record', enabled: false, create: false, fields: [], custom: o.custom, hint: o.hint };
    if (o.hint === 'account') return { ...base, target: 'account', enabled: !saved.some((x) => x.target === 'account' && x.enabled), ...(d.connection.readOnly ? { linkOnly: true } : {}) };
    if (o.hint === 'ticket') {
      const key = hasType('ticket');
      return { ...base, target: 'record', kind: 'ticket', typeKey: key ?? '__new', enabled: true, ...(d.connection.readOnly ? { linkOnly: true } : {}) };
    }
    if (o.hint === 'contact' || o.hint === 'opportunity') {
      const key = hasType(o.hint);
      return { ...base, target: 'record', kind: o.hint, typeKey: key ?? '__new', enabled: true };
    }
    if (o.hint === 'task') return { ...base, target: 'task', boardId: d.boards[0]?.id, create: true };
    return { ...base, target: 'record', kind: 'custom', typeKey: '__new' };
  });
}

function ObjectsStep({ d, drafts, setDrafts, onNext }: { d: Detail; drafts: Draft[] | null; setDrafts: (x: Draft[]) => void; onNext: () => void }) {
  const { t, words, locale } = useI18n();
  const onErr = useErr();
  const crm = appName(d.connection);
  useEffect(() => {
    if (drafts) return;
    get<{ objects: RemoteObject[] }>(`/connections/${d.connection.id}/objects`)
      .then((r) => setDrafts(draftsFrom(d, r.objects)))
      .catch(onErr);
  }, [d, drafts, setDrafts, onErr]);
  if (!drafts) return <div className="empty">{t('sync.reading', { crm })}</div>;
  const set = (i: number, patchIt: Partial<Draft>) => setDrafts(drafts.map((x, j) => (j === i ? { ...x, ...patchIt, fields: patchIt.target || patchIt.typeKey ? [] : (patchIt.fields ?? x.fields) } : x)));
  const accountTaken = (i: number) => drafts.some((x, j) => j !== i && x.enabled && x.target === 'account');
  const customTypes = d.recordTypes.filter((r) => r.kind === 'custom');
  const enabled = drafts.filter((x) => x.enabled);
  const ok = enabled.filter((x) => x.target === 'account').length === 1 && enabled.every((x) => x.target !== 'task' || x.boardId);
  return (
    <section className="sheet">
      <h3 className="section__head">{t('sync.objects.title', { crm })}</h3>
      <p className="field__hint">{t('sync.objects.hint', { accounts: words.other })}</p>
      <ul className="plainlist object-list">
        {drafts.map((o, i) => (
          <li key={o.remote} className="object-row" data-on={o.enabled || undefined}>
            <label className="checkbox object-row__pick">
              <input type="checkbox" checked={o.enabled} disabled={o.target === 'account' && accountTaken(i)} onChange={(e) => set(i, { enabled: e.target.checked })} />
              <span>
                <strong>{o.label}</strong>
                {o.custom && <span className="badge" style={{ marginInlineStart: 6 }}>{t('sync.customObject')}</span>}
              </span>
            </label>
            {o.enabled && (
              <div className="object-row__how">
                <label className="field">
                  <span className="field__label">{t('sync.objects.becomes')}</span>
                  <select
                    className="select"
                    value={targetValue(o)}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === 'account') set(i, { target: 'account', typeKey: undefined, kind: undefined });
                      else if (v === 'task') set(i, { target: 'task', typeKey: undefined, kind: undefined, boardId: o.boardId ?? d.boards[0]?.id, create: true });
                      else if (v.startsWith('record:')) set(i, { target: 'record', typeKey: v.slice(7), kind: d.recordTypes.find((r) => r.key === v.slice(7))?.kind as Draft['kind'] });
                      else set(i, { target: 'record', typeKey: d.recordTypes.find((r) => r.kind === v.slice(4) && v !== 'new:custom')?.key ?? '__new', kind: v.slice(4) as Draft['kind'] });
                    }}
                  >
                    <option value="account" disabled={accountTaken(i)}>
                      {words.other}
                    </option>
                    <option value={d.recordTypes.find((r) => r.kind === 'contact') ? `record:${d.recordTypes.find((r) => r.kind === 'contact')!.key}` : 'new:contact'}>{t('records.kind.contact')}</option>
                    <option value={d.recordTypes.find((r) => r.kind === 'opportunity') ? `record:${d.recordTypes.find((r) => r.kind === 'opportunity')!.key}` : 'new:opportunity'}>{t('records.kind.opportunity')}</option>
                    <option value={d.recordTypes.find((r) => r.kind === 'ticket') ? `record:${d.recordTypes.find((r) => r.kind === 'ticket')!.key}` : 'new:ticket'}>{t('records.kind.ticket')}</option>
                    {customTypes.map((r) => (
                      <option key={r.key} value={`record:${r.key}`}>
                        {typeLabel(r as any, locale)}
                      </option>
                    ))}
                    <option value="new:custom">{t('sync.objects.newType', { name: o.label })}</option>
                    <option value="task">{t('sync.objects.tasks')}</option>
                  </select>
                </label>
                {o.target === 'task' && (
                  <label className="field">
                    <span className="field__label">{t('sync.objects.board')}</span>
                    <select className="select" value={o.boardId ?? ''} onChange={(e) => set(i, { boardId: e.target.value })}>
                      {d.boards.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {!d.connection.readOnly && (
                  <label className="checkbox object-row__create">
                    <input type="checkbox" checked={o.create} onChange={(e) => setDrafts(drafts.map((x, j) => (j === i ? { ...x, create: e.target.checked } : x)))} />
                    <span>{t('sync.objects.create', { crm })}</span>
                  </label>
                )}
                {(o.target === 'account' || o.kind === 'ticket') && (
                  <label className="checkbox object-row__create">
                    <input type="checkbox" checked={!!o.linkOnly} onChange={(e) => setDrafts(drafts.map((x, j) => (j === i ? { ...x, linkOnly: e.target.checked } : x)))} />
                    <span>{o.target === 'account' ? t('sync.objects.linkOnly', { accounts: words.other }) : t('sync.objects.linkOnlyTickets', { account: words.one })}</span>
                  </label>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {!ok && <p className="field__hint">{t('sync.objects.needAccounts', { accounts: words.other })}</p>}
      <div className="stepbar">
        <span>{t('sync.objects.count', { n: enabled.length })}</span>
        <button className="btn btn--primary btn--small" disabled={!ok} onClick={onNext}>
          {t('common.continue')}
        </button>
      </div>
    </section>
  );
}

const KIND_OF = (o: Draft): 'account' | 'contact' | 'opportunity' | 'ticket' | 'task' | 'custom' => (o.target === 'account' ? 'account' : o.target === 'task' ? 'task' : (o.kind ?? 'custom'));

function localChoices(o: Draft, d: Detail, accountFields: AccountField[], t: (k: MessageKey, v?: any) => string, accountWord: string, locale: Locale) {
  const out: { value: string; label: string; types?: RemoteField['type'][] }[] = [];
  if (o.target === 'task') {
    out.push({ value: 'title', label: t('sync.local.title') }, { value: 'description', label: t('sync.local.description') }, { value: 'due', label: t('sync.local.due') }, { value: 'assignee', label: t('sync.local.assignee'), types: ['user', 'person'] }, { value: 'done', label: t('sync.local.done') }, { value: 'account', label: accountWord, types: ['ref', 'text'] });
    return out;
  }
  out.push({ value: 'name', label: t('sync.local.name') }, { value: 'owner', label: t('sync.local.owner'), types: ['user', 'person'] });
  if (o.target === 'record') out.push({ value: 'account', label: accountWord, types: ['ref', 'text'] }, { value: 'parent', label: t('sync.local.parent'), types: ['ref', 'text'] });
  // A built-in kind that is about to be created already has its fields.
  const fields =
    o.target === 'account'
      ? accountFields
      : (d.recordTypes.find((r) => r.key === o.typeKey)?.fields ?? (o.kind === 'contact' || o.kind === 'opportunity' || o.kind === 'ticket' ? BUILTIN_TYPES[o.kind].fields : []));
  for (const f of fields) if (!f.rollup) out.push({ value: `f:${f.key}`, label: labelOf(f.label, locale) });
  out.push({ value: 'new', label: t('sync.local.new') });
  return out;
}

function FieldsStep({ d, drafts, setDrafts, onBack, onSaved, saveLabel }: { d: Detail; drafts: Draft[]; setDrafts: (x: Draft[]) => void; onBack?: () => void; onSaved: () => Promise<void>; saveLabel?: string }) {
  const { t, words, locale } = useI18n();
  const { me, reloadMe } = useStore();
  const onErr = useErr();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const enabled = drafts.filter((x) => x.enabled);

  // Field lists and first suggestions, once per object.
  useEffect(() => {
    const need = drafts.filter((x) => x.enabled && !x.meta);
    if (!need.length) return;
    let alive = true;
    Promise.all(
      need.map(async (o) => {
        const q = new URLSearchParams({ kind: KIND_OF(o), ...(o.typeKey && o.typeKey !== '__new' ? { typeKey: o.typeKey } : {}) });
        const r = await get<{ fields: RemoteField[]; suggested: FieldMap[] }>(`/connections/${d.connection.id}/objects/${encodeURIComponent(o.remote)}/fields?${q}`);
        return [o.remote, r] as const;
      }),
    )
      .then((res) => {
        if (!alive) return;
        const by = new Map(res);
        setDrafts(
          drafts.map((x) => {
            const r = by.get(x.remote);
            if (!r) return x;
            const key = x.key ?? (d.connection.tabular ? (r.suggested.find((f) => f.local === 'name' || f.local === 'title')?.remote ?? r.fields[0]?.name) : undefined);
            return { ...x, meta: r.fields, fields: x.fields.length ? x.fields : r.suggested, key };
          }),
        );
        setOpen((cur) => cur ?? res[0]?.[0] ?? null);
      })
      .catch(onErr);
    return () => {
      alive = false;
    };
  }, [drafts, d, setDrafts, onErr]);

  const problems = enabled
    .filter((o) => o.meta)
    .filter((o) => !o.fields.some((f) => f.local === (o.target === 'task' ? 'title' : 'name')))
    .map((o) => o.label);

  const save = async () => {
    setBusy(true);
    try {
      const objects = drafts.map(({ meta: _m, custom: _c, hint: _h, ...o }) => o);
      await api('PUT', `/connections/${d.connection.id}/sync`, { objects, owners: d.sync.owners, conflict: d.sync.conflict });
      await reloadMe();
      await onSaved();
    } catch (e) {
      onErr(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="sheet">
      <h3 className="section__head">{t('sync.fields.title')}</h3>
      <p className="field__hint">{t('sync.fields.hint', { crm: appName(d.connection) })}</p>
      {enabled.map((o) => {
        const idx = drafts.indexOf(o);
        const isOpen = open === o.remote;
        const mapped = o.fields.length;
        return (
          <div className="map-object" key={o.remote}>
            <button className="map-object__head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : o.remote)}>
              <strong>{o.label}</strong>
              <span className="muted">→ {o.target === 'account' ? words.other : o.target === 'task' ? t('sync.objects.tasks') : o.typeKey === '__new' ? (o.kind && o.kind !== 'custom' ? t(`records.kind.${o.kind}` as MessageKey) : t('sync.objects.newType', { name: o.label })) : typeLabel((d.recordTypes.find((r) => r.key === o.typeKey) ?? { name: { one: {}, other: {} } }) as any, locale)}</span>
              <span className="badge">{o.meta ? t('sync.fields.mapped', { n: mapped }) : t('common.loading')}</span>
            </button>
            {isOpen && o.meta && (
              <FieldTable
                d={d}
                o={o}
                accountFields={me.org.accountFields}
                onChange={(next) => setDrafts(drafts.map((x, j) => (j === idx ? { ...x, ...next } : x)))}
              />
            )}
          </div>
        );
      })}
      {problems.length > 0 && <p className="error-text">{t('sync.fields.needName', { list: problems.join(', ') })}</p>}
      <div className="stepbar">
        {onBack && (
          <button className="btn btn--quiet btn--small" onClick={onBack}>
            {t('common.back')}
          </button>
        )}
        <span />
        <button className="btn btn--primary btn--small" disabled={busy || problems.length > 0 || enabled.some((o) => !o.meta)} onClick={save}>
          {saveLabel ?? t('common.continue')}
        </button>
      </div>
    </section>
  );
}

function FieldTable({ d, o, accountFields, onChange }: { d: Detail; o: Draft; accountFields: AccountField[]; onChange: (x: Partial<Draft>) => void }) {
  const { t, words, locale } = useI18n();
  const [q, setQ] = useState('');
  const [showAll, setShowAll] = useState(false);
  const choices = localChoices(o, d, accountFields, t as any, words.one, locale);
  const meta = (o.meta ?? []).filter((f) => f.type !== 'id' || d.connection.tabular);
  const byRemote = new Map(o.fields.map((f) => [f.remote, f]));
  const taken = new Set(o.fields.map((f) => f.local).filter((l) => l !== 'new'));
  const mapped = meta.filter((f) => byRemote.has(f.name));
  const rest = meta.filter((f) => !byRemote.has(f.name));
  const needle = q.trim().toLocaleLowerCase(locale);
  const restShown = rest.filter((f) => !needle || f.label.toLocaleLowerCase(locale).includes(needle) || f.name.toLowerCase().includes(needle));

  const setField = (rf: RemoteField, local: string) => {
    const others = o.fields.filter((f) => f.remote !== rf.name);
    if (!local) return onChange({ fields: others });
    // One CRM field per Curahold field.
    const cleaned = local === 'new' ? others : others.filter((f) => f.local !== local);
    onChange({ fields: [...cleaned, { remote: rf.name, local, dir: rf.updatable && local !== 'new' ? (byRemote.get(rf.name)?.dir ?? 'both') : rf.updatable ? 'both' : 'pull' }] });
  };
  const setDir = (rf: RemoteField, dir: 'both' | 'pull') => onChange({ fields: o.fields.map((f) => (f.remote === rf.name ? { ...f, dir } : f)) });
  const addAll = () => {
    const add = rest.filter((f) => f.type !== 'user' && f.type !== 'id' && f.type !== 'ref').map((f) => ({ remote: f.name, local: 'new', dir: f.updatable ? 'both' : 'pull' }) as FieldMap);
    onChange({ fields: [...o.fields, ...add] });
  };

  const row = (rf: RemoteField) => {
    const m = byRemote.get(rf.name);
    const fits = choices.filter((c) => !c.types || c.types.includes(rf.type) || (c.value === 'account' && rf.type === 'text' && d.connection.tabular));
    return (
      <tr key={rf.name}>
        <td>
          <div>{rf.label}</div>
          <div className="muted map-type">
            {t(`sync.rtype.${rf.type}` as MessageKey)}
            {rf.label !== rf.name ? ` · ${rf.name}` : ''}
          </div>
        </td>
        <td>
          <select className="select" value={m?.local ?? ''} aria-label={t('sync.fields.goesTo', { field: rf.label })} onChange={(e) => setField(rf, e.target.value)}>
            <option value="">{t('sync.local.none')}</option>
            {fits
              .filter((c) => c.value === 'new' || c.value === m?.local || !taken.has(c.value))
              .filter((c) => c.value !== 'new' || (rf.type !== 'user' && rf.type !== 'ref'))
              .map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
          </select>
        </td>
        <td>
          {m && (
            <select className="select" value={m.dir} disabled={!rf.updatable} aria-label={t('sync.fields.direction')} onChange={(e) => setDir(rf, e.target.value as 'both' | 'pull')}>
              <option value="both">{t('sync.dir.both')}</option>
              <option value="pull">{t('sync.dir.pull', { crm: appName(d.connection) })}</option>
            </select>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div className="map-table">
      {d.connection.tabular && (
        <label className="field" style={{ maxWidth: 360 }}>
          <span className="field__label">{t('sync.fields.key')}</span>
          <select className="select" value={o.key ?? ''} onChange={(e) => onChange({ key: e.target.value })}>
            {meta.map((f) => (
              <option key={f.name} value={f.name}>
                {f.label}
              </option>
            ))}
          </select>
          <span className="field__hint">{t('sync.fields.keyHint')}</span>
        </label>
      )}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t('sync.fields.remote', { crm: appName(d.connection) })}</th>
              <th>{t('sync.fields.local')}</th>
              <th>{t('sync.fields.direction')}</th>
            </tr>
          </thead>
          <tbody>{mapped.map(row)}</tbody>
        </table>
      </div>
      {rest.length > 0 && (
        <div className="map-rest">
          <div className="toolbar">
            <button className="btn btn--quiet btn--small" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>
              {t('sync.fields.others', { n: rest.length })}
            </button>
            {o.target !== 'task' && (
              <button className="btn btn--small" onClick={addAll}>
                {t('sync.fields.addAll', { n: rest.filter((f) => f.type !== 'user' && f.type !== 'id' && f.type !== 'ref').length })}
              </button>
            )}
            {showAll && <input className="input search" type="search" value={q} placeholder={t('sync.fields.search')} aria-label={t('sync.fields.search')} onChange={(e) => setQ(e.target.value)} />}
          </div>
          {showAll && (
            <div className="table-wrap">
              <table className="table">
                <tbody>{restShown.slice(0, 200).map(row)}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StartStep({ d, onBack, onStart, running }: { d: Detail; onBack: () => void; onStart: () => Promise<void>; running: string | null }) {
  const { t } = useI18n();
  const onErr = useErr();
  const [preview, setPreview] = useState<SyncPreview | null>(null);
  const [conflict, setConflict] = useState(d.sync.conflict ?? 'latest');
  const [owners, setOwners] = useState<Record<string, string | null> | null>(null);
  const crm = appName(d.connection);
  useEffect(() => {
    post<SyncPreview>(`/connections/${d.connection.id}/preview`, {}).then(setPreview).catch(onErr);
  }, [d.connection.id, onErr]);
  return (
    <section className="sheet">
      <h3 className="section__head">{t('sync.start.title')}</h3>
      {!preview ? (
        <div className="empty">{t('sync.reading', { crm })}</div>
      ) : (
        <>
          <ul className="plainlist preview-list">
            {preview.objects.map((o) => (
              <li key={o.remote}>
                <strong className="num">{o.total ?? t('sync.start.many')}</strong> <span>{o.label}</span>
                {o.matched > 0 && <span className="muted"> · {t('sync.start.matched', { n: o.matched })}</span>}
                {o.sample.length > 0 && <div className="muted preview-list__sample">{o.sample.join(', ')}…</div>}
              </li>
            ))}
          </ul>
          {!d.connection.tabular && <OwnersEditor id={d.connection.id} crm={crm} embedded onChange={setOwners} />}
          <fieldset className="field">
            <legend className="field__label">{t('sync.conflict.title')}</legend>
            <ConflictChoice value={conflict} onChange={setConflict} crm={crm} />
          </fieldset>
        </>
      )}
      <div className="stepbar">
        <button className="btn btn--quiet btn--small" onClick={onBack} disabled={!!running}>
          {t('common.back')}
        </button>
        <span>{running ?? ''}</span>
        <button
          className="btn btn--primary btn--small"
          disabled={!preview || !!running}
          onClick={async () => {
            try {
              if (owners) await api('PUT', `/connections/${d.connection.id}/owners`, { owners });
              await patch(`/connections/${d.connection.id}/sync`, { conflict });
              await onStart();
            } catch (e) {
              onErr(e);
            }
          }}
        >
          {t('sync.start.go')}
        </button>
      </div>
    </section>
  );
}

function ConflictChoice({ value, onChange, crm }: { value: SyncConfig['conflict']; onChange: (v: SyncConfig['conflict']) => void; crm: string }) {
  const { t } = useI18n();
  return (
    <div className="choice-list">
      {(['latest', 'crm', 'curahold'] as const).map((k) => (
        <label key={k} className="choice" data-on={value === k || undefined}>
          <input type="radio" checked={value === k} onChange={() => onChange(k)} />
          <span>
            <strong>{t(`sync.conflict.${k}` as MessageKey, { crm })}</strong>
            <span className="muted">{t(`sync.conflict.${k}Hint` as MessageKey, { crm })}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- running

const sum = (s: Record<string, SyncStats>, k: keyof SyncStats) => Object.values(s).reduce((n, x) => n + (x[k] ?? 0), 0);

function StatusTab({ id, d, refresh, reload }: { id: string; d: Detail; refresh: number; reload: () => Promise<unknown> }) {
  const { t, fmtDate } = useI18n();
  const onErr = useErr();
  const { toast } = useStore();
  const [runs, setRuns] = useState<SyncRun[] | null>(null);
  const [problems, setProblems] = useState<SyncProblem[] | null>(null);
  const load = useCallback(async () => {
    const [r, p] = await Promise.all([get<{ runs: SyncRun[] }>(`/connections/${id}/runs`), get<{ problems: SyncProblem[] }>(`/connections/${id}/problems`)]);
    setRuns(r.runs);
    setProblems(p.problems);
  }, [id]);
  useEffect(() => {
    void load().catch(onErr);
  }, [load, refresh, onErr]);
  const last = runs?.[0] ?? null;
  const labels = new Map(d.sync.objects.map((o) => [o.remote, o.label]));
  return (
    <>
      <section className="sheet">
        <h3 className="section__head">{t('sync.status.last')}</h3>
        {!last ? (
          <p className="muted">{t('sync.status.never')}</p>
        ) : (
          <>
            <p>
              <span className={`badge run--${last.status}`}>{t(`sync.run.${last.status}` as MessageKey)}</span> {relativeTime(last.finishedAt ?? last.startedAt, t)} · {t(`sync.trigger.${last.trigger}` as MessageKey)}
            </p>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th />
                    <th className="num">{t('sync.stat.created')}</th>
                    <th className="num">{t('sync.stat.updated')}</th>
                    <th className="num">{t('sync.stat.pushed')}</th>
                    <th className="num hide-phone">{t('sync.stat.archived')}</th>
                    <th className="num">{t('sync.stat.failed')}</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(last.stats).map(([obj, s]) => (
                    <tr key={obj}>
                      <td>{labels.get(obj) ?? obj}</td>
                      <td className="num">{s.created}</td>
                      <td className="num">{s.updated}</td>
                      <td className="num">{s.pushed}</td>
                      <td className="num hide-phone">{s.archived}</td>
                      <td className="num">{s.failed}</td>
                    </tr>
                  ))}
                  {Object.keys(last.stats).length === 0 && (
                    <tr>
                      <td colSpan={6} className="muted">
                        {t('sync.status.nothingNew')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {last.errors.length > 0 && (
              <details className="run-errors">
                <summary>{t('sync.status.errors', { n: last.errors.length })}</summary>
                <ul>
                  {last.errors.slice(0, 20).map((e, i) => (
                    <li key={i}>
                      {e.object && <strong>{labels.get(e.object) ?? e.object}</strong>} {e.name ? `“${e.name}” ` : ''}
                      <span className="muted">{e.message}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
        <p className="field__hint">{t('sync.status.schedule')}</p>
      </section>

      {problems && problems.length > 0 && (
        <section className="sheet">
          <div className="section__row">
            <h3 className="section__head">{t('sync.problems.title', { n: problems.length })}</h3>
            <button
              className="btn btn--small"
              onClick={async () => {
                try {
                  await post(`/connections/${id}/problems/retry`, {});
                  toast(t('sync.problems.retried'));
                  await load();
                  await reload();
                } catch (e) {
                  onErr(e);
                }
              }}
            >
              {t('sync.problems.retry')}
            </button>
          </div>
          <ul className="plainlist problem-list">
            {problems.map((p) => (
              <li key={`${p.entity}:${p.entityId}`}>
                <strong>{p.name}</strong> <span className="muted">· {p.lastError}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {runs && runs.length > 1 && (
        <section className="sheet">
          <h3 className="section__head">{t('sync.history')}</h3>
          <table className="table">
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDate(r.startedAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="hide-phone muted">{t(`sync.trigger.${r.trigger}` as MessageKey)}</td>
                  <td>
                    <span className={`badge run--${r.status}`}>{t(`sync.run.${r.status}` as MessageKey)}</span>
                  </td>
                  <td className="muted">
                    {t('sync.history.line', { created: sum(r.stats, 'created'), updated: sum(r.stats, 'updated'), pushed: sum(r.stats, 'pushed') })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}

function MappingEditor({ d, reload }: { d: Detail; reload: () => Promise<unknown> }) {
  const { t } = useI18n();
  const { toast } = useStore();
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [step, setStep] = useState<'objects' | 'fields'>('objects');
  return step === 'objects' ? (
    <ObjectsStep d={d} drafts={drafts} setDrafts={setDrafts} onNext={() => setStep('fields')} />
  ) : (
    <FieldsStep
      d={d}
      drafts={drafts!}
      setDrafts={setDrafts}
      onBack={() => setStep('objects')}
      saveLabel={t('common.save')}
      onSaved={async () => {
        toast(t('common.saved'));
        await reload();
        setDrafts(null);
        setStep('objects');
      }}
    />
  );
}

function OwnersEditor({ id, crm, embedded, onChange }: { id: string; crm: string; embedded?: boolean; onChange?: (owners: Record<string, string | null>) => void }) {
  const { t } = useI18n();
  const { people, toast } = useStore();
  const onErr = useErr();
  const [rows, setRows] = useState<{ remoteId: string; name: string; email: string | null; userId: string | null; manual: boolean }[] | null>(null);
  const [map, setMap] = useState<Record<string, string | null>>({});
  useEffect(() => {
    get<{ owners: NonNullable<typeof rows> }>(`/connections/${id}/owners`)
      .then((r) => {
        setRows(r.owners);
        setMap(Object.fromEntries(r.owners.map((o) => [o.remoteId, o.userId])));
      })
      .catch(onErr);
  }, [id, onErr]);
  const choose = (rid: string, uid: string | null) => {
    const next = { ...map, [rid]: uid };
    setMap(next);
    onChange?.(next);
  };
  const unmatched = useMemo(() => rows?.filter((r) => !map[r.remoteId]).length ?? 0, [rows, map]);
  if (!rows) return <div className="empty">{t('common.loading')}</div>;
  if (!rows.length) return embedded ? null : <p className="muted">{t('sync.owners.none', { crm })}</p>;
  const body = (
    <>
      <h3 className="section__head">{t('sync.owners.title')}</h3>
      <p className="field__hint">{unmatched ? t('sync.owners.unmatched', { n: unmatched, crm }) : t('sync.owners.allMatched', { crm })}</p>
      <div className="table-wrap owners-table">
        <table className="table">
          <tbody>
            {rows.map((r) => (
              <tr key={r.remoteId}>
                <td>
                  <div>{r.name}</div>
                  <div className="muted">{r.email}</div>
                </td>
                <td>
                  <select className="select" value={map[r.remoteId] ?? ''} aria-label={t('sync.owners.who', { name: r.name })} onChange={(e) => choose(r.remoteId, e.target.value || null)}>
                    <option value="">{t('sync.owners.nobody')}</option>
                    {people
                      .filter((p) => p.status === 'active' || p.status === 'invited')
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
  if (embedded) return <div className="owners-embedded">{body}</div>;
  return (
    <section className="sheet">
      {body}
      <div className="stepbar">
        <span />
        <button
          className="btn btn--primary btn--small"
          onClick={async () => {
            try {
              await api('PUT', `/connections/${id}/owners`, { owners: map });
              toast(t('common.saved'));
            } catch (e) {
              onErr(e);
            }
          }}
        >
          {t('common.save')}
        </button>
      </div>
    </section>
  );
}

function SettingsTab({ id, d, reload }: { id: string; d: Detail; reload: () => Promise<unknown> }) {
  const { t } = useI18n();
  const { toast } = useStore();
  const onErr = useErr();
  const crm = appName(d.connection);
  return (
    <section className="sheet">
      <fieldset className="field">
        <legend className="field__label">{t('sync.conflict.title')}</legend>
        <ConflictChoice
          value={d.sync.conflict ?? 'latest'}
          crm={crm}
          onChange={async (v) => {
            try {
              await patch(`/connections/${id}/sync`, { conflict: v });
              toast(t('common.saved'));
              await reload();
            } catch (e) {
              onErr(e);
            }
          }}
        />
      </fieldset>
      {d.sync.file && (
        <p className="field__hint">
          {t('sync.settings.file')}{' '}
          <a href={d.sync.file.url} target="_blank" rel="noreferrer noopener">
            {d.sync.file.name} ↗
          </a>
        </p>
      )}
      <p className="field__hint">{t('sync.settings.deletes', { crm })}</p>
    </section>
  );
}
