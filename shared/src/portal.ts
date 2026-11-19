// The customer portal: what a company opens to its customers' people.
import type { Locale } from './i18n';

export const PORTAL_FIELDS = ['due', 'priority', 'assignee'] as const;
export type PortalField = (typeof PORTAL_FIELDS)[number];

/** A board's portal settings. Customers see only what is listed here. */
export interface BoardPortal {
  enabled: boolean;
  /** The column new requests land in. */
  intake: string;
  /** What the customer reads for each column (the internal name otherwise). */
  labels: Record<string, string>;
  fields: PortalField[];
}

export interface PortalPerson {
  id: string;
  accountId: string;
  accountName: string | null;
  email: string;
  name: string;
  status: 'invited' | 'active' | 'disabled';
  createdAt: string;
  lastSeenAt: string | null;
}

export interface PortalSettings {
  /** False when this installation has no portal address. */
  available: boolean;
  enabled: boolean;
  address: string | null;
  boards: { id: string; name: string }[];
  auth: PortalAuth;
  /** Google and Microsoft sign-in set up for this installation. */
  providers: { google: boolean; microsoft: boolean };
  brand: PortalBrand;
  /** The company's logo (Settings → Company), shown on the portal and in its emails. */
  logoUrl: string | null;
  /** Files customers sent from the portal: how much the company allows in all (MB), and how much is used. */
  uploads: { quotaMb: number; usedMb: number };
}

// What the portal app reads (from /papi).
export interface PortalColumn {
  key: string;
  /** What the company wrote for this column in the board's portal settings; null: the portal names the step. */
  name: string | null;
  /** Where a request in this column stands, for the customer: received, being worked on, finished. */
  step: 'new' | 'doing' | 'done';
  done: boolean;
}
export interface PortalBoard {
  id: string;
  name: string;
  columns: PortalColumn[];
  fields: PortalField[];
}
export interface PortalMe {
  user: { id: string; name: string; email: string; locale: Locale | null };
  account: { id: string; name: string };
  boards: PortalBoard[];
}
export interface PortalTask {
  id: string;
  boardId: string;
  title: string;
  description: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  mine: boolean;
  openedBy: string | null;
  dueDate?: string | null;
  priority?: string | null;
  assignees?: string[] | null;
  replies: number;
  /** The latest reply is the team's: the customer has something new to read. */
  lastFromTeam?: boolean;
  /** When someone at the customer approved the finished work, and who. */
  approvedAt?: string | null;
  approvedBy?: string | null;
}
/** A file on a request or a reply, as the customer sees it. */
export interface PortalFile {
  id: string;
  name: string;
  size: number;
  mime: string;
  /** The reply it belongs to; null for the request itself. */
  commentId: string | null;
}
/** Files one request, reply or onboarding step may carry at once (each up to PORTAL_FILE_MB). */
export const PORTAL_MAX_FILES = 5;
/** One file from the portal, at most. */
export const PORTAL_FILE_MB = 25;
/** What a company allows its customers to send in all, unless it sets its own (Settings → Customer portal). */
export const PORTAL_QUOTA_MB = 2048;
export const PORTAL_QUOTA_MAX_MB = 102_400;
/**
 * The endings a customer may send — documents, images, spreadsheets and CSV, PDF, ZIP — and only to a
 * request or ticket shared with them, or a step of their onboarding plan. The server also checks each
 * file's first bytes (api/src/lib/portal.ts). There is no malware scan yet: a go-live item (docs/RUNBOOK.md, "Go-live checklist").
 */
export const PORTAL_FILE_ENDINGS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf', 'docx', 'xlsx', 'pptx', 'odt', 'ods', 'txt', 'csv', 'zip'] as const;

export interface PortalComment {
  id: string;
  body: string;
  createdAt: string;
  fromCustomer: boolean;
  mine: boolean;
  author: string | null;
}
export interface PortalTaskDetail extends PortalTask {
  board: PortalBoard;
  comments: PortalComment[];
  /** Files on the request and its replies (see PortalFile.commentId). */
  files: PortalFile[];
}
export interface PortalOrg {
  name: string;
  locale: Locale;
  logoUrl: string | null;
  signIn: PortalSignInOptions;
  brand: PortalBrand;
  /** Cloudflare Turnstile's public key for the sign-in forms, when it is on (api/src/lib/humanCheck.ts). */
  turnstile?: string | null;
}

// ------------------------------------------------------------ the company's brand

/** How the portal and its emails carry the company: its colour, and whether Curahold is named at the foot. */
export interface PortalBrand {
  /** '#rrggbb', or null for the portal's own quiet colour. */
  color: string | null;
  /** A small "powered by Curahold" at the foot of the portal and its emails. */
  poweredBy: boolean;
}
export const DEFAULT_PORTAL_BRAND: PortalBrand = { color: null, poweredBy: true };
/** The portal's colour when a company has not chosen one. */
export const PORTAL_DEFAULT_COLOR = '#5b4de8';
export const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function portalBrandOf(raw: unknown): PortalBrand {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    color: typeof r.color === 'string' && HEX_COLOR.test(r.color) ? r.color.toLowerCase() : null,
    poweredBy: typeof r.poweredBy === 'boolean' ? r.poweredBy : true,
  };
}

