// The data inventory (records of processing): what personal data Curahold
// handles, why, on which legal basis per region, where it is stored, how long
// it is kept and who receives it — and the sub-processors behind it.
//
// It is maintained here and nowhere else. scripts/compliance/legal-pack.ts turns
// it into: the sub-processor page (nine languages), the tables inside the
// privacy notice and the KVKK aydınlatma metni (English, Turkish), the internal
// records of processing (docs/compliance/data-inventory.md) and the VERBİS
// preparation sheet (docs/compliance/verbis-hazirlik.md). The trial form's
// consent texts take their {storage_countries} and {processors} from here, so
// the texts are true on the day they are shown.
//
// Rule for every change: a new provider, a new kind of data or a new purpose is
// a line here first (tests/compliance.test.ts keeps the generated pages current).
// LEGAL STATUS: draft (taslak — avukat onayı gerekli). Values in [brackets] are
// for the owner to fill in (company not incorporated yet; regions to confirm).
import type { Locale } from '../i18n/core';
import type { Placeholders } from './consentTexts';

type Words = Record<Locale, string>;
type Two = { en: string; tr: string };

/** Filled when the company exists (research §5). */
export const COMPANY = {
  legalName: '[Company legal name]',
  legalNameTr: '[Şirket unvanı]',
  country: '[country]',
  countryTr: '[ülke]',
  address: '[address]',
  privacyEmail: '[privacy e-mail]',
  mersis: '[MERSİS no.]',
  kep: '[KEP address]',
} as const;

export type ProcessorId = 'cloudflare' | 'supabase' | 'googleWorkspace' | 'paddle' | 'anthropic' | 'resend' | 'googleSignin' | 'microsoft';

export interface Subprocessor {
  id: ProcessorId;
  company: string;
  purpose: Words;
  /** ISO codes; '[..]' where the region is still to be chosen. */
  countries: string[];
  /** always · ai: only when a company turns AI features on · option: only when a company turns that sign-in/connection on · paid · later: not used until switched on. */
  when: 'always' | 'ai' | 'option' | 'paid' | 'later';
  /** Safeguards for transfers (GDPR Chapter V / KVKK art. 9). */
  safeguards: string;
  /** KVKK art. 9 standard contract (Turkish text, signed, notified within 5 business days): the owner's task. */
  kvkkStandardContract: 'to_ask' | 'signed' | 'notified' | 'not_needed';
  /** Handles the trial-request leads (named in the trial form's consent texts). */
  leads: boolean;
}

