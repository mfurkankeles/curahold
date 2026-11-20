// ClamAV's clamd over TCP (INSTREAM), for a self-hosted install: free and
// open source. Set CLAMAV_HOST (and CLAMAV_PORT, default 3310); e.g. the
// clamav/clamav image beside the app in docker-compose. Node only.
import { connect } from 'node:net';
import type { FileScanner, ScanVerdict } from './uploadScan';

export function clamavScanner(opts: { host: string; port?: number; timeoutMs?: number }): FileScanner {
  return {
    name: 'clamav',
    scan: (data) =>
      new Promise<ScanVerdict>((resolve) => {
        const sock = connect({ host: opts.host, port: opts.port ?? 3310 });
        let reply = '';
        const done = (v: ScanVerdict) => {
          sock.destroy();
          resolve(v);
        };
        sock.setTimeout(opts.timeoutMs ?? 30_000, () => done({ verdict: 'error', note: 'clamd timeout' }));
        sock.on('error', (e) => done({ verdict: 'error', note: e.message }));
        sock.on('data', (d) => (reply += d.toString('utf8')));
        sock.on('end', () => done(verdictOf(reply)));
        sock.on('connect', () => {
          sock.write('zINSTREAM\0');
          for (let i = 0; i < data.length; i += 64 * 1024) {
            const chunk = data.subarray(i, i + 64 * 1024);
            const len = Buffer.alloc(4);
            len.writeUInt32BE(chunk.length);
            sock.write(len);
            sock.write(chunk);
          }
          sock.write(Buffer.alloc(4));
        });
      }),
  };
}

/** "stream: OK", "stream: Eicar-Test-Signature FOUND", or an error line. */
export function verdictOf(reply: string): ScanVerdict {
  const r = reply.replace(/\0/g, '').trim();
  if (/:\s*OK$/.test(r)) return { verdict: 'clean' };
  const m = /:\s*(.+)\s+FOUND$/.exec(r);
  if (m) return { verdict: 'infected', signature: m[1] };
  return { verdict: 'error', note: r.slice(0, 200) || 'no answer' };
}
