// The data inventory (records of processing): what personal data Curahold
// handles, why, on which legal basis per region, where it is stored, how long
// it is kept and who receives it — and the sub-processors behind it.
//
// It is maintained here and nowhere else. scripts/compliance/legal-pack.ts turns
// it into: the sub-processor page (eleven languages), the tables inside the
// privacy notice and the KVKK aydınlatma metni (all eleven languages; past English
// and Turkish the words come from ./noticeRows/<lang>.ts, so a new activity here
// needs a row there too — the generator says which), the internal
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
  /**
   * A separate controller, not our processor (Paddle sells as merchant of record): KVKK art. 9 then needs the
   * controller-to-controller standard contract, not the processor one (VERBİS sheet; L1 audit).
   */
  ownController?: boolean;
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
      hi: "ऐप्लिकेशन की होस्टिंग, उसके आगे का नेटवर्क, फ़ाइल स्टोरेज (R2), आने वाले मेल की रूटिंग।",
      ms: "Pengehosan aplikasi, rangkaian di hadapannya, storan fail (R2), penghalaan mel masuk.",
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
      hi: "डेटाबेस (PostgreSQL), जिसमें अकाउंट, कंपनी का डेटा और बैकअप रखे जाते हैं।",
      ms: "Pangkalan data (PostgreSQL) yang menyimpan akaun, data syarikat dan sandaran.",
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
      hi: "हमारी अपनी कंपनी के मेलबॉक्स, और Workspace SMTP रिले के ज़रिए प्रोडक्ट के ईमेल (साइन-इन लिंक, रिमाइंडर, सारांश) भेजना।",
      ms: "Peti mel syarikat kami sendiri, dan penghantaran e-mel produk (pautan log masuk, peringatan, ringkasan) melalui geganti SMTP Workspace.",
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
    ownController: true,
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
      hi: "मर्चेंट ऑफ़ रिकॉर्ड के रूप में भुगतान, इनवॉइस और बिक्री कर (सिर्फ़ भुगतान करने वाली कंपनी का बिलिंग संपर्क)।",
      ms: "Pembayaran, invois dan cukai jualan sebagai merchant of record (hanya kenalan pengebilan syarikat yang membayar).",
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
      hi: "बिल्ट-इन AI असिस्टेंट (CuraAI, सहायता, सपोर्ट) के जवाब। सिर्फ़ ज़रूरी न्यूनतम जानकारी भेजी जाती है; इसका इस्तेमाल मॉडल ट्रेन करने में कभी नहीं होता।",
      ms: "Jawapan pembantu AI terbina dalam (CuraAI, bantuan, sokongan). Hanya maklumat minimum yang diperlukan dihantar; ia tidak pernah digunakan untuk melatih model.",
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
      hi: "एक अलग ईमेल भेजने वाली सेवा — आज इस्तेमाल नहीं होती; सिर्फ़ तब जब प्रोडक्ट के मेल की मात्रा Workspace रिले से ज़्यादा हो जाए (30 दिन पहले बताया जाएगा)।",
      ms: "Perkhidmatan penghantaran e-mel khusus — tidak digunakan hari ini; hanya jika jumlah mel produk melebihi geganti Workspace (dimaklumkan 30 hari lebih awal).",
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
      hi: "\"Google से साइन इन करें\" और Google Sheets — सिर्फ़ तब जब कंपनी इन्हें चालू करे।",
      ms: "\"Log masuk dengan Google\" dan Google Sheets — hanya apabila syarikat menghidupkannya.",
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
      hi: "\"Microsoft से साइन इन करें\" और Excel — सिर्फ़ तब जब कंपनी इन्हें चालू करे।",
      ms: "\"Log masuk dengan Microsoft\" dan Excel — hanya apabila syarikat menghidupkannya.",
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
  /**
   * How a recipient receives the data, where it is not simply our processor: Paddle, as merchant of record, is a
   * separate controller — the transfer to it needs the controller-to-controller contract (KVKK art. 9; L1 re-check).
   */
  transfers?: Partial<Record<ProcessorId, 'processor' | 'separate controller'>>;
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
    retention: { en: 'While the account is open; an erased person at once (anonymised record of work kept); the whole company 30 days after an administrator asks to delete it, with a deletion certificate (backups overwritten within 35 days)', tr: 'Hesap açık olduğu sürece; silinen kişi hemen (iş kaydı anonim kalır); şirketin tamamı bir yöneticinin silme talebinden 30 gün sonra, silme belgesiyle (yedekler 35 gün içinde üzerine yazılır)' },
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
    retention: { en: 'For the contract; exportable at any time; deleted 30 days after the company asks for deletion (files, connection keys and caches included), backups within 35 days; invoices kept for tax law', tr: 'Sözleşme süresince; her an dışa aktarılabilir; şirket silme isteğinden 30 gün sonra silinir (dosyalar, bağlantı anahtarları ve önbellekler dahil), yedekler 35 gün içinde; faturalar vergi mevzuatı gereği saklanır' },
    processors: ['cloudflare', 'supabase', 'googleWorkspace', 'anthropic'],
    others: {
      en: 'Tools the customer connects itself, on its instruction: CRMs (Salesforce, HubSpot, Dynamics, Pipedrive, Zoho, Bitrix24, Freshsales, Zendesk Sell), help desks (Zendesk, Freshdesk, Intercom, Jira Service Management, Front), accounting (Paraşüt, Odoo, Xero, QuickBooks, freee, Zoho Books), mailboxes (Gmail, Outlook), data (Segment, BigQuery, Snowflake, Google Sheets, Excel), chat (Slack, Teams, Google Chat), Jira, webhooks; AI assistants a user connects through Curahold’s connector (MCP), under the user’s or the company’s own agreement with that AI company',
      tr: 'Müşterinin kendi bağladığı araçlar, onun talimatıyla: CRM\'ler (Salesforce, HubSpot, Dynamics, Pipedrive, Zoho, Bitrix24, Freshsales, Zendesk Sell), destek masaları (Zendesk, Freshdesk, Intercom, Jira Service Management, Front), muhasebe (Paraşüt, Odoo, Xero, QuickBooks, freee, Zoho Books), posta kutuları (Gmail, Outlook), veri (Segment, BigQuery, Snowflake, Google Sheets, Excel), sohbet (Slack, Teams, Google Chat), Jira, webhook\'lar; kullanıcının Curahold bağlayıcısı (MCP) üzerinden bağladığı yapay zekâ asistanları (kullanıcının ya da şirketin o yapay zekâ şirketiyle kendi sözleşmesine göre)',
    },
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
      other: 'KR: contract steps + separate transfer consent; TW: notice + consent; IL: implied consent; JP/HK/SG: notice; IN: notice + consent (DPDP Act 2023 ss. 5–6), not for under-18s; MY: notice in Malay and English + consent (PDPA 2010 ss. 6–7)',
    },
    retention: { en: '12 months from the request if no trial starts; otherwise as account data', tr: 'Deneme başlamazsa talepten itibaren 12 ay; başlarsa hesap verisi gibi' },
    processors: ['cloudflare', 'supabase', 'googleWorkspace'],
    verbis: ['Kimlik', 'İletişim', 'Mesleki deneyim'],
  },
  {
    id: 'consentRecords',
    role: 'controller',
    subjects: { en: 'Visitors, users, trial applicants', tr: 'Ziyaretçiler, kullanıcılar, deneme başvuranları' },
    data: { en: 'Each choice: text version and hash, time, country, language, anonymous consent id (e-mail for marketing permissions); each answer to the AI assistant notice (person, time, notice version, language)', tr: 'Her tercih: metin sürümü ve özeti, zaman, ülke, dil, anonim onay kimliği (pazarlama izinlerinde e-posta); yapay zekâ asistanı bilgilendirmesine her cevap (kişi, zaman, bilgilendirme sürümü, dil)' },
    purpose: { en: 'Proving consents and permissions; honouring withdrawals', tr: 'Rıza ve izinlerin ispatı; geri alınanlara uyulması' },
    basis: { tr: { tr: 'KVKK m. 5/2-ç (hukuki yükümlülük; Ticari İletişim Yönetmeliği m. 7(10), 13)', en: 'KVKK art. 5/2-ç (legal obligation; Commercial Communication Regulation arts. 7(10), 13)' }, eu: 'Art. 6(1)(c) with art. 7(1)', gulf: 'Proof duty (UAE art. 6)', other: 'Proof duty (TW art. 7; KR art. 22)' },
    retention: { en: '3 years after the record, except a permission still in force (kept while relied on); cookie choices 3 years; records can only be anonymised, never changed', tr: 'Kayıttan sonra 3 yıl; yürürlükteki izin dayanıldığı sürece saklanır; çerez tercihleri 3 yıl; kayıtlar değiştirilemez, yalnızca anonimleştirilir' },
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
    transfers: { paddle: 'separate controller', supabase: 'processor' },
    verbis: ['Finans', 'Müşteri işlem'],
  },
  {
    id: 'support',
    role: 'controller',
    subjects: { en: 'Users who ask for help', tr: 'Yardım isteyen kullanıcılar' },
    data: { en: 'Requests, attachments; support session recordings only when the company has them on (off by default)', tr: 'Talepler, ekler; destek oturumu kayıtları yalnızca şirket açtıysa (varsayılan kapalı)' },
    purpose: { en: 'Answering support requests', tr: 'Destek taleplerinin yanıtlanması' },
    basis: { tr: { tr: 'KVKK m. 5/2-c ve m. 5/2-f', en: 'KVKK art. 5/2-c and 5/2-f' }, eu: 'Art. 6(1)(b) and (f)', gulf: 'Contract', other: 'Contract' },
    retention: { en: '24 months after the last change to the request; recordings 7 days', tr: 'Talebin son değişikliğinden sonra 24 ay; kayıtlar 7 gün' },
    processors: ['cloudflare', 'supabase', 'googleWorkspace', 'anthropic'],
    verbis: ['Kimlik', 'İletişim', 'Müşteri işlem', 'Görsel ve işitsel kayıtlar'],
  },
  {
    id: 'ai',
    role: 'processor',
    subjects: { en: 'Users who ask the AI assistant; people named in what is asked', tr: 'Yapay zekâ asistanına soran kullanıcılar; soruda adı geçen kişiler' },
    data: { en: 'The question and the minimum context needed for the answer', tr: 'Soru ve yanıt için gereken en az bağlam' },
    purpose: { en: 'Answering in the product (off until an administrator turns AI on, and only after the person accepts the notice); never used to train models', tr: 'Ürün içinde yanıt vermek (bir yönetici yapay zekâyı açana kadar kapalı ve yalnızca kişi bilgilendirmeyi kabul ettikten sonra); model eğitimi için asla kullanılmaz' },
    basis: { tr: { tr: 'Müşteri adına (veri işleyen); yurt dışındaki yapay zekâ sağlayıcısına aktarım KVKK m. 9 kapsamındadır', en: "On the customer's behalf (processor); the transfer to the AI provider abroad falls under KVKK art. 9" }, eu: "Art. 28 — the customer's basis", gulf: 'Processor', other: 'Entrustment' },
    // What api/src/assistant/store.ts keeps: the question only (assistant_log; RETENTION_CHOICES in core.ts), never the
    // answer; a docs-only answer is cached for CACHE_DAYS under a hash of the question (legal audit, 21 Nov 2026).
    retention: { en: 'Questions as the company chose: none, 7, 30 (default), 90 or 365 days; answers are not kept (an answer drawn only from the documentation may be reused for 7 days); erased with the person; at the provider [30 days — confirm], no training', tr: 'Sorular şirketin seçtiği süre kadar: hiç, 7, 30 (varsayılan), 90 ya da 365 gün; cevaplar saklanmaz (yalnızca belgelerden derlenen bir cevap 7 gün yeniden kullanılabilir); kişiyle birlikte silinir; sağlayıcıda [30 gün — teyit], eğitim yok' },
    processors: ['anthropic', 'supabase'],
    verbis: ['Kimlik', 'Müşteri işlem'],
  },
  {
    id: 'aiDrafts',
    role: 'processor',
    subjects: { en: 'Users who ask for a draft; customer contacts and colleagues named in the record it is drafted from', tr: 'Taslak isteyen kullanıcılar; taslağın hazırlandığı kayıtta adı geçen müşteri kişileri ve çalışma arkadaşları' },
    data: { en: 'The record the draft is made from (task, customer, meeting notes) and the draft text', tr: 'Taslağın hazırlandığı kayıt (görev, müşteri, toplantı notları) ve taslak metni' },
    purpose: {
      en: 'Drafting a reply, a follow-up or a summary for the person to read and change; nothing is saved or sent until they confirm it (off until an administrator turns AI on); never used to train models',
      tr: 'Kişinin okuyup değiştireceği bir yanıt, takip ya da özet taslağı hazırlamak; kişi onaylamadan hiçbir şey kaydedilmez ya da gönderilmez (bir yönetici yapay zekâyı açana kadar kapalı); model eğitimi için asla kullanılmaz',
    },
    basis: { tr: { tr: 'Müşteri adına (veri işleyen); yurt dışındaki yapay zekâ sağlayıcısına aktarım KVKK m. 9 kapsamındadır', en: "On the customer's behalf (processor); the transfer to the AI provider abroad falls under KVKK art. 9" }, eu: "Art. 28 — the customer's basis", gulf: 'Processor', other: 'Entrustment' },
    retention: {
      en: 'The assistant keeps no draft: a confirmed draft lives in the record it was saved to, under that record’s retention; at the provider [30 days — confirm], no training',
      tr: 'Asistan taslak saklamaz: onaylanan taslak kaydedildiği kayıtta, o kaydın saklama süresiyle durur; sağlayıcıda [30 gün — teyit], eğitim yok',
    },
    processors: ['anthropic', 'supabase'],
    verbis: ['Kimlik', 'İletişim', 'Müşteri işlem'],
  },
  {
    // The docs and site chat for visitors (api/src/routes/assist.ts assistPublicRoutes): Curahold decides why, so it is
    // a controller activity, unlike the in-app assistant (processor). Consent first (assistant/consent.ts); the
    // question is never logged (store.ts logs only with a company); the IP address lives only in the in-memory limiter.
    id: 'publicAsk',
    role: 'controller',
    subjects: { en: 'Visitors who ask the assistant on our website or documentation', tr: 'Web sitemizde ya da belgelerimizde asistana soru soran ziyaretçiler' },
    data: {
      en: 'The question and the last few messages of the chat, the language and the page; the visitor’s answer to the AI notice under a random id; the IP address, held briefly in memory to limit requests and not stored',
      tr: 'Soru ve sohbetin son birkaç mesajı, dil ve sayfa; ziyaretçinin yapay zekâ bilgilendirmesine verdiği cevap (rastgele bir kimlikle); istekleri sınırlamak için kısa süre bellekte tutulan ve saklanmayan IP adresi',
    },
    purpose: {
      en: 'Answering a visitor’s question on our website or documentation with AI (only after the visitor accepts the notice); never used to train models',
      tr: 'Web sitemizde ya da belgelerimizde bir ziyaretçinin sorusunu yapay zekâyla cevaplamak (yalnızca ziyaretçi bilgilendirmeyi kabul ettikten sonra); model eğitimi için asla kullanılmaz',
    },
    basis: {
      tr: { tr: 'KVKK m. 5/1 (açık rıza); istek sınırı için IP adresi m. 5/2-f; yurt dışındaki yapay zekâ sağlayıcısına aktarım m. 9', en: 'KVKK art. 5/1 (explicit consent); the IP address for limiting requests art. 5/2-f; transfer to the AI provider abroad art. 9' },
      eu: 'Art. 6(1)(a) GDPR (consent); limiting requests by IP address: Art. 6(1)(f) (security)',
      gulf: 'Consent',
      other: 'Consent after a notice, before the first question',
    },
    retention: {
      en: 'The question is not stored by Curahold; an answer drawn from the documentation may be reused for 7 days under a one-way fingerprint of the question; the answer to the notice is kept as a consent record; at the provider [30 days — confirm], no training',
      tr: 'Soru Curahold’da saklanmaz; belgelerden derlenen bir cevap, sorunun tek yönlü özeti altında 7 gün yeniden kullanılabilir; bilgilendirmeye verilen cevap rıza kaydı olarak saklanır; sağlayıcıda [30 gün — teyit], eğitim yok',
    },
    processors: ['cloudflare', 'supabase', 'anthropic'],
    verbis: ['İşlem güvenliği', 'Diğer'],
  },
  {
    id: 'humanCheck',
    role: 'controller',
    subjects: { en: 'Visitors who fill in a public form (trial request, sign-up, portal sign-in)', tr: 'Herkese açık bir formu dolduran ziyaretçiler (deneme talebi, kayıt, portal girişi)' },
    data: { en: 'Browser signals the check reads and its one-time token; the widget loads from Cloudflare, which sees the IP address; Curahold itself sends the address only where the operator switched that on (TURNSTILE_SEND_IP)', tr: 'Kontrolün okuduğu tarayıcı sinyalleri ve tek kullanımlık belirteci; bileşen Cloudflare\'den yüklenir ve IP adresini görür; Curahold adresi yalnızca işletmeci açtıysa kendisi gönderir (TURNSTILE_SEND_IP)' },
    purpose: { en: 'Keeping robots out of public forms (Cloudflare Turnstile, no puzzle, no tracking cookie)', tr: 'Robotları herkese açık formlardan uzak tutmak (Cloudflare Turnstile; bulmaca yok, izleme çerezi yok)' },
    basis: { tr: { tr: 'KVKK m. 5/2-f (meşru menfaat: güvenlik); yurt dışı aktarım m. 9', en: 'KVKK art. 5/2-f (legitimate interest: security); transfer abroad art. 9' }, eu: 'Art. 6(1)(f) (security)', gulf: 'Necessary for the service requested', other: 'Security measures (PIPA art. 29, APPI art. 23)' },
    retention: { en: 'Not stored by Curahold; at Cloudflare per its own terms', tr: 'Curahold saklamaz; Cloudflare\'de kendi koşullarına göre' },
    processors: ['cloudflare'],
    verbis: ['İşlem güvenliği'],
  },
  {
    id: 'sessionRecording',
    role: 'processor',
    subjects: { en: 'Users of a company that switched support recordings on', tr: 'Destek kayıtlarını açan şirketin kullanıcıları' },
    data: { en: 'The screen as the interface drew it, every field masked (nothing typed is recorded)', tr: 'Arayüzün çizdiği haliyle ekran; her alan maskelenir (yazılan hiçbir şey kaydedilmez)' },
    purpose: { en: 'Letting Curahold support see a fault the person reported (off by default)', tr: 'Curahold desteğinin, kişinin bildirdiği hatayı görmesi (varsayılan kapalı)' },
    basis: { tr: { tr: 'Müşteri adına (veri işleyen)', en: "On the customer's behalf (processor)" }, eu: "Art. 28 — the customer's basis", gulf: 'Processor', other: 'Entrustment' },
    retention: { en: '7 days', tr: '7 gün' },
    processors: ['cloudflare', 'supabase'],
    verbis: ['Görsel ve işitsel kayıtlar'],
  },
  {
    id: 'aiTeam',
    role: 'controller',
    subjects: { en: "Curahold's own operators; customers' contacts when an operator's task names them", tr: "Curahold'un kendi işletmecileri; işletmecinin görevinde adı geçen müşteri kişileri" },
    data: { en: "Tasks, notes and memory of Curahold's internal AI team (no customer workspace data is read)", tr: "Curahold'un iç yapay zekâ ekibinin görevleri, notları ve belleği (müşteri çalışma alanı verisi okunmaz)" },
    purpose: { en: 'Running Curahold itself; the AI team only proposes, a person approves every outside action', tr: "Curahold'un kendi işleri; yapay zekâ ekibi yalnızca önerir, her dış eylemi bir kişi onaylar" },
    basis: { tr: { tr: 'KVKK m. 5/2-f (meşru menfaat)', en: 'KVKK art. 5/2-f (legitimate interest)' }, eu: 'Art. 6(1)(f)', gulf: 'Legitimate interest where recognised; otherwise consent', other: 'Legitimate business purpose (notice)' },
    retention: { en: 'Until the task is done or the note is removed; mentions of an erased person are redacted', tr: 'Görev bitene ya da not silinene kadar; silinen kişinin geçtiği yerler karartılır' },
    processors: ['anthropic', 'supabase'],
    verbis: ['Kimlik', 'İletişim'],
  },
  {
    id: 'breachLog',
    role: 'controller',
    subjects: { en: 'People affected by a personal-data breach (as numbers and kinds of data, not names)', tr: 'Kişisel veri ihlalinden etkilenen kişiler (ad değil, sayı ve veri türü olarak)' },
    data: { en: 'Facts of the breach, its effects, what was done, who was notified and when', tr: 'İhlalin olguları, etkileri, alınan önlemler, kime ne zaman bildirildiği' },
    purpose: { en: 'The breach record the law requires (GDPR Art. 33(5); KVKK Board decision 2019/10; DPA §7)', tr: 'Yasanın istediği ihlal kaydı (GDPR md. 33(5); KVKK Kurul kararı 2019/10; DPA §7)' },
    basis: { tr: { tr: 'KVKK m. 5/2-ç (hukuki yükümlülük)', en: 'KVKK art. 5/2-ç (legal obligation)' }, eu: 'Art. 6(1)(c)', gulf: 'Legal obligation', other: 'Legal obligation' },
    retention: { en: '5 years after the breach is closed [lawyer to confirm]', tr: 'İhlal kapandıktan sonra 5 yıl [avukat teyit edecek]' },
    processors: ['supabase'],
    verbis: ['İşlem güvenliği'],
  },
  {
    // The customer's own log of requests people make about their data (0250). Kept past closing as the proof the
    // request was answered on time; the period (RETENTION_PRIVACY_REQUEST_DAYS) is an owner/lawyer question.
    id: 'privacyRequests',
    role: 'processor',
    subjects: { en: 'People who make a request about their personal data to a customer company', tr: 'Bir müşteri şirkete kişisel verileriyle ilgili talepte bulunan kişiler' },
    data: { en: 'Name, e-mail (optional), kind of request, the law, dates, status, a note, who logged and who closed it', tr: 'Ad, e-posta (isteğe bağlı), talep türü, ilgili yasa, tarihler, durum, not, talebi kaydeden ve kapatan kişi' },
    purpose: { en: 'Recording that each request was answered, and on time (the customer’s own log)', tr: 'Her talebin yanıtlandığının ve süresinde yanıtlandığının kaydı (müşterinin kendi kaydı)' },
    basis: { tr: { tr: 'Müşteri adına (veri işleyen)', en: "On the customer's behalf (processor)" }, eu: "Art. 28 — the customer's basis", gulf: 'Processor', other: 'Entrustment' },
    retention: {
      en: '3 years after the request is answered or refused [lawyer to confirm]; open requests until they are closed; with the company if it is deleted',
      tr: 'Talep yanıtlandıktan ya da reddedildikten sonra 3 yıl [avukat teyit edecek]; açık talepler kapanana kadar; şirket silinirse onunla birlikte',
    },
    processors: ['cloudflare', 'supabase'],
    verbis: ['Kimlik', 'İletişim', 'Hukuki işlem'],
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

/** The text in this language when the inventory has it (English and Turkish today), else English. */
const inLanguage = (text: Two | undefined, locale: Locale) => (text ? ((text as Partial<Record<Locale, string>>)[locale] ?? text.en) : '');

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
    retention: inLanguage(ACTIVITIES.find((a) => a.id === 'trialLeads')?.retention, locale),
    eu_rep: '[EU representative — appointed at the first EU customer]',
    uk_rep: '[UK representative — appointed at the first UK customer]',
    cn_rep: '[not appointed]',
  };
}