export const SUBPROCESSORS: Subprocessor[] = [
  {
    id: 'cloudflare',
    company: 'Cloudflare, Inc.',
    countries: ['US', '[R2 location]'],
    when: 'always',
    leads: true,
    safeguards: 'EU SCCs 2021/914 (module 3) + EU–US Data Privacy Framework; transfer impact assessment on file',
    kvkkStandardContract: 'to_ask',
    purpose: {
      en: 'Hosting of the application, the network in front of it, file storage (R2), incoming mail routing.',
      tr: 'Uygulamanın barındırılması, önündeki ağ, dosya depolama (R2), gelen e-postanın yönlendirilmesi.',
      ar: 'استضافة التطبيق والشبكة التي تسبقه وتخزين الملفات (R2) وتوجيه البريد الوارد.',
      he: 'אירוח האפליקציה, הרשת שלפניה, אחסון קבצים (R2) וניתוב דואר נכנס.',
      fa: 'میزبانی برنامه، شبکهٔ جلوی آن، ذخیره‌سازی فایل (R2) و مسیریابی ایمیل‌های ورودی.',
      'zh-Hans': '托管应用程序及其前端网络、文件存储（R2）、入站邮件路由。',
      'zh-Hant': '託管應用程式及其前端網路、檔案儲存（R2）、收件郵件路由。',
      ja: 'アプリケーションのホスティング、その前段のネットワーク、ファイル保存（R2）、受信メールの転送。',
      ko: '애플리케이션 호스팅, 앞단 네트워크, 파일 저장(R2), 수신 메일 라우팅.',
    },
  },
  {
    id: 'supabase',
    company: 'Supabase, Inc.',
    countries: ['[EU region]'],
    when: 'always',
    leads: true,
    safeguards: 'EU region; SCCs for any access from outside the EEA',
    kvkkStandardContract: 'to_ask',
    purpose: {
      en: 'The database (PostgreSQL) holding accounts, company data and backups.',
      tr: 'Hesapları, şirket verilerini ve yedekleri tutan veritabanı (PostgreSQL).',
      ar: 'قاعدة البيانات (PostgreSQL) التي تحفظ الحسابات وبيانات الشركات والنسخ الاحتياطية.',
      he: 'מסד הנתונים (PostgreSQL) שמחזיק חשבונות, נתוני חברות וגיבויים.',
      fa: 'پایگاه داده (PostgreSQL) که حساب‌ها، داده‌های شرکت‌ها و نسخه‌های پشتیبان را نگه می‌دارد.',
      'zh-Hans': '保存账户、公司数据和备份的数据库（PostgreSQL）。',
      'zh-Hant': '保存帳戶、公司資料和備份的資料庫（PostgreSQL）。',
      ja: 'アカウント、企業データ、バックアップを保存するデータベース（PostgreSQL）。',
      ko: '계정, 회사 데이터, 백업을 보관하는 데이터베이스(PostgreSQL).',
    },
  },
  {
    id: 'googleWorkspace',
    company: 'Google LLC / Google Ireland Ltd (Google Workspace)',
    countries: ['IE', 'US'],
    when: 'always',
    leads: true,
    safeguards: 'Google Cloud data processing terms with EU SCCs + Data Privacy Framework',
    kvkkStandardContract: 'to_ask',
    purpose: {
      en: 'Our own company mailboxes, and sending the product’s e-mails (sign-in links, reminders, summaries) through the Workspace SMTP relay.',
      tr: 'Şirketimizin kendi e-posta kutuları ve ürünün e-postalarının (giriş bağlantıları, hatırlatmalar, özetler) Workspace SMTP aktarıcısıyla gönderilmesi.',
      ar: 'صناديق البريد الخاصة بشركتنا، وإرسال رسائل المنتج (روابط تسجيل الدخول والتذكيرات والملخصات) عبر مرحّل SMTP في Workspace.',
      he: 'תיבות הדואר של החברה שלנו, ושליחת הודעות המוצר (קישורי כניסה, תזכורות, סיכומים) דרך ממסר ה-SMTP של Workspace.',
      fa: 'صندوق‌های ایمیل خود شرکت ما و ارسال ایمیل‌های محصول (پیوند ورود، یادآوری‌ها، خلاصه‌ها) از طریق رلهٔ SMTP در Workspace.',
      'zh-Hans': '我们公司自己的邮箱，以及通过 Workspace SMTP 中继发送产品邮件（登录链接、提醒、摘要）。',
      'zh-Hant': '我們公司自己的信箱，以及透過 Workspace SMTP 轉送服務寄送產品郵件（登入連結、提醒、摘要）。',
      ja: '当社のメールボックス、および Workspace の SMTP リレーによる製品メール（ログインリンク、リマインダー、サマリー）の送信。',
      ko: '당사 메일함, 그리고 Workspace SMTP 릴레이를 통한 제품 메일(로그인 링크, 알림, 요약) 발송.',
    },
  },
  {
    id: 'paddle',
    company: 'Paddle.com Market Ltd',
    countries: ['GB', 'US'],
    when: 'paid',
    leads: false,
    safeguards: 'UK adequacy (EU→UK); for the sale itself Paddle is the seller and a separate controller',
    kvkkStandardContract: 'to_ask',
    purpose: {
      en: 'Payments, invoices and sales tax as merchant of record (only the paying company’s billing contact).',
      tr: 'Satıcı (merchant of record) olarak ödemeler, faturalar ve satış vergisi (yalnızca ödeyen şirketin fatura yetkilisi).',
      ar: 'المدفوعات والفواتير وضريبة المبيعات بصفته التاجر المسجَّل (جهة الفوترة في الشركة الدافعة فقط).',
      he: 'תשלומים, חשבוניות ומס מכירה כמשווק (merchant of record) — רק איש הקשר לחיוב בחברה המשלמת.',
      fa: 'پرداخت‌ها، صورت‌حساب‌ها و مالیات فروش به‌عنوان فروشندهٔ ثبت‌شده (فقط مسئول صورت‌حساب شرکت پرداخت‌کننده).',
      'zh-Hans': '作为记录商户处理付款、发票和销售税（仅涉及付款公司的账单联系人）。',
      'zh-Hant': '作為記錄商戶處理付款、發票和銷售稅（僅涉及付款公司的帳單聯絡人）。',
      ja: '販売者（merchant of record）としての決済、請求書、売上税（支払う企業の請求担当者のみ）。',
      ko: '판매 기록자로서 결제, 청구서, 판매세 처리(결제하는 회사의 청구 담당자만).',
    },
  },
  {
    id: 'anthropic',
    company: 'Anthropic PBC',
    countries: ['US'],
    when: 'ai',
    leads: false,
    safeguards: 'Commercial terms + DPA with SCCs; inputs and outputs not used for model training; retention [30 days — confirm]',
    kvkkStandardContract: 'to_ask',
    purpose: {
      en: 'Answers of the built-in AI assistant (CuraAI, help, support). Only the minimum needed is sent; it is never used to train models.',
      tr: 'Yerleşik yapay zekâ asistanının (CuraAI, yardım, destek) yanıtları. Yalnızca gereken en az veri gönderilir; model eğitmek için asla kullanılmaz.',
      ar: 'إجابات المساعد الذكي المدمج (CuraAI والمساعدة والدعم). لا يُرسَل إلا الحد الأدنى اللازم، ولا يُستخدم أبدًا لتدريب النماذج.',
      he: 'תשובות עוזר הבינה המלאכותית המובנה (CuraAI, עזרה, תמיכה). נשלח רק המינימום הנדרש, ולעולם אינו משמש לאימון מודלים.',
      fa: 'پاسخ‌های دستیار هوش مصنوعی داخلی (CuraAI، راهنما، پشتیبانی). فقط حداقل لازم فرستاده می‌شود و هرگز برای آموزش مدل‌ها به کار نمی‌رود.',
      'zh-Hans': '内置 AI 助手（CuraAI、帮助、支持）的回答。仅发送所需的最少数据，绝不用于训练模型。',
      'zh-Hant': '內建 AI 助理（CuraAI、說明、支援）的回答。僅傳送所需的最少資料，絕不用於訓練模型。',
      ja: '組み込みの AI アシスタント（CuraAI、ヘルプ、サポート）の回答。必要最小限のデータだけを送り、モデルの学習には一切使われません。',
      ko: '내장 AI 도우미(CuraAI, 도움말, 지원)의 답변. 꼭 필요한 최소한만 보내며 모델 학습에는 절대 쓰이지 않습니다.',
    },
  },
  {
    id: 'resend',
    company: 'Resend, Inc.',
    countries: ['US'],
    when: 'later',
    leads: false,
    safeguards: 'SCCs + DPF (only if switched on)',
    kvkkStandardContract: 'to_ask',
    purpose: {
      en: 'A dedicated e-mail sending service — not used today; only if the product’s mail volume outgrows the Workspace relay (announced 30 days ahead).',
      tr: 'Ayrı bir e-posta gönderim hizmeti — bugün kullanılmıyor; yalnızca ürünün e-posta hacmi Workspace aktarıcısını aşarsa (30 gün önceden duyurulur).',
      ar: 'خدمة مخصّصة لإرسال البريد — غير مستخدمة اليوم؛ فقط إذا تجاوز حجم بريد المنتج طاقة مرحّل Workspace (يُعلن عنها قبل 30 يومًا).',
      he: 'שירות ייעודי לשליחת דוא״ל — לא בשימוש היום; רק אם נפח הדואר של המוצר יעבור את ממסר Workspace (בהודעה 30 יום מראש).',
      fa: 'یک سرویس جداگانهٔ ارسال ایمیل — امروز استفاده نمی‌شود؛ فقط اگر حجم ایمیل محصول از رلهٔ Workspace فراتر رود (۳۰ روز پیش‌تر اعلام می‌شود).',
      'zh-Hans': '专用邮件发送服务——目前未使用；仅当产品邮件量超出 Workspace 中继能力时才启用（提前 30 天通知）。',
      'zh-Hant': '專用郵件寄送服務——目前未使用；僅當產品郵件量超出 Workspace 轉送服務能力時才啟用（提前 30 天通知）。',
      ja: 'メール配信専用サービス。現在は使っていません。製品メールの量が Workspace リレーを超えた場合にのみ利用します（30 日前にお知らせします）。',
      ko: '전용 메일 발송 서비스 — 현재 사용하지 않음. 제품 메일 양이 Workspace 릴레이 한도를 넘을 때만 사용(30일 전 공지).',
    },
  },
  {
    id: 'googleSignin',
    company: 'Google LLC',
    countries: ['US'],
    when: 'option',
    leads: false,
    safeguards: 'Google terms with SCCs + DPF',
    kvkkStandardContract: 'to_ask',
    purpose: {
      en: '"Sign in with Google" and Google Sheets — only when the company turns them on.',
      tr: '"Google ile giriş" ve Google E-Tablolar — yalnızca şirket açarsa.',
      ar: '«تسجيل الدخول عبر Google» وGoogle Sheets — فقط إذا فعّلتها الشركة.',
      he: '"כניסה עם Google" ו-Google Sheets — רק כשהחברה מפעילה אותם.',
      fa: '«ورود با Google» و Google Sheets — فقط وقتی شرکت روشنشان کند.',
      'zh-Hans': '“使用 Google 登录”和 Google 表格——仅在公司开启时。',
      'zh-Hant': '「使用 Google 登入」和 Google 試算表——僅在公司開啟時。',
      ja: '「Google でログイン」と Google スプレッドシート（企業がオンにした場合のみ）。',
      ko: '“Google로 로그인”과 Google 스프레드시트 — 회사가 켠 경우에만.',
    },
  },
  {
    id: 'microsoft',
    company: 'Microsoft Corporation',
    countries: ['US'],
    when: 'option',
    leads: false,
    safeguards: 'Microsoft terms with SCCs + DPF',
    kvkkStandardContract: 'to_ask',
    purpose: {
      en: '"Sign in with Microsoft" and Excel — only when the company turns them on.',
      tr: '"Microsoft ile giriş" ve Excel — yalnızca şirket açarsa.',
      ar: '«تسجيل الدخول عبر Microsoft» وExcel — فقط إذا فعّلتها الشركة.',
      he: '"כניסה עם Microsoft" ו-Excel — רק כשהחברה מפעילה אותם.',
      fa: '«ورود با Microsoft» و Excel — فقط وقتی شرکت روشنشان کند.',
      'zh-Hans': '“使用 Microsoft 登录”和 Excel——仅在公司开启时。',
      'zh-Hant': '「使用 Microsoft 登入」和 Excel——僅在公司開啟時。',
      ja: '「Microsoft でログイン」と Excel（企業がオンにした場合のみ）。',
      ko: '“Microsoft로 로그인”과 Excel — 회사가 켠 경우에만.',
    },
  },
];

