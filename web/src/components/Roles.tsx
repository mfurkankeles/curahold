// Roles and permissions: a grid of what each role may do, starting points
// for new roles, and "who can do what" — by permission or by person.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ACCOUNT_SCOPES, GRANT_PERMS, PERM_GROUPS, ROLE_PRESETS, scopeOf, withScope, type AccountScope, type Perm, type PersonAccess, type Role, type Seat, type UserStatus } from '../../../shared/src/model';
import { compareText } from '../../../shared/src/text';
import { startPreview } from '../lib/api';
import { ApiFailure, del, get, patch, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useStore } from '../lib/store';
import { Avatar, Dialog, RowMenu } from './ui';

interface AccessPerson {
  id: string;
  name: string;
  email: string;
  seat: Seat;
  status: UserStatus;
  roleId: string;
  teamIds: string[];
}

const SYSTEM_ORDER = ['admin', 'manager', 'member', 'viewer'];
/** Built-in roles from most to least rights, then the company's own by name. */
const byRank = (a: Role, b: Role) => {
  const x = SYSTEM_ORDER.indexOf(a.key);
  const y = SYSTEM_ORDER.indexOf(b.key);
  if (a.system && b.system) return x - y;
  if (a.system !== b.system) return a.system ? -1 : 1;
  return compareText(a.name, b.name, document.documentElement.lang || 'en');
};

function useAccess() {
  const [data, setData] = useState<{ roles: Role[]; people: AccessPerson[] } | null>(null);
  const load = useCallback(() => get<{ roles: Role[]; people: AccessPerson[] }>('/admin/access').then((r) => setData({ ...r, roles: [...r.roles].sort(byRank) })), []);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, load };
}

/** People who count: active or invited (disabled people can do nothing). */
const counts = (p: AccessPerson) => p.status === 'active' || p.status === 'invited';

export function RolesTab() {
  const { t } = useI18n();
  const { can } = useStore();
  const { data, load } = useAccess();
  const [view, setView] = useState<'roles' | 'people'>('roles');
  if (!data) return <div className="empty">{t('common.loading')}</div>;
  return (
    <div className="roles">
      <p className="lede">{t('settings.roles.intro')}</p>
      <div className="toolbar" style={{ marginBottom: 14 }}>
        <div className="seg" role="group" aria-label={t('settings.roles.view')}>
          <button aria-pressed={view === 'roles'} onClick={() => setView('roles')}>
            {t('settings.roles.byRole')}
          </button>
          <button aria-pressed={view === 'people'} onClick={() => setView('people')}>
            {t('settings.roles.byPerson')}
          </button>
        </div>
      </div>
      {view === 'roles' ? <RoleGrid roles={data.roles} people={data.people} reload={load} editable={can('org.manage')} /> : <PeopleAccess roles={data.roles} people={data.people} reload={load} />}
    </div>
  );
}

