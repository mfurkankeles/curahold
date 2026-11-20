// Microsoft Graph v1.0 as documented, for Excel in OneDrive/SharePoint (and the Outlook mailbox): shared links
// resolved through /shares/u!<base64url link>/driveItem, workbook worksheets, usedRange(valuesOnly=true) with
// address + text, PATCH range(address='B3:B3'); errors as { error: { code, message } }; 429 with Retry-After.
// The Microsoft sign-in itself is answered by the Dynamics mock (one token endpoint for every Microsoft product).
import { allow, gate, json, type Ctl, type MockReq, type VendorMock } from './kit';

export const EXCEL_LINK = 'https://quillfield-my.sharepoint.com/:x:/g/personal/ada_quillfield/EQmockWorkbook1?e=abc123';
let grid: string[][] = [];
let mails: any[] = [];
let sentMail = 0;
const err = (status: number, code: string, message: string, headers: Record<string, string> = {}) => json({ error: { code, message, innerError: { 'request-id': 'mock' } } }, status, headers);
const unauthorized = () => err(401, 'InvalidAuthenticationToken', 'Access token has expired or is not yet valid.');
const limited = () => err(429, 'TooManyRequests', 'Too many requests', { 'retry-after': '10' });
const colIndex = (letters: string) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

export const graphMock: VendorMock = {
  id: 'excel',
  ids: ['outlook'],
  hosts: /^graph\.microsoft\.com$/,
  reset() {
    mails = [{ id: 'AAMkMock1', subject: 'Renewal question', bodyPreview: 'When does our plan renew?', from: { emailAddress: { address: 'buyer@quillfield.example' } }, toRecipients: [{ emailAddress: { address: 'ada@demo.example' } }], ccRecipients: [], receivedDateTime: '2026-11-18T08:00:00Z' }];
    sentMail = 0;
    grid = [
      ['Customer ID', 'Name', 'Website'],
      ['C-1', 'Pinecrest Foods', 'pinecrest.example'],
      ['C-2', 'Orbital Freight', 'orbital.example'],
    ];
  },
  consent: (u, ctl) => allow(/Mail\./.test(u.searchParams.get('scope') ?? '') ? 'outlook' : 'excel', u, ctl),
  remoteEdit(ctl, name) {
    grid[2][1] = name;
    // For Outlook, the same edit is a new mail from the customer.
    mails.push({ id: `AAMkMock${mails.length + 1}`, subject: name, bodyPreview: 'A new mail', from: { emailAddress: { address: 'buyer@quillfield.example' } }, toRecipients: [{ emailAddress: { address: 'ada@demo.example' } }], ccRecipients: [], receivedDateTime: ctl.now().toISOString() });
    return { id: 'C-2' };
  },
  remoteRow: (_o, id) => {
    const r = grid.find((x) => x[0] === id);
    return r ? Object.fromEntries(grid[0].map((h, i) => [h, r[i]])) : undefined;
  },
  async handle(req: MockReq, ctl: Ctl) {
    const stop = gate('excel', req, ctl, { unauthorized, limited }, { key: (auth) => ctl.tokens.valid('excel', auth) || ctl.tokens.valid('outlook', auth) });
    if (stop) return stop;
    const p = decodeURIComponent(req.url.pathname);
    // Outlook: the mailbox and its messages (receivedDateTime filter, @odata.nextLink pages), and sendMail.
    if (p === '/v1.0/me') return json({ mail: 'ada@demo.example', userPrincipalName: 'ada@demo.example' });
    if (p === '/v1.0/me/messages') {
      const f = /receivedDateTime ge (\S+)/.exec(req.url.searchParams.get('$filter') ?? '');
      return json({ value: mails.filter((m) => !f || Date.parse(m.receivedDateTime) >= Date.parse(f[1])) });
    }
    if (p === '/v1.0/me/sendMail' && req.method === 'POST') {
      if (!req.body?.message?.toRecipients?.length) return err(400, 'ErrorInvalidRecipients', 'At least one recipient is not valid.');
      sentMail++;
      return new Response(null, { status: 202 });
    }
    if (p.startsWith('/v1.0/shares/')) {
      const enc = p.split('/')[3].slice(2);
      const link = atob(enc.replace(/-/g, '+').replace(/_/g, '/'));
      return link === EXCEL_LINK ? json({ id: '01MOCKITEM', name: 'Customers 2026.xlsx', webUrl: 'https://quillfield-my.sharepoint.com/personal/ada/Customers%202026.xlsx', parentReference: { driveId: 'b!mockdrive' } }) : err(404, 'itemNotFound', 'The sharing link no longer exists, or you do not have permission to access it.');
    }
    const wb = '/v1.0/drives/b!mockdrive/items/01MOCKITEM/workbook';
    if (!p.startsWith(wb)) return err(404, 'itemNotFound', 'The resource could not be found.');
    const rest = p.slice(wb.length);
    if (rest === '/worksheets') return json({ value: [{ name: 'Customers', position: 0 }] });
    if (rest === "/worksheets('Customers')/usedRange(valuesOnly=true)") return json({ address: 'Customers!A1:C3', text: grid });
    const r = /^\/worksheets\('Customers'\)\/range\(address='([A-Z]+)(\d+):([A-Z]+)(\d+)'\)$/.exec(rest);
    if (r && req.method === 'PATCH') {
      if (ctl.take('badfield')) return err(400, 'InvalidArgument', 'The argument is invalid or missing or has an incorrect format.');
      const row = Number(r[2]) - 1;
      while (grid.length <= row) grid.push([]);
      (req.body.values[0] as string[]).forEach((v, i) => (grid[row][colIndex(r[1]) + i] = String(v)));
      return json({ address: `Customers!${r[1]}${r[2]}:${r[3]}${r[4]}` });
    }
    return err(400, 'invalidRequest', `Unsupported: ${rest}`);
  },
};
