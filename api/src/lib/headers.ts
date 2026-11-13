// Browser-side protections on every answer the app and its API give: a content
// security policy (scripts only from this site, plus Paddle's checkout), no
// framing by other sites, no content-type guessing, HTTPS only for a year.
//
// The static files (the app itself) get the same set from web/public/_headers,
// since Cloudflare serves them without running the Worker; tests/security.test.ts
// keeps the two in step. Rate limiting is NOT done here: it belongs at the edge
// (see db/OPS-SECURITY.md, "Cloudflare rate rules").
import type { MiddlewareHandler } from 'hono';

/** The one inline script in index.html (light/dark before first paint), by hash: nothing else inline may run. */
export const THEME_SCRIPT_SHA256 = 'sha256-nTcd6N2fIyXjWAjNWAFqKMcWXJifrdiW1RlxZ5aJ3wQ=';

export const APP_CSP = [
  "default-src 'self'",
  `script-src 'self' '${THEME_SCRIPT_SHA256}' https://cdn.paddle.com`,
  // The app sets some styles inline (positions, colours); styles cannot run code.
  "style-src 'self' 'unsafe-inline' https://cdn.paddle.com",
  "img-src 'self' data: blob: https://*.paddle.com",
  "font-src 'self'",
  "connect-src 'self' https://*.paddle.com",
  'frame-src https://buy.paddle.com https://sandbox-buy.paddle.com https://checkout.paddle.com https://sandbox-checkout.paddle.com',
  "worker-src 'self'",
  "manifest-src 'self'",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': APP_CSP,
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), display-capture=(), payment=(self "https://buy.paddle.com" "https://sandbox-buy.paddle.com")',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
};
export const HSTS = 'max-age=31536000; includeSubDomains';

/** Adds the headers to every answer that does not set its own (a route may tighten or relax one on purpose). */
export function securityHeaders(https: boolean): MiddlewareHandler {
  return async (c, next) => {
    await next();
    const apply = (h: Headers) => {
      for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!h.has(k)) h.set(k, v);
      if (https && !h.has('Strict-Transport-Security')) h.set('Strict-Transport-Security', HSTS);
    };
    try {
      apply(c.res.headers);
    } catch {
      // An answer passed through from another server has headers that cannot be changed: copy it first.
      const copy = new Response(c.res.body, c.res);
      apply(copy.headers);
      c.res = copy;
    }
  };
}
