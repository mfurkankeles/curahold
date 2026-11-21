// Uploads looked at before anyone opens them (api/src/lib/uploadScan.ts):
// the contents of customers' files (archive bomb limits, programs, macros,
// PDFs that run code), and — with a scanner configured — the quarantine:
// held, served to nobody, released when clean, deleted when infected.
import { createServer } from 'node:net';
import { zipSync, strToU8 } from 'fflate';
import { beforeAll, describe, expect, it } from 'vitest';
import { clamavScanner, verdictOf } from '../api/src/lib/clamav';
import { checkPortalFile } from '../api/src/lib/portal';
import { inspectContent, inspectPdf, inspectZip, quarantine, released, scanHeld, scanOne, type FileScanner, type ScanVerdict } from '../api/src/lib/uploadScan';
import { login, setup, type Client, type Env } from './helpers';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const zip = (files: Record<string, Uint8Array>, level: 0 | 9 = 6 as 9) => zipSync(files, { level });
const pdf = (body: string) => strToU8(`%PDF-1.4\n1 0 obj\n${body}\nendobj\n%%EOF\n`);

describe('what is inside a file', () => {
  it('a plain archive and an ordinary Word file pass', () => {
    expect(inspectContent(zip({ 'notes.txt': strToU8('hello'), 'img/a.png': new Uint8Array(100) }), 'application/zip')).toBeNull();
    expect(inspectContent(zip({ '[Content_Types].xml': strToU8('<Types/>'), 'word/document.xml': strToU8('<w:document/>'), 'word/embeddings/sheet.xlsx': zip({ 'x.xml': strToU8('<x/>') }) }), DOCX)).toBeNull();
  });

  it('archive bombs, programs, nested archives, climbing paths and broken directories are refused', () => {
    expect(inspectZip(zip({ 'zeros.bin': new Uint8Array(8 * 1024 * 1024) }, 9), true)).toBe('archive_bomb');
    expect(inspectZip(zip({ 'invoice.pdf.exe': new Uint8Array(10) }), true)).toBe('archive_program');
    expect(inspectZip(zip({ 'run.ps1': strToU8('Write-Host 1') }), true)).toBe('archive_program');
    expect(inspectZip(zip({ 'inner.zip': zip({ 'a.txt': strToU8('a') }) }), true)).toBe('archive_nested');
    expect(inspectZip(zip({ '../../etc/x.txt': strToU8('a') }), true)).toBe('archive_path');
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new Uint8Array(200)]);
    expect(inspectZip(bytes, true)).toBe('archive_broken');
  });

  it('an encrypted entry cannot be looked into, so it is refused', () => {
    const z = zip({ 'secret.txt': strToU8('secret') });
    // Set the "encrypted" flag in the central directory entry.
    for (let i = z.length - 22; i >= 0; i--)
      if (z[i] === 0x50 && z[i + 1] === 0x4b && z[i + 2] === 0x01 && z[i + 3] === 0x02) {
        z[i + 8] |= 1;
        break;
      }
    expect(inspectZip(z, true)).toBe('archive_encrypted');
  });

  it('Office macros, also in a file renamed to .docx', () => {
    expect(inspectContent(zip({ 'word/document.xml': strToU8('<w/>'), 'word/vbaProject.bin': new Uint8Array(50) }), DOCX)).toBe('macro');
  });

  it('PDFs that run code or carry files, also with escaped names; ordinary PDFs pass', () => {
    expect(inspectPdf(pdf('<< /Type /Catalog /Pages 2 0 R >>'))).toBeNull();
    expect(inspectPdf(pdf('<< /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >>'))).toBe('pdf_active');
    expect(inspectPdf(pdf('<< /OpenAction << /S /J#61vaScript >> >>'))).toBe('pdf_active');
    expect(inspectPdf(pdf('<< /S /Launch /F (cmd.exe) >>'))).toBe('pdf_active');
    expect(inspectPdf(pdf('<< /Type /EmbeddedFile >>'))).toBe('pdf_active');
    expect(inspectPdf(pdf('<< /JSON (not a script) /JSX 1 >>'))).toBeNull();
  });

  it('the portal refuses an unsafe file by name, before anything is stored', async () => {
    const bomb = new File([zip({ 'zeros.bin': new Uint8Array(8 * 1024 * 1024) }, 9)], 'report.zip');
    await expect(checkPortalFile(bomb)).rejects.toMatchObject({ code: 'portal_file_unsafe' });
    const ok = new File([zip({ 'a.txt': strToU8('a') })], 'report.zip');
    expect((await checkPortalFile(ok)).mime).toBe('application/zip');
  });
});

