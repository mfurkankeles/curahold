// Settings → Departments: which departments the company has, who leads and who is in
// each, who sees each department's band on the customer page, and the record of the
// move into departments (where every board went, and the people still to place).
import { useCallback, useEffect, useState } from 'react';
import { DEPARTMENT_KEYS, type Department, type DepartmentKey, type DepartmentRole } from '../../../shared/src/model';
import { get, patch, post, put } from '../lib/api';
import { deptName } from '../lib/departments';
import { useI18n } from '../lib/i18n';
import { useSaver } from '../lib/saver';
import { useStore } from '../lib/store';
import { Switch } from './Automations';
import { EmptyState } from './Empty';
import { Icon } from './icons';
import { PeoplePicker } from './ui';

type Full = Department & { members: { userId: string; role: DepartmentRole }[]; boardCount: number | null };
interface Moves {
  boards: { boardId: string; name: string; departmentId: string; movedTo: string; reason: 'sprints' | 'name' | 'company'; personal: boolean }[];
  suggestions: { id: string; userId: string; departmentId: string; boards: number }[];
}

/** Settings: the company's departments, on or off, and their members and leads. */
export function DepartmentsTab() {
  const { t } = useI18n();
  const { people, can, reloadMe, reloadBoards, person } = useStore();
  const save = useSaver();
  const [list, setList] = useState<Full[] | null>(null);
  const [moves, setMoves] = useState<Moves | null>(null);
  const active = people.filter((p) => p.status !== 'deleted');
  const admin = can('org.manage');
  const name = (k: DepartmentKey) => deptName(t, k);

  const load = useCallback(async () => {
    const [d, m] = await Promise.all([get<{ departments: Full[] }>('/departments'), admin ? get<Moves>('/departments/moves') : Promise.resolve(null)]);
    setList(d.departments);
    setMoves(m);
  }, [admin]);
  useEffect(() => void load(), [load]);
  const after = async () => {
    await Promise.all([load(), reloadMe(), reloadBoards()]);
  };
  const done = async (ok: boolean) => {
    if (ok) await after();
  };

  if (!list) return <div className="empty">{t('common.loading')}</div>;
  const byId = (id: string) => list.find((d) => d.id === id);
  const setPeople = (d: Full, leadIds: string[], memberIds: string[]) => save(() => put(`/departments/${d.id}/people`, { leadIds, memberIds }), false).then(done);

  return (
    <div className="u-max-width-760">
      <p className="lede">{t('dept.settings.intro')}</p>
      {list.map((d) => {
        const leads = d.members.filter((m) => m.role === 'lead').map((m) => m.userId);
        const members = d.members.filter((m) => m.role === 'member').map((m) => m.userId);
        return (
          <section className="sheet dept-sheet" key={d.id} data-dept={d.key} data-off={!d.enabled || undefined} aria-label={name(d.key)}>
            <div className="dept-sheet__head">
              <h2 className="sheet__title u-m-0">{name(d.key)}</h2>
              {d.boardCount !== null && <span className="dept-sheet__count">{t('dept.settings.boards', { n: d.boardCount })}</span>}
              <div className="topbar__spacer" />
              {admin && (
                <label className="u-display-flex u-align-items-center u-gap-8">
                  <span className="small">{t('dept.settings.enabled')}</span>
                  <Switch on={d.enabled} label={t('dept.settings.enabled')} onChange={(on) => void save(() => patch(`/departments/${d.id}`, { enabled: on })).then(done)} />
                </label>
              )}
            </div>
            {!d.enabled && <div className="notice">{t('dept.settings.off')}</div>}
            <div className="dept-sheet__people">
              <div className="field">
                <span className="field__label">{t('dept.settings.leads')}</span>
                <PeoplePicker label={t('dept.settings.leads')} people={active} value={leads} max={50} onChange={(ids) => void setPeople(d, ids, members.filter((m) => !ids.includes(m)))} />
                <span className="field__hint">{t('dept.settings.leadsHint')}</span>
              </div>
              <div className="field">
                <span className="field__label">{t('dept.settings.members')}</span>
                <PeoplePicker label={t('dept.settings.members')} people={active.filter((p) => !leads.includes(p.id))} value={members} max={5000} onChange={(ids) => void setPeople(d, leads, ids)} />
              </div>
            </div>
            {admin && <BandChoice d={d} onSave={(bandView) => void save(() => patch(`/departments/${d.id}`, { bandView })).then(done)} />}
          </section>
        );
      })}

      {admin && moves && (
        <section className="sheet" aria-labelledby="dept-moves-h">
          <h2 className="sheet__title" id="dept-moves-h">
            <Icon name="history" size={18} className="icon--lead" />
            {t('dept.moves.title')}
          </h2>
          <p className="muted">{t('dept.moves.intro')}</p>
          {moves.suggestions.length > 0 && (
            <div className="u-mb-12">
              <div className="toolbar">
                <h3 className="faccess__h u-m-0">{t('dept.moves.suggest.title', { n: moves.suggestions.length })}</h3>
                <div className="topbar__spacer" />
                <button className="btn btn--small" onClick={() => void save(() => post('/departments/moves/accept', { ids: moves.suggestions.map((x) => x.id) })).then(done)}>
                  <Icon name="check" size={16} />
                  {t('dept.moves.acceptAll')}
                </button>
              </div>
              <p className="field__hint">{t('dept.moves.suggest.intro')}</p>
              {moves.suggestions.map((x) => {
                const d = byId(x.departmentId);
                return (
                  <div className="dept-suggest" key={x.id}>
                    <span className="dept-suggest__who">{person(x.userId)?.name ?? '—'}</span>
                    {d && <span className="deptmark" data-dept={d.key}>{name(d.key)}</span>}
                    <span className="muted small">{t('dept.moves.boards', { n: x.boards })}</span>
                    <button className="btn btn--small btn--quiet" onClick={() => void save(() => post('/departments/moves/accept', { ids: [x.id] })).then(done)}>
                      <Icon name="check" size={16} />
                      {t('dept.moves.accept')}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {moves.boards.length === 0 ? (
            <EmptyState compact icon="board" title={t('dept.moves.none')} />
          ) : (
            <table className="dept-moves">
              <thead>
                <tr>
                  <th>{t('dept.moves.board')}</th>
                  <th>{t('dept.moves.dept')}</th>
                  <th>{t('dept.moves.why')}</th>
                </tr>
              </thead>
              <tbody>
                {moves.boards.map((b) => (
                  <tr key={b.boardId}>
                    <td>
                      {b.name} {b.personal && <span className="badge">{t('dept.moves.personal')}</span>}
                    </td>
                    <td>
                      <select
                        className="select"
                        aria-label={t('dept.moves.dept')}
                        value={b.departmentId}
                        onChange={(e) => void save(() => patch(`/boards/${b.boardId}`, { departmentId: e.target.value })).then(done)}
                      >
                        {list.filter((d) => d.enabled || d.id === b.departmentId).map((d) => (
                          <option key={d.id} value={d.id}>
                            {name(d.key)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="muted">{t(`dept.moves.reason.${b.reason}`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}

/** Who sees this department's band on the shared customer page: every department, or the ones chosen. */
function BandChoice({ d, onSave }: { d: Department; onSave: (v: DepartmentKey[] | null) => void }) {
  const { t } = useI18n();
  const chosen = d.bandView;
  const toggle = (k: DepartmentKey) => {
    const now = chosen ?? [];
    const next = now.includes(k) ? now.filter((x) => x !== k) : [...now, k];
    onSave(next.length ? next : [d.key]);
  };
  return (
    <div className="field dept-sheet__band">
      <span className="field__label">{t('dept.settings.band', { dept: deptName(t, d.key) })}</span>
      <div className="seg" role="group" aria-label={t('dept.settings.band', { dept: deptName(t, d.key) })}>
        <button aria-pressed={!chosen} onClick={() => onSave(null)}>
          {t('dept.settings.bandAll')}
        </button>
        <button aria-pressed={!!chosen} onClick={() => !chosen && onSave([d.key])}>
          {t('dept.settings.bandChosen')}
        </button>
      </div>
      {chosen && (
        <div className="chips-row">
          {DEPARTMENT_KEYS.map((k) => (
            <button key={k} className="rolechip" aria-pressed={chosen.includes(k)} onClick={() => toggle(k)}>
              {deptName(t, k)}
            </button>
          ))}
        </div>
      )}
      <span className="field__hint">{t('dept.settings.bandHint')}</span>
    </div>
  );
}
