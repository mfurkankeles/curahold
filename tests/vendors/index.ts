// The vendor mock registry. A new vendor: add its file next to this one (see kit.ts for the contract)
// and one entry below; tests/integrations-onboarding.test.ts and scripts/integrations/onboard.ts pick it up.
import { bitrix24Mock } from './bitrix24';
import type { VendorMock } from './kit';
import { hubspotMock } from './hubspot';
import { odooMock } from './odoo';
import { salesforceMock } from './salesforce';

export const VENDOR_MOCKS: VendorMock[] = [salesforceMock, hubspotMock, bitrix24Mock, odooMock];

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
