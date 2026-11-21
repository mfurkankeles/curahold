// Korean particles that depend on the word before them (은/는, 이/가, 을/를, 과/와, (으)로, (이)나).
// The dictionary writes the two-form fallback ("{org}을(를)", "{domain}은(는)"), because a translator
// cannot know which name a placeholder will hold; translate() calls resolveKoParticles() after the
// names are in, so the reader sees one particle, as a native writer would ("Acme를", "Velto는").
// The localisation review (21 Nov 2026) found 178 fallbacks shown as written, which reads as machine output.
//
// Which form: a final consonant (받침) takes 은, 이, 을, 과, 으로, 이나; none takes 는, 가, 를, 와, 로, 나.
// (으)로 also takes 로 after ㄹ. Latin names and digits are read the way Korean says them ("Slack" 슬랙 →
// 받침, "API" 에이피아이 → none, "3" 삼 → 받침). When the word before cannot be read (an emoji, nothing),
// the fallback stays: it is still correct Korean, only less polished.

type Final = 'none' | 'rieul' | 'other' | 'unknown';

// Digits as Korean reads them: 0 영, 1 일, 2 이, 3 삼, 4 사, 5 오, 6 육, 7 칠, 8 팔, 9 구.
const DIGIT: Final[] = ['other', 'rieul', 'none', 'other', 'none', 'none', 'other', 'rieul', 'rieul', 'none'];
// A capital spelled out letter by letter (an acronym): only L 엘, M 엠, N 엔, R 알 end in a consonant.
const LETTER: Record<string, Final> = { L: 'rieul', M: 'other', N: 'other', R: 'rieul' };

/** How the text right before `end` ends when read aloud in Korean. */
function finalBefore(text: string, end: number): Final {
  let i = end - 1;
  // Look past closing quotes and brackets: "「Acme」를", "(Acme)를".
  while (i >= 0 && /["'”’」』》)\]]/.test(text[i]!)) i--;
  if (i < 0) return 'unknown';
  const ch = text[i]!;
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const jong = (code - 0xac00) % 28;
    return jong === 0 ? 'none' : jong === 8 ? 'rieul' : 'other';
  }
  if (/[0-9]/.test(ch)) return DIGIT[Number(ch)]!;
  if (/[A-Za-z]/.test(ch)) {
    let s = i;
    while (s > 0 && /[A-Za-z]/.test(text[s - 1]!)) s--;
    const word = text.slice(s, i + 1);
    if (/^[A-Z]{1,6}$/.test(word)) return LETTER[ch] ?? 'none';
    return latinFinal(word.toLowerCase());
  }
  return 'unknown';
}

/**
 * How a Latin word ends in its Korean reading (loanword spelling). Korean adds a vowel after a consonant cluster or a
 * voiced stop, so only a few endings keep a final consonant (localisation review, 21 Nov 2026: "Microsoft을" and
 * "Prime를" were wrong):
 * - `l`, `le` → ㄹ (Excel 엑셀, Google 구글);
 * - `m`, `n`, `ng`, and a vowel + `me`/`ne` with a silent e → final (Notion 노션, Prime 프라임, Stone 스톤; but Acme 애크미);
 * - one stop `k p t c` (or `ck`) right after a single vowel, or `ook` → final (Slack 슬랙, Hubspot 허브스팟, Facebook 페이스북);
 * - everything else ends in a vowel: a stop after a consonant (Microsoft 마이크로소프트, Zendesk 젠데스크, Curahold
 *   큐라홀드), after a long vowel (Meet 미트), `d g b` (GitHub 깃허브), `r s x z h w f v y`, and other silent-e words.
 */
function latinFinal(w: string): Final {
  if (/l$|le$/.test(w)) return 'rieul';
  if (/[aeiou][mn]e$/.test(w) || /(ng|m|n)$/.test(w)) return 'other';
  const s = w.replace(/ck$/, 'k');
  if (/[kptc]$/.test(s)) {
    const before = s.slice(0, -1);
    if (s.endsWith('ook')) return 'other';
    if (/[aeiou]$/.test(before) && !/[aeiou]{2}$/.test(before)) return 'other';
  }
  return 'none';
}

// Fallback written in the dictionary → [form after a consonant, form after a vowel, form after ㄹ].
const PAIRS: [string, string, string, string][] = [
  ['은(는)', '은', '는', '은'],
  ['는(은)', '은', '는', '은'],
  ['이(가)', '이', '가', '이'],
  ['가(이)', '이', '가', '이'],
  ['을(를)', '을', '를', '을'],
  ['를(을)', '을', '를', '을'],
  ['과(와)', '과', '와', '과'],
  ['와(과)', '과', '와', '과'],
  ['(으)로', '으로', '로', '로'],
  ['(이)나', '이나', '나', '이나'],
  ['(이)라는', '이라는', '라는', '이라는'],
  ['(이)라고', '이라고', '라고', '이라고'],
];
const PATTERN = new RegExp(PAIRS.map(([f]) => f.replace(/[()]/g, '\\$&')).join('|'), 'g');

/** Picks the one right particle for every two-form fallback in a Korean string. */
export function resolveKoParticles(text: string): string {
  if (!text.includes('(')) return text;
  return text.replace(PATTERN, (fallback, offset: number) => {
    const pair = PAIRS.find(([f]) => f === fallback)!;
    const final = finalBefore(text, offset);
    if (final === 'unknown') return fallback;
    return final === 'none' ? pair[2] : final === 'rieul' ? pair[3] : pair[1];
  });
}
