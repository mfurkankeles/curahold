// The product's core words, one per concept per language, and which words stay
// in English. Every translator (person or agent) writes with this table, and
// tests/i18n-quality.test.ts enforces it over the dictionaries, the help
// centre (docs/site/<lang>) and the sales site copy.
//
// Each choice follows how leading B2B SaaS write that market (CRM, helpdesk and
// project tools and their help centres), not a literal dictionary: see SOURCES.
// Three treatments:
//   translate — the local word ("görev", "タスク" is a loan word but it is what
//               the market writes, so it counts as the local word);
//   english   — kept in English, as the market does (job titles everywhere,
//               "Sprint" and "Backlog" in Turkish, product and brand names);
//   both      — the local word, with the English term in brackets the first
//               time a page or screen uses it ("satış hunisi (pipeline)").
//
// Adding a language: add it to Locale in core.ts and its dictionary, then give
// it a column here. Columns for a language the product does not ship yet are
// notes only (PLANNED): nothing checks them until the language is in LOCALES.
// Hindi and Malay shipped on 20 Nov 2026 (W3e).
import type { Locale } from './core';

/** Languages with glossary columns: the shipped ones and the ones being added next. */
export type GlossaryLocale = Locale | PlannedLocale;
/** Benchmarked choices for languages not shipped yet (no UI text, nothing enforced). */
export const PLANNED = [] as const;
export type PlannedLocale = never;

export type Treatment = 'translate' | 'english' | 'both';

export interface Term {
  /** The word to write (its base form; inflected forms of it are fine). */
  use: string;
  how: Treatment;
  /**
   * Other words for the same concept that must not appear (enforced). A plain
   * string is matched as written; "/…/" is a regular expression.
   */
  avoid?: string[];
}

export interface Concept {
  id: string;
  /** The English term, and a pattern for English text that names the concept. */
  en: string;
  match: RegExp;
  /**
   * Where `avoid` is enforced: 'everywhere' in the language's text, or only in
   * 'concept' strings — dictionary entries whose English names the concept
   * (for words that also mean something else, like Hebrew העברה "transfer").
   */
  scope: 'everywhere' | 'concept';
  note?: string;
  terms: Partial<Record<GlossaryLocale, Term>>;
}

const t = (use: string, how: Treatment = 'translate', avoid?: string[]): Term => (avoid ? { use, how, avoid } : { use, how });

