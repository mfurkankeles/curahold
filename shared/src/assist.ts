// The assistant's words on the wire, and the rules it keeps without a model.
//
// Every chatbot — the docs' "Ask", CuraAI in the app (and its onboarding
// mode), the first reply on a help request, the customer portal — asks the
// same server-side core (api/src/assistant). What comes back is an
// AssistReply. The rules here cost nothing and run before any model is asked,
// on the server and, when the server cannot be reached, in the browser:
//
//   - which language a question is written in (the answer comes in it),
//   - questions that mean several things ("how do I add people to the
//     dashboard?") get ONE short question back with 2–4 tappable choices,
//   - questions that ask to weigh Curahold against other products are turned
//     down politely (no names, no comparisons).
import type { MessageKey } from './i18n';
import type { Locale } from './i18n';
import { foldText } from './text';

export type AssistSurface = 'docs' | 'app' | 'onboarding' | 'portal' | 'desk' | 'site';
/**
 * answer      — written from the docs (and the asker's own data), with its sources
 * clarify     — one short question with 2–4 choices
 * decline     — outside what the assistant does (small talk, other products, an instruction it will not follow)
 * not_covered — the docs do not say: nothing is guessed, support is offered with the question filled in
 */
export type AssistKind = 'answer' | 'clarify' | 'decline' | 'not_covered';
/** Who wrote the reply: the language model, the docs search alone (fallback), or the fixed rules here. */
export type AssistEngine = 'llm' | 'docs' | 'rules';
/** Why the model was not asked. */
export type AssistFallback = 'off' | 'no_key' | 'cap' | 'rate' | 'error';

export interface AssistOption {
  /** What to send back when it is tapped (an intent id from CLARIFY, or free text for the model's own choices). */
  id: string;
  label: string;
}
export interface AssistCitation {
  title: string;
  section: string;
  url: string;
}
export interface AssistProposal {
  title: string;
  customer: { id: string; name: string } | null;
  dueDate: string | null;
}
export interface AssistReply {
  kind: AssistKind;
  /** Plain text with "- " lists and **bold** only; never HTML. */
  text: string;
  /** For `clarify`: 2–4 choices. */
  options?: AssistOption[];
  citations: AssistCitation[];
  /** What was read from the workspace, in the person's words. */
  data: string[];
  /** A screen the assistant asked the app to open. */
  opened: string | null;
  /** A task prepared for the person to confirm. */
  proposal: AssistProposal | null;
  /** Screens that fix what the setup checks found (shared/src/setupHealth.ts): buttons, never done for the person. */
  fixes?: { label: string; to: string }[];
  /** For `not_covered` (and on request): a help request, already written. */
  ticket?: { subject: string; description: string };
  /** The language the reply is written in. */
  lang: Locale;
  engine: AssistEngine;
  fallback?: AssistFallback;
  cached?: boolean;
}

export interface AssistTurn {
  role: 'user' | 'assistant';
  content: string;
}
export interface AssistRequest {
  question: string;
  /** The conversation so far (the server keeps only the last few turns). */
  history?: AssistTurn[];
  /** A choice tapped from a `clarify` reply. */
  intent?: string;
  /** In the app: 'onboarding' for the first-steps guide. */
  mode?: 'help' | 'onboarding';
  /** Where the person is (an app path or a docs page), as a hint. */
  page?: string;
}

// ------------------------------------------------------------------ language

// Characters written differently in the two scripts (any shared by both lists are dropped below).
const TRAD_CHARS = '們這個麼會說時與為來對還應該號碼關聯資設顯刪帳戶報儀絡務級權組員單據匯導戶將從裡請問麼舊點擊選單儲';
const SIMP_CHARS = '们这个么会说时与为来对还应该号码关联资设显删账户报仪络务级权组员单据汇导户将从里请问么旧点击选单储';
const only = (a: string, b: string) => new Set([...a].filter((ch) => !b.includes(ch)));
const TRADITIONAL = only(TRAD_CHARS, SIMP_CHARS);
const SIMPLIFIED = only(SIMP_CHARS, TRAD_CHARS);
const hasAny = (t: string, set: Set<string>) => [...t].some((ch) => set.has(ch));
const TURKISH_WORDS = /\b(nasil|neden|nedir|nerede|musteri|gorev|ekle|eklerim|yapabilirim|icin|ile|bir|mi|mu|degil|lutfen|merhaba|selam|tesekkur|hesap|sil|pano|kisi|rapor|alan|bana|benim|ben|var|yok|olarak|olur|istiyorum)\b/;
const ENGLISH_WORDS = /\b(how|what|where|why|when|the|is|are|can|do|does|my|i|you|please|hello|hi|thanks|add|delete|show|which)\b/;

