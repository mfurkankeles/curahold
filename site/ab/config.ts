// The A/B test of the sales site's three versions: the classic page and the two
// animated "AI versions". Built and measured, NOT live: `enabled` stays false until
// the owner says "yayına al" and the domain is ours. Every answer he gives to the
// open question (how many variants, which split, which languages) is a change here.
//
// How it works once enabled (site/ab/worker.js, served as the edge script):
//   - only a visitor who accepted analytics cookies takes part; everyone else, and
//     every search-engine bot, sees the classic page — nothing is set before consent;
//   - a participant gets a variant by weight and keeps it (first-party cookie), on the
//     same address: / or /<lang>/;
//   - site/ab/measure.js reports, with consent only: "Ürüne git" and "Canlı demo"
//     clicks, sign-up starts and time on page, each tagged with the variant.
import type { Locale } from '../../shared/src/i18n';

export interface AbVariant {
  /** Short id carried in the cookie and every event. */
  id: string;
  /** Which page answers: the classic landing page, or a version's own folder under the language. */
  page: '' | 'ai/' | 'orbit/';
  /** Relative share of participants. Weights need not add up to 100. */
  weight: number;
}

export interface AbConfig {
  enabled: boolean;
  /** Bump to start a fresh experiment: old cookies are then ignored. */
  experiment: string;
  variants: AbVariant[];
  /** The languages in the test; any other language always sees the classic page. */
  locales: Locale[] | 'all';
  cookie: string;
  cookieDays: number;
  /** First-party address that receives the events (POST, JSON). Empty: events only go to analytics, if any. */
  endpoint: string;
}

export const AB: AbConfig = {
  enabled: false,
  experiment: 'v1',
  // The owner's 18 Nov choice: the classic site, concept A and concept C. His first idea
  // was 5 × 20 %; two more variants are two more entries here.
  variants: [
    { id: 'main', page: '', weight: 34 },
    { id: 'a', page: 'ai/', weight: 33 },
    { id: 'c', page: 'orbit/', weight: 33 },
  ],
  locales: 'all',
  cookie: 'cura_ab',
  cookieDays: 30,
  endpoint: '',
};
