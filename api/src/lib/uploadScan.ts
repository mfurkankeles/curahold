// Uploads, looked at before anyone opens them — free, on every hosting:
//
// 1. Always (customers' files from the portal): the ending and the first bytes
//    already match (lib/portal.ts checkPortalFile); then inspectContent reads
//    the inside without unpacking anything — a ZIP's directory (archive bomb
//    limits: entries, total unpacked size, ratio; no encrypted, nested or
//    program entries, no paths that climb out), Office macros (vbaProject.bin),
//    and PDFs that run code or carry files (/JavaScript, /JS, /Launch,
//    /EmbeddedFile). A refused file is never stored.
// 2. Optionally a scanner (self-host: ClamAV's clamd, lib/clamav.ts, with
//    CLAMAV_HOST): a stored upload is quarantined (a file_scans row) and served
//    to nobody until the scanner says clean; infected → the bytes are deleted
//    and the owner console hears it. Scanner down → it stays quarantined and the
//    hourly job tries again. Without a scanner nothing is quarantined.
import type { Deps } from '../context';

export const ARCHIVE_LIMITS = {
  entries: 2000,
  /** Total unpacked size, MB. */
  unpackedMb: 250,
  /** One entry's unpacked/packed ratio above this (and over 1 MB unpacked) is a bomb. */
  ratio: 120,
} as const;

/** Endings that run as programs or scripts when opened. */
const PROGRAMS = /\.(exe|dll|com|scr|pif|msi|msp|bat|cmd|ps1|psm1|vbs|vbe|js|jse|wsf|wsh|hta|cpl|jar|lnk|sh|app|apk|dmg|iso|reg|scf|inf)$/i;
/** Endings of archives inside a plain ZIP (cannot be looked into). */
const ARCHIVES = /\.(zip|7z|rar|gz|tgz|bz2|xz|tar|cab|zipx|arj|lzh|ace)$/i;

export type UnsafeReason = 'archive_bomb' | 'archive_encrypted' | 'archive_nested' | 'archive_program' | 'archive_path' | 'archive_broken' | 'macro' | 'pdf_active';

const ZIP_MIMES = new Set([
  'application/zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
]);

/** Looks inside a file whose type is already known. null: nothing found. */
export function inspectContent(data: ArrayBuffer | Uint8Array, mime: string): UnsafeReason | null {
  const b = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (ZIP_MIMES.has(mime)) return inspectZip(b, mime === 'application/zip');
  if (mime === 'application/pdf') return inspectPdf(b);
  return null;
}

/** A ZIP's central directory, read without unpacking. */
export function inspectZip(b: Uint8Array, plain: boolean): UnsafeReason | null {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  // The end record: within the last 64 KiB + 22 bytes.
  let end = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65_557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) return 'archive_broken';
  const count = v.getUint16(end + 10, true);
  const size = v.getUint32(end + 12, true);
  const start = v.getUint32(end + 16, true);
  // ZIP64 markers: far beyond what an upload of this size holds honestly.
  if (count === 0xffff || size === 0xffffffff || start === 0xffffffff) return 'archive_bomb';
  if (count > ARCHIVE_LIMITS.entries) return 'archive_bomb';
  if (start + size > b.length) return 'archive_broken';
  let p = start;
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > b.length || v.getUint32(p, true) !== 0x02014b50) return 'archive_broken';
    const flags = v.getUint16(p + 8, true);
    const packed = v.getUint32(p + 20, true);
    const unpacked = v.getUint32(p + 24, true);
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const commentLen = v.getUint16(p + 32, true);
    const name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (flags & 0x1) return 'archive_encrypted';
    if (packed === 0xffffffff || unpacked === 0xffffffff) return 'archive_bomb';
    total += unpacked;
    if (total > ARCHIVE_LIMITS.unpackedMb * 1024 * 1024) return 'archive_bomb';
    if (unpacked > 1024 * 1024 && unpacked / Math.max(1, packed) > ARCHIVE_LIMITS.ratio) return 'archive_bomb';
    if (name.startsWith('/') || name.startsWith('\\') || /(^|[\\/])\.\.([\\/]|$)/.test(name) || /^[a-z]:/i.test(name)) return 'archive_path';
    if (/(^|\/)vbaProject\.bin$/i.test(name) || /\.(docm|xlsm|pptm|dotm|xltm)$/i.test(name)) return 'macro';
    if (PROGRAMS.test(name)) return 'archive_program';
    if (plain && ARCHIVES.test(name)) return 'archive_nested';
  }
  return null;
}

