// Where the team talks: chat apps with buttons (Slack, Teams, Google Chat)
// and one-way channel posts for everything else. Used by the setup wizard
// and by Settings → Connections.
import { Icon } from './icons';
import { DemoConnect, IN_DEMO } from './DemoConnect';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { MessageKey } from '../../../shared/src/i18n';
import type { Connection, ProviderInfo } from '../../../shared/src/model';
import { ApiFailure, del, get, patch, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { navigate } from '../lib/router';
import { useStore } from '../lib/store';
import { relativeTime } from '../lib/time';
import { Confirm } from './ui';

// Product names are names, not text to translate.
export const PROVIDER_NAMES: Record<string, string> = {
  slack: 'Slack',
  teams: 'Microsoft Teams',
  gchat: 'Google Chat',
  webhook: 'Webhook',
  salesforce: 'Salesforce',
  hubspot: 'HubSpot',
  dynamics: 'Dynamics 365',
  pipedrive: 'Pipedrive',
  zoho: 'Zoho CRM',
  bitrix24: 'Bitrix24',
  freshsales: 'Freshsales',
  zendesksell: 'Zendesk Sell',
  gsheets: 'Google Sheets',
  excel: 'Excel',
  demo: 'Demo CRM',
  zendesk: 'Zendesk',
  freshdesk: 'Freshdesk',
  intercom: 'Intercom',
  jsm: 'Jira Service Management',
};
export const FLAVOR_NAMES: Record<string, string> = {
  slack: 'Slack',
  teams: 'Microsoft Teams',
  gchat: 'Google Chat',
  discord: 'Discord',
  mattermost: 'Mattermost',
  rocketchat: 'Rocket.Chat',
  webex: 'Webex',
  zoom: 'Zoom Team Chat',
  json: 'Zapier · Make · n8n',
};
const URL_HINT = 'https://';
const FLAVORS = ['slack', 'teams', 'gchat', 'discord', 'mattermost', 'rocketchat', 'webex', 'zoom', 'json'] as const;

export function useConnections() {
  const [data, setData] = useState<{ providers: ProviderInfo[]; connections: Connection[] } | null>(null);
  const reload = useCallback(async () => setData(await get('/connections')), []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, reload };
}

function Status({ c }: { c: Connection }) {
  const { t } = useI18n();
  if (c.status === 'disabled') return <span className="badge">{t('conn.paused')}</span>;
  if (c.status === 'error') return <span className="badge badge--disabled">{t('conn.problem')}</span>;
  return <span className="badge badge--active">{t('conn.working')}</span>;
}

export function Connections({ back = 'settings', onChange }: { back?: 'settings' | 'setup'; onChange?: (list: Connection[]) => void }) {
  const { t } = useI18n();
  const { toast } = useStore();
  const { data, reload } = useConnections();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Connection | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (data) onChange?.(data.connections);
  }, [data, onChange]);

  // Coming back from a service's consent screen.
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const provider = PROVIDER_NAMES[p.get('provider') ?? p.get('connected') ?? ''] ?? '';
    if (p.get('connected')) toast(t('conn.connected', { app: provider }));
    const err = p.get('error');
    if (err) toast(t(`conn.error.${['connection_taken', 'workspace_required', 'not_configured', 'forbidden'].includes(err) ? err : 'connection_failed'}` as MessageKey, { app: provider }), 'error');
    if (p.get('connected') || err) history.replaceState(null, '', location.pathname);
  }, [t, toast]);

  const act = async (id: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(id);
    try {
      await fn();
      if (ok) toast(ok);
      await reload();
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
      await reload();
    } finally {
      setBusy(null);
    }
  };

  if (!data) return <div className="muted">{t('common.loading')}</div>;
  const twoWay = data.providers.filter((p) => p.kind === 'messaging' && p.twoWay);
  const hooks = data.connections.filter((c) => c.provider === 'webhook');
  const sources = data.connections.filter((c) => c.kind === 'source');

  const controls = (c: Connection) => (
    <div className="inline-actions">
      <button className="btn btn--small" disabled={busy === c.id} onClick={() => act(c.id, () => post(`/connections/${c.id}/test`, {}), t('conn.testSent'))}>
        {t('conn.test')}
      </button>
      <button className="btn btn--small btn--quiet" disabled={busy === c.id} onClick={() => act(c.id, () => patch(`/connections/${c.id}`, { paused: c.status !== 'disabled' }))}>
        {c.status === 'disabled' ? t('conn.resume') : t('conn.pause')}
      </button>
      <button className="btn btn--small btn--quiet" onClick={() => setRemoving(c)}>
        {t('common.remove')}
      </button>
    </div>
  );

  return (
    <div className="conns">
      <h3 className="section__head">{t('conn.twoWay')}</h3>
      <p className="field__hint" style={{ marginTop: -4 }}>
        {t('conn.twoWayHint')}
      </p>
      <div className="tiles">
        {twoWay.map((p) => {
          const c = data.connections.find((x) => x.provider === p.id);
          return (
            <div className="tile" key={p.id} data-state={c ? c.status : p.available ? 'ready' : 'off'}>
              <div className="tile__head">
                <span className="tile__badge" aria-hidden="true">
                  {PROVIDER_NAMES[p.id][0]}
                </span>
                <div style={{ minWidth: 0 }}>
                  <strong>{PROVIDER_NAMES[p.id]}</strong>
                  {c && <div className="muted tile__sub">{c.label}</div>}
                </div>
                {c && <Status c={c} />}
              </div>
              {c ? (
                <>
                  <p className="tile__line">
                    {t('conn.linkedPeople', { n: c.linkedPeople })}
                    {c.lastOkAt ? ` · ${t('conn.lastOk', { when: relativeTime(c.lastOkAt, t) })}` : ''}
                  </p>
                  {c.status === 'error' && c.lastError && <p className="error-text tile__line">{c.lastError}</p>}
                  <p className="field__hint tile__line">{t(`conn.howLink.${p.id}` as MessageKey)}</p>
                  {p.id === 'teams' && (
                    <p className="tile__line">
                      <a href="/api/connections/teams/package" download>
                        {t('conn.teamsPackage')}
                      </a>
                    </p>
                  )}
                  {controls(c)}
                </>
              ) : p.available ? (
                <>
                  <p className="field__hint tile__line">{t(`conn.what.${p.id}` as MessageKey)}</p>
                  <a className="btn btn--primary btn--small" href={`/api/connect/${p.id}/start${back === 'setup' ? '?back=setup' : ''}`}>
                    {t('conn.connect', { app: PROVIDER_NAMES[p.id] })}
                  </a>
                </>
              ) : IN_DEMO ? (
                <>
                  <p className="field__hint tile__line">{t(`conn.what.${p.id}` as MessageKey)}</p>
                  <DemoConnect app={PROVIDER_NAMES[p.id]} />
                </>
              ) : (
                <p className="field__hint tile__line">{t('conn.notOnServer')}</p>
              )}
            </div>
          );
        })}
      </div>

      <h3 className="section__head" style={{ marginTop: 22 }}>
        <span>{t('conn.oneWay')}</span>
        {!adding && (
          <button className="btn btn--small" onClick={() => setAdding(true)}>
            {t('conn.addWebhook')}
          </button>
        )}
      </h3>
      <p className="field__hint" style={{ marginTop: -4 }}>
        {t('conn.oneWayHint')}
      </p>
      {adding && (
        <WebhookForm
          onCancel={() => setAdding(false)}
          onDone={async () => {
            setAdding(false);
            await reload();
          }}
        />
      )}
      {hooks.length > 0 && (
        <table className="table" style={{ marginTop: 10 }}>
          <tbody>
            {hooks.map((c) => (
              <tr key={c.id}>
                <td>
                  <strong>{c.label}</strong>
                  <div className="muted">{c.channels[0]?.name}</div>
                  {c.status === 'error' && c.lastError && <div className="error-text">{c.lastError}</div>}
                </td>
                <td>
                  <Status c={c} />
                </td>
                <td>{controls(c)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {back === 'settings' && (
        <p className="field__hint" style={{ marginTop: 22 }}>
          {t('conn.sourcesPointer', { n: sources.length })}{' '}
          <a href="/settings/sources" onClick={(e) => { e.preventDefault(); navigate('/settings/sources'); }}>
            {t('settings.tab.sources')}
          </a>
        </p>
      )}
      {removing && (
        <Confirm
          title={t('conn.removeTitle', { name: removing.label })}
          body={t('conn.removeBody')}
          confirmLabel={t('common.remove')}
          danger
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            const id = removing.id;
            setRemoving(null);
            await act(id, () => del(`/connections/${id}`), t('conn.removed'));
          }}
        />
      )}
    </div>
  );
}

function WebhookForm({ onCancel, onDone }: { onCancel: () => void; onDone: () => Promise<void> }) {
  const { t } = useI18n();
  const { toast } = useStore();
  const [flavor, setFlavor] = useState<(typeof FLAVORS)[number]>('slack');
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [token, setToken] = useState('');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await post<{ id: string }>('/connections/webhook', {
        flavor,
        url: url.trim(),
        label: label.trim() || FLAVOR_NAMES[flavor],
        ...(flavor === 'zoom' ? { token: token.trim() } : {}),
        ...(flavor === 'json' && secret.trim() ? { signingSecret: secret.trim() } : {}),
      });
      try {
        await post(`/connections/${r.id}/test`, {});
        toast(t('conn.testSent'));
      } catch {
        toast(t('conn.testFailed'), 'error');
      }
      await onDone();
    } catch (err) {
      const f = err instanceof ApiFailure ? (err.body as any) : null;
      setError(f?.fields?.includes('url') ? t(f.reason === 'host' ? 'conn.urlHost' : 'conn.urlBad', { app: FLAVOR_NAMES[flavor] }) : f?.message ?? t('errors.server'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="sheet form" onSubmit={submit} style={{ maxWidth: 'none' }}>
      <div className="form__row">
        <label className="field">
          <span className="field__label">{t('conn.app')}</span>
          <select className="select" value={flavor} onChange={(e) => setFlavor(e.target.value as any)}>
            {FLAVORS.map((f) => (
              <option key={f} value={f}>
                {f === 'json' ? `${t('conn.flavor.json')} (${FLAVOR_NAMES.json})` : FLAVOR_NAMES[f]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">{t('conn.name')}</span>
          <input className="input" value={label} placeholder={t('conn.namePlaceholder')} onChange={(e) => setLabel(e.target.value)} maxLength={120} />
        </label>
      </div>
      <label className="field">
        <span className="field__label">{t('conn.url')}</span>
        <input className="input" value={url} required type="url" inputMode="url" placeholder={URL_HINT} onChange={(e) => setUrl(e.target.value)} />
        <span className="field__hint">{t(`conn.where.${flavor}` as MessageKey)}</span>
      </label>
      {flavor === 'zoom' && (
        <label className="field">
          <span className="field__label">{t('conn.zoomToken')}</span>
          <input className="input" value={token} required onChange={(e) => setToken(e.target.value)} />
        </label>
      )}
      {flavor === 'json' && (
        <label className="field">
          <span className="field__label">{t('conn.signingSecret')}</span>
          <input className="input" value={secret} onChange={(e) => setSecret(e.target.value)} />
          <span className="field__hint">{t('conn.signingHint')}</span>
        </label>
      )}
      {error && <p className="error-text">{error}</p>}
      <div className="inline-actions" style={{ justifyContent: 'flex-start' }}>
        <button className="btn btn--primary" disabled={busy || !url.trim()}>
          <Icon name="plug" size={16} />
          {busy ? t('common.saving') : t('conn.addAndTest')}
        </button>
        <button type="button" className="btn btn--quiet" onClick={onCancel}>
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}
