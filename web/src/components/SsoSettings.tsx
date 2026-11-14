// Admin panel: configure the company's SSO login (SAML or OIDC) and its SCIM
// provisioning token. The signing material (SAML cert, OIDC client secret) is
// write-only — the API never returns it, so a blank field keeps the stored
// value. Mounted from Settings.tsx (reported hook); this file edits no hub.
//
// New i18n keys are all under `sso.*` (see the sub-agent report). All visible
// text goes through t() so the no-hard-coded-text rule holds.
import { useEffect, useState } from 'react';
import type { MessageKey } from '../../../shared/src/i18n';
import { useI18n } from '../lib/i18n';
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
  const [data, setData] = useState<Settings | null>(null);
  const [form, setForm] = useState<Form>(blank);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scim, setScim] = useState<{ token: string; baseUrl: string; hint: string } | null>(null);

  useEffect(() => {
    getSsoSettings().then((s) => {
      setData(s);
      const c = s.config;
      if (c)
        setForm({
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
        });
    });
  }, []);

  const set = <K extends keyof Form>(key: K, v: Form[K]) => setForm((f) => ({ ...f, [key]: v }));

  async function save() {
    setBusy(true);
    setSaved(false);
    try {
      const body: Record<string, unknown> = {
        protocol: form.protocol,
        enabled: form.enabled,
        enforced: form.enforced,
        issuer: form.issuer,
        ssoUrl: form.ssoUrl,
        attrEmail: form.attrEmail,
        attrName: form.attrName,
        scimEnabled: form.scimEnabled,
      };
      if (form.protocol === 'oidc') Object.assign(body, { tokenUrl: form.tokenUrl, jwksUrl: form.jwksUrl, clientId: form.clientId });
      // Only send signing material when the admin typed some, so a blank keeps it.
      if (form.cert.trim()) body.cert = form.cert.trim();
      if (form.clientSecret.trim()) body.clientSecret = form.clientSecret.trim();
      const r = await saveSsoSettings(body);
      setData((d) => (d ? { ...d, sp: r.sp } : d));
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    setScim(await rotateScimToken());
    setForm((f) => ({ ...f, scimEnabled: true }));
  }

  const copy = (v: string) => void navigator.clipboard?.writeText(v);
  if (!data) return <p className="muted">{k('common.loading')}</p>;

  const ReadonlyRow = ({ label, value }: { label: string; value: string }) => (
    <label className="field">
      <span className="field__label">{label}</span>
      <span className="inline-actions">
        <input className="input" readOnly value={value} />
        <button type="button" className="btn btn--quiet" aria-label={k('sso.copy')} onClick={() => copy(value)}>
          {k('sso.copy')}
        </button>
      </span>
    </label>
  );

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 640 }}>
      <div>
        <h2>{k('sso.title')}</h2>
        <p className="muted">{k('sso.subtitle')}</p>
      </div>

      <label className="field field--check">
        <input type="checkbox" checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} />
        <span>{k('sso.enable')}</span>
      </label>
      <label className="field field--check">
        <input type="checkbox" checked={form.enforced} onChange={(e) => set('enforced', e.target.checked)} />
        <span>{k('sso.enforce')}</span>
      </label>

      <label className="field">
        <span className="field__label">{k('sso.protocol')}</span>
        <select className="select" value={form.protocol} onChange={(e) => set('protocol', e.target.value as SsoProtocol)}>
          <option value="saml">{k('sso.protocol.saml')}</option>
          <option value="oidc">{k('sso.protocol.oidc')}</option>
        </select>
      </label>

      {form.protocol === 'saml' ? (
        <>
          <Field label={k('sso.saml.entityId')} value={form.issuer} onChange={(v) => set('issuer', v)} />
          <Field label={k('sso.saml.ssoUrl')} value={form.ssoUrl} onChange={(v) => set('ssoUrl', v)} />
          <label className="field">
            <span className="field__label">{k('sso.saml.cert')}</span>
            <textarea className="input" rows={4} value={form.cert} onChange={(e) => set('cert', e.target.value)} />
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
            <input className="input" type="password" value={form.clientSecret} onChange={(e) => set('clientSecret', e.target.value)} />
            {data.config?.clientSecretSet && <span className="field__hint">{k('sso.secretKept')}</span>}
          </label>
        </>
      )}

      <Field label={k('sso.attr.email')} value={form.attrEmail} onChange={(v) => set('attrEmail', v)} />
      <Field label={`${k('sso.attr.name')} (${k('common.optional')})`} value={form.attrName} onChange={(v) => set('attrName', v)} />

      <div className="tile">
        <h3>{k('sso.sp.title')}</h3>
        {form.protocol === 'saml' ? (
          <>
            <ReadonlyRow label={k('sso.sp.entityId')} value={data.sp.entityId} />
            <ReadonlyRow label={k('sso.sp.acsUrl')} value={data.sp.acsUrl} />
            <ReadonlyRow label={k('sso.sp.metadataUrl')} value={data.sp.metadataUrl} />
          </>
        ) : (
          <ReadonlyRow label={k('sso.sp.redirectUri')} value={data.sp.redirectUri} />
        )}
      </div>

      <div className="inline-actions">
        <button className="btn btn--primary" disabled={busy} onClick={save}>
          {k('common.save')}
        </button>
        {saved && <span className="muted">{k('common.saved')}</span>}
      </div>

      <div className="tile">
        <h3>{k('sso.scim.title')}</h3>
        <label className="field field--check">
          <input type="checkbox" checked={form.scimEnabled} onChange={(e) => set('scimEnabled', e.target.checked)} />
          <span>{k('sso.scim.enable')}</span>
        </label>
        <ReadonlyRow label={k('sso.scim.baseUrl')} value={data.sp.scimBaseUrl} />
        {data.config?.scimEnabled && !scim && <p className="field__hint">{k('sso.scim.current')}</p>}
        <button type="button" className="btn" onClick={generate}>
          {k('sso.scim.generate')}
        </button>
        {scim && (
          <div className="notice">
            <p>{k('sso.scim.tokenOnce')}</p>
            <ReadonlyRow label={k('sso.scim.token')} value={scim.token} />
          </div>
        )}
      </div>
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
