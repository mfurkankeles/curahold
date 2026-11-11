// Company settings: the company itself, people (with devices and the
// KVKK/GDPR tools), teams, roles and the activity log.
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { Locale } from '../../../shared/src/i18n';
import { PERMS, type AdminUser, type AuditEntry, type Role, type SessionInfo } from '../../../shared/src/model';
import { Avatar, Confirm, Dialog, PeoplePicker } from '../components/ui';
import { ApiFailure, del, get, patch, post } from '../lib/api';
import { getDeviceId } from '../lib/device';
import { useI18n } from '../lib/i18n';
import { navigate } from '../lib/router';
import { useStore } from '../lib/store';
import { relativeTime } from '../lib/time';

type Tab = 'company' | 'people' | 'teams' | 'roles' | 'audit';

export function SettingsPage({ tab }: { tab: Tab }) {
  const { t } = useI18n();
  const { can } = useStore();
  const tabs: [Tab, string, boolean][] = [
    ['company', t('settings.tab.company'), can('org.manage')],
    ['people', t('settings.tab.people'), can('users.manage')],
    ['teams', t('settings.tab.teams'), can('teams.manage')],
    ['roles', t('settings.tab.roles'), can('org.manage')],
    ['audit', t('settings.tab.audit'), can('audit.view')],
  ];
  const allowed = tabs.filter((x) => x[2]);
  const current = allowed.find((x) => x[0] === tab)?.[0] ?? allowed[0]?.[0];
  return (
    <>
      <header className="topbar">
        <h1 className="topbar__title">{t('settings.title')}</h1>
      </header>
      <div className="page">
        <div className="tabs" role="tablist">
          {allowed.map(([key, label]) => (
            <button key={key} role="tab" className="tab" aria-selected={key === current} onClick={() => navigate(`/settings/${key}`)}>
              {label}
            </button>
          ))}
        </div>
        {current === 'company' && <CompanyTab />}
        {current === 'people' && <PeopleTab />}
        {current === 'teams' && <TeamsTab />}
        {current === 'roles' && <RolesTab />}
        {current === 'audit' && <AuditTab />}
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

function CompanyTab() {
  const { t } = useI18n();
  const { me, reloadMe } = useStore();
  const save = useSaver();
  const [name, setName] = useState(me.org.name);
  const [locale, setLocale] = useState<Locale>(me.org.locale);
  const [tz, setTz] = useState(me.org.timezone);
  const [terms, setTerms] = useState({
    en: { one: me.org.terms.account?.en?.one ?? '', other: me.org.terms.account?.en?.other ?? '' },
    tr: { one: me.org.terms.account?.tr?.one ?? '', other: me.org.terms.account?.tr?.other ?? '' },
  });
  const zones = TIMEZONES.includes(tz) ? TIMEZONES : [tz, ...TIMEZONES];

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (await save(() => patch('/admin/org', { name, locale, timezone: tz, terms: { account: terms } }))) await reloadMe();
  }
  const word = (l: Locale, k: 'one' | 'other', label: string) => (
    <label className="field">
      <span className="field__label">{label}</span>
      <input className="input" maxLength={40} value={terms[l][k]} placeholder={l === 'tr' ? (k === 'one' ? 'Müşteri' : 'Müşteriler') : k === 'one' ? 'Account' : 'Accounts'} onChange={(e) => setTerms({ ...terms, [l]: { ...terms[l], [k]: e.target.value } })} />
    </label>
  );
  return (
    <form className="form" onSubmit={submit}>
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
        <button className="btn btn--primary">{t('common.save')}</button>
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
  return (
    <>
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <span className="muted num">{t('settings.people.seatsUsed', { used: data.seatsUsed })}</span>
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
          {data.users.map((u) => {
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
                    <div className="inline-actions">
                      <button className="btn btn--small" onClick={() => setDevicesOf(u)}>
                        {t('settings.people.devices')}
                      </button>
                      {u.id !== me.user.id && (
                        <button className="btn btn--small" onClick={() => update(u, { status: u.status === 'disabled' ? 'active' : 'disabled' })}>
                          {u.status === 'disabled' ? t('settings.people.enable') : t('settings.people.disable')}
                        </button>
                      )}
                      <button className="btn btn--small" onClick={() => exportData(u)}>
                        {t('settings.people.export')}
                      </button>
                      {u.id !== me.user.id && (
                        <button className="btn btn--small btn--danger" onClick={() => setErase(u)}>
                          {t('settings.people.erase')}
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {invite && <InviteDialog roles={roles} teams={teams} onClose={() => setInvite(false)} onDone={async () => { await load(); await reloadPeople(); }} />}
      {devicesOf && <UserDevices user={devicesOf} onClose={() => setDevicesOf(null)} />}
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

function RolesTab() {
  const { t } = useI18n();
  const save = useSaver();
  const [roles, setRoles] = useState<Role[]>([]);
  const [creating, setCreating] = useState(false);
  const load = useCallback(() => get('/admin/roles').then((r) => setRoles(r.roles)), []);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <div style={{ maxWidth: 760 }}>
      <button className="btn btn--primary" style={{ marginBottom: 14 }} onClick={() => setCreating(true)}>
        {t('settings.roles.new')}
      </button>
      {roles.map((r) => (
        <div className="sheet" key={r.id}>
          <div className="toolbar" style={{ marginBottom: 10 }}>
            <input className="input" style={{ maxWidth: 280, fontWeight: 600 }} defaultValue={r.name} aria-label={t('settings.people.name')} onBlur={(e) => e.target.value.trim() && e.target.value !== r.name && save(() => patch(`/admin/roles/${r.id}`, { name: e.target.value.trim() })).then(load)} />
            {r.system && <span className="badge">{t('settings.roles.system')}</span>}
            <div className="topbar__spacer" />
            {!r.system && (
              <button className="btn btn--small btn--danger" onClick={() => save(() => del(`/admin/roles/${r.id}`)).then(load)}>
                {t('common.delete')}
              </button>
            )}
          </div>
          <div className="perms">
            {PERMS.map((p) => (
              <label key={p} className="checkbox">
                <input
                  type="checkbox"
                  checked={r.perms.includes(p)}
                  disabled={r.key === 'admin'}
                  onChange={(e) => save(() => patch(`/admin/roles/${r.id}`, { perms: e.target.checked ? [...r.perms, p] : r.perms.filter((x) => x !== p) }), false).then(load)}
                />
                <span>{t(`perm.${p}`)}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
      {creating && <NewRole onClose={() => setCreating(false)} onDone={load} />}
    </div>
  );
}

function NewRole({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const key = name.toLocaleLowerCase('en').normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'role';
  return (
    <Dialog
      title={t('settings.roles.new')}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--quiet" onClick={onClose}>{t('common.cancel')}</button>
          <button
            className="btn btn--primary"
            disabled={!name.trim()}
            onClick={async () => {
              try {
                await post('/admin/roles', { key: /^[a-z]/.test(key) ? key : `r-${key}`, name: name.trim(), perms: [] });
                onDone();
                onClose();
              } catch (e) {
                setError(e instanceof ApiFailure ? e.body.message : t('errors.server'));
              }
            }}
          >
            {t('common.create')}
          </button>
        </>
      }
    >
      {error && <div className="notice notice--error">{error}</div>}
      <label className="field">
        <span className="field__label">{t('settings.people.name')}</span>
        <input className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
      </label>
    </Dialog>
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
              <td>{label === key ? e.action : label}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