/** Our languages written in Latin letters: a Latin question that says too little stays in the reader's one. */
const LATIN_SCRIPT = new Set<Locale>(['en', 'tr']);

/** The language a question is written in; `fallback` (the reader's language) when it cannot be told. */
export function languageOf(text: string, fallback: Locale): Locale {
  const t = text.slice(0, 600);
  if (/[֐-׿]/.test(t)) return 'he';
  if (/[؀-ۿ]/.test(t)) {
    // Letters Persian has and Arabic does not (پ چ ژ گ), and Persian's own forms of k and y.
    if (/[پچژگکی]/.test(t)) return 'fa';
    return fallback === 'fa' ? 'fa' : 'ar';
  }
  if (/[가-힯ᄀ-ᇿ]/.test(t)) return 'ko';
  if (/[぀-ヿ]/.test(t)) return 'ja';
  if (/[一-鿿]/.test(t)) {
    const trad = hasAny(t, TRADITIONAL);
    const simp = hasAny(t, SIMPLIFIED);
    if (trad && !simp) return 'zh-Hant';
    if (simp && !trad) return 'zh-Hans';
    if (fallback === 'zh-Hant' || fallback === 'zh-Hans' || fallback === 'ja') return fallback;
    return 'zh-Hans';
  }
  if (/[çğışöüÇĞİŞÖÜ]/.test(t)) return 'tr';
  const f = foldText(t);
  const tr = TURKISH_WORDS.test(f);
  const en = ENGLISH_WORDS.test(f);
  if (tr && !en) return 'tr';
  if (en && !tr) return 'en';
  return LATIN_SCRIPT.has(fallback) ? fallback : /[a-z]/i.test(t) ? 'en' : fallback;
}

// ------------------------------------------------------------------ clarify

/** Words of one meaning in the nine languages. Latin ones match the start of a word; the others anywhere. */
type Words = string[];

interface Ambiguity {
  id: string;
  /** Every group must have a word in the question. */
  all: Words[];
  /** A word from here means the question already says which one: no need to ask. */
  none: Words;
  /** Only a short question means this one ("How do I import?"); a longer one names what it is about. */
  short?: boolean;
  question: MessageKey;
  options: { id: string; label: MessageKey; pages: string[] }[];
}

