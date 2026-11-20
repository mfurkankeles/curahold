// The browser side of api/src/lib/humanCheck.ts for a public form: a honeypot
// field, the time the form has been open, and — only when the server gives a
// Turnstile site key — Cloudflare's free check. Without a key nothing loads from
// Cloudflare and the form looks exactly as before.
//
//   const human = useHumanCheck(config.turnstile, { label: t('trial.hp'), locale });
//   <form>… {human.field} …</form>
//   await post('/trial/code', { email, ...human.proof() }); human.reset();
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import './humanCheck.css';

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileApi {
  render(el: HTMLElement, o: Record<string, unknown>): string;
  reset(id?: string): void;
  remove(id: string): void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | null = null;
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile')));
    s.onerror = () => {
      loading = null;
      reject(new Error('turnstile'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export interface HumanProof {
  hp?: string;
  ms: number;
  ts?: string;
}

/**
 * The public forms' robot check: the hidden field, the time since the form showed, and the Turnstile widget when the
 * install has a site key (ADR 0015).
 */
export function useHumanCheck(
  siteKey: string | null | undefined,
  opts: { label: string; locale: string; honeypot?: boolean },
): { field: ReactNode; proof: () => HumanProof; reset: () => void } {
  // When the form first showed (set once, after the first render).
  const opened = useRef(0);
  useEffect(() => {
    opened.current = Date.now();
  }, []);
  const [hp, setHp] = useState('');
  const token = useRef<string | undefined>(undefined);
  const widget = useRef<string | null>(null);
  const { locale } = opts;

  // A callback ref: the widget is drawn whenever its box appears (a form that comes back after another step too).
  const box = useCallback(
    (el: HTMLDivElement | null) => {
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
      token.current = undefined;
      if (!el || !siteKey) return;
      loadTurnstile().then(
        (ts) => {
          if (!el.isConnected) return;
          widget.current = ts.render(el, {
            sitekey: siteKey,
            language: locale,
            // Light/dark follows the page; "flexible" keeps it inside a phone's width.
            theme: 'auto',
            size: 'flexible',
            callback: (t: string) => (token.current = t),
            'expired-callback': () => (token.current = undefined),
            'error-callback': () => (token.current = undefined),
          });
        },
        // Cloudflare unreachable: the server says so plainly if it needs the token.
        () => undefined,
      );
    },
    [siteKey, locale],
  );
  useEffect(
    () => () => {
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
    },
    [],
  );

  const proof = useCallback((): HumanProof => ({ ms: Date.now() - opened.current, ...(hp ? { hp } : {}), ...(token.current ? { ts: token.current } : {}) }), [hp]);
  // A Turnstile token is good once: after each send, a fresh one.
  const reset = useCallback(() => {
    token.current = undefined;
    if (widget.current && window.turnstile) window.turnstile.reset(widget.current);
  }, []);

  const field = (
    <>
      {opts.honeypot !== false && (
        <div className="human-hp" aria-hidden="true">
          <label>
            {opts.label}
            <input tabIndex={-1} autoComplete="off" name="website_url" value={hp} onChange={(e) => setHp(e.target.value)} />
          </label>
        </div>
      )}
      {siteKey ? <div className="human-ts" ref={box} /> : null}
    </>
  );
  return { field, proof, reset };
}
