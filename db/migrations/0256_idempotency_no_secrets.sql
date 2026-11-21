-- Curahold — the answers kept for repeated requests no longer hold secrets (security audit M1).
--
-- A change sent with an Idempotency-Key keeps its first answer so a retry gets it
-- again (0023). Some answers carry something designed to be shown once and stored
-- only as a hash: a new API key, a webhook's signing secret, an authenticator secret,
-- recovery codes, a secret link. From now on the server keeps only the status of
-- those (api/src/lib/repeats.ts holdsSecret) and keys go after a day instead of two.
-- This clears what was kept before: rows older than a day go, and any kept answer
-- that looks like it holds a secret is emptied (a repeat then answers that the work
-- was done). The patterns are the server's own (holdsSecret).
delete from idempotency_keys where created_at < now() - interval '1 day';
update idempotency_keys set response = null
 where response is not null
   and (response::text ~ '\mch[kabr]_[A-Za-z0-9_-]{8,}'
        or response::text ~ 'otpauth://'
        or response::text ~ '/api/inbound/[a-z-]+/[A-Za-z0-9_-]{16,}'
        or response::text ~ '/r/onboarding/[A-Za-z0-9_-]{16,}'
        or response::text ~* '"(token|secret|signingSecret|recoveryCodes|codes|devToken|devCode|password|clientSecret|accessToken|refreshToken|access_token|refresh_token)": *[^n f"]'
        or response::text ~* '"(token|secret|signingSecret|recoveryCodes|codes|devToken|devCode|password|clientSecret|accessToken|refreshToken|access_token|refresh_token)": *"[^"]');