const rgbOf = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const hexOf = (c: number[]) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
const lum = (hex: string) => {
  const [r, g, b] = rgbOf(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** WCAG contrast ratio of two '#rrggbb' colours. */
export function contrast(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
const mix = (a: string, b: string, t: number) => {
  const [p, q] = [rgbOf(a), rgbOf(b)];
  return hexOf(p.map((v, i) => v + (q[i] - v) * t));
};
/** The brand colour moved toward `to` just far enough to reach `need` against every background. */
const reach = (c: string, to: string, bgs: string[], need: number) => {
  for (let t = 0; t <= 1.0001; t += 0.04) {
    const m = mix(c, to, t);
    if (bgs.every((bg) => contrast(m, bg) >= need)) return m;
  }
  return to;
};

/** The portal's surfaces, light and dark (web/portal/portal.css repeats them). */
export const PORTAL_SURFACES = { light: { paper: '#f5f5fb', surface: '#ffffff', ink: '#17152f' }, dark: { paper: '#0f0e1a', surface: '#171626', ink: '#e7e6f5' } } as const;

export interface BrandPalette {
  /** Buttons and marks, and the text on them. */
  fill: string;
  onFill: string;
  /** Links and brand text on the page. */
  ink: string;
  /** A tinted background (the brand band, a selected tab). */
  wash: string;
}

/** Everything drawn from one brand colour, in both themes, each pair at WCAG AA (4.5:1) or better. */
export function brandPalette(color: string | null): { light: BrandPalette; dark: BrandPalette } {
  const c = color && HEX_COLOR.test(color) ? color.toLowerCase() : PORTAL_DEFAULT_COLOR;
  const L = PORTAL_SURFACES.light;
  const D = PORTAL_SURFACES.dark;
  const fillFor = (bgLight: boolean) => {
    // Text on the button: white or the theme's deep ink, whichever reads; the fill moves if neither does.
    const darkText = bgLight ? L.ink : D.paper;
    const on = contrast(c, '#ffffff') >= contrast(c, darkText) ? '#ffffff' : darkText;
    const fill = contrast(c, on) >= 4.5 ? c : reach(c, on === '#ffffff' ? '#000000' : '#ffffff', [on], 4.5);
    return { fill, onFill: on };
  };
  const washL = mix(c, L.surface, 0.88);
  const washD = mix(c, D.surface, 0.78);
  return {
    light: { ...fillFor(true), ink: reach(c, '#000000', [L.paper, L.surface, washL], 4.6), wash: washL },
    dark: { ...fillFor(false), ink: reach(c, '#ffffff', [D.paper, D.surface, washD], 4.6), wash: washD },
  };
}

// ------------------------------------------------------------ signing in

/** Ways people at customers can sign in; each company chooses which are on. */
export const PORTAL_METHODS = ['email', 'google', 'microsoft', 'passkey', 'password'] as const;
export type PortalMethod = (typeof PORTAL_METHODS)[number];
export const PORTAL_SESSION_DAYS = [1, 7, 30, 90] as const;

export interface PortalAuth {
  /** A link and a six-digit code by email. */
  email: boolean;
  google: boolean;
  microsoft: boolean;
  /** Fingerprint, face or device PIN (WebAuthn), added after a first sign-in. */
  passkey: boolean;
  password: boolean;
  /** How long a sign-in lasts on a device. */
  sessionDays: (typeof PORTAL_SESSION_DAYS)[number];
  /** Email the person when they sign in without an email link (Google, Microsoft, passkey, password). */
  notify: boolean;
}

export const DEFAULT_PORTAL_AUTH: PortalAuth = { email: true, google: true, microsoft: true, passkey: true, password: false, sessionDays: 30, notify: true };

export function portalAuthOf(raw: unknown): PortalAuth {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const flag = (k: keyof PortalAuth) => (typeof r[k] === 'boolean' ? (r[k] as boolean) : (DEFAULT_PORTAL_AUTH[k] as boolean));
  const days = (PORTAL_SESSION_DAYS as readonly number[]).includes(r.sessionDays as number) ? (r.sessionDays as PortalAuth['sessionDays']) : DEFAULT_PORTAL_AUTH.sessionDays;
  return { email: flag('email'), google: flag('google'), microsoft: flag('microsoft'), passkey: flag('passkey'), password: flag('password'), sessionDays: days, notify: flag('notify') };
}

/** What the sign-in page offers (company choice and what this installation can do). */
export type PortalSignInOptions = Record<PortalMethod, boolean>;

export interface PortalAccount {
  email: string;
  methods: PortalSignInOptions;
  password: { set: boolean; setAt: string | null };
  passkeys: { id: string; name: string; createdAt: string; lastUsedAt: string | null }[];
  identities: { provider: 'google' | 'microsoft'; email: string; lastUsedAt: string | null }[];
}