export const GLOSSARY: Concept[] = [
  {
    id: 'task', en: 'task', match: /\btasks?\b/i, scope: 'everywhere',
    terms: { tr: t('görev'), ar: t('مهمة'), he: t('משימה'), fa: t('وظیفه'), ja: t('タスク'), ko: t('작업'), 'zh-Hans': t('任务'), 'zh-Hant': t('任務'), hi: t('टास्क'), ms: t('tugasan', 'translate', ['/\\btugas\\b/']) },
  },
  {
    id: 'board', en: 'board', match: /\bboards?\b/i, scope: 'concept',
    note: 'Persian writes the loan word برد in the product; تابلو was a second word for it.',
    terms: { tr: t('pano', 'translate', ['tahta']), ar: t('لوحة'), he: t('לוח'), fa: t('برد', 'translate', ['تابلو']), ja: t('ボード', 'translate', ['掲示板']), ko: t('보드'), 'zh-Hans': t('看板', 'translate', ['白板']), 'zh-Hant': t('看板', 'translate', ['白板']), hi: t('बोर्ड'), ms: t('papan') },
  },
  {
    id: 'customer', en: 'customer (the company can rename it: accountWords)', match: /\bcustomers?\b/i, scope: 'concept',
    terms: { tr: t('müşteri'), ar: t('عميل', 'translate', ['زبون', 'زبائن']), he: t('לקוח'), fa: t('مشتری'), ja: t('顧客'), ko: t('고객'), 'zh-Hans': t('客户', 'translate', ['顾客']), 'zh-Hant': t('客戶', 'translate', ['顧客']), hi: t('ग्राहक'), ms: t('pelanggan') },
  },
  {
    id: 'renewal', en: 'renewal', match: /\brenewals?\b/i, scope: 'concept',
    terms: { tr: t('yenileme'), ar: t('تجديد'), he: t('חידוש'), fa: t('تمدید'), ja: t('更新'), ko: t('갱신'), 'zh-Hans': t('续约', 'translate', ['续订']), 'zh-Hant': t('續約', 'translate', ['續訂']), hi: t('रिन्यूअल', 'english', ['नवीनीकरण']), ms: t('pembaharuan') },
  },
  {
    id: 'health-score', en: 'health score', match: /\bhealth score\b/i, scope: 'everywhere',
    note: 'The Settings tab name is the term; Korean and Japanese CS tools write the loan word.',
    terms: {
      tr: t('sağlık skoru', 'translate', ['/[Ss]ağlık puan/']), ar: t('مؤشر الصحة', 'translate', ['درجة الصحة']), he: t('ציון בריאות'), fa: t('امتیاز سلامت'),
      ja: t('ヘルススコア', 'translate', ['健全性スコア']), ko: t('헬스 스코어', 'translate', ['건강 점수']), 'zh-Hans': t('健康评分', 'translate', ['/健康分(?!数)/']), 'zh-Hant': t('健康評分', 'translate', ['/健康分(?!數)/']),
      hi: t('हेल्थ स्कोर', 'english'), ms: t('skor kesihatan'),
    },
  },
  {
    id: 'deal', en: 'deal', match: /\bdeals?\b/i, scope: 'concept',
    note: 'One word for a deal in a pipeline, Curahold\'s own or a CRM\'s. ko: HubSpot and Salesforce Korean write 거래; zh-Hant: HubSpot Traditional Chinese writes 交易.',
    terms: {
      tr: t('fırsat', 'translate', ['/[Aa]nlaşma(lar)/']), ar: t('صفقة'), he: t('עסקה', 'translate', ['דיל']), fa: t('معامله'), ja: t('商談'), ko: t('거래', 'translate', ['딜']),
      'zh-Hans': t('商机'), 'zh-Hant': t('交易', 'translate', ['商機']), hi: t('डील', 'english'), ms: t('urus niaga'),
    },
  },
  {
    id: 'pipeline', en: 'pipeline', match: /\bpipelines?\b/i, scope: 'concept',
    note: 'tr: "satış hunisi" is what Turkish sales teams say; "pipeline" in brackets on a page\'s first use.',
    terms: { tr: t('satış hunisi', 'both', ['/[Ss]atış hatt/']), ar: t('مسار المبيعات'), he: t('צינור מכירות'), fa: t('قیف فروش'), ja: t('パイプライン'), ko: t('파이프라인'), 'zh-Hans': t('销售管道'), 'zh-Hant': t('銷售漏斗'), hi: t('पाइपलाइन', 'english'), ms: t('saluran jualan', 'translate', ['talian paip']) },
  },
  {
    id: 'sprint', en: 'sprint', match: /\bsprints?\b/i, scope: 'everywhere',
    note: 'zh-Hans: Chinese project tools write 迭代; Jira Simplified Chinese writes 冲刺 — the product chose 迭代. zh-Hant follows Jira Traditional Chinese 衝刺.',
    terms: { tr: t('sprint', 'english'), ar: t('سبرنت'), he: t('ספרינט'), fa: t('اسپرینت'), ja: t('スプリント'), ko: t('스프린트'), 'zh-Hans': t('迭代', 'translate', ['冲刺']), 'zh-Hant': t('衝刺', 'translate', ['迭代']), hi: t('स्प्रिंट', 'english'), ms: t('sprint', 'english') },
  },
  {
    id: 'backlog', en: 'backlog', match: /\bbacklog\b/i, scope: 'concept',
    terms: { tr: t('Backlog', 'english'), ar: t('قائمة الأعمال المتراكمة'), he: t('בקלוג'), fa: t('بک‌لاگ'), ja: t('バックログ'), ko: t('백로그'), 'zh-Hans': t('待办事项'), 'zh-Hant': t('待辦事項'), hi: t('बैकलॉग', 'english'), ms: t('backlog', 'english') },
  },
  {
    id: 'onboarding', en: 'onboarding', match: /\bonboarding\b/i, scope: 'concept',
    note: 'tr keeps "onboarding" (the department and the plan) as Turkish B2B teams do; "müşteri kurulumu (onboarding)" where a stranger reads it first (trial form). ja: Japanese CS teams write オンボーディング (導入 alone reads as "adopting a tool"). zh-Hant: Taiwan writes 導入 (上線 is "go live").',
    terms: { tr: t('onboarding', 'english'), ar: t('التأهيل'), he: t('קליטה'), fa: t('راه‌اندازی', 'translate', ['آنبوردینگ']), ja: t('オンボーディング'), ko: t('온보딩'), 'zh-Hans': t('上线'), 'zh-Hant': t('導入', 'translate', ['上線']), hi: t('ऑनबोर्डिंग', 'english'), ms: t('onboarding', 'english') },
  },
  {
    id: 'dashboard', en: 'dashboard', match: /\bdashboards?\b/i, scope: 'concept',
    note: 'tr: "pano" is the board; a dashboard is a "panel" (never "pano"). he: לוח מחוונים, not the loan word.',
    terms: { tr: t('panel', 'translate', ['/\\b[Pp]ano/']), ar: t('لوحة المعلومات'), he: t('לוח מחוונים', 'translate', ['דשבורד']), fa: t('داشبورد'), ja: t('ダッシュボード'), ko: t('대시보드'), 'zh-Hans': t('仪表板', 'translate', ['仪表盘']), 'zh-Hant': t('儀表板', 'translate', ['儀表盤']), hi: t('डैशबोर्ड', 'english'), ms: t('papan pemuka') },
  },
  {
    id: 'report', en: 'report', match: /\breports?\b/i, scope: 'everywhere',
    note: 'ko: Salesforce and HubSpot Korean write 보고서.',
    terms: { tr: t('rapor'), ar: t('تقرير'), he: t('דוח'), fa: t('گزارش'), ja: t('レポート'), ko: t('보고서', 'translate', ['리포트']), 'zh-Hans': t('报表'), 'zh-Hant': t('報表'), hi: t('रिपोर्ट'), ms: t('laporan') },
  },
  {
    id: 'handover', en: 'hand-over', match: /\bhand-?overs?\b/i, scope: 'concept',
    terms: { tr: t('devir'), ar: t('تسليم'), he: t('מסירה', 'translate', ['העברה', 'העברת']), fa: t('تحویل'), ja: t('引き継ぎ', 'translate', ['引継ぎ']), ko: t('인계', 'translate', ['이관']), 'zh-Hans': t('交接', 'translate', ['移交']), 'zh-Hant': t('交接', 'translate', ['移交']), hi: t('हैंडओवर', 'english'), ms: t('serahan') },
  },
  {
    id: 'ticket', en: 'ticket (support)', match: /\btickets?\b/i, scope: 'concept',
    note: 'zh-Hant: Zendesk Taiwan writes 工單.',
    terms: { tr: t('talep'), ar: t('تذكرة'), he: t('פנייה'), fa: t('تیکت'), ja: t('チケット'), ko: t('티켓'), 'zh-Hans': t('工单'), 'zh-Hant': t('工單', 'translate', ['票證']), hi: t('टिकट'), ms: t('tiket') },
  },
  {
    id: 'department', en: 'department', match: /\bdepartments?\b/i, scope: 'concept',
    terms: { tr: t('departman'), ar: t('قسم'), he: t('מחלקה'), fa: t('دپارتمان'), ja: t('部門', 'translate', ['部署']), ko: t('부서'), 'zh-Hans': t('部门'), 'zh-Hant': t('部門'), hi: t('विभाग'), ms: t('jabatan') },
  },
  {
    id: 'automation', en: 'automation', match: /\bautomations?\b/i, scope: 'everywhere',
    terms: { tr: t('otomasyon'), ar: t('أتمتة'), he: t('אוטומציה'), fa: t('خودکارسازی', 'translate', ['اتوماسیون']), ja: t('自動化'), ko: t('자동화'), 'zh-Hans': t('自动化'), 'zh-Hant': t('自動化'), hi: t('ऑटोमेशन', 'english'), ms: t('automasi') },
  },
  {
    id: 'setup-health', en: 'Setup health', match: /\bsetup health\b/i, scope: 'everywhere',
    terms: { tr: t('kurulum sağlığı'), ar: t('سلامة الإعداد'), he: t('תקינות ההגדרה'), fa: t('سلامت راه‌اندازی'), ja: t('セットアップの状態'), ko: t('설정 상태'), 'zh-Hans': t('设置健康度', 'translate', ['/设置健康(?!度)/']), 'zh-Hant': t('設定健康度', 'translate', ['/設定健康(?!度)/']), hi: t('सेटअप हेल्थ', 'english'), ms: t('kesihatan persediaan') },
  },
  {
    id: 'sign-in', en: 'sign in', match: /\bsign(ed|ing)?[ -]?in\b/i, scope: 'everywhere',
    note: 'ja: one word — ログイン, as most Japanese SaaS write (Google\'s Japanese button too).',
    terms: { tr: t('giriş yap'), ar: t('تسجيل الدخول'), he: t('התחברות'), fa: t('ورود'), ja: t('ログイン', 'translate', ['サインイン']), ko: t('로그인'), 'zh-Hans': t('登录'), 'zh-Hant': t('登入', 'translate', ['登錄']), hi: t('साइन इन', 'english', ['लॉग इन']), ms: t('log masuk') },
  },
  {
    id: 'workspace', en: 'workspace', match: /\bworkspace\b/i, scope: 'concept',
    terms: { tr: t('çalışma alanı'), ar: t('مساحة العمل'), he: t('סביבת העבודה'), fa: t('فضای کار'), ja: t('ワークスペース'), ko: t('워크스페이스', 'translate', ['작업 공간']), 'zh-Hans': t('工作区', 'translate', ['工作空间']), 'zh-Hant': t('工作區', 'translate', ['工作空間']), hi: t('वर्कस्पेस', 'english'), ms: t('ruang kerja') },
  },
  {
    id: 'trial', en: 'trial', match: /\btrial\b/i, scope: 'concept',
    terms: { tr: t('deneme'), ar: t('تجربة'), he: t('ניסיון'), fa: t('آزمایشی'), ja: t('トライアル', 'translate', ['無料体験']), ko: t('체험', 'translate', ['평가판', '트라이얼']), 'zh-Hans': t('试用'), 'zh-Hant': t('試用'), hi: t('ट्रायल', 'english'), ms: t('percubaan') },
  },
];

