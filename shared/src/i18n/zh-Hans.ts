import type { MessageKey } from './en';

// Simplified Chinese (简体中文). Filled market surface by market surface; every
// key not yet here falls back to English. First pass: the sales site's plans.
export const zhHans: Partial<Record<MessageKey, string>> = {
  'billing.plan.team': '团队版',
  'billing.plan.business': '商业版',
  'billing.point.boards': '看板、任务、清单和自动化',
  'billing.point.customers': '客户、联系人、商机和你的自定义记录',
  'billing.point.meetings': '会议、时间线、健康评分和业务回顾',
  'billing.point.reports': '报表、仪表板和目标',
  'billing.point.chat': 'Slack、Teams、Google Chat 和邮件通知',
  'billing.point.crm': '与你的 CRM 或电子表格双向同步（Salesforce、HubSpot 等）',
  'billing.point.portal': '面向客户团队的客户门户',
  'billing.point.playbooks': '行动手册，以及自动开始的续约',
};
