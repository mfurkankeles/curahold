// Admin panel: configure the company's SSO login (SAML or OIDC) and its SCIM
// provisioning token. The signing material (SAML cert, OIDC client secret) is
// write-only — the API never returns it, so a blank field keeps the stored
// value. Mounted from Settings.tsx (reported hook); this file edits no hub.
//
// New i18n keys are all under `sso.*` (see the sub-agent report). All visible
// text goes through t() so the no-hard-coded-text rule holds.
import { useCallback, useEffect, useState } from 'react';
import type { MessageKey } from '../../../shared/src/i18n';
import { useI18n } from '../lib/i18n';
import { ApiFailure } from '../lib/api';
import { useStore } from '../lib/store';
import { useUndo } from '../lib/undo';
import { useUnsaved } from '../lib/unsaved';
import { ErrorState, SkeletonRows } from './Empty';
import { getDeviceId } from '../lib/device';
import { relativeTime } from '../lib/time';
import { Icon } from './icons';
import { Avatar } from './ui';
import '../surfaces/admin.css';
import '../surfaces/admin-2.css';
import { getSsoSettings, rotateScimToken, saveSsoSettings, type BackupPerson, type SsoProtocol, type SsoSettings as Settings } from '../lib/sso';

type Form = {
  enabled: boolean;
  enforced: boolean;
  protocol: SsoProtocol;
  issuer: string;
  ssoUrl: string;
  tokenUrl: string;
  jwksUrl: string;
  clientId: string;
  attrEmail: string;
  attrName: string;
  cert: string;
  clientSecret: string;
  scimEnabled: boolean;
  /** The backup administrators (at most two) who keep the emailed link, with their second step, when SSO is required. */
  backup: string[];
};

const blank: Form = { enabled: false, enforced: false, protocol: 'saml', issuer: '', ssoUrl: '', tokenUrl: '', jwksUrl: '', clientId: '', attrEmail: 'email', attrName: '', cert: '', clientSecret: '', scimEnabled: false, backup: [] };
const MAX_BACKUP = 2;

