// Google as documented, for Sheets (and the shared sign-in other Google products use): OAuth at
// accounts.google.com with offline access, tokens at oauth2.googleapis.com (an id_token carries the email;
// the JWT-bearer grant serves service-account keys), Sheets API v4 (spreadsheet properties, values with
// UNFORMATTED_VALUE, values:batchUpdate); errors as { error: { code, message, status } }; 429 RESOURCE_EXHAUSTED.
import { allow, gate, json, tokenEndpoint, type Ctl, type MockReq, type VendorMock } from './kit';

export const SHEET_ID = '1QuillfieldMockSheet0000000000000000000000';
let grid: unknown[][] = [];
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const err = (code: number, status: string, message: string) => json({ error: { code, message, status } }, code);
const unauthorized = () => err(401, 'UNAUTHENTICATED', 'Request had invalid authentication credentials. Expected OAuth 2 access token.');
const limited = () => err(429, 'RESOURCE_EXHAUSTED', "Quota exceeded for quota metric 'Read requests' and limit 'Read requests per minute per user'.");
const colIndex = (letters: string) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

export const googleMock: VendorMock = {
  id: 'gsheets',
  hosts: /^(accounts\.google\.com|oauth2\.googleapis\.com|sheets\.googleapis\.com)$/,
  reset() {
    grid = [
      ['Customer ID', 'Name', 'Website', 'Renewal date'],
      ['C-1', 'Pinecrest Foods', 'pinecrest.example', '2027-03-01'],
      ['C-2', 'Orbital Freight', 'orbital.example', '2027-05-15'],
    ];
  },
  consent: (u, ctl) => allow('gsheets', u, ctl),
  remoteEdit(_ctl, name) {
    grid[2][1] = name;
    return { id: 'C-2' };
  },
  remoteRow: (_o, id) => {
    const r = grid.find((x) => x[0] === id);
    return r ? Object.fromEntries((grid[0] as string[]).map((h, i) => [h, r[i]])) : undefined;
  },
  async handle(req: MockReq, ctl: Ctl) {
    const p = req.url.pathname;
    if (req.url.host === 'oauth2.googleapis.com' && p === '/token') {
      // A service-account key (BigQuery) signs in with a JWT assertion; the rest with a code or a refresh token.
      if (req.body?.grant_type === 'urn:ietf:params:oauth:grant-type:jwt-bearer') return req.body.assertion?.split('.').length === 3 && !ctl.revoked() ? json(ctl.tokens.issue('bigquery')) : json({ error: 'invalid_grant', error_description: 'Invalid JWT Signature.' }, 400);
      return tokenEndpoint('*', req, ctl, () => ({ id_token: `${b64({ alg: 'none' })}.${b64({ email: 'ada@demo.example', email_verified: true })}.sig`, scope: 'openid email' }));
    }
    if (req.url.host !== 'sheets.googleapis.com') return err(404, 'NOT_FOUND', 'Not found');
    const stop = gate('gsheets', req, ctl, { unauthorized, limited });
    if (stop) return stop;
    const m = /^\/v4\/spreadsheets\/([\w-]+)(.*)$/.exec(p);
    if (!m || m[1] !== SHEET_ID) return err(404, 'NOT_FOUND', 'Requested entity was not found.');
    const rest = decodeURIComponent(m[2]);
    if (!rest) return json(req.url.searchParams.get('fields')?.includes('sheets') ? { sheets: [{ properties: { title: 'Customers', index: 0 } }] } : { properties: { title: 'Customer list 2026' } });
    if (rest === "/values/'Customers'") return json({ range: "'Customers'!A1:D3", majorDimension: 'ROWS', values: grid });
    if (rest === '/values:batchUpdate' && req.method === 'POST') {
      if (ctl.take('badfield')) return err(400, 'INVALID_ARGUMENT', 'Unable to parse range: Customers!Z0');
      for (const d of req.body.data ?? []) {
        const c = /!([A-Z]+)(\d+)$/.exec(d.range);
        if (!c) return err(400, 'INVALID_ARGUMENT', `Unable to parse range: ${d.range}`);
        const row = Number(c[2]) - 1;
        while (grid.length <= row) grid.push([]);
        grid[row][colIndex(c[1])] = d.values[0][0];
      }
      return json({ spreadsheetId: SHEET_ID, totalUpdatedCells: req.body.data.length });
    }
    return err(400, 'INVALID_ARGUMENT', `Unsupported: ${rest}`);
  },
};
