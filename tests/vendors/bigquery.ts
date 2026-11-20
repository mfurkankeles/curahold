// BigQuery REST v2 as documented: a service-account key signs a JWT the Google token endpoint exchanges (answered
// by the Google mock), jobs.query (POST /projects/<p>/queries: useLegacySql false, named parameters, dryRun for the
// schema, maxResults, jobComplete/pageToken/jobReference), getQueryResults for later pages, values as strings in
// { f: [{ v }] } rows and TIMESTAMP as seconds; errors as { error: { code, message, errors, status } };
// 403 rateLimitExceeded / 429 when the project's quota is used up. Read only.
import { generateKeyPairSync } from 'node:crypto';
import { gate, json, type Ctl, type MockReq, type VendorMock } from './kit';

// An invented service account with a key made for this run only: nothing real is ever in the repository.
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const SA = { type: 'service_account', project_id: 'quillfield-analytics', client_email: 'curahold-reader@quillfield-analytics.iam.gserviceaccount.example', private_key: privateKey };
const SCHEMA = [
  { name: 'customer_id', type: 'STRING' },
  { name: 'name', type: 'STRING' },
  { name: 'health_score', type: 'INTEGER' },
  { name: 'updated_at', type: 'TIMESTAMP' },
];
let rows: { customer_id: string; name: string; health_score: number; updated_at: number }[] = [];
const err = (code: number, reason: string, message: string) => json({ error: { code, message, errors: [{ message, domain: 'global', reason }], status: code === 429 ? 'RESOURCE_EXHAUSTED' : 'INVALID_ARGUMENT' } }, code);
const unauthorized = () => err(401, 'authError', 'Request had invalid authentication credentials.');
const limited = () => err(429, 'rateLimitExceeded', 'Exceeded rate limits: too many concurrent queries for this project_and_region.');
const answer = (list: typeof rows) => ({ kind: 'bigquery#queryResponse', jobComplete: true, jobReference: { projectId: SA.project_id, jobId: 'job_mock_1', location: 'EU' }, schema: { fields: SCHEMA }, totalRows: String(list.length), rows: list.map((r) => ({ f: [{ v: r.customer_id }, { v: r.name }, { v: String(r.health_score) }, { v: `${r.updated_at}.0` }] })) });

export const bigqueryMock: VendorMock = {
  id: 'bigquery',
  hosts: /^bigquery\.googleapis\.com$/,
  keyValues: { serviceAccount: JSON.stringify(SA), name: 'customer-health', query: 'SELECT customer_id, name, health_score, updated_at FROM `quillfield-analytics.crm.health`', idColumn: 'customer_id', modifiedColumn: 'updated_at', location: 'EU' },
  reset() {
    const t = Date.parse('2026-11-18T08:00:00Z') / 1000;
    rows = [
      { customer_id: 'C-1', name: 'Pinecrest Foods', health_score: 82, updated_at: t },
      { customer_id: 'C-2', name: 'Orbital Freight', health_score: 41, updated_at: t },
    ];
  },
  remoteEdit(ctl, name) {
    rows[1].name = name;
    rows[1].updated_at = ctl.now().getTime() / 1000;
    return { id: 'C-2' };
  },
  remoteRow: (_o, id) => rows.find((r) => r.customer_id === id),
  async handle(req: MockReq, ctl: Ctl) {
    const stop = gate('bigquery', req, ctl, { unauthorized, limited });
    if (stop) return stop;
    const p = req.url.pathname;
    if (p === `/bigquery/v2/projects/${SA.project_id}/queries` && req.method === 'POST') {
      const q: string = req.body.query ?? '';
      if (!/quillfield-analytics\.crm\.health/.test(q)) return err(404, 'notFound', 'Not found: Table quillfield-analytics:crm.health');
      if (req.body.dryRun) return json({ kind: 'bigquery#queryResponse', jobComplete: true, schema: { fields: SCHEMA }, totalBytesProcessed: '1024' });
      const since = req.body.queryParameters?.find((x: any) => x.name === 'since')?.parameterValue?.value;
      const from = since ? Date.parse(since) / 1000 : 0;
      return json(answer(rows.filter((r) => r.updated_at >= from).sort((a, b) => a.updated_at - b.updated_at)));
    }
    if (p.startsWith(`/bigquery/v2/projects/${SA.project_id}/queries/`)) return json(answer([]));
    return err(404, 'notFound', `Not found: ${p}`);
  },
};
