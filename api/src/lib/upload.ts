// One file from a multipart form, checked for size and given a safe name.
import { MAX_FILE_MB } from '../../../shared/src/model';
import type { C } from '../context';
import { fail } from './errors';

/**
 * Reads one uploaded file from a multipart form, refusing anything over MAX_FILE_MB before it is read ('file_too_large').
 */
export async function readUpload(c: C): Promise<{ name: string; size: number; mime: string; data: ArrayBuffer }> {
  const limit = MAX_FILE_MB * 1024 * 1024;
  if (Number(c.req.header('content-length') ?? 0) > limit + 64 * 1024) fail('file_too_large', { mb: MAX_FILE_MB });
  const form = await c.req.parseBody();
  const file = form.file;
  if (!(file instanceof File)) fail('validation', { fields: 'file' });
  const f = file as File;
  if (f.size > limit) fail('file_too_large', { mb: MAX_FILE_MB });
  // A pasted screenshot has no name of its own.
  const name = f.name.replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 200) || 'file';
  const data = await f.arrayBuffer();
  return { name, size: f.size, mime: trustedType(f.type, data), data };
}

/**
 * The type a file is kept and served as. The browser's word is taken, except for the
 * picture types that may be shown in a page: those must also start like that picture,
 * or the file is kept as plain bytes (only ever downloaded). Never an HTML or SVG page.
 */
export function trustedType(declared: string, data: ArrayBuffer): string {
  const type = (declared || 'application/octet-stream').toLowerCase().split(';')[0].trim();
  if (!INLINE_TYPES.has(type)) return /^[a-z]+\/[a-z0-9.+-]+$/.test(type) ? type : 'application/octet-stream';
  const b = new Uint8Array(data.slice(0, 12));
  const starts = (...xs: number[]) => xs.every((x, i) => b[i] === x);
  const ok =
    (type === 'image/png' && starts(0x89, 0x50, 0x4e, 0x47)) ||
    (type === 'image/jpeg' && starts(0xff, 0xd8, 0xff)) ||
    (type === 'image/gif' && starts(0x47, 0x49, 0x46, 0x38)) ||
    (type === 'image/webp' && starts(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50);
  return ok ? type : 'application/octet-stream';
}

/** Pictures a browser may show in the page; anything else is only ever downloaded. */
export const INLINE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
