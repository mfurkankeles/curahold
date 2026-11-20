// Colour pairs of the design tokens (web/src/styles.css, docs/design/tokens.md "Colour"), both themes:
// text at least 4.5:1 on every surface it sits on, controls and the focus ring at least 3:1 (WCAG 2.2
// 1.4.3, 1.4.11, 2.4.13), and white or dark text at least 4.5:1 on every stop of the brand gradients
// (the primary button's light end was 3.3:1). A token change that breaks a pair fails here.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../web/src/styles.css', import.meta.url), 'utf8');

function block(selector: string): Record<string, string> {
  const at = css.indexOf(`${selector} {`);
  const body = css.slice(at + selector.length + 2, css.indexOf('\n}', at));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
const light = block(':root');
const dark = { ...light, ...block(":root[data-theme='dark']") };

function resolve(theme: Record<string, string>, name: string): string {
  let v = theme[name];
  for (let i = 0; i < 5 && v?.startsWith('var('); i++) v = theme[/var\((--[\w-]+)/.exec(v)![1]];
  return v;
}
const hexes = (v: string) => [...v.matchAll(/#[0-9a-f]{6}\b/gi)].map((m) => m[0]);

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const SURFACES = ['--paper', '--surface', '--surface-2', '--sunk'];

describe.each([
  ['light', light],
  ['dark', dark],
])('%s theme', (_, theme) => {
  const c = (name: string) => {
    const v = resolve(theme, name);
    expect(v, name).toMatch(/^#[0-9a-f]{6}$/i);
    return v;
  };

  it('text tokens are at least 4.5:1 on every surface', () => {
    for (const text of ['--ink', '--ink-2', '--ink-3', '--brand-ink'])
      for (const bg of SURFACES) expect(ratio(c(text), c(bg)), `${text} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  });

  it('text on the brand colour and on every stop of the brand gradients is at least 4.5:1', () => {
    expect(ratio(c('--on-brand'), c('--brand'))).toBeGreaterThanOrEqual(4.5);
    for (const stop of hexes(resolve(theme, '--grad'))) expect(ratio(c('--on-brand'), stop), `--grad ${stop}`).toBeGreaterThanOrEqual(4.5);
    for (const g of ['--new-bg', '--new-hover']) for (const stop of hexes(resolve(theme, g))) expect(ratio(c('--new-ink'), stop), `${g} ${stop}`).toBeGreaterThanOrEqual(4.5);
  });

  it('field borders, the focus ring and the brand mark are at least 3:1 where they sit', () => {
    for (const bg of ['--paper', '--surface']) expect(ratio(c('--field-line'), c(bg)), `--field-line on ${bg}`).toBeGreaterThanOrEqual(3);
    for (const bg of SURFACES) expect(ratio(c('--focus'), c(bg)), `--focus on ${bg}`).toBeGreaterThanOrEqual(3);
    for (const bg of ['--paper', '--surface']) expect(ratio(c('--brand'), c(bg)), `--brand on ${bg}`).toBeGreaterThanOrEqual(3);
  });
});
