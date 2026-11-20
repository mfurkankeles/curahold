// The vendors B19 added (20 Nov): one mock per vendor, in the same shape as the rest of tests/vendors.
// Registered here rather than in ./index.ts so the two lists merge without touching each other.
import { gcalMock } from './gcal';
import { larkMock } from './lark';
import { odoocrmMock } from './odoocrm';
import { outlookcalMock } from './outlookcal';
import { stripeMock } from './stripe';
import { telegramMock } from './telegram';
import { whatsappMock } from './whatsapp';
import { zohodeskMock } from './zohodesk';
import type { VendorMock } from './kit';

/** Azure DevOps only calls Curahold (service hooks): its sender lives in ./azuredevops.ts and needs no entry here. */
export const B19_MOCKS: VendorMock[] = [larkMock, telegramMock, odoocrmMock, gcalMock, outlookcalMock, zohodeskMock, stripeMock, whatsappMock];

/**
 * Typical answer times seen from a European server, per vendor, for the timed runs (ms per call). They are
 * stated, not measured against the vendors: the runner reports them next to every figure.
 */
export const B19_LATENCY: Record<string, number> = { lark: 180, telegram: 120, odoocrm: 250, gcal: 140, outlookcal: 200, zohodesk: 260, stripe: 160, whatsapp: 180 };
