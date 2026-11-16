// Excel (.xlsx) and CSV files written as a stream: a page of rows goes out as
// soon as it is read, so a list of 20,000 rows never sits in memory whole.
// Used by every export (routes/exports.ts). Formula-safe: text that starts like
// a formula is written as text in a CSV, and as a typed text cell in Excel.
import { strToU8, Zip, ZipDeflate } from 'fflate';
import { csvSeparator, numberMarks, type Locale } from '../../../shared/src/i18n';

/** A cell: text, a number, a calendar day ({ day: 'YYYY-MM-DD' }) or an amount ({ money }). */
export type Cell = string | number | null | undefined | { day: string } | { money: number };
export type SheetFormat = 'xlsx' | 'csv';
export interface SheetHead {
  name: string;
  headers: string[];
  locale: Locale;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
// Text that starts like a formula is written as text, so a cell can never run as one.
const safeText = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
const isDay = (v: Cell): v is { day: string } => typeof v === 'object' && v !== null && 'day' in v;
const isMoney = (v: Cell): v is { money: number } => typeof v === 'object' && v !== null && 'money' in v;

function colName(i: number) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Days since 1899-12-30: how a spreadsheet keeps a date, shown in the reader's own date order. */
function serial(day: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  if (!m) return null;
  return Math.round((Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - Date.UTC(1899, 11, 30)) / 86_400_000);
}

const width = (v: Cell) => (v === null || v === undefined ? 0 : isDay(v) ? 10 : isMoney(v) ? String(v.money).length + 3 : String(v).length);

// -------------------------------------------------------------------- CSV

/**
 * CSV in the reader's own convention: where a decimal comma is used (Turkish Excel, say) the
 * separator is ";" and numbers carry a comma; days are written YYYY-MM-DD, which every
 * spreadsheet reads as a date. The byte-order mark lets Excel read every alphabet.
 */
function csvCoder(locale: Locale) {
  const sep = csvSeparator(locale);
  const comma = numberMarks(locale).decimal === ',';
  const num = (n: number) => (Number.isFinite(n) ? (comma ? String(n).replace('.', ',') : String(n)) : '');
  const cell = (v: Cell) => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return num(v);
    if (isMoney(v)) return num(v.money);
    if (isDay(v)) return v.day.slice(0, 10);
    const s = safeText(String(v));
    return /["\n\r]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return (rows: Cell[][]) => rows.map((r) => r.map(cell).join(sep) + '\r\n').join('');
}

// ------------------------------------------------------------------- XLSX

const STATIC: Record<string, string> = {
  '[Content_Types].xml':
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
  '_rels/.rels':
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  'xl/_rels/workbook.xml.rels':
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
  // Styles: 0 plain, 1 heading (bold), 2 a day (format 14: the reader's own short date), 3 an amount (#,##0.00 in their separators).
  'xl/styles.xml':
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="4"><xf fontId="0"/><xf fontId="1" applyFont="1"/><xf fontId="0" numFmtId="14" applyNumberFormat="1"/><xf fontId="0" numFmtId="4" applyNumberFormat="1"/></cellXfs></styleSheet>',
};

function xlsxCell(v: Cell, ref: string, head: boolean): string {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') return Number.isFinite(v) ? `<c r="${ref}"><v>${v}</v></c>` : '';
  if (isMoney(v)) return Number.isFinite(v.money) ? `<c r="${ref}" s="3"><v>${v.money}</v></c>` : '';
  if (isDay(v)) {
    const n = serial(v.day);
    return n === null ? '' : `<c r="${ref}" s="2"><v>${n}</v></c>`;
  }
  // A typed text cell (inlineStr) is never read as a formula, so nothing is added in front.
  return `<c r="${ref}" t="inlineStr"${head ? ' s="1"' : ''}><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
}

function xlsxRows(rows: Cell[][], from: number, head = false): string {
  return rows.map((r, i) => `<row r="${from + i}">${r.map((v, ci) => xlsxCell(v, `${colName(ci)}${from + i}`, head)).join('')}</row>`).join('');
}

// ----------------------------------------------------------------- stream

/**
 * The file as a stream. `pages` hands over the rows a page at a time; the first page also
 * sets the Excel column widths (the headings and those rows), then each page is written
 * and let go before the next is read.
 */
export function sheetStream(format: SheetFormat, head: SheetHead, pages: AsyncIterator<Cell[][]>): ReadableStream<Uint8Array> {
  let started = false;
  let done = false;
  if (format === 'csv') {
    const code = csvCoder(head.locale);
    return new ReadableStream<Uint8Array>({
      async pull(ctl) {
        try {
          if (!started) {
            started = true;
            ctl.enqueue(strToU8('﻿' + code([head.headers])));
            return;
          }
          const next = await pages.next();
          if (next.done) return ctl.close();
          if (next.value.length) ctl.enqueue(strToU8(code(next.value)));
        } catch (e) {
          ctl.error(e);
        }
      },
      cancel() {
        void pages.return?.();
      },
    });
  }
  // XLSX: a zip whose sheet is deflated as it is written; the zip hands back its bytes as they are made.
  let out: Uint8Array[] = [];
  const zip = new Zip((err, chunk, final) => {
    if (err) throw err;
    out.push(chunk);
    if (final) done = true;
  });
  const sheetName = esc(head.name.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Sheet1');
  let sheet: ZipDeflate | null = null;
  let row = 2;
  const flush = (ctl: ReadableStreamDefaultController<Uint8Array>) => {
    for (const c of out) ctl.enqueue(c);
    out = [];
  };
  // One step: the start (the fixed parts, the headings and the first page), then a page at a time, then the end.
  const step = async () => {
    if (!started) {
      started = true;
      for (const [path, xml] of Object.entries(STATIC)) {
        const f = new ZipDeflate(path, { level: 6 });
        zip.add(f);
        f.push(strToU8(xml), true);
      }
      const book = new ZipDeflate('xl/workbook.xml', { level: 6 });
      zip.add(book);
      book.push(
        strToU8(
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
        ),
        true,
      );
      const first = await pages.next();
      const rows = first.done ? [] : first.value;
      const cols = head.headers
        .map((h, i) => {
          const longest = Math.max(h.length, ...rows.slice(0, 200).map((r) => width(r[i])));
          return `<col min="${i + 1}" max="${i + 1}" width="${Math.min(60, Math.max(8, longest + 2))}" customWidth="1"/>`;
        })
        .join('');
      sheet = new ZipDeflate('xl/worksheets/sheet1.xml', { level: 6 });
      zip.add(sheet);
      sheet.push(
        strToU8(
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"${/^(ar|he|fa)$/.test(head.locale) ? ' rightToLeft="1"' : ''}><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols ? `<cols>${cols}</cols>` : ''}<sheetData>` +
            xlsxRows([head.headers], 1, true) +
            xlsxRows(rows, row),
        ),
      );
      row += rows.length;
      if (first.done) {
        sheet.push(strToU8('</sheetData></worksheet>'), true);
        zip.end();
      }
      return;
    }
    const next = await pages.next();
    if (next.done) {
      sheet!.push(strToU8('</sheetData></worksheet>'), true);
      zip.end();
    } else {
      sheet!.push(strToU8(xlsxRows(next.value, row)));
      row += next.value.length;
    }
  };
  return new ReadableStream<Uint8Array>({
    // The compressor may keep a page to itself; a pull that hands over nothing would leave the
    // reader waiting for ever, so steps go on until there are bytes to give or the file is whole.
    async pull(ctl) {
      try {
        do await step();
        while (!out.length && !done);
        flush(ctl);
        if (done) ctl.close();
      } catch (e) {
        ctl.error(e);
      }
    },
    cancel() {
      void pages.return?.();
    },
  });
}

/** The download's file name: the list's name and the day, without characters a file name cannot hold. */
export function fileName(name: string, format: SheetFormat, today: string): string {
  return `${name.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 80) || 'export'} ${today}.${format}`;
}

export const CONTENT_TYPE: Record<SheetFormat, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
};
