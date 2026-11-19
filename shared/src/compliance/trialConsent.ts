// The trial-request form's consent step, on the compliance package's texts
// (consentTexts.ts consentSetFor + the placeholders the data inventory fills).
// The form and the server build the same list from the same inputs, so the
// hash stored with each record is the hash of what the visitor was shown.
import type { Locale } from '../i18n/core';
import { consentSetFor, textHash, type ConsentFlags, type ShownBlock, type ShownText } from './consentTexts';
import { consentPlaceholders } from './dataInventory';

export interface TrialConsentBlock {
  /** The block id, stored with every record (e.g. 'TR.M1', 'AE.C'). */
  key: string;
  /** notice: read, never ticked; consent: a box the law asks for; marketing: optional, unticked. */
  kind: 'notice' | 'consent' | 'marketing';
  required: boolean;
  version: string;
  /** One text in the interface language, or the country-language master with English next to it. */
  shown: ShownText[];
  /** The notice page this block points to (Türkiye: its own aydınlatma metni). */
  page: 'legal-kvkk' | 'legal-privacy';
}

export interface TrialConsent {
  offered: boolean;
  /** The request needs a person's look first (a rule set asks for it, or the connection comes from such a country). */
  manualReview: boolean;
  blocks: TrialConsentBlock[];
}

const kindOf = (b: ShownBlock): TrialConsentBlock['kind'] => (b.kind === 'marketing' ? 'marketing' : b.box ? 'consent' : 'notice');

/** The blocks for the country picked and, when different, the one the visitor connects from. */
export function trialConsent(declared: string, ipCountry: string | null | undefined, locale: Locale, flags?: Partial<ConsentFlags>): TrialConsent {
  const set = consentSetFor({ declared, ipCountry, locale, vars: consentPlaceholders(locale), flags });
  return {
    offered: set.offered,
    manualReview: set.manualReview,
    blocks: set.blocks.map((b) => ({
      key: b.id,
      kind: kindOf(b),
      required: b.box && b.required,
      version: set.version,
      shown: b.shown,
      page: b.id.startsWith('TR.') ? 'legal-kvkk' : 'legal-privacy',
    })),
  };
}

/** The exact words of a block as shown (every language it was shown in), the input of its evidence hash. */
export const shownText = (b: Pick<TrialConsentBlock, 'shown'>) => b.shown.map((s) => s.text).join('\n');

/** SHA-256 of what a block showed. */
export const blockHash = (b: Pick<TrialConsentBlock, 'shown'>) => textHash(shownText(b));
