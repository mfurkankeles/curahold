import type { MessageKey } from './en';

// Persian (فارسی). Filled market surface by market surface; every key not yet
// here falls back to English. First pass: the sales site's plan strings.
export const fa: Partial<Record<MessageKey, string>> = {
  'billing.plan.team': 'تیم',
  'billing.plan.business': 'کسب‌وکار',
  'billing.point.boards': 'بردها، وظایف، چک‌لیست‌ها و خودکارسازی‌ها',
  'billing.point.customers': 'مشتریان، مخاطبین، فرصت‌ها و سوابق شما',
  'billing.point.meetings': 'جلسات، خط زمانی، امتیاز سلامت و بازبینی‌های کسب‌وکار',
  'billing.point.reports': 'گزارش‌ها، داشبوردها و اهداف',
  'billing.point.chat': 'اعلان‌های Slack، Teams، Google Chat و ایمیل',
  'billing.point.crm': 'همگام‌سازی دوطرفه با CRM یا صفحه‌گسترده شما (Salesforce، HubSpot و بیشتر)',
  'billing.point.portal': 'یک پورتال مشتری برای کارکنان مشتریان شما',
  'billing.point.playbooks': 'پلی‌بوک‌ها، و تمدیدهایی که خودبه‌خود آغاز می‌شوند',
};
