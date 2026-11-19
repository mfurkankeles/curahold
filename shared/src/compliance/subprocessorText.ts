// The words of the generated sub-processor page (docs/site/<lang>/legal-subprocessors.md).
// The rows come from ./dataInventory.ts. LEGAL STATUS: draft (taslak — avukat onayı gerekli).
import type { Locale } from '../i18n/core';
import type { Subprocessor } from './dataInventory';

export interface SubPageText {
  title: string;
  summary: string;
  draft: string;
  intro: string;
  head: { company: string; purpose: string; where: string; when: string };
  when: Record<Subprocessor['when'], string>;
  notOurs: string;
  ai: string;
  recording: string;
}

export const SUB_PAGE: Record<Locale, SubPageText> = {
  en: {
    title: 'Sub-processors',
    summary: 'The companies that process personal data for Curahold, what for, where, and when.',
    draft: 'Draft — lawyer approval required.',
    intro: 'A new sub-processor is announced on this page and by e-mail to administrators at least 30 days before it starts; an administrator can object, and if we cannot meet the objection the company can end the affected service with a refund. Transfers outside the customer’s country use the safeguards in the Data processing agreement (EU standard contractual clauses, the UK addendum, the KVKK standard contract, and the rider for the customer’s country).',
    head: { company: 'Company', purpose: 'What for', where: 'Where the data is', when: 'When' },
    when: { always: 'Always', ai: 'Only when the company turns AI features on', option: 'Only when the company turns it on', paid: 'Paid plans', later: 'Not used today' },
    notOurs: '**Not our sub-processors:** the tools a company connects itself (its CRM, chat app, support tool, accounting system). Data moves to them on the company’s instruction, under its own agreement with them.',
    ai: '**AI:** customer data and questions are never used to train models, by us or by the model provider; the provider is bound to this in writing.',
    recording: '**Support session recording** adds no sub-processor and is off by default: when a company turns it on, the recordings stay in our own database for 7 days.',
  },
  tr: {
    title: 'Alt işleyenler',
    summary: 'Curahold için kişisel veri işleyen şirketler: ne için, nerede ve ne zaman.',
    draft: 'Taslak — avukat onayı gerekli.',
    intro: 'Yeni bir alt işleyen, başlamadan en az 30 gün önce bu sayfada ve yöneticilere e-postayla duyurulur; yönetici itiraz edebilir, itirazı karşılayamazsak şirket etkilenen hizmeti bedel iadesiyle sonlandırabilir. Müşterinin ülkesi dışına aktarımlar Veri işleme sözleşmesindeki güvencelerle yapılır (AB standart sözleşme hükümleri, Birleşik Krallık eki, KVKK standart sözleşmesi ve müşterinin ülkesine ait ek).',
    head: { company: 'Şirket', purpose: 'Ne için', where: 'Veri nerede', when: 'Ne zaman' },
    when: { always: 'Her zaman', ai: 'Yalnızca şirket yapay zekâ özelliklerini açarsa', option: 'Yalnızca şirket açarsa', paid: 'Ücretli planlar', later: 'Bugün kullanılmıyor' },
    notOurs: '**Alt işleyenimiz olmayanlar:** bir şirketin kendisinin bağladığı araçlar (CRM, sohbet uygulaması, destek aracı, muhasebe sistemi). Veri onlara şirketin talimatıyla, şirketin onlarla yaptığı kendi sözleşmesine göre gider.',
    ai: '**Yapay zekâ:** müşteri verisi ve sorular ne bizim ne de model sağlayıcısının model eğitiminde asla kullanılmaz; sağlayıcı bununla yazılı olarak bağlıdır.',
    recording: '**Destek oturumu kaydı** alt işleyen eklemez ve varsayılan olarak kapalıdır: bir şirket açarsa kayıtlar 7 gün boyunca kendi veritabanımızda kalır.',
  },
  ar: {
    title: 'المعالجون الفرعيون',
    summary: 'الشركات التي تعالج البيانات الشخصية لصالح Curahold: لأي غرض، وأين، ومتى.',
    draft: 'مسودة — تتطلب موافقة المحامي.',
    intro: 'نُعلن عن أي معالج فرعي جديد في هذه الصفحة وبالبريد الإلكتروني إلى المسؤولين قبل 30 يومًا على الأقل من بدء عمله؛ ويمكن للمسؤول الاعتراض، وإذا لم نستطع تلبية الاعتراض يمكن للشركة إنهاء الخدمة المتأثرة مع استرداد المبلغ. يتم النقل خارج بلد العميل وفق الضمانات الواردة في اتفاقية معالجة البيانات.',
    head: { company: 'الشركة', purpose: 'الغرض', where: 'مكان البيانات', when: 'متى' },
    when: { always: 'دائمًا', ai: 'فقط إذا فعّلت الشركة ميزات الذكاء الاصطناعي', option: 'فقط إذا فعّلتها الشركة', paid: 'الخطط المدفوعة', later: 'غير مستخدم اليوم' },
    notOurs: '**ليست من معالجينا الفرعيين:** الأدوات التي تربطها الشركة بنفسها (نظام CRM، تطبيق الدردشة، أداة الدعم، نظام المحاسبة). تنتقل البيانات إليها بتعليمات الشركة وبموجب اتفاقها الخاص معها.',
    ai: '**الذكاء الاصطناعي:** لا تُستخدم بيانات العملاء وأسئلتهم أبدًا لتدريب النماذج، لا من جانبنا ولا من جانب مزوّد النموذج؛ والمزوّد ملزم بذلك كتابيًا.',
    recording: '**تسجيل جلسات الدعم** لا يضيف معالجًا فرعيًا وهو مُعطّل افتراضيًا: إذا فعّلته الشركة تبقى التسجيلات في قاعدة بياناتنا لمدة 7 أيام.',
  },
  he: {
    title: 'מעבדי משנה',
    summary: 'החברות שמעבדות מידע אישי עבור Curahold: לשם מה, איפה ומתי.',
    draft: 'טיוטה — נדרש אישור עורך דין.',
    intro: 'מעבד משנה חדש מוכרז בדף הזה ובדוא״ל למנהלים לפחות 30 יום לפני שהוא מתחיל; מנהל יכול להתנגד, ואם לא נוכל להיענות להתנגדות החברה יכולה לסיים את השירות המושפע עם החזר. העברות אל מחוץ למדינת הלקוח נעשות לפי אמצעי ההגנה שבהסכם עיבוד הנתונים.',
    head: { company: 'חברה', purpose: 'לשם מה', where: 'איפה המידע', when: 'מתי' },
    when: { always: 'תמיד', ai: 'רק כשהחברה מפעילה את תכונות הבינה המלאכותית', option: 'רק כשהחברה מפעילה', paid: 'תוכניות בתשלום', later: 'לא בשימוש היום' },
    notOurs: '**אינם מעבדי המשנה שלנו:** הכלים שחברה מחברת בעצמה (CRM, אפליקציית צ׳אט, כלי תמיכה, מערכת הנהלת חשבונות). המידע עובר אליהם לפי הוראת החברה ובמסגרת ההסכם שלה איתם.',
    ai: '**בינה מלאכותית:** נתוני לקוחות ושאלות לעולם אינם משמשים לאימון מודלים — לא על ידינו ולא על ידי ספק המודל, שמחויב לכך בכתב.',
    recording: '**הקלטת שיחות תמיכה** אינה מוסיפה מעבד משנה וכבויה כברירת מחדל: כשחברה מפעילה אותה, ההקלטות נשמרות במסד הנתונים שלנו למשך 7 ימים.',
  },
  fa: {
    title: 'پردازشگران فرعی',
    summary: 'شرکت‌هایی که برای Curahold داده‌های شخصی پردازش می‌کنند: برای چه، کجا و چه زمانی.',
    draft: 'پیش‌نویس — به تأیید وکیل نیاز دارد.',
    intro: 'هر پردازشگر فرعی تازه دست‌کم ۳۰ روز پیش از شروع کار در این صفحه و با ایمیل به مدیران اعلام می‌شود؛ مدیر می‌تواند اعتراض کند و اگر نتوانیم اعتراض را برطرف کنیم، شرکت می‌تواند خدمت مربوط را با بازپرداخت پایان دهد. انتقال به بیرون از کشور مشتری با تدابیر حفاظتی قرارداد پردازش داده انجام می‌شود.',
    head: { company: 'شرکت', purpose: 'برای چه', where: 'محل داده', when: 'چه زمانی' },
    when: { always: 'همیشه', ai: 'فقط وقتی شرکت ویژگی‌های هوش مصنوعی را روشن کند', option: 'فقط وقتی شرکت روشنش کند', paid: 'طرح‌های پولی', later: 'امروز استفاده نمی‌شود' },
    notOurs: '**پردازشگر فرعی ما نیستند:** ابزارهایی که شرکت خودش وصل می‌کند (CRM، برنامهٔ گفتگو، ابزار پشتیبانی، سامانهٔ حسابداری). داده به دستور شرکت و طبق قرارداد خودش با آن‌ها به آن‌ها می‌رود.',
    ai: '**هوش مصنوعی:** داده‌ها و پرسش‌های مشتریان هرگز برای آموزش مدل‌ها به کار نمی‌رود، نه توسط ما و نه توسط ارائه‌دهندهٔ مدل؛ ارائه‌دهنده به‌صورت کتبی به این متعهد است.',
    recording: '**ضبط جلسهٔ پشتیبانی** پردازشگر فرعی اضافه نمی‌کند و به‌طور پیش‌فرض خاموش است: اگر شرکتی روشنش کند، ضبط‌ها ۷ روز در پایگاه دادهٔ خود ما می‌مانند.',
  },
  'zh-Hans': {
    title: '子处理者',
    summary: '为 Curahold 处理个人数据的公司：用途、地点和时机。',
    draft: '草稿——须经律师批准。',
    intro: '新的子处理者会在开始工作前至少 30 天在本页公布，并通过电子邮件通知管理员；管理员可以提出异议，如我们无法满足异议，公司可终止受影响的服务并获得退款。向客户所在国家/地区以外的传输采用数据处理协议中的保障措施。',
    head: { company: '公司', purpose: '用途', where: '数据所在地', when: '何时' },
    when: { always: '始终', ai: '仅在公司开启 AI 功能时', option: '仅在公司开启时', paid: '付费方案', later: '目前未使用' },
    notOurs: '**不属于我们的子处理者：**公司自行连接的工具（CRM、聊天应用、支持工具、会计系统）。数据按公司的指示、依据公司与其之间的协议传给它们。',
    ai: '**AI：**客户数据和提问绝不会被我们或模型提供方用于训练模型；提供方以书面形式受此约束。',
    recording: '**支持会话录制**不新增子处理者，且默认关闭：公司开启后，录制内容保存在我们自己的数据库中 7 天。',
  },
  'zh-Hant': {
    title: '子處理者',
    summary: '為 Curahold 處理個人資料的公司：用途、地點和時機。',
    draft: '草稿——須經律師核准。',
    intro: '新的子處理者會在開始工作前至少 30 天在本頁公布，並以電子郵件通知管理員；管理員可以提出異議，如我們無法滿足異議，公司可終止受影響的服務並獲得退款。向客戶所在國家/地區以外的傳輸採用資料處理協議中的保障措施。',
    head: { company: '公司', purpose: '用途', where: '資料所在地', when: '何時' },
    when: { always: '始終', ai: '僅在公司開啟 AI 功能時', option: '僅在公司開啟時', paid: '付費方案', later: '目前未使用' },
    notOurs: '**不屬於我們的子處理者：**公司自行連接的工具（CRM、聊天應用程式、支援工具、會計系統）。資料依公司的指示、根據公司與其之間的協議傳給它們。',
    ai: '**AI：**客戶資料和提問絕不會被我們或模型提供者用於訓練模型；提供者以書面形式受此約束。',
    recording: '**支援工作階段錄製**不新增子處理者，且預設關閉：公司開啟後，錄製內容保存在我們自己的資料庫中 7 天。',
  },
  ja: {
    title: '再委託先',
    summary: 'Curahold のために個人データを取り扱う会社と、その目的・場所・利用時期。',
    draft: '草案 — 弁護士の承認が必要です。',
    intro: '新しい再委託先は、利用開始の 30 日以上前にこのページと管理者へのメールでお知らせします。管理者は異議を述べることができ、当社が対応できない場合、企業は該当サービスを返金のうえ終了できます。お客様の国外への移転には、データ処理契約に定める保護措置を用います。',
    head: { company: '会社', purpose: '目的', where: 'データの所在地', when: '利用時期' },
    when: { always: '常時', ai: '企業が AI 機能をオンにした場合のみ', option: '企業がオンにした場合のみ', paid: '有料プラン', later: '現在は不使用' },
    notOurs: '**当社の再委託先ではないもの：**企業がご自身で接続するツール（CRM、チャットアプリ、サポートツール、会計システム）。データは企業の指示により、企業とそのツールとの契約に基づいて送られます。',
    ai: '**AI：**お客様のデータや質問が、当社またはモデル提供者によってモデルの学習に使われることはありません。提供者は書面でこれに拘束されています。',
    recording: '**サポートセッションの録画**は再委託先を増やさず、初期状態はオフです。企業がオンにした場合、録画は当社のデータベースに 7 日間保存されます。',
  },
  ko: {
    title: '수탁자(하위 처리자)',
    summary: 'Curahold를 위해 개인정보를 처리하는 회사: 목적, 장소, 사용 시점.',
    draft: '초안 — 변호사 승인이 필요합니다.',
    intro: '새 수탁자는 업무 시작 최소 30일 전에 이 페이지와 관리자 이메일로 알립니다. 관리자는 이의를 제기할 수 있으며, 저희가 이의를 해소하지 못하면 회사는 해당 서비스를 환불받고 종료할 수 있습니다. 고객 국가 밖으로의 이전에는 데이터 처리 계약의 보호 조치를 적용합니다.',
    head: { company: '회사', purpose: '목적', where: '데이터 위치', when: '사용 시점' },
    when: { always: '항상', ai: '회사가 AI 기능을 켠 경우에만', option: '회사가 켠 경우에만', paid: '유료 요금제', later: '현재 사용하지 않음' },
    notOurs: '**저희 수탁자가 아닌 것:** 회사가 직접 연결하는 도구(CRM, 채팅 앱, 지원 도구, 회계 시스템). 데이터는 회사의 지시에 따라, 회사와 해당 도구 사이의 계약에 따라 전달됩니다.',
    ai: '**AI:** 고객 데이터와 질문은 저희나 모델 제공업체가 모델 학습에 절대 사용하지 않으며, 제공업체는 이를 서면으로 약속합니다.',
    recording: '**지원 세션 녹화**는 수탁자를 늘리지 않으며 기본값은 꺼짐입니다. 회사가 켜면 녹화는 저희 데이터베이스에 7일간 보관됩니다.',
  },
};
