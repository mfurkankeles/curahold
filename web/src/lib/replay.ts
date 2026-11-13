// Recording the page for support (rrweb), so when someone hits an error the
// support desk can see what they did. Disclosed and switchable off by the
// company (me.org.recordSessions); never runs in the demo, and never for a
// preview or a support visit (the server leaves recordSessions off for those).
//
// Every input is masked — nothing typed is recorded — and elements marked
// `rr-block` are left out. Events are buffered, gzipped and sent in batches;
// a reload starts a new recording. Best-effort: if the app can't reach the
// server the batch waits and is tried again, and nothing here ever throws
// into the app.
import { gzipSync, strToU8 } from 'fflate';
import type { eventWithTime, recordOptions } from 'rrweb';
import { REPLAY_FLUSH_MS, REPLAY_MAX_CHUNK_CHARS, REPLAY_SNAPSHOT_MS } from '../../../shared/src/replay';
import type { Me } from '../../../shared/src/model';
import { getDeviceId } from './device';

let started = false;
let stopRrweb: (() => void) | undefined;
let timer: ReturnType<typeof setInterval> | undefined;

/** base64url of bytes, in slices so a big batch does not overflow the call stack. */
function toBase64url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function startRecording(me: Me) {
  if (started || typeof window === 'undefined' || import.meta.env.APP_DEMO) return;
  if (!me.org.recordSessions || me.previewBy || me.supportBy) return;
  started = true;

  const session = crypto.randomUUID();
  let buffer: eventWithTime[] = [];
  let seq = 0;
  let hadError = false;
  let sending = false;
  let stopped = false;

  const onError = () => (hadError = true);
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onError);

  const stop = () => {
    if (stopped) return;
    stopped = true;
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onError);
    if (timer) clearInterval(timer);
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', onHide);
    stopRrweb?.();
  };

  async function flush(final = false) {
    if (stopped || sending || !buffer.length) return;
    const batch = buffer;
    buffer = [];
    const err = hadError;
    hadError = false;
    let events: string;
    try {
      events = toBase64url(gzipSync(strToU8(JSON.stringify(batch))));
    } catch {
      return;
    }
    // One batch grew past the cap (a very busy page): drop it rather than have it refused forever.
    if (events.length > REPLAY_MAX_CHUNK_CHARS) {
      seq += 1;
      return;
    }
    const payload = JSON.stringify({
      session,
      seq,
      count: batch.length,
      events,
      ...(seq === 0 ? { page: location.pathname + location.search, agent: navigator.userAgent } : {}),
      ...(err ? { error: true } : {}),
    });
    sending = true;
    try {
      const res = await fetch('/api/replay', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-curahold-device': getDeviceId() },
        body: payload,
        credentials: 'same-origin',
        keepalive: final,
      });
      // The company turned recording off, or this recording is full: stop quietly.
      if (res.headers.get('x-curahold-record') === 'off') {
        stop();
        return;
      }
      seq += 1;
    } catch {
      // Could not reach the server: keep the batch (and its error flag) for the next try.
      buffer = batch.concat(buffer);
      hadError = hadError || err;
    } finally {
      sending = false;
    }
  }

  const onHide = () => {
    if (document.visibilityState === 'hidden') void flush(true);
  };

  void (async () => {
    let record: (o: recordOptions<eventWithTime>) => (() => void) | undefined;
    try {
      ({ record } = await import('rrweb'));
    } catch {
      stop();
      return;
    }
    if (stopped) return;
    stopRrweb = record({
      emit: (e) => {
        buffer.push(e);
        // A snapshot or a very full buffer: send it now rather than wait for the timer.
        if (buffer.length >= 400) void flush();
      },
      maskAllInputs: true,
      maskTextSelector: '*',
      maskTextClass: 'rr-mask',
      blockClass: 'rr-block',
      ignoreClass: 'rr-ignore',
      inlineStylesheet: true,
      collectFonts: false,
      recordCanvas: false,
      checkoutEveryNms: REPLAY_SNAPSHOT_MS,
      sampling: { mousemove: 50, scroll: 150, media: 800, input: 'last' },
    });
    timer = setInterval(() => void flush(), REPLAY_FLUSH_MS);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
  })();
}