function RoleGrid({ roles, people, reload, editable }: { roles: Role[]; people: AccessPerson[]; reload: () => Promise<unknown>; editable: boolean }) {
  const { t } = useI18n();
  const { toast } = useStore();
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<Role | null>(null);
  const [removing, setRemoving] = useState<Role | null>(null);
  const [who, setWho] = useState<{ title: string; people: AccessPerson[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const inRole = (r: Role) => people.filter((p) => p.roleId === r.id && counts(p));
  const holders = (perm: Perm) => people.filter((p) => counts(p) && roles.find((r) => r.id === p.roleId)?.perms.includes(perm));

  async function toggle(r: Role, perm: Perm, on: boolean) {
    await savePerms(r, on ? [...r.perms, perm] : r.perms.filter((x) => x !== perm), `${r.id}:${perm}`);
  }
  async function setScope(r: Role, scope: AccountScope) {
    await savePerms(r, withScope(r.perms, scope), `${r.id}:scope`);
  }
  async function savePerms(r: Role, perms: Perm[], key: string) {
    setBusy(key);
    try {
      await patch(`/admin/roles/${r.id}`, { perms });
      await reload();
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="table-wrap">
        <table className="table matrix">
          <thead>
            <tr>
              <th scope="col" className="matrix__perm">{t('settings.roles.perms')}</th>
              {roles.map((r) => {
                const members = inRole(r);
                return (
                  <th scope="col" key={r.id} className="matrix__role">
                    <div className="matrix__rolehead">
                      <span className="matrix__rolename">{r.name}</span>
                      {editable && (
                        <RowMenu
                          label={t('settings.roles.actions', { name: r.name })}
                          items={[
                            { label: t('settings.roles.rename'), onClick: () => setRenaming(r) },
                            ...(r.system ? [] : [{ label: t('common.delete'), danger: true, onClick: () => setRemoving(r) }]),
                          ]}
                        />
                      )}
                    </div>
                    <button className="linkbtn matrix__count" onClick={() => setWho({ title: t('settings.roles.inRole', { role: r.name }), people: members })}>
                      {t('settings.roles.people', { n: members.length })}
                    </button>
                  </th>
                );
              })}
              <th scope="col" className="matrix__who">{t('settings.roles.whoHas')}</th>
            </tr>
          </thead>
          <tbody>
            {PERM_GROUPS.map((g) => (
              <Group key={g.key} label={t(`settings.roles.group.${g.key}` as any)} span={roles.length + 2}>
                {g.key === 'accounts' && (
                  <tr>
                    <th scope="row" className="matrix__perm">
                      <div className="matrix__label">{t('settings.roles.scope')}</div>
                      <div className="matrix__hint">{t('settings.roles.scope.hint')}</div>
                    </th>
                    {roles.map((r) => (
                      <td key={r.id} className="matrix__cell">
                        <select
                          className="select matrix__scope"
                          value={scopeOf(r.perms)}
                          disabled={r.key === 'admin' || !editable || busy === `${r.id}:scope`}
                          aria-label={`${r.name}: ${t('settings.roles.scope')}`}
                          onChange={(e) => setScope(r, e.target.value as AccountScope)}
                        >
                          {ACCOUNT_SCOPES.map((sc) => (
                            <option key={sc} value={sc}>
                              {t(`settings.roles.scope.${sc}` as any)}
                            </option>
                          ))}
                        </select>
                      </td>
                    ))}
                    <td className="matrix__who" />
                  </tr>
                )}
                {g.perms.map((perm) => {
                  const h = holders(perm);
                  return (
                    <tr key={perm}>
                      <th scope="row" className="matrix__perm">
                        <div className="matrix__label">{t(`perm.${perm}` as any)}</div>
                        <div className="matrix__hint">{t(`perm.${perm}.hint` as any)}</div>
                      </th>
                      {roles.map((r) => {
                        const locked = r.key === 'admin' || !editable;
                        return (
                          <td key={r.id} className="matrix__cell">
                            <input
                              type="checkbox"
                              checked={r.perms.includes(perm)}
                              disabled={locked || busy === `${r.id}:${perm}`}
                              title={r.key === 'admin' ? t('settings.roles.adminLocked') : undefined}
                              aria-label={`${r.name}: ${t(`perm.${perm}` as any)}`}
                              onChange={(e) => toggle(r, perm, e.target.checked)}
                            />
                          </td>
                        );
                      })}
                      <td className="matrix__who">
                        <button className="linkbtn" onClick={() => setWho({ title: t('settings.roles.whoHasTitle', { perm: t(`perm.${perm}` as any) }), people: h })}>
                          {t('settings.roles.people', { n: h.length })}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </Group>
            ))}
          </tbody>
        </table>
      </div>
      <p className="field__hint" style={{ marginTop: 10 }}>{t('settings.roles.baseline')}</p>
      {editable && (
        <button className="btn btn--primary" style={{ marginTop: 6 }} onClick={() => setAdding(true)}>
          {t('settings.roles.new')}
        </button>
      )}
      {adding && <NewRole roles={roles} onClose={() => setAdding(false)} onDone={reload} />}
      {renaming && <RenameRole role={renaming} onClose={() => setRenaming(null)} onDone={reload} />}
      {removing && <RemoveRole role={removing} roles={roles} members={inRole(removing)} onClose={() => setRemoving(null)} onDone={reload} />}
      {who && <PeopleList title={who.title} people={who.people} roles={roles} onClose={() => setWho(null)} />}
    </>
  );
}

function Group({ label, span, children }: { label: string; span: number; children: React.ReactNode }) {
  return (
    <>
      <tr className="matrix__group">
        <th scope="rowgroup" colSpan={span}>
          {label}
        </th>
      </tr>
      {children}
    </>
  );
}

function PeopleList({ title, people, roles, onClose }: { title: string; people: AccessPerson[]; roles: Role[]; onClose: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Dialog title={title} onClose={onClose}>
      {people.length === 0 ? (
        <p className="muted">{t('settings.roles.nobody')}</p>
      ) : (
        <ul className="plainlist">
          {people.map((p) => (
            <li key={p.id} className="personrow">
              <Avatar person={p} />
              <div className="personrow__text">
                <div>{p.name}</div>
                <div className="muted">{roles.find((r) => r.id === p.roleId)?.name}</div>
              </div>
              <button className="btn btn--small" onClick={() => setOpen(p.id)}>
                {t('settings.roles.whatCan')}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && <AccessDialog userId={open} onClose={() => setOpen(null)} />}
    </Dialog>
  );
}

function PeopleAccess({ roles, people, reload }: { roles: Role[]; people: AccessPerson[]; reload: () => Promise<unknown> }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const needle = q.trim().toLocaleLowerCase();
  const shown = people.filter((p) => (!role || p.roleId === role) && (!needle || p.name.toLocaleLowerCase().includes(needle) || p.email.includes(needle)));
  return (
    <>
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <input className="input search" type="search" value={q} placeholder={t('settings.people.search')} aria-label={t('settings.people.search')} onChange={(e) => setQ(e.target.value)} />
        <select className="select" value={role} aria-label={t('settings.people.role')} onChange={(e) => setRole(e.target.value)}>
          <option value="">{t('settings.roles.allRoles')}</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>{t('settings.people.name')}</th>
            <th>{t('settings.people.role')}</th>
            <th className="hide-phone">{t('settings.roles.canDo')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">
                {t('settings.people.noMatch')}
              </td>
            </tr>
          )}
          {shown.map((p) => {
            const r = roles.find((x) => x.id === p.roleId);
            const n = r?.perms.filter((x) => GRANT_PERMS.includes(x)).length ?? 0;
            return (
              <tr key={p.id}>
                <td>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <Avatar person={p} />
                    <div>
                      <div style={{ fontWeight: 500 }}>{p.name}</div>
                      <div className="muted" style={{ fontSize: 12.5 }}>
                        {p.email}
                      </div>
                    </div>
                  </div>
                </td>
                <td>
                  {r?.name}
                  {p.seat === 'viewer' && <span className="badge" style={{ marginLeft: 6 }}>{t('settings.people.seat.viewer')}</span>}
                  {p.status !== 'active' && <span className={`badge badge--${p.status}`} style={{ marginLeft: 6 }}>{t(`settings.people.status.${p.status}` as any)}</span>}
                </td>
                <td className="hide-phone muted">
                  {n === GRANT_PERMS.length ? t('settings.roles.everything') : n === 0 ? t('settings.roles.dailyOnly') : t('settings.roles.permCount', { n, total: GRANT_PERMS.length })}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn btn--small" onClick={() => setOpen(p.id)}>
                    {t('settings.roles.whatCan')}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {open && <AccessDialog userId={open} roles={roles} onChanged={reload} onClose={() => setOpen(null)} />}
    </>
  );
}

/** Everything one person can do, in plain words, with their role changeable on the spot. */
export function AccessDialog({ userId, roles, onChanged, onClose }: { userId: string; roles?: Role[]; onChanged?: () => unknown; onClose: () => void }) {
  const { t } = useI18n();
  const { can, toast, me, reloadPeople } = useStore();
  const [data, setData] = useState<{ access: PersonAccess; hiddenBoards: number } | null>(null);
  const [roleList, setRoleList] = useState<Role[]>(roles ?? []);
  const load = useCallback(() => get<{ access: PersonAccess; hiddenBoards: number }>(`/admin/users/${userId}/access`).then(setData), [userId]);
  useEffect(() => {
    void load();
    if (!roles) get<{ roles: Role[] }>('/admin/roles').then((r) => setRoleList(r.roles));
  }, [load, roles]);
  const granted = useMemo(() => new Set((data?.access.perms ?? []).filter((p) => GRANT_PERMS.includes(p))), [data]);

  async function changeRole(roleId: string) {
    try {
      await patch(`/admin/users/${userId}`, { roleId });
      toast(t('common.saved'));
      await load();
      await onChanged?.();
      await reloadPeople();
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    }
  }

  const a = data?.access;
  return (
    <Dialog title={a ? t('settings.roles.accessOf', { name: a.name }) : t('common.loading')} onClose={onClose} wide>
      {!a ? (
        <div className="empty">{t('common.loading')}</div>
      ) : (
        <div className="access">
          <div className="access__who">
            <Avatar person={{ id: a.userId, name: a.name, email: a.email, seat: a.seat, status: a.status }} large />
            <div>
              <div className="access__name">{a.name}</div>
              <div className="muted">{a.email}</div>
            </div>
            <label className="field access__role">
              <span className="field__label">{t('settings.people.role')}</span>
              <select className="select" value={a.roleId} disabled={!can('users.manage') || a.userId === me.user.id} onChange={(e) => changeRole(e.target.value)}>
                {roleList.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p className="access__daily">{a.seat === 'viewer' ? t('settings.roles.viewerSeat') : t('settings.roles.fullSeat')}</p>

          <section>
            <h3 className="access__h">{t('settings.roles.reach')}</h3>
            <p className="access__reach">{t(`settings.roles.reach.${scopeOf(a.perms)}` as any)}</p>
          </section>

          {can('org.manage') && a.userId !== me.user.id && a.status === 'active' && (
            <div className="access__preview">
              <div>
                <div className="access__previewtitle">{t('preview.button', { name: a.name })}</div>
                <div className="field__hint">{t('preview.explain')}</div>
              </div>
              <button className="btn" onClick={() => startPreview(a.userId, a.name)}>
                {t('preview.start')}
              </button>
            </div>
          )}

          <section>
            <h3 className="access__h">{t('settings.roles.inCompany')}</h3>
            {granted.size === 0 ? (
              <p className="muted">{t('settings.roles.noExtra')}</p>
            ) : (
              <ul className="access__perms">
                {PERM_GROUPS.flatMap((g) => g.perms)
                  .filter((p) => granted.has(p))
                  .map((p) => (
                    <li key={p} className="is-yes">
                      <span aria-hidden="true">✓</span>
                      <span>{t(`perm.${p}` as any)}</span>
                    </li>
                  ))}
              </ul>
            )}
            {granted.size < GRANT_PERMS.length && (
              <details className="access__not">
                <summary>{t('settings.roles.cannot', { n: GRANT_PERMS.length - granted.size })}</summary>
                <ul className="access__perms">
                  {PERM_GROUPS.flatMap((g) => g.perms)
                    .filter((p) => !granted.has(p))
                    .map((p) => (
                      <li key={p} className="is-no">
                        <span aria-hidden="true">–</span>
                        <span>{t(`perm.${p}` as any)}</span>
                      </li>
                    ))}
                </ul>
              </details>
            )}
          </section>

          <section>
            <h3 className="access__h">{t('settings.roles.teams')}</h3>
            {a.teams.length === 0 ? (
              <p className="muted">{t('settings.roles.noTeams')}</p>
            ) : (
              <div className="chips-row">
                {a.teams.map((tm) => (
                  <span key={tm.id} className="badge">
                    {tm.name}
                    {tm.lead && <em> · {t('settings.roles.lead')}</em>}
                  </span>
                ))}
              </div>
            )}
          </section>

          <section>
            <h3 className="access__h">{t('settings.roles.boards', { n: a.boards.length + data!.hiddenBoards })}</h3>
            {a.boards.length === 0 && !data!.hiddenBoards ? (
              <p className="muted">{t('settings.roles.noBoards')}</p>
            ) : (
              <ul className="plainlist access__boards">
                {a.boards.map((b) => (
                  <li key={b.id}>
                    <span className="access__board">{b.name}</span>
                    <span className="muted">{t(`settings.roles.via.${b.via}` as any)}</span>
                    <span className={`badge level--${b.level}`}>{t(`settings.roles.level.${b.level}` as any)}</span>
                  </li>
                ))}
                {data!.hiddenBoards > 0 && <li className="muted">{t('settings.roles.boardsHidden', { n: data!.hiddenBoards })}</li>}
              </ul>
            )}
          </section>
        </div>
      )}
    </Dialog>
  );
}

const slugKey = (name: string) => {
  const k = name.toLocaleLowerCase('en').normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'role';
  return /^[a-z]/.test(k) ? k : `r-${k}`;
};

function NewRole({ roles, onClose, onDone }: { roles: Role[]; onClose: () => void; onDone: () => unknown }) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [start, setStart] = useState('preset:blank');
  const [error, setError] = useState<string | null>(null);
  const perms: Perm[] = start.startsWith('preset:')
    ? ROLE_PRESETS.find((p) => `preset:${p.key}` === start)?.perms ?? []
    : roles.find((r) => `role:${r.id}` === start)?.perms ?? [];
  return (
    <Dialog
      title={t('settings.roles.new')}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--quiet" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="btn btn--primary"
            disabled={!name.trim()}
            onClick={async () => {
              const base = slugKey(name);
              const taken = new Set(roles.map((r) => r.key));
              let key = base;
              for (let i = 2; taken.has(key); i++) key = `${base}-${i}`;
              try {
                await post('/admin/roles', { key, name: name.trim(), perms });
                await onDone();
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
        <span className="field__label">{t('settings.roles.name')}</span>
        <input className="input" value={name} maxLength={60} autoFocus placeholder={t('settings.roles.namePlaceholder')} onChange={(e) => setName(e.target.value)} />
      </label>
      <fieldset className="field">
        <legend className="field__label">{t('settings.roles.startFrom')}</legend>
        <div className="choice-list">
          {ROLE_PRESETS.map((p) => (
            <label key={p.key} className="choice" data-on={start === `preset:${p.key}` || undefined}>
              <input type="radio" name="start" checked={start === `preset:${p.key}`} onChange={() => setStart(`preset:${p.key}`)} />
              <span>
                <strong>{t(`settings.roles.preset.${p.key}` as any)}</strong>
                <span className="muted">{t(`settings.roles.preset.${p.key}.hint` as any)}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="field">
        <span className="field__label">{t('settings.roles.copyRole')}</span>
        <select className="select" value={start.startsWith('role:') ? start : ''} onChange={(e) => setStart(e.target.value || 'preset:blank')}>
          <option value="">{t('settings.roles.copyNone')}</option>
          {roles.map((r) => (
            <option key={r.id} value={`role:${r.id}`}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      <div className="field__hint">
        {perms.length === 0 ? t('settings.roles.dailyOnly') : `${t('settings.roles.willHave')} ${perms.map((p) => t(`perm.${p}` as any)).join(', ')}`}
      </div>
    </Dialog>
  );
}

function RenameRole({ role, onClose, onDone }: { role: Role; onClose: () => void; onDone: () => unknown }) {
  const { t } = useI18n();
  const { toast } = useStore();
  const [name, setName] = useState(role.name);
  return (
    <Dialog
      title={t('settings.roles.rename')}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--quiet" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="btn btn--primary"
            disabled={!name.trim() || name.trim() === role.name}
            onClick={async () => {
              try {
                await patch(`/admin/roles/${role.id}`, { name: name.trim() });
                await onDone();
                onClose();
              } catch (e) {
                toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
              }
            }}
          >
            {t('common.save')}
          </button>
        </>
      }
    >
      <label className="field">
        <span className="field__label">{t('settings.roles.name')}</span>
        <input className="input" value={name} maxLength={60} autoFocus onChange={(e) => setName(e.target.value)} />
      </label>
    </Dialog>
  );
}

function RemoveRole({ role, roles, members, onClose, onDone }: { role: Role; roles: Role[]; members: AccessPerson[]; onClose: () => void; onDone: () => unknown }) {
  const { t } = useI18n();
  const { toast } = useStore();
  const others = roles.filter((r) => r.id !== role.id);
  const [moveTo, setMoveTo] = useState(others.find((r) => r.key === 'member')?.id ?? others[0]?.id ?? '');
  return (
    <Dialog
      title={t('settings.roles.deleteTitle', { name: role.name })}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--quiet" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="btn btn--danger"
            onClick={async () => {
              try {
                await del(`/admin/roles/${role.id}${members.length ? `?moveTo=${moveTo}` : ''}`);
                toast(t('settings.roles.deleted'));
                await onDone();
                onClose();
              } catch (e) {
                toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
              }
            }}
          >
            {members.length ? t('settings.roles.moveAndDelete') : t('common.delete')}
          </button>
        </>
      }
    >
      {members.length === 0 ? (
        <p>{t('settings.roles.deleteEmpty')}</p>
      ) : (
        <>
          <p>{t('settings.roles.deleteInUse', { n: members.length })}</p>
          <label className="field">
            <span className="field__label">{t('settings.roles.moveTo')}</span>
            <select className="select" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
              {others.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
    </Dialog>
  );
}