/**
 * Words every language writes in English (Latin letters), as the market does:
 * product and brand names, the assistant's name, standards and file types.
 * "English left untranslated" checks skip these.
 */
export const KEEP_ENGLISH = [
  // Ours.
  'Curahold', 'CuraAI',
  // Standards, protocols, file types, units people type.
  'API', 'CRM', 'CSV', 'JSON', 'XLSX', 'PDF', 'PNG', 'SVG', 'JPEG', 'WebP', 'ZIP', 'URL', 'URI', 'ID', 'SSO', 'SAML', 'OIDC', 'OpenID', 'SCIM', 'OAuth', 'OData', 'HMAC', 'SHA', 'JWKS', 'IdP', 'MFA', 'PIN', 'DNS', 'SPF', 'DKIM', 'DMARC', 'SMTP', 'HTTP', 'HTTPS', 'MCP', 'BI', 'AI', 'IT', 'QA', 'UAT', 'CS', 'NPS', 'QBR', 'MRR', 'ARR', 'DAU', 'WAU', 'MAU', 'KVKK', 'GDPR', 'DPA', 'UTC', 'EU', 'US', 'GB', 'MB', 'Webhook', 'webhook', 'Passkey',
  // Other companies' products we connect to (their own names, never translated).
  'Slack', 'Teams', 'Google', 'Microsoft', 'Outlook', 'Gmail', 'Excel', 'Jira', 'Atlassian', 'Zendesk', 'Freshdesk', 'Freshsales', 'HubSpot', 'Salesforce', 'Dynamics', 'Pipedrive', 'Zoho', 'Bitrix24', 'Odoo', 'Xero', 'QuickBooks', 'freee', 'Paraşüt', 'Tableau', 'Qlik', 'Looker', 'Power BI', 'Fabric', 'Claude', 'ChatGPT', 'Zapier', 'Make', 'n8n', 'GitHub', 'GitLab', 'LinkedIn', 'Apple', 'Paddle', 'Snowflake', 'BigQuery', 'Postgres',
];

