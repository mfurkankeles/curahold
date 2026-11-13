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
  },
};
