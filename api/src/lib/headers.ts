// Browser-side protections on every answer the app and its API give: a content
// security policy (scripts only from this site, plus Paddle's checkout), no
// framing by other sites, no content-type guessing, HTTPS only for a year.
//
// The static files (the app itself) get the same set from web/public/_headers,
// since Cloudflare serves them without running the Worker; tests/security.test.ts
// keeps the two in step. Request limits are lib/ratelimit.ts.
import type { MiddlewareHandler } from 'hono';

/** The one inline script in index.html (light/dark, and the first downloads, before first paint), by hash: nothing else inline may run. */
export const THEME_SCRIPT_SHA256 = 'sha256-YLjtk3PNTjWKY8qqVl7G2Ij+vSawErAhPVoZ+zpfqgA=';

export const APP_CSP = [
  "default-src 'self'",
  // Cloudflare Turnstile (lib/humanCheck.ts) on the public forms, only when its keys are set.
  `script-src 'self' '${THEME_SCRIPT_SHA256}' https://cdn.paddle.com https://challenges.cloudflare.com`,
  // The app sets some styles inline (positions, colours); styles cannot run code.
  "style-src 'self' 'unsafe-inline' https://cdn.paddle.com",
  "img-src 'self' data: blob: https://*.paddle.com",
  "font-src 'self'",
  "connect-src 'self' https://*.paddle.com",
  'frame-src https://buy.paddle.com https://sandbox-buy.paddle.com https://checkout.paddle.com https://sandbox-checkout.paddle.com https://challenges.cloudflare.com',
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
  // The product is closed to robots and reserves text-and-data-mining rights (shared/src/compliance/crawlers.ts).
  'X-Robots-Tag': 'noindex, nofollow',
  'tdm-reservation': '1',
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
