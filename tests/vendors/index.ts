// The vendor mock registry. A new vendor: add its file next to this one (see kit.ts for the contract)
// and one entry below; tests/integrations-onboarding.test.ts and scripts/integrations/onboard.ts pick it up.
import { bigqueryMock } from './bigquery';
import { bitrix24Mock } from './bitrix24';
import type { VendorMock } from './kit';
import { dynamicsMock } from './dynamics';
import { freeeMock } from './freee';
import { freshdeskMock } from './freshdesk';
import { freshsalesMock } from './freshsales';
import { gmailMock } from './gmail';
import { googleMock } from './google';
import { graphMock } from './graph';
import { hubspotMock } from './hubspot';
import { intercomMock } from './intercom';
import { jiraMock } from './jira';
import { jsmMock } from './jsm';
import { odooMock } from './odoo';
import { parasutMock } from './parasut';
import { pipedriveMock } from './pipedrive';
import { quickbooksMock } from './quickbooks';
import { salesforceMock } from './salesforce';
import { snowflakeMock } from './snowflake';
import { xeroMock } from './xero';
import { zendeskMock } from './zendesk';
import { zendesksellMock } from './zendesksell';
import { zohoMock } from './zoho';
import { zohobooksMock } from './zohobooks';

export const VENDOR_MOCKS: VendorMock[] = [salesforceMock, hubspotMock, pipedriveMock, zohoMock, dynamicsMock, bitrix24Mock, freshsalesMock, zendesksellMock, googleMock, graphMock, gmailMock, bigqueryMock, snowflakeMock, zendeskMock, freshdeskMock, jsmMock, intercomMock, jiraMock, odooMock, xeroMock, quickbooksMock, zohobooksMock, freeeMock, parasutMock];

/**
 * Latency per call used by the timed runner, in ms: an assumed median answer time for a hosted REST API
 * (100–300 ms is typical). An assumption, stated in the report; the real-sandbox run replaces it.
 */
export const REALISTIC_LATENCY_MS: Record<string, number> = {
  salesforce: 180,
  hubspot: 160,
  bitrix24: 220,
  default: 200,
};
