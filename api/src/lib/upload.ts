// One file from a multipart form, checked for size and given a safe name.
import { MAX_FILE_MB } from '../../../shared/src/model';
import type { C } from '../context';
import { fail } from './errors';

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
  return { name, size: f.size, mime: f.type || 'application/octet-stream', data: await f.arrayBuffer() };
}

/** Pictures a browser may show in the page; anything else is only ever downloaded. */
export const INLINE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
