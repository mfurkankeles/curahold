import type { MessageKey } from './en';

// Arabic (العربية). Filled market surface by market surface; every key not yet
// here falls back to English. First pass: the sales site's plan strings.
export const ar: Partial<Record<MessageKey, string>> = {
  'billing.plan.team': 'الفريق',
  'billing.plan.business': 'الأعمال',
  'billing.point.boards': 'اللوحات والمهام وقوائم التحقق والأتمتة',
  'billing.point.customers': 'العملاء وجهات الاتصال والفرص وسجلاتك الخاصة',
  'billing.point.meetings': 'الاجتماعات والمخطط الزمني ومؤشر الصحة ومراجعات الأعمال',
  'billing.point.reports': 'التقارير ولوحات المعلومات والأهداف',
  'billing.point.chat': 'إشعارات Slack وTeams وGoogle Chat والبريد الإلكتروني',
  'billing.point.crm': 'مزامنة ثنائية الاتجاه مع نظام إدارة العملاء أو جدول البيانات (Salesforce وHubSpot وغيرها)',
  'billing.point.portal': 'بوابة عملاء لموظفي عملائك',
  'billing.point.playbooks': 'كتيبات العمل، وتجديدات تبدأ من تلقاء نفسها',
};
