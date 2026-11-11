// Company settings: the company itself, people (with devices and the
// KVKK/GDPR tools), teams, roles and the activity log.
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { Locale } from '../../../shared/src/i18n';
import { LOGO_TYPES, MAX_LOGO_KB, type AdminUser, type AuditEntry, type JoinRequest, type Role, type SessionInfo } from '../../../shared/src/model';
import { AccountFieldsEditor, RecordTypesEditor } from '../components/AccountFields';
import { SourceDetail, Sources } from '../components/Sources';
import { AutomationList } from '../components/Automations';
import { Connections } from '../components/Connections';
import { DeveloperTab } from '../components/Developer';
import { HealthSettings } from '../components/Timeline';
import { SupportAccessSettings } from '../components/Help';
import { PortalSettingsTab } from '../components/PortalAdmin';
import { AccessDialog, RolesTab } from '../components/Roles';
import { Avatar, Confirm, Dialog, Mark, PeoplePicker, RowMenu } from '../components/ui';
import { ApiFailure, del, get, patch, post } from '../lib/api';
import { getDeviceId } from '../lib/device';
import { useI18n } from '../lib/i18n';
import { navigate } from '../lib/router';
import { useStore } from '../lib/store';
import { relativeTime } from '../lib/time';

type Tab = 'company' | 'fields' | 'health' | 'records' | 'people' | 'joining' | 'teams' | 'roles' | 'connections' | 'sources' | 'automations' | 'developer' | 'portal' | 'support' | 'audit';

