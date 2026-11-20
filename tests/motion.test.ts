// The motion system (docs/design/tokens.md "Motion"): reads the duration and curve tokens from
// web/src/styles.css and the open/close rules from web/src/motion.css, and checks the rules the
// design sets — four durations, exits 100–150 ms and 50 ms shorter than their entry, only opacity
// and transform in the open/close keyframes, a 100 ms fade kept under "reduce motion", and every
// overlay component leaving a stand-in for its exit (web/src/lib/leave.ts).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = (p: string) => readFileSync(new URL(`../web/src/${p}`, import.meta.url), 'utf8');
const styles = css('styles.css');
const motion = css('motion.css');
const rootBlock = styles.slice(styles.indexOf(':root {'), styles.indexOf('\n}', styles.indexOf(':root {')));
const token = (name: string) => new RegExp(`${name}:\\s*([^;]+);`).exec(rootBlock)?.[1].trim();
const ms = (v: string) => {
  const name = /var\((--[\w-]+)\)/.exec(v)?.[1];
  const raw = name ? token(name)! : v;
  return raw.endsWith('ms') ? parseFloat(raw) : parseFloat(raw) * 1000;
};
/** The duration an `animation:` shorthand in `rule` gives (the first var(--dur-*)). */
const durOf = (selector: string, source = motion) => {
  const at = source.indexOf(`${selector} {`);
  expect(at, `rule ${selector}`).toBeGreaterThan(-1);
  const body = source.slice(at, source.indexOf('}', at));
  return ms(/var\(--dur-\d\)/.exec(body)![0]);
};

describe('motion tokens', () => {
  it('has the four durations, three curves and three distances', () => {
    expect(['--dur-1', '--dur-2', '--dur-3', '--dur-4'].map((t) => ms(token(t)!))).toEqual([100, 150, 200, 280]);
    expect(token('--ease-out')).toBe('cubic-bezier(.2, .7, .3, 1)');
    expect(token('--ease-in')).toBe('cubic-bezier(.4, 0, 1, 1)');
    expect(token('--ease-move')).toBe('cubic-bezier(.2, 0, 0, 1)');
    expect(['--dist-1', '--dist-2', '--dist-3'].map(token)).toEqual(['4px', '8px', '16px']);
    expect(ms(token('--stagger')!)).toBe(30);
  });

  it('keeps every exit between 100 and 150 ms and 50 ms shorter than its entry', () => {
    const pairs: [string, string][] = [
      ['.panel', '.panel[data-leaving]'],
      ['.dialog__box, .qa', ':is(.dialog, .qa-wrap)[data-leaving] > :is(.dialog__box, .qa)'],
      ['.palette-box', '.palette-wrap[data-leaving] > .palette-box'],
      ['.toast', '.toast[data-leaving]'],
      ['.scrim, .shell__scrim, .dialog, .qa-wrap, .palette-wrap', ':is(.scrim, .shell__scrim, .datepop__scrim)[data-leaving]'],
    ];
    for (const [enter, leave] of pairs) {
      const a = durOf(enter);
      const b = durOf(leave);
      expect(b, leave).toBeGreaterThanOrEqual(100);
      expect(b, leave).toBeLessThanOrEqual(150);
      expect(a - b, `${enter} → ${leave}`).toBeGreaterThanOrEqual(50);
    }
    expect(durOf(':is(.popmenu, .bell__pop, .datepop)[data-leaving]')).toBe(100);
  });

  it('moves only opacity and transform when something opens or closes', () => {
    const names = ['fade-out', 'panel-in', 'panel-out', 'modal-in', 'modal-out', 'palette-in', 'palette-out', 'menu-out', 'menu-out-up', 'toast-in', 'toast-out', 'sheet-in', 'sheet-out'];
    for (const n of names) {
      const body = new RegExp(`@keyframes ${n} \\{(.*)\\}`).exec(motion)?.[1];
      expect(body, n).toBeTruthy();
      const props = [...body!.matchAll(/([a-z-]+):/g)].map((m) => m[1]);
      expect(props.every((p) => p === 'opacity' || p === 'transform'), `${n}: ${props}`).toBe(true);
    }
  });

  it('keeps a 100 ms fade under reduce motion', () => {
    const reduce = motion.slice(motion.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduce).toMatch(/animation: fade-in var\(--dur-1\) linear !important/);
    expect(reduce).toMatch(/\[data-leaving\] \{ animation: fade-out var\(--dur-1\) linear forwards !important/);
  });

  it('gives every overlay a stand-in for its exit', () => {
    const uses = (file: string) => readFileSync(new URL(`../web/src/components/${file}`, import.meta.url), 'utf8').includes('useLeave<');
    for (const f of ['ui.tsx', 'TaskPanel.tsx', 'RecordPanel.tsx', 'Menus.tsx', 'SearchPalette.tsx', 'DateField.tsx', 'FilterSheet.tsx', 'QuickAdd.tsx', 'Bell.tsx', 'Shell.tsx']) expect(uses(f), f).toBe(true);
  });

  it('lets every bottom sheet be pulled down to close, from a handle that keeps scrolling free', () => {
    const src = (file: string) => readFileSync(new URL(`../web/src/${file}`, import.meta.url), 'utf8');
    for (const f of ['FilterSheet.tsx', 'DateField.tsx', 'TaskPanel.tsx', 'RecordPanel.tsx']) expect(src(`components/${f}`), f).toMatch(/useDragClose\(/);
    const hook = src('lib/dragClose.ts');
    // Touch and pen only (a mouse keeps Close and the scrim), reduce motion keeps the sheet still.
    expect(hook).toMatch(/pointerType === 'mouse'/);
    expect(hook).toMatch(/prefers-reduced-motion: reduce/);
    expect(motion).toMatch(/\.filtersheet__head \{ touch-action: none; \}/);
    expect(motion).toMatch(/:is\(\.panel__head, \.datepop\) \{ touch-action: none; \}/);
    // The exit starts where the finger let go: the stand-in keeps the dragged offset.
    expect(motion).toMatch(/\[data-leaving\] \{ transform: translateY\(var\(--drag, 0px\)\); \}/);
  });
});
