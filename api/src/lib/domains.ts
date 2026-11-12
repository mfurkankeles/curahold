// Email domains and company addresses.

// Addresses anyone can get. A company signing up with one of these gets no
// domain, so nobody can ask to join it by having, say, a Gmail address.
const PUBLIC_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'yahoo.com', 'ymail.com',
  'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'pm.me', 'gmx.com', 'gmx.de', 'gmx.net',
  'web.de', 'mail.com', 'zoho.com', 'yandex.com', 'yandex.ru', 'mail.ru', 'qq.com', '163.com', 'hey.com', 'fastmail.com',
  'tutanota.com', 'hotmail.co.uk', 'yahoo.co.uk', 'outlook.de', 'hotmail.de', 'hotmail.fr', 'yahoo.fr', 'libero.it',
  'hotmail.it', 'yahoo.de', 'windowslive.com', 'yandex.com.tr', 'mynet.com', 'hotmail.com.tr', 'outlook.com.tr',
]);

export const emailDomain = (email: string) => email.slice(email.lastIndexOf('@') + 1).toLowerCase();
export const isPublicDomain = (domain: string) => PUBLIC_DOMAINS.has(domain.toLowerCase());

// Subdomains that belong to Curahold itself.
export const RESERVED_SLUGS = new Set([
  'www', 'app', 'api', 'auth', 'admin', 'mail', 'status', 'docs', 'help', 'support', 'billing', 'blog', 'demo',
  'login', 'signup', 'static', 'assets', 'cdn', 'dev', 'test', 'staging', 'curahold', 'console', 'servis', 'service',
  'webhooks', 'hooks', 'oauth', 'id', 'account', 'accounts', 'security', 'legal', 'privacy', 'about', 'pricing',
]);

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

export function slugProblem(slug: string): 'format' | 'reserved' | null {
  if (!SLUG_RE.test(slug) || slug.includes('--')) return 'format';
  if (RESERVED_SLUGS.has(slug)) return 'reserved';
  return null;
}

export function slugify(text: string): string {
  const map: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', İ: 'i', ö: 'o', ş: 's', ü: 'u', ä: 'a', ß: 'ss', é: 'e', è: 'e', á: 'a', ñ: 'n' };
  return text
    .toLowerCase()
    .replace(/[çğıİöşüäßéèáñ]/g, (ch) => map[ch] ?? ch)
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

/** "northwind-traders.co.uk" → "Northwind Traders" */
export function companyFromDomain(domain: string): string {
  const label = domain.split('.')[0] ?? '';
  return label
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}
