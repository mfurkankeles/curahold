// Every other accounting program (Logo, Mikro, Tally, SAP Business One and the
// rest without an open API): a file exported from the program in the
// template's columns, uploaded on the connection's page. The upload is read by
// the route (api/src/routes/finance.ts) straight into the finance tables; the
// scheduled sync has nothing to fetch for it.
import { accountingAdapter } from './common';

export const finfile = accountingAdapter({
  provider: 'finfile',
  accounting: { perMinute: 1, file: true },
  keyed: {
    async connect(_fetcher, values) {
      const label = (values.label ?? '').trim().slice(0, 120) || 'Accounting file';
      return { secret: {}, config: {}, label, instanceId: `file:${crypto.randomUUID()}` };
    },
  },
  async refresh(_ctx, secret) {
    return secret;
  },
  async finance() {
    return { rows: [], next: null };
  },
  url() {
    return null;
  },
});
