// Excel (.xlsx) and CSV files made in the browser from what the person is
// looking at — no server work, and nothing they may not see can be in it
// (the rows come from the same answers the screen shows).
import { strToU8, zipSync } from 'fflate';
import { labelOf } from '../../../shared/src/fields';
import type { AccountField } from '../../../shared/src/model';

export type Cell = string | number | null | undefined;
export interface Table {
  name: string;
  headers: string[];
  rows: Cell[][];
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

function colName(i: number) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

// Text that starts like a formula is written as text, so a cell can never run as one.
const safeText = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

function sheetXml(t: Table) {
  const all = [t.headers, ...t.rows];
  const rows = all
    .map((r, ri) => {
      const cells = r
        .map((v, ci) => {
          const ref = `${colName(ci)}${ri + 1}`;
          if (v === null || v === undefined || v === '') return '';
          if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${ri === 0 ? ' s="1"' : ''}><v>${v}</v></c>`;
          return `<c r="${ref}" t="inlineStr"${ri === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${esc(safeText(String(v)))}</t></is></c>`;
        })
        .join('');
      return `<row r="${ri + 1}">${cells}</row>`;
    })
    .join('');
  const widths = t.headers
    .map((h, i) => {
      const longest = Math.max(h.length, ...t.rows.slice(0, 200).map((r) => String(r[i] ?? '').length));
      return `<col min="${i + 1}" max="${i + 1}" width="${Math.min(60, Math.max(8, longest + 2))}" customWidth="1"/>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths}</cols><sheetData>${rows}</sheetData></worksheet>`;
}

export function toXlsx(t: Table): Uint8Array {
  const sheetName = esc(t.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet1');
  return zipSync({
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ),
    'xl/workbook.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    ),
    'xl/styles.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0"/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>',
    ),
    'xl/worksheets/sheet1.xml': strToU8(sheetXml(t)),
  });
}

/** CSV for any tool; the byte-order mark lets Excel read Turkish letters right. */
export function toCsv(t: Table, sep = ','): string {
  const cell = (v: Cell) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'number' ? String(v) : safeText(String(v));
    return /["\n\r,;]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [t.headers, ...t.rows].map((r) => r.map(cell).join(sep)).join('\r\n');
}

export function download(t: Table, kind: 'xlsx' | 'csv', locale: string) {
  const stamp = new Date().toISOString().slice(0, 10);
  const file = `${t.name.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'export'} ${stamp}.${kind}`;
  // Turkish Excel opens comma-separated files as one column; it expects ";".
  const blob =
    kind === 'xlsx'
      ? new Blob([toXlsx(t) as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      : new Blob([toCsv(t, locale === 'tr' ? ';' : ',')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: file });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** A field value as a spreadsheet cell: numbers stay numbers, choices become their label. */
export function cellOf(f: AccountField, v: unknown, locale: 'en' | 'tr'): Cell {
  if (v === null || v === undefined || v === '') return null;
  if (f.type === 'money' || f.type === 'number') return Number(v);
  if (f.type === 'select') return labelOf(f.options?.find((o) => o.key === v)?.label, locale) || String(v);
  return String(v);
}

/** Every page of a list (up to 5,000 rows), for exporting all of it rather than what is loaded. */
export async function allPages<T>(fetchPage: (offset: number) => Promise<{ items: T[]; total: number }>): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; offset < 5000; offset += 500) {
    const page = await fetchPage(offset);
    out.push(...page.items);
    if (out.length >= page.total || page.items.length === 0) break;
  }
  return out;
}
