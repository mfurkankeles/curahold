// Build settings that switch claims on the sales site on or off, so the copy never says more than is true
// today (MASTER-RULES 10: claims only about what is shipped and proven; no price figures while pricing is an open
// owner decision). Each is off unless the build is told otherwise (docs/ENVIRONMENT.md "Sales site"):
//
//   SITE_PRICES=show       publish the price figures (cards, table, "from …" lines, schema.org Offer). Default: hidden,
//                          every place says prices are announced at launch, and no Offer is emitted.
//   SITE_EU_DATA=confirmed say the database is in the European Union. Default: not said — the go-live checklist item
//                          "database-hosting" has to be proven first (shared/src/checklist-golive.ts).
//
// Copy carries both versions next to each other, in every language, as `⟦price|shown|hidden⟧` or `⟦eu|shown|hidden⟧`.
// `gated()` resolves them when the copy is read (site/content.ts siteCopy, site/info infoCopy), so no page, title,
// description or FAQ schema can show the wrong one. A list item whose text resolves to nothing is dropped, and so is
// a row or question whose first field does — that is how a claim disappears from a list instead of leaving a gap.

/** What the build may claim, from its settings (read once, at build time). */
export const SITE_GATES = {
  prices: process.env.SITE_PRICES === 'show',
  euData: process.env.SITE_EU_DATA === 'confirmed',
};

type Gates = typeof SITE_GATES;
const MARK = /⟦(price|eu)\|([^|⟧]*)\|([^⟧]*)⟧/g;

/** One string with its gated parts resolved. */
export function gateText(s: string, g: Gates = SITE_GATES): string {
  return s.replace(MARK, (_, which: 'price' | 'eu', shown: string, hidden: string) => ((which === 'price' ? g.prices : g.euData) ? shown : hidden));
}

const marked = (s: unknown) => typeof s === 'string' && s.includes('⟦');
/** The text a list entry is known by: a string, the first field of a row, or a question's `q` / a point's `h`. */
const head = (v: unknown): unknown => (Array.isArray(v) ? v[0] : v && typeof v === 'object' ? ((v as Record<string, unknown>).q ?? (v as Record<string, unknown>).h) : v);

const cache = new WeakMap<object, unknown>();

/** A copy object with every gated string resolved and every entry whose claim is switched off dropped (cached per object). */
export function gated<T>(value: T, g: Gates = SITE_GATES): T {
  if (g !== SITE_GATES) return walk(value, g);
  if (value && typeof value === 'object') {
    const hit = cache.get(value);
    if (hit) return hit as T;
    const out = walk(value, g);
    cache.set(value, out);
    return out;
  }
  return walk(value, g);
}

function walk<T>(v: T, g: Gates): T {
  if (typeof v === 'string') return (marked(v) ? gateText(v, g) : v) as T;
  if (Array.isArray(v)) return v.filter((x) => !(marked(head(x)) && gateText(String(head(x)), g) === '')).map((x) => walk(x, g)) as T;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, g)])) as T;
  return v;
}
