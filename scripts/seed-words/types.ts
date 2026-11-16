// The demo company's own words in one language: its people, its customers'
// names, its sample texts and its money. The product's built-in content
// (templates, columns, ready-made reports) comes from the dictionaries; this is
// the invented data written on top of it, the way a company in that language
// would have written it. The seed is written once, in Turkish (tr.ts); every
// other language says the same things here.
//
// Adding a language to the demo is adding its file here (and a line in index.ts).
import type { MeetingKind, MeetingRepeat } from '../../shared/src/timeline';

/** The people of the demo company, by the key their address starts with (ada@demo.example). */
export type PersonKey = 'ada' | 'mert' | 'zeynep' | 'lena' | 'omar' | 'sofia';

export interface SeedWords {
  /** The company itself. */
  company: string;
  /** Where it works from. */
  timezone: string;
  /**
   * Its money. Amounts are written in US dollars in the seed and multiplied by `rate`
   * (then rounded to three figures), so they read as a company in this market would quote.
   */
  money: {
    currency: string;
    rate: number;
    /** What one unit of another currency is worth in `currency` (the company's own rates, invented). */
    fx: Record<string, number>;
    /** Customers that pay in another currency, by the seed's (Turkish) name. */
    abroad: Record<string, string>;
  };
  /** Full names of the demo company's people. */
  people: Record<PersonKey, string>;
  /** The customer's person who uses the portal (Quillfield Retail's), and how she is addressed. */
  customer: { first: string; last: string };
  /** A person's full name from first and last name, in this language's order. */
  fullName: (first: string, last: string) => string;
  /** The teams. */
  teams: { cs: string; am: string };
  /** The base demo (seed-demo.ts). */
  base: {
    /** A comment on the business review task, after the mention of the customer manager. */
    ask: string;
    planned: [MeetingKind, string, string, number, number, PersonKey[], MeetingRepeat][];
    tasks: [string, string, string, string, string, string, string, string, string];
    sprint: [name: string, goal: string];
    subtasks: [string, string, string];
    meetingType: [label: string, prompt: string];
    boards: { cs: string; renewals: string; notes: string };
  };
  /**
   * The showcase (seed-showcase.ts) and the portal (web/src/demo/portal-seed.ts): every
   * Turkish text they send, said in this language. Names of the customers' people are
   * here too (first and last names apart), so the notes can speak of them.
   * tests/demo-words.test.ts checks that each language says everything Turkish says.
   */
  text: Record<string, string>;
}
