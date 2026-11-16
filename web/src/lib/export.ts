// Files to download. Every list and report export is made by the server
// (POST /exports, api/src/routes/exports.ts): it checks the data.export
// permission, leaves out fields closed to the person's role, writes the export
// to the activity log and streams the file. This side asks for it and saves it.
// The activity-log download (AuditExport) still writes its CSV here, from rows
// the server handed over for that purpose.
import { csvSeparator } from '../../../shared/src/i18n';
import type { ApiError } from '../../../shared/src/model';
import { ApiFailure, previewAs } from './api';
import { getDeviceId } from './device';

export type Cell = string | number | null | undefined;
export interface Table {
  name: string;
  headers: string[];
  rows: Cell[][];
}

export type ExportFormat = 'xlsx' | 'csv';
type Owner = string | null | undefined;
/** What to export, in the shape POST /exports reads: the same filter the screen shows. */
export type ExportRequest =
  | { source: 'accounts'; q?: string; owner?: Owner; archived?: boolean }
  | { source: 'records'; type: string; q?: string; owner?: Owner; archived?: boolean; span?: { field: string; from: string; to: string } | null }
  | { source: 'board'; board: string; filters?: Record<string, unknown> }
  | { source: 'report'; name?: string; def: unknown };

// Text that starts like a formula is written as text, so a cell can never run as one.
const safeText = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

/** CSV for any tool; the byte-order mark lets Excel read every alphabet. */
export function toCsv(t: Table, sep = ','): string {
  const cell = (v: Cell) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'number' ? String(v) : safeText(String(v));
    return /["\n\r,;]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [t.headers, ...t.rows].map((r) => r.map(cell).join(sep)).join('\r\n');
}

function save(blob: Blob, file: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: file });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** A table already in hand, as CSV (the activity log). */
export function download(t: Table, _kind: 'csv', locale: string) {
  const stamp = new Date().toISOString().slice(0, 10);
  save(new Blob([toCsv(t, csvSeparator(locale))], { type: 'text/csv;charset=utf-8' }), `${t.name.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'export'} ${stamp}.csv`);
}

/** Asks the server for the file and saves it; answers how many rows it holds. */
export async function exportFile(req: ExportRequest, format: ExportFormat, locale: string): Promise<{ rows: number }> {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-curahold-device': getDeviceId(), 'x-curahold-locale': locale };
  const as = previewAs();
  if (as) headers['x-curahold-preview-as'] = as;
  const res = await fetch('/api/exports', { method: 'POST', headers, body: JSON.stringify({ ...req, format }), credentials: 'same-origin' });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null;
    throw new ApiFailure(res.status, body ?? { error: 'server', message: res.statusText });
  }
  const blob = await res.blob();
  const named = /filename\*=UTF-8''([^;]+)/i.exec(res.headers.get('content-disposition') ?? '');
  save(blob, named ? decodeURIComponent(named[1]) : `export.${format}`);
  return { rows: Number(res.headers.get('x-curahold-rows') ?? 0) };
}
