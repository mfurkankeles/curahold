// The trial-request form's consent texts per country rule set — version
// 0.1-draft of 19 Nov 2026, taken from the legal research (orch
// out/research-legal.md §1.0 and §1.15). FOR THE LAWYER'S REVIEW; not final.
// (taslak — avukat onayı gerekli)
//
// Five building blocks cover every country:
//   N notice (never a box) · C consent to handle the request (required box) ·
//   T cross-border consent (required, separate box) · M marketing (optional,
//   unticked, e-mail only, never a condition) · A capacity line (not a consent).
// Türkiye splits marketing in two separate boxes: M1 the commercial-message
// approval (Law 6563, registered in İYS) and M2 the KVKK explicit consent.
//
// Versioning: a text id is `<rule set>.<block>.<language>@<version>`. A shown
// text is never edited in place — any change, even a comma, is a new version,
// and each submission stores the ids and SHA-256 hashes it was shown
// (consent_records in the trial package).
//
// Language rule: the text in the interface language when this file has it;
// otherwise the country-language master with English next to it.
//
// How the trial form uses it (b4-trial owns the UI): consentSetFor({ declared,
// ipCountry, locale }) → { offered, blocks[] } with every placeholder filled.
import type { Locale } from '../i18n/core';

export const CONSENT_TEXT_VERSION = '0.1-draft';

export type RuleSet = 'TR' | 'EU' | 'ROW' | 'AE' | 'SA' | 'EG' | 'QA' | 'IL' | 'JP' | 'KR' | 'CN' | 'TW' | 'HK' | 'SG';
export type BlockKind = 'notice' | 'consent' | 'transfer' | 'marketing' | 'capacity' | 'note';

export interface TextBlock {
  /** `<rule set>.<block>` — N, C, T, M, M1, M2, NC (notice + consent in one), R (residency note), A. */
  id: string;
  kind: BlockKind;
  /** A required box must be ticked to send the form; notices, notes and the capacity line are not boxes. */
  required: boolean;
  box: boolean;
  /** The country-language master (English is always present too). */
  master: Locale;
  texts: Partial<Record<Locale, string>>;
  /** The legal hook, for the lawyer and the console (never shown to the visitor). */
  basis: string;
  /** Shown only when this switch is on. */
  when?: keyof ConsentFlags;
}

/**
 * Launch switches (research §9.2). Defaults are the research's recommendations;
 * the owner changes them in config, each change being a new text version.
 */
export interface ConsentFlags {
  /** Egypt: not offered until a local lawyer confirms (research §0.2). */
  egyptOffered: boolean;
  /** Mainland China: not offered at launch (research §0.3). */
  chinaOffered: boolean;
  /** Saudi Arabia / Qatar: consent box to handle the request (on by default, research §9.2 #4). */
  saConsentBox: boolean;
  qaConsentBox: boolean;
  /** Türkiye: explicit consent for transfer abroad — valid only for occasional transfers, so off (KVKK art. 9/6-a). */
  trTransferConsent: boolean;
  /** Türkiye: the KVKK art. 9 standard contracts with every foreign provider are signed AND notified (owner task). */
  trStandardContractsNotified: boolean;
  /** Japan: optional cross-border consent box (lawyer's switch). */
  jpTransferConsent: boolean;
}

export const DEFAULT_FLAGS: ConsentFlags = {
  egyptOffered: false,
  chinaOffered: false,
  saConsentBox: true,
  qaConsentBox: true,
  trTransferConsent: false,
  trStandardContractsNotified: false,
  jpTransferConsent: false,
};

const EEA_UK = 'AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE IS LI NO GB CH'.split(' ');
const DIRECT: Record<string, RuleSet> = { TR: 'TR', AE: 'AE', SA: 'SA', EG: 'EG', QA: 'QA', IL: 'IL', JP: 'JP', KR: 'KR', CN: 'CN', TW: 'TW', HK: 'HK', SG: 'SG' };

export function ruleSetOf(country: string | null | undefined): RuleSet {
  const c = (country ?? '').toUpperCase();
  if (EEA_UK.includes(c)) return 'EU';
  return DIRECT[c] ?? 'ROW';
}

/** Countries never offered (sanctions; owner rule: Iran is excluded everywhere). */
export const NEVER_OFFERED = ['IR'];

// ------------------------------------------------------------------ the shared lines

const A: TextBlock = {
  id: 'ALL.A',
  kind: 'capacity',
  required: false,
  box: false,
  master: 'en',
  basis: 'Capacity and B2B context; not a consent (research §1.0 block A)',
  texts: {
    en: 'I am 18 or older and I am making this request on behalf of my company.',
    tr: '18 yaşından büyüğüm ve bu talebi şirketim adına yapıyorum.',
    ar: 'عمري 18 عامًا أو أكثر، وأقدّم هذا الطلب نيابةً عن شركتي.',
    he: 'אני בן/בת 18 ומעלה ומגיש/ה את הבקשה הזו בשם החברה שלי.',
    fa: '۱۸ سال یا بیشتر دارم و این درخواست را از طرف شرکتم ثبت می‌کنم.',
    'zh-Hans': '我已年满 18 周岁，并代表我的公司提出此申请。',
    'zh-Hant': '我已年滿 18 歲，並代表我的公司提出此申請。',
    ja: '私は 18 歳以上で、会社を代表してこの申し込みを行います。',
    ko: '만 18세 이상이며 회사를 대표하여 신청합니다.',
    hi: "मेरी उम्र 18 साल या उससे ज़्यादा है और मैं यह अनुरोध अपनी कंपनी की ओर से कर रहा/रही हूं।",
    ms: "Saya berumur 18 tahun atau lebih dan saya membuat permintaan ini bagi pihak syarikat saya.",
  },
};

/** Under a required box that is left empty. */
export const REQUIRED_LINE: Record<Locale, string> = {
  en: 'Without this we cannot send your request.',
  tr: 'Bu olmadan talebinizi gönderemeyiz.',
  ar: 'بدون ذلك لا يمكننا إرسال طلبك.',
  he: 'בלי זה לא נוכל לשלוח את הבקשה.',
  fa: 'بدون این نمی‌توانیم درخواست شما را ارسال کنیم.',
  'zh-Hans': '缺少此项，我们无法提交您的申请。',
  'zh-Hant': '缺少此項，我們無法送出您的申請。',
  ja: 'これがないと、お申し込みを送信できません。',
  ko: '이 항목이 없으면 신청을 보낼 수 없습니다.',
  hi: "इसके बिना हम आपका अनुरोध नहीं भेज सकते।",
  ms: "Tanpa ini kami tidak dapat menghantar permintaan anda.",
};

