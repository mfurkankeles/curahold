# Backup and disaster recovery policy

> **Draft — owner to adopt.** Version 2026-11-20.draft1. The procedures are in `docs/RUNBOOK.md` ("Backups and
> restore", "Rollback") and the go-live guide (steps 25–27). Lines marked OPEN are not done yet.

## What is backed up

| Data | How | Kept |
| --- | --- | --- |
| Database (all companies' records) | Supabase automatic daily backups | Per the Supabase plan [confirm in the project settings] |
| Database, off-site | `scripts/backup/backup.ts`: `pg_dump` encrypted with AES-256 (PBKDF2) and a manifest with row counts and a SHA-256; weekly to the `curahold-backups` R2 bucket and the owner's computer | 35 days (OPEN: the R2 lifecycle rule and the routine start at go-live) |
| Files (attachments, logos) | R2 `curahold-files` | OPEN: no versioning or second copy configured yet (RUNBOOK) |
| Code and configuration | Git (GitHub plus backup pushes) | Indefinitely |

The backup passphrase lives in the password manager, never beside the file.

## Targets

Recovery point objective [24] hours and recovery time objective [8] hours (SLA §4, proposals). Point-in-time recovery
is switched on with the first paying customer (owner decision, RUNBOOK); until then the worst case is losing the day
since the last daily backup.

## Restore

- Restores go into an **empty** database only; `scripts/backup/restore.ts` checks the checksum, restores, then verifies
  every table's row count against the manifest and the row-level security gates (a cross-company read must see nothing).
- Production is never restored over in place first: restore to a new project, verify, point a staging Worker at it, then
  cut over (RUNBOOK "Restore procedure").
- A single company's mistake is undone first from the in-product trash (30 days) or import undo.

## Drills

- `scripts/backup/restore-drill.ts`: back up, wipe, restore, verify, timed. Rehearsed on 19 Nov 2026 on local Postgres 16
  (1.29 million rows restored and verified in 161 seconds).
- Quarterly and after large schema changes (testing calendar), and once against a copy of production after go-live.
  Each drill's timings are recorded.

## Disaster

If the hosting region is lost: restore the latest off-site dump into a database in another region, create a new
Hyperdrive config, deploy the Workers against it, tell customers which window of data may be missing, and update the
documents that name the region (`docs/ENVIRONMENT.md` §1a).