/** Active PDF content: names may be written with #xx escapes, so they are read decoded. */
export function inspectPdf(b: Uint8Array): UnsafeReason | null {
  let s = '';
  for (let i = 0; i < b.length; i += 65_536) s += String.fromCharCode(...b.subarray(i, Math.min(b.length, i + 65_536)));
  const names = s.replace(/\/([A-Za-z0-9#]{2,40})/g, (_m, n: string) => `/${n.replace(/#([0-9a-fA-F]{2})/g, (_x, h: string) => String.fromCharCode(parseInt(h, 16)))}`);
  return /\/(JavaScript|JS|Launch|EmbeddedFile)(?![A-Za-z])/.test(names) ? 'pdf_active' : null;
}

// ------------------------------------------------------------ the optional scanner and the quarantine

export type ScanVerdict = { verdict: 'clean' } | { verdict: 'infected'; signature: string } | { verdict: 'error'; note: string };

/** A scanner (ClamAV on self-host, or any other): the bytes in, a verdict out. */
export interface FileScanner {
  name: string;
  scan(data: Uint8Array): Promise<ScanVerdict>;
}

/** Holds a stored upload back until the scanner has looked (no scanner: nothing is held). */
export async function quarantine(deps: Deps, orgId: string, storageKey: string): Promise<boolean> {
  if (!deps.scanner) return false;
  await deps.db.system((q) => q.query(`insert into file_scans (org_id, storage_key) values ($1, $2) on conflict do nothing`, [orgId, storageKey]));
  // Looked at right after the answer; the hourly job picks up what this misses.
  if (deps.defer) deps.defer(scanOne(deps, orgId, storageKey).catch(() => undefined));
  return true;
}

/** May this stored file be served? false while it waits for the scanner, or after it was found infected. */
export async function released(deps: Pick<Deps, 'db'>, orgId: string, storageKey: string): Promise<boolean> {
  const [r] = await deps.db.system((q) => q.query(`select status from file_scans where org_id = $1 and storage_key = $2`, [orgId, storageKey]));
  return !r;
}

/** Scans one held file: clean → released (the row goes); infected → the bytes go and the owner hears it; error → tried again later. */
export async function scanOne(deps: Deps, orgId: string, storageKey: string): Promise<'clean' | 'infected' | 'error' | 'gone'> {
  const scanner = deps.scanner;
  if (!scanner) return 'error';
  const obj = await deps.storage.get(storageKey);
  if (!obj) {
    await deps.db.system((q) => q.query(`delete from file_scans where org_id = $1 and storage_key = $2 and status <> 'infected'`, [orgId, storageKey]));
    return 'gone';
  }
  const v = await scanner.scan(new Uint8Array(obj.data)).catch((e): ScanVerdict => ({ verdict: 'error', note: e instanceof Error ? e.message : String(e) }));
  if (v.verdict === 'clean') {
    await deps.db.system((q) => q.query(`delete from file_scans where org_id = $1 and storage_key = $2`, [orgId, storageKey]));
    return 'clean';
  }
  if (v.verdict === 'infected') {
    await deps.storage.delete(storageKey).catch(() => undefined);
    await deps.db.system(async (q) => {
      await q.query(`update file_scans set status = 'infected', note = $3, scanned_at = now(), attempts = attempts + 1 where org_id = $1 and storage_key = $2`, [orgId, storageKey, v.signature.slice(0, 200)]);
      await q.query(
        `insert into company_log (seat, kind, body, ref, meta) select 'system', 'alert', $1, $2, $3 where not exists (select 1 from company_log where ref = $2)`,
        [`Upload scan: a file was found infected (${v.signature.slice(0, 80)}) and deleted`, `scan:infected:${orgId}:${storageKey.slice(-36)}`, JSON.stringify({ org_id: orgId, scanner: scanner.name })],
      );
    });
    console.warn('[curahold] upload infected', JSON.stringify({ org: orgId, signature: v.signature.slice(0, 80) }));
    return 'infected';
  }
  await deps.db.system((q) => q.query(`update file_scans set status = 'error', note = $3, scanned_at = now(), attempts = attempts + 1 where org_id = $1 and storage_key = $2 and status <> 'infected'`, [orgId, storageKey, v.note.slice(0, 200)]));
  return 'error';
}

/** The hourly job: what is still held (scanner was down, or the instance stopped), oldest first. */
export async function scanHeld(deps: Deps, limit = 100): Promise<number> {
  if (!deps.scanner) return 0;
  const rows = await deps.db.system((q) =>
    q.query<{ org_id: string; storage_key: string }>(`select org_id, storage_key from file_scans where status in ('pending', 'error') and attempts < 24 order by created_at limit $1`, [limit]),
  );
  let done = 0;
  for (const r of rows) if ((await scanOne(deps, r.org_id, r.storage_key)) !== 'error') done++;
  return done;
}
