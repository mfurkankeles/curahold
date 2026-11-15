// /.well-known/security.txt (RFC 9116) on every Curahold address: where to report
// a vulnerability, in which languages, and the disclosure policy in the help centre.
// The contact is the owner's to set (SECURITY_CONTACT); until then a clearly marked
// placeholder that cannot receive mail is shown.
import type { Context } from 'hono';
import { centralUrl, type AppEnv } from '../context';

export const SECURITY_CONTACT_PLACEHOLDER = 'mailto:security-contact-not-set@example.invalid';

export function securityTxt(c: Context<AppEnv>) {
  const cfg = c.get('deps').config;
  const contact = cfg.securityContact?.trim() || SECURITY_CONTACT_PLACEHOLDER;
  const contactLine = /^(mailto:|https:\/\/)/.test(contact) ? contact : `mailto:${contact}`;
  const base = centralUrl(cfg);
  const now = (c.get('deps').now ?? (() => new Date()))();
  // Always about half a year ahead, as the RFC asks (at most a year).
  const expires = new Date(now.getTime() + 180 * 86400_000);
  expires.setUTCHours(0, 0, 0, 0);
  const lines = [
    ...(cfg.securityContact ? [] : ['# PLACEHOLDER: the operator has not set SECURITY_CONTACT yet.']),
    `Contact: ${contactLine}`,
    `Expires: ${expires.toISOString().replace('.000Z', 'Z')}`,
    'Preferred-Languages: en, tr',
    `Policy: ${base}/docs/en/responsible-disclosure/`,
    `Canonical: ${base}/.well-known/security.txt`,
    '',
  ];
  return c.body(lines.join('\n'), 200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=86400' });
}
