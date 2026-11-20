// The owner's phone alerts in the service worker (web/public/sw.js): each alert carries its own key as the
// notification tag, so a second, different alert that opens the same console screen does not silently replace the
// first (review 20 Nov); an older message without a key still groups by its address. Runs the real file in a VM.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

function worker() {
  const on: Record<string, (e: unknown) => void> = {};
  const shown: { title: string; tag: string; url: string }[] = [];
  const self = {
    addEventListener: (type: string, f: (e: unknown) => void) => (on[type] = f),
    registration: { showNotification: async (title: string, o: { tag: string; data: { url: string } }) => void shown.push({ title, tag: o.tag, url: o.data.url }) },
    location: { origin: 'https://desk.example' },
    clients: { matchAll: async () => [] },
  };
  runInNewContext(readFileSync(join(import.meta.dirname, '..', 'web', 'public', 'sw.js'), 'utf8'), { self, URL, console, caches: {}, fetch, Response, Request });
  const push = (m: unknown) => on.push!({ data: { json: () => m }, waitUntil: () => undefined });
  return { push, shown };
}

describe('owner alerts on the phone', () => {
  it('two different alerts on the same screen keep two notifications; a repeat of one replaces it', () => {
    const w = worker();
    w.push({ title: 'Alert A', body: 'a', url: '/system', tag: 'push:ops:a' });
    w.push({ title: 'Alert B', body: 'b', url: '/system', tag: 'push:ops:b' });
    w.push({ title: 'Old style', body: 'c', url: '/system' });
    expect(w.shown.map((s) => s.tag)).toEqual(['push:ops:a', 'push:ops:b', '/system']);
    expect(w.shown.every((s) => s.url === '/system')).toBe(true);
  });
});
