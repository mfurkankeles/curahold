// Authenticator-app codes (TOTP, RFC 6238 over HOTP, RFC 4226): HMAC-SHA1,
// 30-second steps, 6 digits, one step either side allowed for clock drift.
// Web Crypto only, so the same code runs on Workers and on Node.
import { randomToken, sha256Hex } from './crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const STEP_SECONDS = 30;
export const DIGITS = 6;

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Uint8Array {
  const clean = s.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error('bad base32');
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** A new 160-bit secret, base32 (what authenticator apps expect). */
export function newSecret(): string {
  const b = new Uint8Array(20);
  crypto.getRandomValues(b);
  return base32Encode(b);
}

/** HOTP value for one counter. */
export async function hotp(secret: Uint8Array, counter: number, digits = DIGITS): Promise<string> {
  const msg = new Uint8Array(8);
  let c = BigInt(counter);
  for (let i = 7; i >= 0; i--) {
    msg[i] = Number(c & 0xffn);
    c >>= 8n;
  }
  const key = await crypto.subtle.importKey('raw', secret as Uint8Array<ArrayBuffer>, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const off = mac[mac.length - 1] & 15;
  const bin = ((mac[off] & 0x7f) << 24) | (mac[off + 1] << 16) | (mac[off + 2] << 8) | mac[off + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

export const stepOf = (ms: number) => Math.floor(ms / 1000 / STEP_SECONDS);

/**
 * Checks a code against the steps around `nowMs`. Returns the step it matched
 * (to be stored, so the same code cannot be used again), or null. A step at or
 * before `lastStep` never matches.
 */
export async function checkTotp(secretB32: string, code: string, nowMs: number, lastStep = 0): Promise<number | null> {
  if (!/^\d{6}$/.test(code)) return null;
  const secret = base32Decode(secretB32);
  const now = stepOf(nowMs);
  let hit: number | null = null;
  // Every candidate is computed (no early exit).
  for (const s of [now - 1, now, now + 1]) {
    if (s <= lastStep) continue;
    if ((await hotp(secret, s)) === code && hit === null) hit = s;
  }
  return hit;
}

/** The otpauth:// address an authenticator app reads (shown as a QR code or typed in). */
export function otpauthUri(secret: string, account: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

// ------------------------------------------------------------ recovery codes

/** "abcd-efgh-jk": ten characters a person can read and type. */
export function newRecoveryCode(): string {
  const raw = randomToken(12).toLowerCase().replace(/[^a-z0-9]/g, '').padEnd(10, '7').slice(0, 10);
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

export const normalizeRecovery = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
export const recoveryHash = (s: string) => sha256Hex(`recovery:${normalizeRecovery(s)}`);
