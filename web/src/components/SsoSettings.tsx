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
import { Icon } from './icons';
import '../surfaces/admin.css';
import { getSsoSettings, rotateScimToken, saveSsoSettings, type SsoProtocol, type SsoSettings as Settings } from '../lib/sso';

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
};

const blank: Form = { enabled: false, enforced: false, protocol: 'saml', issuer: '', ssoUrl: '', tokenUrl: '', jwksUrl: '', clientId: '', attrEmail: 'email', attrName: '', cert: '', clientSecret: '', scimEnabled: false };

export function SsoSettings() {
  const { t } = useI18n();
  const k = (s: string) => t(s as MessageKey);
  const { toast, people } = useStore();
  const offer = useUndo();
  const [data, setData] = useState<Settings | null>(null);
  const [failed, setFailed] = useState(false);
  const [base, setBase] = useState<Form>(blank);
  const [form, setForm] = useState<Form>(blank);
  const [scim, setScim] = useState<{ token: string; baseUrl: string; hint: string } | null>(null);
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
            }
          : blank;
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
      setData((d) => (d ? { ...d, sp: r.sp, config: d.config ? { ...d.config, certSet: d.config.certSet || !!form.cert.trim(), clientSecretSet: d.config.clientSecretSet || !!form.clientSecret.trim() } : d.config } : d));
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
  const ReadonlyRow = ({ label, value }: { label: string; value: string }) => (
    <label className="field">
      <span className="field__label">{label}</span>
      <span className="sso__copyrow">
        <input className="input sso__mono" readOnly value={value} onFocus={(e) => e.currentTarget.select()} />
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
              <textarea className="input sso__mono" rows={4} value={form.cert} onChange={(e) => set('cert', e.target.value)} />
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

      <section className="sheet sso__section" aria-labelledby="sso-on">
        <h3 className="sheet__title" id="sso-on">
          {k('sso.on.title')}
        </h3>
        {!ready && !form.enabled && <p className="field__hint">{k('sso.needsDetails')}</p>}
        <Switch id="sso-enable" on={form.enabled} disabled={!ready && !form.enabled} label={k('sso.enable')} hint={k('sso.enableHint')} onChange={(v) => setForm((f) => ({ ...f, enabled: v, enforced: v ? f.enforced : false }))} />
        <Switch id="sso-enforce" on={form.enabled && form.enforced} disabled={!form.enabled} label={k('sso.enforce')} hint={k('sso.enforceHint')} onChange={(v) => set('enforced', v)} />
        {/* What saving would do, before it is done. */}
        {form.enabled && form.enforced && !(base.enabled && base.enforced) && (
          <div className="notice sso__effect" role="status">
            <p>
              <strong>{t('sso.effect.enforce', { n: active })}</strong>
            </p>
            <p>{k('sso.effect.lockout')}</p>
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
