import type { MessageKey } from './en';

// Japanese (日本語). Filled market surface by market surface; every key not yet
// here falls back to English. First pass: the sales site's plan strings.
export const ja: Partial<Record<MessageKey, string>> = {
  'billing.plan.team': 'チーム',
  'billing.plan.business': 'ビジネス',
  'billing.point.boards': 'ボード、タスク、チェックリスト、自動化',
  'billing.point.customers': '顧客、連絡先、商談、独自のレコード',
  'billing.point.meetings': 'ミーティング、タイムライン、ヘルススコア、ビジネスレビュー',
  'billing.point.reports': 'レポート、ダッシュボード、目標',
  'billing.point.chat': 'Slack、Teams、Google Chat、メール通知',
  'billing.point.crm': 'CRM やスプレッドシートとの双方向同期（Salesforce、HubSpot など）',
  'billing.point.portal': '顧客企業の担当者向けカスタマーポータル',
  'billing.point.playbooks': 'プレイブックと、自動で始まる更新',
};
