// Bitrix24 REST through an inbound webhook address (https://<portal>/rest/<user>/<key>/<method>.json), as
// documented: { result, total, next } answers, 50-row pages with `start`, crm.*.fields / list / update / add,
// errors as { error, error_description }; QUERY_LIMIT_EXCEEDED with HTTP 503 when the portal is too busy.
import { json, type Ctl, type MockReq, type VendorMock } from './kit';

const HOOK = '/rest/1/hook1234hook/';
let store: Record<string, any[]> = {};
const FIELDS: Record<string, any> = {
  company: { ID: { type: 'integer', isReadOnly: true, title: 'ID' }, TITLE: { type: 'string', isRequired: true, title: 'Company name' }, ASSIGNED_BY_ID: { type: 'user', title: 'Responsible' }, DATE_MODIFY: { type: 'datetime', isReadOnly: true, title: 'Changed' } },
  contact: { ID: { type: 'integer', isReadOnly: true, title: 'ID' }, NAME: { type: 'string', title: 'First name' }, LAST_NAME: { type: 'string', title: 'Last name' }, EMAIL: { type: 'crm_multifield', title: 'E-mail' }, COMPANY_ID: { type: 'crm_company', title: 'Company' }, ASSIGNED_BY_ID: { type: 'user', title: 'Responsible' } },
  deal: { ID: { type: 'integer', isReadOnly: true, title: 'ID' }, TITLE: { type: 'string', title: 'Name' }, OPPORTUNITY: { type: 'double', title: 'Amount' }, CLOSEDATE: { type: 'date', title: 'Close date' }, STAGE_ID: { type: 'crm_status', statusType: 'DEAL_STAGE', title: 'Stage' }, STAGE_SEMANTIC_ID: { type: 'string', isReadOnly: true, title: 'Stage group' }, COMPANY_ID: { type: 'crm_company', title: 'Company' }, ASSIGNED_BY_ID: { type: 'user', title: 'Responsible' } },
};
const err = (status: number, error: string, error_description: string) => json({ error, error_description }, status);

export const bitrix24Mock: VendorMock = {
  id: 'bitrix24',
  hosts: /^pinecrest\.bitrix24\.com$/,
  keyValues: { webhook: `https://pinecrest.bitrix24.com${HOOK}` },
  reset() {
    const t = '2026-11-18T09:00:00+00:00';
    store = {
      company: [
        { ID: '1', TITLE: 'Pinecrest Foods', ASSIGNED_BY_ID: '10', DATE_MODIFY: t },
        { ID: '2', TITLE: 'Orbital Freight', ASSIGNED_BY_ID: '99', DATE_MODIFY: t },
        { ID: '3', TITLE: 'Larkspur Clinics', ASSIGNED_BY_ID: '10', DATE_MODIFY: t },
      ],
      contact: [{ ID: '21', NAME: 'Selin', LAST_NAME: 'Akar', COMPANY_ID: '1', ASSIGNED_BY_ID: '10', EMAIL: [{ VALUE: 'selin@pinecrest.example', VALUE_TYPE: 'WORK' }], DATE_MODIFY: t }],
      deal: [{ ID: '31', TITLE: 'Pinecrest renewal', OPPORTUNITY: '24000', CLOSEDATE: '2026-12-15T00:00:00+00:00', STAGE_ID: 'NEW', STAGE_SEMANTIC_ID: 'P', COMPANY_ID: '1', ASSIGNED_BY_ID: '10', DATE_MODIFY: t }],
    };
  },
  remoteEdit(ctl, name) {
    const r = store.company[1];
    r.TITLE = name;
    r.DATE_MODIFY = ctl.now().toISOString();
    return { id: r.ID };
  },
  remoteRow: (object, id) => store[object]?.find((r) => r.ID === id),
  handle(req: MockReq, ctl: Ctl) {
    if (!req.url.pathname.startsWith(HOOK)) return err(401, 'INVALID_CREDENTIALS', 'Invalid request credentials');
    if (ctl.revoked()) return err(401, 'INVALID_CREDENTIALS', 'Invalid request credentials');
    if (ctl.take('ratelimit')) return err(503, 'QUERY_LIMIT_EXCEEDED', 'Too many requests');
    const method = req.url.pathname.slice(HOOK.length).replace(/\.json$/, '');
    const body = req.body ?? {};
    if (method === 'user.get') return json({ result: [{ ID: '10', NAME: 'Ada', EMAIL: 'ada@demo.example' }, { ID: '99', NAME: 'Nobody', EMAIL: 'nobody@elsewhere.example' }], total: 2 });
    if (method === 'crm.status.list') return json({ result: [{ STATUS_ID: 'NEW', NAME: 'New' }, { STATUS_ID: 'WON', NAME: 'Deal won' }] });
    const [, object, verb] = /^crm\.(\w+)\.(\w+)$/.exec(method) ?? [];
    const rows = store[object];
    if (!rows) return err(404, 'ERROR_METHOD_NOT_FOUND', 'Method not found!');
    if (verb === 'fields') return json({ result: FIELDS[object] });
    if (verb === 'list') {
      const from = body.filter?.['>=DATE_MODIFY'] ? Date.parse(body.filter['>=DATE_MODIFY']) : 0;
      const hit = rows.filter((r) => Date.parse(r.DATE_MODIFY) >= from).sort((a, b) => Date.parse(b.DATE_MODIFY) - Date.parse(a.DATE_MODIFY));
      const start = Number(body.start ?? 0);
      const slice = hit.slice(start, start + 50);
      return json({ result: slice.map((r) => Object.fromEntries((body.select ?? Object.keys(r)).map((k: string) => [k, r[k]]))), total: hit.length, ...(start + 50 < hit.length ? { next: start + 50 } : {}) });
    }
    if (verb === 'update' || verb === 'add') {
      if (ctl.take('badfield')) return err(400, 'ERROR_CORE', 'Field "TITLE" is required.');
      if (verb === 'update') {
        const row = rows.find((r) => r.ID === String(body.id));
        if (!row) return err(400, 'ERROR_CORE', 'Not found');
        Object.assign(row, body.fields, { DATE_MODIFY: ctl.now().toISOString() });
        return json({ result: true });
      }
      const id = String(100 + rows.length);
      rows.push({ ID: id, ...body.fields, DATE_MODIFY: ctl.now().toISOString() });
      return json({ result: Number(id) });
    }
    return err(400, 'ERROR_ARGUMENT', 'Wrong arguments');
  },
};
