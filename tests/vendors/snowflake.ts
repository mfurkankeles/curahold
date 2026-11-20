// Snowflake SQL API v2 as documented: key-pair authentication (a JWT the client signs itself, sent with
// X-Snowflake-Authorization-Token-Type: KEYPAIR_JWT), POST /api/v2/statements with positional bindings,
// resultSetMetaData.rowType + data as strings (timestamps as seconds with a fraction), 202 + statementHandle
// while running; errors as { code, message, sqlState }; 429 when too many statements are queued. Read only.
import { generateKeyPairSync } from 'node:crypto';
import { json, type Ctl, type MockReq, type VendorMock } from './kit';

// A key made for this run only.
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const ROWTYPE = [
  { name: 'CUSTOMER_ID', type: 'text' },
  { name: 'NAME', type: 'text' },
  { name: 'HEALTH_SCORE', type: 'fixed' },
  { name: 'UPDATED_AT', type: 'timestamp_ntz' },
];
let rows: { id: string; name: string; score: number; at: number }[] = [];
const err = (status: number, code: string, message: string) => json({ code, message, sqlState: '08001', statementHandle: 'mock-handle' }, status);

export const snowflakeMock: VendorMock = {
  id: 'snowflake',
  hosts: /^qf12345\.eu-west-1\.snowflakecomputing\.com$/,
  keyValues: { account: 'qf12345.eu-west-1', user: 'CURAHOLD_READER', privateKey, name: 'customer-health', query: 'SELECT customer_id, name, health_score, updated_at FROM analytics.crm.health', idColumn: 'CUSTOMER_ID', modifiedColumn: 'UPDATED_AT' },
  reset() {
    const t = Date.parse('2026-11-18T08:00:00Z') / 1000;
    rows = [
      { id: 'C-1', name: 'Pinecrest Foods', score: 82, at: t },
      { id: 'C-2', name: 'Orbital Freight', score: 41, at: t },
    ];
  },
  remoteEdit(ctl, name) {
    rows[1].name = name;
    rows[1].at = ctl.now().getTime() / 1000;
    return { id: 'C-2' };
  },
  remoteRow: (_o, id) => rows.find((r) => r.id === id),
  handle(req: MockReq, ctl: Ctl) {
    const auth = req.headers.get('authorization') ?? '';
    if (ctl.revoked() || !/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/.test(auth) || req.headers.get('x-snowflake-authorization-token-type') !== 'KEYPAIR_JWT') return err(401, '390144', 'JWT token is invalid.');
    if (ctl.take('ratelimit')) return err(429, '000610', 'Too many statements are queued for this warehouse.');
    if (req.url.pathname === '/api/v2/statements' && req.method === 'POST') {
      const sql: string = req.body.statement ?? '';
      if (!/analytics\.crm\.health/i.test(sql)) return err(422, '002003', "SQL compilation error: Object 'ANALYTICS.CRM.HEALTH' does not exist or not authorized.");
      const meta = { numRows: 0, format: 'jsonv2', rowType: ROWTYPE, partitionInfo: [{ rowCount: 0 }] };
      if (/LIMIT 0/.test(sql)) return json({ resultSetMetaData: meta, data: [], code: '090001', statementHandle: 'mock-schema' });
      const since = req.body.bindings?.['1']?.value;
      const from = since ? Date.parse(since) / 1000 : 0;
      const hit = rows.filter((r) => r.at >= from).sort((a, b) => a.at - b.at);
      return json({ resultSetMetaData: { ...meta, numRows: hit.length, partitionInfo: [{ rowCount: hit.length }] }, data: hit.map((r) => [r.id, r.name, String(r.score), `${r.at.toFixed(9)}`]), code: '090001', statementHandle: 'mock-read' });
    }
    return err(404, '390404', 'Not found');
  },
};