/** Settings: the company's SSO (SAML or OIDC), test sign-in, backup administrators and the SCIM token. */
export function SsoSettings() {
  const { t, locale } = useI18n();
  const k = (s: string) => t(s as MessageKey);
  const { toast, people, me } = useStore();
  const offer = useUndo();
  const [data, setData] = useState<Settings | null>(null);
  const [failed, setFailed] = useState(false);
  const [base, setBase] = useState<Form>(blank);
  const [form, setForm] = useState<Form>(blank);
  const [scim, setScim] = useState<{ token: string; baseUrl: string; hint: string } | null>(null);
  // Back from a test sign-in: the result is in the address once, then the address is tidied.
  const [tested] = useState(() => {
    const q = new URLSearchParams(location.search);
    const r = q.get('ssoTest');
    return r ? { ok: r === 'ok', as: q.get('as') ?? '', reason: r } : null;
  });
  useEffect(() => {
    if (tested) history.replaceState(history.state, '', location.pathname);
  }, [tested]);
  const load = useCallback(() => {
    setFailed(false);
    getSsoSettings()
      .then((s) => {
        setData(s);
        const c = s.config;
        const f: Form = c
          ? {
              enabled: c.enabled,
              enforced: c.enforced,
              protocol: c.protocol ?? 'saml',
              issuer: c.issuer ?? '',
              ssoUrl: c.ssoUrl ?? '',
              tokenUrl: c.tokenUrl ?? '',
              jwksUrl: c.jwksUrl ?? '',
              clientId: c.clientId ?? '',
              attrEmail: c.attrEmail ?? 'email',
              attrName: c.attrName ?? '',
              cert: '',
              clientSecret: '',
              scimEnabled: c.scimEnabled,
              backup: s.backup?.ids ?? [],
            }
          : { ...blank, backup: s.backup?.ids ?? [] };
        setBase(f);
        setForm(f);
      })
      .catch(() => setFailed(true));
  }, []);
  useEffect(load, [load]);
  const set = <K extends keyof Form>(key: K, v: Form[K]) => setForm((f) => ({ ...f, [key]: v }));
  const dirty = JSON.stringify(form) !== JSON.stringify(base);

  const bodyOf = (f: Form) => {
    const body: Record<string, unknown> = {
      protocol: f.protocol,
      enabled: f.enabled,
      enforced: f.enabled && f.enforced,
      issuer: f.issuer,
      ssoUrl: f.ssoUrl,
      attrEmail: f.attrEmail,
      attrName: f.attrName,
      scimEnabled: f.scimEnabled,
      backupAdminIds: f.backup,
    };
    if (f.protocol === 'oidc') Object.assign(body, { tokenUrl: f.tokenUrl, jwksUrl: f.jwksUrl, clientId: f.clientId });
    // Only send signing material when the admin typed some, so a blank keeps it.
    if (f.cert.trim()) body.cert = f.cert.trim();
    if (f.clientSecret.trim()) body.clientSecret = f.clientSecret.trim();
    return body;
  };
  async function save(): Promise<boolean> {
    const before = base;
    try {
      const r = await saveSsoSettings(bodyOf(form));
      setData((d) => (d ? { ...d, sp: r.sp, backup: r.backup ?? d.backup, config: d.config ? { ...d.config, certSet: d.config.certSet || !!form.cert.trim(), clientSecretSet: d.config.clientSecretSet || !!form.clientSecret.trim() } : d.config } : d));
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
      return false;
    }
    const now = { ...form, cert: '', clientSecret: '' };
    setBase(now);
    setForm(now);
    // Undo sends the previous switches and addresses back; stored secrets stay as they are.
    offer(t('settings.savedTopic', { topic: t('settings.tab.sso') }), async () => {
      await saveSsoSettings(bodyOf(before));
      setBase(before);
      setForm(before);
    });
    return true;
  }
  useUnsaved(dirty, { save, discard: () => setForm(base) });

  async function generate() {
    try {
      setScim(await rotateScimToken());
      setForm((f) => ({ ...f, scimEnabled: true }));
      setBase((b) => ({ ...b, scimEnabled: true }));
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    }
  }
  const copy = async (v: string) => {
    try {
      await navigator.clipboard?.writeText(v);
      toast(t('devtools.copied'));
    } catch {
      /* the field stays selectable */
    }
  };
  if (failed) return <ErrorState compact onRetry={load} />;
  if (!data) return <SkeletonRows rows={6} label={t('common.loading')} />;
  const ready = !!form.ssoUrl.trim() && (form.protocol === 'saml' ? !!(form.cert.trim() || data.config?.certSet) : !!form.clientId.trim());
  const active = people.filter((p) => p.status === 'active').length;
  // A test runs against what is saved; requiring SSO needs a passed test of exactly that (the server checks too).
  const savedReady = !!data.config?.protocol && !!data.config.ssoUrl;
  const testedNow = !dirty && (!!data.test?.current || (!!tested?.ok && !!data.test?.current));
  // Backup administrators: chosen ones first, then the administrators who could be one.
  const backupPeople = data.backup?.people ?? [];
  const personOf = (id: string): BackupPerson | undefined => backupPeople.find((p) => p.id === id);
  const chosen = form.backup.map((id) => personOf(id)).filter((p): p is BackupPerson => !!p);
  const canGetIn = (p: BackupPerson) => p.admin && p.secondStep;
  const backupReady = chosen.some(canGetIn);
  const addable = backupPeople.filter((p) => p.admin && !form.backup.includes(p.id));
  const names = new Intl.ListFormat(locale, { type: 'conjunction' }).format(chosen.filter(canGetIn).map((p) => p.name));
  const enforceBlocked = !base.enforced && !testedNow ? 'sso.test.first' : !backupReady ? 'sso.backup.first' : null;
  const ReadonlyRow = ({ label, value }: { label: string; value: string }) => (
    <label className="field">
      <span className="field__label">{label}</span>
      <span className="sso__copyrow">
        <input className="input sso__mono" dir="ltr" readOnly value={value} onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="btn" onClick={() => void copy(value)}>
          <Icon name="copy" size={16} />
          {k('sso.copy')}
        </button>
      </span>
    </label>
  );
  const Switch = ({ id, on, disabled, label, hint, onChange }: { id: string; on: boolean; disabled?: boolean; label: string; hint: string; onChange: (v: boolean) => void }) => (
    <div className="sso__switch">
      <span className="sso__switchtext">
        <span className="sso__switchlabel" id={`${id}-l`}>
          {label}
        </span>
        <span className="field__hint" id={`${id}-h`}>
          {hint}
        </span>
      </span>
      <button type="button" className="switch" role="switch" aria-checked={on} aria-labelledby={`${id}-l`} aria-describedby={`${id}-h`} disabled={disabled} onClick={() => onChange(!on)}>
        <span />
      </button>
    </div>
  );
  return (
    <div className="sso">
      <section className="sheet sso__section" aria-labelledby="sso-sp">
        <h3 className="sheet__title" id="sso-sp">
          {k('sso.sp.title')}
        </h3>
        <label className="field sso__protocol">
          <span className="field__label">{k('sso.protocol')}</span>
          <select className="select" value={form.protocol} onChange={(e) => set('protocol', e.target.value as SsoProtocol)}>
            <option value="saml">{k('sso.protocol.saml')}</option>
            <option value="oidc">{k('sso.protocol.oidc')}</option>
          </select>
        </label>
        {form.protocol === 'saml' ? (
          <>
            <ReadonlyRow label={k('sso.sp.entityId')} value={data.sp.entityId} />
            <ReadonlyRow label={k('sso.sp.acsUrl')} value={data.sp.acsUrl} />
            <ReadonlyRow label={k('sso.sp.metadataUrl')} value={data.sp.metadataUrl} />
          </>
        ) : (
          <ReadonlyRow label={k('sso.sp.redirectUri')} value={data.sp.redirectUri} />
        )}
      </section>

      <section className="sheet sso__section" aria-labelledby="sso-idp">
        <h3 className="sheet__title" id="sso-idp">
          {k('sso.idp.title')}
        </h3>
        {form.protocol === 'saml' ? (
          <>
            <Field label={k('sso.saml.entityId')} value={form.issuer} onChange={(v) => set('issuer', v)} />
            <Field label={k('sso.saml.ssoUrl')} value={form.ssoUrl} onChange={(v) => set('ssoUrl', v)} />
            <label className="field">
              <span className="field__label">{k('sso.saml.cert')}</span>
              <textarea className="input sso__mono" dir="ltr" rows={4} value={form.cert} onChange={(e) => set('cert', e.target.value)} />
              {data.config?.certSet && <span className="field__hint">{k('sso.secretKept')}</span>}
            </label>
          </>
        ) : (
          <>
            <Field label={k('sso.oidc.issuer')} value={form.issuer} onChange={(v) => set('issuer', v)} />
            <Field label={k('sso.oidc.authUrl')} value={form.ssoUrl} onChange={(v) => set('ssoUrl', v)} />
            <Field label={k('sso.oidc.tokenUrl')} value={form.tokenUrl} onChange={(v) => set('tokenUrl', v)} />
            <Field label={k('sso.oidc.jwksUrl')} value={form.jwksUrl} onChange={(v) => set('jwksUrl', v)} />
            <Field label={k('sso.oidc.clientId')} value={form.clientId} onChange={(v) => set('clientId', v)} />
            <label className="field">
              <span className="field__label">{k('sso.oidc.clientSecret')}</span>
              <input className="input" type="password" autoComplete="off" value={form.clientSecret} onChange={(e) => set('clientSecret', e.target.value)} />
              {data.config?.clientSecretSet && <span className="field__hint">{k('sso.secretKept')}</span>}
            </label>
          </>
        )}
        <div className="form__row">
          <Field label={k('sso.attr.email')} value={form.attrEmail} onChange={(v) => set('attrEmail', v)} />
          <Field label={`${k('sso.attr.name')} (${k('common.optional')})`} value={form.attrName} onChange={(v) => set('attrName', v)} />
        </div>
      </section>

      <section className="sheet sso__section" aria-labelledby="sso-backup">
        <h3 className="sheet__title" id="sso-backup">
          {t('sso.backup.title')}
        </h3>
        <p className="field__hint">{t('sso.backup.hint')}</p>
        {chosen.length > 0 && (
          <ul className="keylist">
            {chosen.map((p) => (
              <li className="keyrow sso-backup__row" key={p.id}>
                <Avatar person={people.find((x) => x.id === p.id) ?? { id: p.id, name: p.name, email: p.email, seat: 'full', status: 'active' }} />
                <div className="keyrow__main">
                  <div className="keyrow__name">{p.name}</div>
                  <div className={canGetIn(p) ? 'keyrow__meta' : 'keyrow__meta sso-backup__warn'}>
                    {!p.admin ? t('sso.backup.notAdmin') : p.secondStep ? t('sso.backup.ready') : t('sso.backup.noStep')}
                  </div>
                </div>
                <button type="button" className="btn btn--quiet btn--icon" aria-label={t('sso.backup.remove', { name: p.name })} title={t('sso.backup.remove', { name: p.name })} onClick={() => set('backup', form.backup.filter((id) => id !== p.id))}>
                  <Icon name="close" size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {form.backup.length < MAX_BACKUP && addable.length > 0 && (
          <label className="field sso__protocol">
            <span className="field__label">{form.backup.length ? t('sso.backup.addSecond') : t('sso.backup.add')}</span>
            <select
              className="select"
              value=""
              onChange={(e) => {
                const id = e.target.value;
                if (id) set('backup', [...form.backup, id]);
              }}
            >
              <option value="">{t('sso.backup.pick')}</option>
              {addable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.secondStep ? p.name : t('sso.backup.optionNoStep', { name: p.name })}
                </option>
              ))}
            </select>
          </label>
        )}
        {chosen.some((p) => p.admin && !p.secondStep) && <p className="field__hint">{t('sso.backup.howStep')}</p>}
      </section>

      <section className="sheet sso__section" aria-labelledby="sso-on">
        <h3 className="sheet__title" id="sso-on">
          {k('sso.on.title')}
        </h3>
        {!ready && !form.enabled && <p className="field__hint">{k('sso.needsDetails')}</p>}
        {tested && (
          <p className={`notice sso__effect${tested.ok ? ' sso__ok' : ' notice--error'}`} role="status">
            {tested.ok ? t('sso.test.ok', { email: tested.as }) : t('sso.test.failed', { reason: t(`sso.test.why.${['oauth_failed', 'no_account', 'not_configured', 'bad_secret', 'bad_signature', 'bad_token', 'idp_unreachable'].includes(tested.reason) ? tested.reason : 'oauth_failed'}` as MessageKey) })}
          </p>
        )}
        <div className="sso__test">
          <a
            className="btn"
            aria-disabled={dirty || !savedReady || undefined}
            href={`/api/sso/${me.org.slug}/start?test=1&device=${encodeURIComponent(getDeviceId())}`}
            onClick={(e) => {
              if (dirty || !savedReady) e.preventDefault();
            }}
          >
            <Icon name="external" size={16} />
            {k('sso.test.button')}
          </a>
          <span className="field__hint">{dirty ? k('sso.test.saveFirst') : data.test && !tested ? (data.test.current ? t('sso.test.last', { when: relativeTime(data.test.at, t), email: data.test.email ?? '' }) : k('sso.test.stale')) : k('sso.test.hint')}</span>
        </div>
        <Switch id="sso-enable" on={form.enabled} disabled={!ready && !form.enabled} label={k('sso.enable')} hint={k('sso.enableHint')} onChange={(v) => setForm((f) => ({ ...f, enabled: v, enforced: v ? f.enforced : false }))} />
        <Switch
          id="sso-enforce"
          on={form.enabled && form.enforced}
          disabled={!form.enabled || (!form.enforced && !!enforceBlocked)}
          label={k('sso.enforce')}
          hint={!form.enforced && enforceBlocked ? k(enforceBlocked) : k('sso.enforceHint')}
          onChange={(v) => set('enforced', v)}
        />
        {/* Required, but nobody could get in if the provider failed: saving is refused, so say it here first. */}
        {form.enabled && form.enforced && !backupReady && (
          <p className="notice notice--error sso__effect" role="alert">
            {t('errors.sso_no_backup')}
          </p>
        )}
        {/* What saving would do, before it is done. */}
        {form.enabled && form.enforced && !(base.enabled && base.enforced) && (
          <div className="notice sso__effect" role="status">
            <p>
              <strong>{t('sso.effect.enforce', { n: active })}</strong>
            </p>
            <p>{k('sso.effect.lockout')}</p>
            {backupReady && <p>{t('sso.effect.backup', { names })}</p>}
          </div>
        )}
        {base.enabled && !form.enabled && (
          <p className="notice sso__effect" role="status">
            {k('sso.effect.off')}
          </p>
        )}
      </section>

      <section className="sheet sso__section" aria-labelledby="sso-scim">
        <h3 className="sheet__title" id="sso-scim">
          {k('sso.scim.title')}
        </h3>
        <Switch id="sso-scim-on" on={form.scimEnabled} label={k('sso.scim.enable')} hint={data.config?.scimEnabled && !scim ? k('sso.scim.current') : ''} onChange={(v) => set('scimEnabled', v)} />
        <ReadonlyRow label={k('sso.scim.baseUrl')} value={data.sp.scimBaseUrl} />
        <div>
          <button type="button" className="btn" onClick={() => void generate()}>
            <Icon name="key" size={16} />
            {k('sso.scim.generate')}
          </button>
        </div>
        {scim && (
          <div className="notice">
            <p>{k('sso.scim.tokenOnce')}</p>
            <ReadonlyRow label={k('sso.scim.token')} value={scim.token} />
          </div>
        )}
      </section>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
