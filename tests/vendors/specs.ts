// Which integrations the customer-style run covers, and what each brings (tests/integrations-onboarding.test.ts,
// scripts/integrations/onboard.ts). A new vendor mock gets its line here.
import type { FlowSpec } from './flow';

export const SPECS: FlowSpec[] = [
  { provider: 'salesforce', objects: [{ remote: 'Account', target: 'account' }, { remote: 'Contact', target: 'record', kind: 'contact' }, { remote: 'Opportunity', target: 'record', kind: 'opportunity' }], expect: 'Pinecrest Foods', twoWay: true },
  { provider: 'hubspot', objects: [{ remote: 'companies', target: 'account' }, { remote: 'contacts', target: 'record', kind: 'contact' }, { remote: 'deals', target: 'record', kind: 'opportunity' }], expect: 'Pinecrest Foods', twoWay: true },
  { provider: 'bitrix24', objects: [{ remote: 'company', target: 'account' }, { remote: 'contact', target: 'record', kind: 'contact' }, { remote: 'deal', target: 'record', kind: 'opportunity' }], expect: 'Pinecrest Foods', twoWay: true },
];

export const ACCOUNTING_SPECS = [{ provider: 'odoo', customer: 'Quillfield Retail' }];
