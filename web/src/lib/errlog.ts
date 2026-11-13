// Browser errors, reported to the server so a fault a person hits is seen even
// when nothing reached the server. Best-effort and quiet: the same message is
// sent once, there is a ceiling per page so a loop cannot flood, resource-load
// errors are left out, and a failed report is swallowed (never retried, never
// itself reported). The server caps it again per person.
import { post } from './api';

let started = false;
const seen = new Set<string>();
let sent = 0;
const MAX = 20;

export function startErrorLog(): () => void {
  if (started || typeof window === 'undefined') return () => undefined;
  started = true;

  const report = (message: string, detail?: string) => {
    if (sent >= MAX || !message) return;
    const key = message.slice(0, 200);
    if (seen.has(key)) return;
    seen.add(key);
    sent += 1;
    void post('/client-error', { message: message.slice(0, 1000), detail: detail?.slice(0, 4000), path: location.pathname + location.search }).catch(() => undefined);
  };

  const onError = (e: ErrorEvent) => {
    // A failed image or script load also fires 'error'; its target is the
    // element, not the window. Only real script errors are worth recording.
    if (e.target && e.target !== window) return;
    report(e.message || 'Script error', e.error instanceof Error ? e.error.stack : undefined);
  };
  const onRejection = (e: PromiseRejectionEvent) => {
    const r = e.reason as { message?: unknown; stack?: unknown } | undefined;
    report(r?.message ? String(r.message) : String(e.reason), typeof r?.stack === 'string' ? r.stack : undefined);
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}
