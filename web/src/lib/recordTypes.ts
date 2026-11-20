// The company's record types, shared by every screen: one cached copy per company, refreshed in the background when
// older than 30 seconds, so the customer page's several mounts make one request. useRecordTypes() is the entry.
import { useCallback, useEffect, useState } from 'react';
import type { RecordType } from '../../../shared/src/records';
import { get } from './api';
import { useStore } from './store';

// One copy for every screen and component: the customer page mounts this hook several times (tabs, the
// record panel, the fields), and each used to ask the server again. Mounts that come together share one
// request; a copy older than FRESH is shown at once and asked for again in the background.
// The copy belongs to one company: another sign-in in the same tab starts again.
const FRESH = 30_000;
let cached: { org: string; types: RecordType[]; at: number } | null = null;
let asking: { org: string; seq: number; p: Promise<RecordType[]> } | null = null;
let seq = 0;
const listeners = new Set<(types: RecordType[]) => void>();

function fetchTypes(org: string): Promise<RecordType[]> {
  if (asking?.org === org) return asking.p;
  const mine = ++seq;
  const p = get<{ types: RecordType[] }>('/record-types')
    .then((r) => {
      // Only the latest question writes the answer, so an older reply cannot undo a newer one.
      if (mine === seq) {
        cached = { org, types: r.types, at: Date.now() };
        for (const l of listeners) l(r.types);
      }
      return r.types;
    })
    .finally(() => {
      if (asking?.seq === mine) asking = null;
    });
  asking = { org, seq: mine, p };
  return p;
}

/** The company's record types (opportunities, renewals…); `load()` asks the server again for everyone. */
export function useRecordTypes() {
  const org = useStore().me.org.id;
  const [types, setTypes] = useState<RecordType[] | null>(() => (cached?.org === org ? cached.types : null));
  useEffect(() => {
    listeners.add(setTypes);
    if (cached?.org !== org || Date.now() - cached.at > FRESH) void fetchTypes(org).catch(() => undefined);
    else setTypes(cached.types);
    return () => {
      listeners.delete(setTypes);
    };
  }, [org]);
  const load = useCallback(() => {
    // A change was just made (Settings → Records): what is held is no longer true, ask again and wait.
    asking = null;
    return fetchTypes(org).then(() => undefined);
  }, [org]);
  return { types, load };
}