const PEOPLE: Words = [
  'people', 'person', 'persons', 'user', 'member', 'teammate', 'colleague', 'staff',
  'kisi', 'insan', 'kullanici', 'uye', 'ekip arkadas', 'calisan', 'personel',
  'أشخاص', 'الأشخاص', 'اشخاص', 'الناس', 'مستخدم', 'أعضاء', 'الأعضاء', 'زملاء',
  'אנשים', 'האנשים', 'משתמשים', 'חברי', 'עובדים',
  'افراد', 'آدم', 'کاربر', 'اعضا', 'همکار',
  '人员', '人員', '成员', '成員', '用户', '用戶', '同事',
  'メンバー', 'ユーザー', '人たち', '人を', '人々',
  '사람', '멤버', '사용자', '인원', '팀원',
];
const BOARDISH: Words = [
  'dashboard', 'board', 'panel',
  'pano', 'gosterge',
  'لوحة', 'اللوحة', 'داشبورد',
  'לוח', 'דשבורד',
  'پنل', 'داشبورد',
  '仪表板', '仪表盘', '儀表板', '儀表盤', '看板', '面板',
  'ダッシュボード', 'ボード',
  '대시보드', '보드',
];
const PEOPLE_SAYS_WHICH: Words = [
  'invit', 'contact', 'field', 'report', 'card', 'widget', 'assign', 'column',
  'davet', 'kontak', 'iletisim', 'alan', 'rapor', 'kart', 'atama', 'ata ', 'sutun',
  'دعوة', 'ادع', 'جهة اتصال', 'جهات', 'حقل', 'تقرير', 'بطاقة',
  'הזמ', 'איש קשר', 'אנשי קשר', 'שדה', 'דוח', 'כרטיס',
  'دعوت', 'مخاطب', 'فیلد', 'گزارش', 'کارت',
  '邀请', '邀請', '联系人', '聯絡人', '字段', '欄位', '报表', '報表', '报告', '報告', '卡片', '分配', '指派',
  '招待', '連絡先', 'フィールド', '項目', 'レポート', 'カード', '割り当',
  '초대', '연락처', '필드', '보고서', '리포트', '카드', '할당',
];
const DELETE: Words = [
  'delete', 'remove', 'close', 'cancel',
  'sil', 'kaldir', 'kapat', 'iptal',
  'احذف', 'حذف', 'إلغاء', 'الغاء', 'إغلاق', 'اغلاق',
  'מחק', 'מוחק', 'למחוק', 'מחיקת', 'לסגור', 'סגירת',
  'پاک', 'ببندم', 'بستن',
  '删除', '刪除', '注销', '註銷', '关闭', '關閉',
  '削除', '退会', '解約',
  '삭제', '탈퇴', '해지',
];
const ACCOUNT: Words = [
  'account',
  'hesap', 'hesab',
  'حساب',
  'חשבון',
  '账户', '账号', '帳戶', '帳號',
  'アカウント',
  '계정',
];
const ACCOUNT_SAYS_WHICH: Words = [
  'customer', 'client', 'company', 'workspace', 'profile', 'organi', 'subscription', 'api key', 'key',
  'musteri', 'sirket', 'firma', 'profil', 'abonelik', 'calisma alani', 'anahtar',
  'عميل', 'عملاء', 'شركة', 'الشركة', 'ملف', 'اشتراك',
  'לקוח', 'חברה', 'החברה', 'פרופיל', 'מנוי',
  'مشتری', 'شرکت', 'پروفایل', 'اشتراک',
  '客户', '客戶', '公司', '个人资料', '個人資料', '订阅', '訂閱',
  '顧客', '会社', 'プロフィール', 'サブスク',
  '고객', '회사', '프로필', '구독',
];
const IMPORT: Words = [
  'import', 'bring in', 'upload my data', 'migrate',
  'ice aktar', 'aktar', 'tasi',
  'استيراد', 'استورد',
  'ייבוא', 'לייבא', 'ייבא',
  'وارد کن', 'درون‌ریزی', 'ایمپورت',
  '导入', '導入', '匯入',
  'インポート', '取り込',
  '가져오', '임포트',
];
const IMPORT_SAYS_WHICH: Words = [
  'customer', 'client', 'account', 'task', 'crm', 'contact', 'opportunit', 'record', 'salesforce', 'hubspot', 'pipedrive', 'dynamics', 'zoho', 'sheet', 'excel',
  'musteri', 'gorev', 'firsat', 'kayit', 'kontak', 'is ',
  'عملاء', 'العملاء', 'مهام', 'المهام', 'جهات',
  'לקוחות', 'משימות', 'אנשי קשר',
  'مشتری', 'وظایف', 'کارها', 'مخاطب',
  '客户', '客戶', '任务', '任務', '联系人', '聯絡人',
  '顧客', 'タスク', '連絡先',
  '고객', '작업', '태스크', '연락처',
];
const CONNECT: Words = [
  'connect', 'integrat', 'hook up',
  'bagla', 'baglan', 'entegre', 'entegrasyon',
  'ربط', 'اربط', 'تكامل', 'دمج',
  'לחבר', 'חיבור', 'אינטגרציה',
  'وصل', 'اتصال', 'یکپارچه',
  '连接', '連接', '集成', '整合', '对接', '對接',
  '連携', '接続',
  '연결', '연동', '통합',
];
const CONNECT_SAYS_WHICH: Words = [
  'slack', 'teams', 'google', 'gmail', 'outlook', 'calendar', 'crm', 'salesforce', 'hubspot', 'dynamics', 'pipedrive', 'zoho', 'jira', 'sheet', 'excel', 'zendesk', 'freshdesk', 'api', 'webhook', 'mcp', 'sso', 'saml', 'chat', 'github', 'gitlab', 'task', 'customer', 'mail',
  'takvim', 'sohbet', 'gorev', 'musteri', 'posta',
  'تقويم', 'دردشة', 'مهام', 'عملاء', 'بريد',
  'יומן', 'צ\'אט', 'צאט', 'משימ', 'לקוח', 'דואר',
  'تقویم', 'چت', 'مشتری', 'ایمیل',
  '日历', '日曆', '聊天', '任务', '任務', '客户', '客戶', '邮件', '郵件',
  'カレンダー', 'チャット', 'タスク', '顧客', 'メール',
  '캘린더', '채팅', '작업', '고객', '메일',
];

