// The busy state on every save button (web/src/lib/busy.ts): a change sent right after a press on a
// save-like button shows the ring while it is on its way and the tick when it worked; a quick change shows
// nothing (no flicker), a failure no tick, and buttons that open, toggle or own their state are left alone.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notePress, trackChange, PRESS_MS, type Pressable } from '../web/src/lib/busy';

/** A button as far as busy.ts needs: classes and attributes, matched by the few selectors it uses. */
function button(classes: string[], attrs: Record<string, string> = {}): Pressable & { attrs: Record<string, string> } {
  const own = { ...attrs };
  return {
    attrs: own,
    isConnected: true,
    matches(selector: string) {
      return selector.split(',').some((part) => {
        const s = part.trim();
        if (s.startsWith('.')) return classes.includes(s.slice(1));
        const m = /^\[([\w-]+)(?:=([\w-]+))?\]$/.exec(s);
        return !!m && m[1] in own && (m[2] === undefined || own[m[1]] === m[2]);
      });
    },
    setAttribute(n, v) {
      own[n] = v;
    },
    removeAttribute(n) {
      delete own[n];
    },
  };
}
const later = <T,>(ms: number, value: T, fail = false) => new Promise<T>((ok, no) => setTimeout(() => (fail ? no(new Error('no')) : ok(value)), ms));

describe('busy state on every save', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] }));
  afterEach(() => vi.useRealTimers());

  it('rings while a slow save is on its way, then ticks', async () => {
    const save = button(['btn', 'btn--primary']);
    notePress(save);
    const sent = trackChange(later(500, 'ok'));
    expect(save.attrs['aria-busy']).toBe('true');
    await vi.advanceTimersByTimeAsync(500);
    await sent;
    await vi.advanceTimersByTimeAsync(0);
    expect(save.attrs['aria-busy']).toBeUndefined();
    expect('data-done' in save.attrs).toBe(true);
    await vi.advanceTimersByTimeAsync(600);
    expect('data-done' in save.attrs).toBe(false);
  });

  it('shows nothing for a quick save and no tick for a failed one', async () => {
    const quick = button(['btn']);
    notePress(quick);
    await vi.advanceTimersByTimeAsync(0);
    trackChange(later(50, 1));
    await vi.advanceTimersByTimeAsync(60);
    expect(quick.attrs).toEqual({});

    const failing = button(['btn']);
    notePress(failing);
    trackChange(later(400, 1, true)).catch(() => undefined);
    await vi.advanceTimersByTimeAsync(800);
    expect(failing.attrs).toEqual({});
  });

  it('keeps the ring at least 300 ms once seen, and until every change of the press is back', async () => {
    const save = button(['btn']);
    notePress(save);
    trackChange(later(200, 1));
    trackChange(later(700, 2));
    await vi.advanceTimersByTimeAsync(300);
    expect(save.attrs['aria-busy']).toBe('true');
    await vi.advanceTimersByTimeAsync(450);
    expect(save.attrs['aria-busy']).toBeUndefined();
    expect('data-done' in save.attrs).toBe(true);
  });

  it('leaves menus, toggles, own-state buttons and late changes alone', async () => {
    for (const b of [button(['btn'], { 'aria-expanded': 'false' }), button(['btn'], { role: 'switch' }), button(['btn'], { 'data-busy-own': '' }), button(['linkbtn'])]) {
      notePress(b);
      trackChange(later(500, 1));
      expect(b.attrs['aria-busy']).toBeUndefined();
    }
    const save = button(['btn']);
    notePress(save);
    await vi.advanceTimersByTimeAsync(PRESS_MS + 1);
    trackChange(later(500, 1));
    expect(save.attrs['aria-busy']).toBeUndefined();
  });
});
