// The registry of everything Curahold stores in a browser or loads from a third
// party: cookies, localStorage / sessionStorage keys, the service-worker cache
// and the third-party loaders (analytics, advertising pixels, checkout).
//
// It is the single source of the cookie policy. scripts/compliance/inventory.ts
// scans the code (site/, web/, the portal, docs assets, api cookies), compares
// what it finds with this list and fails when either side has something the
// other does not; then it writes docs/compliance/storage-inventory.json and the
// cookie policy page in all nine languages (docs/site/<lang>/legal-cookies.md).
//
// Rule for every change: a pull request that adds a cookie, a storage key or a
// script host adds its line here (with all nine purposes), or the test fails.
//
// LEGAL STATUS: draft wording, to be reviewed by a lawyer (taslak — avukat
// onayı gerekli). Durations in the provider rows are the providers' published
// defaults as known on 19 Nov 2026 and must be re-checked when a tag id is set.
import type { Locale } from '../i18n/core';

export type StorageType = 'cookie' | 'localStorage' | 'sessionStorage' | 'cache' | 'script';
/** necessary and preferences are set for the service the person asked for: no consent. The other two wait for opt-in. */
export type StorageCategory = 'necessary' | 'preferences' | 'analytics' | 'marketing';
export type Surface = 'site' | 'app' | 'portal' | 'docs' | 'demo' | 'console';
export type Duration =
  | { kind: 'signout'; n: number }
  | { kind: 'days' | 'hours' | 'minutes' | 'months' | 'vendor'; n: number }
  | { kind: 'tab' | 'cleared' | 'grant' | 'provider' };

export interface ThirdParty {
  company: string;
  /** ISO country codes where the provider says the data is handled. */
  countries: string[];
  /** The script host the loader fetches, checked against the code. */
  host: string;
  /** The provider's own cookies, named for the reader (not set by Curahold's code). */
  sets?: string;
}

export interface StorageItem {
  /** Exact key or cookie name; `*` matches any run of characters (app_records_*). */
  name: string;
  /** How the name is shown in the policy when the pattern is not readable on its own. */
  label?: string;
  type: StorageType;
  category: StorageCategory;
  purpose: PurposeId;
  duration: Duration;
  surfaces: Surface[];
  /** Holds an identifier that could single out a device or person (said openly in the policy). */
  identifier?: boolean;
  third?: ThirdParty;
  /** Only when a setting is on (an id configured, the A/B test enabled). */
  conditional?: 'ga4' | 'meta' | 'tiktok' | 'ab' | 'checkout';
  /**
   * Added by work on another branch that is not merged yet: the scan does not
   * fail when the code does not have it. Remove the flag once it is in the code.
   */
  planned?: string;
}

export type PurposeId =
  | 'session'
  | 'portalSession'
  | 'portalFlow'
  | 'support'
  | 'desk'
  | 'deskEmail'
  | 'device'
  | 'consent'
  | 'consentMirror'
  | 'prefs'
  | 'locale'
  | 'returnTo'
  | 'tabState'
  | 'trail'
  | 'swCache'
  | 'abVariant'
  | 'ga4'
  | 'meta'
  | 'tiktok'
  | 'paddle';

type Words = Record<Locale, string>;

