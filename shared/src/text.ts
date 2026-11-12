// Text the way people type and read it: comparing and ordering names without tripping over
// capitals, marks, or the four Turkish i's (İ, I, ı, i).
//
// The database has the same rules (db/migrations/0022_text.sql: fold_text, sort_text);
// tests/text.test.ts keeps the two in step.

/** Letters that do not come apart into "letter + mark", and what they count as. */
const WHOLE: Record<string, string> = { ø: 'o', ł: 'l', đ: 'd', ß: 's' };

/**
 * What search and name matching compare: no capitals, no marks, one kind of i.
 * "Işık", "IŞIK" and "isik" all become "isik"; "İstanbul" becomes "istanbul".
 */
export function foldText(s: string): string {
  return s
    .replace(/[İIı]/g, 'i')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[øłđß]/g, (c) => WHOLE[c]);
}

/** Does `text` contain `part`, the way a person means it? */
export const hasText = (text: string, part: string): boolean => foldText(text).includes(foldText(part));

/** The same name, however it was typed. */
export const sameText = (a: string, b: string): boolean => foldText(a.trim()) === foldText(b.trim());

const collators = new Map<string, Intl.Collator>();
/**
 * Order for a list someone reads: a Turkish dictionary's order for Turkish (ç after c, ı before i,
 * ö after o…), and "file 2" before "file 10" in every language.
 */
export function compareText(a: string, b: string, locale: string = 'en'): number {
  let c = collators.get(locale);
  if (!c) collators.set(locale, (c = new Intl.Collator(locale, { numeric: true })));
  return c.compare(a, b);
}

/** Every letter the database's fold_text knows, for the test that compares the two. */
export const FOLD_SAMPLE = 'ÁÀÂÄÃÅáàâäãåÉÈÊËĚéèêëěÍÌÎÏíìîïÓÒÔÕØóòôõøÚÙÛŮúùûůÝŸýÿÑŃŇñńňĆČćčŚŠśšßŹŻŽźżžŁłĐđĎďŘřŤťİIıÇçĞğÖöŞşÜü';