const ROW_N: Partial<Record<Locale, string>> = {
  en: '{company} ({company_country}) uses the details you enter to assess your trial request, contact you about it and set up your trial. The data is handled by our service providers in {storage_countries} under the safeguards described in our Privacy notice, where you will also find how long we keep it and your rights.',
  tr: '{company} ({company_country}), girdiğiniz bilgileri deneme talebinizi değerlendirmek, bu konuda sizinle iletişim kurmak ve denemenizi açmak için kullanır. Veriler, Gizlilik bildirimimizde anlatılan güvencelerle {storage_countries} bulunan hizmet sağlayıcılarımız tarafından işlenir; ne kadar saklandığını ve haklarınızı da orada bulabilirsiniz.',
  ar: 'تستخدم {company} ({company_country}) البيانات التي تُدخلها لتقييم طلب التجربة والتواصل معك بشأنه وإعداد تجربتك. يعالج مزوّدو خدماتنا هذه البيانات في {storage_countries} وفق الضمانات المبيّنة في إشعار الخصوصية، حيث تجد أيضًا مدة الاحتفاظ بها وحقوقك.',
  he: '{company} ({company_country}) משתמשת בפרטים שתזינו כדי לבחון את בקשת הניסיון, ליצור איתכם קשר בעניינה ולפתוח את הניסיון. ספקי השירות שלנו ב-{storage_countries} מעבדים את המידע לפי אמצעי ההגנה המתוארים במדיניות הפרטיות, שבה תמצאו גם כמה זמן הוא נשמר ואת זכויותיכם.',
  fa: '{company} ({company_country}) از اطلاعاتی که وارد می‌کنید برای بررسی درخواست آزمایشی، تماس با شما دربارهٔ آن و راه‌اندازی دورهٔ آزمایشی استفاده می‌کند. ارائه‌دهندگان خدمات ما در {storage_countries} این داده‌ها را با تدابیر حفاظتی شرح‌داده‌شده در اطلاعیهٔ حریم خصوصی پردازش می‌کنند؛ مدت نگهداری و حقوق شما نیز همان‌جا آمده است.',
  'zh-Hans': '{company}（{company_country}）使用您填写的信息来审核试用申请、就申请与您联系并开通试用。数据由我们位于 {storage_countries} 的服务提供方按隐私声明所述的保护措施处理；保存期限和您的权利也载于隐私声明。',
  'zh-Hant': '{company}（{company_country}）使用您填寫的資料來審核試用申請、就申請與您聯絡並開通試用。資料由我們位於 {storage_countries} 的服務提供者依隱私聲明所述的保護措施處理；保存期間和您的權利也載於隱私聲明。',
  ja: '{company}（{company_country}）は、ご入力いただいた情報を、トライアルのお申し込みの審査、お申し込みに関するご連絡、トライアルの準備のために利用します。データは、プライバシーポリシーに記載した保護措置のもと、{storage_countries} にある当社の委託先が取り扱います。保存期間とお客様の権利もプライバシーポリシーに記載しています。',
  ko: '{company}({company_country})는 입력하신 정보를 체험 신청 검토, 신청 관련 연락, 체험 준비에 사용합니다. 데이터는 개인정보 처리방침에 설명된 보호 조치에 따라 {storage_countries}에 있는 서비스 제공업체가 처리하며, 보관 기간과 권리도 그곳에서 확인할 수 있습니다.',
  hi: "{company} ({company_country}) आपकी दर्ज की गई जानकारी का इस्तेमाल आपके ट्रायल अनुरोध का आकलन करने, उसके बारे में आपसे संपर्क करने और आपका ट्रायल सेट अप करने के लिए करती है। यह डेटा {storage_countries} में हमारे सर्विस प्रोवाइडर हमारी गोपनीयता सूचना में बताए गए सुरक्षा उपायों के तहत संभालते हैं; वहीं आपको यह भी मिलेगा कि हम इसे कितने समय तक रखते हैं और आपके अधिकार क्या हैं।",
  ms: "{company} ({company_country}) menggunakan butiran yang anda masukkan untuk menilai permintaan percubaan anda, menghubungi anda mengenainya dan menyediakan percubaan anda. Data dikendalikan oleh penyedia perkhidmatan kami di {storage_countries} di bawah perlindungan yang diterangkan dalam Notis Privasi kami, di mana anda juga akan menemui tempoh kami menyimpannya dan hak anda.",
};

const ROW_M: Partial<Record<Locale, string>> = {
  en: 'Yes, send me product news and tips from Curahold by e-mail. I can unsubscribe at any time.',
  tr: "Evet, Curahold'dan ürün haberlerini ve ipuçlarını e-postayla almak istiyorum. Aboneliğimi istediğim zaman bırakabilirim.",
  ar: 'نعم، أرسلوا إليّ أخبار منتج Curahold ونصائحه عبر البريد الإلكتروني. يمكنني إلغاء الاشتراك في أي وقت.',
  he: 'כן, שלחו לי בדוא״ל חדשות מוצר וטיפים מ-Curahold. אפשר לבטל את המינוי בכל עת.',
  fa: 'بله، اخبار و نکته‌های محصول Curahold را با ایمیل برایم بفرستید. هر زمان بخواهم می‌توانم اشتراک را لغو کنم.',
  'zh-Hans': '是的，请通过电子邮件向我发送 Curahold 的产品资讯和使用技巧。我可以随时退订。',
  'zh-Hant': '是的，請透過電子郵件向我傳送 Curahold 的產品消息和使用技巧。我可以隨時取消訂閱。',
  ja: 'はい、Curahold の製品ニュースや活用のヒントをメールで受け取ります。配信はいつでも停止できます。',
  ko: '네, Curahold의 제품 소식과 활용 팁을 이메일로 받겠습니다. 언제든지 수신을 거부할 수 있습니다.',
  hi: "हां, मुझे Curahold से प्रोडक्ट की खबरें और सुझाव ईमेल से भेजें। मैं कभी भी अनसब्सक्राइब कर सकता/सकती हूं।",
  ms: "Ya, hantarkan saya berita produk dan petua daripada Curahold melalui e-mel. Saya boleh berhenti melanggan bila-bila masa.",
};

