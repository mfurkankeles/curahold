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
  },
};
