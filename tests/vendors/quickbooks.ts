// QuickBooks Online Accounting API v3 as documented: Intuit OAuth 2 (appcenter.intuit.com/connect/oauth2,
// tokens at oauth.platform.intuit.com with Basic client auth, realmId on the callback), sandbox companies on
// sandbox-quickbooks.api.intuit.com, the query endpoint (SELECT … STARTPOSITION … MAXRESULTS),
// MetaData.LastUpdatedTime; errors as { Fault: { Error: [{ Message, Detail, code }], type } }; 429 ThrottleExceeded.
import { allow, gate, json, tokenEndpoint, type Ctl, type MockReq, type VendorMock } from './kit';

const REALM = '9341455123456789';
let rows: Record<string, any[]> = {};
const fault = (status: number, type: string, code: string, Message: string, Detail: string) => json({ Fault: { Error: [{ Message, Detail, code }], type }, time: new Date().toISOString() }, status);
const unauthorized = () => fault(401, 'AUTHENTICATION', '3200', 'message=AuthenticationFailed; errorCode=003200; statusCode=401', 'Token expired');
const limited = () => fault(429, 'SERVICE', '003001', 'message=ThrottleExceeded; errorCode=003001; statusCode=429', 'The request limit was reached.');

export const quickbooksMock: VendorMock = {
  id: 'quickbooks',
  hosts: /^(appcenter\.intuit\.com|oauth\.platform\.intuit\.com|sandbox-quickbooks\.api\.intuit\.com)$/,
  // The free Intuit developer account comes with a sandbox company: that is what a test signs in to.
  startQuery: { sandbox: '1' },
  reset() {
    const t = '2026-11-18T08:00:00-08:00';
    rows = {
      Customer: [
        { Id: '58', DisplayName: 'Quillfield Retail Ltd', CompanyName: 'Quillfield Retail Ltd', PrimaryEmailAddr: { Address: 'ap@quillfield.example' }, Balance: 950, CurrencyRef: { value: 'USD' }, MetaData: { LastUpdatedTime: t } },
        { Id: '59', DisplayName: 'Somebody Else Inc', Balance: 0, MetaData: { LastUpdatedTime: t } },
      ],
      Invoice: [{ Id: '130', DocNumber: '1037', CustomerRef: { value: '58' }, TxnDate: '2026-10-02', DueDate: '2026-11-01', TotalAmt: 950, Balance: 950, CurrencyRef: { value: 'USD' }, MetaData: { LastUpdatedTime: t } }],
      Payment: [],
    };
  },
  consent: (u, ctl) => allow('quickbooks', u, ctl, { realmId: REALM }),
  async handle(req: MockReq, ctl: Ctl) {
    const p = req.url.pathname;
    if (req.url.host === 'oauth.platform.intuit.com') {
      if (!req.headers.get('authorization')?.startsWith('Basic ')) return json({ error: 'invalid_client' }, 401);
      return tokenEndpoint('quickbooks', req, ctl, () => ({ x_refresh_token_expires_in: 8726400 }));
    }
    const stop = gate('quickbooks', req, ctl, { unauthorized, limited });
    if (stop) return stop;
    if (p === `/v3/company/${REALM}/companyinfo/${REALM}`) return json({ CompanyInfo: { CompanyName: 'Sandbox Company_US_1', Id: '1' } });
    if (p === `/v3/company/${REALM}/query`) {
      const q = req.url.searchParams.get('query') ?? '';
      const m = /^SELECT \* FROM (\w+)(?: WHERE MetaData\.LastUpdatedTime >= '([^']+)')? ORDERBY MetaData\.LastUpdatedTime STARTPOSITION (\d+) MAXRESULTS (\d+)$/.exec(q);
      if (!m || !rows[m[1]]) return fault(400, 'ValidationFault', '4000', 'Error parsing query', `QueryParserError: Encountered "${q.slice(0, 30)}"`);
      const since = m[2] ? Date.parse(m[2]) : 0;
      const hit = rows[m[1]].filter((r) => Date.parse(r.MetaData.LastUpdatedTime) >= since);
      const start = Number(m[3]);
      const slice = hit.slice(start - 1, start - 1 + Number(m[4]));
      return json({ QueryResponse: slice.length ? { [m[1]]: slice, startPosition: start, maxResults: slice.length } : {}, time: new Date().toISOString() });
    }
    if (/^\/v3\/company\/\d+\//.test(p)) return fault(403, 'AuthorizationFault', '003100', 'ApplicationAuthorizationFailed', 'The realm on the request is not the one this token was issued for');
    return fault(404, 'SERVICE', '404', 'Not found', p);
  },
};
