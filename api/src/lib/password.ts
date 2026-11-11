// Passwords, for the customer portal when a company allows them: PBKDF2-SHA256
// with a random salt (WebCrypto, so it runs on Workers; 100 000 rounds is
// the most Workers allow), compared in constant time.
import { base64url, fromBase64url, safeEqual } from './crypto';

const ROUNDS = 100_000;
const enc = new TextEncoder();

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, rounds: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: rounds }, key, 256));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256$${ROUNDS}$${base64url(salt)}$${base64url(await derive(password, salt, ROUNDS))}`;
}

export async function checkPassword(password: string, stored: string | null): Promise<boolean> {
  // Someone without a password still costs the same time, so timing tells nothing.
  const [scheme, rounds, salt, hash] = (stored ?? `pbkdf2-sha256$${ROUNDS}$${'A'.repeat(22)}$`).split('$');
  if (scheme !== 'pbkdf2-sha256') return false;
  const got = base64url(await derive(password, fromBase64url(salt), Number(rounds) || ROUNDS));
  return !!stored && safeEqual(got, hash);
}

/** At least 10 characters, not the address itself, not one of the most guessed. */
export function weakPassword(password: string, email: string): boolean {
  const p = password.toLowerCase();
  if (password.length < 10 || password.length > 128) return true;
  const local = email.split('@')[0].toLowerCase();
  if (local.length >= 4 && p.includes(local)) return true;
  if (/^(.)\1+$/.test(p) || /^(0123456789|1234567890|qwertyuiop|password\d*|parola\d*|sifre\d*|şifre\d*)/.test(p)) return true;
  return false;
}
