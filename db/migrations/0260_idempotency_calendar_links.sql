-- Curahold — repeat answers holding a calendar feed link or a support entry link are
-- emptied (review S2 of the security fixes; 0256 did the same for keys and codes).
--
-- POST /api/me/calendar answers with the person's secret feed address, of which only
-- a hash is stored on the person; the support entry link carries its token after
-- #token=. Both were kept in idempotency_keys for a day. The server no longer keeps
-- them (lib/repeats.ts, and the routes say so); this clears what was kept before.
update idempotency_keys set response = null
 where response is not null
   and (response::text ~ '/api/calendar/[A-Za-z0-9_-]{16,}'
        or response::text ~ '#token=[A-Za-z0-9_-]{16,}');