/** Questions that mean several things in Curahold, and the choices offered for them. */
export const CLARIFY: Ambiguity[] = [
  {
    id: 'people_board',
    all: [PEOPLE, BOARDISH],
    none: PEOPLE_SAYS_WHICH,
    question: 'assist.clarify.people_board',
    options: [
      { id: 'invite_board', label: 'assist.opt.invite_board', pages: ['getting-started', 'roles-and-access', 'tasks'] },
      { id: 'contacts_customer', label: 'assist.opt.contacts_customer', pages: ['customers'] },
      { id: 'person_field', label: 'assist.opt.person_field', pages: ['tasks', 'customers'] },
      { id: 'people_dashboard', label: 'assist.opt.people_dashboard', pages: ['pipeline-and-reports', 'home-pages'] },
    ],
  },
  {
    id: 'delete_account',
    all: [DELETE, ACCOUNT],
    none: ACCOUNT_SAYS_WHICH,
    question: 'assist.clarify.delete_account',
    options: [
      { id: 'delete_customer', label: 'assist.opt.delete_customer', pages: ['customers', 'trash'] },
      { id: 'delete_me', label: 'assist.opt.delete_me', pages: ['security-and-privacy', 'roles-and-access'] },
      { id: 'close_company', label: 'assist.opt.close_company', pages: ['billing', 'security-and-privacy'] },
    ],
  },
  {
    id: 'import',
    short: true,
    all: [IMPORT],
    none: IMPORT_SAYS_WHICH,
    question: 'assist.clarify.import',
    options: [
      { id: 'import_customers', label: 'assist.opt.import_customers', pages: ['customers'] },
      { id: 'import_tasks', label: 'assist.opt.import_tasks', pages: ['tasks'] },
      { id: 'import_crm', label: 'assist.opt.import_crm', pages: ['connections'] },
    ],
  },
  {
    id: 'connect',
    short: true,
    all: [CONNECT],
    none: CONNECT_SAYS_WHICH,
    question: 'assist.clarify.connect',
    options: [
      { id: 'connect_chat', label: 'assist.opt.connect_chat', pages: ['connections', 'notifications'] },
      { id: 'connect_crm', label: 'assist.opt.connect_crm', pages: ['connections'] },
      { id: 'connect_calendar', label: 'assist.opt.connect_calendar', pages: ['notifications', 'tasks'] },
      { id: 'connect_api', label: 'assist.opt.connect_api', pages: ['developers', 'api-keys', 'webhooks', 'connect-your-own-tool'] },
    ],
  },
];

const LATIN = /^[\x20-\x7e]+$/;
/** Does the question hold one of these words? Latin words match a word's start ("kisileri" holds "kisi"); others match anywhere. */
const foldedWords = new WeakMap<Words, string[]>();
/**
 * Whether a folded text contains all of a set of words, folded the same way (CJK, Hangul and kana split, Arabic kept).
 */
export function holds(folded: string, words: Words): boolean {
  let list = foldedWords.get(words);
  // Folded the same way as the question: Hangul and kana come apart into their parts, Arabic loses nothing it needs.
  if (!list) foldedWords.set(words, (list = words.map((w) => foldText(w))));
  return list.some((w, i) => {
    if (!LATIN.test(words[i])) return folded.includes(w);
    for (let at = folded.indexOf(w); at >= 0; at = folded.indexOf(w, at + 1)) if (at === 0 || !/[a-z0-9]/.test(folded[at - 1])) return true;
    return false;
  });
}

