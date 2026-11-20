// The shape of the translated rows of the privacy-notice and KVKK-notice tables
// for the languages past English and Turkish (those two read the data inventory
// directly). One file per language beside this one; scripts/compliance/legal-pack.ts
// joins each row to its activity in shared/src/compliance/dataInventory.ts by id,
// so the recipients, the order and which rows appear always come from the
// inventory and only the words come from here. LEGAL STATUS: draft translations
// (lawyer to confirm); the English text prevails.
import type { Locale } from '../../i18n/core';

/** The languages whose notice tables are translated here (English and Turkish live in the inventory itself). */
export type NoticeLocale = Exclude<Locale, 'en' | 'tr'>;

/** One activity's cells, in one language. */
export interface NoticeRow {
  purpose: string;
  data: string;
  subjects: string;
  /** The privacy notice's "Legal basis by region" cell (EU/UK, Türkiye, Gulf, elsewhere), translated whole. */
  basis: string;
  /** The KVKK notice's "Legal ground (KVKK art. 5)" cell; needed for every activity where Curahold is the controller. */
  kvkk?: string;
  retention: string;
  /** The recipients the inventory names in words (its `others`), when it has them. */
  others?: string;
}

/** Everything one language needs to print both tables. */
export interface NoticeText {
  /** Column headings: purpose, data, whose data, basis (privacy), ground (KVKK), kept for, recipients. */
  head: { purpose: string; data: string; subjects: string; basis: string; kvkk: string; retention: string; recipients: string };
  /** Added after the purpose of an activity done for the customer: "(for the customer, as processor)". */
  processor: string;
  /** By activity id (dataInventory.ts ACTIVITIES). */
  rows: Record<string, NoticeRow>;
}
