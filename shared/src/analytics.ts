// The analytics feed, as the app and the server both see it: analytics keys,
// the datasets a key can be limited to, and the BI tools with a connect guide.

import { DEPARTMENT_KEYS, type DepartmentKey } from './model';

/** A key can be limited to the company's departments (the departments model's six). */
export const ANALYTICS_DEPARTMENTS = DEPARTMENT_KEYS;
export type AnalyticsDepartment = DepartmentKey;

/** Where each guide lives in the docs (docs/site/<lang>/bi-tools.md, one heading per tool). */
export const BI_TOOLS = [
  { key: 'powerbi', anchor: 'power-bi' },
  { key: 'excel', anchor: 'excel' },
  { key: 'fabric', anchor: 'microsoft-fabric' },
  { key: 'tableau', anchor: 'tableau' },
  { key: 'lookerstudio', anchor: 'looker-studio' },
  { key: 'qlik', anchor: 'qlik' },
  { key: 'zoho', anchor: 'zoho-analytics' },
  { key: 'metabase', anchor: 'metabase-superset' },
] as const;

export interface AnalyticsKeyInfo {
  id: string;
  name: string;
  prefix: string;
  userId: string;
  /** Null: every dataset the owner may read. */
  datasets: string[] | null;
  /** Null: every department. */
  departments: AnalyticsDepartment[] | null;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  rotatedAt: string | null;
  /** The last 30 days. */
  pulls: number;
  rows: number;
  /** The tool that read last ('powerquery', 'tableau', …) and when. */
  lastTool: string | null;
  lastPullAt: string | null;
}

export interface AnalyticsDatasetInfo {
  name: string;
  about: string;
  departments: AnalyticsDepartment[] | 'boards';
  columns: { name: string; type: string }[];
}

export interface AnalyticsPullInfo {
  at: string;
  userId: string | null;
  keyId: string | null;
  dataset: string;
  face: 'odata' | 'json' | 'csv';
  rows: number;
  tool: string;
}
