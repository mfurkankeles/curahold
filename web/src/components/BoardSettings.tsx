// Create a board, or change its name, who sees it and its columns.
import { useEffect, useState } from 'react';
import type { Board, BoardNotify, Column, Connection, Visibility } from '../../../shared/src/model';
import { ApiFailure, del, get, patch, post, put } from '../lib/api';
import { PORTAL_FIELDS, type BoardPortal, type PortalField, type PortalSettings } from '../../../shared/src/portal';
import { useI18n } from '../lib/i18n';
import { navigate } from '../lib/router';
import { useStore } from '../lib/store';
import { PROVIDER_NAMES } from './Connections';
import { Confirm, Dialog, PeoplePicker } from './ui';
import { BoardFormEditor, TaskFieldsEditor } from './BoardFields';
import type { BoardForm, TaskField } from '../../../shared/src/model';
import { pmColumns } from '../../../shared/src/templates';

const slug = (s: string, taken: Set<string>) => {
  let base = s.toLocaleLowerCase('en').normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'col';
  let k = base;
  let i = 2;
  while (taken.has(k)) k = `${base}-${i++}`.slice(0, 24);
  return k;
};

export function BoardSettings({ board, onClose }: { board?: Board; onClose: () => void }) {
  const { t, locale } = useI18n();
  const { me, teams, people, can, reloadBoards, toast } = useStore();
  const myTeams = teams.filter((tm) => tm.memberIds.includes(me.user.id) || tm.leadId === me.user.id || can('teams.manage') || can('boards.manage_all'));
  const [name, setName] = useState(board?.name ?? '');
  const [visibility, setVisibility] = useState<Visibility>(board?.visibility ?? (myTeams.length ? 'team' : 'private'));
  const [teamId, setTeamId] = useState<string | null>(board?.teamId ?? myTeams[0]?.id ?? null);
  const [memberIds, setMemberIds] = useState<string[]>(board?.memberIds ?? []);
  const [columns, setColumns] = useState<Column[] | null>(board ? board.columns : null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [archive, setArchive] = useState(false);
  const [notify, setNotify] = useState<BoardNotify[]>(board?.notify ?? []);
  const [taskFields, setTaskFields] = useState<TaskField[]>(board?.taskFields ?? []);
  const [form, setForm] = useState<BoardForm | null>(board?.form ?? null);
  const [keepDays, setKeepDays] = useState<number | null>(board ? board.archiveDays : 90);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const cleanFields = taskFields.filter((f) => (f.label.en ?? f.label.tr ?? '').trim()).map((f) => (f.type === 'select' ? f : { ...f, options: undefined }));
      const payload = { name, visibility, teamId: visibility === 'team' ? teamId : null, memberIds, ...(columns ? { columns } : {}), archiveDays: keepDays, ...(board ? { notify, taskFields: cleanFields, form: form ? { ...form, fields: form.fields.filter((k) => !k.startsWith('f:') || cleanFields.some((f) => `f:${f.key}` === k)) } : null } : {}) };
      if (board) {
        await patch(`/boards/${board.id}`, payload);
        await reloadBoards();
        toast(t('common.saved'));
        onClose();
      } else {
        const r = await post<{ board: Board }>('/boards', payload);
        await reloadBoards();
        onClose();
        navigate(`/b/${r.board.id}`);
      }
    } catch (e) {
      setError(e instanceof ApiFailure ? e.body.message : t('errors.server'));
    } finally {
      setBusy(false);
    }
  }

  const setCol = (i: number, c: Partial<Column>) => setColumns((cols) => cols!.map((x, j) => (j === i ? { ...x, ...c } : x)));

  return (
    <Dialog
      title={board ? t('board.settings') : t('nav.newBoard')}
      onClose={onClose}
      footer={
        <>
          {board && board.canManage && (
            <button className="btn btn--danger" style={{ marginInlineEnd: 'auto' }} onClick={() => setArchive(true)}>
              {t('board.archive')}
            </button>
          )}
          <button className="btn btn--quiet" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn--primary" disabled={busy || !name.trim()} onClick={save}>
            {board ? t('common.save') : t('common.create')}
          </button>
        </>
      }
    >
      {error && <div className="notice notice--error" role="alert">{error}</div>}
      <label className="field">
        <span className="field__label">{t('board.name')}</span>
        <input className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span className="field__label">{t('board.visibility')}</span>
        <select className="select" value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}>
          {can('boards.manage_all') && <option value="org">{t('board.visibility.org')}</option>}
          {myTeams.length > 0 && <option value="team">{t('board.visibility.team')}</option>}
          <option value="private">{t('board.visibility.private')}</option>
        </select>
      </label>
      {visibility === 'team' && (
        <label className="field">
          <span className="field__label">{t('board.team')}</span>
          <select className="select" value={teamId ?? ''} onChange={(e) => setTeamId(e.target.value)}>
            {myTeams.map((tm) => (
              <option key={tm.id} value={tm.id}>
                {tm.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="field">
        <span className="field__label">{t('board.members')}</span>
        <PeoplePicker label={t('board.members')} people={people.filter((p) => p.status !== 'deleted')} value={memberIds} max={200} onChange={setMemberIds} />
      </div>
      {!board && (
        <label className="checkbox">
          <input type="checkbox" checked={!!columns} onChange={(e) => setColumns(e.target.checked ? pmColumns(locale) : null)} />
          <span>
            <strong>{t('pm.board.preset')}</strong>
            <span className="field__hint" style={{ display: 'block' }}>{t('pm.board.presetHint')}</span>
          </span>
        </label>
      )}
      {columns && (
        <div className="field">
          <span className="field__label">{t('board.columns')}</span>
          {columns.map((c, i) => (
            <div key={c.key} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, alignItems: 'center' }}>
              <input className="input" aria-label={t('board.columnName')} value={c.name} maxLength={40} onChange={(e) => setCol(i, { name: e.target.value })} />
              <label className="checkbox">
                <input type="checkbox" checked={c.done} onChange={(e) => setCol(i, { done: e.target.checked })} />
                <span>{t('board.doneColumn')}</span>
              </label>
              <button className="btn btn--quiet btn--icon" aria-label={t('common.delete')} disabled={columns.length <= 1} onClick={() => setColumns(columns.filter((_, j) => j !== i))}>
                ×
              </button>
            </div>
          ))}
          <button
            className="btn btn--small"
            style={{ justifySelf: 'start' }}
            disabled={columns.length >= 12}
            onClick={() => {
              const label = t('board.columnName');
              setColumns([...columns.slice(0, -1), { key: slug(`${label}-${columns.length + 1}`, new Set(columns.map((c) => c.key))), name: label, done: false }, ...columns.slice(-1)]);
            }}
          >
            {t('board.addColumn')}
          </button>
        </div>
      )}
      <label className="field">
        <span className="field__label">{t('board.keepDone')}</span>
        <select className="select" value={keepDays ?? 0} onChange={(e) => setKeepDays(Number(e.target.value) || null)}>
          {[...new Set([30, 60, 90, 180, 365, ...(keepDays ? [keepDays] : [])])]
            .sort((a, b) => a - b)
            .map((n) => (
              <option key={n} value={n}>
                {t('board.keepDays', { n })}
              </option>
            ))}
          <option value={0}>{t('board.keepAlways')}</option>
        </select>
        <span className="field__hint">{t('board.keepHint')}</span>
      </label>
      {board && <ChannelPosts value={notify} onChange={setNotify} />}
      {board && (
        <details className="bmore" open={taskFields.length > 0 || !!form?.on}>
          <summary>{t('boardFields.more')}</summary>
          <TaskFieldsEditor value={taskFields} onChange={setTaskFields} />
          <BoardFormEditor value={form} fields={taskFields} columns={columns ?? board.columns} onChange={setForm} />
        </details>
      )}
      {board && can('org.manage') && <BoardPortalSettings board={board} />}
      {archive && board && (
        <Confirm
          title={t('board.archive')}
          body={t('board.archiveConfirm', { name: board.name })}
          confirmLabel={t('board.archive')}
          danger
          onClose={() => setArchive(false)}
          onConfirm={async () => {
            await del(`/boards/${board.id}`);
            await reloadBoards();
            onClose();
            navigate('/my');
          }}
        />
      )}
    </Dialog>
  );
}

/** "Post new / finished tasks to a chat channel" for one board. */
function ChannelPosts({ value, onChange }: { value: BoardNotify[]; onChange: (v: BoardNotify[]) => void }) {
  const { t } = useI18n();
  const [conns, setConns] = useState<Connection[] | null>(null);
  const [channels, setChannels] = useState<Record<string, { id: string; name: string }[]>>({});
  useEffect(() => {
    void get<{ connections: Connection[] }>('/connections')
      .then((r) => setConns(r.connections.filter((c) => c.status !== 'disabled')))
      .catch(() => setConns([]));
  }, []);
  const loadChannels = (id: string) => {
    const c = conns?.find((x) => x.id === id);
    if (!c || !c.twoWay || channels[id]) return;
    void get<{ channels: { id: string; name: string }[] }>(`/connections/${id}/channels`)
      .then((r) => setChannels((m) => ({ ...m, [id]: r.channels })))
      .catch(() => setChannels((m) => ({ ...m, [id]: c.channels })));
  };
  useEffect(() => {
    value.forEach((v) => loadChannels(v.connectionId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conns]);
  if (!conns) return null;
  const label = (c: Connection) => (c.provider === 'webhook' ? `${c.label}` : `${PROVIDER_NAMES[c.provider] ?? c.provider} · ${c.label}`);
  const upd = (i: number, x: Partial<BoardNotify>) => onChange(value.map((v, j) => (j === i ? { ...v, ...x } : v)));
  return (
    <div className="field">
      <span className="field__label">{t('board.posts')}</span>
      {conns.length === 0 ? (
        <span className="field__hint">{t('board.postsNone')}</span>
      ) : (
        <>
          {value.map((v, i) => {
            const c = conns.find((x) => x.id === v.connectionId);
            return (
              <div key={i} className="post-row">
                <select className="select" value={v.connectionId} aria-label={t('board.postsWhere')} onChange={(e) => { upd(i, { connectionId: e.target.value, channel: null }); loadChannels(e.target.value); }}>
                  {conns.map((x) => (
                    <option key={x.id} value={x.id}>
                      {label(x)}
                    </option>
                  ))}
                </select>
                {c?.twoWay && (
                  <select className="select" value={v.channel ?? ''} aria-label={t('board.postsChannel')} onChange={(e) => upd(i, { channel: e.target.value || null })}>
                    <option value="">{t('board.postsPick')}</option>
                    {(channels[v.connectionId] ?? c.channels).map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        {ch.name}
                      </option>
                    ))}
                  </select>
                )}
                {(['created', 'done'] as const).map((ev) => (
                  <label key={ev} className="checkbox">
                    <input type="checkbox" checked={v.events.includes(ev)} onChange={(e) => upd(i, { events: e.target.checked ? [...v.events, ev] : v.events.filter((x) => x !== ev) })} />
                    <span>{t(`board.postsEvent.${ev}`)}</span>
                  </label>
                ))}
                <button className="btn btn--quiet btn--icon" aria-label={t('common.remove')} onClick={() => onChange(value.filter((_, j) => j !== i))}>
                  ×
                </button>
              </div>
            );
          })}
          {value.length < 5 && (
            <button className="btn btn--small" style={{ justifySelf: 'start' }} onClick={() => onChange([...value, { connectionId: conns[0].id, channel: null, events: ['created', 'done'] }])}>
              {t('board.postsAdd')}
            </button>
          )}
          <span className="field__hint">{t('board.postsHint')}</span>
        </>
      )}
    </div>
  );
}



/** Open this board to customers: where their requests land, what they read for each column, which details they see. */
function BoardPortalSettings({ board }: { board: Board }) {
  const { t } = useI18n();
  const { reloadBoards, toast } = useStore();
  const [org, setOrg] = useState<PortalSettings | null>(null);
  const [cfg, setCfg] = useState<BoardPortal>(board.portal ?? { enabled: false, intake: board.columns[0]?.key ?? '', labels: {}, fields: ['due'] });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void get<PortalSettings>('/portal').then(setOrg, () => setOrg(null));
  }, []);
  if (!org?.available) return null;
  const save = async () => {
    setBusy(true);
    try {
      await put(`/boards/${board.id}/portal`, cfg);
      await reloadBoards();
      toast(t('common.saved'));
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <fieldset className="field portal-board">
      <legend className="field__label">{t('portal.board.title')}</legend>
      {!org.enabled ? (
        <span className="field__hint">{t('portal.board.orgOff')}</span>
      ) : board.visibility === 'private' ? (
        <span className="field__hint">{t('portal.board.private')}</span>
      ) : (
        <>
          <label className="checkbox">
            <input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} />
            <span>{t('portal.board.open')}</span>
          </label>
          <span className="field__hint">{t('portal.board.explain')}</span>
          {cfg.enabled && (
            <>
              <label className="field">
                <span className="field__label">{t('portal.board.intake')}</span>
                <select className="select" value={cfg.intake} onChange={(e) => setCfg({ ...cfg, intake: e.target.value })}>
                  {board.columns.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <span className="field__hint">{t('portal.board.intakeHint')}</span>
              </label>
              <div className="field">
                <span className="field__label">{t('portal.board.labels')}</span>
                <div className="portal-board__labels">
                  {board.columns.map((c) => (
                    <label key={c.key}>
                      <span className="muted">{c.name}</span>
                      <input
                        className="input"
                        maxLength={60}
                        placeholder={c.name}
                        value={cfg.labels[c.key] ?? ''}
                        onChange={(e) => setCfg({ ...cfg, labels: { ...cfg.labels, [c.key]: e.target.value } })}
                      />
                    </label>
                  ))}
                </div>
                <span className="field__hint">{t('portal.board.labelsHint')}</span>
              </div>
              <div className="field">
                <span className="field__label">{t('portal.board.fields')}</span>
                <div className="chips-row">
                  {PORTAL_FIELDS.map((f) => (
                    <label key={f} className="checkbox">
                      <input
                        type="checkbox"
                        checked={cfg.fields.includes(f)}
                        onChange={(e) => setCfg({ ...cfg, fields: e.target.checked ? [...cfg.fields, f] : cfg.fields.filter((x: PortalField) => x !== f) })}
                      />
                      <span>{t(`portal.field.${f}` as const)}</span>
                    </label>
                  ))}
                </div>
                <span className="field__hint">{t('portal.board.fieldsHint')}</span>
              </div>
            </>
          )}
          <button className="btn btn--small" style={{ justifySelf: 'start' }} disabled={busy} onClick={save}>
            {t('portal.board.save')}
          </button>
        </>
      )}
    </fieldset>
  );
}