describe('the quarantine, with a scanner configured', () => {
  let env: Env;
  let ada: Client;
  const verdicts: ScanVerdict[] = [];
  const scanner: FileScanner = { name: 'test', scan: async () => verdicts.shift() ?? { verdict: 'error', note: 'scanner down' } };
  beforeAll(async () => {
    env = await setup();
    ada = await login(env, 'acme', 'ada@demo.example');
  });
  const upload = async () => {
    const task = (await ada.post('/api/tasks', { boardId: env.a.boards.csBoard, title: 'With a file to scan' })).json.task;
    const form = new FormData();
    form.append('file', new File([strToU8('quarterly numbers')], 'numbers.txt', { type: 'text/plain' }));
    const up = await ada.req('POST', `/api/tasks/${task.id}/files`, form);
    expect(up.status).toBe(201);
    const [row] = await env.db.system((q) => q.query('select id, org_id, storage_key from files where id = $1', [up.json.file.id]));
    return row as { id: string; org_id: string; storage_key: string };
  };

  it('without a scanner nothing is held', async () => {
    const f = await upload();
    expect(await released(env.deps, f.org_id, f.storage_key)).toBe(true);
    expect((await ada.get(`/api/files/${f.id}`)).status).toBe(200);
  });

  it('held until clean; the scanner down keeps it held and the hourly sweep tries again', async () => {
    (env.deps as any).scanner = scanner;
    verdicts.push({ verdict: 'error', note: 'scanner down' });
    const f = await upload();
    await env.settle();
    const held = await ada.get(`/api/files/${f.id}`);
    expect(held.status).toBe(423);
    expect(held.json.error).toBe('file_quarantined');
    verdicts.push({ verdict: 'clean' });
    expect(await scanHeld(env.deps as any)).toBeGreaterThanOrEqual(1);
    expect((await ada.get(`/api/files/${f.id}`)).status).toBe(200);
  });

  // Security audit L7: a help request's files are opened by support staff, so they wait for the scanner too.
  it("a help request's files are held until clean, on the person's link and the desk's", async () => {
    (env.deps as any).scanner = scanner;
    verdicts.push({ verdict: 'error', note: 'scanner down' });
    const form = new FormData();
    form.set('data', JSON.stringify({ category: 'question', subject: 'A file for support', description: 'The export I mean is attached here.' }));
    form.append('files', new File([strToU8('the export')], 'export.txt', { type: 'text/plain' }));
    const made = await ada.req('POST', '/api/help', form);
    expect(made.status).toBe(201);
    await env.settle();
    const [row] = await env.db.system((q) => q.query<{ id: string; org_id: string; storage_key: string }>(`select id, org_id, storage_key from help_files where request_id = $1`, [made.json.request.id]));
    expect(await released(env.deps, row.org_id, row.storage_key)).toBe(false);
    const held = await ada.get(`/api/help/files/${row.id}`);
    expect([held.status, held.json.error]).toEqual([423, 'file_quarantined']);
    verdicts.push({ verdict: 'clean' });
    expect(await scanHeld(env.deps as any)).toBeGreaterThanOrEqual(1);
    expect((await ada.get(`/api/help/files/${row.id}`)).status).toBe(200);
  });

  it('infected: the bytes are deleted, it stays refused, and the owner console hears it', async () => {
    verdicts.push({ verdict: 'infected', signature: 'Eicar-Test-Signature' });
    const f = await upload();
    await env.settle();
    expect(await env.storage.get(f.storage_key)).toBeNull();
    expect((await ada.get(`/api/files/${f.id}`)).status).toBe(423);
    const [a] = await env.db.system((q) => q.query(`select body from company_log where kind = 'alert' and ref like 'scan:infected:%'`));
    expect(a.body).toContain('Eicar-Test-Signature');
    // A second look changes nothing (already gone).
    expect(await scanOne(env.deps as any, f.org_id, f.storage_key)).toBe('gone');
    expect(await released(env.deps, f.org_id, f.storage_key)).toBe(false);
  });

  it('quarantine is a no-op without a scanner', async () => {
    expect(await quarantine({ ...(env.deps as any), scanner: undefined }, '00000000-0000-0000-0000-000000000000', 'x/y')).toBe(false);
  });
});

describe('ClamAV (clamd INSTREAM)', () => {
  it('reads clamd’s answers', () => {
    expect(verdictOf('stream: OK\0')).toEqual({ verdict: 'clean' });
    expect(verdictOf('stream: Eicar-Test-Signature FOUND\0')).toEqual({ verdict: 'infected', signature: 'Eicar-Test-Signature' });
    expect(verdictOf('INSTREAM size limit exceeded. ERROR\0').verdict).toBe('error');
  });

  it('speaks the protocol to a clamd on the network, and says error when none answers', async () => {
    const got: Buffer[] = [];
    const server = createServer((s) => {
      s.on('data', (d) => {
        got.push(Buffer.from(d));
        const all = Buffer.concat(got);
        if (all.length >= 14 && all.subarray(-4).equals(Buffer.alloc(4))) s.end(all.includes('X5O!P%@AP') ? 'stream: Eicar-Test-Signature FOUND\0' : 'stream: OK\0');
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const port = (server.address() as { port: number }).port;
    const scan = clamavScanner({ host: '127.0.0.1', port, timeoutMs: 5000 });
    expect(await scan.scan(strToU8('ordinary text'))).toEqual({ verdict: 'clean' });
    got.length = 0;
    expect((await scan.scan(strToU8('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR'))).verdict).toBe('infected');
    expect(Buffer.concat(got).subarray(0, 10).toString()).toBe('zINSTREAM\0');
    await new Promise<void>((r) => server.close(() => r()));
    expect((await clamavScanner({ host: '127.0.0.1', port, timeoutMs: 2000 }).scan(strToU8('x'))).verdict).toBe('error');
  });
});
