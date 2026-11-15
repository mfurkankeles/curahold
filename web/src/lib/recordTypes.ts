import { useCallback, useEffect, useState } from 'react';
import type { RecordType } from '../../../shared/src/records';
import { get } from './api';

/** The company's record types (opportunities, renewals…), fetched once per use. */
export function useRecordTypes() {
  const [types, setTypes] = useState<RecordType[] | null>(null);
  const load = useCallback(() => get<{ types: RecordType[] }>('/record-types').then((r) => setTypes(r.types)), []);
  useEffect(() => {
    void load();
  }, [load]);
  return { types, load };
}