/** What each item does, in plain words, in every language. */
export const PURPOSES: Record<PurposeId, Words> = {
  session: {
    en: 'Keeps you signed in on this device. HttpOnly: page scripts cannot read it.',
    tr: 'Bu cihazda oturumunuzu açık tutar. HttpOnly: sayfadaki betikler okuyamaz.',
    ar: 'يُبقيك مسجَّل الدخول على هذا الجهاز. HttpOnly: لا تستطيع نصوص الصفحة قراءته.',
    he: 'שומר על החיבור שלכם במכשיר הזה. HttpOnly: סקריפטים בדף אינם יכולים לקרוא אותו.',
    fa: 'شما را در این دستگاه وارد حساب نگه می‌دارد. HttpOnly: اسکریپت‌های صفحه نمی‌توانند آن را بخوانند.',
    'zh-Hans': '让您在此设备上保持登录状态。HttpOnly：页面脚本无法读取。',
    'zh-Hant': '讓您在此裝置上保持登入狀態。HttpOnly：頁面指令碼無法讀取。',
    ja: 'この端末でログイン状態を保ちます。HttpOnly のため、ページのスクリプトからは読み取れません。',
    ko: '이 기기에서 로그인 상태를 유지합니다. HttpOnly라서 페이지 스크립트가 읽을 수 없습니다.',
  },
  portalSession: {
    en: 'Keeps a customer signed in to the customer portal.',
    tr: 'Müşteri portalında müşterinin oturumunu açık tutar.',
    ar: 'يُبقي العميل مسجَّل الدخول في بوابة العملاء.',
    he: 'שומר על חיבור הלקוח לפורטל הלקוחות.',
    fa: 'مشتری را در پورتال مشتریان وارد حساب نگه می‌دارد.',
    'zh-Hans': '让客户在客户门户中保持登录状态。',
    'zh-Hant': '讓客戶在客戶入口網站中保持登入狀態。',
    ja: 'お客様が顧客ポータルにログインした状態を保ちます。',
    ko: '고객이 고객 포털에 로그인한 상태를 유지합니다.',
  },
  portalFlow: {
    en: 'Carries one step of the portal sign-in (protection against forged sign-ins).',
    tr: 'Portal girişinin bir adımını taşır (sahte giriş denemelerine karşı koruma).',
    ar: 'يحمل خطوة واحدة من تسجيل الدخول إلى البوابة (حماية من محاولات الدخول المزوّرة).',
    he: 'נושא שלב אחד בכניסה לפורטל (הגנה מפני כניסות מזויפות).',
    fa: 'یک مرحله از ورود به پورتال را نگه می‌دارد (محافظت در برابر ورود جعلی).',
    'zh-Hans': '保存门户登录过程中的一个步骤（防止伪造登录）。',
    'zh-Hant': '保存入口網站登入過程中的一個步驟（防止偽造登入）。',
    ja: 'ポータルのログイン手順の一部を保持します（なりすましログインの防止）。',
    ko: '포털 로그인의 한 단계를 담습니다(위조 로그인 방지).',
  },
  support: {
    en: 'Lets Curahold support into your company only for the time an administrator allowed; every action is logged.',
    tr: 'Curahold desteğinin şirketinize yalnızca bir yöneticinin izin verdiği süre boyunca girmesini sağlar; her işlem kaydedilir.',
    ar: 'يتيح لدعم Curahold الدخول إلى شركتك فقط طوال المدة التي سمح بها أحد المسؤولين؛ ويُسجَّل كل إجراء.',
    he: 'מאפשר לתמיכה של Curahold להיכנס לחברה שלכם רק לזמן שמנהל אישר; כל פעולה נרשמת.',
    fa: 'به پشتیبانی Curahold اجازه می‌دهد فقط در مدتی که یک مدیر اجازه داده وارد شرکت شما شود؛ هر کاری ثبت می‌شود.',
    'zh-Hans': '仅在管理员允许的时间内让 Curahold 支持人员进入您的公司；每项操作都会记录。',
    'zh-Hant': '僅在管理員允許的時間內讓 Curahold 支援人員進入您的公司；每項操作都會記錄。',
    ja: '管理者が許可した時間に限り、Curahold サポートが貴社の環境に入れるようにします。すべての操作は記録されます。',
    ko: '관리자가 허용한 시간 동안만 Curahold 지원팀이 회사 계정에 들어갈 수 있게 합니다. 모든 작업이 기록됩니다.',
  },
  desk: {
    en: "Keeps Curahold's own staff signed in to the internal console (not used for customers).",
    tr: "Curahold'un kendi çalışanlarının iç konsoldaki oturumunu açık tutar (müşteriler için kullanılmaz).",
    ar: 'يُبقي موظفي Curahold مسجَّلي الدخول في وحدة التحكم الداخلية (لا يُستخدم للعملاء).',
    he: 'שומר על חיבור הצוות של Curahold למסוף הפנימי (לא בשימוש עבור לקוחות).',
    fa: 'کارکنان خود Curahold را در کنسول داخلی وارد حساب نگه می‌دارد (برای مشتریان استفاده نمی‌شود).',
    'zh-Hans': '让 Curahold 自己的员工在内部控制台保持登录（不用于客户）。',
    'zh-Hant': '讓 Curahold 自己的員工在內部主控台保持登入（不用於客戶）。',
    ja: 'Curahold 社内スタッフの内部コンソールへのログインを保ちます（お客様には使われません）。',
    ko: 'Curahold 내부 직원의 내부 콘솔 로그인을 유지합니다(고객에게는 사용되지 않음).',
  },
  deskEmail: {
    en: 'Remembers which staff e-mail address was typed on the internal console sign-in form.',
    tr: 'İç konsolun giriş formuna yazılan çalışan e-posta adresini hatırlar.',
    ar: 'يتذكّر عنوان البريد الإلكتروني للموظف الذي كُتب في نموذج الدخول إلى وحدة التحكم الداخلية.',
    he: 'זוכר את כתובת הדוא״ל של איש הצוות שהוקלדה בטופס הכניסה למסוף הפנימי.',
    fa: 'نشانی ایمیل کارمند را که در فرم ورود کنسول داخلی نوشته شده به خاطر می‌سپارد.',
    'zh-Hans': '记住在内部控制台登录表单中输入的员工邮箱地址。',
    'zh-Hant': '記住在內部主控台登入表單中輸入的員工電子郵件地址。',
    ja: '内部コンソールのログイン画面に入力したスタッフのメールアドレスを記憶します。',
    ko: '내부 콘솔 로그인 양식에 입력한 직원 이메일 주소를 기억합니다.',
  },
  device: {
    en: 'A random identifier for this device, for the device limit on seats and alerts about new sign-ins. Never used for tracking or advertising.',
    tr: 'Bu cihaz için rastgele bir tanımlayıcı; koltuk başına cihaz sınırı ve yeni girişlerle ilgili uyarılar için. Takip ya da reklam için asla kullanılmaz.',
    ar: 'مُعرِّف عشوائي لهذا الجهاز، لحدّ الأجهزة لكل مقعد وللتنبيهات عن عمليات تسجيل الدخول الجديدة. لا يُستخدم أبدًا للتتبّع أو الإعلان.',
    he: 'מזהה אקראי של המכשיר, לצורך מגבלת המכשירים למושב ולהתראות על כניסות חדשות. לעולם אינו משמש למעקב או לפרסום.',
    fa: 'یک شناسهٔ تصادفی برای این دستگاه، برای سقف دستگاه در هر صندلی و هشدار ورودهای جدید. هرگز برای ردیابی یا تبلیغات استفاده نمی‌شود.',
    'zh-Hans': '此设备的随机标识符，用于每个席位的设备数量限制和新登录提醒。绝不用于跟踪或广告。',
    'zh-Hant': '此裝置的隨機識別碼，用於每個席位的裝置數量限制和新登入提醒。絕不用於追蹤或廣告。',
    ja: 'この端末のランダムな識別子です。シートごとの端末数の上限と、新しいログインの通知に使います。追跡や広告には一切使いません。',
    ko: '이 기기의 무작위 식별자로, 좌석당 기기 수 제한과 새 로그인 알림에 쓰입니다. 추적이나 광고에는 절대 쓰지 않습니다.',
  },
  consent: {
    en: 'Remembers your cookie choice, its date and the version of this policy you saw, so you are not asked again on every page.',
    tr: 'Çerez tercihinizi, tarihini ve gördüğünüz politika sürümünü hatırlar; böylece her sayfada yeniden sorulmaz.',
    ar: 'يتذكّر اختيارك بشأن ملفات تعريف الارتباط وتاريخه وإصدار هذه السياسة الذي رأيته، حتى لا نسألك مجددًا في كل صفحة.',
    he: 'זוכר את בחירתכם לגבי עוגיות, את התאריך ואת גרסת המדיניות שראיתם, כדי שלא נשאל שוב בכל דף.',
    fa: 'انتخاب شما دربارهٔ کوکی‌ها، تاریخ آن و نسخه‌ای از این سیاست را که دیده‌اید به خاطر می‌سپارد تا در هر صفحه دوباره پرسیده نشود.',
    'zh-Hans': '记住您的 Cookie 选择、选择日期以及您看到的政策版本，避免每个页面都再次询问。',
    'zh-Hant': '記住您的 Cookie 選擇、選擇日期以及您看到的政策版本，避免每個頁面都再次詢問。',
    ja: 'Cookie の選択内容、その日付、表示されたポリシーの版を記憶し、ページごとに再度尋ねないようにします。',
    ko: '쿠키 선택, 선택한 날짜, 본 정책의 버전을 기억해 페이지마다 다시 묻지 않습니다.',
  },
  consentMirror: {
    en: 'A copy of your analytics choice only ("yes" or "no"), so the website server can respect it before the page loads.',
    tr: 'Yalnızca analiz tercihinizin bir kopyası ("evet" ya da "hayır"); web sitesi sunucusu sayfa yüklenmeden önce buna uyabilsin diye.',
    ar: 'نسخة من اختيارك بشأن التحليلات فقط («نعم» أو «لا»)، حتى يحترمه خادم الموقع قبل تحميل الصفحة.',
    he: 'עותק של בחירתכם לגבי ניתוח נתונים בלבד ("כן" או "לא"), כדי ששרת האתר יכבד אותה עוד לפני טעינת הדף.',
    fa: 'فقط رونوشتی از انتخاب شما دربارهٔ تحلیل («بله» یا «نه»)، تا سرور وب‌سایت پیش از بارگذاری صفحه به آن احترام بگذارد.',
    'zh-Hans': '仅复制您的分析选择（“是”或“否”），以便网站服务器在页面加载前就能遵守。',
    'zh-Hant': '僅複製您的分析選擇（「是」或「否」），以便網站伺服器在頁面載入前就能遵守。',
    ja: '分析に関する選択（「はい」か「いいえ」）だけのコピーです。ページの読み込み前にウェブサーバーがその選択を守れるようにします。',
    ko: '분석 선택(“예” 또는 “아니요”)의 사본일 뿐이며, 페이지가 열리기 전에 웹사이트 서버가 이를 따를 수 있게 합니다.',
  },
  prefs: {
    en: 'Remembers how you set up the interface — theme, folded menu, chosen view, sort, filter, last board — after you choose it. Stays on your device; never used for tracking.',
    tr: 'Arayüzü nasıl ayarladığınızı — tema, daraltılmış menü, seçilen görünüm, sıralama, filtre, son pano — siz seçtikten sonra hatırlar. Cihazınızda kalır; takip için kullanılmaz.',
    ar: 'يتذكّر كيف ضبطت الواجهة — السمة، والقائمة المطوية، والعرض المختار، والترتيب، والتصفية، وآخر لوحة — بعد أن تختارها. يبقى على جهازك ولا يُستخدم للتتبّع.',
    he: 'זוכר איך הגדרתם את הממשק — ערכת נושא, תפריט מקופל, תצוגה, מיון, סינון, הלוח האחרון — אחרי שבחרתם. נשאר במכשיר שלכם; לא משמש למעקב.',
    fa: 'به خاطر می‌سپارد رابط را چگونه تنظیم کرده‌اید — پوسته، منوی جمع‌شده، نمای انتخابی، مرتب‌سازی، فیلتر، آخرین تابلو — پس از اینکه خودتان انتخاب کنید. روی دستگاه شما می‌ماند و برای ردیابی استفاده نمی‌شود.',
    'zh-Hans': '在您做出选择后，记住您对界面的设置——主题、折叠菜单、所选视图、排序、筛选、上次使用的看板。仅保存在您的设备上，绝不用于跟踪。',
    'zh-Hant': '在您做出選擇後，記住您對介面的設定——主題、摺疊選單、所選檢視、排序、篩選、上次使用的看板。僅儲存在您的裝置上，絕不用於追蹤。',
    ja: 'テーマ、折りたたんだメニュー、表示、並べ替え、フィルター、最後に開いたボードなど、ご自身で選んだ画面の設定を記憶します。端末内にのみ保存され、追跡には使いません。',
    ko: '테마, 접은 메뉴, 선택한 보기, 정렬, 필터, 마지막 보드 등 직접 고른 화면 설정을 기억합니다. 기기에만 남으며 추적에 쓰지 않습니다.',
  },
  locale: {
    en: 'Remembers the language you chose.',
    tr: 'Seçtiğiniz dili hatırlar.',
    ar: 'يتذكّر اللغة التي اخترتها.',
    he: 'זוכר את השפה שבחרתם.',
    fa: 'زبانی را که انتخاب کرده‌اید به خاطر می‌سپارد.',
    'zh-Hans': '记住您选择的语言。',
    'zh-Hant': '記住您選擇的語言。',
    ja: '選択した言語を記憶します。',
    ko: '선택한 언어를 기억합니다.',
  },
  returnTo: {
    en: 'Takes you back to the page you were on once you have signed in.',
    tr: 'Giriş yaptıktan sonra sizi bulunduğunuz sayfaya geri götürür.',
    ar: 'يعيدك إلى الصفحة التي كنت فيها بعد تسجيل الدخول.',
    he: 'מחזיר אתכם לדף שבו הייתם אחרי הכניסה.',
    fa: 'پس از ورود، شما را به صفحه‌ای که در آن بودید برمی‌گرداند.',
    'zh-Hans': '登录后带您回到之前所在的页面。',
    'zh-Hant': '登入後帶您回到之前所在的頁面。',
    ja: 'ログイン後、元のページに戻れるようにします。',
    ko: '로그인한 뒤 보던 페이지로 돌아가게 합니다.',
  },
  tabState: {
    en: 'Holds one step of what you are doing in this tab (finishing set-up, previewing as another role). Gone when the tab closes.',
    tr: 'Bu sekmede yaptığınız işin bir adımını tutar (kurulumu bitirme, başka bir rolle önizleme). Sekme kapanınca silinir.',
    ar: 'يحتفظ بخطوة واحدة مما تفعله في علامة التبويب هذه (إكمال الإعداد، المعاينة بدور آخر). يُحذف عند إغلاق علامة التبويب.',
    he: 'שומר שלב אחד במה שאתם עושים בכרטיסייה הזו (סיום ההגדרה, תצוגה מקדימה בתפקיד אחר). נמחק כשהכרטיסייה נסגרת.',
    fa: 'یک مرحله از کاری را که در این زبانه انجام می‌دهید نگه می‌دارد (پایان راه‌اندازی، پیش‌نمایش با نقشی دیگر). با بستن زبانه پاک می‌شود.',
    'zh-Hans': '保存您在此标签页中正在进行的一个步骤（完成设置、以其他角色预览）。关闭标签页后即删除。',
    'zh-Hant': '保存您在此分頁中正在進行的一個步驟（完成設定、以其他角色預覽）。關閉分頁後即刪除。',
    ja: 'このタブで行っている操作の一段階（初期設定の仕上げ、別のロールでのプレビュー）を保持します。タブを閉じると消えます。',
    ko: '이 탭에서 하던 작업의 한 단계(설정 마무리, 다른 역할로 미리 보기)를 보관합니다. 탭을 닫으면 사라집니다.',
  },
  trail: {
    en: 'Remembers the pages you went through in this tab, for the back links. Gone when the tab closes.',
    tr: 'Bu sekmede geçtiğiniz sayfaları geri bağlantıları için hatırlar. Sekme kapanınca silinir.',
    ar: 'يتذكّر الصفحات التي مررت بها في علامة التبويب هذه، لروابط الرجوع. يُحذف عند إغلاق علامة التبويب.',
    he: 'זוכר את הדפים שעברתם בכרטיסייה הזו, עבור קישורי החזרה. נמחק כשהכרטיסייה נסגרת.',
    fa: 'صفحه‌هایی را که در این زبانه از آن‌ها گذشته‌اید برای پیوندهای بازگشت به خاطر می‌سپارد. با بستن زبانه پاک می‌شود.',
    'zh-Hans': '记住您在此标签页中浏览过的页面，用于返回链接。关闭标签页后即删除。',
    'zh-Hant': '記住您在此分頁中瀏覽過的頁面，用於返回連結。關閉分頁後即刪除。',
    ja: '「戻る」リンクのため、このタブでたどったページを記憶します。タブを閉じると消えます。',
    ko: '뒤로 가기 링크를 위해 이 탭에서 거친 페이지를 기억합니다. 탭을 닫으면 사라집니다.',
  },
  swCache: {
    en: 'Keeps the app itself and recently opened screens on this device, so it opens fast and works offline. Cleared when you sign out.',
    tr: 'Uygulamanın kendisini ve son açılan ekranları bu cihazda tutar; böylece hızlı açılır ve çevrimdışı çalışır. Çıkış yapınca temizlenir.',
    ar: 'يحتفظ بالتطبيق نفسه وبالشاشات التي فُتحت مؤخرًا على هذا الجهاز، ليفتح بسرعة ويعمل دون اتصال. يُمسح عند تسجيل الخروج.',
    he: 'שומר את האפליקציה עצמה ואת המסכים שנפתחו לאחרונה במכשיר, כדי שתיפתח מהר ותעבוד גם בלי חיבור. נמחק ביציאה מהחשבון.',
    fa: 'خود برنامه و صفحه‌هایی را که اخیراً باز شده‌اند روی این دستگاه نگه می‌دارد تا سریع باز شود و آفلاین کار کند. با خروج از حساب پاک می‌شود.',
    'zh-Hans': '在此设备上保存应用本身和最近打开的页面，让它打开更快并可离线使用。退出登录时清除。',
    'zh-Hant': '在此裝置上保存應用程式本身和最近開啟的畫面，讓它開啟更快並可離線使用。登出時清除。',
    ja: 'アプリ本体と最近開いた画面をこの端末に保存し、すばやく開いてオフラインでも使えるようにします。ログアウトすると消去されます。',
    ko: '앱 자체와 최근에 연 화면을 이 기기에 보관해 빠르게 열리고 오프라인에서도 작동하게 합니다. 로그아웃하면 지워집니다.',
  },
  abVariant: {
    en: 'Keeps the version of the website you were shown in a test, so it does not change between visits. Set only after you accept analytics.',
    tr: 'Bir testte size gösterilen web sitesi sürümünü saklar; böylece ziyaretler arasında değişmez. Yalnızca analizi kabul ettikten sonra yazılır.',
    ar: 'يحفظ إصدار الموقع الذي عُرض عليك في اختبار، حتى لا يتغيّر بين الزيارات. لا يُضبط إلا بعد قبولك التحليلات.',
    he: 'שומר את גרסת האתר שהוצגה לכם בניסוי, כדי שלא תשתנה בין ביקורים. נשמר רק אחרי שאישרתם ניתוח נתונים.',
    fa: 'نسخه‌ای از وب‌سایت را که در یک آزمایش به شما نشان داده شده نگه می‌دارد تا بین بازدیدها تغییر نکند. فقط پس از پذیرفتن تحلیل تنظیم می‌شود.',
    'zh-Hans': '记住测试中向您展示的网站版本，使其在多次访问之间保持一致。仅在您同意分析后才会设置。',
    'zh-Hant': '記住測試中向您展示的網站版本，使其在多次造訪之間保持一致。僅在您同意分析後才會設定。',
    ja: 'テストで表示されたウェブサイトの版を保持し、訪問のたびに変わらないようにします。分析に同意した後にのみ設定されます。',
    ko: '테스트에서 보여 드린 웹사이트 버전을 유지해 방문할 때마다 바뀌지 않게 합니다. 분석에 동의한 뒤에만 설정됩니다.',
  },
  ga4: {
    en: 'Google Analytics 4: counts visits and how pages are used, with shortened IP addresses. Loaded only after you accept analytics, and only when an id is configured.',
    tr: 'Google Analytics 4: ziyaretleri ve sayfaların nasıl kullanıldığını, kısaltılmış IP adresleriyle sayar. Yalnızca analizi kabul ettikten sonra ve bir kimlik tanımlıysa yüklenir.',
    ar: 'Google Analytics 4: يحصي الزيارات وطريقة استخدام الصفحات، مع عناوين IP مختصرة. لا يُحمَّل إلا بعد قبولك التحليلات، وعند ضبط معرّف فقط.',
    he: 'Google Analytics 4: סופר ביקורים ואת אופן השימוש בדפים, עם כתובות IP מקוצרות. נטען רק אחרי שאישרתם ניתוח נתונים, ורק כשמוגדר מזהה.',
    fa: 'Google Analytics 4: بازدیدها و نحوهٔ استفاده از صفحه‌ها را با نشانی‌های IP کوتاه‌شده می‌شمارد. فقط پس از پذیرفتن تحلیل و فقط وقتی شناسه‌ای تنظیم شده باشد بارگذاری می‌شود.',
    'zh-Hans': 'Google Analytics 4：统计访问量和页面使用方式，IP 地址经过截短。仅在您同意分析且已配置 ID 时加载。',
    'zh-Hant': 'Google Analytics 4：統計造訪次數和頁面使用方式，IP 位址經過截短。僅在您同意分析且已設定 ID 時載入。',
    ja: 'Google Analytics 4：訪問数とページの使われ方を、短縮した IP アドレスで集計します。分析に同意し、かつ ID が設定されている場合にのみ読み込みます。',
    ko: 'Google Analytics 4: 방문 수와 페이지 사용 방식을 단축된 IP 주소로 집계합니다. 분석에 동의하고 ID가 설정된 경우에만 불러옵니다.',
  },
  meta: {
    en: 'Meta pixel: measures whether our ads on Meta platforms lead to visits and sign-ups, and can build audiences of site visitors for ads. Off by default; loaded only after you accept marketing.',
    tr: "Meta pikseli: Meta platformlarındaki reklamlarımızın ziyarete ve kayda dönüşüp dönüşmediğini ölçer; site ziyaretçilerinden reklam kitlesi oluşturabilir. Varsayılan olarak kapalıdır; yalnızca pazarlamayı kabul ettikten sonra yüklenir.",
    ar: 'بكسل Meta: يقيس ما إذا كانت إعلاناتنا على منصات Meta تؤدي إلى زيارات وتسجيلات، ويمكنه إنشاء جماهير إعلانية من زوار الموقع. مُعطَّل افتراضيًا؛ ولا يُحمَّل إلا بعد قبولك التسويق.',
    he: 'פיקסל Meta: מודד אם המודעות שלנו בפלטפורמות Meta מביאות לביקורים ולהרשמות, ויכול ליצור קהלים ממבקרי האתר לפרסום. כבוי כברירת מחדל; נטען רק אחרי שאישרתם שיווק.',
    fa: 'پیکسل Meta: می‌سنجد که آیا تبلیغات ما در پلتفرم‌های Meta به بازدید و ثبت‌نام می‌انجامد، و می‌تواند از بازدیدکنندگان سایت مخاطب تبلیغاتی بسازد. به‌طور پیش‌فرض خاموش است؛ فقط پس از پذیرفتن بازاریابی بارگذاری می‌شود.',
    'zh-Hans': 'Meta 像素：衡量我们在 Meta 平台上的广告是否带来访问和注册，并可用网站访客建立广告受众。默认关闭；仅在您同意营销后加载。',
    'zh-Hant': 'Meta 像素：衡量我們在 Meta 平台上的廣告是否帶來造訪和註冊，並可用網站訪客建立廣告受眾。預設關閉；僅在您同意行銷後載入。',
    ja: 'Meta ピクセル：Meta のプラットフォーム上の広告が訪問や登録につながったかを測定し、サイト訪問者から広告用のオーディエンスを作成することがあります。初期状態はオフで、マーケティングに同意した後にのみ読み込みます。',
    ko: 'Meta 픽셀: Meta 플랫폼의 광고가 방문과 가입으로 이어지는지 측정하고, 사이트 방문자로 광고 대상을 만들 수 있습니다. 기본값은 꺼짐이며 마케팅에 동의한 뒤에만 불러옵니다.',
  },
  tiktok: {
    en: 'TikTok pixel: measures whether our ads on TikTok lead to visits and sign-ups, and can build audiences of site visitors for ads. Off by default; loaded only after you accept marketing.',
    tr: "TikTok pikseli: TikTok'taki reklamlarımızın ziyarete ve kayda dönüşüp dönüşmediğini ölçer; site ziyaretçilerinden reklam kitlesi oluşturabilir. Varsayılan olarak kapalıdır; yalnızca pazarlamayı kabul ettikten sonra yüklenir.",
    ar: 'بكسل TikTok: يقيس ما إذا كانت إعلاناتنا على TikTok تؤدي إلى زيارات وتسجيلات، ويمكنه إنشاء جماهير إعلانية من زوار الموقع. مُعطَّل افتراضيًا؛ ولا يُحمَّل إلا بعد قبولك التسويق.',
    he: 'פיקסל TikTok: מודד אם המודעות שלנו ב-TikTok מביאות לביקורים ולהרשמות, ויכול ליצור קהלים ממבקרי האתר לפרסום. כבוי כברירת מחדל; נטען רק אחרי שאישרתם שיווק.',
    fa: 'پیکسل TikTok: می‌سنجد که آیا تبلیغات ما در TikTok به بازدید و ثبت‌نام می‌انجامد، و می‌تواند از بازدیدکنندگان سایت مخاطب تبلیغاتی بسازد. به‌طور پیش‌فرض خاموش است؛ فقط پس از پذیرفتن بازاریابی بارگذاری می‌شود.',
    'zh-Hans': 'TikTok 像素：衡量我们在 TikTok 上的广告是否带来访问和注册，并可用网站访客建立广告受众。默认关闭；仅在您同意营销后加载。',
    'zh-Hant': 'TikTok 像素：衡量我們在 TikTok 上的廣告是否帶來造訪和註冊，並可用網站訪客建立廣告受眾。預設關閉；僅在您同意行銷後載入。',
    ja: 'TikTok ピクセル：TikTok 上の広告が訪問や登録につながったかを測定し、サイト訪問者から広告用のオーディエンスを作成することがあります。初期状態はオフで、マーケティングに同意した後にのみ読み込みます。',
    ko: 'TikTok 픽셀: TikTok 광고가 방문과 가입으로 이어지는지 측정하고, 사이트 방문자로 광고 대상을 만들 수 있습니다. 기본값은 꺼짐이며 마케팅에 동의한 뒤에만 불러옵니다.',
  },
  paddle: {
    en: 'Paddle checkout: our reseller (merchant of record) processes the payment safely. Loaded only on the billing screen, where it sets its own cookies under its own policy.',
    tr: 'Paddle ödeme ekranı: satıcımız (merchant of record) ödemeyi güvenle işler. Yalnızca faturalandırma ekranında yüklenir; orada kendi politikasına göre kendi çerezlerini yazar.',
    ar: 'صفحة الدفع من Paddle: يعالج بائعنا (التاجر المسجَّل) الدفعة بأمان. لا تُحمَّل إلا في شاشة الفوترة، حيث تضبط ملفات تعريف الارتباط الخاصة بها وفق سياستها.',
    he: 'קופת Paddle: המשווק שלנו (merchant of record) מעבד את התשלום בבטחה. נטען רק במסך החיוב, ושם מגדיר עוגיות משלו לפי המדיניות שלו.',
    fa: 'صفحهٔ پرداخت Paddle: فروشندهٔ ما (merchant of record) پرداخت را به‌صورت امن پردازش می‌کند. فقط در صفحهٔ صورت‌حساب بارگذاری می‌شود و آنجا کوکی‌های خودش را طبق سیاست خودش تنظیم می‌کند.',
    'zh-Hans': 'Paddle 结账：我们的经销商（记录商户）安全地处理付款。仅在账单页面加载，并在那里按其自身政策设置自己的 Cookie。',
    'zh-Hant': 'Paddle 結帳：我們的經銷商（記錄商戶）安全地處理付款。僅在帳單畫面載入，並在那裡依其自身政策設定自己的 Cookie。',
    ja: 'Paddle 決済：当社の販売代理店（販売者）が支払いを安全に処理します。請求画面でのみ読み込まれ、そこで同社のポリシーに基づき独自の Cookie を設定します。',
    ko: 'Paddle 결제: 판매 대행사(판매 기록자)가 결제를 안전하게 처리합니다. 결제 화면에서만 불러오며, 그곳에서 자체 정책에 따라 자체 쿠키를 설정합니다.',
  },
};

