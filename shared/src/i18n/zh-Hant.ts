import type { MessageKey } from './en';

// Traditional Chinese (繁體中文). Filled market surface by market surface; every
// key not yet here falls back to English. First pass: the sales site's plans.
export const zhHant: Partial<Record<MessageKey, string>> = {
  'billing.plan.team': '團隊版',
  'billing.plan.business': '商業版',
  'billing.point.boards': '看板、任務、清單與自動化',
  'billing.point.customers': '客戶、聯絡人、商機與你的自訂記錄',
  'billing.point.meetings': '會議、時間軸、健康評分與業務檢視',
  'billing.point.reports': '報表、儀表板與目標',
  'billing.point.chat': 'Slack、Teams、Google Chat 與電子郵件通知',
  'billing.point.crm': '與你的 CRM 或試算表雙向同步（Salesforce、HubSpot 等）',
  'billing.point.portal': '為客戶團隊提供的客戶入口網站',
  'billing.point.playbooks': '行動手冊，以及自動開始的續約',
};
