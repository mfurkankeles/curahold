// The words of the sales site's shared header (the informative mega menu) and of
// every page it points to: departments, features, solutions, integrations, pricing,
// FAQ, trust, "Why Curahold" and About. One file per language next to this one;
// tests/site-info.test.ts holds every language to the English shape.
//
// Claims are about what the product really does today. Anything not shipped yet is
// marked with `soon: true` and shown with the "Coming soon" label; nothing names a
// competitor; nothing invents a customer, a number or a person.

/** A short heading and the sentence under it. */
export type Point = [h: string, p: string];

/** In the order of the customer's journey: inside sales → sales → onboarding (optional) → customer success and support, with product and finance connected throughout. */
export type DeptKey = 'inside' | 'sales' | 'onboarding' | 'success' | 'product' | 'finance';
export type FeatureKey = 'health' | 'meetings' | 'sprints' | 'portal' | 'renewals' | 'assistant' | 'reports' | 'sync';
export type IntegrationGroup = 'crm' | 'chat' | 'support' | 'mail' | 'sheets' | 'data' | 'dev' | 'ai' | 'signin' | 'api' | 'automation' | 'accounting';

export interface InfoCopy {
  nav: {
    product: string;
    solutions: string;
    integrations: string;
    resources: string;
    pricing: string;
    why: string;
    about: string;
    /** Menu group headings. */
    departments: string;
    features: string;
    byRole: string;
    bySize: string;
    byRegion: string;
    company: string;
    /** "See all" links at the foot of a menu panel. */
    allIntegrations: string;
    /** The animated version: its name in the Resources menu, and the way back to the classic site from it. */
    toAi: string;
    toClassic: string;
    /** One line under the animated version's name in the Resources menu. */
    toAiHint: string;
    /** The two calls to action, the same words on every page: the free trial (primary) and the live demo. */
    demo: string;
    tryFree: string;
    signIn: string;
    menu: string;
    close: string;
    language: string;
    soon: string;
    /** The featured card in the product panel. */
    featured: { title: string; text: string };
    /** One-liners for the resources panel. */
    help: [string, string];
    developers: [string, string];
    releases: [string, string];
    trust: [string, string];
    blog: [string, string];
    faq: [string, string];
    quickstart: [string, string];
    selfHost: [string, string];
    legal: [string, string];
    contact: [string, string];
    /** "Why Curahold" panel: the page itself, and how we differ (the contrast block). */
    whyShort: [string, string];
    differ: [string, string];
    aboutShort: string;
    /** Resources panel group headings. */
    learn: string;
    build: string;
    trustGroup: string;
    byIndustry: string;
    /** Featured slots: the trial (Solutions), your own tool (Integrations), the newest release note (Resources). */
    trialCard: { title: string; text: string };
    apiCard: { title: string; text: string };
    news: string;
    /** True facts shown as a strip in the "Why Curahold" panel. */
    facts: string[];
    /** The departments as one flow: its heading, the note under it, the "optional" pill (onboarding). */
    flow: string;
    flowNote: string;
    optional: string;
    /** Planned for the whole flow; shown with "Coming soon" until it ships. */
    flowSoon: Point;
  };
  /** Shared blocks on the inner pages. */
  common: {
    ctaTitle: string;
    ctaText: string;
    related: string;
    /** Breadcrumb root. */
    home: string;
    /** "Who it is for" heading on a department page. */
    forWho: string;
    /** Heading of the features list on a department page. */
    uses: string;
  };
  /** `next`: planned work for this team, shown with "Coming soon" until it ships. */
  depts: Record<DeptKey, { name: string; short: string; title: string; lead: string; points: Point[]; forWho: string; next?: Point }>;
  features: Record<FeatureKey, { name: string; short: string; title: string; lead: string; points: Point[] }>;
  solutions: {
    title: string;
    lead: string;
    roles: Point[];
    sizes: Point[];
    industries: Point[];
    /** Türkiye, Middle East, East Asia, Europe. */
    regions: Point[];
  };
  integrations: {
    title: string;
    lead: string;
    groups: Record<IntegrationGroup, { name: string; text: string }>;
    missing: Point;
  };
  /** `dont`: what the price does not count, each checked against shared/src/billing.ts and api/src/lib/billing.ts. */
  pricingPage: { title: string; lead: string; dontTitle: string; dont: Point[] };
  faqPage: { title: string; lead: string; more: { q: string; a: string }[] };
  trust: { title: string; lead: string; points: Point[] };
  why: {
    title: string;
    lead: string;
    /** Proof cards: claim, the one-line proof, and the label of the link that shows it. */
    proofs: [h: string, p: string, link: string][];
    contrastTitle: string;
    before: string[];
    after: string[];
    /** "Who it is for": one line per department, in DeptKey order (six). */
    forWho: string[];
  };
  about: {
    title: string;
    lead: string;
    points: Point[];
    /** Shown on the page until the owner has reviewed it. */
    review: string;
  };
}