/** Agent and staff job titles stay English in every language (owner, 19 Nov): "Chief Operating Officer", never a translation. */
export const JOB_TITLES = 'english' as const;

/** Formality per language: what a B2B product in that market writes to its users. */
export const REGISTER: Record<GlossaryLocale, string> = {
  en: 'plain, direct second person',
  tr: '"siz" everywhere: the product, e-mails, the portal, the docs and the sales site (owner, 20 Nov 2026). Sentences say "deneyin", "seçin", "hesabınız"; short button and menu labels keep the bare verb Turkish interfaces use ("Kaydet", "Görev ekle"). tests/i18n-quality.test.ts guards it',
  ar: 'Modern Standard Arabic, polite imperative addressed to one person (masculine default)',
  he: 'second person plural ("אתם", "שלכם", "בדקו"), gender-neutral, on every first-contact surface (site, e-mails, consent, sign-up, trial, agreements) and in the help centre; impersonal "אפשר ל…" where it reads better; never two forms in one string or mail. Buttons are nouns ("אישור", "שמירה"). Older in-app screens still use masculine singular: move them to plural when touched (owner/native-check item, 21 Nov 2026). tests/i18n-quality.test.ts guards it',
  fa: 'formal "شما" with plural verbs (کنید)',
  ja: 'です/ます; buttons as plain nouns or verbs (保存, 送信)',
  ko: '합니다/하세요 in sentences, 해요 never; confirmations ask -시겠습니까? (삭제하시겠습니까?); FAQ questions in the reader\'s own voice may end in -나요, as Korean FAQs do; buttons as nouns (저장). After a {placeholder} write the two-form particle (을(를), 이(가), 은(는), 과(와), (으)로): translate() picks the right one (koParticles.ts); never hard-code one after a name',
  'zh-Hans': '你 in the product, 您 in e-mails and legal text (mainland norm)',
  'zh-Hant': '你 in the product, Taiwan vocabulary (設定, 儲存, 支援, 帳號)',
  hi: 'आप with polite imperatives (करें, चुनें); SaaS nouns as Devanagari loans (टास्क, डैशबोर्ड, सेटिंग), product names in Latin, Latin digits; job titles in English',
  ms: 'anda; Malaysian Malay, not Indonesian (padam not hapus for delete, tetapan, e-mel, log masuk); sprint, backlog, onboarding, playbook kept English as Malaysian B2B teams say them; job titles in English',
};

