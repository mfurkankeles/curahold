// Recording errors (migration 0032). An unhandled server error (app.onError)
// and a browser error (POST /client-error) both land in error_log through the
// owner connection. Best-effort: recording must never break the request it is
// recording. No request bodies, headers or secrets are kept — only the
// message, where it happened and a stack, each capped to the column's length.
import type { Deps } from '../context';

export interface ErrorEntry {
  source: 'server' | 'browser';
  orgId?: string | null;
  userId?: string | null;
  method?: string | null;
  path?: string | null;
  message: string;
  detail?: string | null;
  agent?: string | null;
  requestId?: string | null;
}

const cut = (s: string | null | undefined, n: number) => (s == null ? null : redact(String(s)).slice(0, n));

/**
 * What an error record may not keep, masked wherever it appears (message, stack, address, browser):
 * secrets in an address (calendar and inbound links carry one), keys and tokens by their shape,
 * secrets after a name (token=, password:, authorization), and people's email addresses.
 * Ids (UUIDs) stay: they say where without saying who.
 */
export function redact(text: string): string {
  return (
    text
      // Bearer and basic credentials, JWTs, Curahold's own key and secret prefixes.
      .replace(/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 [redacted]')
      .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '[redacted]')
      .replace(/\b(ch[kabro]|whsec|scim|sk|pk|xox[abpr])_[A-Za-z0-9_-]{8,}/g, '$1_[redacted]')
      // name=value / "name": "value" for names that hold secrets.
      .replace(/(\b(?:token|secret|password|passwd|pwd|api[_-]?key|code|signature|authorization|cookie|session)[\w-]*["']?\s*[:=]\s*["']?)[^\s"'&,;}]+/gi, '$1[redacted]')
      // A long random path segment (a secret link), but not a UUID.
      .replace(/\/(?![0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:[/?#]|$))[A-Za-z0-9_-]{24,}(?=[/?#.]|$)/gi, '/[redacted]')
      // Email addresses: the domain stays, the person does not.
      .replace(/[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '[email]@$1')
  );
}

/** Records one error. Never throws into the caller. */
export async function recordError(deps: Deps, e: ErrorEntry): Promise<void> {
  try {
    await deps.db.system((q) =>
      q.query(
        `insert into error_log (org_id, user_id, source, method, path, message, detail, agent, request_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [e.orgId ?? null, e.userId ?? null, e.source, cut(e.method, 10), cut(e.path, 500), cut(e.message, 1000) || '(no message)', cut(e.detail, 4000), cut(e.agent, 300), cut(e.requestId, 80)],
      ),
    );
  } catch {
    /* logging an error must never become another error */
  }
}

/** The browser channel is capped per person, so one broken page cannot fill the table. */
export async function browserErrorAllowed(deps: Deps, orgId: string, userId: string, max = 30): Promise<boolean> {
  try {
    const [r] = await deps.db.system((q) =>
      q.query<{ n: number }>(`select count(*)::int as n from error_log where source = 'browser' and org_id = $1 and user_id = $2 and at > now() - interval '1 hour'`, [orgId, userId]),
    );
    return (r?.n ?? 0) < max;
  } catch {
    return false;
  }
}
