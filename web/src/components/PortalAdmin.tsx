// The customer portal, from inside: the company's switch, the boards it
// opened, and the customers' people who can sign in.
import { Icon } from './icons';
import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { brandPalette, HEX_COLOR, PORTAL_DEFAULT_COLOR, PORTAL_FILE_MB, PORTAL_QUOTA_MAX_MB, PORTAL_SESSION_DAYS, type PortalAuth, type PortalBrand, type PortalPerson, type PortalSettings } from '../../../shared/src/portal';
import { useUndo } from '../lib/undo';
import { useUnsaved } from '../lib/unsaved';
import { ErrorState, SkeletonRows } from './Empty';
import '../surfaces/portal.css';
import type { MessageKey } from '../../../shared/src/i18n';
import { ApiFailure, del, get, post, put } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { navigate } from '../lib/router';
import { useStore } from '../lib/store';
import { AccountPicker } from './AccountPicker';

export function PortalSettingsTab() {
  const { t, locale } = useI18n();
  const { toast } = useStore();
  const offer = useUndo();
  const [s, setS] = useState<PortalSettings | null>(null);
  const [failed, setFailed] = useState(false);
  // The brand and the ways in are one form: one Save bar, one leave check, one Undo.
  const [form, setForm] = useState<{ brand: PortalBrand; auth: PortalAuth } | null>(null);
  const load = useCallback(() => {
    setFailed(false);
    get<PortalSettings>('/portal')
      .then((x) => {
        setS(x);
        setForm({ brand: x.brand, auth: x.auth });
      })
      .catch(() => setFailed(true));
  }, []);
  useEffect(load, [load]);
  const brandChanged = !!s && !!form && JSON.stringify(form.brand) !== JSON.stringify(s.brand);
  const authChanged = !!s && !!form && JSON.stringify(form.auth) !== JSON.stringify(s.auth);
  const save = async (): Promise<boolean> => {
    if (!s || !form) return false;
    const before = { brand: s.brand, auth: s.auth };
    const body = { ...(brandChanged ? { brand: form.brand } : {}), ...(authChanged ? { auth: form.auth } : {}) };
    try {
      await put('/portal/settings', body);
    } catch (err) {
      toast(err instanceof ApiFailure ? err.body.message : t('errors.server'), 'error');
      return false;
    }
    setS({ ...s, ...form });
    load();
    // The colour, the footer and the ways in go back the same way.
    offer(brandChanged && !authChanged ? t('portal.admin.brandSaved') : t('settings.savedTopic', { topic: t('settings.tab.portal') }), () => put('/portal/settings', before), load);
    return true;
  };
  useUnsaved(brandChanged || authChanged, { save, discard: () => s && setForm({ brand: s.brand, auth: s.auth }) });
  const turn = async (on: boolean) => {
    try {
      await put('/portal/settings', { enabled: on });
      load();
      offer(on ? t('portal.admin.turnedOn') : t('portal.admin.turnedOff'), () => put('/portal/settings', { enabled: !on }), load);
    } catch (err) {
      toast(err instanceof ApiFailure ? err.body.message : t('errors.server'), 'error');
    }
  };
  if (failed) return <ErrorState compact onRetry={load} />;
  if (!s || !form) return <SkeletonRows rows={5} label={t('common.loading')} />;
  if (!s.available) return <div className="empty">{t('portal.admin.unavailable')}</div>;
  return (
    <div>
      <section className="sheet">
        <h3 className="section__head">{t('portal.admin.title')}</h3>
        <p className="field__hint">{t('portal.admin.explain')}</p>
        <label className="checkbox u-mt-8">
          <input type="checkbox" checked={s.enabled} onChange={(e) => void turn(e.target.checked)} />
          <strong>{t('portal.admin.enabled')}</strong>
        </label>
        {s.enabled && s.address && (
          <p className="portal-admin__address">
            {t('portal.admin.address')} <code>{s.address}</code>
          </p>
        )}
        {s.enabled && (
          <div className="field u-mt-12">
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
      {s.enabled && <BrandSection settings={s} value={form.brand} onChange={(brand) => setForm({ ...form, brand })} />}
      {s.enabled && <SignInMethods settings={s} value={form.auth} onChange={(auth) => setForm({ ...form, auth })} locale={locale} />}
      {s.enabled && <UploadsSection settings={s} onSaved={load} />}
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
  const offer = useUndo();
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
        <table className="table portal-people__table">
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
                      <button
                        className="btn btn--quiet btn--small"
                        onClick={async () => {
                          try {
                            await del(`/portal/users/${p.id}`);
                            load();
                            offer(t('portal.people.disabledNamed', { name: p.name }), () => post(`/portal/users/${p.id}/enable`), load);
                          } catch (err) {
                            toast(err instanceof ApiFailure ? err.body.message : t('errors.server'), 'error');
                          }
                        }}
                      >
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

/** The company in front: its colour on the portal and in its emails, its logo, and whether Curahold is named at the foot. */
function BrandSection({ settings, value: b, onChange: setB }: { settings: PortalSettings; value: PortalBrand; onChange: (b: PortalBrand) => void }) {
  const { t } = useI18n();
  const [hex, setHex] = useState(b.color ?? '');
  // Discard or Undo puts the saved colour back: the typed text follows it.
  useEffect(() => setHex(b.color ?? ''), [b.color]);
  const pal = brandPalette(b.color).light;
  const typed = (v: string) => {
    setHex(v);
    const h = v.startsWith('#') ? v : `#${v}`;
    if (HEX_COLOR.test(h)) setB({ ...b, color: h.toLowerCase() });
  };
  return (
    <section className="sheet">
      <h3 className="section__head">{t('portal.admin.brand')}</h3>
      <p className="field__hint">{t('portal.admin.brandLead')}</p>
      <div className="pbrand">
        <div className="pbrand__form">
          <div className="field">
            <span className="field__label" id="pbrand-color">
              {t('portal.admin.color')}
            </span>
            <div className="pbrand__color">
              <input type="color" className="pbrand__swatch" aria-labelledby="pbrand-color" value={b.color ?? PORTAL_DEFAULT_COLOR} onChange={(e) => typed(e.target.value)} />
              <input className="input pbrand__hex" aria-label={t('portal.admin.colorHex')} value={hex} placeholder={PORTAL_DEFAULT_COLOR} maxLength={7} spellCheck={false} onChange={(e) => typed(e.target.value.trim())} />
            </div>
            {b.color && (
              <button type="button" className="btn btn--quiet btn--small pbrand__reset" onClick={() => (setB({ ...b, color: null }), setHex(''))}>
                {t('portal.admin.colorDefault')}
              </button>
            )}
          </div>
          <div className="field">
            <span className="field__label">{t('portal.admin.logo')}</span>
            <span className="field__hint">{settings.logoUrl ? t('portal.admin.logoLead') : t('portal.admin.noLogo')}</span>
            <button type="button" className="btn btn--small pbrand__logo" onClick={() => navigate('/settings/company')}>
              {t('portal.admin.changeLogo')}
            </button>
          </div>
          <label className="checkbox">
            <input type="checkbox" checked={b.poweredBy} onChange={(e) => setB({ ...b, poweredBy: e.target.checked })} />
            <span>{t('portal.admin.poweredBy')}</span>
          </label>
        </div>
        <figure className="pbrand__preview" aria-label={t('portal.admin.preview')} style={{ '--pb-fill': pal.fill, '--pb-on': pal.onFill, '--pb-ink': pal.ink, '--pb-wash': pal.wash } as CSSProperties}>
          <div className="pbrand__top">
            {settings.logoUrl ? <img src={settings.logoUrl} alt="" /> : <span className="pbrand__mark" aria-hidden="true" />}
            <span className="pbrand__lines" aria-hidden="true">
              <i />
              <i />
            </span>
          </div>
          <div className="pbrand__band">
            <span className="pbrand__title">{t('portal.requests')}</span>
            <span className="pbrand__btn">{t('portal.new')}</span>
          </div>
          <span className="pbrand__row" aria-hidden="true" />
          <span className="pbrand__row" aria-hidden="true" />
          <figcaption className="pbrand__foot">{b.poweredBy ? t('portal.poweredBy') : '\u00a0'}</figcaption>
        </figure>
      </div>
    </section>
  );
}

/** The company's choice of ways into the portal, and how long a sign-in lasts; what it means shows before saving. */
function SignInMethods({ settings, value: a, onChange: setA, locale }: { settings: PortalSettings; value: PortalAuth; onChange: (a: PortalAuth) => void; locale: string }) {
  const { t } = useI18n();
  const methods = ['email', 'google', 'microsoft', 'passkey', 'password'] as const;
  const missing = (m: (typeof methods)[number]) => (m === 'google' || m === 'microsoft') && !settings.providers[m];
  const ways = methods.filter((m) => a[m] && !missing(m)).map((m) => t(`portal.admin.m.${m}` as MessageKey));
  const was = settings.auth;
  const days = (n: number) => (n === 1 ? t('portal.admin.day1') : t('portal.admin.days', { n }));
  const effect = [
    { key: 'ways', text: ways.length ? t('portal.admin.effectWays', { ways: new Intl.ListFormat(locale, { type: 'conjunction' }).format(ways) }) : t('portal.admin.effectNone'), changed: methods.some((m) => a[m] !== was[m]), warn: !ways.length },
    { key: 'session', text: t('portal.admin.effectSession', { days: days(a.sessionDays) }), changed: a.sessionDays !== was.sessionDays, warn: false },
  ];
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
      <ul className="admin-effect__list portal-effect" aria-live="polite">
        {effect.map((e) => (
          <li key={e.key} data-changed={e.changed || undefined} data-warn={e.warn || undefined}>
            {e.text}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Files customers send from the portal: where they may (a shared request or ticket, a step of their plan) and how much in all. */
function UploadsSection({ settings, onSaved }: { settings: PortalSettings; onSaved: () => void }) {
  const { t } = useI18n();
  const { toast } = useStore();
  const [mb, setMb] = useState(String(settings.uploads.quotaMb));
  const n = Number(mb);
  const ok = Number.isInteger(n) && n >= 0 && n <= PORTAL_QUOTA_MAX_MB;
  return (
    <section className="sheet" data-tour="portal-uploads">
      <h3 className="section__head">{t('portal.admin.uploads')}</h3>
      <p className="muted">{t('portal.admin.uploadsHint', { mb: PORTAL_FILE_MB })}</p>
      <label className="field">
        <span className="field__label">{t('portal.admin.quota')}</span>
        <input className="input" inputMode="numeric" value={mb} aria-invalid={!ok || undefined} onChange={(e) => setMb(e.target.value.replace(/[^0-9]/g, ''))} />
        <span className="field__hint">{t('portal.admin.quotaUsed', { used: settings.uploads.usedMb, mb: settings.uploads.quotaMb })}</span>
      </label>
      <button
        className="btn btn--small"
        disabled={!ok || n === settings.uploads.quotaMb}
        onClick={() =>
          void put('/portal/settings', { uploadQuotaMb: n })
            .then(() => (toast(t('common.saved')), onSaved()))
            .catch(() => toast(t('errors.server'), 'error'))
        }
      >
        {t('common.save')}
      </button>
    </section>
  );
}
