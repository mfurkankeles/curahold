// Which integrations the customer-style run covers, and what each brings (tests/integrations-onboarding.test.ts,
// scripts/integrations/onboard.ts). A new vendor mock gets its line here.
import type { FlowSpec } from './flow';

export const SPECS: FlowSpec[] = [
  { provider: 'salesforce', objects: [{ remote: 'Account', target: 'account' }, { remote: 'Contact', target: 'record', kind: 'contact' }, { remote: 'Opportunity', target: 'record', kind: 'opportunity' }], expect: 'Pinecrest Foods', twoWay: true },
  { provider: 'hubspot', objects: [{ remote: 'companies', target: 'account' }, { remote: 'contacts', target: 'record', kind: 'contact' }, { remote: 'deals', target: 'record', kind: 'opportunity' }], expect: 'Pinecrest Foods', twoWay: true },
  { provider: 'pipedrive', objects: [{ remote: 'organizations', target: 'account' }, { remote: 'persons', target: 'record', kind: 'contact' }, { remote: 'deals', target: 'record', kind: 'opportunity' }], expect: 'Pinecrest Foods', twoWay: true },
  { provider: 'zoho', objects: [{ remote: 'Accounts', target: 'account' }, { remote: 'Contacts', target: 'record', kind: 'contact' }, { remote: 'Deals', target: 'record', kind: 'opportunity' }], expect: 'Pinecrest Foods', twoWay: true },
  { provider: 'dynamics', objects: [{ remote: 'account', target: 'account' }, { remote: 'contact', target: 'record', kind: 'contact' }, { remote: 'opportunity', target: 'record', kind: 'opportunity' }], expect: 'Pinecrest Foods', twoWay: true },
  { provider: 'bitrix24', objects: [{ remote: 'company', target: 'account' }, { remote: 'contact', target: 'record', kind: 'contact' }, { remote: 'deal', target: 'record', kind: 'opportunity' }], expect: 'Pinecrest Foods', twoWay: true },
  { provider: 'freshsales', objects: [{ remote: 'sales_accounts', target: 'account' }, { remote: 'contacts', target: 'record', kind: 'contact' }, { remote: 'deals', target: 'record', kind: 'opportunity' }], expect: 'Pinecrest Foods', twoWay: true },
  { provider: 'zendesksell', objects: [{ remote: 'organizations', target: 'account' }, { remote: 'people', target: 'record', kind: 'contact' }, { remote: 'deals', target: 'record', kind: 'opportunity' }], expect: 'Pinecrest Foods', twoWay: true },
  { provider: 'gsheets', objects: [{ remote: 'Customers', target: 'account' }], expect: 'Pinecrest Foods', twoWay: true, file: 'https://docs.google.com/spreadsheets/d/1QuillfieldMockSheet0000000000000000000000/edit#gid=0', key: 'Customer ID', hereWins: true },
  { provider: 'excel', objects: [{ remote: 'Customers', target: 'account' }], expect: 'Pinecrest Foods', twoWay: true, file: 'https://quillfield-my.sharepoint.com/:x:/g/personal/ada_quillfield/EQmockWorkbook1?e=abc123', key: 'Customer ID', hereWins: true },
  { provider: 'bigquery', objects: [{ remote: 'query', target: 'account' }], expect: 'Pinecrest Foods', twoWay: false },
  { provider: 'snowflake', objects: [{ remote: 'query', target: 'account' }], expect: 'Pinecrest Foods', twoWay: false },
];

export const ACCOUNTING_SPECS = [
  { provider: 'odoo', customer: 'Quillfield Retail' },
  { provider: 'xero', customer: 'Quillfield Retail' },
  { provider: 'quickbooks', customer: 'Quillfield Retail' },
  { provider: 'zohobooks', customer: 'Quillfield Retail' },
  { provider: 'freee', customer: 'Quillfield Retail' },
  { provider: 'parasut', customer: 'Quillfield Retail' },
];

/** Support tools: a ticket the first sync must file under a demo customer. */
export const SUPPORT_SPECS = [
  { provider: 'zendesk', ticket: 'Dashboard is blank', twoWay: true, reply: true },
  { provider: 'freshdesk', ticket: 'Export stops halfway', twoWay: true, reply: true },
  { provider: 'intercom', ticket: 'Login link expired', twoWay: true, reply: true, edit: { status: 'solved' } },
  { provider: 'jsm', ticket: 'Cannot open the shared report', twoWay: false, reply: false },
];

/** Jira: the project read and an issue the first sync must put on the board. */
export const JIRA_SPECS = [{ provider: 'jira', project: 'CURA', task: 'Pay with card' }];

/** Mailboxes: a customer's mail the first read must attach to that customer. */
export const MAILBOX_SPECS = [
  { provider: 'gmail', customer: 'Quillfield Retail', subject: 'Renewal question' },
  { provider: 'outlook', customer: 'Quillfield Retail', subject: 'Renewal question' },
];