const nAr = 'تستخدم {company} ({company_country}) البيانات التي تُدخلها لتقييم طلب التجربة والتواصل معك بشأنه وإعداد حسابك التجريبي. تُخزَّن هذه البيانات وتُعالَج لدى مزوّدي خدماتنا في {storage_countries}. تجد مدة الاحتفاظ بالبيانات وحقوقك وطريقة ممارستها في إشعار الخصوصية.';
const nArEn = '{company} ({company_country}) uses the details you enter to assess your trial request, contact you about it and set up your trial account. The data is stored and processed with our service providers in {storage_countries}. How long we keep it, your rights and how to use them are in the Privacy notice.';
const gulfN = (r: RuleSet, basis: string): TextBlock => ({ id: `${r}.N`, kind: 'notice', required: false, box: false, master: 'ar', basis, texts: { ar: nAr, en: nArEn } });

// ------------------------------------------------------------------ the rule sets

export const RULE_SETS: Record<RuleSet, { blocks: TextBlock[]; marketing: TextBlock[]; manualReview?: boolean; offeredFlag?: keyof ConsentFlags }> = {
  TR: {
    blocks: [
      {
        id: 'TR.N',
        kind: 'notice',
        required: false,
        box: false,
        master: 'tr',
        when: 'trStandardContractsNotified',
        basis: 'KVKK art. 10 + Aydınlatma Tebliği; bases art. 5/2-c, 5/2-f; transfer art. 9 safeguards (TRUE ONLY once the standard contracts are signed and notified)',
        texts: {
          tr: "Kişisel verileriniz, veri sorumlusu {company} tarafından; deneme talebinizi değerlendirmek, bu talep hakkında sizinle iletişim kurmak ve deneme hesabınızı açmak amaçlarıyla, KVKK m. 5/2-c (sözleşmenin kurulması) ve m. 5/2-f (meşru menfaat) hukuki sebeplerine dayanılarak bu form aracılığıyla elektronik ortamda toplanır ve işlenir. Verileriniz, barındırma ve e-posta hizmeti aldığımız tedarikçilere, yurt dışındakiler bakımından KVKK m. 9'da öngörülen güvencelerle aktarılır. Ayrıntılar ve KVKK m. 11'deki haklarınız için Aydınlatma Metni'ni okuyabilirsiniz.",
          en: '{company}, as data controller, collects your personal data electronically through this form and processes it to assess your trial request, contact you about it and open your trial account, on the legal grounds of Article 5/2-c (setting up a contract) and Article 5/2-f (legitimate interest) of the KVKK. Your data is passed to the providers we use for hosting and e-mail; for those abroad, under the safeguards of Article 9 of the KVKK. For details and your rights under Article 11, read the Privacy notice (Aydınlatma Metni).',
        },
      },
      {
        // Until the standard contracts are notified, the notice says only what is true today.
        id: 'TR.N0',
        kind: 'notice',
        required: false,
        box: false,
        master: 'tr',
        basis: 'KVKK art. 10; the art. 9 sentence is withheld until the standard contracts are notified (research §0.1)',
        texts: {
          tr: "Kişisel verileriniz, veri sorumlusu {company} tarafından; deneme talebinizi değerlendirmek, bu talep hakkında sizinle iletişim kurmak ve deneme hesabınızı açmak amaçlarıyla, KVKK m. 5/2-c (sözleşmenin kurulması) ve m. 5/2-f (meşru menfaat) hukuki sebeplerine dayanılarak bu form aracılığıyla elektronik ortamda toplanır ve işlenir. Verileriniz, barındırma ve e-posta hizmeti aldığımız {storage_countries} bulunan tedarikçilere aktarılır; yurt dışına aktarımın dayanağı ve güvenceleri Aydınlatma Metni'nde açıklanır. KVKK m. 11'deki haklarınız da oradadır.",
          en: '{company}, as data controller, collects your personal data electronically through this form and processes it to assess your trial request, contact you about it and open your trial account, on the legal grounds of Article 5/2-c (setting up a contract) and Article 5/2-f (legitimate interest) of the KVKK. Your data is passed to the hosting and e-mail providers we use in {storage_countries}; the basis and safeguards of the transfer abroad are explained in the Privacy notice (Aydınlatma Metni), together with your rights under Article 11.',
        },
      },
      {
        id: 'TR.T',
        kind: 'transfer',
        required: true,
        box: true,
        master: 'tr',
        when: 'trTransferConsent',
        basis: 'KVKK art. 9/6-a — explicit consent only for occasional transfers; OFF by default',
        texts: {
          tr: "Kişisel verilerimin, bu talebin yürütülmesi için {storage_countries} bulunan hizmet sağlayıcılara aktarılmasına; bu ülkelerde Türkiye'dekine eşdeğer bir koruma bulunmayabileceği ve bundan doğabilecek riskler konusunda bilgilendirilmiş olarak açık rıza veriyorum.",
          en: 'Having been informed that the countries {storage_countries} may not offer protection equivalent to Türkiye’s and of the risks that may follow, I give my explicit consent to my personal data being transferred to the service providers there to handle this request.',
        },
      },
    ],
    marketing: [
      {
        id: 'TR.M1',
        kind: 'marketing',
        required: false,
        box: true,
        master: 'tr',
        basis: 'Law 6563 + Regulation art. 7: prior approval, unticked, not a condition; confirmation e-mail the same day; recorded in İYS within 3 business days; MERSİS no. in each message',
        texts: {
          tr: '{company} tarafından Curahold ürün ve hizmetlerine ilişkin tanıtım, kampanya ve bilgilendirme amaçlı ticari elektronik iletilerin e-posta adresime gönderilmesine onay veriyorum. Bu onayı dilediğim zaman, gerekçe göstermeden ve ücretsiz olarak geri alabilirim.',
          en: 'I approve {company} sending commercial electronic messages about Curahold products and services (promotions, campaigns, information) to my e-mail address. I can withdraw this approval at any time, without giving a reason and free of charge.',
        },
      },
      {
        id: 'TR.M2',
        kind: 'marketing',
        required: false,
        box: true,
        master: 'tr',
        basis: 'KVKK explicit consent for marketing; a separate box from M1 (Board Decision 2025/1072)',
        texts: {
          tr: 'Kimlik ve iletişim bilgilerimin, bana Curahold hakkında pazarlama iletişimi yapılması amacıyla işlenmesine açık rıza veriyorum.',
          en: 'I give my explicit consent to my identity and contact details being processed in order to send me marketing communications about Curahold.',
        },
      },
    ],
  },
  EU: {
    blocks: [
      {
        id: 'EU.N',
        kind: 'notice',
        required: false,
        box: false,
        master: 'en',
        basis: 'GDPR / UK GDPR art. 13; basis art. 6(1)(f) with a balancing test; no consent box (it would turn the notice into a consent)',
        texts: {
          en: '{company} ({company_country}) uses the details you enter to assess your trial request, contact you about it and set up your trial. Legal basis: our legitimate interest in answering business enquiries (Art. 6(1)(f) GDPR / UK GDPR). The data is handled by our service providers in {storage_countries} under the safeguards described in our Privacy notice, where you will also find how long we keep it and your rights, including the right to object. EU representative: {eu_rep}. UK representative: {uk_rep}.',
          tr: '{company} ({company_country}), girdiğiniz bilgileri deneme talebinizi değerlendirmek, bu konuda sizinle iletişim kurmak ve denemenizi açmak için kullanır. Hukuki dayanak: iş taleplerini yanıtlamaktaki meşru menfaatimiz (GDPR / UK GDPR m. 6(1)(f)). Veriler, Gizlilik bildirimimizde anlatılan güvencelerle {storage_countries} bulunan hizmet sağlayıcılarımız tarafından işlenir; ne kadar saklandığı ve itiraz hakkı dahil haklarınız da oradadır. AB temsilcisi: {eu_rep}. Birleşik Krallık temsilcisi: {uk_rep}.',
        },
      },
    ],
    marketing: [{ id: 'EU.M', kind: 'marketing', required: false, box: true, master: 'en', basis: 'ePrivacy art. 13 / PECR: opt-in, unticked', texts: ROW_M }],
  },
  ROW: {
    blocks: [{ id: 'ROW.N', kind: 'notice', required: false, box: false, master: 'en', basis: 'Generic notice (no country rule set)', texts: ROW_N }],
    marketing: [{ id: 'ROW.M', kind: 'marketing', required: false, box: true, master: 'en', basis: 'Opt-in everywhere', texts: ROW_M }],
  },
  AE: {
    blocks: [
      gulfN('AE', 'UAE PDPL (Decree-Law 45/2021); Executive Regulations not issued (9 Nov 2026)'),
      {
        id: 'AE.C',
        kind: 'consent',
        required: true,
        box: true,
        master: 'ar',
        basis: 'UAE PDPL art. 4 (consent is the rule; no legitimate-interest basis) + art. 23 (transfer with consent); express consent box',
        texts: {
          ar: 'أوافق على أن تعالج {company} بياناتي الشخصية المذكورة أعلاه للأغراض المبيّنة، وعلى تخزينها ومعالجتها خارج دولة الإمارات العربية المتحدة في {storage_countries}. يمكنني سحب موافقتي في أي وقت عبر {contact}، وعندها لن يكون بالإمكان متابعة طلبي.',
          en: 'I consent to {company} processing my personal data above for the purposes stated, and to its storage and processing outside the United Arab Emirates in {storage_countries}. I can withdraw my consent at any time at {contact}; my request can then no longer be handled.',
        },
      },
    ],
    marketing: [
      {
        id: 'AE.M',
        kind: 'marketing',
        required: false,
        box: true,
        master: 'ar',
        basis: 'UAE PDPL art. 17(1): right to object; consent in practice; e-mail only',
        texts: {
          ar: 'نعم، أرغب في تلقي أخبار المنتج والعروض من Curahold عبر البريد الإلكتروني، ويمكنني إلغاء الاشتراك في أي وقت.',
          en: 'Yes, I would like product news and offers from Curahold by e-mail. I can unsubscribe at any time.',
        },
      },
    ],
  },
  SA: {
    blocks: [
      gulfN('SA', 'Saudi PDPL art. 12; notices in Arabic first (draft of 6 Oct 2026)'),
      {
        id: 'SA.C',
        kind: 'consent',
        required: true,
        box: true,
        master: 'ar',
        when: 'saConsentBox',
        basis: 'Saudi PDPL: consent as the conservative basis (switchable to legitimate interest by the lawyer)',
        texts: {
          ar: 'أوافق على أن تعالج {company} بياناتي الشخصية المذكورة أعلاه للأغراض المبيّنة، وأعلم أنها تُخزَّن وتُعالَج خارج المملكة العربية السعودية في {storage_countries}. يمكنني سحب موافقتي في أي وقت عبر {contact}.',
          en: 'I consent to {company} processing my personal data above for the purposes stated, and I understand that it is stored and processed outside the Kingdom of Saudi Arabia in {storage_countries}. I can withdraw my consent at any time at {contact}.',
        },
      },
      {
        id: 'SA.R',
        kind: 'note',
        required: false,
        box: false,
        master: 'ar',
        basis: 'SDAIA draft amendments of 6 Oct 2026 (new art. 23: storage inside the Kingdom) — not law yet; research §0.5',
        texts: {
          ar: 'تُخزَّن بياناتك حاليًا خارج المملكة في {storage_countries}. إذا أصبح نظام نافذ يشترط تخزينها داخل المملكة، فسنبلغك بذلك ونعرض عليك خيار استضافة داخل المملكة أو الاستضافة الذاتية.',
          en: 'Your data is currently stored outside the Kingdom, in {storage_countries}. If a law in force comes to require storage inside the Kingdom, we will tell you and offer hosting inside the Kingdom or self-hosting.',
        },
      },
    ],
    marketing: [
      {
        id: 'SA.M',
        kind: 'marketing',
        required: false,
        box: true,
        master: 'ar',
        basis: 'Saudi PDPL Implementing Regulations arts. 28–29: consent before promotional messages',
        texts: {
          ar: 'أوافق على تلقي المواد الدعائية وأخبار المنتج من Curahold عبر البريد الإلكتروني، ويمكنني إيقافها في أي وقت.',
          en: 'I agree to receive promotional material and product news from Curahold by e-mail. I can stop it at any time.',
        },
      },
    ],
  },
  EG: {
    offeredFlag: 'egyptOffered',
    manualReview: true,
    blocks: [
      gulfN('EG', 'Egypt Law 151/2020 + Decree 816/2025; fully enforceable 1 Nov 2026'),
      {
        id: 'EG.C',
        kind: 'consent',
        required: true,
        box: true,
        master: 'ar',
        basis: 'Egypt PDPL: consent (safest basis)',
        texts: {
          ar: 'أوافق صراحةً على أن تجمع {company} بياناتي الشخصية المذكورة أعلاه وتعالجها للأغراض المبيّنة. يمكنني سحب موافقتي في أي وقت عبر {contact}.',
          en: 'I expressly consent to {company} collecting my personal data above and processing it for the purposes stated. I can withdraw my consent at any time at {contact}.',
        },
      },
      {
        id: 'EG.T',
        kind: 'transfer',
        required: true,
        box: true,
        master: 'ar',
        basis: 'Egypt PDPL: transfer licence + consent',
        texts: {
          ar: 'أوافق صراحةً على نقل بياناتي الشخصية إلى خارج جمهورية مصر العربية وتخزينها ومعالجتها في {storage_countries} لدى {company} ومزوّدي خدماتها للأغراض المبيّنة أعلاه.',
          en: 'I expressly consent to my personal data being transferred outside the Arab Republic of Egypt and stored and processed in {storage_countries} by {company} and its service providers for the purposes stated above.',
        },
      },
    ],
    marketing: [], // not offered until the e-marketing licence question is settled
  },
  QA: {
    blocks: [
      gulfN('QA', 'Qatar PDPPL (Law 13/2016) notice before processing'),
      {
        id: 'QA.C',
        kind: 'consent',
        required: true,
        box: true,
        master: 'ar',
        when: 'qaConsentBox',
        basis: 'Qatar PDPPL art. 4: consent unless necessary for a lawful purpose (conservative default on)',
        texts: {
          ar: 'أوافق على أن تعالج {company} بياناتي الشخصية المذكورة أعلاه للأغراض المبيّنة. يمكنني سحب موافقتي في أي وقت عبر {contact}.',
          en: 'I consent to {company} processing my personal data above for the purposes stated. I can withdraw my consent at any time at {contact}.',
        },
      },
    ],
    marketing: [
      {
        id: 'QA.M',
        kind: 'marketing',
        required: false,
        box: true,
        master: 'ar',
        basis: 'Qatar PDPPL art. 22: prior consent; sender, "marketing" label and stop address in every message',
        texts: {
          ar: 'أوافق على تلقي رسائل تسويقية عن Curahold عبر البريد الإلكتروني، ويمكنني إيقافها في أي وقت.',
          en: 'I agree to receive marketing messages about Curahold by e-mail. I can stop them at any time.',
        },
      },
    ],
  },
  IL: {
    blocks: [
      {
        id: 'IL.N',
        kind: 'notice',
        required: false,
        box: false,
        master: 'he',
        basis: 'Protection of Privacy Law s. 11 (full notice); implied consent by sending (s. 3)',
        texts: {
          he: 'המידע שתמסרו ישמש את {company} ({company_country}, {contact}) לבחינת בקשת הניסיון, ליצירת קשר איתכם בעניינה ולפתיחת חשבון הניסיון. אין חובה חוקית למסור את המידע, אך בלעדיו לא נוכל לטפל בבקשה. המידע יועבר לספקי האחסון והדוא״ל שלנו ב-{storage_countries} לצורך מתן השירות בלבד. עומדת לכם הזכות לעיין במידע שנשמר עליכם ולבקש לתקנו. פרטים נוספים במדיניות הפרטיות. שליחת הטופס מהווה הסכמה לשימוש במידע כמפורט כאן.',
          en: '{company} ({company_country}, {contact}) will use the information you provide to review your trial request, contact you about it and open your trial account. You have no legal duty to provide it, but without it we cannot handle your request. It will be passed to our hosting and e-mail providers in {storage_countries} only to provide the service. You have the right to inspect the information held about you and to ask for it to be corrected. More in the Privacy policy. Sending the form is your consent to this use.',
        },
      },
    ],
    marketing: [
      {
        id: 'IL.M',
        kind: 'marketing',
        required: false,
        box: true,
        master: 'he',
        basis: 'Communications Law s. 30A: prior explicit consent; "פרסומת" at the start of the subject',
        texts: {
          he: 'אני מסכים/ה לקבל מ-Curahold דברי פרסומת ועדכוני מוצר בדואר אלקטרוני. אפשר לבטל את ההסכמה בכל עת באמצעות קישור ההסרה שבכל הודעה.',
          en: 'I agree to receive advertising and product updates from Curahold by e-mail. I can withdraw this consent at any time through the unsubscribe link in every message.',
        },
      },
    ],
  },
  JP: {
    blocks: [
      {
        id: 'JP.N',
        kind: 'notice',
        required: false,
        box: false,
        master: 'ja',
        basis: 'APPI arts. 17, 21(2): purpose stated before collection; foreign countries named',
        texts: {
          ja: 'ご入力いただいた個人情報は、{company}（{company_country}）が、無料トライアルのお申し込みの審査、お申し込みに関するご連絡、およびトライアル環境の準備のために利用します。個人データは、当社および委託先が {storage_countries} に設置するサーバーで取り扱います。安全管理のために講じている措置、開示等のご請求の方法、その他の詳細はプライバシーポリシーをご確認ください。',
          en: '{company} ({company_country}) uses the personal information you enter to review your free-trial request, contact you about it and prepare your trial environment. Personal data is handled on servers that we and our contractors operate in {storage_countries}. For the security measures we take, how to make disclosure and other requests, and further details, see the Privacy policy.',
        },
      },
      {
        id: 'JP.T',
        kind: 'transfer',
        required: true,
        box: true,
        master: 'ja',
        when: 'jpTransferConsent',
        basis: 'APPI art. 28 (optional; equivalent-measures contracts are the default route)',
        texts: {
          ja: '上記の国における個人データの取扱いについて、プライバシーポリシーに記載された各国の個人情報保護制度に関する情報を確認のうえ、同意します。',
          en: 'Having read the information in the Privacy policy about the data-protection systems of the countries named above, I consent to my personal data being handled there.',
        },
      },
    ],
    marketing: [
      {
        id: 'JP.M',
        kind: 'marketing',
        required: false,
        box: true,
        master: 'ja',
        basis: 'Specified Electronic Mail Act: opt-in, records kept',
        texts: {
          ja: 'Curahold からの製品情報やお知らせ（広告・宣伝を含みます）をメールで受け取ることに同意します。配信はいつでも停止できます。',
          en: 'I agree to receive product information and announcements from Curahold (including advertising) by e-mail. I can stop them at any time.',
        },
      },
    ],
  },
  KR: {
    blocks: [
      {
        id: 'KR.N',
        kind: 'notice',
        required: false,
        box: false,
        master: 'ko',
        basis: 'PIPA art. 15(1)(4) steps for a contract; itemised notice',
        texts: {
          ko: '개인정보 수집·이용 안내\n· 수집 항목: 이름, 회사 이메일, 직함, 회사명, 국가 등 신청서에 입력한 정보\n· 수집·이용 목적: 무료 체험 신청 검토, 신청 관련 연락, 체험 계정 개설\n· 보유·이용 기간: {retention}\n· 처리 근거: 「개인정보 보호법」 제15조 제1항 제4호\n자세한 내용은 개인정보 처리방침에서 확인하실 수 있습니다.',
          hi: "व्यक्तिगत जानकारी के संग्रह और उपयोग की सूचना · आइटम: नाम, काम का ईमेल, पद, कंपनी, देश और फ़ॉर्म में दर्ज बाकी जानकारी · उद्देश्य: मुफ़्त ट्रायल अनुरोध की समीक्षा, उसके बारे में संपर्क, ट्रायल अकाउंट खोलना · रखने की अवधि: {retention} · आधार: Personal Information Protection Act, अनुच्छेद 15(1), मद 4 · विवरण गोपनीयता नीति में है।",
          ms: "Notis pengumpulan dan penggunaan maklumat peribadi · Item: nama, e-mel kerja, jawatan, syarikat, negara dan butiran lain yang dimasukkan dalam borang · Tujuan: menyemak permintaan percubaan percuma, menghubungi anda mengenainya, membuka akaun percubaan · Tempoh simpanan: {retention} · Asas: Personal Information Protection Act, Perkara 15(1), butiran 4 · Butirannya ada dalam Dasar privasi.",
          en: 'Notice of collection and use of personal information · Items: name, work e-mail, job title, company, country and the other details entered in the form · Purpose: reviewing the free-trial request, contacting you about it, opening the trial account · Retention: {retention} · Ground: Personal Information Protection Act, Article 15(1), item 4 · Details are in the Privacy policy.',
        },
      },
      {
        id: 'KR.T',
        kind: 'transfer',
        required: true,
        box: true,
        master: 'ko',
        basis: 'PIPA art. 28-8: separate consent to overseas transfer, itemised (or disclosure route by the lawyer)',
        texts: {
          ko: '[필수] 개인정보 국외 이전 동의\n· 이전받는 자: {company}({company_country}, {contact}) 및 수탁자 {processors}\n· 이전되는 국가: {storage_countries}\n· 이전 일시 및 방법: 신청서 제출 시 정보통신망을 통해 전송\n· 이전 항목: 신청서에 입력한 정보 전체\n· 이용 목적 및 보유·이용 기간: 위 안내와 같음\n· 동의를 거부할 수 있으나, 거부하시면 무료 체험을 신청하실 수 없습니다.\n위 내용을 확인하였으며 개인정보의 국외 이전에 동의합니다.',
          hi: "[ज़रूरी] विदेश में ट्रांसफ़र की सहमति · प्राप्तकर्ता: {company} ({company_country}, {contact}) और इसके ठेकेदार {processors} · देश: {storage_countries} · कब और कैसे: फ़ॉर्म जमा करने पर नेटवर्क से भेजा जाता है · आइटम: फ़ॉर्म में दर्ज सब कुछ · उद्देश्य और रखने की अवधि: ऊपर की सूचना के अनुसार · आप मना कर सकते हैं, लेकिन तब मुफ़्त ट्रायल का अनुरोध नहीं किया जा सकता। मैंने ऊपर पढ़ लिया है और अपनी व्यक्तिगत जानकारी के विदेश में ट्रांसफ़र के लिए सहमति देता/देती हूं।",
          ms: "[Wajib] Persetujuan pemindahan ke luar negara · Penerima: {company} ({company_country}, {contact}) dan kontraktornya {processors} · Negara: {storage_countries} · Bila dan bagaimana: dihantar melalui rangkaian apabila borang diserahkan · Item: semua yang dimasukkan dalam borang · Tujuan dan tempoh simpanan: seperti dalam notis di atas · Anda boleh menolak, tetapi percubaan percuma tidak boleh diminta. Saya telah membaca perkara di atas dan bersetuju dengan pemindahan maklumat peribadi saya ke luar negara.",
          en: '[Required] Consent to overseas transfer · Recipient: {company} ({company_country}, {contact}) and its contractors {processors} · Countries: {storage_countries} · When and how: sent over the network when the form is submitted · Items: everything entered in the form · Purpose and retention: as in the notice above · You may refuse, but then the free trial cannot be requested. I have read the above and consent to the overseas transfer of my personal information.',
        },
      },
    ],
    marketing: [
      {
        id: 'KR.M',
        kind: 'marketing',
        required: false,
        box: true,
        master: 'ko',
        basis: 'PIPA art. 22 + Network Act art. 50: separate optional consent; "(광고)" in the subject; re-confirm every 2 years',
        texts: {
          ko: '[선택] 광고성 정보 수신 동의\n· 목적: Curahold 제품 소식 및 혜택 안내 · 항목: 이름, 회사 이메일 · 보유 기간: 동의 철회 시까지\n· 동의하지 않아도 무료 체험 신청에는 영향이 없으며, 언제든지 수신을 거부할 수 있습니다.\n이메일로 광고성 정보를 받는 데 동의합니다.',
          hi: "[वैकल्पिक] विज्ञापन पाने की सहमति · उद्देश्य: Curahold प्रोडक्ट की खबरें और ऑफ़र · आइटम: नाम, काम का ईमेल · सहमति वापस लेने तक रखा जाता है · मना करने से ट्रायल अनुरोध पर कोई असर नहीं पड़ता, और आप कभी भी ऑप्ट आउट कर सकते हैं। मैं ईमेल से विज्ञापन पाने के लिए सहमत हूं।",
          ms: "[Pilihan] Persetujuan untuk menerima iklan · Tujuan: berita dan tawaran produk Curahold · Item: nama, e-mel kerja · Disimpan sehingga persetujuan ditarik balik · Menolak tidak menjejaskan permintaan percubaan, dan anda boleh menarik diri bila-bila masa. Saya bersetuju untuk menerima iklan melalui e-mel.",
          en: '[Optional] Consent to receive advertising · Purpose: Curahold product news and offers · Items: name, work e-mail · Kept until consent is withdrawn · Refusing does not affect the trial request, and you can opt out at any time. I agree to receive advertising by e-mail.',
        },
      },
    ],
  },
  CN: {
    offeredFlag: 'chinaOffered',
    manualReview: true,
    blocks: [
      {
        id: 'CN.NC',
        kind: 'consent',
        required: true,
        box: true,
        master: 'zh-Hans',
        basis: 'PIPL arts. 13, 17: notice + consent in one block; representative in China (art. 53)',
        texts: {
          'zh-Hans': '个人信息处理告知\n· 处理者：{company}（{company_country}），联系方式：{contact}；境内代表：{cn_rep}\n· 处理目的和方式：审核您的免费试用申请、就申请与您联系、开通试用账户\n· 个人信息种类：您在本表单中填写的姓名、工作邮箱、职务、公司名称、所在国家或地区等\n· 保存期限：{retention}\n· 您可通过上述联系方式行使查阅、复制、更正、删除、撤回同意等权利，详见《隐私政策》。\n我已阅读上述告知，并同意 {company} 按此处理我的个人信息。',
          en: 'Notice of personal information processing · Handler: {company} ({company_country}), contact {contact}; representative in China: {cn_rep} · Purpose and method: reviewing your free-trial request, contacting you about it, opening the trial account · Categories: name, work e-mail, job title, company, country or region and the other details entered in this form · Retention: {retention} · You can access, copy, correct, delete and withdraw consent through the contact above; see the Privacy policy. I have read this notice and consent to {company} processing my personal information accordingly.',
        },
      },
      {
        id: 'CN.T',
        kind: 'transfer',
        required: true,
        box: true,
        master: 'zh-Hans',
        basis: 'PIPL art. 39: separate consent for provision abroad',
        texts: {
          'zh-Hans': '我单独同意将上述个人信息提供至中华人民共和国境外。境外接收方：{company}（{company_country}）及其受托人 {processors}，所在地：{storage_countries}，联系方式：{contact}；处理目的、处理方式和个人信息种类同上；我可通过上述联系方式向境外接收方行使个人信息权利。',
          en: 'I separately consent to the personal information above being provided outside the People’s Republic of China. Overseas recipient: {company} ({company_country}) and its contractors {processors}, located in {storage_countries}, contact {contact}; purpose, method and categories as above; I can exercise my rights against the overseas recipient through that contact.',
        },
      },
    ],
    marketing: [], // hidden until the owner decides to enter the market
  },
  TW: {
    blocks: [
      {
        id: 'TW.NC',
        kind: 'consent',
        required: true,
        box: true,
        master: 'zh-Hant',
        basis: 'Taiwan PDPA art. 8 notice + consent as cheap proof (art. 7)',
        texts: {
          'zh-Hant': '個人資料蒐集告知事項（個人資料保護法第 8 條）\n1. 蒐集者：{company}（{company_country}）\n2. 蒐集目的：審核您的免費試用申請、就申請事宜與您聯繫、建立試用帳號\n3. 個人資料類別：您於本表單填寫的姓名、公司電子郵件、職稱、公司名稱、國家或地區等\n4. 利用期間、地區、對象及方式：{retention}；於 {storage_countries}，由本公司及受託廠商以電子方式利用\n5. 您可依個人資料保護法第 3 條，來信 {contact} 請求查詢、閱覽、製給複製本、補充或更正、停止蒐集、處理或利用，以及刪除\n6. 您可自由選擇是否提供；若不提供，我們將無法處理您的試用申請\n我已閱讀上述告知事項，並同意 {company} 依此蒐集、處理及利用我的個人資料。',
          en: 'Notice under Article 8 of the Personal Data Protection Act · 1 Collector: {company} ({company_country}) · 2 Purpose: reviewing your free-trial request, contacting you about it, creating the trial account · 3 Categories: name, work e-mail, job title, company, country or region and the other details entered in this form · 4 Period, territory, recipients and methods of use: {retention}; in {storage_countries}; used electronically by us and our contractors · 5 Under Article 3 you may ask to inquire, review, obtain a copy, supplement or correct, stop collection, processing or use, and delete, by writing to {contact} · 6 Providing the data is your choice; without it we cannot handle your request. I have read this notice and consent to {company} collecting, processing and using my personal data accordingly.',
        },
      },
    ],
    marketing: [
      {
        id: 'TW.M',
        kind: 'marketing',
        required: false,
        box: true,
        master: 'zh-Hant',
        basis: 'Taiwan PDPA art. 20 is opt-out; we use opt-in',
        texts: {
          'zh-Hant': '我同意透過電子郵件收到 Curahold 的產品消息與優惠資訊，並可隨時取消訂閱。',
          en: 'I agree to receive Curahold product news and offers by e-mail and can unsubscribe at any time.',
        },
      },
    ],
  },
  HK: {
    blocks: [
      {
        id: 'HK.N',
        kind: 'notice',
        required: false,
        box: false,
        master: 'zh-Hant',
        basis: 'PDPO DPP1(3) Personal Information Collection Statement',
        texts: {
          'zh-Hant': '收集個人資料聲明。{company} 收集你所填寫的個人資料，用於審核你的試用申請、就申請與你聯絡及開立試用帳戶。標有 * 的項目必須填寫，否則我們無法處理你的申請。你的資料可能會轉移至我們位於 {storage_countries} 的寄存及電郵服務供應商。你有權要求查閱及改正你的個人資料，請電郵至 {contact} 聯絡我們的私隱事務負責人。詳情請參閱私隱政策。',
          en: 'Personal Information Collection Statement. {company} collects the personal data you enter to assess your trial request, contact you about it and set up your trial. Items marked * are obligatory; without them we cannot process your request. Your data may be transferred to our hosting and e-mail service providers in {storage_countries}. You have the right to request access to and correction of your personal data; write to our privacy contact at {contact}. Details are in the Privacy notice.',
        },
      },
    ],
    marketing: [
      {
        id: 'HK.M',
        kind: 'marketing',
        required: false,
        box: true,
        master: 'zh-Hant',
        basis: 'PDPO Part 6A: kinds of data and classes of products named; consent (silence is not consent)',
        texts: {
          'zh-Hant': '我同意 {company} 使用我的姓名、職銜、公司名稱及公司電郵地址，向我推廣 Curahold 軟件產品及相關服務。我可隨時免費要求停止，方法是電郵至 {contact} 或按每封電郵內的取消訂閱連結。',
          en: 'I agree that {company} may use my name, job title, company name and business e-mail address to send me direct marketing about Curahold software products and related services. I can ask you to stop at any time, free of charge, at {contact} or through the unsubscribe link in each e-mail.',
        },
      },
    ],
  },
  SG: {
    blocks: [
      {
        id: 'SG.N',
        kind: 'notice',
        required: false,
        box: false,
        master: 'en',
        basis: 'Singapore PDPA ss. 13, 14, 20, 26 (business contact information mostly excluded, s. 4(5); treated as in scope)',
        texts: {
          en: '{company} collects and uses the details you enter to assess your trial request, contact you about it and set up your trial. Your data may be transferred to and stored with our service providers in {storage_countries}, under protection comparable to the Personal Data Protection Act. Data protection contact: {contact}. Details are in the Privacy notice.',
        },
      },
    ],
    marketing: [
      {
        id: 'SG.M',
        kind: 'marketing',
        required: false,
        box: true,
        master: 'en',
        basis: 'E-mail only (no calls or texts: keeps the Do-Not-Call rules out); Spam Control Act',
        texts: { en: 'Yes, send me product news and offers from Curahold by e-mail. I can unsubscribe at any time.' },
      },
    ],
  },
};

