// The customer portal, from inside: the company's switch, the boards it
// opened, and the customers' people who can sign in.
import { Icon } from './icons';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { PORTAL_SESSION_DAYS, type PortalAuth, type PortalPerson, type PortalSettings } from '../../../shared/src/portal';
import type { MessageKey } from '../../../shared/src/i18n';
import { ApiFailure, del, get, post, put } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { navigate } from '../lib/router';
import { useStore } from '../lib/store';
import { AccountPicker } from './AccountPicker';

export function PortalSettingsTab() {
  const { t } = useI18n();
  const { toast } = useStore();
  const [s, setS] = useState<PortalSettings | null>(null);
  const load = useCallback(() => void get<PortalSettings>('/portal').then(setS), []);
  useEffect(load, [load]);
  if (!s) return <p className="muted">{t('common.loading')}</p>;
  if (!s.available) return <div className="empty">{t('portal.admin.unavailable')}</div>;
  return (
    <div>
      <section className="sheet">
        <h3 className="section__head">{t('portal.admin.title')}</h3>
        <p className="field__hint">{t('portal.admin.explain')}</p>
        <label className="checkbox" style={{ marginTop: 10 }}>
          <input
            type="checkbox"
            checked={s.enabled}
            onChange={async (e) => {
              try {
                await put('/portal/settings', { enabled: e.target.checked });
                toast(t('common.saved'));
                load();
              } catch (err) {
                toast(err instanceof ApiFailure ? err.body.message : t('errors.server'), 'error');
              }
            }}
          />
          <strong>{t('portal.admin.enabled')}</strong>
        </label>
        {s.enabled && s.address && (
          <p className="portal-admin__address">
            {t('portal.admin.address')} <code>{s.address}</code>
          </p>
        )}
        {s.enabled && (
          <div className="field" style={{ marginTop: 12 }}>
            <span className="field__label">{t('portal.admin.boards')}</span>
            {s.boards.length === 0 ? (
              <span className="field__hint">{t('portal.admin.noBoards')}</span>
            ) : (
              <div className="chips-row">
                {s.boards.map((b) => (
                  <button key={b.id} className="chip" onClick={() => navigate(`/b/${b.id}`)}>
                    {b.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
      {s.enabled && <SignInMethods settings={s} onSaved={load} />}
      {s.enabled && (
        <section className="sheet">
          <h3 className="section__head">{t('portal.people.title')}</h3>
          <PortalPeople />
        </section>
      )}
    </div>
  );
}

/** The people at customers who can sign in; for one customer when `accountId` is given. */
export function PortalPeople({ accountId, accountName }: { accountId?: string; accountName?: string }) {
  const { t, fmtDate } = useI18n();
  const { toast, canWrite } = useStore();
  const [list, setList] = useState<PortalPerson[] | null>(null);
  const [account, setAccount] = useState<{ id: string | null; name: string | null }>({ id: accountId ?? null, name: accountName ?? null });
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => void get<{ people: PortalPerson[] }>(`/portal/users${accountId ? `?accountId=${accountId}` : ''}`).then((r) => setList(r.people)), [accountId]);
  useEffect(load, [load]);

  const invite = async (e: FormEvent) => {
    e.preventDefault();
    if (!account.id) return toast(t('portal.people.pickCustomer'), 'error');
    setBusy(true);
    try {
      await post('/portal/users', { accountId: account.id, name, email });
      toast(t('portal.people.invited', { email }));
      setName('');
      setEmail('');
      load();
    } catch (err) {
      toast(err instanceof ApiFailure ? err.body.message : t('errors.server'), 'error');
    } finally {
      setBusy(false);
    }
  };
  const act = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      toast(done);
      load();
    } catch (err) {
      toast(err instanceof ApiFailure ? err.body.message : t('errors.server'), 'error');
    }
  };

  return (
    <div className="portal-people">
      {list && list.length === 0 && <p className="muted">{t('portal.people.none')}</p>}
      {list && list.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>{t('portal.people.name')}</th>
              {!accountId && <th>{t('portal.people.customer')}</th>}
              <th>{t('portal.people.status')}</th>
              <th>{t('portal.people.lastSeen')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.name}
                  <div className="muted">{p.email}</div>
                </td>
                {!accountId && <td>{p.accountName}</td>}
                <td>
                  <span className={`badge badge--${p.status === 'active' ? 'active' : p.status === 'invited' ? 'invited' : 'disabled'}`}>{t(`portal.people.state.${p.status}`)}</span>
                </td>
                <td className="muted">{p.lastSeenAt ? fmtDate(p.lastSeenAt, { day: 'numeric', month: 'short' }) : '—'}</td>
                <td className="num">
                  {canWrite && p.status !== 'disabled' && (
                    <>
                      <button className="btn btn--quiet btn--small" onClick={() => act(() => post(`/portal/users/${p.id}/resend`), t('portal.people.resent'))}>
                        {t('portal.people.resend')}
                      </button>
                      <button className="btn btn--quiet btn--small" onClick={() => act(() => del(`/portal/users/${p.id}`), t('portal.people.disabled'))}>
                        {t('portal.people.disable')}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {canWrite && (
        <form className="portal-people__invite" onSubmit={invite}>
          {!accountId && (
            <div className="field">
              <span className="field__label">{t('portal.people.customer')}</span>
              <AccountPicker value={account.id} name={account.name} onChange={(id, picked) => setAccount({ id, name: picked ?? null })} />
            </div>
          )}
          <label className="field">
            <span className="field__label">{t('portal.people.name')}</span>
            <input className="input" value={name} maxLength={120} required onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span className="field__label">{t('portal.people.email')}</span>
            <input className="input" type="email" value={email} maxLength={254} required onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button className="btn btn--primary" disabled={busy || !name.trim() || !email.trim()}>
            <Icon name="userPlus" size={16} />
            {t('portal.people.invite')}
          </button>
        </form>
      )}
      <p className="field__hint">{t('portal.people.hint')}</p>
    </div>
  );
}

/** The company's choice of ways into the portal, and how long a sign-in lasts. */
function SignInMethods({ settings, onSaved }: { settings: PortalSettings; onSaved: () => void }) {
  const { t } = useI18n();
  const { toast } = useStore();
  const [a, setA] = useState<PortalAuth>(settings.auth);
  const [busy, setBusy] = useState(false);
  const methods = ['email', 'google', 'microsoft', 'passkey', 'password'] as const;
  const missing = (m: (typeof methods)[number]) => (m === 'google' || m === 'microsoft') && !settings.providers[m];
  const changed = JSON.stringify(a) !== JSON.stringify(settings.auth);
  const save = async () => {
    setBusy(true);
    try {
      await put('/portal/settings', { auth: a });
      toast(t('common.saved'));
      onSaved();
    } catch (err) {
      toast(err instanceof ApiFailure ? err.body.message : t('errors.server'), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="sheet">
      <h3 className="section__head">{t('portal.admin.signIn')}</h3>
      <p className="field__hint">{t('portal.admin.signInLead')}</p>
      <ul className="portal-methods">
        {methods.map((m) => (
          <li key={m}>
            <label className="checkbox">
              <input type="checkbox" checked={a[m] && !missing(m)} disabled={missing(m)} onChange={(e) => setA({ ...a, [m]: e.target.checked })} />
              <strong>{t(`portal.admin.m.${m}` as MessageKey)}</strong>
            </label>
            <span className="field__hint">
              {t(`portal.admin.m.${m}Hint` as MessageKey)}
              {missing(m) && <> · {t('portal.admin.notConfigured')}</>}
            </span>
          </li>
        ))}
      </ul>
      <div className="portal-methods__more">
        <label className="field">
          <span className="field__label">{t('portal.admin.sessionDays')}</span>
          <select className="select" value={a.sessionDays} onChange={(e) => setA({ ...a, sessionDays: Number(e.target.value) as PortalAuth['sessionDays'] })}>
            {PORTAL_SESSION_DAYS.map((d) => (
              <option key={d} value={d}>
                {d === 1 ? t('portal.admin.day1') : t('portal.admin.days', { n: d })}
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={a.notify} onChange={(e) => setA({ ...a, notify: e.target.checked })} />
          <span>{t('portal.admin.notify')}</span>
        </label>
      </div>
      <button className="btn btn--primary" disabled={busy || !changed} onClick={save}>
        {t('portal.admin.saveSignIn')}
      </button>
    </section>
  );
}
