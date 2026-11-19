// Moving work over from another tool, from a file: the export of whatever
// the team used before (CSV, Excel, a kanban board's JSON export). Four
// steps, each one screen: the file; which column is what; where each list
// goes (many lists fold into a few department boards); and a dry run that
// says what will come in and what will not — before anything is written.
// Then the import, its result, and an undo for 30 days.
import { Icon } from './icons';
import { useEffect, useMemo, useState } from 'react';
import type { Locale } from '../../../shared/src/i18n';
import type { Board, Column, TaskField } from '../../../shared/src/model';
import {
  DEPARTMENTS,
  IMPORT_FIELDS,
  MULTI_FIELDS,
  SECTION_COLUMN,
  departmentName,
  guessImportMapping,
  listsOf,
  problemsCsv,
  shapeBoardJson,
  shapeMatrix,
  suggestTargets,
  type ImportField,
  type ImportReport,
  type Reason,
  type ShapedSheet,
  type Target,
} from '../../../shared/src/importPlan';
import { columnFor, fold, matchPerson, parseDay, priorityFor, splitPeople } from '../../../shared/src/taskImport';
import { ApiFailure, get, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import type { MessageKey } from '../../../shared/src/i18n';
import { readMatrix } from '../lib/sheet';
import { useStore } from '../lib/store';
import { navigate } from '../lib/router';
import { Dialog } from './ui';
import '../surfaces/adopt.css';

type To = ImportField | 'skip';
type Step = 'file' | 'columns' | 'lists' | 'check' | 'done';
interface Past {
  id: string;
  fileName: string | null;
  created: number;
  boards: number;
  boardId: string | null;
  boardName: string | null;
  createdAt: string;
  undoneAt: string | null;
  undoable: boolean;
}
interface DryRun {
  report: ImportReport;
  newBoards: { key: string; name: string; columns: Column[]; taskFields: TaskField[] }[];
}

const DEMO = !!import.meta.env.APP_DEMO;
const STEPS: Step[] = ['file', 'columns', 'lists', 'check', 'done'];

// A template with every column the importer understands (English and Turkish headings; other languages get English).
const TEMPLATE: Partial<Record<Locale, string[]>> & { en: string[] } = {
  en: [
    'ID,Title,Description,List,Status,Assignee,Due date,Priority,Customer,Parent ID,Comments,Depends on,Story points,Region',
    '1,Send the renewal offer,Start from last year’s price,Renewals,To do,ada@example.com,2027-01-15,High,Example Customer Ltd,,,,3,EU',
    '2,Pull the usage numbers,,Renewals,In progress,Mert,2027-01-10,Normal,,1,"First comment\n\nSecond comment",,1,EU',
    '3,Fix the export bug,,Bugs,To do,,2027-01-20,Urgent,,,,1,5,US',
  ],
  tr: [
    'No;Başlık;Açıklama;Liste;Durum;Atanan;Son tarih;Öncelik;Müşteri;Üst görev;Yorumlar;Şuna bağlı;Puan;Bölge',
    '1;Yenileme teklifini gönder;Geçen yılın fiyatıyla başla;Yenilemeler;Yapılacak;ada@ornek.com;15.01.2027;Yüksek;Örnek Müşteri A.Ş.;;;;3;AB',
    '2;Kullanım rakamlarını çıkar;;Yenilemeler;Devam ediyor;Mert;10.01.2027;Normal;;1;"İlk yorum\n\nİkinci yorum";;1;AB',
    '3;Dışa aktarma hatasını düzelt;;Hatalar;Yapılacak;;20.01.2027;Acil;;;;1;5;ABD',
  ],
};
const DATE_SAMPLE: Partial<Record<Locale, string>> = { tr: '31.12.2027 · 31/12/2027', en: '12/31/2027' };

const csvUrl = (text: string) => URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
const toValue = (t: Target) => ('board' in t ? `b:${t.board}` : `n:${t.create}`);
const fromValue = (v: string): Target => (v.startsWith('b:') ? { board: v.slice(2) } : { create: v.slice(2) });

/** Reads any file the importer takes: CSV, Excel, or a board's JSON export. */
async function readFile(file: File): Promise<ShapedSheet> {
  if (/\.json$/i.test(file.name)) {
    const shaped = shapeBoardJson(JSON.parse(await file.text()));
    if (!shaped) throw new Error('shape');
    return shaped;
  }
  return shapeMatrix(await readMatrix(file));
}

export function TaskImporter({ board, onClose, onDone, file: firstFile }: { board?: Board | null; onClose: () => void; onDone?: () => void; file?: File | null }) {
  const { t, locale, words, fmtDate } = useI18n();
  const { people, boards, toast, reloadBoards, can } = useStore();
  const [step, setStep] = useState<Step>('file');
  const [sheet, setSheet] = useState<ShapedSheet | null>(null);
  const [fileName, setFileName] = useState('');
  const [readError, setReadError] = useState('');
  const [map, setMap] = useState<Record<string, To>>({});
  const [targets, setTargets] = useState<Record<string, Target>>({});
  const [dateLocale, setDateLocale] = useState<Locale>(locale);
  const [includeDone, setIncludeDone] = useState(false);
  const [dry, setDry] = useState<DryRun | null>(null);
  const [checking, setChecking] = useState(false);
  const [phase, setPhase] = useState<{ at: number; of: number; what: 'boards' | 'tasks' } | null>(null);
  const [result, setResult] = useState<{ batch: string; report: ImportReport; boards: Record<string, string> } | null>(null);
  const [undone, setUndone] = useState<{ removed: number; archived: number } | null>(null);
  const [past, setPast] = useState<Past[]>([]);
  const busy = checking || !!phase;
  const writable = boards;

  const loadPast = () => void get<{ imports: Past[] }>('/task-imports').then((r) => setPast(board ? r.imports.filter((p) => p.boardId === board.id) : r.imports), () => undefined);
  useEffect(loadPast, [board?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const fileTitle = (s: ShapedSheet, name: string) => s.title || name.replace(/\.[a-z0-9]+$/i, '').slice(0, 80);
  const open = async (file: File | undefined | null) => {
    if (!file) return;
    setReadError('');
    try {
      const s = await readFile(file);
      if (!s.headers.length || !s.rows.length) {
        setReadError(t('timport.empty'));
        return;
      }
      setSheet(s);
      setFileName(file.name);
      setMap(guessImportMapping(s.headers));
      setDry(null);
      setStep('columns');
    } catch {
      setReadError(t('imp.unreadable'));
    }
  };
  useEffect(() => {
    if (firstFile) void open(firstFile);
  }, [firstFile]); // eslint-disable-line react-hooks/exhaustive-deps

  const columnOf = (f: ImportField) => Object.keys(map).find((h) => map[h] === f);
  const titleColumn = columnOf('title');
  const duplicate = IMPORT_FIELDS.some((f) => !MULTI_FIELDS.includes(f) && Object.values(map).filter((x) => x === f).length > 1);
  const lists = useMemo(() => (sheet ? listsOf(sheet.rows, columnOf('list')) : []), [sheet, map]); // eslint-disable-line react-hooks/exhaustive-deps
  const many = lists.length > 1;
  const suggested = (keepEach = false) => suggestTargets(lists, writable, { from: board?.id ?? null, fileTitle: sheet ? fileTitle(sheet, fileName) : '', locale, keepEach });

  // What the first rows will become, so a wrong guess shows before anything is planned.
  const person = (name: string) => matchPerson(name, people.filter((p) => p.status === 'active' || p.status === 'invited').map((p) => ({ id: p.id, name: p.name, email: p.email })));
  const previewCols = board?.columns ?? [
    { key: 'todo', name: t('board.defaultColumns.todo'), done: false },
    { key: 'doing', name: t('board.defaultColumns.doing'), done: false },
    { key: 'done', name: t('board.defaultColumns.done'), done: true },
  ];
  const preview = (h: string, v: string): string => {
    const f = map[h];
    if (!v || f === 'skip') return v;
    if (f === 'dueDate' || f === 'startDate' || f === 'doneAt') {
      const d = parseDay(v, dateLocale);
      return d ? fmtDate(d, { day: 'numeric', month: 'short', year: 'numeric' }) : `${v} ?`;
    }
    if (f === 'status' && board) return previewCols.find((c) => c.key === (columnFor(v, previewCols) ?? previewCols[0].key))?.name ?? v;
    if (f === 'priority') return t(`task.priority.${priorityFor(v)}` as MessageKey);
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
    for (const h of sheet.headers) out[h] = sheet.rows.map((r) => r.c[h]).filter(Boolean).slice(0, 3);
    return out;
  }, [sheet]);
  const headName = (h: string) => (h === SECTION_COLUMN ? t('imp.sectionColumn') : h);

  // Only the columns that go somewhere are sent.
  const payload = (tg: Record<string, Target>) => {
    const used = new Set(Object.keys(map).filter((h) => map[h] !== 'skip'));
    return {
      fileName,
      rows: sheet!.rows.map((r) => ({ n: r.n, c: Object.fromEntries(Object.entries(r.c).filter(([h]) => used.has(h))), ...(r.p !== undefined ? { p: r.p } : {}) })),
      mapping: Object.fromEntries(Object.entries(map).filter(([, f]) => f !== 'skip')),
      targets: tg,
      locale: dateLocale,
      includeDone,
    };
  };
  const check = async (tg = targets) => {
    if (!sheet || !titleColumn || duplicate) return;
    setChecking(true);
    try {
      setDry(await post<DryRun>('/task-imports', { ...payload(tg), dryRun: true }));
      setStep('check');
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    } finally {
      setChecking(false);
    }
  };
  // The dry run follows the options on its screen.
  useEffect(() => {
    if (step === 'check') void check();
  }, [dateLocale, includeDone]); // eslint-disable-line react-hooks/exhaustive-deps

  const fromColumns = () => {
    const tg = Object.keys(targets).length && lists.every((l) => targets[l.name]) ? targets : suggested();
    setTargets(tg);
    if (many) setStep('lists');
    else void check(tg);
  };

  // Who sees a board made for the import: everyone when this person may open company boards, else the
  // team of the board it was started from, else only them until they share it.
  const newBoardSeen = can('boards.manage_all') ? { visibility: 'org' } : board?.teamId ? { visibility: 'team', teamId: board.teamId } : { visibility: 'private' };
  const run = async () => {
    if (!dry || !sheet) return;
    const made: Record<string, string> = {};
    try {
      // The new boards first, exactly as the dry run showed them (through the usual board rules).
      const fresh = dry.newBoards;
      for (const [i, nb] of fresh.entries()) {
        setPhase({ at: i, of: fresh.length, what: 'boards' });
        const r = await post<{ board: Board }>('/boards', { name: nb.name, ...newBoardSeen, columns: nb.columns, taskFields: nb.taskFields });
        made[nb.key] = r.board.id;
      }
      const real: Record<string, Target> = {};
      for (const [list, tg] of Object.entries(targets)) {
        const key = 'create' in tg ? `n:${fold(tg.create)}` : '';
        real[list] = 'create' in tg ? { board: made[key] } : tg;
      }
      setPhase({ at: 0, of: 1, what: 'tasks' });
      const r = await post<{ batch: string; report: ImportReport }>('/task-imports', { ...payload(real), createdBoards: Object.values(made) });
      const where: Record<string, string> = {};
      for (const b of r.report.boards) where[b.key] = b.id ?? made[b.key] ?? '';
      setResult({ ...r, boards: where });
      setStep('done');
      void reloadBoards();
      onDone?.();
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
      if (Object.keys(made).length) void reloadBoards();
    } finally {
      setPhase(null);
    }
  };
  const undo = async (id: string) => {
    setPhase({ at: 0, of: 1, what: 'tasks' });
    try {
      const r = await post<{ removed: number; archived: number }>(`/task-imports/${id}/undo`);
      setUndone(r);
      loadPast();
      void reloadBoards();
      onDone?.();
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    } finally {
      setPhase(null);
    }
  };
  const again = () => {
    setSheet(null);
    setResult(null);
    setUndone(null);
    setDry(null);
    setTargets({});
    setStep('file');
    loadPast();
  };

  const template = useMemo(() => csvUrl(`﻿${(TEMPLATE[locale] ?? TEMPLATE.en).join('\n')}\n`), [locale]);
  const reasonText = (r: Reason, kind: 'left' | 'note') => t(`imp.${kind}.${r}` as MessageKey);
  const problems = (report: ImportReport) => csvUrl(problemsCsv(report, reasonText, [t('imp.csv.row'), t('imp.csv.what')]));
  const rowList = (ns: number[]) => (ns.length > 8 ? `${ns.slice(0, 8).join(', ')}…` : ns.join(', '));
  const names = (items: { name: string; count: number }[]) => items.slice(0, 6).map((x) => (x.count > 1 ? `${x.name} (${x.count})` : x.name)).join(', ');
  const fieldLabel = (f: ImportField) => (f === 'account' ? words.one : t(`imp.field.${f}` as MessageKey));

  // ---------------------------------------------------------------- screens
  const stepIndex = STEPS.indexOf(step);
  const visible = STEPS.filter((s) => s !== 'lists' || many);
  const stepper = !undone && (
    <ol className="wizard-steps" aria-label={t('imp.steps')}>
      {visible.map((s, i) => (
        <li key={s} aria-current={s === step ? 'step' : undefined} data-past={STEPS.indexOf(s) < stepIndex ? 'true' : undefined}>
          <span className="wizard-steps__n num">{STEPS.indexOf(s) < stepIndex ? <Icon name="check" size={12} /> : i + 1}</span>
          <span className="wizard-steps__label">{t(`imp.step.${s}` as MessageKey)}</span>
        </li>
      ))}
    </ol>
  );
  const privacy = <p className="adopt-privacy">{t(DEMO ? 'imp.privacyDemo' : 'imp.privacy')}</p>;

  let content: React.ReactNode;
  if (phase) {
    const pct = phase.what === 'boards' ? Math.round((phase.at / Math.max(1, phase.of + 1)) * 60) : 80;
    content = (
      <div className="importer adopt-progress" role="status" aria-live="polite">
        <div className="adopt-progress__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <span style={{ width: `${pct}%` }} />
        </div>
        <p>{phase.what === 'boards' ? t('imp.making', { at: phase.at + 1, of: phase.of }) : t('imp.bringing', { n: dry ? dry.report.totals.tasks + dry.report.totals.subtasks : 0 })}</p>
      </div>
    );
  } else if (undone) {
    content = (
      <div className="importer">
        <p className="notice">{undone.archived ? t('timport.undoneKept', { removed: undone.removed, kept: undone.archived }) : t('timport.undone', { removed: undone.removed })}</p>
        <div className="inline-actions u-justify-content-flex-start">
          <button className="btn" onClick={again}>
            {t('import.another')}
          </button>
        </div>
      </div>
    );
  } else if (step === 'done' && result) {
    const x = result.report.totals;
    content = (
      <div className="importer">
        <div className="import-result">
          {(['tasks', 'subtasks', 'comments', 'links'] as const).map((k) => (
            <div key={k} className="import-result__stat">
              <strong className="num">{x[k]}</strong>
              <span>{t(`imp.count.${k}` as MessageKey)}</span>
            </div>
          ))}
        </div>
        <ul className="adopt-boards">
          {result.report.boards.map((b) => (
            <li key={b.key}>
              <span>
                <strong>{b.name}</strong> <span className="muted">· {t('imp.boardLine', { n: b.tasks + b.subtasks })}</span>
              </span>
              {result.boards[b.key] && (
                <button
                  className="linkbtn"
                  onClick={() => {
                    onClose();
                    navigate(`/b/${result.boards[b.key]}`);
                  }}
                >
                  {t('imp.openBoard')}
                </button>
              )}
            </li>
          ))}
        </ul>
        {(result.report.left.length > 0 || result.report.notes.length > 0) && (
          <p className="field__hint">
            <a href={problems(result.report)} download={t('imp.csv.file')}>
              {t('imp.downloadProblems')}
            </a>
          </p>
        )}
        <div className="inline-actions u-justify-content-flex-start">
          <button className="btn btn--primary" onClick={onClose}>
            {t('imp.finish')}
          </button>
          <button className="btn" onClick={() => void undo(result.batch)} disabled={busy}>
            {t('import.undo')}
          </button>
          <button className="btn btn--quiet" onClick={again}>
            {t('import.another')}
          </button>
        </div>
        <p className="field__hint">{t('timport.safe')}</p>
      </div>
    );
  } else if (step === 'file' || !sheet) {
    content = (
      <div className="importer">
        <p className="sheet__hint u-mt-0">{board ? t('imp.leadBoard', { board: board.name }) : t('imp.lead')}</p>
        <label
          className="dropzone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void open(e.dataTransfer.files[0]);
          }}
        >
          <input type="file" accept=".csv,.xlsx,.json,text/csv,application/json" className="sr-only" onChange={(e) => void open(e.target.files?.[0])} />
          <strong>{t('import.drop')}</strong>
          <span className="muted">{t('imp.dropHint')}</span>
          <span className="btn btn--small" aria-hidden="true">
            {t('import.choose')}
          </span>
        </label>
        {readError && <p className="error-text">{readError}</p>}
        {privacy}
        <p className="field__hint">
          <a href={template} download={t('imp.templateFile')}>
            {t('imp.template')}
          </a>{' '}
          · {t('imp.sources')}
        </p>
        {past.length > 0 && (
          <div className="importer__past">
            <h3 className="targets__sub">{board ? t('timport.past') : t('imp.past')}</h3>
            <ul>
              {past.map((p) => (
                <li key={p.id}>
                  <span>
                    {p.fileName ?? t('timport.noName')}{' '}
                    <span className="muted">
                      · {t('timport.pastLine', { n: p.created, date: fmtDate(p.createdAt.slice(0, 10), { day: 'numeric', month: 'short' }) })}
                      {p.boards > 1 ? ` · ${t('imp.pastBoards', { n: p.boards })}` : p.boardName && !board ? ` · ${p.boardName}` : ''}
                    </span>
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
  } else if (step === 'columns') {
    content = (
      <div className="importer">
        <div className="importer__head">
          <div>
            <strong>{fileName}</strong>
            <div className="muted">
              {t('import.rows', { n: sheet.rows.length })}
              {sheet.layout !== 'table' && ` · ${t(`imp.layout.${sheet.layout}` as MessageKey, { groups: sheet.sections, nested: sheet.nested })}`}
            </div>
          </div>
          <button className="btn btn--quiet btn--small" onClick={() => setStep('file')}>
            {t('import.changeFile')}
          </button>
        </div>
        <div className="table-wrap">
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
                    <strong>{headName(h)}</strong>
                  </td>
                  <td className="map-table__sample">
                    {(samples[h] ?? []).map((v, i) => (
                      <span key={i}>{preview(h, v).slice(0, 80)}</span>
                    ))}
                  </td>
                  <td>
                    <select className="select" value={map[h]} aria-label={headName(h)} onChange={(e) => setMap({ ...map, [h]: e.target.value as To })}>
                      <option value="skip">{t('import.target.skip')}</option>
                      {IMPORT_FIELDS.map((f) => (
                        <option key={f} value={f}>
                          {fieldLabel(f)}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!titleColumn && <p className="error-text">{t('timport.needTitle')}</p>}
        {duplicate && <p className="error-text">{t('import.duplicate')}</p>}
        <div className="inline-actions u-justify-content-flex-start">
          <button className="btn btn--primary" disabled={!titleColumn || duplicate || busy} onClick={fromColumns}>
            {many ? t('imp.next.lists', { n: lists.length }) : busy ? t('imp.checking') : t('imp.next.check')}
          </button>
          <span className="field__hint">{t('imp.nothingYet')}</span>
        </div>
      </div>
    );
  } else if (step === 'lists') {
    const boardsByTarget = new Map<string, number>();
    for (const l of lists) {
      const k = toValue(targets[l.name] ?? { create: l.name });
      boardsByTarget.set(k, (boardsByTarget.get(k) ?? 0) + 1);
    }
    const options = (l: string) => {
      const out = new Map<string, string>();
      for (const b of writable) out.set(`b:${b.id}`, b.name);
      for (const d of DEPARTMENTS) {
        const name = departmentName(d, locale);
        if (!writable.some((b) => fold(b.name) === fold(name))) out.set(`n:${name}`, t('imp.newBoard', { name }));
      }
      if (l) out.set(`n:${l}`, t('imp.newBoard', { name: l }));
      const cur = targets[l];
      if (cur && 'create' in cur) out.set(`n:${cur.create}`, t('imp.newBoard', { name: cur.create }));
      return [...out];
    };
    content = (
      <div className="importer">
        <p className="sheet__hint u-mt-0">{t('imp.listsLead', { n: lists.length, boards: boardsByTarget.size })}</p>
        <div className="seg" role="group" aria-label={t('imp.listsHow')}>
          <button type="button" aria-pressed={JSON.stringify(targets) === JSON.stringify(suggested())} onClick={() => setTargets(suggested())}>
            {t('imp.suggestDepts')}
          </button>
          <button type="button" aria-pressed={JSON.stringify(targets) === JSON.stringify(suggested(true))} onClick={() => setTargets(suggested(true))}>
            {t('imp.keepEach')}
          </button>
        </div>
        <div className="table-wrap">
          <table className="table map-table">
            <thead>
              <tr>
                <th>{t('imp.col.list')}</th>
                <th className="num">{t('imp.col.tasks')}</th>
                <th>{t('imp.col.board')}</th>
              </tr>
            </thead>
            <tbody>
              {lists.map((l) => (
                <tr key={l.name}>
                  <td>
                    <strong>{l.name || t('imp.noList')}</strong>
                  </td>
                  <td className="num">{l.rows}</td>
                  <td>
                    <select className="select" aria-label={l.name || t('imp.noList')} value={toValue(targets[l.name] ?? { create: l.name })} onChange={(e) => setTargets({ ...targets, [l.name]: fromValue(e.target.value) })}>
                      {options(l.name).map(([v, label]) => (
                        <option key={v} value={v}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="field__hint">{t('imp.fromListHint')}</p>
        <div className="inline-actions u-justify-content-flex-start">
          <button className="btn btn--primary" disabled={busy} onClick={() => void check()}>
            {busy ? t('imp.checking') : t('imp.next.check')}
          </button>
          <button className="btn btn--quiet" onClick={() => setStep('columns')}>
            {t('imp.back')}
          </button>
        </div>
      </div>
    );
  } else if (dry) {
    const r = dry.report;
    const total = r.totals.tasks + r.totals.subtasks;
    content = (
      <div className="importer" aria-busy={checking || undefined}>
        <h3 className="targets__sub">{t('imp.willCome')}</h3>
        <ul className="adopt-plan">
          {r.boards.map((b) => (
            <li key={b.key} className="adopt-plan__board">
              <div className="adopt-plan__head">
                <strong>{b.name}</strong>
                {b.isNew && <span className="badge">{t('imp.new')}</span>}
                {b.lists.filter(Boolean).length > 1 && <span className="muted">{t('imp.fromLists', { n: b.lists.filter(Boolean).length })}</span>}
              </div>
              <div className="adopt-plan__counts">
                {(['tasks', 'subtasks', 'comments', 'links'] as const).map((k) => (
                  <span key={k} data-zero={b[k] === 0 ? 'true' : undefined}>
                    <strong className="num">{b[k]}</strong> {t(`imp.count.${k}` as MessageKey)}
                  </span>
                ))}
              </div>
              {b.columns.length > 0 && <p className="adopt-plan__more">{t('imp.newColumns', { names: b.columns.join(' · ') })}</p>}
              {b.newFields.length > 0 && <p className="adopt-plan__more">{t('imp.newFields', { names: b.newFields.join(', ') })}</p>}
            </li>
          ))}
        </ul>
        {total === 0 && <p className="notice notice--error">{t('imp.nothing')}</p>}
        {dry.newBoards.length > 0 && newBoardSeen.visibility !== 'org' && <p className="field__hint">{t(newBoardSeen.visibility === 'team' ? 'imp.newSeenTeam' : 'imp.newSeenMe')}</p>}
        {(r.left.length > 0 || r.notes.length > 0 || r.unmatched.people.length + r.unmatched.accounts.length + r.unmatched.statuses.length > 0) && (
          <>
            <h3 className="targets__sub">{t('imp.wontCome')}</h3>
            <ul className="import-notes adopt-left">
              {r.left.map((x) => (
                <li key={`l-${x.reason}`} data-kind="left">
                  <strong className="num">{x.n}</strong> {reasonText(x.reason, 'left')} <span className="muted">{t('imp.rows', { rows: rowList(x.rows) })}</span>
                </li>
              ))}
              {r.notes.map((x) => (
                <li key={`n-${x.reason}`} data-kind="note">
                  <strong className="num">{x.n}</strong> {reasonText(x.reason, 'note')} <span className="muted">{t('imp.rows', { rows: rowList(x.rows) })}</span>
                </li>
              ))}
              {r.unmatched.people.length > 0 && <li data-kind="note">{t('timport.peopleMissing', { names: names(r.unmatched.people) })}</li>}
              {r.unmatched.accounts.length > 0 && <li data-kind="note">{t('timport.accountsMissing', { names: names(r.unmatched.accounts) })}</li>}
              {r.unmatched.statuses.length > 0 && <li data-kind="note">{t('imp.statusesMissing', { names: names(r.unmatched.statuses) })}</li>}
            </ul>
            <p className="field__hint">
              <a href={problems(r)} download={t('imp.csv.file')}>
                {t('imp.downloadProblems')}
              </a>
            </p>
          </>
        )}
        <div className="importer__opts">
          <div className="field">
            <span className="field__label">{t('timport.dates')}</span>
            <div className="seg">
              {(['tr', 'en'] as Locale[]).map((l) => (
                <button key={l} type="button" aria-pressed={dateLocale === l} onClick={() => setDateLocale(l)} disabled={busy}>
                  {DATE_SAMPLE[l]}
                </button>
              ))}
            </div>
          </div>
          <label className="checkbox">
            <input type="checkbox" checked={includeDone} disabled={busy} onChange={(e) => setIncludeDone(e.target.checked)} />
            <span>{t('timport.includeDone')}</span>
          </label>
        </div>
        <div className="inline-actions u-justify-content-flex-start">
          <button className="btn btn--primary" disabled={busy || total === 0} onClick={() => void run()}>
            <Icon name="upload" size={16} />
            {t('imp.go', { n: total })}
          </button>
          <button className="btn btn--quiet" onClick={() => setStep(many ? 'lists' : 'columns')} disabled={busy}>
            {t('imp.back')}
          </button>
          <span className="field__hint">{t('timport.safe')}</span>
        </div>
      </div>
    );
  }

  return (
    <Dialog title={t('imp.title')} onClose={onClose} wide>
      {stepper}
      {content}
    </Dialog>
  );
}