/** Where the choices above come from: products checked on 19 Nov 2026. */
export const SOURCES: Partial<Record<GlossaryLocale, string[]>> = {
  tr: ['Pipedrive help centre (tr): "Boru hatları", "Müşteri adayı", "Raporlama ve analiz" — support.pipedrive.com/tr', 'Owner: Turkish B2B keeps pipeline, dashboard, sprint, onboarding in English'],
  ja: ['Jira Cloud help (ja): スプリント, バックログ, ボード, ダッシュボード, 作業項目 — support.atlassian.com/ja'],
  ko: ['HubSpot knowledge base (ko): 거래, 거래 파이프라인, 보고서, 대시보드, 작업, 소유자 — knowledge.hubspot.com/ko', 'Salesforce Trailhead (ko): 보고서 및 대시보드'],
  'zh-Hans': ['Jira guides (zh): 冲刺, 待办事项列表, 看板, 仪表板/仪表盘 — atlassian.com/zh'],
  'zh-Hant': ['Zendesk help centre (zh-TW): 工單, 巨集, 經辦人 (Taiwan style) — zendesk.com hc/zh-TW'],
  ar: ['Zoho CRM (ar): الصفقات, مسارات المبيعات, التقارير, لوحات معلومات, العملاء المحتملون — zoho.com/ar/crm'],
  he: ['No major CRM/helpdesk ships a full Hebrew help centre we could read; kept the dictionary\'s dominant words'],
  fa: ['No international B2B SaaS ships Persian; Iranian CRM vendors write داشبورد, قیف فروش, تیکت'],
  hi: [
    'Shopify Help Center (hi): एनालिटिक्स, रिपोर्ट, डैशबोर्ड, यूज़र, एडमिन, डेटा, फ़िल्टर as Devanagari loans; ग्राहक, संगठन, अनुमति, बिक्री native; आप + करें register — help.shopify.com/hi/manual/organization-settings/analytics',
    'Google Tasks Help (hi): टास्क, असाइन, सेटिंग, शेयर, मैनेज, साइन इन करें; सूची, सूचना native — support.google.com/tasks?hl=hi',
    'Zoho CRM lists Hindi as a fully supported UI language (help.zoho.com, languages supported for translation); job titles and product names stay Latin',
  ],
  ms: [
    'Bitrix24 CRM (ms): urus niaga, prospek, kenalan, corong jualan, papan pemuka, laporan, pelanggan — bitrix24.com/my/tools/crm/analytics-and-reports.php',
    'Lark Suite blog (ms_MY, helpdesk comparison): meja bantuan, tiket, ejen, automasi, aliran kerja, ruang kerja, penyepaduan, pelan; SLA kept English — larksuite.com/ms_my/blog',
    'Microsoft Malay terminology: tugasan (task), tetapan, log masuk, padam; e-mel (Malaysian spelling, not Indonesian "surel")',
  ],
};

/** A concept's term in a language, if it has one. */
export const termOf = (id: string, locale: GlossaryLocale): Term | undefined => GLOSSARY.find((c) => c.id === id)?.terms[locale];
