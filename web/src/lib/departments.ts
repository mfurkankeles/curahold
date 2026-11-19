// The company's departments as the app uses them: names, who may open boards
// where, and which ones the company has. Everything comes with /me, so nothing
// here waits for the network (a board opens with no extra request).
import { useMemo } from 'react';
import type { MessageKey } from '../../../shared/src/i18n';
import type { Department, DepartmentKey } from '../../../shared/src/model';
import { useI18n } from './i18n';
import { useStore } from './store';

export const deptName = (t: (k: MessageKey) => string, key: DepartmentKey) => t(`dept.${key}` as MessageKey);

export function useDepartments() {
  const { me, can } = useStore();
  const { t } = useI18n();
  return useMemo(() => {
    const all: Department[] = me.departments ?? [];
    const on = all.filter((d) => d.enabled);
    const admin = can('boards.manage_all');
    /** Departments this person may open a board in. */
    const openable = on.filter((d) => admin || d.myRole === 'lead');
    return {
      all,
      on,
      mine: on.filter((d) => d.myRole),
      openable,
      canOpenBoards: openable.length > 0,
      byId: (id: string | null | undefined) => all.find((d) => d.id === id) ?? null,
      has: (key: DepartmentKey) => on.some((d) => d.key === key),
      name: (key: DepartmentKey) => deptName(t, key),
    };
  }, [me.departments, can, t]);
}