// ------------------------------------------------------------------ assembly

export type Placeholders = Record<'company' | 'company_country' | 'contact' | 'storage_countries' | 'processors' | 'retention' | 'eu_rep' | 'uk_rep' | 'cn_rep', string>;

export const fillText = (text: string, vars: Placeholders) => text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k as keyof Placeholders] : m));

export interface ShownText {
  /** `<rule set>.<block>.<language>@<version>` */
  textId: string;
  lang: Locale;
  text: string;
}

export interface ShownBlock {
  id: string;
  kind: BlockKind;
  required: boolean;
  box: boolean;
  basis: string;
  /** One text in the interface language, or the master with English next to it. */
  shown: ShownText[];
}

export interface ConsentSet {
  offered: boolean;
  /** Why not: 'sanctions' or the rule set that is not offered yet. */
  notOffered?: string;
  /** The request is held for a person to look at (a rule set that asks for it, or a connection from such a country). */
  manualReview: boolean;
  ruleSets: RuleSet[];
  blocks: ShownBlock[];
  version: string;
}

function show(b: TextBlock, locale: Locale, vars: Placeholders): ShownText[] {
  const langs: Locale[] = b.texts[locale] ? [locale] : [...new Set<Locale>([b.master, 'en'])].filter((l) => b.texts[l]);
  return langs.map((lang) => ({ textId: `${b.id}.${lang}@${CONSENT_TEXT_VERSION}`, lang, text: fillText(b.texts[lang] ?? '', vars) }));
}