// ------------------------------------------------------------------ processing activities

export interface Activity {
  id: string;
  /** controller: Curahold decides why; processor: the customer decides, Curahold acts on its instructions (DPA). */
  role: 'controller' | 'processor';
  subjects: Two;
  data: Two;
  purpose: Two;
  /** Legal basis per region (research §1). */
  basis: { tr: Two; eu: string; gulf: string; other: string };
  retention: Two;
  /** Where it is stored and who receives it. */
  processors: ProcessorId[];
  others?: Two;
  /** VERBİS: personal-data categories (Turkish names used by VERBİS). */
  verbis: string[];
}

const contract = { tr: { tr: 'KVKK m. 5/2-c (sözleşmenin kurulması veya ifası)', en: 'KVKK art. 5/2-c (contract)' }, eu: 'Art. 6(1)(b) GDPR (contract)', gulf: 'Contract with the person (UAE art. 4; Saudi PDPL); consent where no exception applies', other: 'Contract / near-contract (KR art. 15(1)4, TW art. 19, JP purpose notice)' };

export const ACTIVITIES: Activity[] = [
  {
    id: 'accounts',
    role: 'controller',
    subjects: { en: 'Users of customer companies', tr: 'Müşteri şirketlerin kullanıcıları' },
    data: { en: 'Name, work e-mail, role, language, time zone, profile picture', tr: 'Ad, iş e-postası, rol, dil, saat dilimi, profil fotoğrafı' },
    purpose: { en: 'Providing the service: accounts, signing in, notifications', tr: 'Hizmetin sunulması: hesaplar, giriş, bildirimler' },
    basis: contract,
    retention: { en: 'While the account is open; deleted 30 days after it closes (backups overwritten within 35 days)', tr: 'Hesap açık olduğu sürece; kapandıktan 30 gün sonra silinir (yedekler 35 gün içinde üzerine yazılır)' },
    processors: ['cloudflare', 'supabase', 'googleWorkspace'],
    verbis: ['Kimlik', 'İletişim', 'Mesleki deneyim'],
  },
  {
    id: 'security',
    role: 'controller',
    subjects: { en: 'Users, portal contacts, visitors of sign-in pages', tr: 'Kullanıcılar, portal kişileri, giriş sayfası ziyaretçileri' },
    data: { en: 'Sign-in times, device identifier, IP address, browser, activity log', tr: 'Giriş zamanları, cihaz tanımlayıcısı, IP adresi, tarayıcı, işlem kaydı' },
    purpose: { en: 'Keeping accounts secure, finding misuse, the device limit on seats', tr: 'Hesap güvenliği, kötüye kullanımın tespiti, koltuk başına cihaz sınırı' },
    basis: {
      tr: { tr: 'KVKK m. 5/2-ç (hukuki yükümlülük, 5651 s. Kanun) ve m. 5/2-f (meşru menfaat)', en: 'KVKK art. 5/2-ç (legal obligation, Law 5651) and 5/2-f (legitimate interest)' },
      eu: 'Art. 6(1)(f) (legitimate interest: security) and 6(1)(c)',
      gulf: 'Legal obligation / necessary for the contract; consent text covers it in the UAE',
      other: 'Security measures required by each law (APPI art. 23, PIPA art. 29, PDPA s. 24)',
    },
    retention: { en: '12 months, then deleted', tr: '12 ay, sonra silinir' },
    processors: ['cloudflare', 'supabase'],
    verbis: ['İşlem güvenliği'],
  },
  {
    id: 'customerData',
    role: 'processor',
    subjects: { en: "Customers' own customers, contacts and staff", tr: 'Müşterilerin kendi müşterileri, iletişim kişileri ve çalışanları' },
    data: { en: 'Whatever the customer enters: contacts, accounts, tasks, notes, files, portal users', tr: 'Müşterinin girdiği her şey: kişiler, hesaplar, görevler, notlar, dosyalar, portal kullanıcıları' },
    purpose: { en: "Processing on the customer's documented instructions (Data processing agreement)", tr: 'Müşterinin belgelenmiş talimatıyla işleme (Veri işleme sözleşmesi)' },
    basis: {
      tr: { tr: 'Veri sorumlusu müşteridir; Curahold veri işleyendir (KVKK m. 12)', en: 'The customer is the controller; Curahold is the processor (KVKK art. 12)' },
      eu: "Art. 28 GDPR — the customer's basis",
      gulf: "Processor on the controller's instructions",
      other: 'Entrustment / outsourcing (JP art. 27(5), KR art. 26)',
    },
    retention: { en: 'For the contract; exportable at any time; deleted 30 days after the end, backups within 35 days', tr: 'Sözleşme süresince; her an dışa aktarılabilir; bitişten 30 gün sonra silinir, yedekler 35 gün içinde' },
    processors: ['cloudflare', 'supabase', 'googleWorkspace', 'anthropic'],
    others: { en: 'Tools the customer connects itself (on its instruction)', tr: 'Müşterinin kendisinin bağladığı araçlar (onun talimatıyla)' },
    verbis: ['Kimlik', 'İletişim', 'Müşteri işlem'],
  },
  {
    id: 'trialLeads',
    role: 'controller',
    subjects: { en: 'People who request a trial', tr: 'Deneme talep eden kişiler' },
    data: { en: 'Name, work e-mail, job title, company, country, company size, answers to the form, the verification code time', tr: 'Ad, iş e-postası, unvan, şirket, ülke, şirket büyüklüğü, formdaki yanıtlar, doğrulama kodu zamanı' },
    purpose: { en: 'Assessing the trial request, contacting the person, opening the trial', tr: 'Deneme talebinin değerlendirilmesi, kişiyle iletişim, denemenin açılması' },
    basis: {
      tr: { tr: 'KVKK m. 5/2-c (sözleşmenin kurulması) ve m. 5/2-f (meşru menfaat)', en: 'KVKK art. 5/2-c (setting up a contract) and 5/2-f (legitimate interest)' },
      eu: 'Art. 6(1)(f) (legitimate interest in answering business enquiries)',
      gulf: 'UAE: consent (art. 4); Saudi / Qatar: consent by default; Egypt not offered',
      other: 'KR: contract steps + separate transfer consent; TW: notice + consent; IL: implied consent; JP/HK/SG: notice',
    },
    retention: { en: '12 months from the request if no trial starts; otherwise as account data', tr: 'Deneme başlamazsa talepten itibaren 12 ay; başlarsa hesap verisi gibi' },
    processors: ['cloudflare', 'supabase', 'googleWorkspace'],
    verbis: ['Kimlik', 'İletişim', 'Mesleki deneyim'],
  },
  {
    id: 'consentRecords',
    role: 'controller',
    subjects: { en: 'Visitors, users, trial applicants', tr: 'Ziyaretçiler, kullanıcılar, deneme başvuranları' },
    data: { en: 'Each choice: text version and hash, time, country, language, anonymous consent id (e-mail for marketing permissions)', tr: 'Her tercih: metin sürümü ve özeti, zaman, ülke, dil, anonim onay kimliği (pazarlama izinlerinde e-posta)' },
    purpose: { en: 'Proving consents and permissions; honouring withdrawals', tr: 'Rıza ve izinlerin ispatı; geri alınanlara uyulması' },
    basis: { tr: { tr: 'KVKK m. 5/2-ç (hukuki yükümlülük; Ticari İletişim Yönetmeliği m. 7(10), 13)', en: 'KVKK art. 5/2-ç (legal obligation; Commercial Communication Regulation arts. 7(10), 13)' }, eu: 'Art. 6(1)(c) with art. 7(1)', gulf: 'Proof duty (UAE art. 6)', other: 'Proof duty (TW art. 7; KR art. 22)' },
    retention: { en: '3 years after the permission ends; cookie choices 3 years', tr: 'İzin sona erdikten sonra 3 yıl; çerez tercihleri 3 yıl' },
    processors: ['cloudflare', 'supabase'],
    verbis: ['Pazarlama', 'İşlem güvenliği'],
  },
  {
    id: 'contracts',
    role: 'controller',
    subjects: { en: 'Administrators who accept the terms', tr: 'Koşulları kabul eden yöneticiler' },
    data: { en: 'Name, e-mail, role, company and tax number, document version and hash, time, country, browser', tr: 'Ad, e-posta, rol, şirket ve vergi numarası, belge sürümü ve özeti, zaman, ülke, tarayıcı' },
    purpose: { en: 'Proof of the contract (click-accept evidence)', tr: 'Sözleşmenin ispatı (tıklayarak kabul kaydı)' },
    basis: { tr: { tr: 'KVKK m. 5/2-c ve m. 5/2-e (bir hakkın tesisi, kullanılması veya korunması)', en: 'KVKK art. 5/2-c and 5/2-e (establishing or defending a right)' }, eu: 'Art. 6(1)(b) and (f)', gulf: 'Contract', other: 'Contract' },
    retention: { en: 'The contract’s life plus 10 years (limitation period)', tr: 'Sözleşme süresi artı 10 yıl (zamanaşımı)' },
    processors: ['cloudflare', 'supabase', 'googleWorkspace'],
    verbis: ['Kimlik', 'İletişim', 'Hukuki işlem'],
  },
  {
    id: 'billing',
    role: 'controller',
    subjects: { en: 'Billing contacts of paying companies', tr: 'Ödeyen şirketlerin fatura yetkilileri' },
    data: { en: 'Company, billing contact, plan, invoices (no card numbers: Paddle holds them)', tr: 'Şirket, fatura yetkilisi, plan, faturalar (kart numarası yok: Paddle tutar)' },
    purpose: { en: 'Billing and accounting', tr: 'Faturalama ve muhasebe' },
    basis: { tr: { tr: 'KVKK m. 5/2-c ve m. 5/2-ç (VUK, TTK)', en: 'KVKK art. 5/2-c and 5/2-ç (tax and commercial codes)' }, eu: 'Art. 6(1)(b) and (c)', gulf: 'Contract and legal obligation', other: 'Contract and legal obligation' },
    retention: { en: '10 years (Turkish Commercial Code art. 82)', tr: '10 yıl (TTK m. 82)' },
    processors: ['paddle', 'supabase'],
    verbis: ['Finans', 'Müşteri işlem'],
  },
  {
    id: 'support',
    role: 'controller',
    subjects: { en: 'Users who ask for help', tr: 'Yardım isteyen kullanıcılar' },
    data: { en: 'Requests, attachments; support session recordings only when the company has them on (off by default)', tr: 'Talepler, ekler; destek oturumu kayıtları yalnızca şirket açtıysa (varsayılan kapalı)' },
    purpose: { en: 'Answering support requests', tr: 'Destek taleplerinin yanıtlanması' },
    basis: { tr: { tr: 'KVKK m. 5/2-c ve m. 5/2-f', en: 'KVKK art. 5/2-c and 5/2-f' }, eu: 'Art. 6(1)(b) and (f)', gulf: 'Contract', other: 'Contract' },
    retention: { en: '24 months after the request is closed; recordings 7 days', tr: 'Talep kapandıktan sonra 24 ay; kayıtlar 7 gün' },
    processors: ['cloudflare', 'supabase', 'googleWorkspace', 'anthropic'],
    verbis: ['Kimlik', 'İletişim', 'Müşteri işlem', 'Görsel ve işitsel kayıtlar'],
  },
  {
    id: 'ai',
    role: 'processor',
    subjects: { en: 'Users who ask the AI assistant; people named in what is asked', tr: 'Yapay zekâ asistanına soran kullanıcılar; soruda adı geçen kişiler' },
    data: { en: 'The question and the minimum context needed for the answer', tr: 'Soru ve yanıt için gereken en az bağlam' },
    purpose: { en: 'Answering in the product (only when the company turns AI on); never used to train models', tr: 'Ürün içinde yanıt vermek (yalnızca şirket yapay zekâyı açarsa); model eğitimi için asla kullanılmaz' },
    basis: { tr: { tr: 'Müşteri adına (veri işleyen); yurt dışındaki yapay zekâ sağlayıcısına aktarım KVKK m. 9 kapsamındadır', en: "On the customer's behalf (processor); the transfer to the AI provider abroad falls under KVKK art. 9" }, eu: "Art. 28 — the customer's basis", gulf: 'Processor', other: 'Entrustment' },
    retention: { en: 'Conversation logs 30 days; at the provider [30 days — confirm], no training', tr: 'Konuşma kayıtları 30 gün; sağlayıcıda [30 gün — teyit], eğitim yok' },
    processors: ['anthropic', 'supabase'],
    verbis: ['Kimlik', 'Müşteri işlem'],
  },
  {
    id: 'website',
    role: 'controller',
    subjects: { en: 'Website visitors', tr: 'Web sitesi ziyaretçileri' },
    data: { en: 'Pages visited, language chosen; with consent only: analytics and advertising identifiers (see Cookies)', tr: 'Ziyaret edilen sayfalar, seçilen dil; yalnızca onayla: analiz ve reklam tanımlayıcıları (bkz. Çerezler)' },
    purpose: { en: 'Running the website; with consent, measuring it and our advertising', tr: 'Web sitesinin çalışması; onayla, sitenin ve reklamlarımızın ölçülmesi' },
    basis: { tr: { tr: 'Zorunlu çerezler için m. 5/2-f; analiz ve reklam için açık rıza (m. 5/1) ve yurt dışına aktarım için m. 9', en: 'Necessary: art. 5/2-f; analytics and ads: explicit consent (art. 5/1) and art. 9 for the transfer' }, eu: 'ePrivacy art. 5(3) consent for anything not necessary; Art. 6(1)(a)', gulf: 'Consent', other: 'Consent / notice (KR art. 30; JP external transmission)' },
    retention: { en: 'As listed on the Cookies page', tr: 'Çerezler sayfasında yazdığı gibi' },
    processors: ['cloudflare'],
    others: { en: 'Only with consent and when switched on: Google (Analytics), Meta, TikTok — as their own controllers', tr: 'Yalnızca onayla ve açıldığında: Google (Analytics), Meta, TikTok — kendi veri sorumluları olarak' },
    verbis: ['Pazarlama', 'İşlem güvenliği'],
  },
  {
    id: 'marketing',
    role: 'controller',
    subjects: { en: 'People who opted in to marketing e-mail', tr: 'Pazarlama e-postasına onay verenler' },
    data: { en: 'Name, e-mail, the permission record, the suppression list after a refusal', tr: 'Ad, e-posta, izin kaydı, ret sonrası gönderilmeyecekler listesi' },
    purpose: { en: 'Sending product news and offers by e-mail', tr: 'Ürün haberleri ve tekliflerin e-postayla gönderilmesi' },
    basis: { tr: { tr: 'Açık rıza (m. 5/1) ve 6563 s. Kanun kapsamında ticari ileti onayı (İYS)', en: 'Explicit consent (art. 5/1) and commercial-message approval under Law 6563 (İYS)' }, eu: 'Art. 6(1)(a) + ePrivacy art. 13', gulf: 'Consent', other: 'Consent (opt-in everywhere)' },
    retention: { en: 'Until the permission is withdrawn; the refusal is kept on the suppression list', tr: 'İzin geri alınana kadar; ret, gönderilmeyecekler listesinde tutulur' },
    processors: ['googleWorkspace', 'supabase'],
    verbis: ['Pazarlama', 'İletişim'],
  },
];

// ------------------------------------------------------------------ for the consent texts

const regionName = (code: string, locale: Locale) => (code.startsWith('[') ? code : (new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code));

/** {storage_countries}, {processors} and the rest, true on the day they are shown (only providers that handle trial leads). */
export function consentPlaceholders(locale: Locale): Placeholders {
  const leads = SUBPROCESSORS.filter((s) => s.leads);
  const codes = [...new Set(leads.flatMap((s) => s.countries))];
  const list = new Intl.ListFormat([locale], { type: 'conjunction' });
  return {
    company: COMPANY.legalName,
    company_country: COMPANY.country,
    contact: COMPANY.privacyEmail,
    storage_countries: list.format(codes.map((c) => regionName(c, locale))),
    processors: list.format(leads.map((s) => s.company)),
    retention: ACTIVITIES.find((a) => a.id === 'trialLeads')?.retention[locale === 'tr' ? 'tr' : 'en'] ?? '',
    eu_rep: '[EU representative — appointed at the first EU customer]',
    uk_rep: '[UK representative — appointed at the first UK customer]',
    cn_rep: '[not appointed]',
  };
}