// The admin area: grouped sections on the left (a menu on phones), one
// section at a time on the right. Each section is reachable by its own URL.
export function SettingsPage({ tab, sub }: { tab: Tab; sub?: string }) {
  const { t, words } = useI18n();
  const { can } = useStore();
  const groups: { label: string; items: [Tab, string, boolean][] }[] = [
    {
      label: t('settings.group.company'),
      items: [
        ['company', t('settings.tab.company'), can('org.manage')],
        ['fields', t('settings.tab.fields', { account: words.one }), can('accounts.manage')],
        ['records', t('settings.tab.records'), can('accounts.manage')],
        ['health', t('settings.tab.health'), can('accounts.manage')],
      ],
    },
    {
      label: t('settings.group.team'),
      items: [
        ['people', t('settings.tab.people'), can('users.manage')],
        ['joining', t('settings.tab.joining'), can('users.manage')],
        ['teams', t('settings.tab.teams'), can('teams.manage')],
        ['roles', t('settings.tab.roles'), can('org.manage') || can('users.manage')],
      ],
    },
    {
      label: t('settings.group.work'),
      items: [
        ['connections', t('settings.tab.connections'), can('connections.manage')],
        ['sources', t('settings.tab.sources'), can('connections.manage')],
        ['automations', t('settings.tab.automations'), can('automations.manage')],
        ['developer', t('settings.tab.developer'), can('connections.manage') || can('users.manage')],
        ['portal', t('settings.tab.portal'), can('org.manage')],
      ],
    },
    { label: t('settings.group.security'), items: [['support', t('settings.tab.support'), can('org.manage')], ['audit', t('settings.tab.audit'), can('audit.view')]] },
  ];
  const allowed = groups.flatMap((g) => g.items).filter((x) => x[2]);
  const current = allowed.find((x) => x[0] === tab)?.[0] ?? allowed[0]?.[0];
  const currentLabel = allowed.find((x) => x[0] === current)?.[1] ?? '';
  return (
    <>
      <header className="topbar">
        <h1 className="topbar__title">{t('settings.title')}</h1>
        <span className="topbar__sub">{currentLabel}</span>
      </header>
      <div className="page admin">
        <nav className="admin__nav" aria-label={t('settings.title')}>
          <select className="select admin__navselect" value={current} aria-label={t('settings.title')} onChange={(e) => navigate(`/settings/${e.target.value}`)}>
            {allowed.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          {groups.map((g) => {
            const items = g.items.filter((x) => x[2]);
            if (!items.length) return null;
            return (
              <div className="admin__group" key={g.label}>
                <div className="admin__grouplabel">{g.label}</div>
                {items.map(([key, label]) => (
                  <a
                    key={key}
                    href={`/settings/${key}`}
                    className="admin__link"
                    aria-current={key === current ? 'page' : undefined}
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(`/settings/${key}`);
                    }}
                  >
                    {label}
                  </a>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="admin__content">
          {current === 'company' && <CompanyTab />}
          {current === 'fields' && <AccountFieldsEditor />}
          {current === 'records' && <RecordTypesEditor />}
          {current === 'health' && <HealthSettings />}
          {current === 'support' && <SupportAccessSettings />}
          {current === 'portal' && <PortalSettingsTab />}
          {current === 'people' && <PeopleTab />}
          {current === 'joining' && <JoiningTab />}
          {current === 'teams' && <TeamsTab />}
          {current === 'roles' && <RolesTab />}
          {current === 'connections' && <Connections />}
          {current === 'sources' && (sub ? <SourceDetail id={sub} key={sub} /> : <Sources />)}
          {current === 'automations' && <AutomationList />}
          {current === 'developer' && <DeveloperTab />}
          {current === 'audit' && <AuditTab />}
        </div>
      </div>
    </>
  );
}

function useSaver() {
  const { t } = useI18n();
  const { toast } = useStore();
  return useCallback(
    async (fn: () => Promise<unknown>, ok = true) => {
      try {
        await fn();
        if (ok) toast(t('common.saved'));
        return true;
      } catch (e) {
        toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
        return false;
      }
    },
    [toast, t],
  );
}

const TIMEZONES = ['Europe/Istanbul', 'Europe/London', 'Europe/Berlin', 'Europe/Amsterdam', 'Europe/Madrid', 'Europe/Warsaw', 'Asia/Dubai', 'Asia/Riyadh', 'Asia/Singapore', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'UTC'];

export const CURRENCIES = ['TRY', 'USD', 'EUR', 'GBP', 'CHF', 'AED', 'SAR', 'QAR', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'RON', 'CAD', 'AUD', 'SGD', 'INR', 'JPY', 'BRL', 'MXN', 'ZAR'];

function CompanyTab() {
  return <CompanyForm />;
}

export function CompanyForm({ onSaved, submitLabel }: { onSaved?: () => void; submitLabel?: string }) {
  const { t } = useI18n();
  const { me, reloadMe } = useStore();
  const save = useSaver();
  const [name, setName] = useState(me.org.name);
  const [locale, setLocale] = useState<Locale>(me.org.locale);
  const [tz, setTz] = useState(me.org.timezone);
  const [currency, setCurrency] = useState(me.org.currency);
  const [terms, setTerms] = useState({
    en: { one: me.org.terms.account?.en?.one ?? '', other: me.org.terms.account?.en?.other ?? '' },
    tr: { one: me.org.terms.account?.tr?.one ?? '', other: me.org.terms.account?.tr?.other ?? '' },
  });
  const zones = TIMEZONES.includes(tz) ? TIMEZONES : [tz, ...TIMEZONES];

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (await save(() => patch('/admin/org', { name, locale, timezone: tz, currency, terms: { account: terms } }))) {
      await reloadMe();
      onSaved?.();
    }
  }
  const word = (l: Locale, k: 'one' | 'other', label: string) => (
    <label className="field">
      <span className="field__label">{label}</span>
      <input className="input" maxLength={40} value={terms[l][k]} placeholder={l === 'tr' ? (k === 'one' ? 'Müşteri' : 'Müşteriler') : k === 'one' ? 'Account' : 'Accounts'} onChange={(e) => setTerms({ ...terms, [l]: { ...terms[l], [k]: e.target.value } })} />
    </label>
  );
  return (
    <form className="form" onSubmit={submit}>
      <LogoEditor />
      <div className="sheet">
        <div className="form">
          <label className="field">
            <span className="field__label">{t('settings.company.name')}</span>
            <input className="input" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="field">
            <span className="field__label">{t('settings.company.address')}</span>
            <span className="num">{location.host}</span>
          </div>
          <div className="form__row">
            <label className="field">
              <span className="field__label">{t('settings.company.language')}</span>
              <select className="select" value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
                <option value="en">English</option>
                <option value="tr">Türkçe</option>
              </select>
            </label>
            <label className="field">
              <span className="field__label">{t('settings.company.timezone')}</span>
              <select className="select" value={tz} onChange={(e) => setTz(e.target.value)}>
                {zones.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="field" style={{ maxWidth: 300 }}>
            <span className="field__label">{t('settings.company.currency')}</span>
            <select className="select" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {(CURRENCIES.includes(currency) ? CURRENCIES : [currency, ...CURRENCIES]).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="sheet">
        <h2 className="sheet__title">{t('settings.company.vocabulary')}</h2>
        <p className="sheet__hint">{t('settings.company.vocabularyHint')}</p>
        <div className="form__row">
          {word('en', 'one', `English, ${t('settings.company.singular').toLocaleLowerCase()}`)}
          {word('en', 'other', `English, ${t('settings.company.plural').toLocaleLowerCase()}`)}
          {word('tr', 'one', `Türkçe, ${t('settings.company.singular').toLocaleLowerCase()}`)}
          {word('tr', 'other', `Türkçe, ${t('settings.company.plural').toLocaleLowerCase()}`)}
        </div>
      </div>
      <div>
        <button className="btn btn--primary">{submitLabel ?? t('common.save')}</button>
      </div>
    </form>
  );
}

function PeopleTab() {
  const { t } = useI18n();
  const { me, teams, reloadPeople, toast } = useStore();
  const save = useSaver();
  const [data, setData] = useState<{ users: AdminUser[]; seatsUsed: number } | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [invite, setInvite] = useState(false);
  const [devicesOf, setDevicesOf] = useState<AdminUser | null>(null);
  const [erase, setErase] = useState<AdminUser | null>(null);
  const [handover, setHandover] = useState<AdminUser | null>(null);
  const [accessOf, setAccessOf] = useState<AdminUser | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'invited' | 'disabled'>('all');

  const load = useCallback(async () => {
    const [u, r] = await Promise.all([get('/admin/users'), get('/admin/roles')]);
    setData(u);
    setRoles(r.roles);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const update = async (u: AdminUser, body: object) => {
    if (await save(() => patch(`/admin/users/${u.id}`, body))) {
      await load();
      await reloadPeople();
    }
  };

  async function exportData(u: AdminUser) {
    const res = await fetch(`/api/admin/users/${u.id}/export`, { headers: { 'x-tendwell-device': getDeviceId() } });
    if (!res.ok) {
      toast(t('errors.server'), 'error');
      return;
    }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tendwell-personal-data-${u.name.replace(/\s+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (!data) return <div className="empty">{t('common.loading')}</div>;
  const needle = q.trim().toLocaleLowerCase();
  const shown = data.users.filter(
    (u) => (status === 'all' ? u.status !== 'deleted' : u.status === status) && (!needle || u.name.toLocaleLowerCase().includes(needle) || u.email.includes(needle)),
  );
  const viewers = data.users.filter((u) => u.seat === 'viewer' && u.status !== 'deleted' && u.status !== 'disabled').length;
  return (
    <>
      <div className="seat-summary">
        <div>
          <strong className="num">{data.seatsUsed}</strong>
          <span>{t('settings.people.paidSeats')}</span>
        </div>
        <div>
          <strong className="num">{viewers}</strong>
          <span>{t('settings.people.freeViewers')}</span>
        </div>
        <p className="field__hint">{t('settings.people.seatHint', { max: me.org.maxDevices })}</p>
      </div>
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <input className="input search" type="search" value={q} placeholder={t('settings.people.search')} aria-label={t('settings.people.search')} onChange={(e) => setQ(e.target.value)} />
        <select className="select" value={status} aria-label={t('settings.people.status')} onChange={(e) => setStatus(e.target.value as any)}>
          <option value="all">{t('settings.people.filter.all')}</option>
          <option value="active">{t('settings.people.status.active')}</option>
          <option value="invited">{t('settings.people.status.invited')}</option>
          <option value="disabled">{t('settings.people.status.disabled')}</option>
        </select>
        <div className="topbar__spacer" />
        <button className="btn btn--primary" onClick={() => setInvite(true)}>
          {t('settings.people.invite')}
        </button>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>{t('settings.people.name')}</th>
            <th>{t('settings.people.role')}</th>
            <th className="hide-phone">{t('settings.people.seat')}</th>
            <th>{t('settings.people.status')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                {t('settings.people.noMatch')}
              </td>
            </tr>
          )}
          {shown.map((u) => {
            const deleted = u.status === 'deleted';
            return (
              <tr key={u.id}>
                <td>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <Avatar person={u} />
                    <div>
                      <div style={{ fontWeight: 500 }}>{u.name}</div>
                      {!deleted && <div className="muted" style={{ fontSize: 12.5 }}>{u.email}</div>}
                    </div>
                  </div>
                </td>
                <td>
                  <select className="select" value={u.roleId} disabled={deleted} aria-label={t('settings.people.role')} onChange={(e) => update(u, { roleId: e.target.value })}>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="hide-phone">
                  <select className="select" value={u.seat} disabled={deleted} aria-label={t('settings.people.seat')} onChange={(e) => update(u, { seat: e.target.value })}>
                    <option value="full">{t('settings.people.seat.full')}</option>
                    <option value="viewer">{t('settings.people.seat.viewer')}</option>
                  </select>
                </td>
                <td>
                  <span className={`badge badge--${u.status}`}>{t(`settings.people.status.${u.status}`)}</span>
                </td>
                <td>
                  {!deleted && (
                    <RowMenu
                      label={t('settings.people.actions', { name: u.name })}
                      items={[
                        { label: t('settings.roles.whatCan'), onClick: () => setAccessOf(u) },
                        { label: t('settings.people.devices'), onClick: () => setDevicesOf(u) },
                        { label: t('settings.people.handover'), onClick: () => setHandover(u) },
                        ...(u.id !== me.user.id
                          ? [{ label: u.status === 'disabled' ? t('settings.people.enable') : t('settings.people.disable'), onClick: () => update(u, { status: u.status === 'disabled' ? 'active' : 'disabled' }) }]
                          : []),
                        { label: t('settings.people.export'), onClick: () => exportData(u) },
                        ...(u.id !== me.user.id ? [{ label: t('settings.people.erase'), danger: true, onClick: () => setErase(u) }] : []),
                      ]}
                    />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {invite && <InviteDialog roles={roles} teams={teams} onClose={() => setInvite(false)} onDone={async () => { await load(); await reloadPeople(); }} />}
      {devicesOf && <UserDevices user={devicesOf} onClose={() => setDevicesOf(null)} />}
      {accessOf && <AccessDialog userId={accessOf.id} roles={roles} onChanged={load} onClose={() => setAccessOf(null)} />}
      {handover && <HandoverDialog user={handover} users={data.users} onClose={() => setHandover(null)} />}
      {erase && (
        <Confirm
          title={t('settings.people.erase')}
          body={t('settings.people.eraseConfirm', { name: erase.name })}
          confirmLabel={t('settings.people.erase')}
          danger
          onClose={() => setErase(null)}
          onConfirm={async () => {
            if (await save(() => post(`/admin/users/${erase.id}/erase`))) {
              await load();
              await reloadPeople();
            }
          }}
        />
      )}
    </>
  );
}

function InviteDialog({ roles, teams, onClose, onDone }: { roles: Role[]; teams: { id: string; name: string }[]; onClose: () => void; onDone: () => Promise<void> }) {
  const { t } = useI18n();
  const { toast } = useStore();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [roleId, setRoleId] = useState(roles.find((r) => r.key === 'member')?.id ?? roles[0]?.id ?? '');
  const [seat, setSeat] = useState<'full' | 'viewer'>('full');
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    setError(null);
    try {
      await post('/admin/users', { email, name, roleId, seat, teamIds });
      toast(t('settings.people.invited', { email }));
      await onDone();
      onClose();
    } catch (e) {
      setError(e instanceof ApiFailure ? e.body.message : t('errors.server'));
    }
  }
  return (
    <Dialog
      title={t('settings.people.invite')}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--quiet" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn--primary" disabled={!email || !name} onClick={submit}>
            {t('settings.people.invite')}
          </button>
        </>
      }
    >
      {error && <div className="notice notice--error">{error}</div>}
      <label className="field">
        <span className="field__label">{t('settings.people.name')}</span>
        <input className="input" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span className="field__label">{t('settings.people.email')}</span>
        <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <div className="form__row">
        <label className="field">
          <span className="field__label">{t('settings.people.role')}</span>
          <select className="select" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">{t('settings.people.seat')}</span>
          <select className="select" value={seat} onChange={(e) => setSeat(e.target.value as 'full' | 'viewer')}>
            <option value="full">{t('settings.people.seat.full')}</option>
            <option value="viewer">{t('settings.people.seat.viewer')}</option>
          </select>
        </label>
      </div>
      {teams.length > 0 && (
        <div className="field">
          <span className="field__label">{t('settings.people.teams')}</span>
          {teams.map((tm) => (
            <label key={tm.id} className="checkbox">
              <input type="checkbox" checked={teamIds.includes(tm.id)} onChange={(e) => setTeamIds(e.target.checked ? [...teamIds, tm.id] : teamIds.filter((x) => x !== tm.id))} />
              <span>{tm.name}</span>
            </label>
          ))}
        </div>
      )}
    </Dialog>
  );
}

function UserDevices({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const { t } = useI18n();
  const [list, setList] = useState<SessionInfo[] | null>(null);
  const load = useCallback(() => get(`/admin/users/${user.id}/sessions`).then((r) => setList(r.sessions)), [user.id]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <Dialog title={`${t('settings.people.devices')}: ${user.name}`} onClose={onClose} footer={<button className="btn" onClick={onClose}>{t('common.close')}</button>}>
      {list?.length === 0 && <p className="muted">{t('common.none')}</p>}
      {list?.map((s) => (
        <div key={s.id} className="filerow">
          <div style={{ flex: 1 }}>
            <div>{s.deviceLabel || t('devices.unknown')}</div>
            <div className="muted" style={{ fontSize: 12.5 }}>{t('devices.lastSeen', { when: relativeTime(s.lastSeenAt, t) })}</div>
          </div>
          <button className="btn btn--small" onClick={async () => { await del(`/admin/sessions/${s.id}`); await load(); }}>
            {t('devices.signOut')}
          </button>
        </div>
      ))}
    </Dialog>
  );
}

function TeamsTab() {
  const { t } = useI18n();
  const { teams, people, reloadPeople } = useStore();
  const save = useSaver();
  const [name, setName] = useState('');
  const active = people.filter((p) => p.status !== 'deleted');
  return (
    <div style={{ maxWidth: 760 }}>
      <form
        className="toolbar"
        style={{ marginBottom: 14 }}
        onSubmit={async (e) => {
          e.preventDefault();
          if (await save(() => post('/admin/teams', { name, memberIds: [] }))) {
            setName('');
            await reloadPeople();
          }
        }}
      >
        <input className="input" style={{ maxWidth: 320 }} placeholder={t('settings.teams.new')} aria-label={t('settings.teams.new')} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn--primary" disabled={!name.trim()}>
          {t('common.create')}
        </button>
      </form>
      {teams.length === 0 && <div className="empty">{t('settings.teams.empty')}</div>}
      {teams.map((tm) => (
        <div className="sheet" key={tm.id}>
          <div className="toolbar" style={{ marginBottom: 12 }}>
            <h2 className="sheet__title" style={{ margin: 0 }}>{tm.name}</h2>
            <div className="topbar__spacer" />
            <button className="btn btn--small btn--danger" onClick={async () => { if (await save(() => del(`/admin/teams/${tm.id}`))) await reloadPeople(); }}>
              {t('common.delete')}
            </button>
          </div>
          <div className="form__row">
            <label className="field">
              <span className="field__label">{t('settings.teams.lead')}</span>
              <select className="select" value={tm.leadId ?? ''} onChange={async (e) => { if (await save(() => patch(`/admin/teams/${tm.id}`, { leadId: e.target.value || null }))) await reloadPeople(); }}>
                <option value="">{t('common.none')}</option>
                {active.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="field">
              <span className="field__label">{t('settings.teams.members')}</span>
              <PeoplePicker label={t('settings.teams.members')} people={active} value={tm.memberIds} max={500} onChange={async (ids) => { if (await save(() => patch(`/admin/teams/${tm.id}`, { memberIds: ids }), false)) await reloadPeople(); }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function AuditTab() {
  const { t, fmtDate } = useI18n();
  const { person } = useStore();
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  useEffect(() => {
    get('/admin/audit').then((r) => setEntries(r.entries));
  }, []);
  if (!entries) return <div className="empty">{t('common.loading')}</div>;
  if (!entries.length) return <div className="empty">{t('settings.audit.empty')}</div>;
  return (
    <table className="table" style={{ maxWidth: 900 }}>
      <thead>
        <tr>
          <th>{t('settings.audit.when')}</th>
          <th>{t('settings.audit.who')}</th>
          <th>{t('settings.audit.what')}</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e) => {
          const key = `audit.${e.action}` as any;
          const label = t(key);
          return (
            <tr key={e.id}>
              <td className="num muted">{fmtDate(e.at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
              <td>{person(e.actorId)?.name ?? t('common.unknownUser')}</td>
              <td>
                {label === key ? e.action : label}
                {e.staff && <span className="muted"> · {t('support.byStaff', { staff: e.staff })}</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function HandoverDialog({ user, users, onClose }: { user: AdminUser; users: AdminUser[]; onClose: () => void }) {
  const { t, words } = useI18n();
  const { toast } = useStore();
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const targets = users.filter((u) => u.id !== user.id && u.seat === 'full' && (u.status === 'active' || u.status === 'invited'));
  const run = async () => {
    setBusy(true);
    try {
      const r = await post<{ accounts: number; tasks: number }>(`/admin/users/${user.id}/handover`, { toUserId: to });
      toast(t('settings.people.handedOver', { accounts: r.accounts, tasks: r.tasks, name: targets.find((x) => x.id === to)?.name ?? '' }));
      onClose();
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      title={t('settings.people.handoverTitle', { name: user.name })}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--quiet" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn--primary" disabled={!to || busy} onClick={run}>
            {t('settings.people.handoverGo')}
          </button>
        </>
      }
    >
      <p className="sheet__hint">{t('settings.people.handoverHint', { accounts: words.other.toLocaleLowerCase() })}</p>
      <label className="field">
        <span className="field__label">{t('settings.people.handoverTo')}</span>
        <select className="select" value={to} onChange={(e) => setTo(e.target.value)}>
          <option value="" />
          {targets.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </label>
    </Dialog>
  );
}

// Who may join, and how: invitations, requests from the company's own
// domains (approved here), or joining straight away.
function JoiningTab() {
  const { t } = useI18n();
  const { me, reloadMe, reloadPeople, toast } = useStore();
  const save = useSaver();
  const [requests, setRequests] = useState<JoinRequest[] | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [roleFor, setRoleFor] = useState<Record<string, string>>({});
  const [domainEmail, setDomainEmail] = useState('');
  const [pendingDomain, setPendingDomain] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const load = useCallback(async () => {
    const [r, ro] = await Promise.all([get<{ requests: JoinRequest[] }>('/admin/join-requests'), get<{ roles: Role[] }>('/admin/roles')]);
    setRequests(r.requests);
    setRoles(ro.roles);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const memberRole = roles.find((r) => r.key === 'member')?.id ?? '';
  const decide = async (r: JoinRequest, ok: boolean) => {
    const roleId = roleFor[r.id] || memberRole;
    const role = roles.find((x) => x.id === roleId);
    if (
      await save(
        () => post(`/admin/join-requests/${r.id}/${ok ? 'approve' : 'reject'}`, ok ? { roleId, seat: role?.key === 'viewer' ? 'viewer' : 'full' } : {}),
        false,
      )
    ) {
      toast(ok ? t('join.approved', { name: r.name }) : t('join.declined', { name: r.name }));
      await load();
      await reloadPeople();
    }
  };
  const setPolicy = async (body: Record<string, boolean>) => {
    if (await save(() => patch('/admin/org', body))) await reloadMe();
  };
  const policy = me.org.autoJoin ? 'auto' : me.org.joinRequests ? 'requests' : 'invite';

  return (
    <div className="form" style={{ maxWidth: 760 }}>
      <section className="sheet">
        <h3 className="section__head">{t('join.requestsTitle', { n: requests?.length ?? 0 })}</h3>
        {!requests ? (
          <p className="muted">{t('common.loading')}</p>
        ) : requests.length === 0 ? (
          <p className="muted">{t('join.noRequests')}</p>
        ) : (
          <table className="table">
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.name}</strong>
                    <div className="muted">{r.email}</div>
                    {r.note && <div className="join-note">“{r.note}”</div>}
                  </td>
                  <td>
                    <select className="select" value={roleFor[r.id] || memberRole} aria-label={t('settings.people.role')} onChange={(e) => setRoleFor({ ...roleFor, [r.id]: e.target.value })}>
                      {roles.map((ro) => (
                        <option key={ro.id} value={ro.id}>
                          {ro.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <div className="inline-actions">
                      <button className="btn btn--small btn--primary" onClick={() => decide(r, true)}>
                        {t('join.approve')}
                      </button>
                      <button className="btn btn--small btn--quiet" onClick={() => decide(r, false)}>
                        {t('join.decline')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="sheet">
        <h3 className="section__head">{t('join.policyTitle')}</h3>
        <div className="choice-list" role="radiogroup" aria-label={t('join.policyTitle')}>
          {(
            [
              ['invite', t('join.policy.invite'), t('join.policy.inviteHint'), { joinRequests: false, autoJoin: false }],
              ['requests', t('join.policy.requests'), t('join.policy.requestsHint'), { joinRequests: true, autoJoin: false }],
              ['auto', t('join.policy.auto'), t('join.policy.autoHint'), { joinRequests: true, autoJoin: true }],
            ] as const
          ).map(([key, label, hint, body]) => (
            <label key={key} className="choice" data-on={policy === key ? 'true' : undefined}>
              <input type="radio" name="join-policy" checked={policy === key} onChange={() => setPolicy(body)} />
              <span>
                <strong>{label}</strong>
                <span className="muted">{hint}</span>
              </span>
            </label>
          ))}
        </div>
        {policy !== 'invite' && me.org.domains.length === 0 && <p className="notice">{t('join.needDomain')}</p>}
      </section>

      <section className="sheet">
        <h3 className="section__head">{t('join.domainsTitle')}</h3>
        <p className="sheet__hint">{t('join.domainsHint')}</p>
        <div className="chips-row">
          {me.org.domains.map((d) => (
            <span className="option-chip" key={d}>
              <span>@{d}</span>
              <button aria-label={t('common.remove')} onClick={async () => { if (await save(() => del(`/admin/domains/${d}`))) await reloadMe(); }}>
                ✕
              </button>
            </span>
          ))}
          {me.org.domains.length === 0 && <span className="muted">{t('join.noDomains')}</span>}
        </div>
        {pendingDomain ? (
          <div className="toolbar" style={{ marginTop: 12 }}>
            <span>{t('join.codeSent', { email: pendingDomain })}</span>
            <input className="input code-input" style={{ width: 120 }} inputMode="numeric" maxLength={6} value={code} aria-label={t('join.code')} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
            <button
              className="btn btn--small btn--primary"
              disabled={code.length !== 6}
              onClick={async () => {
                if (await save(() => post('/admin/domains/verify', { email: pendingDomain, code }))) {
                  setPendingDomain(null);
                  setCode('');
                  setDomainEmail('');
                  await reloadMe();
                }
              }}
            >
              {t('join.verify')}
            </button>
            <button className="btn btn--small btn--quiet" onClick={() => setPendingDomain(null)}>
              {t('common.cancel')}
            </button>
          </div>
        ) : (
          <div className="toolbar" style={{ marginTop: 12 }}>
            <input className="input" type="email" style={{ width: 260 }} value={domainEmail} placeholder={t('join.domainEmail')} aria-label={t('join.domainEmail')} onChange={(e) => setDomainEmail(e.target.value)} />
            <button
              className="btn btn--small"
              disabled={!domainEmail.includes('@')}
              onClick={async () => {
                try {
                  const r = await post<{ verified: boolean; devCode?: string }>('/admin/domains', { email: domainEmail.trim() });
                  if (r.verified) toast(t('join.alreadyVerified'));
                  else {
                    setPendingDomain(domainEmail.trim());
                    if (r.devCode) setCode(r.devCode);
                  }
                } catch (e) {
                  toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
                }
              }}
            >
              {t('join.sendCode')}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

/** The company logo: upload, replace, remove — it shows up wherever the company's name does. */
function LogoEditor() {
  const { t } = useI18n();
  const { me, reloadMe, toast } = useStore();
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_LOGO_KB * 1024 || !(LOGO_TYPES as readonly string[]).includes(file.type)) {
      toast(t('settings.company.logoBad'), 'error');
      return;
    }
    setBusy(true);
    const form = new FormData();
    form.append('file', file);
    try {
      await post('/admin/logo', form);
      await reloadMe();
      toast(t('settings.company.logoAdded'));
    } catch (e) {
      toast(e instanceof ApiFailure && e.code !== 'validation' ? e.body.message : t('settings.company.logoBad'), 'error');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  return (
    <div className="sheet logo-editor">
      <div className="logo-editor__preview" aria-hidden="true">
        {me.org.logoUrl ? <img src={me.org.logoUrl} alt="" /> : <Mark size={40} />}
      </div>
      <div className="logo-editor__body">
        <span className="field__label">{t('settings.company.logo')}</span>
        <span className="field__hint">{me.org.logoUrl ? t('settings.company.logoHint') : `${t('settings.company.logoNone')} ${t('settings.company.logoHint')}`}</span>
        <div className="inline-actions" style={{ justifyContent: 'flex-start' }}>
          <input ref={input} type="file" accept={LOGO_TYPES.join(',')} className="sr-only" aria-label={t('settings.company.logoUpload')} onChange={(e) => upload(e.target.files?.[0])} />
          <button type="button" className="btn btn--small" disabled={busy} onClick={() => input.current?.click()}>
            {me.org.logoUrl ? t('settings.company.logoReplace') : t('settings.company.logoUpload')}
          </button>
          {me.org.logoUrl && (
            <button
              type="button"
              className="btn btn--small btn--quiet"
              disabled={busy}
              onClick={async () => {
                await del('/admin/logo');
                await reloadMe();
              }}
            >
              {t('settings.company.logoRemove')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
