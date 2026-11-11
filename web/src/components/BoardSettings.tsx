// Create a board, or change its name, who sees it and its columns.
import { useState } from 'react';
import type { Board, Column, Visibility } from '../../../shared/src/model';
import { ApiFailure, del, patch, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { navigate } from '../lib/router';
import { useStore } from '../lib/store';
import { Confirm, Dialog, PeoplePicker } from './ui';

const slug = (s: string, taken: Set<string>) => {
  let base = s.toLocaleLowerCase('en').normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'col';
  let k = base;
  let i = 2;
  while (taken.has(k)) k = `${base}-${i++}`.slice(0, 24);
  return k;
};

export function BoardSettings({ board, onClose }: { board?: Board; onClose: () => void }) {
  const { t } = useI18n();
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

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const payload = { name, visibility, teamId: visibility === 'team' ? teamId : null, memberIds, ...(columns ? { columns } : {}) };
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
            <button className="btn btn--danger" style={{ marginRight: 'auto' }} onClick={() => setArchive(true)}>
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