/** The ambiguity a question falls into, if it says too little to answer well. */
export function ambiguityOf(question: string): Ambiguity | null {
  const f = ` ${foldText(question).replace(/[’'`´]/g, ' ')} `;
  // A long question usually says enough; asking back would only slow it down.
  if (f.length > 160) return null;
  const t = question.trim();
  // Short: a few words ("How do I connect it?", "Nasıl bağlarım?"); Han, kana and Hangul say as much in fewer characters.
  const short = t.length <= (/[\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/.test(t) ? 14 : 24);
  return CLARIFY.find((a) => (!a.short || short) && a.all.every((g) => holds(f, g)) && !holds(f, a.none)) ?? null;
}

/** The choice behind an option id, with the docs pages that answer it. */
export function intentOf(id: string | undefined | null): { ambiguity: Ambiguity; option: Ambiguity['options'][number] } | null {
  if (!id) return null;
  for (const a of CLARIFY) {
    const option = a.options.find((o) => o.id === id);
    if (option) return { ambiguity: a, option };
  }
  return null;
}

// ------------------------------------------------------------------ other products

const COMPARE: RegExp[] = [
  /\b(better|worse|cheaper|faster|easier) than\b/,
  /\b(vs\.?|versus)\b/,
  /\balternatives? (to|for)\b/,
  /\bcompare (curahold|you|it|this product) (to|with)\b/,
  /\bcompetitors?\b/,
  /\brakip/,
  /\b(daha iyi|daha ucuz|daha hizli)\b.*\b(mi|mu|misin|misiniz)\b/,
  /\b(yerine|alternatif)\b.*\b(hangi|ne) (urun|uygulama|arac|program)/,
  /\bkarsilastir/,
  /منافس|أفضل من|افضل من|مقارنة مع|بديل ل/,
  /מתחר|טוב יותר מ|לעומת|השוואה ל|חלופה ל/,
  /رقبا|رقیب|بهتر از|مقایسه با|جایگزین/,
  /竞争对手|競爭對手|竞品|競品|比.{0,12}(更好|好吗|好嗎|便宜)|相比|对比|對比|替代品/,
  /競合|競争相手|より(良い|いい|安い)|と比べ|と比較|代替/,
  /경쟁사|경쟁 제품|보다 (나은|좋은|싼|저렴)|와 비교|과 비교|대안/,
];

/**
 * Does the question ask to weigh Curahold against another product? `names`
 * are other products' names from the server's settings (never written in code).
 */
export function asksAboutOthers(question: string, names: string[] = []): boolean {
  const f = foldText(question);
  if (names.some((n) => n.trim().length > 1 && holds(` ${f} `, [n.trim()]))) return true;
  // Folding takes Hangul and kana apart; their patterns are matched on the text as written.
  const raw = question.normalize('NFC').toLowerCase();
  return COMPARE.some((r) => r.test(f) || r.test(raw));
}

// ------------------------------------------------------------------ instructions hidden in text

const INJECTION: RegExp[] = [
  /\b(ignore|disregard|forget|override) (all |any |the |your )?(previous|prior|above|earlier|system)? ?(instructions|rules|prompt|messages)\b/,
  /\b(system prompt|developer message|hidden instructions|your instructions|your rules)\b/,
  /\byou are now\b|\bact as\b.*\b(unrestricted|dan|jailbreak)|\bjailbreak\b|\bdeveloper mode\b/,
  /\bonceki (talimat|kural)|talimatlarini (unut|yok say)|sistem (istem|mesaj|prompt)/,
  /تجاهل (جميع |كل )?(التعليمات|الأوامر)|موجه النظام|تعليمات النظام/,
  /התעלם מ(כל )?ההוראות|הוראות המערכת|הנחיות המערכת/,
  /دستورالعمل.{0,20}(نادیده|فراموش)|(نادیده|فراموش).{0,20}دستور|پرامپت سیستم/,
  /忽略.{0,6}(之前|以上|所有).{0,4}(指令|指示|说明|說明)|系统提示|系統提示/,
  /(以前|前|上記).{0,4}(指示|命令).{0,4}(無視|忘れ)|システムプロンプト/,
  /(이전|위의).{0,4}(지시|명령).{0,6}(무시|잊)|시스템 프롬프트/,
];

/** Does the text try to give the assistant instructions of its own? (The model is told the same; this is the free first check.) */
export function triesToInstruct(text: string): boolean {
  const f = foldText(text);
  const raw = text.normalize('NFC').toLowerCase();
  return INJECTION.some((r) => r.test(f) || r.test(raw));
}
