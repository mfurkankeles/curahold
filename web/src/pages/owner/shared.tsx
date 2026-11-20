// What every owner-console section shares: the call to the owner's API (the
// desk host, with the header that proves the call came from the console's own
// page), the owner's words in the console's language, one section's data with
// retry, and the loading / error / content switch. Moved out of
// OwnerConsole.tsx as the first step of its split (docs/HANDOVER.md).
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { normalizeLocale } from '../../../../shared/src/i18n';
import { ownerWord, type OwnerKey } from '../../../../shared/src/i18n/owner';
import type { Pace } from '../../../../shared/src/ownerConsole';
import { LoadError, SkeletonCards, SkeletonRows } from '../../components/Empty';
import { useI18n } from '../../lib/i18n';

/** An owner API answer that was not 2xx: the status and the body, for the error words. */
export class OwnerError extends Error {
  constructor(readonly status: number, readonly body: unknown) {
    super(String(status));
  }
}
/**
 * Calls the owner API on the desk host. The x-curahold-desk header is what a form on another site cannot send, so
 * the server refuses any change without it (routes/desk.ts staffOnly).
 */
export async function api<T>(method: string, path: string, body?: unknown, keepalive = false): Promise<T> {
  const res = await fetch(`/api/desk${path}`, { method, keepalive, headers: { 'x-curahold-desk': '1', ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new OwnerError(res.status, json);
  return json as T;
}

/** The owner's words in the console's language (Turkish or English). */
export function useOwnerWords() {
  const { locale } = useI18n();
  const l = normalizeLocale(locale);
  const o = useCallback((k: OwnerKey, vars?: Record<string, string | number>) => ownerWord(l, k, vars), [l]);
  return { o, locale: l };
}

/** One section’s data from the owner API, fetched again on every heartbeat (`beat`) and on `reload()`. */
export function useData<T>(path: string, beat: number, failed: (e: unknown) => void) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    api<T>('GET', path)
      .then((d) => {
        if (!live) return;
        setData(d);
        setError(false);
      })
      .catch((e) => {
        failed(e);
        if (live) setError(true);
      });
    return () => {
      live = false;
    };
  }, [path, beat, attempt, failed]);
  return { data, error, reload: () => setAttempt((a) => a + 1), setData };
}

/** Skeleton while loading, a retry on failure, the content once the data is there. */
export function Loading<T>({ data, error, reload, children, cards }: { data: T | null; error: boolean; reload: () => void; children: (d: T) => ReactNode; cards?: boolean }) {
  const { t } = useI18n();
  if (data) return <>{children(data)}</>;
  if (error) return <LoadError onRetry={reload} />;
  return cards ? <SkeletonCards count={6} label={t('common.loading')} /> : <SkeletonRows rows={8} label={t('common.loading')} />;
}


/** A thin progress bar (decorative: the figure next to it says the same in words), coloured by pace. */
export function Bar({ value, tone }: { value: number; tone?: Pace }) {
  return (
    <span className="ocprogress" data-pace={tone} aria-hidden="true">
      <i style={{ '--w': `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` } as CSSProperties} />
    </span>
  );
}
