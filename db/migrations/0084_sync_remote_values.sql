-- What the other tool's side of a synced task held when it was last read, field by field
-- (in Curahold's own field keys). With it, a field changed only here is not mistaken for a
-- conflict when the other side sends its old value along with a change to some other field:
-- only a field changed on both sides since the last sync is weighed by the connection's
-- conflict rule (and the losing value is kept in the task's history, api/src/sync/conflicts.ts).
-- A field just sent from here is marked {"$sent": true} until the next read. Null: not known
-- yet (a link from before this column), which keeps the old behaviour for that link once.
alter table sync_links add column remote_values jsonb;