/**
 * Everything the form shows for a visitor: the rule set of the country they
 * picked and, when the connection comes from a stricter one, that one too.
 */
export function consentSetFor(opts: { declared: string; ipCountry?: string | null; locale: Locale; vars: Placeholders; flags?: Partial<ConsentFlags> }): ConsentSet {
  const flags = { ...DEFAULT_FLAGS, ...opts.flags };
  const declared = opts.declared.toUpperCase();
  const ip = (opts.ipCountry ?? '').toUpperCase();
  const base = { version: CONSENT_TEXT_VERSION, blocks: [] as ShownBlock[] };
  if (NEVER_OFFERED.includes(declared)) return { ...base, offered: false, notOffered: 'sanctions', manualReview: false, ruleSets: [] };
  const own = ruleSetOf(declared);
  const ownFlag = RULE_SETS[own].offeredFlag;
  if (ownFlag && !flags[ownFlag]) return { ...base, offered: false, notOffered: own, manualReview: false, ruleSets: [own] };
  const sets: RuleSet[] = [own];
  const viaIp = ip && ip !== declared ? ruleSetOf(ip) : null;
  let manualReview = !!RULE_SETS[own].manualReview || NEVER_OFFERED.includes(ip);
  if (viaIp && viaIp !== own && viaIp !== 'ROW') {
    const f = RULE_SETS[viaIp].offeredFlag;
    if (f && !flags[f]) manualReview = true; // a connection from a country not offered yet: a person looks first
    else sets.push(viaIp);
  }
  const on = (b: TextBlock) => !b.when || flags[b.when];
  const pick = (b: TextBlock): ShownBlock => ({ id: b.id, kind: b.kind, required: b.required, box: b.box, basis: b.basis, shown: show(b, opts.locale, opts.vars) });
  const blocks: TextBlock[] = [];
  for (const s of sets)
    for (const b of RULE_SETS[s].blocks) {
      // The Turkish notice: the art. 9 version only once the standard contracts are notified, else the plain one.
      if (b.id === 'TR.N0' && flags.trStandardContractsNotified) continue;
      if (on(b)) blocks.push(b);
    }
  // Notices first, then the required boxes, then one set of marketing choices (Türkiye's two boxes win), then the capacity line.
  const order: BlockKind[] = ['notice', 'note', 'consent', 'transfer'];
  blocks.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  const marketing = sets.includes('TR') ? RULE_SETS.TR.marketing : RULE_SETS[own].marketing;
  return { ...base, offered: true, manualReview, ruleSets: sets, blocks: [...blocks, ...marketing, A].map(pick) };
}

/** SHA-256 of a shown text, as stored with the submission (Web Crypto: browsers, Workers, Node 18+). */
export async function textHash(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
