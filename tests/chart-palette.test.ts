// The chart palette, recomputed from the stylesheet on every run: the eight series colours in
// web/src/styles.css (light :root and dark :root[data-theme='dark']) must keep the checks that make
// them safe to read (docs/design/tokens.md "Chart colours"):
//   - lightness band per mode (OKLCH L 0.43–0.77 light, 0.48–0.67 dark) and a chroma floor (C ≥ 0.10);
//   - adjacent slots apart under simulated protanopia and deuteranopia (Machado 2009, severity 1.0):
//     OKLab ΔE×100 ≥ 8, and ≥ 15 for full colour vision;
//   - every mark at least 3:1 on the page and on cards (WCAG 1.4.11), and "Other" too;
//   - the first three slots apart in every pair (scatter-like charts cap at three series).
// It also holds the chart code to the palette: slots in order, never cycled, a ninth part is "Other".
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..');
const css = readFileSync(join(ROOT, 'web/src/styles.css'), 'utf8');

/** The custom properties of the first rule whose selector is exactly `selector`. */
function block(selector: string): Record<string, string> {
  const at = css.indexOf(`${selector} {`);
  if (at < 0) throw new Error(`no ${selector} block`);
  const body = css.slice(at, css.indexOf('\n}', at));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
const LIGHT = block(':root');
const DARK = { ...LIGHT, ...block(":root[data-theme='dark']") };
const resolve = (vars: Record<string, string>, v: string): string => {
  const m = /^var\((--[\w-]+)\)$/.exec(v);
  return m ? resolve(vars, vars[m[1]]) : v;
};
const series = (vars: Record<string, string>) => Array.from({ length: 8 }, (_, i) => resolve(vars, vars[`--series-${i + 1}`]));

// ---------------------------------------------------------------- colour maths
const rgb = (hex: string) => [0, 2, 4].map((i) => parseInt(hex.replace('#', '').slice(i, i + 2), 16) / 255);
const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLin = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const lum = (hex: string) => {
  const [r, g, b] = rgb(hex).map(toLin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
function oklab(lin: number[]): number[] {
  const [r, g, b] = lin;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
// Machado, Oliveira & Fernandes (2009), severity 1.0, on linear RGB; the result is clamped to the gamut.
const MACHADO = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
};
const sim = (hex: string, kind?: keyof typeof MACHADO): number[] => {
  const lin = rgb(hex).map(toLin);
  if (!kind) return oklab(lin);
  const out = MACHADO[kind].map((row) => Math.min(1, Math.max(0, row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2])));
  return oklab(out.map(fromLin).map(toLin));
};
const dE = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * 100;
const cvd = (a: string, b: string) => Math.min(dE(sim(a, 'protan'), sim(b, 'protan')), dE(sim(a, 'deutan'), sim(b, 'deutan')));
const normal = (a: string, b: string) => dE(sim(a), sim(b));
const lch = (hex: string) => {
  const [L, A, B] = sim(hex);
  return { L, C: Math.hypot(A, B) };
};

const MODES = [
  { mode: 'light', vars: LIGHT, band: [0.43, 0.77], surfaces: ['--paper', '--surface'] },
  { mode: 'dark', vars: DARK, band: [0.48, 0.67], surfaces: ['--paper', '--surface'] },
] as const;

describe('chart palette', () => {
  for (const { mode, vars, band, surfaces } of MODES) {
    const pal = series(vars);
    it(`${mode}: eight hex colours, all different`, () => {
      for (const c of pal) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
      expect(new Set(pal).size).toBe(8);
    });
    it(`${mode}: inside the lightness band, above the chroma floor`, () => {
      for (const c of pal) {
        const { L, C } = lch(c);
        expect(L, c).toBeGreaterThanOrEqual(band[0]);
        expect(L, c).toBeLessThanOrEqual(band[1]);
        expect(C, c).toBeGreaterThanOrEqual(0.1);
      }
    });
    it(`${mode}: neighbours stay apart for colour-blind and full-colour readers`, () => {
      for (let i = 1; i < pal.length; i++) {
        expect(cvd(pal[i - 1], pal[i]), `${pal[i - 1]}↔${pal[i]} (protan/deutan)`).toBeGreaterThanOrEqual(8);
        expect(normal(pal[i - 1], pal[i]), `${pal[i - 1]}↔${pal[i]} (normal)`).toBeGreaterThanOrEqual(15);
      }
    });
    it(`${mode}: the first three are apart in every pair`, () => {
      for (let i = 0; i < 3; i++)
        for (let j = i + 1; j < 3; j++) {
          expect(cvd(pal[i], pal[j])).toBeGreaterThanOrEqual(8);
          expect(normal(pal[i], pal[j])).toBeGreaterThanOrEqual(15);
        }
    });
    it(`${mode}: every mark, and "Other", at least 3:1 on the page and on cards`, () => {
      for (const s of surfaces) {
        const bg = resolve(vars, vars[s]);
        for (const c of [...pal, resolve(vars, vars['--series-other'])]) expect(contrast(c, bg), `${c} on ${s} ${bg}`).toBeGreaterThanOrEqual(3);
      }
    });
  }

  it('a colour a person chose maps to a validated hue (both themes inherit it)', () => {
    for (const hue of ['plum', 'coral', 'sea', 'honey', 'rose', 'leaf', 'sky', 'stone']) expect(LIGHT[`--chart-${hue}`]).toMatch(/^var\(--series-(\d|other)\)$/);
    expect(block(":root[data-theme='dark']")['--chart-sky']).toBeUndefined();
  });

  it('the chosen colours that clash are exactly the ones the charts refuse to put together', () => {
    const hues = ['plum', 'coral', 'sea', 'honey', 'rose', 'leaf', 'sky', 'stone'];
    const at = (vars: Record<string, string>, hue: string) => resolve(vars, LIGHT[`--chart-${hue}`].replace(/^var\((--[\w-]+)\)$/, (_, v) => vars[v]));
    const clash: string[] = [];
    for (let i = 0; i < hues.length; i++)
      for (let j = i + 1; j < hues.length; j++) {
        const worst = Math.min(...MODES.map(({ vars }) => cvd(at(vars, hues[i]), at(vars, hues[j]))));
        const near = Math.min(...MODES.map(({ vars }) => normal(at(vars, hues[i]), at(vars, hues[j]))));
        if (worst < 8 || near < 15) clash.push([hues[i], hues[j]].sort().join('|'));
      }
    const src = readFileSync(join(ROOT, 'web/src/components/Charts.tsx'), 'utf8');
    const listed = JSON.parse(/CLASHING_COLOURS: readonly string\[\] = (\[[^\]]*\])/.exec(src)![1].replace(/'/g, '"'));
    expect([...listed].sort()).toEqual(clash.sort());
  });

  it('charts take slots in order and never cycle: a ninth part is "Other"', () => {
    const src = readFileSync(join(ROOT, 'web/src/components/Charts.tsx'), 'utf8');
    expect(src).not.toMatch(/%\s*CYCLE\.length/);
    expect(src).toMatch(/k < SERIES_SLOTS \? String\(k \+ 1\) : 'other'/);
    const sheet = readFileSync(join(ROOT, 'web/src/surfaces/employee-insight.css'), 'utf8');
    for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', 'other']) expect(sheet).toContain(`[data-series='${k}'] { --oc: var(--series-${k}); }`);
  });
});
