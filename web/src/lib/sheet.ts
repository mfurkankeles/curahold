// Reading a spreadsheet in the browser: CSV (any delimiter, quoted fields)
// and Excel .xlsx (first sheet; dates come out as YYYY-MM-DD). The file
// never leaves the browser until the person confirms the import.
import { strFromU8, unzipSync } from 'fflate';

export interface Sheet {
  headers: string[];
  rows: Record<string, string>[];
}

const MAX_ROWS = 5000;

function toSheet(matrix: string[][]): Sheet {
  const nonEmpty = matrix.filter((r) => r.some((c) => c.trim() !== ''));
  if (!nonEmpty.length) return { headers: [], rows: [] };
  const seen = new Map<string, number>();
  const headers = nonEmpty[0].map((h, i) => {
    let name = h.trim() || `#${i + 1}`;
    const n = seen.get(name) ?? 0;
    seen.set(name, n + 1);
    if (n) name = `${name} (${n + 1})`;
    return name;
  });
  const rows = nonEmpty.slice(1, MAX_ROWS + 1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()])));
  return { headers, rows };
}

export function parseCsv(text: string): Sheet {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delim = [';', '\t', ','].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      out.push(row);
      row = [];
      cell = '';
      if (out.length > MAX_ROWS + 1) break;
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    out.push(row);
  }
  return toSheet(out);
}

const DATE_FORMAT_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

function colIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function serialToIso(serial: number): string {
  const ms = Date.UTC(1899, 11, 30) + Math.round(serial * 86400) * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

const text = (el: Element | null | undefined) => (el ? Array.from(el.getElementsByTagName('t')).map((t) => t.textContent ?? '').join('') : '');

export function parseXlsx(buf: ArrayBuffer): Sheet {
  const files = unzipSync(new Uint8Array(buf));
  const xml = (path: string) => (files[path] ? new DOMParser().parseFromString(strFromU8(files[path]), 'application/xml') : null);
  // First sheet in workbook order.
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const wb = xml('xl/workbook.xml');
  const rels = xml('xl/_rels/workbook.xml.rels');
  const first = wb?.getElementsByTagName('sheet')[0];
  const rid = first?.getAttribute('r:id') ?? first?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
  if (rid && rels) {
    const rel = Array.from(rels.getElementsByTagName('Relationship')).find((r) => r.getAttribute('Id') === rid);
    const target = rel?.getAttribute('Target');
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  }
  const strings = Array.from(xml('xl/sharedStrings.xml')?.getElementsByTagName('si') ?? []).map((si) => text(si));
  const styles = xml('xl/styles.xml');
  const customDate = new Set<number>();
  for (const f of Array.from(styles?.getElementsByTagName('numFmt') ?? [])) {
    const code = (f.getAttribute('formatCode') ?? '').replace(/"[^"]*"|\[[^\]]*\]/g, '');
    if (/[dmy]/i.test(code) && !/^[#0.,%]+$/.test(code)) customDate.add(Number(f.getAttribute('numFmtId')));
  }
  const xfs = styles?.getElementsByTagName('cellXfs')[0];
  const dateStyle = Array.from(xfs?.getElementsByTagName('xf') ?? []).map((xf) => {
    const id = Number(xf.getAttribute('numFmtId') ?? 0);
    return DATE_FORMAT_IDS.has(id) || customDate.has(id);
  });
  const sheet = xml(sheetPath);
  const matrix: string[][] = [];
  for (const r of Array.from(sheet?.getElementsByTagName('row') ?? [])) {
    if (matrix.length > MAX_ROWS + 1) break;
    const row: string[] = [];
    for (const c of Array.from(r.getElementsByTagName('c'))) {
      const i = colIndex(c.getAttribute('r') ?? 'A');
      const type = c.getAttribute('t');
      const v = c.getElementsByTagName('v')[0]?.textContent ?? '';
      let value: string;
      if (type === 's') value = strings[Number(v)] ?? '';
      else if (type === 'inlineStr') value = text(c.getElementsByTagName('is')[0]);
      else if (type === 'b') value = v === '1' ? 'TRUE' : 'FALSE';
      else if (type === 'str' || type === 'e') value = v;
      else if (v !== '' && dateStyle[Number(c.getAttribute('s') ?? 0)]) value = serialToIso(Number(v));
      else value = v;
      row[i] = value;
    }
    matrix.push(Array.from(row, (x) => x ?? ''));
  }
  return toSheet(matrix);
}

export async function readSheet(file: File): Promise<Sheet> {
  if (/\.xlsx$/i.test(file.name)) return parseXlsx(await file.arrayBuffer());
  return parseCsv(await file.text());
}
