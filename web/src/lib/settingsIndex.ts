// Every settings topic in one list: its group, icon, who may open it, and the
// words it is found by. The settings area draws its navigation from it, and
// Ctrl K (components/Search.tsx) finds a setting by any of those words.
import type { MessageKey } from '../../../shared/src/i18n';
import type { Perm } from '../../../shared/src/model';
import type { IconName } from '../components/icons';

export type SettingsTab =
  | 'company' | 'billing' | 'currencies'
  | 'fields' | 'records' | 'health' | 'rhythm' | 'playbooks'
  | 'people' | 'joining' | 'departments' | 'teams' | 'roles'
  | 'connections' | 'sources' | 'automations' | 'developer' | 'analytics' | 'portal'
  | 'signin' | 'sso' | 'support' | 'audit' | 'errors';

export type SettingsGroup = 'company' | 'customers' | 'team' | 'connect' | 'security';

export interface SettingsTopic {
  key: SettingsTab;
  group: SettingsGroup;
  icon: IconName;
  /** Whether this person may open it. */
  allowed: (can: (p: Perm) => boolean, billingOn: boolean) => boolean;
}

const org = (can: (p: Perm) => boolean) => can('org.manage');
const accounts = (can: (p: Perm) => boolean) => can('accounts.manage');
const users = (can: (p: Perm) => boolean) => can('users.manage');
const links = (can: (p: Perm) => boolean) => can('connections.manage');

export const SETTINGS_TOPICS: SettingsTopic[] = [
  { key: 'company', group: 'company', icon: 'building', allowed: org },
  { key: 'billing', group: 'company', icon: 'card', allowed: (can, billingOn) => org(can) && billingOn },
  { key: 'currencies', group: 'company', icon: 'coins', allowed: org },
  { key: 'fields', group: 'customers', icon: 'form', allowed: accounts },
  { key: 'records', group: 'customers', icon: 'tag', allowed: accounts },
  { key: 'health', group: 'customers', icon: 'heart', allowed: accounts },
  { key: 'rhythm', group: 'customers', icon: 'target', allowed: (can) => accounts(can) || org(can) },
  { key: 'playbooks', group: 'customers', icon: 'book', allowed: (can) => org(can) || accounts(can) },
  { key: 'people', group: 'team', icon: 'user', allowed: users },
  { key: 'joining', group: 'team', icon: 'userPlus', allowed: users },
  { key: 'departments', group: 'team', icon: 'columns', allowed: (can) => org(can) || users(can) },
  { key: 'teams', group: 'team', icon: 'people', allowed: (can) => can('teams.manage') },
  { key: 'roles', group: 'team', icon: 'shield', allowed: (can) => org(can) || users(can) },
  { key: 'connections', group: 'connect', icon: 'plug', allowed: links },
  { key: 'sources', group: 'connect', icon: 'refresh', allowed: links },
  { key: 'automations', group: 'connect', icon: 'zap', allowed: (can) => can('automations.manage') },
  { key: 'developer', group: 'connect', icon: 'code', allowed: (can) => links(can) || users(can) },
  { key: 'analytics', group: 'connect', icon: 'chart', allowed: (can) => can('data.export') || users(can) || org(can) },
  { key: 'portal', group: 'connect', icon: 'globe', allowed: org },
  { key: 'signin', group: 'security', icon: 'lock', allowed: org },
  { key: 'sso', group: 'security', icon: 'shield', allowed: org },
  { key: 'support', group: 'security', icon: 'lifebuoy', allowed: org },
  { key: 'audit', group: 'security', icon: 'history', allowed: (can) => can('audit.view') },
  { key: 'errors', group: 'security', icon: 'alert', allowed: org },
];

export const SETTINGS_GROUPS: SettingsGroup[] = ['company', 'customers', 'team', 'connect', 'security'];

type T = (key: MessageKey, vars?: Record<string, string | number>) => string;
type Words = { one: string; other: string };

/** What the topic is called (the fields topic uses the company's own word for a customer). */
export const topicLabel = (t: T, words: Words, key: SettingsTab) => (key === 'fields' ? t('settings.tab.fields', { account: words.one }) : t(`settings.tab.${key}` as MessageKey));
/** One line under the name: what is in there. */
export const topicAbout = (t: T, key: SettingsTab) => t(`settings.about.${key}` as MessageKey);
/** Every word the topic is found by: its name, its line and the words people search for. */
export const topicWords = (t: T, words: Words, key: SettingsTab) => `${topicLabel(t, words, key)} ${topicAbout(t, key)} ${t(`settings.find.${key}` as MessageKey)}`;
export const groupLabel = (t: T, words: Words, g: SettingsGroup) => (g === 'customers' ? words.other : g === 'connect' ? t('settings.group.connect') : t(`settings.group.${g}` as MessageKey));

/** Case- and accent-blind text for matching ("Şirket" finds "sirket"). */
export const fold = (s: string) => s.toLocaleLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/ı/g, 'i');

/** Whether every word typed is found in the topic's words. */
export function topicMatches(t: T, words: Words, key: SettingsTab, query: string) {
  const hay = fold(topicWords(t, words, key));
  return fold(query).split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}
