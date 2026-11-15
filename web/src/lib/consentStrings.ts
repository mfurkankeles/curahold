// The consent banner's words. Kept here, out of the shared dictionaries, so the
// Wave-4C work stays self-contained; English and Turkish are authored, and any
// other locale falls back to English until a native pass lands. The reported
// keys (consent.*) let these fold into the shared i18n later without a rewrite.
import type { Locale } from '../../../shared/src/i18n';

export interface ConsentStrings {
  title: string;
  body: string;
  acceptAll: string;
  rejectAll: string;
  manage: string;
  save: string;
  alwaysOn: string;
  manageTitle: string;
  necessaryTitle: string;
  necessaryBody: string;
  analyticsTitle: string;
  analyticsBody: string;
  marketingTitle: string;
  marketingBody: string;
  reopen: string;
  reopenAria: string;
  bannerAria: string;
  /** The quiet line on the profile page when nothing is measured. */
  noneNote: string;
}

export const CONSENT_STRINGS: Partial<Record<Locale, ConsentStrings>> = {
  en: {
    title: 'Your privacy, your choice',
    body: 'We use only what is needed to run Curahold. With your consent we also measure how the app is used and reach people who might like it. Nothing non-essential loads until you choose.',
    acceptAll: 'Accept all',
    rejectAll: 'Reject non-essential',
    manage: 'Manage choices',
    save: 'Save choices',
    alwaysOn: 'Always on',
    manageTitle: 'Privacy choices',
    necessaryTitle: 'Necessary',
    necessaryBody: 'Required to sign in, keep your session and remember this choice. These never track you and cannot be switched off.',
    analyticsTitle: 'Analytics',
    analyticsBody: 'Helps us understand which features are used, so we can improve them. Loads Google Analytics only with your consent.',
    marketingTitle: 'Marketing',
    marketingBody: 'Lets us measure and reach people who might find Curahold useful. Loads the Meta and TikTok pixels only with your consent.',
    reopen: 'Privacy choices',
    reopenAria: 'Open privacy and cookie choices',
    bannerAria: 'Privacy and cookie consent',
    noneNote: 'This installation measures nothing beyond what it needs to run, so there is nothing to choose.',
  },
  tr: {
    title: 'Gizliliğin, senin seçimin',
    body: 'Yalnızca Curahold’u çalıştırmak için gerekeni kullanırız. İzninle uygulamanın nasıl kullanıldığını da ölçer ve ilgilenebilecek kişilere ulaşırız. Sen seçene kadar zorunlu olmayan hiçbir şey yüklenmez.',
    acceptAll: 'Tümünü kabul et',
    rejectAll: 'Zorunlu olmayanları reddet',
    manage: 'Tercihleri yönet',
    save: 'Tercihleri kaydet',
    alwaysOn: 'Her zaman açık',
    manageTitle: 'Gizlilik tercihleri',
    necessaryTitle: 'Zorunlu',
    necessaryBody: 'Giriş yapmak, oturumunu sürdürmek ve bu seçimi hatırlamak için gereklidir. Seni izlemez ve kapatılamaz.',
    analyticsTitle: 'Analitik',
    analyticsBody: 'Hangi özelliklerin kullanıldığını anlamamıza ve onları iyileştirmemize yardımcı olur. Google Analytics yalnızca izninle yüklenir.',
    marketingTitle: 'Pazarlama',
    marketingBody: 'Curahold’u faydalı bulabilecek kişileri ölçmemizi ve onlara ulaşmamızı sağlar. Meta ve TikTok pikselleri yalnızca izninle yüklenir.',
    reopen: 'Gizlilik tercihleri',
    reopenAria: 'Gizlilik ve çerez tercihlerini aç',
    bannerAria: 'Gizlilik ve çerez onayı',
    noneNote: 'Bu kurulum çalışmak için gerekenin ötesinde hiçbir ölçüm yapmaz; seçilecek bir şey yok.',
  },
  ja: {
    title: 'プライバシーの設定はあなたが決めます',
    body: 'Curahold の動作に必要なものだけを使用しています。同意いただいた場合に限り、アプリの利用状況を計測し、Curahold に関心を持ちそうな方へお知らせを届けます。選択するまで、必須ではないものは一切読み込まれません。',
    acceptAll: 'すべて許可',
    rejectAll: '必須以外を拒否',
    manage: '設定を選ぶ',
    save: '設定を保存',
    alwaysOn: '常にオン',
    manageTitle: 'プライバシー設定',
    necessaryTitle: '必須',
    necessaryBody: 'ログイン、セッションの維持、この選択の記憶に必要です。トラッキングには使われず、オフにはできません。',
    analyticsTitle: '分析',
    analyticsBody: 'どの機能が使われているかを把握し、改善に役立てます。Google Analytics は同意いただいた場合にのみ読み込まれます。',
    marketingTitle: 'マーケティング',
    marketingBody: 'Curahold を役立ててくれそうな方への広告の効果測定と配信に使います。Meta と TikTok のピクセルは同意いただいた場合にのみ読み込まれます。',
    reopen: 'プライバシー設定',
    reopenAria: 'プライバシーと Cookie の設定を開く',
    bannerAria: 'プライバシーと Cookie の同意',
    noneNote: 'この環境では、動作に必要なもの以外は一切計測していないため、選択する項目はありません。',
  },
  ko: {
    title: '개인정보, 직접 선택하세요',
    body: 'Curahold를 운영하는 데 꼭 필요한 것만 사용합니다. 동의하시면 앱 사용 현황을 측정하고, Curahold에 관심을 가질 만한 분들께 알리는 데에도 활용합니다. 선택하기 전에는 필수가 아닌 것은 아무것도 불러오지 않습니다.',
    acceptAll: '모두 허용',
    rejectAll: '필수 외 거부',
    manage: '항목별 선택',
    save: '선택 저장',
    alwaysOn: '항상 사용',
    manageTitle: '개인정보 설정',
    necessaryTitle: '필수',
    necessaryBody: '로그인, 세션 유지, 이 선택을 기억하는 데 필요합니다. 사용자를 추적하지 않으며 끌 수 없습니다.',
    analyticsTitle: '분석',
    analyticsBody: '어떤 기능이 쓰이는지 파악해 개선하는 데 도움이 됩니다. Google Analytics는 동의한 경우에만 불러옵니다.',
    marketingTitle: '마케팅',
    marketingBody: 'Curahold가 유용할 만한 분들께 다가가고 그 효과를 측정하는 데 쓰입니다. Meta 및 TikTok 픽셀은 동의한 경우에만 불러옵니다.',
    reopen: '개인정보 설정',
    reopenAria: '개인정보 및 쿠키 설정 열기',
    bannerAria: '개인정보 및 쿠키 동의',
    noneNote: '이 설치 환경은 작동에 필요한 것 외에는 아무것도 측정하지 않으므로 선택할 항목이 없습니다.',
  },
  'zh-Hans': {
    title: '你的隐私，由你决定',
    body: '我们只使用运行 Curahold 所必需的内容。征得你的同意后，我们还会统计应用的使用情况，并向可能感兴趣的人推广 Curahold。在你做出选择之前，不会加载任何非必要内容。',
    acceptAll: '全部接受',
    rejectAll: '拒绝非必要项',
    manage: '管理选项',
    save: '保存选择',
    alwaysOn: '始终开启',
    manageTitle: '隐私选项',
    necessaryTitle: '必要',
    necessaryBody: '用于登录、保持会话以及记住你的这项选择。它们不会追踪你，也无法关闭。',
    analyticsTitle: '分析',
    analyticsBody: '帮助我们了解哪些功能被使用，以便加以改进。仅在你同意后才会加载 Google Analytics。',
    marketingTitle: '营销',
    marketingBody: '帮助我们触达可能觉得 Curahold 有用的人并衡量效果。仅在你同意后才会加载 Meta 和 TikTok 像素。',
    reopen: '隐私选项',
    reopenAria: '打开隐私与 Cookie 选项',
    bannerAria: '隐私与 Cookie 同意',
    noneNote: '此安装除运行所必需的内容外不做任何统计,因此无需选择。',
  },
  'zh-Hant': {
    title: '你的隱私，由你決定',
    body: '我們只使用執行 Curahold 所必需的內容。經你同意後，我們也會統計應用程式的使用情況，並向可能感興趣的人介紹 Curahold。在你做出選擇之前，不會載入任何非必要的內容。',
    acceptAll: '全部接受',
    rejectAll: '拒絕非必要項目',
    manage: '管理選項',
    save: '儲存選擇',
    alwaysOn: '一律開啟',
    manageTitle: '隱私權選項',
    necessaryTitle: '必要',
    necessaryBody: '用於登入、維持工作階段，以及記住你的這項選擇。這些不會追蹤你，也無法關閉。',
    analyticsTitle: '分析',
    analyticsBody: '協助我們了解哪些功能有人使用，以便持續改善。只有在你同意後才會載入 Google Analytics。',
    marketingTitle: '行銷',
    marketingBody: '協助我們接觸可能覺得 Curahold 實用的人，並衡量成效。只有在你同意後才會載入 Meta 與 TikTok 像素。',
    reopen: '隱私權選項',
    reopenAria: '開啟隱私權與 Cookie 選項',
    bannerAria: '隱私權與 Cookie 同意',
    noneNote: '此安裝除了運作所需之外不進行任何量測,因此沒有需要選擇的項目。',
  },
  ar: {
    title: 'خصوصيتك، واختيارك',
    body: 'لا نستخدم إلا ما يلزم لتشغيل Curahold. وبموافقتك نقيس أيضًا كيفية استخدام التطبيق ونصل إلى من قد يهمّهم. لا يُحمَّل أي شيء غير ضروري حتى تختار.',
    acceptAll: 'قبول الكل',
    rejectAll: 'رفض غير الضروري',
    manage: 'إدارة الخيارات',
    save: 'حفظ الخيارات',
    alwaysOn: 'مفعّل دائمًا',
    manageTitle: 'خيارات الخصوصية',
    necessaryTitle: 'ضروري',
    necessaryBody: 'لازم لتسجيل الدخول والحفاظ على جلستك وتذكّر هذا الاختيار. لا يتتبّعك أبدًا ولا يمكن إيقافه.',
    analyticsTitle: 'التحليلات',
    analyticsBody: 'يساعدنا على فهم الميزات المستخدمة لنحسّنها. لا يُحمَّل Google Analytics إلا بموافقتك.',
    marketingTitle: 'التسويق',
    marketingBody: 'يتيح لنا القياس والوصول إلى من قد يجدون Curahold مفيدًا. لا تُحمَّل بكسلات Meta وTikTok إلا بموافقتك.',
    reopen: 'خيارات الخصوصية',
    reopenAria: 'فتح خيارات الخصوصية وملفات تعريف الارتباط',
    bannerAria: 'الموافقة على الخصوصية وملفات تعريف الارتباط',
  },
  he: {
    title: 'הפרטיות שלך, הבחירה שלך',
    body: 'אנחנו משתמשים רק במה שנדרש כדי להפעיל את Curahold. בהסכמתך נמדוד גם איך משתמשים באפליקציה ונגיע לאנשים שהיא עשויה לעניין. שום דבר שאינו הכרחי לא נטען עד שתבחר.',
    acceptAll: 'אשר הכול',
    rejectAll: 'דחה את מה שאינו הכרחי',
    manage: 'נהל בחירות',
    save: 'שמור בחירות',
    alwaysOn: 'תמיד פעיל',
    manageTitle: 'הגדרות פרטיות',
    necessaryTitle: 'הכרחי',
    necessaryBody: 'נדרש כדי להתחבר, לשמור על ההתחברות שלך ולזכור את הבחירה הזו. לא עוקב אחריך אף פעם ואי אפשר לכבות אותו.',
    analyticsTitle: 'אנליטיקה',
    analyticsBody: 'עוזר לנו להבין באילו תכונות משתמשים כדי לשפר אותן. Google Analytics נטען רק בהסכמתך.',
    marketingTitle: 'שיווק',
    marketingBody: 'מאפשר לנו למדוד ולהגיע לאנשים ש-Curahold עשוי להועיל להם. הפיקסלים של Meta ו-TikTok נטענים רק בהסכמתך.',
    reopen: 'הגדרות פרטיות',
    reopenAria: 'פתח את הגדרות הפרטיות והעוגיות',
    bannerAria: 'הסכמה לפרטיות ולעוגיות',
  },
};
