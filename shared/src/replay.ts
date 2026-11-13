// Session replay for Curahold's own support. The browser records the page
// with rrweb (every input masked), buffers the events, gzips each batch and
// sends it here; the support desk replays it to see what a person did before
// an error. Disclosed, switchable off by the company, kept for a week.
//
// Numbers both sides agree on.

/** How often the browser sends a batch of events (ms). */
export const REPLAY_FLUSH_MS = 5_000;
/** A fresh full snapshot this often, so a long recording can be seeked and trimmed (ms). */
export const REPLAY_SNAPSHOT_MS = 5 * 60_000;
/** The largest one batch may be, as base64url characters (~0.5 MB of gzipped events). */
export const REPLAY_MAX_CHUNK_CHARS = 700_000;
/** The most batches one recording may hold. */
export const REPLAY_MAX_CHUNKS = 4_000;
/** The most a single recording may store, in bytes of gzipped events. */
export const REPLAY_MAX_SESSION_BYTES = 40 * 1024 * 1024;
/** The most recordings one person may open in an hour (a reload starts a new one). */
export const REPLAY_MAX_SESSIONS_PER_HOUR = 40;
/** Recordings are kept this many days, then deleted (KVKK/GDPR: no longer than useful). */
export const REPLAY_RETENTION_DAYS = 7;

/** What the browser sends for each batch. */
export interface ReplayChunk {
  /** The recording's id (the browser makes it; a reload starts a new one). */
  session: string;
  /** 0, 1, 2 … in order; the batch at 0 opens the recording. */
  seq: number;
  /** The page when the recording started (seq 0 only). */
  page?: string;
  /** The browser, for the desk to show (seq 0 only). */
  agent?: string;
  /** An error happened on the page during this batch. */
  error?: boolean;
  /** How many rrweb events are inside. */
  count: number;
  /** The events, gzipped then base64url. */
  events: string;
}

/** One recording, as the support desk lists it. */
export interface ReplayMeta {
  id: string;
  startedAt: string;
  lastAt: string;
  events: number;
  bytes: number;
  hadError: boolean;
  pageFirst: string | null;
  pageLast: string | null;
}
