// The other languages say the seed's texts in the order English lists them
// (en.ts), so each file holds only its own words. Add new texts at the END of
// en.ts's `text`: an insertion in the middle would shift every language.
// tests/demo-words.test.ts checks every language gives exactly one text per key.
import { words as en } from './en';

export const TEXT_KEYS = Object.keys(en.text);

/** A language's texts, given in English's order, as the map the seed reads. */
export function inOrder(values: string[]): Record<string, string> {
  if (values.length !== TEXT_KEYS.length) throw new Error(`seed words: ${values.length} texts given for ${TEXT_KEYS.length}`);
  return Object.fromEntries(TEXT_KEYS.map((k, i) => [k, values[i]]));
}
