import type { MessageKey } from './en';

// Hebrew (עברית). Filled market surface by market surface; every key not yet
// here falls back to English. First pass: the sales site's plan strings.
export const he: Partial<Record<MessageKey, string>> = {
  'billing.plan.team': 'צוות',
  'billing.plan.business': 'עסקי',
  'billing.point.boards': 'לוחות, משימות, רשימות תיוג ואוטומציות',
  'billing.point.customers': 'לקוחות, אנשי קשר, הזדמנויות והרשומות שלך',
  'billing.point.meetings': 'פגישות, ציר זמן, ציון בריאות וסקירות עסקיות',
  'billing.point.reports': 'דוחות, לוחות מחוונים ויעדים',
  'billing.point.chat': 'התראות Slack, Teams, Google Chat ודוא״ל',
  'billing.point.crm': 'סנכרון דו-כיווני עם ה-CRM או הגיליון שלך (Salesforce, HubSpot ועוד)',
  'billing.point.portal': 'פורטל לקוחות עבור האנשים של הלקוחות שלך',
  'billing.point.playbooks': 'פלייבוקים, וחידושים שמתחילים מעצמם',
};
