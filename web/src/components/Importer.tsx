// Bringing accounts in from a spreadsheet: choose the file, check how its
// columns map (guessed for you), import, and undo if it was the wrong file.
import { useMemo, useRef, useState } from 'react';
import { guessFieldType, HEADER_HINTS, labelOf, normalizeValue, optionKey } from '../../../shared/src/fields';
import type { Locale } from '../../../shared/src/i18n';
import { FIELD_TYPES, type AccountField, type FieldType, type ImportResult } from '../../../shared/src/model';
import { ApiFailure, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { readSheet, type Sheet } from '../lib/sheet';
import { useStore } from '../lib/store';

type Target = { kind: 'skip' } | { kind: 'name' } | { kind: 'owner' } | { kind: 'team' } | { kind: 'externalId' } | { kind: 'field'; key: string } | { kind: 'new'; type: FieldType };

const fold = (s: string) => s.toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').trim();

function guess(header: string, values: string[], fields: AccountField[], taken: Set<string>, locale: Locale): Target {
  const h = header.trim();
  for (const kind of ['name', 'owner', 'team', 'externalId'] as const) {
    if (!taken.has(kind) && HEADER_HINTS[kind].test(h)) return { kind };
  }
  const labels = (x: AccountField) => [x.key, ...Object.values(x.label)].filter(Boolean).map((l) => fold(String(l)));
  const fh = fold(h);
  const exact = fields.find((x) => !taken.has(`field:${x.key}`) && labels(x).includes(fh));
  // "Yenileme" → "Yenileme tarihi", "Renewal" → "Renewal date": the start of a name is enough.
  const near = exact ?? (fh.length >= 4 ? fields.find((x) => !taken.has(`field:${x.key}`) && labels(x).some((l) => l.startsWith(fh) || fh.startsWith(l))) : undefined);
  if (near) return { kind: 'field', key: near.key };
  if (!values.some((v) => v.trim())) return { kind: 'skip' };
  return { kind: 'new', type: guessFieldType(values, locale) };
}

const encode = (t: Target) => (t.kind === 'field' ? `field:${t.key}` : t.kind === 'new' ? `new:${t.type}` : t.kind);
const decode = (s: string): Target => (s.startsWith('field:') ? { kind: 'field', key: s.slice(6) } : s.startsWith('new:') ? { kind: 'new', type: s.slice(4) as FieldType } : ({ kind: s } as Target));

export function Importer({ onImported, compact }: { onImported?: (r: ImportResult) => void; compact?: boolean }) {
  const { t, locale } = useI18n();
  const { me, reloadMe, toast } = useStore();
  const fields = me.org.accountFields.filter((f) => !f.rollup);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [fileName, setFileName] = useState('');
  const [map, setMap] = useState<Record<string, string>>({});
  const [numLocale, setNumLocale] = useState<Locale>(me.org.locale);
  const [runRules, setRunRules] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [undone, setUndone] = useState(false);
  const [readError, setReadError] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const open = async (file: File | undefined) => {
    if (!file) return;
    setReadError('');
    try {
      const s = await readSheet(file);
      if (!s.headers.length || !s.rows.length) {
        setReadError(t('import.emptyFile'));
        return;
      }
      const taken = new Set<string>();
      const m: Record<string, string> = {};
      for (const h of s.headers) {
        const g = guess(h, s.rows.slice(0, 50).map((r) => r[h] ?? ''), fields, taken, numLocale);
        m[h] = encode(g);
        if (g.kind !== 'skip' && g.kind !== 'new') taken.add(encode(g));
      }
      setSheet(s);
      setFileName(file.name);
      setMap(m);
      setResult(null);
      setUndone(false);
    } catch {
      setReadError(t('import.unreadable'));
    }
  };

  const nameColumn = Object.entries(map).find(([, v]) => v === 'name')?.[0];
  const used = (v: string) => Object.values(map).filter((x) => x === v).length;
  const duplicate = ['name', 'owner', 'team', 'externalId', ...fields.map((f) => `field:${f.key}`)].some((v) => used(v) > 1);

  const sampleOf = (h: string) => (sheet?.rows ?? []).map((r) => r[h]).filter(Boolean).slice(0, 3);
  const previewValue = (h: string, raw: string) => {
    const target = decode(map[h] ?? 'skip');
    const def: AccountField | undefined =
      target.kind === 'field' ? fields.find((f) => f.key === target.key) : target.kind === 'new' ? { key: 'x', label: {}, type: target.type, options: [] } : undefined;
    if (!def || def.type === 'text' || def.type === 'select') return raw;
    const r = normalizeValue(def, raw, numLocale);
    return 'error' in r ? `⚠ ${raw}` : String(r.value);
  };

  const run = async () => {
    if (!sheet || !nameColumn) return;
    setBusy(true);
    const mapping: { name: string; owner?: string; team?: string; externalId?: string; fields: Record<string, string> } = { name: nameColumn, fields: {} };
    const newFields: { column: string; field: AccountField }[] = [];
    const keys = new Set(fields.map((f) => f.key));
    for (const [col, v] of Object.entries(map)) {
      const target = decode(v);
      if (target.kind === 'owner') mapping.owner = col;
      else if (target.kind === 'team') mapping.team = col;
      else if (target.kind === 'externalId') mapping.externalId = col;
      else if (target.kind === 'field') mapping.fields[target.key] = col;
      else if (target.kind === 'new') {
        let key = optionKey(col).replace(/^[^a-z]+/, '') || 'field';
        while (keys.has(key)) key = `${key}_2`;
        keys.add(key);
        newFields.push({ column: col, field: { key: key.slice(0, 40), label: { [locale]: col.slice(0, 60) }, type: target.type, ...(target.type === 'select' ? { options: [] } : {}) } });
      }
    }
    try {
      const r = await post<ImportResult>('/accounts/import', { fileName, rows: sheet.rows, mapping, newFields, runAutomations: runRules, locale: numLocale });
      setResult(r);
      await reloadMe();
      onImported?.(r);
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    if (!result) return;
    setBusy(true);
    try {
      await post(`/imports/${result.batch}/undo`, {});
      setUndone(true);
      await reloadMe();
      toast(t('import.undone'));
    } catch (e) {
      toast(e instanceof ApiFailure ? e.body.message : t('errors.server'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const fieldName = (key: string) => labelOf(fields.find((f) => f.key === key)?.label, locale) || key;
  const reasonText = (reason: string) =>
    reason === 'name' ? t('import.reason.name') : t('import.reason.fields', { fields: reason.replace(/^fields:/, '').split(',').map(fieldName).join(', ') });

  const sampleCsv = useMemo(() => {
    const cols = [t('import.sample.name'), t('import.sample.owner'), ...fields.slice(0, 3).map((f) => labelOf(f.label, locale))];
    const rows = [cols.join(';'), [t('import.sample.row1'), me.user.email, ...fields.slice(0, 3).map((f) => (f.type === 'date' ? '2027-03-31' : f.type === 'money' || f.type === 'number' ? '12000' : f.options?.[0] ? labelOf(f.options[0].label, locale) : ''))].join(';')];
    return URL.createObjectURL(new Blob([`﻿${rows.join('\n')}\n`], { type: 'text/csv' }));
  }, [fields, locale, me.user.email, t]);

  if (result) {
    return (
      <div className="importer">
        <div className="import-result">
          <div className="import-result__stat">
            <strong className="num">{result.created}</strong>
            <span>{t('import.created')}</span>
          </div>
          <div className="import-result__stat">
            <strong className="num">{result.updated}</strong>
            <span>{t('import.updated')}</span>
          </div>
          <div className="import-result__stat">
            <strong className="num">{result.skipped}</strong>
            <span>{t('import.skipped')}</span>
          </div>
        </div>
        {undone ? (
          <p className="notice">{t('import.undoneNote')}</p>
        ) : (
          <>
            {result.errors.length > 0 && (
              <details className="import-errors">
                <summary>{t('import.problems', { n: result.errors.length })}</summary>
                <ul>
                  {result.errors.slice(0, 100).map((e) => (
                    <li key={`${e.row}-${e.reason}`}>
                      {t('import.row', { n: e.row })}: {reasonText(e.reason)}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {result.unmatchedOwners.length > 0 && (
              <p className="field__hint">
                {t('import.ownersLater', { names: result.unmatchedOwners.slice(0, 5).map((o) => o.email ?? o.name).join(', '), n: result.unmatchedOwners.length })}
              </p>
            )}
            <div className="inline-actions" style={{ justifyContent: 'flex-start' }}>
              <button className="btn" onClick={undo} disabled={busy}>
                {t('import.undo')}
              </button>
              <button className="btn btn--quiet" onClick={() => { setSheet(null); setResult(null); }}>
                {t('import.another')}
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  if (!sheet) {
    return (
      <div className="importer">
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
        {!compact && (
          <p className="field__hint">
            <a href={sampleCsv} download={t('import.sample.file')}>
              {t('import.sampleLink')}
            </a>
          </p>
        )}
      </div>
    );
  }

  const options = (
    <>
      <option value="skip">{t('import.target.skip')}</option>
      <option value="name">{t('import.target.name')}</option>
      <option value="owner">{t('import.target.owner')}</option>
      <option value="team">{t('import.target.team')}</option>
      <option value="externalId">{t('import.target.externalId')}</option>
      {fields.length > 0 && (
        <optgroup label={t('import.target.existing')}>
          {fields.map((f) => (
            <option key={f.key} value={`field:${f.key}`}>
              {labelOf(f.label, locale)}
            </option>
          ))}
        </optgroup>
      )}
      <optgroup label={t('import.target.new')}>
        {FIELD_TYPES.map((ty) => (
          <option key={ty} value={`new:${ty}`}>
            {t('import.target.newAs', { type: t(`fields.type.${ty}`) })}
          </option>
        ))}
      </optgroup>
    </>
  );

  return (
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
            <th>{t('import.col.sample')}</th>
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
                {sampleOf(h).map((v, i) => (
                  <span key={i}>{previewValue(h, v)}</span>
                ))}
              </td>
              <td>
                <select className="select" value={map[h]} aria-label={h} onChange={(e) => setMap({ ...map, [h]: e.target.value })}>
                  {options}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="importer__opts">
        <div className="field">
          <span className="field__label">{t('import.format')}</span>
          <div className="seg">
            {(['tr', 'en'] as Locale[]).map((l) => (
              <button key={l} type="button" aria-pressed={numLocale === l} onClick={() => setNumLocale(l)}>
                {l === 'tr' ? '1.250,50 · 31.12.2027' : '1,250.50 · 12/31/2027'}
              </button>
            ))}
          </div>
        </div>
        <label className="checkbox">
          <input type="checkbox" checked={runRules} onChange={(e) => setRunRules(e.target.checked)} />
          <span>{t('import.runRules')}</span>
        </label>
      </div>
      {!nameColumn && <p className="error-text">{t('import.needName')}</p>}
      {duplicate && <p className="error-text">{t('import.duplicate')}</p>}
      <div className="inline-actions" style={{ justifyContent: 'flex-start' }}>
        <button className="btn btn--primary" disabled={!nameColumn || duplicate || busy} onClick={run}>
          {busy ? t('common.saving') : t('import.go', { n: sheet.rows.length })}
        </button>
        <span className="field__hint">{t('import.safe')}</span>
      </div>
    </div>
  );
}
