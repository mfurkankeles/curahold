// Tasks from a file: the export of whatever the team used before (a CSV or
// an Excel sheet) onto this board. The file is read in the browser; nothing
// is sent until the person has seen which column goes where.
import { Icon } from './icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Locale } from '../../../shared/src/i18n';
import type { Board } from '../../../shared/src/model';
import { TASK_IMPORT_FIELDS, columnFor, guessTaskMapping, matchPerson, parseDay, priorityFor, splitPeople, type TaskImportField, type TaskImportResult } from '../../../shared/src/taskImport';
import { ApiFailure, get, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { readSheet, type Sheet } from '../lib/sheet';
import { useStore } from '../lib/store';
import { Dialog } from './ui';

type Target = TaskImportField | 'skip';
interface Past {
  id: string;
  fileName: string | null;
  created: number;
  createdAt: string;
  undoneAt: string | null;
  undoable: boolean;
}

export function TaskImporter({ board, onClose, onDone }: { board: Board; onClose: () => void; onDone: () => void }) {
  const { t, locale, words, fmtDate } = useI18n();
  const { people, toast } = useStore();
  const input = useRef<HTMLInputElement>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [fileName, setFileName] = useState('');
  const [readError, setReadError] = useState('');
  const [map, setMap] = useState<Record<string, Target>>({});
  const [dateLocale, setDateLocale] = useState<Locale>(locale);
  const [includeDone, setIncludeDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TaskImportResult | null>(null);
  const [undone, setUndone] = useState<{ removed: number; archived: number } | null>(null);
  const [past, setPast] = useState<Past[]>([]);

  const loadPast = () => void get<{ imports: Past[] }>(`/boards/${board.id}/imports`).then((r) => setPast(r.imports), () => undefined);
  useEffect(loadPast, [board.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = async (file: File | undefined | null) => {
    if (!file) return;
    setReadError('');
    try {
      const s = await readSheet(file);
      if (!s.headers.length || !s.rows.length) {
        setReadError(t('timport.empty'));
        return;
      }
      const guess = guessTaskMapping(s.headers);
      const next: Record<string, Target> = {};
      for (const h of s.headers) next[h] = (TASK_IMPORT_FIELDS.find((f) => guess[f] === h) as Target | undefined) ?? 'skip';
      setSheet(s);
      setFileName(file.name);
      setMap(next);
    } catch {
      setReadError(t('import.unreadable'));
    }
  };

  const columnOf = (f: TaskImportField) => Object.keys(map).find((h) => map[h] === f);
  const titleColumn = columnOf('title');
  const duplicate = TASK_IMPORT_FIELDS.some((f) => Object.values(map).filter((x) => x === f).length > 1);

  // What the first rows will become, so mistakes show before anything is saved.
  const person = (name: string) => matchPerson(name, people.filter((p) => p.status === 'active' || p.status === 'invited').map((p) => ({ id: p.id, name: p.name, email: p.email })));
  const preview = (h: string, v: string): string => {
    const f = map[h];
    if (!v || f === 'skip' || f === 'title' || f === 'description' || f === 'account') return v;
    if (f === 'dueDate' || f === 'startDate' || f === 'doneAt') {
      const d = parseDay(v, dateLocale);
      return d ? fmtDate(d, { day: 'numeric', month: 'short', year: 'numeric' }) : `${v} ?`;
    }
    if (f === 'status') {
      const key = columnFor(v, board.columns);
      return board.columns.find((c) => c.key === (key ?? board.columns[0].key))?.name ?? v;
    }
    if (f === 'priority') return t(`task.priority.${priorityFor(v)}` as any);
    if (f === 'assignee')
      return splitPeople(v)
        .map((n) => {
          const id = person(n);
          return id ? people.find((p) => p.id === id)?.name ?? n : `${n} ?`;
        })
        .join(', ');
    return v;
  };
  const samples = useMemo(() => {
    const out: Record<string, string[]> = {};
    if (!sheet) return out;
    for (const h of sheet.headers) out[h] = sheet.rows.map((r) => r[h]).filter(Boolean).slice(0, 3);
    return out;
  }, [sheet]);

  const run = async () => {
    if (!sheet || !titleColumn || duplicate) return;
    setBusy(true);
    try {
      const mapping = Object.fromEntries(TASK_IMPORT_FIELDS.map((f) => [f, columnOf(f)]).filter(([, h]) => !!h));
      // Only the columns that go somewhere are sent.
      const used = new Set(Object.values(mapping) as string[]);
      const rows = sheet.rows.map((r) => Object.fromEntries(Object.entries(r).filter(([h]) => used.has(h))));
      const r = await post<TaskImportResult>(`/boards/${board.id}/import`, { fileName, rows, mapping, locale: dateLocale, includeDone });
      setResult(r);
      onDone();
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    } finally {
      setBusy(false);
    }
  };
  const undo = async (id: string) => {
    setBusy(true);
    try {
      const r = await post<{ removed: number; archived: number }>(`/task-imports/${id}/undo`);
      setUndone(r);
      loadPast();
      onDone();
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    } finally {
      setBusy(false);
    }
  };
  const again = () => {
    setSheet(null);
    setResult(null);
    setUndone(null);
    loadPast();
  };

  const sampleCsv = useMemo(() => {
    const rows =
      locale === 'tr'
        ? ['Başlık;Açıklama;Durum;Atanan;Son tarih;Öncelik;Müşteri', 'Yenileme teklifini gönder;Geçen yılın fiyatıyla başla;Yapılacak;ada@ornek.com;15.01.2027;Yüksek;Örnek Müşteri A.Ş.', 'Kullanım raporunu hazırla;;Devam ediyor;Mert;22.01.2027;Normal;']
        : ['Title,Description,Status,Assignee,Due date,Priority,Customer', 'Send the renewal offer,Start from last year’s price,To do,ada@example.com,2027-01-15,High,Example Customer Ltd', 'Prepare the usage report,,In progress,Mert,2027-01-22,Normal,'];
    return URL.createObjectURL(new Blob([`﻿${rows.join('\n')}\n`], { type: 'text/csv' }));
  }, [locale]);

  const list = (items: { name: string; count: number }[]) => items.slice(0, 6).map((x) => (x.count > 1 ? `${x.name} (${x.count})` : x.name)).join(', ');

  let content: React.ReactNode;
  if (undone) {
    content = (
      <div className="importer">
        <p className="notice">{undone.archived ? t('timport.undoneKept', { removed: undone.removed, kept: undone.archived }) : t('timport.undone', { removed: undone.removed })}</p>
        <div className="inline-actions" style={{ justifyContent: 'flex-start' }}>
          <button className="btn" onClick={again}>
            {t('import.another')}
          </button>
        </div>
      </div>
    );
  } else if (result) {
    content = (
      <div className="importer">
        <div className="import-result">
          <div className="import-result__stat">
            <strong className="num">{result.created}</strong>
            <span>{t('import.created')}</span>
          </div>
          <div className="import-result__stat">
            <strong className="num">{result.skipped + result.finished}</strong>
            <span>{t('import.skipped')}</span>
          </div>
        </div>
        {(result.finished > 0 || result.unmatched.people.length > 0 || result.unmatched.accounts.length > 0 || result.unmatched.statuses.length > 0) && (
          <ul className="import-notes">
            {result.finished > 0 && <li>{t('timport.finishedLeft', { n: result.finished })}</li>}
            {result.unmatched.people.length > 0 && <li>{t('timport.peopleMissing', { names: list(result.unmatched.people) })}</li>}
            {result.unmatched.accounts.length > 0 && <li>{t('timport.accountsMissing', { names: list(result.unmatched.accounts) })}</li>}
            {result.unmatched.statuses.length > 0 && <li>{t('timport.statusesMissing', { names: list(result.unmatched.statuses), column: board.columns[0].name })}</li>}
          </ul>
        )}
        {result.errors.length > 0 && (
          <details className="import-errors">
            <summary>{t('import.problems', { n: result.errors.length })}</summary>
            <ul>
              {result.errors.slice(0, 100).map((e) => (
                <li key={`${e.row}-${e.reason}`}>
                  {t('import.row', { n: e.row })}: {t(`timport.reason.${e.reason}` as any)}
                </li>
              ))}
            </ul>
          </details>
        )}
        <div className="inline-actions" style={{ justifyContent: 'flex-start' }}>
          <button className="btn btn--primary" onClick={onClose}>
            {t('timport.seeBoard')}
          </button>
          <button className="btn" onClick={() => void undo(result.batch)} disabled={busy || !result.created}>
            {t('import.undo')}
          </button>
          <button className="btn btn--quiet" onClick={again}>
            {t('import.another')}
          </button>
        </div>
      </div>
    );
  } else if (!sheet) {
    content = (
      <div className="importer">
        <p className="sheet__hint" style={{ marginTop: 0 }}>
          {t('timport.lead', { board: board.name })}
        </p>
        <label
          className="dropzone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void open(e.dataTransfer.files[0]);
          }}
        >
          <input ref={input} type="file" accept=".csv,.xlsx,text/csv" className="sr-only" onChange={(e) => void open(e.target.files?.[0])} />
          <strong>{t('import.drop')}</strong>
          <span className="muted">{t('import.dropHint')}</span>
          <span className="btn btn--small" aria-hidden="true">
            {t('import.choose')}
          </span>
        </label>
        {readError && <p className="error-text">{readError}</p>}
        <p className="field__hint">
          <a href={sampleCsv} download={t('timport.sampleFile')}>
            {t('import.sampleLink')}
          </a>
        </p>
        {past.length > 0 && (
          <div className="importer__past">
            <h3 className="targets__sub">{t('timport.past')}</h3>
            <ul>
              {past.map((p) => (
                <li key={p.id}>
                  <span>
                    {p.fileName ?? t('timport.noName')} <span className="muted">· {t('timport.pastLine', { n: p.created, date: fmtDate(p.createdAt.slice(0, 10), { day: 'numeric', month: 'short' }) })}</span>
                  </span>
                  {p.undoneAt ? (
                    <span className="muted">{t('timport.pastUndone')}</span>
                  ) : (
                    p.undoable && (
                      <button className="linkbtn" disabled={busy} onClick={() => void undo(p.id)}>
                        {t('timport.undoShort')}
                      </button>
                    )
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  } else {
    content = (
      <div className="importer">
        <div className="importer__head">
          <div>
            <strong>{fileName}</strong>
            <div className="muted">{t('import.rows', { n: sheet.rows.length })}</div>
          </div>
          <button className="btn btn--quiet btn--small" onClick={() => setSheet(null)}>
            {t('import.changeFile')}
          </button>
        </div>
        <table className="table map-table">
          <thead>
            <tr>
              <th>{t('import.col.column')}</th>
              <th>{t('timport.becomes')}</th>
              <th>{t('import.col.target')}</th>
            </tr>
          </thead>
          <tbody>
            {sheet.headers.map((h) => (
              <tr key={h} data-skip={map[h] === 'skip' ? 'true' : undefined}>
                <td>
                  <strong>{h}</strong>
                </td>
                <td className="map-table__sample">
                  {(samples[h] ?? []).map((v, i) => (
                    <span key={i}>{preview(h, v).slice(0, 80)}</span>
                  ))}
                </td>
                <td>
                  <select className="select" value={map[h]} aria-label={h} onChange={(e) => setMap({ ...map, [h]: e.target.value as Target })}>
                    <option value="skip">{t('import.target.skip')}</option>
                    {TASK_IMPORT_FIELDS.map((f) => (
                      <option key={f} value={f}>
                        {f === 'account' ? words.one : t(`timport.field.${f}` as any)}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="importer__opts">
          <div className="field">
            <span className="field__label">{t('timport.dates')}</span>
            <div className="seg">
              {(['tr', 'en'] as Locale[]).map((l) => (
                <button key={l} type="button" aria-pressed={dateLocale === l} onClick={() => setDateLocale(l)}>
                  {l === 'tr' ? '31.12.2027 · 31/12/2027' : '12/31/2027'}
                </button>
              ))}
            </div>
          </div>
          <label className="checkbox">
            <input type="checkbox" checked={includeDone} onChange={(e) => setIncludeDone(e.target.checked)} />
            <span>{t('timport.includeDone')}</span>
          </label>
        </div>
        {!titleColumn && <p className="error-text">{t('timport.needTitle')}</p>}
        {duplicate && <p className="error-text">{t('import.duplicate')}</p>}
        <div className="inline-actions" style={{ justifyContent: 'flex-start' }}>
          <button className="btn btn--primary" disabled={!titleColumn || duplicate || busy} onClick={run}>
            <Icon name="upload" size={16} />
            {busy ? t('common.saving') : t('import.go', { n: sheet.rows.length })}
          </button>
          <span className="field__hint">{t('timport.safe')}</span>
        </div>
      </div>
    );
  }

  return (
    <Dialog title={t('timport.title')} onClose={onClose} wide>
      {content}
    </Dialog>
  );
}
