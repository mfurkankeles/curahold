// A seat's private tone (the voice it uses only in the owner's own chat) is the
// owner's data: it lives in the stored card he sets in his console, never in the
// code, the demo bundle or the web app. This test keeps it that way: the built-in
// org chart carries none, the runtime uses a stored one only in the owner's chat,
// and no source file (nor a built demo, when one is on disk) contains the words
// the old built-in text used. Those words are stored here only as hashes, like
// tests/leak.test.ts, so this file contains none of them.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ORG_CHART, seatDef } from '../shared/src/team/orgChart';
import { seatBlock } from '../api/src/team/runtime';
import type { SeatPolicy } from '../api/src/team/policy';
import { seedOrgChart } from '../api/src/team/seed';
import { setup } from './helpers';

const ROOT = join(import.meta.dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'screens', 'dist']);
const TEXT = /\.(ts|tsx|js|mjs|json|sql|md|css|html|txt)$/;

function files(dir: string, skip: Set<string>, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, skip, out);
    else if (TEXT.test(name) && name !== 'package-lock.json') out.push(p);
  }
  return out;
}

// Same normalisation as the leak test: lower case, Turkish letters folded, words split on anything else.
const FOLD: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
const norm = (s: string) =>
  s
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşüâîû]/g, (c) => FOLD[c])
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
// Memoised: built bundles repeat the same words many thousands of times.
const seen = new Map<string, string>();
const sha = (s: string) => {
  let h = seen.get(s);
  if (h === undefined) seen.set(s, (h = createHash('sha256').update(s).digest('hex')));
  return h;
};

// sha256 of the normalised words and word pairs of the old built-in tone (an endearment, the
// relationship it imitated, and the phrases around it). Plain words are never stored here.
const UNIGRAMS = new Set([
  '815fbec040e347c18722eb2547fb73f896e263a43b43db9eb390cd3b764a7ece',
  '62c619c07666713e55973571bdb8d2f7a325bf5fbb78886de732edd2c2baeb31',
]);
const BIGRAMS = new Set([
  '12d3c3eee456a8bf9102512640415dd06b6a96313604b9db39256d9784623b0a',
  '263fd6298ef3a51b74bfa0b61151872ea040ed13266bbe3cbeaccd1a0476fa90',
  '8c6e0097aab788fa4d9c52bf12315798d3cd1bca032da3b30be79a0aa127b417',
]);

function hits(list: string[]): string[] {
  const out: string[] = [];
  for (const f of list) {
    const words = norm(readFileSync(f, 'utf8')).split(' ');
    for (let i = 0; i < words.length; i++) {
      if (UNIGRAMS.has(sha(words[i]))) out.push(`${relative(ROOT, f)}: word #${i}`);
      if (i + 1 < words.length && BIGRAMS.has(sha(`${words[i]} ${words[i + 1]}`))) out.push(`${relative(ROOT, f)}: words #${i}-${i + 1}`);
    }
  }
  return out;
}

const policy = (card: SeatPolicy['card']): SeatPolicy => ({
  seat: 'cpo',
  name: 'Ada',
  title: 'Chief Product Officer',
  team: 'product',
  tier: 'executive',
  state: 'standing',
  reportsTo: 'coo',
  filledBy: 'agent',
  weeklyBudget: 1,
  activatedAt: null,
  card,
  model: 'deep',
  tools: new Set(),
  proposes: new Set(['none']),
  reviews: new Set(),
});

describe('private tone stays owner-only', () => {
  it('no built-in seat carries a private tone', () => {
    expect(ORG_CHART.filter((s) => s.card.privateTone !== undefined).map((s) => s.seat)).toEqual([]);
  });

  it('the built-in card gives the professional tone in every context, the demo included', () => {
    const card = seatDef('cpo')!.card;
    for (const ctx of ['owner-chat', 'wake', 'meeting', 'eval'] as const) {
      const block = seatBlock(policy(card), ctx);
      expect(block).toContain('Tone: professional and warm, concise.');
      expect(block).not.toContain('Private chat with the CEO');
    }
  });

  it("a tone stored in the owner's card is used only in his own chat", () => {
    const card = { ...seatDef('cpo')!.card, privateTone: 'Short and cheerful, in Turkish.' };
    expect(seatBlock(policy(card), 'owner-chat')).toContain('Private chat with the CEO: Short and cheerful, in Turkish.');
    for (const ctx of ['wake', 'meeting', 'eval'] as const) expect(seatBlock(policy(card), ctx)).not.toContain('Short and cheerful');
  });

  it("resetting the org chart keeps the owner's stored tone", async () => {
    const env = await setup();
    const TONE = 'Short and cheerful, in Turkish.';
    await env.db.system((q) => seedOrgChart(q, { by: 'test' }));
    await env.db.system((q) => q.query(`update seats set card = card || jsonb_build_object('privateTone', $1::text, 'mission', 'Edited') where seat = 'cpo'`, [TONE]));
    await env.db.system((q) => seedOrgChart(q, { reset: true, by: 'test' }));
    const [cpo] = await env.db.system((q) => q.query(`select card from seats where seat = 'cpo'`));
    expect(cpo.card.privateTone).toBe(TONE);
    expect(cpo.card.mission).toBe(seatDef('cpo')!.card.mission);
    // Seats without one get none from the reset.
    const [coo] = await env.db.system((q) => q.query(`select card from seats where seat = 'coo'`));
    expect(coo.card.privateTone).toBeUndefined();
  });

  it('no source file contains the old built-in tone', () => {
    const all = files(ROOT, SKIP_DIRS);
    expect(all.length).toBeGreaterThan(30);
    expect(hits(all)).toEqual([]);
  });

  // The code bundles only: the built docs pages come from docs/site, which the test above already scans.
  it('a built demo or web bundle on disk contains none of it either', () => {
    const built = ['dist/demo/assets', 'dist/web/assets'].map((d) => join(ROOT, d)).filter((d) => existsSync(d));
    expect(hits(built.flatMap((d) => files(d, new Set())).filter((f) => f.endsWith('.js')))).toEqual([]);
  }, 120_000);
});