const ALL_APP: Surface[] = ['app', 'demo'];

/** Every item. Order is the order of the policy table: necessary first, then preferences, analytics, marketing. */
export const STORAGE: StorageItem[] = [
  // ---- necessary: cookies
  { name: 'app_session', type: 'cookie', category: 'necessary', purpose: 'session', duration: { kind: 'signout', n: 30 }, surfaces: ['app'], identifier: true },
  { name: 'app_portal', type: 'cookie', category: 'necessary', purpose: 'portalSession', duration: { kind: 'signout', n: 30 }, surfaces: ['portal'], identifier: true },
  { name: 'app_portal_flow', type: 'cookie', category: 'necessary', purpose: 'portalFlow', duration: { kind: 'minutes', n: 10 }, surfaces: ['portal'] },
  { name: 'app_support', type: 'cookie', category: 'necessary', purpose: 'support', duration: { kind: 'grant' }, surfaces: ['app'], identifier: true },
  { name: 'desk_session', type: 'cookie', category: 'necessary', purpose: 'desk', duration: { kind: 'hours', n: 8 }, surfaces: ['console'], identifier: true },
  {
    name: 'cura_consent',
    type: 'cookie',
    category: 'necessary',
    purpose: 'consentMirror',
    duration: { kind: 'months', n: 12 },
    surfaces: ['site'],
    conditional: 'ab',
  },
  // ---- necessary: browser storage
  { name: 'curahold_consent_v1', type: 'localStorage', category: 'necessary', purpose: 'consent', duration: { kind: 'months', n: 12 }, surfaces: ['site', 'app'], identifier: true },
  { name: 'app_device', type: 'localStorage', category: 'necessary', purpose: 'device', duration: { kind: 'cleared' }, surfaces: ['app'], identifier: true },
  { name: 'app-after-login', type: 'localStorage', category: 'necessary', purpose: 'returnTo', duration: { kind: 'cleared' }, surfaces: ['app'] },
  { name: 'app-from-setup', type: 'sessionStorage', category: 'necessary', purpose: 'tabState', duration: { kind: 'tab' }, surfaces: ['app'] },
  { name: 'app-preview-as', type: 'sessionStorage', category: 'necessary', purpose: 'tabState', duration: { kind: 'tab' }, surfaces: ['app'] },
  { name: 'app_trail', type: 'sessionStorage', category: 'necessary', purpose: 'trail', duration: { kind: 'tab' }, surfaces: ALL_APP },
  { name: 'app-*-*', label: 'app-<n>-shell, app-<n>-data', type: 'cache', category: 'necessary', purpose: 'swCache', duration: { kind: 'signout', n: 30 }, surfaces: ['app'] },
  { name: 'desk_signed_as', type: 'localStorage', category: 'necessary', purpose: 'deskEmail', duration: { kind: 'cleared' }, surfaces: ['console'] },
  // ---- preferences, set by the person's own action (no consent: KVKK cookie guide; ePrivacy art. 5(3) "strictly necessary for a service explicitly requested")
  { name: 'app_locale', type: 'localStorage', category: 'preferences', purpose: 'locale', duration: { kind: 'cleared' }, surfaces: ALL_APP },
  { name: 'app_locale_hint', type: 'localStorage', category: 'preferences', purpose: 'locale', duration: { kind: 'cleared' }, surfaces: ALL_APP },
  { name: 'app_portal_locale', type: 'localStorage', category: 'preferences', purpose: 'locale', duration: { kind: 'cleared' }, surfaces: ['portal'] },
  { name: 'curahold_demo_lang', type: 'localStorage', category: 'preferences', purpose: 'locale', duration: { kind: 'cleared' }, surfaces: ['demo'] },
  { name: 'app_portal_welcomed', type: 'localStorage', category: 'preferences', purpose: 'prefs', duration: { kind: 'cleared' }, surfaces: ['portal'] },
  ...(
    [
      'app_theme',
      'app_nav_folded',
      'app_quick_board',
      'app_quick_keep',
      'app_accounts_view',
      'app_accounts_sort',
      'app_accounts_card_fields',
      'app_records_*',
      'app-contacts-view',
      'app_timeline_group',
      'app_tl_filter',
      'app_task_more',
      'app_whitespace',
      'app_cal_view',
      'app_cal_who',
      'app_cal_hidden',
      'app_dash_last',
      'app_news_seen',
      'app_live_ms',
      'app_live_channel',
    ] as const
  ).map(
    (name): StorageItem => ({ name, type: 'localStorage', category: 'preferences', purpose: 'prefs', duration: { kind: 'cleared' }, surfaces: ALL_APP }),
  ),
  // ---- analytics (consent)
  {
    name: 'Google Analytics 4',
    type: 'script',
    category: 'analytics',
    purpose: 'ga4',
    duration: { kind: 'vendor', n: 24 },
    surfaces: ['site', 'app'],
    identifier: true,
    conditional: 'ga4',
    third: { company: 'Google LLC / Google Ireland Ltd', countries: ['US', 'IE'], host: 'www.googletagmanager.com', sets: '_ga, _ga_<id>' },
  },
  {
    name: 'cura_ab',
    type: 'cookie',
    category: 'analytics',
    purpose: 'abVariant',
    duration: { kind: 'days', n: 30 },
    surfaces: ['site'],
    conditional: 'ab',
    planned: 'b6-sites A/B test (site/ab/worker.js)',
  },
  // ---- marketing (consent; also off by default through config: CURAHOLD_MARKETING_PIXELS / VITE_MARKETING_PIXELS)
  {
    name: 'Meta pixel',
    type: 'script',
    category: 'marketing',
    purpose: 'meta',
    duration: { kind: 'vendor', n: 3 },
    surfaces: ['site', 'app'],
    identifier: true,
    conditional: 'meta',
    third: { company: 'Meta Platforms Ireland Ltd / Meta Platforms, Inc.', countries: ['IE', 'US'], host: 'connect.facebook.net', sets: '_fbp' },
  },
  {
    name: 'TikTok pixel',
    type: 'script',
    category: 'marketing',
    purpose: 'tiktok',
    duration: { kind: 'vendor', n: 13 },
    surfaces: ['site', 'app'],
    identifier: true,
    conditional: 'tiktok',
    third: { company: 'TikTok Technology Ltd / TikTok Pte. Ltd.', countries: ['IE', 'SG', 'US'], host: 'analytics.tiktok.com', sets: '_ttp' },
  },
  // ---- checkout (strictly necessary for the payment the person asked for)
  {
    name: 'Paddle checkout',
    type: 'script',
    category: 'necessary',
    purpose: 'paddle',
    duration: { kind: 'provider' },
    surfaces: ['app'],
    conditional: 'checkout',
    third: { company: 'Paddle.com Market Ltd', countries: ['GB'], host: 'cdn.paddle.com' },
  },
];

export { COOKIE_POLICY_VERSION } from './version';

export const OPTIONAL_CATEGORIES: StorageCategory[] = ['analytics', 'marketing'];
export const needsConsent = (c: StorageCategory) => OPTIONAL_CATEGORIES.includes(c);

/** Glob match (only `*`), anchored. */
export function nameMatches(pattern: string, name: string): boolean {
  const re = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
  return re.test(name);
}
