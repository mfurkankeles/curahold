// The sales site's words, in English and Turkish. Prices and what each plan
// includes come from shared/src/billing.ts and the app's own dictionaries,
// so the site and the product never disagree.
//
// Customer names are invented (the same ones as the demo).

import type { Locale } from '../shared/src/i18n';

export type SiteLocale = Locale;

export interface SiteCopy {
  lang: string;
  title: string;
  description: string;
  nav: { product: string; pricing: string; demo: string; help: string; signIn: string; tryFree: string; other: string };
  hero: { title: string; lead: string; primary: string; secondary: string; note: string; customer: string; chips: { renewal: string; review: string; step: string; health: string } };
  year: { title: string; lead: string; steps: { name: string; text: string }[] };
  meeting: {
    title: string;
    text: string;
    card: { day: string; month: string; kind: string; name: string; ours: string; theirs: string; notes: string; steps: string; done: string; open: string; openWho: string };
  };
  tools: { title: string; lead: string; rows: { label: string; names: string }[]; none: string; marquee: string };
  product: { title: string; lead: string; work: string; portfolio: string; detail: string; reports: string };
  pricing: { title: string; lead: string; monthly: string; yearly: string; save: string; perSeat: string; perSeatYearly: string; choose: string; business: string; fine: string };
  faq: { title: string; items: { q: string; a: string }[] };
  signIn: { title: string; text: string; label: string; go: string; close: string; none: string };
  footer: { story: string; help: string; legal: string; links: { terms: string; privacy: string; kvkk: string; dpa: string; subprocessors: string; cookies: string }; company: string; blog?: string };
  // Consent banner words (vanilla site). Optional per locale: English is the
  // fallback until a native pass lands (see `siteConsent`).
  consent?: SiteConsentCopy;
  // Blog index labels. Optional per locale; English is the fallback.
  blog?: SiteBlogCopy;
}

/** The consent banner and manage dialog on the marketing site. */
export interface SiteConsentCopy {
  title: string;
  body: string;
  acceptAll: string;
  rejectAll: string;
  manage: string;
  save: string;
  close: string;
  alwaysOn: string;
  manageTitle: string;
  necessaryTitle: string;
  necessaryBody: string;
  analyticsTitle: string;
  analyticsBody: string;
  marketingTitle: string;
  marketingBody: string;
  reopen: string;
  policy: string;
  ariaBanner: string;
}

/** Labels shown on the blog index and post pages. */
export interface SiteBlogCopy {
  nav: string;
  title: string;
  lead: string;
  metaTitle: string;
  metaDescription: string;
  readMore: string;
  backToBlog: string;
  minRead: string;
  updated: string;
  tags: string;
}

/** One block of a blog post's body, generated into safe HTML by the builder. */
export type BlogBlock = { h: string } | { p: string } | { ul: string[] } | { quote: string };

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  /** ISO date (YYYY-MM-DD) the post was published. */
  date: string;
  readMinutes: number;
  tags: string[];
  body: BlogBlock[];
}

export const COPY: Partial<Record<Locale, SiteCopy>> = {
  en: {
    lang: 'en',
    title: 'Curahold: work management for customer success teams',
    description: 'Renewals that start on their own, meetings whose next steps become tasks, and every customer that needs attention at a glance. In English and Turkish.',
    nav: { product: 'Product', pricing: 'Pricing', demo: 'Live demo', help: 'Help', signIn: 'Sign in', tryFree: 'Try it free', other: 'Türkçe' },
    hero: {
      title: 'Hold every customer with care.',
      lead: 'Curahold is where customer success and account teams keep track. Renewals start on their own, every promise made in a meeting becomes a task, and you see at a glance which customer needs you.',
      primary: 'Try it free for 3 months',
      secondary: 'Open the live demo',
      note: 'No card needed. In English and Turkish.',
      customer: 'Your customer',
      chips: { renewal: 'Renewal in 94 days', review: 'Business review 14 days late', step: 'Next step: send the quote, Zeynep', health: 'Health score 66, worth watching' },
    },
    year: {
      title: 'A year with a customer',
      lead: 'The same rhythm every account team knows, with the busywork done for you.',
      steps: [
        { name: 'Onboarding', text: 'A playbook opens the first month’s steps as dated tasks for the owner, on the board your team already works from.' },
        { name: 'Adoption', text: 'The health score shows its reasons. A customer gone quiet, or work that has stalled, comes forward by itself.' },
        { name: 'Business review', text: 'Log the meeting: who was there and what was said. Every next step becomes a task with an owner and a date.' },
        { name: 'Renewal', text: 'Months before the renewal date, its tasks and a renewal opportunity open on their own. Nothing waits for someone to remember.' },
      ],
    },
    meeting: {
      title: 'A promise made in a meeting is kept.',
      text: 'When you log a meeting, its next steps become tasks with an owner and a due date. The customer’s page shows every meeting, who was there and which steps are done.',
      card: {
        day: '10',
        month: 'Nov',
        kind: 'Business review',
        name: 'Q3 business review',
        ours: 'Our side: Zeynep Tunç, Ada Demir',
        theirs: 'Their side: Selin Aytaç',
        notes: 'Usage is ahead of target; they want the mobile channel next and asked for a quote for more seats.',
        steps: 'Next steps',
        done: 'Send the extra seats quote',
        open: 'Draft a sample journey for the mobile channel',
        openWho: 'Lena, by 22 Nov',
      },
    },
    tools: {
      title: 'With the tools your team already uses',
      lead: 'Connect what you have; keep working where you are.',
      rows: [
        { label: 'Chat', names: 'Slack, Microsoft Teams, Google Chat and email' },
        { label: 'CRM', names: 'Salesforce, HubSpot, Dynamics 365, Pipedrive, Zoho, Bitrix24, Freshsales and Zendesk Sell, in both directions' },
        { label: 'Spreadsheets & data', names: 'Google Sheets, Excel and Google BigQuery' },
        { label: 'AI assistants', names: 'Claude and ChatGPT, through the connector' },
      ],
      none: 'It also works with none of them.',
      marquee: 'Works with the tools you already have',
    },
    product: {
      title: 'Which customer needs you — at a glance',
      lead: 'Every account on one board, ordered by who needs attention first. Health score, renewal and the next step, each shown in its own colour.',
      work: 'Every promise, on the board as a task',
      portfolio: 'The few who need you, never lost in the many',
      detail: 'Open one, and see exactly why',
      reports: 'How the quarter is going, in one chart',
    },
    pricing: {
      title: 'Simple prices, per seat',
      lead: 'Every plan starts with a 3-month trial of everything. Viewer seats are free.',
      monthly: 'Monthly',
      yearly: 'Yearly',
      save: 'about 20% less',
      perSeat: 'per seat a month',
      perSeatYearly: 'per seat a month, paid yearly',
      choose: 'Start the free trial',
      business: 'Everything in Team, plus',
      fine: 'Prices in US dollars; taxes are added at checkout. Seats follow the people who have joined. Payments are handled by Paddle, our reseller.',
    },
    faq: {
      title: 'Questions',
      items: [
        { q: 'Where is our data kept?', a: 'The database is in the European Union. Every company is kept apart at the database itself, so no mistake in a screen can show one company another’s data. The data processing agreement covers GDPR and Türkiye’s KVKK.' },
        { q: 'Can we run it on our own servers?', a: 'Yes. A single-company package runs on your own server or cloud with its own database; it has no billing.' },
        { q: 'Do we need a CRM?', a: 'No. Customers can come from a spreadsheet, or be added by hand. If you have a CRM, Curahold keeps in step with it both ways.' },
        { q: 'Can we cancel at any time?', a: 'Yes. A cancelled plan works until the end of the period paid for, and everything can be exported.' },
        { q: 'Can we use our own words?', a: 'Yes. Call your customers accounts, partners or clients, and the whole interface follows. Curahold is in English and Turkish.' },
        { q: 'How long does setting up take?', a: 'About fifteen minutes: choose your address, bring your customers from a spreadsheet, invite your team.' },
      ],
    },
    signIn: { title: 'Sign in', text: 'Every company has its own address. Type yours to go to its sign-in page.', label: 'Your company address', go: 'Go', close: 'Close', none: 'No address yet? Start the free trial.' },
    footer: {
      story: 'The name comes from the Latin cura, care, and the English hold.',
      help: 'Help center',
      legal: 'Legal',
      links: { terms: 'Terms of service', privacy: 'Privacy policy', kvkk: 'KVKK notice', dpa: 'Data processing', subprocessors: 'Sub-processors', cookies: 'Cookies' },
      company: '[Company legal name]',
      blog: 'Blog',
    },
    consent: {
      title: 'Your privacy, your choice',
      body: 'We use only what is needed to run the site. With your consent we also measure how it is used and reach people who might like Curahold. Nothing non-essential loads until you choose.',
      acceptAll: 'Accept all',
      rejectAll: 'Reject non-essential',
      manage: 'Manage choices',
      save: 'Save choices',
      close: 'Close',
      alwaysOn: 'Always on',
      manageTitle: 'Privacy choices',
      necessaryTitle: 'Necessary',
      necessaryBody: 'Remembers this choice and keeps the page working. These never track you and cannot be switched off.',
      analyticsTitle: 'Analytics',
      analyticsBody: 'Helps us understand how the site is used, so we can improve it. Loads Google Analytics only with your consent.',
      marketingTitle: 'Marketing',
      marketingBody: 'Lets us measure and reach people who might find Curahold useful. Loads the Meta and TikTok pixels only with your consent.',
      reopen: 'Privacy choices',
      policy: 'Read the cookie policy',
      ariaBanner: 'Privacy and cookie consent',
    },
    blog: {
      nav: 'Blog',
      title: 'The Curahold blog',
      lead: 'Plain, useful writing on task management for customer success and account teams — and the meeting-to-task workflow that sets Curahold apart.',
      metaTitle: 'Blog: task management for customer teams — Curahold',
      metaDescription: 'Guides on task management, turning meetings into tasks, and the CRM-task hybrid workflow for customer success and account teams.',
      readMore: 'Read the post',
      backToBlog: 'All posts',
      minRead: 'min read',
      updated: 'Published',
      tags: 'Topics',
    },
  },
  tr: {
    lang: 'tr',
    title: 'Curahold: müşteri başarısı ekipleri için iş yönetimi',
    description: 'Kendiliğinden başlayan yenilemeler, sonraki adımları göreve dönüşen toplantılar ve ilgi bekleyen her müşteri tek bakışta. Türkçe ve İngilizce.',
    nav: { product: 'Ürün', pricing: 'Fiyatlar', demo: 'Canlı demo', help: 'Yardım', signIn: 'Giriş yap', tryFree: 'Ücretsiz dene', other: 'English' },
    hero: {
      title: 'Müşterilerini özenle tut.',
      lead: 'Curahold, müşteri başarısı ve müşteri yönetimi ekiplerinin işi takip ettiği yer. Yenilemeler kendiliğinden başlar, toplantıda verilen her söz bir göreve dönüşür ve hangi müşterinin seni beklediğini ilk bakışta görürsün.',
      primary: '3 ay ücretsiz dene',
      secondary: 'Canlı demoyu aç',
      note: 'Kart gerekmez. Türkçe ve İngilizce.',
      customer: 'Müşterin',
      chips: { renewal: 'Yenilemeye 94 gün var', review: 'İş değerlendirmesi 14 gün gecikti', step: 'Sonraki adım: teklifi gönder, Zeynep', health: 'Sağlık skoru 66, izlenmeli' },
    },
    year: {
      title: 'Bir müşteriyle geçen yıl',
      lead: 'Her müşteri ekibinin bildiği ritim; angarya işi senin yerine yapılmış hâliyle.',
      steps: [
        { name: 'Başlangıç', text: 'Bir playbook ilk ayın adımlarını, ekibinin zaten çalıştığı panoda sorumlusuna tarihli görevler olarak açar.' },
        { name: 'Kullanım', text: 'Sağlık skoru nedenleriyle görünür. Sessiz kalan bir müşteri ya da duraksayan bir iş kendiliğinden öne çıkar.' },
        { name: 'İş değerlendirmesi', text: 'Toplantıyı kaydet: kimler vardı, ne konuşuldu. Her sonraki adım sorumlusu ve tarihiyle bir göreve dönüşür.' },
        { name: 'Yenileme', text: 'Yenileme tarihinden aylar önce görevler ve yenileme fırsatı kendiliğinden açılır. Hiçbir şey birinin hatırlamasını beklemez.' },
      ],
    },
    meeting: {
      title: 'Toplantıda verilen söz unutulmaz.',
      text: 'Toplantıyı kaydettiğinde sonraki adımlar sorumlusu ve son tarihiyle görev olur. Müşterinin sayfası her toplantıyı, kimlerin katıldığını ve hangi adımların bittiğini gösterir.',
      card: {
        day: '10',
        month: 'Kas',
        kind: 'İş değerlendirmesi',
        name: '3. çeyrek iş değerlendirmesi',
        ours: 'Bizden: Zeynep Tunç, Ada Demir',
        theirs: 'Onlardan: Selin Aytaç',
        notes: 'Kullanım hedefin üstünde; sırada mobil kanal var, ek kullanıcı için teklif istediler.',
        steps: 'Sonraki adımlar',
        done: 'Ek kullanıcı teklifini gönder',
        open: 'Mobil kanal için örnek akış hazırla',
        openWho: 'Lena, 22 Kasım’a kadar',
      },
    },
    tools: {
      title: 'Ekibinin zaten kullandığı araçlarla',
      lead: 'Elindekini bağla, olduğun yerde çalışmaya devam et.',
      rows: [
        { label: 'Sohbet', names: 'Slack, Microsoft Teams, Google Chat ve e-posta' },
        { label: 'CRM', names: 'Salesforce, HubSpot, Dynamics 365, Pipedrive, Zoho, Bitrix24, Freshsales ve Zendesk Sell, iki yönlü' },
        { label: 'Tablolar ve veri', names: 'Google Sheets, Excel ve Google BigQuery' },
        { label: 'Yapay zekâ', names: 'Bağlayıcı üzerinden Claude ve ChatGPT' },
      ],
      none: 'Hiçbiri olmadan da çalışır.',
      marquee: 'Zaten kullandığın araçlarla çalışır',
    },
    product: {
      title: 'Hangi müşterinin sana ihtiyacı var — tek bakışta',
      lead: 'Her müşteri tek bir panoda, önce ilgi bekleyene göre sıralı. Sağlık skoru, yenileme ve sonraki adım; her biri kendi renginde.',
      work: 'Her söz, panoda bir görev',
      portfolio: 'İlgi bekleyenler kalabalıkta kaybolmaz',
      detail: 'Birini aç, nedenini tam olarak gör',
      reports: 'Çeyrek nasıl gidiyor, tek grafikte',
    },
    pricing: {
      title: 'Kullanıcı başına, sade fiyatlar',
      lead: 'Her plan, her şeyin açık olduğu 3 aylık denemeyle başlar. Görüntüleyen kullanıcılar ücretsiz.',
      monthly: 'Aylık',
      yearly: 'Yıllık',
      save: 'yaklaşık %20 daha az',
      perSeat: 'kullanıcı başına, aylık',
      perSeatYearly: 'kullanıcı başına aylık, yıllık ödemede',
      choose: 'Ücretsiz denemeyi başlat',
      business: 'Team’deki her şey, artı',
      fine: 'Fiyatlar ABD doları cinsindendir; vergiler ödeme sırasında eklenir. Kullanıcı sayısı katılan kişileri izler. Ödemeleri satıcımız Paddle alır.',
    },
    faq: {
      title: 'Sorular',
      items: [
        { q: 'Verilerimiz nerede tutuluyor?', a: 'Veritabanı Avrupa Birliği’nde. Her şirket veritabanının kendisinde birbirinden ayrılır; bir ekrandaki hata bile bir şirkete başka bir şirketin verisini gösteremez. Veri işleme sözleşmesi GDPR’ı ve KVKK’yı kapsar.' },
        { q: 'Kendi sunucularımızda çalıştırabilir miyiz?', a: 'Evet. Tek şirketlik paket, kendi veritabanıyla kendi sunucunda ya da bulutunda çalışır; aboneliği yoktur.' },
        { q: 'CRM’imiz olması gerekiyor mu?', a: 'Hayır. Müşteriler bir tablodan gelebilir ya da elle eklenebilir. CRM’in varsa Curahold onunla iki yönlü uyumlu kalır.' },
        { q: 'İstediğimiz zaman iptal edebilir miyiz?', a: 'Evet. İptal edilen plan ödenmiş dönemin sonuna kadar çalışır ve her şey dışa aktarılabilir.' },
        { q: 'Kendi kelimelerimizi kullanabilir miyiz?', a: 'Evet. Müşterilerine müşteri, partner ya da hesap de; bütün arayüz ona göre konuşur. Curahold Türkçe ve İngilizcedir.' },
        { q: 'Kurulum ne kadar sürer?', a: 'Yaklaşık on beş dakika: adresini seç, müşterilerini bir tablodan getir, ekibini davet et.' },
      ],
    },
    signIn: { title: 'Giriş yap', text: 'Her şirketin kendi adresi var. Giriş sayfasına gitmek için şirketinin adresini yaz.', label: 'Şirketinin adresi', go: 'Git', close: 'Kapat', none: 'Henüz adresin yok mu? Ücretsiz denemeyi başlat.' },
    footer: {
      story: 'Adı Latince cura (özen) ile İngilizce hold (tutmak) sözcüklerinden gelir.',
      help: 'Yardım merkezi',
      legal: 'Yasal',
      links: { terms: 'Kullanım koşulları', privacy: 'Gizlilik politikası', kvkk: 'KVKK aydınlatma metni', dpa: 'Veri işleme sözleşmesi', subprocessors: 'Alt işleyenler', cookies: 'Çerezler' },
      company: '[Şirket unvanı]',
      blog: 'Blog',
    },
    consent: {
      title: 'Gizliliğin, senin seçimin',
      body: 'Yalnızca siteyi çalıştırmak için gerekeni kullanırız. İzninle sitenin nasıl kullanıldığını da ölçer ve Curahold’u beğenebilecek kişilere ulaşırız. Sen seçene kadar zorunlu olmayan hiçbir şey yüklenmez.',
      acceptAll: 'Tümünü kabul et',
      rejectAll: 'Zorunlu olmayanları reddet',
      manage: 'Tercihleri yönet',
      save: 'Tercihleri kaydet',
      close: 'Kapat',
      alwaysOn: 'Her zaman açık',
      manageTitle: 'Gizlilik tercihleri',
      necessaryTitle: 'Zorunlu',
      necessaryBody: 'Bu seçimi hatırlar ve sayfanın çalışmasını sağlar. Seni izlemez ve kapatılamaz.',
      analyticsTitle: 'Analitik',
      analyticsBody: 'Sitenin nasıl kullanıldığını anlamamıza ve onu iyileştirmemize yardımcı olur. Google Analytics yalnızca izninle yüklenir.',
      marketingTitle: 'Pazarlama',
      marketingBody: 'Curahold’u faydalı bulabilecek kişileri ölçmemizi ve onlara ulaşmamızı sağlar. Meta ve TikTok pikselleri yalnızca izninle yüklenir.',
      reopen: 'Gizlilik tercihleri',
      policy: 'Çerez politikasını oku',
      ariaBanner: 'Gizlilik ve çerez onayı',
    },
    blog: {
      nav: 'Blog',
      title: 'Curahold blog',
      lead: 'Müşteri başarısı ve müşteri yönetimi ekipleri için görev yönetimi üzerine sade, işe yarar yazılar — ve Curahold’u farklı kılan toplantıdan göreve akışı.',
      metaTitle: 'Blog: müşteri ekipleri için görev yönetimi — Curahold',
      metaDescription: 'Görev yönetimi, toplantıları göreve dönüştürme ve müşteri başarısı ekipleri için CRM-görev melez akışı üzerine rehberler.',
      readMore: 'Yazıyı oku',
      backToBlog: 'Tüm yazılar',
      minRead: 'dk okuma',
      updated: 'Yayımlandı',
      tags: 'Konular',
    },
  },
  ar: {
    lang: 'ar',
    title: 'Curahold: إدارة العمل لفرق نجاح العملاء',
    description: 'تجديدات تبدأ من تلقاء نفسها، واجتماعات تتحول خطواتها التالية إلى مهام، وكل عميل يحتاج إلى اهتمامك في لمحة.',
    nav: { product: 'المنتج', pricing: 'الأسعار', demo: 'عرض مباشر', help: 'المساعدة', signIn: 'تسجيل الدخول', tryFree: 'جرّبه مجانًا', other: 'English' },
    hero: {
      title: 'احتضن كل عميل بعناية.',
      lead: 'Curahold هو المكان الذي تتابع فيه فرق نجاح العملاء وإدارة الحسابات عملها. تبدأ التجديدات من تلقاء نفسها، ويتحول كل وعد يُقطع في اجتماع إلى مهمة، وترى في لمحة أي عميل يحتاج إليك.',
      primary: 'جرّبه مجانًا لمدة 3 أشهر',
      secondary: 'افتح العرض المباشر',
      note: 'لا حاجة إلى بطاقة.',
      customer: 'عميلك',
      chips: { renewal: 'التجديد بعد 94 يومًا', review: 'مراجعة الأعمال متأخرة 14 يومًا', step: 'الخطوة التالية: أرسل العرض، زينب', health: 'مؤشر الصحة 66، يستحق المتابعة' },
    },
    year: {
      title: 'عام مع عميل',
      lead: 'الإيقاع نفسه الذي يعرفه كل فريق حسابات، مع إنجاز العمل الروتيني نيابة عنك.',
      steps: [
        { name: 'الإعداد', text: 'يفتح دليل العمل خطوات الشهر الأول كمهام مؤرخة لصاحبها، على اللوحة التي يعمل عليها فريقك بالفعل.' },
        { name: 'التبنّي', text: 'يُظهر مؤشر الصحة أسبابه. العميل الذي صمت، أو العمل الذي تعثّر، يتقدم من تلقاء نفسه.' },
        { name: 'مراجعة الأعمال', text: 'سجّل الاجتماع: من حضر وما قيل. تتحول كل خطوة تالية إلى مهمة بصاحب وتاريخ.' },
        { name: 'التجديد', text: 'قبل أشهر من موعد التجديد، تُفتح مهامه وفرصة تجديد من تلقاء نفسها. لا شيء ينتظر أن يتذكره أحد.' },
      ],
    },
    meeting: {
      title: 'الوعد الذي يُقطع في اجتماع يُوفى به.',
      text: 'عندما تسجّل اجتماعًا، تتحول خطواته التالية إلى مهام بصاحب وتاريخ استحقاق. تُظهر صفحة العميل كل اجتماع ومن حضره وأي الخطوات اكتملت.',
      card: {
        day: '10',
        month: 'نوفمبر',
        kind: 'مراجعة أعمال',
        name: 'مراجعة أعمال الربع الثالث',
        ours: 'من جانبنا: Zeynep Tunç، Ada Demir',
        theirs: 'من جانبهم: Selin Aytaç',
        notes: 'الاستخدام يفوق الهدف؛ يريدون قناة الجوال تاليًا وطلبوا عرضًا لمقاعد إضافية.',
        steps: 'الخطوات التالية',
        done: 'أرسل عرض المقاعد الإضافية',
        open: 'جهّز رحلة نموذجية لقناة الجوال',
        openWho: 'Lena، قبل 22 نوفمبر',
      },
    },
    tools: {
      title: 'مع الأدوات التي يستخدمها فريقك بالفعل',
      lead: 'اربط ما لديك، واستمر في العمل حيث أنت.',
      rows: [
        { label: 'المحادثة', names: 'Slack وMicrosoft Teams وGoogle Chat والبريد الإلكتروني' },
        { label: 'إدارة العملاء', names: 'Salesforce وHubSpot وDynamics 365 وPipedrive وZoho وBitrix24 وFreshsales وZendesk Sell، في الاتجاهين' },
        { label: 'جداول البيانات والبيانات', names: 'Google Sheets وExcel وGoogle BigQuery' },
        { label: 'مساعدو الذكاء الاصطناعي', names: 'Claude وChatGPT عبر الموصّل' },
      ],
      none: 'ويعمل أيضًا من دون أي منها.',
      marquee: 'يعمل مع الأدوات التي تستخدمها بالفعل',
    },
    product: {
      title: 'أي عميل يحتاجك — بلمحة واحدة',
      lead: 'كل الحسابات على لوحة واحدة، مرتّبة حسب الأحوج إلى اهتمامك. الحالة الصحية والتجديد والخطوة التالية، كلٌّ بلونه الخاص.',
      work: 'كل وعد، على اللوحة كمهمة',
      portfolio: 'القلّة التي تحتاجك لا تضيع بين الكثرة',
      detail: 'افتح واحدًا، وانظر السبب بالضبط',
      reports: 'كيف يسير الربع، في رسم واحد',
    },
    pricing: {
      title: 'أسعار بسيطة، لكل مقعد',
      lead: 'تبدأ كل خطة بتجربة مجانية لكل شيء لمدة 3 أشهر. مقاعد المشاهدة مجانية.',
      monthly: 'شهري',
      yearly: 'سنوي',
      save: 'أقل بنحو 20%',
      perSeat: 'لكل مقعد شهريًا',
      perSeatYearly: 'لكل مقعد شهريًا، بدفع سنوي',
      choose: 'ابدأ التجربة المجانية',
      business: 'كل ما في الفريق، بالإضافة إلى',
      fine: 'الأسعار بالدولار الأمريكي؛ تُضاف الضرائب عند الدفع. يتبع عدد المقاعد الأشخاص الذين انضموا. يتولى المدفوعات موزّعنا Paddle.',
    },
    faq: {
      title: 'أسئلة',
      items: [
        { q: 'أين تُحفظ بياناتنا؟', a: 'قاعدة البيانات في الاتحاد الأوروبي. تُفصل كل شركة عن غيرها في قاعدة البيانات نفسها، فلا يمكن لأي خطأ في شاشة أن يُظهر لشركة بيانات شركة أخرى. تغطي اتفاقية معالجة البيانات لائحة GDPR وقانون KVKK التركي.' },
        { q: 'هل يمكننا تشغيله على خوادمنا الخاصة؟', a: 'نعم. تعمل حزمة الشركة الواحدة على خادمك أو سحابتك بقاعدة بياناتها الخاصة؛ وليست لها اشتراكات.' },
        { q: 'هل نحتاج إلى نظام إدارة عملاء؟', a: 'لا. يمكن أن يأتي العملاء من جدول بيانات أو يُضافوا يدويًا. وإن كان لديك نظام إدارة عملاء، يبقى Curahold متوافقًا معه في الاتجاهين.' },
        { q: 'هل يمكننا الإلغاء في أي وقت؟', a: 'نعم. تعمل الخطة الملغاة حتى نهاية المدة المدفوعة، ويمكن تصدير كل شيء.' },
        { q: 'هل يمكننا استخدام كلماتنا الخاصة؟', a: 'نعم. سمِّ عملاءك حسابات أو شركاء أو زبائن، وتتبع الواجهة كلها ذلك.' },
        { q: 'كم يستغرق الإعداد؟', a: 'نحو خمس عشرة دقيقة: اختر عنوانك، واجلب عملاءك من جدول بيانات، وادعُ فريقك.' },
      ],
    },
    signIn: { title: 'تسجيل الدخول', text: 'لكل شركة عنوانها الخاص. اكتب عنوان شركتك للانتقال إلى صفحة تسجيل دخولها.', label: 'عنوان شركتك', go: 'انتقل', close: 'إغلاق', none: 'ليس لديك عنوان بعد؟ ابدأ التجربة المجانية.' },
    footer: {
      story: 'يأتي الاسم من اللاتينية cura (العناية) والإنجليزية hold (الإمساك).',
      help: 'مركز المساعدة',
      legal: 'الشؤون القانونية',
      links: { terms: 'شروط الخدمة', privacy: 'سياسة الخصوصية', kvkk: 'إشعار KVKK', dpa: 'معالجة البيانات', subprocessors: 'المعالِجون الفرعيون', cookies: 'ملفات تعريف الارتباط' },
      company: '[الاسم القانوني للشركة]',
    },
  },
  he: {
    lang: 'he',
    title: 'Curahold: ניהול עבודה לצוותי הצלחת לקוחות',
    description: 'חידושים שמתחילים מעצמם, פגישות שהצעדים הבאים שלהן הופכים למשימות, וכל לקוח שזקוק לתשומת לב במבט אחד.',
    nav: { product: 'מוצר', pricing: 'תמחור', demo: 'הדגמה חיה', help: 'עזרה', signIn: 'התחברות', tryFree: 'התנסות חינם', other: 'English' },
    hero: {
      title: 'אחוז בכל לקוח בעדינות.',
      lead: 'Curahold הוא המקום שבו צוותי הצלחת לקוחות וניהול לקוחות עוקבים אחר העבודה. חידושים מתחילים מעצמם, כל הבטחה שניתנה בפגישה הופכת למשימה, ואתה רואה במבט אחד איזה לקוח זקוק לך.',
      primary: 'התנסות חינם ל-3 חודשים',
      secondary: 'פתח את ההדגמה החיה',
      note: 'לא נדרש כרטיס.',
      customer: 'הלקוח שלך',
      chips: { renewal: 'חידוש בעוד 94 ימים', review: 'סקירת העסק באיחור של 14 ימים', step: 'הצעד הבא: שלחי את ההצעה, זיינפ', health: 'ציון בריאות 66, כדאי לעקוב' },
    },
    year: {
      title: 'שנה עם לקוח',
      lead: 'אותו קצב שכל צוות לקוחות מכיר, כשהעבודה השגרתית נעשית בשבילך.',
      steps: [
        { name: 'הצטרפות', text: 'פלייבוק פותח את צעדי החודש הראשון כמשימות מתוארכות לבעליהן, על הלוח שהצוות שלך כבר עובד בו.' },
        { name: 'אימוץ', text: 'ציון הבריאות מראה את סיבותיו. לקוח שנדם, או עבודה שנתקעה, עולה מעצמו לפני השאר.' },
        { name: 'סקירת עסק', text: 'תעד את הפגישה: מי נכח ומה נאמר. כל צעד הבא הופך למשימה עם בעלים ותאריך.' },
        { name: 'חידוש', text: 'חודשים לפני מועד החידוש, המשימות שלו והזדמנות חידוש נפתחות מעצמן. שום דבר לא מחכה שמישהו יזכור.' },
      ],
    },
    meeting: {
      title: 'הבטחה שניתנה בפגישה מקוימת.',
      text: 'כשאתה מתעד פגישה, הצעדים הבאים שלה הופכים למשימות עם בעלים ותאריך יעד. דף הלקוח מראה כל פגישה, מי נכח ואילו צעדים הושלמו.',
      card: {
        day: '10',
        month: 'נוב׳',
        kind: 'סקירת עסק',
        name: 'סקירת עסק רבעון 3',
        ours: 'מצידנו: Zeynep Tunç, Ada Demir',
        theirs: 'מצידם: Selin Aytaç',
        notes: 'השימוש מעל היעד; הם רוצים את ערוץ המובייל בהמשך וביקשו הצעה למושבים נוספים.',
        steps: 'צעדים הבאים',
        done: 'שלח הצעה למושבים נוספים',
        open: 'הכן מסע לדוגמה לערוץ המובייל',
        openWho: 'Lena, עד 22 בנוב׳',
      },
    },
    tools: {
      title: 'עם הכלים שהצוות שלך כבר משתמש בהם',
      lead: 'חבר את מה שיש לך, והמשך לעבוד היכן שאתה.',
      rows: [
        { label: 'צ׳אט', names: 'Slack, Microsoft Teams, Google Chat ודוא״ל' },
        { label: 'CRM', names: 'Salesforce, HubSpot, Dynamics 365, Pipedrive, Zoho, Bitrix24, Freshsales ו-Zendesk Sell, בשני הכיוונים' },
        { label: 'גיליונות ונתונים', names: 'Google Sheets, Excel ו-Google BigQuery' },
        { label: 'עוזרי AI', names: 'Claude ו-ChatGPT דרך המחבר' },
      ],
      none: 'הוא עובד גם בלי אף אחד מהם.',
      marquee: 'עובד עם הכלים שכבר יש לך',
    },
    product: {
      title: 'איזה לקוח צריך אותך — במבט אחד',
      lead: 'כל הלקוחות בלוח אחד, ממוינים לפי מי שזקוק לתשומת לב קודם. ציון הבריאות, החידוש והצעד הבא — כל אחד בצבעו.',
      work: 'כל הבטחה, על הלוח כמשימה',
      portfolio: 'המעטים שזקוקים לך לא הולכים לאיבוד בין הרבים',
      detail: 'פתח אחד, וראה בדיוק למה',
      reports: 'איך הרבעון מתקדם, בתרשים אחד',
    },
    pricing: {
      title: 'תמחור פשוט, לכל מושב',
      lead: 'כל תוכנית מתחילה בהתנסות של 3 חודשים בכל התכונות. מושבי צפייה חינם.',
      monthly: 'חודשי',
      yearly: 'שנתי',
      save: 'בכ-20% פחות',
      perSeat: 'למושב לחודש',
      perSeatYearly: 'למושב לחודש, בתשלום שנתי',
      choose: 'התחל התנסות חינם',
      business: 'כל מה שבצוות, ובנוסף',
      fine: 'המחירים בדולר אמריקאי; מסים מתווספים בתשלום. מספר המושבים עוקב אחר מי שהצטרף. את התשלומים מטפל המשווק שלנו Paddle.',
    },
    faq: {
      title: 'שאלות',
      items: [
        { q: 'היכן נשמרים הנתונים שלנו?', a: 'מסד הנתונים נמצא באיחוד האירופי. כל חברה מופרדת מהאחרות במסד הנתונים עצמו, כך ששום תקלה במסך לא תציג לחברה את נתוני חברה אחרת. הסכם עיבוד הנתונים מכסה את GDPR ואת KVKK הטורקי.' },
        { q: 'אפשר להריץ על שרתים שלנו?', a: 'כן. חבילת החברה היחידה רצה על השרת או הענן שלך עם מסד נתונים משלה; אין לה חיוב.' },
        { q: 'צריך CRM?', a: 'לא. לקוחות יכולים להגיע מגיליון או להתווסף ידנית. אם יש לך CRM, Curahold נשאר מסונכרן איתו בשני הכיוונים.' },
        { q: 'אפשר לבטל בכל עת?', a: 'כן. תוכנית שבוטלה עובדת עד סוף התקופה ששולמה, והכול ניתן לייצוא.' },
        { q: 'אפשר להשתמש במילים שלנו?', a: 'כן. קרא ללקוחות שלך חשבונות, שותפים או לקוחות, וכל הממשק עוקב אחר כך.' },
        { q: 'כמה זמן לוקח להתקין?', a: 'כחמש עשרה דקות: בחר את הכתובת שלך, הבא את הלקוחות מגיליון, והזמן את הצוות.' },
      ],
    },
    signIn: { title: 'התחברות', text: 'לכל חברה כתובת משלה. הקלד את כתובת החברה שלך כדי לעבור לדף ההתחברות שלה.', label: 'כתובת החברה שלך', go: 'עבור', close: 'סגור', none: 'אין עדיין כתובת? התחל התנסות חינם.' },
    footer: {
      story: 'השם מגיע מהלטינית cura (טיפול) ומהאנגלית hold (להחזיק).',
      help: 'מרכז עזרה',
      legal: 'משפטי',
      links: { terms: 'תנאי שימוש', privacy: 'מדיניות פרטיות', kvkk: 'הודעת KVKK', dpa: 'עיבוד נתונים', subprocessors: 'מעבדי משנה', cookies: 'עוגיות' },
      company: '[שם חברה רשמי]',
    },
  },
  fa: {
    lang: 'fa',
    title: 'Curahold: مدیریت کار برای تیم‌های موفقیت مشتری',
    description: 'تمدیدهایی که خودبه‌خود آغاز می‌شوند، جلساتی که گام‌های بعدی‌شان به وظیفه تبدیل می‌شود، و هر مشتری که به توجه نیاز دارد در یک نگاه.',
    nav: { product: 'محصول', pricing: 'قیمت‌ها', demo: 'دموی زنده', help: 'راهنما', signIn: 'ورود', tryFree: 'رایگان امتحان کنید', other: 'English' },
    hero: {
      title: 'هر مشتری را با دقت نگه دار.',
      lead: 'Curahold جایی است که تیم‌های موفقیت مشتری و مدیریت حساب کارشان را دنبال می‌کنند. تمدیدها خودبه‌خود آغاز می‌شوند، هر قولی که در جلسه داده شود به وظیفه تبدیل می‌شود، و در یک نگاه می‌بینی کدام مشتری به تو نیاز دارد.',
      primary: '۳ ماه رایگان امتحان کنید',
      secondary: 'دموی زنده را باز کنید',
      note: 'نیازی به کارت نیست.',
      customer: 'مشتری شما',
      chips: { renewal: 'تمدید تا ۹۴ روز دیگر', review: 'بازبینی کسب‌وکار ۱۴ روز عقب افتاده', step: 'گام بعدی: پیشنهاد را بفرست، زینب', health: 'امتیاز سلامت ۶۶، ارزش پیگیری دارد' },
    },
    year: {
      title: 'یک سال با یک مشتری',
      lead: 'همان ریتمی که هر تیم حساب می‌شناسد، با کارهای روزمره‌ای که به جای تو انجام شده.',
      steps: [
        { name: 'راه‌اندازی', text: 'یک پلی‌بوک گام‌های ماه نخست را به صورت وظایف تاریخ‌دار برای مسئولش، روی همان بردی که تیمت از قبل کار می‌کند، باز می‌کند.' },
        { name: 'به‌کارگیری', text: 'امتیاز سلامت دلایلش را نشان می‌دهد. مشتری‌ای که ساکت شده یا کاری که متوقف مانده، خودبه‌خود جلو می‌آید.' },
        { name: 'بازبینی کسب‌وکار', text: 'جلسه را ثبت کن: چه کسانی بودند و چه گفته شد. هر گام بعدی به وظیفه‌ای با مسئول و تاریخ تبدیل می‌شود.' },
        { name: 'تمدید', text: 'ماه‌ها پیش از تاریخ تمدید، وظایف آن و یک فرصت تمدید خودبه‌خود باز می‌شوند. هیچ چیز منتظر یادآوری کسی نمی‌ماند.' },
      ],
    },
    meeting: {
      title: 'قولی که در جلسه داده شود، نگه داشته می‌شود.',
      text: 'وقتی جلسه‌ای را ثبت می‌کنی، گام‌های بعدی‌اش به وظایفی با مسئول و مهلت تبدیل می‌شوند. صفحه مشتری هر جلسه، حاضران و گام‌های انجام‌شده را نشان می‌دهد.',
      card: {
        day: '10',
        month: 'نوامبر',
        kind: 'بازبینی کسب‌وکار',
        name: 'بازبینی کسب‌وکار سه‌ماهه سوم',
        ours: 'از طرف ما: Zeynep Tunç، Ada Demir',
        theirs: 'از طرف آن‌ها: Selin Aytaç',
        notes: 'استفاده بالاتر از هدف است؛ در گام بعد کانال موبایل را می‌خواهند و برای صندلی‌های بیشتر پیشنهاد خواستند.',
        steps: 'گام‌های بعدی',
        done: 'پیشنهاد صندلی‌های بیشتر را بفرست',
        open: 'یک سفر نمونه برای کانال موبایل آماده کن',
        openWho: 'Lena، تا ۲۲ نوامبر',
      },
    },
    tools: {
      title: 'با ابزارهایی که تیمت از قبل استفاده می‌کند',
      lead: 'آنچه داری را وصل کن و همان‌جا که هستی کار کن.',
      rows: [
        { label: 'گفت‌وگو', names: 'Slack، Microsoft Teams، Google Chat و ایمیل' },
        { label: 'CRM', names: 'Salesforce، HubSpot، Dynamics 365، Pipedrive، Zoho، Bitrix24، Freshsales و Zendesk Sell، دوطرفه' },
        { label: 'صفحه‌گسترده و داده', names: 'Google Sheets، Excel و Google BigQuery' },
        { label: 'دستیاران هوش مصنوعی', names: 'Claude و ChatGPT از طریق کانکتور' },
      ],
      none: 'بدون هیچ‌کدام هم کار می‌کند.',
      marquee: 'با ابزارهایی که همین حالا داری کار می‌کند',
    },
    product: {
      title: 'کدام مشتری به تو نیاز دارد — در یک نگاه',
      lead: 'همه حساب‌ها در یک تابلو، به‌ترتیب آن‌که زودتر به توجه نیاز دارد. امتیاز سلامت، تمدید و گام بعدی، هر کدام با رنگ خودش.',
      work: 'هر قول، روی تابلو به‌صورت یک وظیفه',
      portfolio: 'معدود کسانی که به تو نیاز دارند میان انبوه گم نمی‌شوند',
      detail: 'یکی را باز کن و دقیقاً دلیلش را ببین',
      reports: 'فصل چطور پیش می‌رود، در یک نمودار',
    },
    pricing: {
      title: 'قیمت‌های ساده، به ازای هر صندلی',
      lead: 'هر طرح با یک دوره آزمایشی ۳ ماهه از همه چیز آغاز می‌شود. صندلی‌های فقط-مشاهده رایگان‌اند.',
      monthly: 'ماهانه',
      yearly: 'سالانه',
      save: 'حدود ۲۰٪ کمتر',
      perSeat: 'هر صندلی در ماه',
      perSeatYearly: 'هر صندلی در ماه، با پرداخت سالانه',
      choose: 'شروع دوره آزمایشی رایگان',
      business: 'همه چیز در تیم، به‌علاوه',
      fine: 'قیمت‌ها به دلار آمریکا است؛ مالیات هنگام پرداخت افزوده می‌شود. شمار صندلی‌ها از افرادی که پیوسته‌اند پیروی می‌کند. پرداخت‌ها را فروشنده ما Paddle انجام می‌دهد.',
    },
    faq: {
      title: 'پرسش‌ها',
      items: [
        { q: 'داده‌های ما کجا نگهداری می‌شود؟', a: 'پایگاه داده در اتحادیه اروپا است. هر شرکت در خود پایگاه داده از دیگران جدا می‌شود، پس هیچ خطایی در یک صفحه نمی‌تواند داده یک شرکت را به شرکت دیگر نشان دهد. قرارداد پردازش داده GDPR و KVKK ترکیه را پوشش می‌دهد.' },
        { q: 'می‌توانیم روی سرورهای خودمان اجرا کنیم؟', a: 'بله. بسته تک‌شرکتی روی سرور یا ابر خودت با پایگاه داده خودش اجرا می‌شود؛ اشتراکی ندارد.' },
        { q: 'به CRM نیاز داریم؟', a: 'خیر. مشتریان می‌توانند از یک صفحه‌گسترده بیایند یا دستی افزوده شوند. اگر CRM داری، Curahold دوطرفه با آن هماهنگ می‌ماند.' },
        { q: 'هر وقت بخواهیم می‌توانیم لغو کنیم؟', a: 'بله. طرح لغوشده تا پایان دوره پرداخت‌شده کار می‌کند و همه چیز قابل برون‌بری است.' },
        { q: 'می‌توانیم از واژه‌های خودمان استفاده کنیم؟', a: 'بله. مشتریانت را حساب، شریک یا موکل بنام؛ کل رابط از آن پیروی می‌کند.' },
        { q: 'راه‌اندازی چقدر طول می‌کشد؟', a: 'حدود پانزده دقیقه: آدرست را انتخاب کن، مشتریانت را از یک صفحه‌گسترده بیاور، و تیمت را دعوت کن.' },
      ],
    },
    signIn: { title: 'ورود', text: 'هر شرکت آدرس خودش را دارد. برای رفتن به صفحه ورودش، آدرس شرکتت را بنویس.', label: 'آدرس شرکت شما', go: 'برو', close: 'بستن', none: 'هنوز آدرسی نداری؟ دوره آزمایشی رایگان را شروع کن.' },
    footer: {
      story: 'نام از cura لاتین (مراقبت) و hold انگلیسی (نگه داشتن) می‌آید.',
      help: 'مرکز راهنما',
      legal: 'حقوقی',
      links: { terms: 'شرایط خدمات', privacy: 'سیاست حریم خصوصی', kvkk: 'اطلاعیه KVKK', dpa: 'پردازش داده', subprocessors: 'پردازشگران فرعی', cookies: 'کوکی‌ها' },
      company: '[نام حقوقی شرکت]',
    },
  },
  'zh-Hans': {
    lang: 'zh-Hans',
    title: 'Curahold：面向客户成功团队的工作管理',
    description: '自动开始的续约、下一步会转化为任务的会议，以及一眼看清每个需要关注的客户。',
    nav: { product: '产品', pricing: '价格', demo: '在线演示', help: '帮助', signIn: '登录', tryFree: '免费试用', other: 'English' },
    hero: {
      title: '用心留住每一位客户。',
      lead: 'Curahold 是客户成功与客户管理团队跟进工作的地方。续约自动开始，会议上许下的每个承诺都会变成任务，你一眼就能看出哪位客户需要你。',
      primary: '免费试用 3 个月',
      secondary: '打开在线演示',
      note: '无需信用卡。',
      customer: '你的客户',
      chips: { renewal: '94 天后续约', review: '业务回顾已延迟 14 天', step: '下一步：发送报价，Zeynep', health: '健康评分 66，值得关注' },
    },
    year: {
      title: '与客户的一年',
      lead: '每个客户团队都熟悉的节奏，琐碎的活儿替你做好。',
      steps: [
        { name: '启动', text: '行动手册会把第一个月的步骤，作为带日期的任务分配给负责人，就在你的团队已经使用的看板上。' },
        { name: '采用', text: '健康评分会显示其缘由。沉默下来的客户，或停滞的工作，会自动浮现出来。' },
        { name: '业务回顾', text: '记录会议：谁出席、谈了什么。每个下一步都会变成带负责人和日期的任务。' },
        { name: '续约', text: '在续约日期前数月，它的任务和一个续约商机会自动开启。一切都不必等人记起。' },
      ],
    },
    meeting: {
      title: '会议上许下的承诺，都会兑现。',
      text: '当你记录会议时，它的下一步会变成带负责人和截止日期的任务。客户页面会显示每一次会议、谁出席以及哪些步骤已完成。',
      card: {
        day: '10',
        month: '11月',
        kind: '业务回顾',
        name: '第三季度业务回顾',
        ours: '我方：Zeynep Tunç、Ada Demir',
        theirs: '对方：Selin Aytaç',
        notes: '使用量超出目标；他们下一步想要移动渠道，并索取了增加席位的报价。',
        steps: '下一步',
        done: '发送增加席位的报价',
        open: '为移动渠道准备一个示例旅程',
        openWho: 'Lena，11月22日前',
      },
    },
    tools: {
      title: '与你的团队已在使用的工具协作',
      lead: '接入你已有的工具，在原处继续工作。',
      rows: [
        { label: '聊天', names: 'Slack、Microsoft Teams、Google Chat 和电子邮件' },
        { label: 'CRM', names: 'Salesforce、HubSpot、Dynamics 365、Pipedrive、Zoho、Bitrix24、Freshsales 和 Zendesk Sell，双向同步' },
        { label: '电子表格与数据', names: 'Google Sheets、Excel 和 Google BigQuery' },
        { label: 'AI 助手', names: '通过连接器使用 Claude 和 ChatGPT' },
      ],
      none: '不接入任何工具也能用。',
      marquee: '与你已在使用的工具协同工作',
    },
    product: {
      title: '哪位客户需要你——一目了然',
      lead: '所有客户集中在一个看板上，按最需要关注的顺序排列。健康分、续约和下一步，各以其颜色呈现。',
      work: '每个承诺，都化为看板上的一个任务',
      portfolio: '需要你的少数客户，不再淹没在多数之中',
      detail: '打开一个客户，看清原因',
      reports: '本季度进展如何，一张图看懂',
    },
    pricing: {
      title: '简单的按席位定价',
      lead: '每个套餐都以 3 个月全功能试用开始。只读席位免费。',
      monthly: '按月',
      yearly: '按年',
      save: '约便宜 20%',
      perSeat: '每席位每月',
      perSeatYearly: '每席位每月，按年付费',
      choose: '开始免费试用',
      business: '包含团队版的一切，另加',
      fine: '价格以美元计；结账时另加税费。席位数随加入的成员变化。付款由我们的经销商 Paddle 处理。',
    },
    faq: {
      title: '常见问题',
      items: [
        { q: '我们的数据保存在哪里？', a: '数据库位于欧盟。每家公司在数据库层面彼此隔离，因此任何界面上的差错都无法把一家公司的数据显示给另一家。数据处理协议涵盖 GDPR 与土耳其的 KVKK。' },
        { q: '可以在我们自己的服务器上运行吗？', a: '可以。单公司版在你自己的服务器或云上运行，拥有独立数据库；没有订阅计费。' },
        { q: '需要 CRM 吗？', a: '不需要。客户可以从电子表格导入，或手动添加。如果你有 CRM，Curahold 会与它双向保持同步。' },
        { q: '可以随时取消吗？', a: '可以。取消的套餐会运行到已付费周期结束，且一切都可导出。' },
        { q: '可以使用我们自己的称呼吗？', a: '可以。把你的客户称作账户、合作伙伴或客户，整个界面都会随之变化。' },
        { q: '设置需要多久？', a: '大约十五分钟：选择你的地址，从电子表格导入客户，邀请你的团队。' },
      ],
    },
    signIn: { title: '登录', text: '每家公司都有自己的地址。输入你公司的地址即可前往其登录页面。', label: '你的公司地址', go: '前往', close: '关闭', none: '还没有地址？开始免费试用。' },
    footer: {
      story: '名字来自拉丁语 cura（关怀）与英语 hold（守护）。',
      help: '帮助中心',
      legal: '法律',
      links: { terms: '服务条款', privacy: '隐私政策', kvkk: 'KVKK 告知', dpa: '数据处理', subprocessors: '次级处理方', cookies: 'Cookie' },
      company: '[公司法定名称]',
    },
  },
  'zh-Hant': {
    lang: 'zh-Hant',
    title: 'Curahold：為客戶成功團隊打造的工作管理',
    description: '自動開始的續約、下一步會轉為任務的會議，以及一眼看清每位需要關注的客戶。',
    nav: { product: '產品', pricing: '定價', demo: '線上展示', help: '說明', signIn: '登入', tryFree: '免費試用', other: 'English' },
    hero: {
      title: '用心留住每一位客戶。',
      lead: 'Curahold 是客戶成功與客戶管理團隊追蹤工作的地方。續約自動開始，會議上許下的每個承諾都會變成任務，你一眼就能看出哪位客戶需要你。',
      primary: '免費試用 3 個月',
      secondary: '開啟線上展示',
      note: '無需信用卡。',
      customer: '你的客戶',
      chips: { renewal: '94 天後續約', review: '業務檢視已延遲 14 天', step: '下一步：傳送報價，Zeynep', health: '健康評分 66，值得留意' },
    },
    year: {
      title: '與客戶的一年',
      lead: '每個客戶團隊都熟悉的節奏，瑣碎的工作替你完成。',
      steps: [
        { name: '導入', text: '行動手冊會把第一個月的步驟，作為帶日期的任務指派給負責人，就在你的團隊已在使用的看板上。' },
        { name: '採用', text: '健康評分會顯示其原因。沉默下來的客戶，或停滯的工作，會自動浮現。' },
        { name: '業務檢視', text: '記錄會議：誰出席、談了什麼。每個下一步都會變成帶負責人與日期的任務。' },
        { name: '續約', text: '在續約日期前數月，它的任務與一個續約商機會自動開啟。一切都不必等人想起。' },
      ],
    },
    meeting: {
      title: '會議上許下的承諾，都會兌現。',
      text: '當你記錄會議時，它的下一步會變成帶負責人與截止日期的任務。客戶頁面會顯示每一次會議、誰出席以及哪些步驟已完成。',
      card: {
        day: '10',
        month: '11月',
        kind: '業務檢視',
        name: '第三季業務檢視',
        ours: '我方：Zeynep Tunç、Ada Demir',
        theirs: '對方：Selin Aytaç',
        notes: '使用量超出目標；他們下一步想要行動裝置渠道，並索取了增加席次的報價。',
        steps: '下一步',
        done: '傳送增加席次的報價',
        open: '為行動裝置渠道準備一個範例旅程',
        openWho: 'Lena，11月22日前',
      },
    },
    tools: {
      title: '與你的團隊已在使用的工具協作',
      lead: '接上你已有的工具，在原處繼續工作。',
      rows: [
        { label: '聊天', names: 'Slack、Microsoft Teams、Google Chat 與電子郵件' },
        { label: 'CRM', names: 'Salesforce、HubSpot、Dynamics 365、Pipedrive、Zoho、Bitrix24、Freshsales 與 Zendesk Sell，雙向同步' },
        { label: '試算表與資料', names: 'Google Sheets、Excel 與 Google BigQuery' },
        { label: 'AI 助理', names: '透過連接器使用 Claude 與 ChatGPT' },
      ],
      none: '不接上任何工具也能運作。',
      marquee: '與你已在使用的工具協同運作',
    },
    product: {
      title: '哪位客戶需要你——一目了然',
      lead: '所有客戶集中在一個看板上，依最需要關注的順序排列。健康分、續約與下一步，各以其顏色呈現。',
      work: '每個承諾，都化為看板上的一個任務',
      portfolio: '需要你的少數客戶，不再淹沒在多數之中',
      detail: '打開一個客戶，看清原因',
      reports: '本季進展如何，一張圖看懂',
    },
    pricing: {
      title: '簡單的按席次定價',
      lead: '每個方案都以 3 個月全功能試用開始。唯讀席次免費。',
      monthly: '按月',
      yearly: '按年',
      save: '約便宜 20%',
      perSeat: '每席次每月',
      perSeatYearly: '每席次每月，按年付費',
      choose: '開始免費試用',
      business: '包含團隊版的一切，另加',
      fine: '價格以美元計；結帳時另加稅金。席次數隨加入的成員變化。付款由我們的經銷商 Paddle 處理。',
    },
    faq: {
      title: '常見問題',
      items: [
        { q: '我們的資料儲存在哪裡？', a: '資料庫位於歐盟。每家公司在資料庫層級彼此隔離，因此任何介面上的差錯都無法把一家公司的資料顯示給另一家。資料處理合約涵蓋 GDPR 與土耳其的 KVKK。' },
        { q: '可以在我們自己的伺服器上執行嗎？', a: '可以。單公司版在你自己的伺服器或雲端上執行，擁有獨立資料庫；沒有訂閱計費。' },
        { q: '需要 CRM 嗎？', a: '不需要。客戶可以從試算表匯入，或手動新增。如果你有 CRM，Curahold 會與它雙向保持同步。' },
        { q: '可以隨時取消嗎？', a: '可以。取消的方案會運作到已付費週期結束，且一切都可匯出。' },
        { q: '可以使用我們自己的稱呼嗎？', a: '可以。把你的客戶稱作帳戶、夥伴或客戶，整個介面都會隨之改變。' },
        { q: '設定需要多久？', a: '大約十五分鐘：選擇你的網址，從試算表匯入客戶，邀請你的團隊。' },
      ],
    },
    signIn: { title: '登入', text: '每家公司都有自己的網址。輸入你公司的網址即可前往其登入頁面。', label: '你的公司網址', go: '前往', close: '關閉', none: '還沒有網址？開始免費試用。' },
    footer: {
      story: '名字來自拉丁語 cura（關懷）與英語 hold（守護）。',
      help: '說明中心',
      legal: '法律',
      links: { terms: '服務條款', privacy: '隱私權政策', kvkk: 'KVKK 告知', dpa: '資料處理', subprocessors: '次要處理方', cookies: 'Cookie' },
      company: '[公司法定名稱]',
    },
  },
  ja: {
    lang: 'ja',
    title: 'Curahold：カスタマーサクセスチームのための業務管理',
    description: 'ひとりでに始まる更新、ネクストステップがタスクになるミーティング、注意が必要な顧客がひと目でわかる。',
    nav: { product: '製品', pricing: '料金', demo: 'ライブデモ', help: 'ヘルプ', signIn: 'ログイン', tryFree: '無料で試す', other: 'English' },
    hero: {
      title: 'すべての顧客を、丁寧に受けとめる。',
      lead: 'Curahold は、カスタマーサクセスと顧客管理のチームが業務を追うための場所です。更新はひとりでに始まり、ミーティングで交わした約束はすべてタスクになり、どの顧客があなたを必要としているかがひと目でわかります。',
      primary: '3か月間無料で試す',
      secondary: 'ライブデモを開く',
      note: 'カード不要。',
      customer: 'あなたの顧客',
      chips: { renewal: '更新まであと94日', review: 'ビジネスレビューが14日遅延', step: 'ネクストステップ：見積もりを送付、Zeynep', health: 'ヘルススコア66、要注目' },
    },
    year: {
      title: '顧客と過ごす1年',
      lead: 'どの顧客チームも知っているリズムを、雑務はあなたの代わりに片づけた形で。',
      steps: [
        { name: 'オンボーディング', text: 'プレイブックが初月のステップを、担当者向けの期日つきタスクとして、チームがすでに使っているボード上に開きます。' },
        { name: '定着', text: 'ヘルススコアはその理由を示します。静かになった顧客や、止まった作業が、ひとりでに前に出てきます。' },
        { name: 'ビジネスレビュー', text: 'ミーティングを記録：誰が出席し、何が話されたか。すべてのネクストステップが担当者と期日つきのタスクになります。' },
        { name: '更新', text: '更新日の数か月前に、そのタスクと更新商談がひとりでに開きます。誰かが思い出すのを待つものは何もありません。' },
      ],
    },
    meeting: {
      title: 'ミーティングで交わした約束は、守られる。',
      text: 'ミーティングを記録すると、そのネクストステップが担当者と期日つきのタスクになります。顧客ページには、すべてのミーティング、出席者、完了したステップが表示されます。',
      card: {
        day: '10',
        month: '11月',
        kind: 'ビジネスレビュー',
        name: '第3四半期ビジネスレビュー',
        ours: '当社側：Zeynep Tunç、Ada Demir',
        theirs: '先方：Selin Aytaç',
        notes: '利用は目標を上回っています。次はモバイルチャネルを希望し、追加シートの見積もりを求めています。',
        steps: 'ネクストステップ',
        done: '追加シートの見積もりを送る',
        open: 'モバイルチャネル向けのサンプルジャーニーを用意する',
        openWho: 'Lena、11月22日まで',
      },
    },
    tools: {
      title: 'チームがすでに使っているツールと',
      lead: '手持ちのものをつないで、いまいる場所で働き続ける。',
      rows: [
        { label: 'チャット', names: 'Slack、Microsoft Teams、Google Chat、メール' },
        { label: 'CRM', names: 'Salesforce、HubSpot、Dynamics 365、Pipedrive、Zoho、Bitrix24、Freshsales、Zendesk Sell と双方向で' },
        { label: 'スプレッドシートとデータ', names: 'Google Sheets、Excel、Google BigQuery' },
        { label: 'AI アシスタント', names: 'コネクタ経由で Claude と ChatGPT' },
      ],
      none: 'どれがなくても使えます。',
      marquee: 'すでにお使いのツールと連携します',
    },
    product: {
      title: 'どの顧客があなたを必要としているか——ひと目で',
      lead: 'すべての顧客を一つのボードに、対応が必要な順に並べて。ヘルススコア、更新、次の一手を、それぞれの色で。',
      work: 'すべての約束を、ボード上のタスクに',
      portfolio: 'あなたを必要とする少数が、多数に埋もれない',
      detail: '一社開けば、理由がそのまま見える',
      reports: '四半期の動きが、ひと目のグラフで',
    },
    pricing: {
      title: 'シンプルな、シート単位の料金',
      lead: 'どのプランも全機能の3か月間トライアルから。閲覧シートは無料。',
      monthly: '月額',
      yearly: '年額',
      save: '約20%お得',
      perSeat: '1シートあたり月額',
      perSeatYearly: '1シートあたり月額、年払い',
      choose: '無料トライアルを始める',
      business: 'チームのすべてに加えて',
      fine: '価格は米ドル。税は決済時に加算されます。シート数は参加した人数に従います。決済は再販業者の Paddle が処理します。',
    },
    faq: {
      title: 'よくある質問',
      items: [
        { q: 'データはどこに保管されますか？', a: 'データベースは欧州連合にあります。各社はデータベース自体で互いに分離されるため、画面上のどんな誤りでも、ある会社に別の会社のデータが表示されることはありません。データ処理契約は GDPR とトルコの KVKK をカバーします。' },
        { q: '自社サーバーで運用できますか？', a: 'はい。シングルカンパニー版は、専用データベースとともにあなたのサーバーまたはクラウドで動作し、課金はありません。' },
        { q: 'CRM は必要ですか？', a: 'いいえ。顧客はスプレッドシートから取り込むことも、手動で追加することもできます。CRM があれば、Curahold はそれと双方向で同期を保ちます。' },
        { q: 'いつでも解約できますか？', a: 'はい。解約したプランは支払い済み期間の終わりまで動作し、すべてをエクスポートできます。' },
        { q: '自社の呼び方を使えますか？', a: 'はい。顧客をアカウント、パートナー、クライアントと呼べば、インターフェース全体がそれに従います。' },
        { q: 'セットアップはどのくらいかかりますか？', a: '約15分：アドレスを選び、顧客をスプレッドシートから取り込み、チームを招待します。' },
      ],
    },
    signIn: { title: 'ログイン', text: '各社に専用のアドレスがあります。自社のアドレスを入力して、そのログインページへ進みます。', label: '会社のアドレス', go: '移動', close: '閉じる', none: 'まだアドレスがない？無料トライアルを始めましょう。' },
    footer: {
      story: '名前はラテン語の cura（ケア）と英語の hold（抱える）に由来します。',
      help: 'ヘルプセンター',
      legal: '法的情報',
      links: { terms: '利用規約', privacy: 'プライバシーポリシー', kvkk: 'KVKK 通知', dpa: 'データ処理', subprocessors: 'サブプロセッサー', cookies: 'Cookie' },
      company: '[会社正式名称]',
    },
  },
  ko: {
    lang: 'ko',
    title: 'Curahold: 고객 성공 팀을 위한 업무 관리',
    description: '저절로 시작되는 갱신, 다음 단계가 작업이 되는 미팅, 그리고 관심이 필요한 모든 고객을 한눈에.',
    nav: { product: '제품', pricing: '가격', demo: '라이브 데모', help: '도움말', signIn: '로그인', tryFree: '무료로 시작', other: 'English' },
    hero: {
      title: '모든 고객을 정성껏 붙잡으세요.',
      lead: 'Curahold는 고객 성공과 고객 관리 팀이 업무를 추적하는 곳입니다. 갱신은 저절로 시작되고, 미팅에서 한 모든 약속은 작업이 되며, 어떤 고객이 당신을 필요로 하는지 한눈에 보입니다.',
      primary: '3개월 무료로 시작',
      secondary: '라이브 데모 열기',
      note: '카드가 필요 없습니다.',
      customer: '당신의 고객',
      chips: { renewal: '94일 후 갱신', review: '비즈니스 리뷰 14일 지연', step: '다음 단계: 견적 보내기, Zeynep', health: '헬스 스코어 66, 주목 필요' },
    },
    year: {
      title: '고객과 함께한 1년',
      lead: '모든 고객 팀이 아는 리듬을, 번거로운 일은 대신 처리해 둔 채로.',
      steps: [
        { name: '온보딩', text: '플레이북이 첫 달의 단계를 담당자용 기한 작업으로, 팀이 이미 사용하는 보드 위에 열어 줍니다.' },
        { name: '정착', text: '헬스 스코어가 그 이유를 보여 줍니다. 조용해진 고객이나 멈춘 작업이 저절로 앞으로 나옵니다.' },
        { name: '비즈니스 리뷰', text: '미팅을 기록하세요: 누가 참석했고 무엇을 이야기했는지. 모든 다음 단계가 담당자와 기한이 있는 작업이 됩니다.' },
        { name: '갱신', text: '갱신일 몇 달 전에, 그 작업과 갱신 기회가 저절로 열립니다. 누군가 기억하기를 기다리는 것은 없습니다.' },
      ],
    },
    meeting: {
      title: '미팅에서 한 약속은 지켜집니다.',
      text: '미팅을 기록하면 그 다음 단계가 담당자와 마감일이 있는 작업이 됩니다. 고객 페이지에는 모든 미팅, 참석자, 완료된 단계가 표시됩니다.',
      card: {
        day: '10',
        month: '11월',
        kind: '비즈니스 리뷰',
        name: '3분기 비즈니스 리뷰',
        ours: '우리 측: Zeynep Tunç, Ada Demir',
        theirs: '상대 측: Selin Aytaç',
        notes: '사용량이 목표를 웃돕니다. 다음으로 모바일 채널을 원하며 추가 좌석 견적을 요청했습니다.',
        steps: '다음 단계',
        done: '추가 좌석 견적 보내기',
        open: '모바일 채널용 샘플 여정 준비하기',
        openWho: 'Lena, 11월 22일까지',
      },
    },
    tools: {
      title: '팀이 이미 사용하는 도구와 함께',
      lead: '가진 것을 연결하고, 있던 자리에서 계속 일하세요.',
      rows: [
        { label: '채팅', names: 'Slack, Microsoft Teams, Google Chat, 이메일' },
        { label: 'CRM', names: 'Salesforce, HubSpot, Dynamics 365, Pipedrive, Zoho, Bitrix24, Freshsales, Zendesk Sell와 양방향' },
        { label: '스프레드시트와 데이터', names: 'Google Sheets, Excel, Google BigQuery' },
        { label: 'AI 어시스턴트', names: '커넥터를 통해 Claude와 ChatGPT' },
      ],
      none: '아무것도 연결하지 않아도 작동합니다.',
      marquee: '이미 쓰고 있는 도구와 함께 작동합니다',
    },
    product: {
      title: '어떤 고객이 당신을 필요로 하는지 — 한눈에',
      lead: '모든 고객을 하나의 보드에, 먼저 챙겨야 할 순서로. 헬스 점수, 갱신, 다음 단계를 각각의 색으로.',
      work: '모든 약속이 보드 위의 작업으로',
      portfolio: '당신이 필요한 소수가 다수 속에 묻히지 않도록',
      detail: '하나를 열면, 이유가 그대로 보인다',
      reports: '이번 분기 흐름을, 차트 한 장으로',
    },
    pricing: {
      title: '간단한 좌석당 가격',
      lead: '모든 플랜은 모든 기능의 3개월 체험으로 시작합니다. 보기 전용 좌석은 무료입니다.',
      monthly: '월간',
      yearly: '연간',
      save: '약 20% 저렴',
      perSeat: '좌석당 월',
      perSeatYearly: '좌석당 월, 연 결제 시',
      choose: '무료 체험 시작',
      business: '팀의 모든 것에 더해',
      fine: '가격은 미국 달러이며, 세금은 결제 시 추가됩니다. 좌석 수는 합류한 인원을 따릅니다. 결제는 리셀러인 Paddle이 처리합니다.',
    },
    faq: {
      title: '자주 묻는 질문',
      items: [
        { q: '데이터는 어디에 보관되나요?', a: '데이터베이스는 유럽 연합에 있습니다. 각 회사는 데이터베이스 자체에서 서로 분리되므로, 화면의 어떤 오류도 한 회사에 다른 회사의 데이터를 보여줄 수 없습니다. 데이터 처리 계약은 GDPR과 튀르키예의 KVKK를 포함합니다.' },
        { q: '자체 서버에서 실행할 수 있나요?', a: '네. 단일 회사 패키지는 전용 데이터베이스와 함께 당신의 서버나 클라우드에서 실행되며, 구독 요금이 없습니다.' },
        { q: 'CRM이 필요한가요?', a: '아니요. 고객은 스프레드시트에서 가져오거나 직접 추가할 수 있습니다. CRM이 있다면 Curahold가 양방향으로 동기화를 유지합니다.' },
        { q: '언제든 해지할 수 있나요?', a: '네. 해지한 플랜은 결제한 기간이 끝날 때까지 작동하며, 모든 것을 내보낼 수 있습니다.' },
        { q: '우리만의 용어를 쓸 수 있나요?', a: '네. 고객을 계정, 파트너 또는 클라이언트로 부르면 인터페이스 전체가 그에 따릅니다.' },
        { q: '설정에 얼마나 걸리나요?', a: '약 15분: 주소를 선택하고, 스프레드시트에서 고객을 가져오고, 팀을 초대합니다.' },
      ],
    },
    signIn: { title: '로그인', text: '회사마다 고유한 주소가 있습니다. 회사 주소를 입력하면 해당 로그인 페이지로 이동합니다.', label: '회사 주소', go: '이동', close: '닫기', none: '아직 주소가 없나요? 무료 체험을 시작하세요.' },
    footer: {
      story: '이름은 라틴어 cura(돌봄)와 영어 hold(지키다)에서 왔습니다.',
      help: '도움말 센터',
      legal: '법적 고지',
      links: { terms: '서비스 약관', privacy: '개인정보 처리방침', kvkk: 'KVKK 고지', dpa: '데이터 처리', subprocessors: '하위 처리자', cookies: '쿠키' },
      company: '[회사 법인명]',
    },
  },
};

// The locales whose marketing copy is authored and ready to publish, English
// first. Adding a language to the sales site is one step: author its COPY
// entry above and it appears here on its own. Until a locale has copy, every
// visitor who asks for it reads the English — the builder never ships a page
// of machine text dressed as native.
export const SITE_LOCALES = Object.keys(COPY) as Locale[];

/** The copy for a locale, falling back to English until a native pass lands. */
export const siteCopy = (locale: Locale): SiteCopy => COPY[locale] ?? COPY.en!;

/** The consent words for a locale, English as the fallback. */
export const siteConsent = (locale: Locale): SiteConsentCopy => siteCopy(locale).consent ?? COPY.en!.consent!;

/** The blog index labels for a locale, English as the fallback. */
export const siteBlog = (locale: Locale): SiteBlogCopy => siteCopy(locale).blog ?? COPY.en!.blog!;

// Blog posts, authored per language. A locale appears on the blog only when it
// has native posts here — the builder never dresses English text as another
// language, so hreflang on a post lists only the languages it truly exists in.
// Content is invented and genuinely useful; it names no real person or company.
export const BLOG_POSTS: Partial<Record<Locale, BlogPost[]>> = {
  en: [
    {
      slug: 'what-is-task-management',
      title: 'What is task management? A practical guide for customer teams',
      description:
        'A plain guide to task management for customer success and account teams: what a task really is, the few fields that matter, and how to keep a shared list honest.',
      date: '2026-10-06',
      readMinutes: 6,
      tags: ['Task management', 'Customer success', 'Workflows'],
      body: [
        {
          p: 'Task management is the practice of capturing the work that needs doing, giving each piece an owner and a date, and keeping the list honest as things change. For a customer success or account team, it is the difference between remembering a renewal in time and finding out a week too late.',
        },
        { h: 'A task is a promise with an owner and a date' },
        {
          p: 'The smallest useful unit is a single task: one clear outcome, one person responsible, one due date. Everything else — notes, links, the customer it belongs to — is context. When a task has no owner or no date, it is not a task yet; it is a wish, and wishes are what slip.',
        },
        { h: 'The few fields that actually matter' },
        {
          ul: [
            'Title: the outcome in plain words, not the activity. “Send the renewal quote”, not “Renewal”.',
            'Owner: exactly one person, even if others help.',
            'Due date: a real date, so the list can sort by what is next.',
            'Status: where it stands — to do, in progress, done — and nothing more elaborate until you need it.',
            'Context: the customer, the meeting or the thread it came from, one click away.',
          ],
        },
        { h: 'Keep the list honest' },
        {
          p: 'A task list is only useful if the team trusts it. That trust is built by two habits: nothing lives in your head or your inbox that is not also a task, and a task is closed the moment it is done — not batched up for a weekly tidy. A list that lags reality quietly stops being read.',
        },
        {
          quote: 'The best task list is the one your team actually opens on a Monday morning — because it has never once lied to them.',
        },
        { h: 'Where task management meets the customer' },
        {
          p: 'Generic to-do apps treat every task the same. Customer teams do not work that way: a task almost always belongs to an account, a meeting, or a renewal. When the task lives next to that context — and when finishing a business review can create its follow-ups automatically — the list stops being busywork and starts being the plan. That hybrid of tasks and customer context is exactly what Curahold is built around.',
        },
      ],
    },
    {
      slug: 'turn-meetings-into-tasks',
      title: 'Turning meeting notes into tasks: a workflow that actually sticks',
      description:
        'Most next steps die in a notebook. Here is a simple meeting-to-task workflow — owners, dates and context — that keeps promises from a call from being lost.',
      date: '2026-10-20',
      readMinutes: 5,
      tags: ['Task management', 'Meetings', 'Customer success'],
      body: [
        {
          p: 'Every account team has lived this: a good meeting, three clear next steps, warm goodbyes — and two weeks later nobody can say who owned what. The notes were written; the tasks were not. Turning meeting notes into tasks is the single highest-leverage habit a customer team can build.',
        },
        { h: 'Separate what was said from what will be done' },
        {
          p: 'A meeting note has two kinds of lines: a record of what happened, and a commitment about what comes next. Only the second kind becomes a task. As you write, mark the commitments — a simple convention like a leading arrow works — so the next steps are obvious before you even leave the call.',
        },
        { h: 'Give every next step the three things' },
        {
          ul: [
            'An owner, named out loud in the meeting so there is no surprise later.',
            'A due date, agreed in the room rather than invented afterwards.',
            'The context: which customer, and a link back to the note it came from.',
          ],
        },
        { h: 'Do it before the context is gone' },
        {
          p: 'The window for this is minutes, not days. The further you get from the meeting, the more detail you lose and the less likely the tasks are to be created at all. The best workflow captures the tasks as part of closing the meeting — not as a separate chore you promise to do later.',
        },
        {
          quote: 'A promise made in a meeting and written down as a task with an owner and a date is kept. A promise left in the notes is a hope.',
        },
        { h: 'Let the system carry the busywork' },
        {
          p: 'The reason this habit fails is friction: retyping names, re-finding the account, copying dates. Remove the friction and the habit holds. In Curahold, logging a meeting turns its next steps into tasks on the right board, already attached to the customer — so the record and the plan are the same act.',
        },
      ],
    },
    {
      slug: 'task-management-vs-project-management',
      title: 'Task management vs. project management: which does your account team need?',
      description:
        'Task management and project management solve different problems. Here is how to tell them apart, and why customer teams usually need tasks tied to accounts — not a project plan.',
      date: '2026-11-03',
      readMinutes: 7,
      tags: ['Task management', 'Project management', 'Tools'],
      body: [
        {
          p: '“Task management” and “project management” are often used as if they were the same thing. They are not, and choosing the wrong one is how teams end up fighting their tools. The short version: task management keeps ongoing work moving; project management steers a defined piece of work to a finish line.',
        },
        { h: 'What project management is good at' },
        {
          p: 'A project has a start, an end, and a scope: a launch, a migration, an implementation. Project management tools shine here — dependencies, timelines, phases, a critical path. If your work is a sequence of steps toward a one-time outcome, that structure earns its keep.',
        },
        { h: 'What task management is good at' },
        {
          p: 'Most customer success and account work is not a project. It is an endless, repeating rhythm: onboardings, check-ins, business reviews, renewals, the quiet signal that an account has gone cold. There is no finish line — there is next week. Task management fits this: a living list, owned and dated, that you can trust at a glance.',
        },
        { h: 'How to tell which you need' },
        {
          ul: [
            'If the work ends, you probably want project management.',
            'If the work repeats per customer, forever, you want task management.',
            'If a task only makes sense next to the account it belongs to, you want task management with customer context — not a standalone to-do app, and not a Gantt chart.',
          ],
        },
        { h: 'The hybrid most account teams actually want' },
        {
          p: 'The honest answer for a customer team is usually a hybrid: task management as the backbone, with each task tied to the customer, the meeting and the renewal it serves — plus a little project structure for the occasional onboarding or migration. That is the gap Curahold is built for: tasks that live where the customer does.',
        },
        {
          quote: 'Pick the tool that matches the shape of your work. Customer work is a rhythm, not a deadline — so it needs a list you trust, not a plan you finish.',
        },
      ],
    },
  ],
  tr: [
    {
      slug: 'what-is-task-management',
      title: 'Görev yönetimi nedir? Müşteri ekipleri için pratik bir rehber',
      description:
        'Müşteri başarısı ve müşteri yönetimi ekipleri için sade bir görev yönetimi rehberi: görev aslında nedir, hangi birkaç alan önemlidir ve ortak listeyi nasıl dürüst tutarsın.',
      date: '2026-10-06',
      readMinutes: 6,
      tags: ['Görev yönetimi', 'Müşteri başarısı', 'İş akışları'],
      body: [
        {
          p: 'Görev yönetimi; yapılması gereken işi yakalama, her parçaya bir sorumlu ve bir tarih verme ve işler değiştikçe listeyi dürüst tutma pratiğidir. Bir müşteri başarısı ya da müşteri yönetimi ekibi için bu, bir yenilemeyi zamanında hatırlamakla bir hafta geç fark etmek arasındaki farktır.',
        },
        { h: 'Görev, sorumlusu ve tarihi olan bir sözdür' },
        {
          p: 'En küçük işe yarar birim tek bir görevdir: tek bir net sonuç, tek bir sorumlu kişi, tek bir son tarih. Geri kalan her şey — notlar, bağlantılar, ait olduğu müşteri — bağlamdır. Bir görevin sorumlusu ya da tarihi yoksa o henüz bir görev değildir; bir dilektir ve kayanlar hep dileklerdir.',
        },
        { h: 'Gerçekten önemli olan birkaç alan' },
        {
          ul: [
            'Başlık: sonucu sade sözlerle; eylemi değil. “Yenileme teklifini gönder”, “Yenileme” değil.',
            'Sorumlu: başkaları yardım etse bile tam olarak tek kişi.',
            'Son tarih: gerçek bir tarih, ki liste sırada ne olduğuna göre sıralanabilsin.',
            'Durum: nerede olduğu — yapılacak, yapılıyor, bitti — ve ihtiyaç olana kadar daha fazlası değil.',
            'Bağlam: geldiği müşteri, toplantı ya da konu, tek tıkla erişilir.',
          ],
        },
        { h: 'Listeyi dürüst tut' },
        {
          p: 'Bir görev listesi ancak ekip ona güvenirse işe yarar. Bu güven iki alışkanlıkla kurulur: kafanda ya da gelen kutunda görev olmayan hiçbir şey yaşamaz ve bir görev bittiği an kapatılır — haftalık toplu temizliğe bırakılmaz. Gerçeğin gerisinde kalan liste sessizce okunmaz olur.',
        },
        {
          quote: 'En iyi görev listesi, ekibinin pazartesi sabahı gerçekten açtığı listedir — çünkü onlara bir kez bile yalan söylememiştir.',
        },
        { h: 'Görev yönetimi müşteriyle buluştuğunda' },
        {
          p: 'Genel yapılacaklar uygulamaları her görevi aynı sayar. Müşteri ekipleri böyle çalışmaz: bir görev neredeyse her zaman bir müşteriye, bir toplantıya ya da bir yenilemeye aittir. Görev o bağlamın yanında yaşadığında — ve bir iş değerlendirmesini bitirmek takip adımlarını kendiliğinden oluşturabildiğinde — liste angarya olmaktan çıkar, planın kendisi olur. Görevlerle müşteri bağlamının bu melezi, Curahold’un tam da üzerine kurulduğu şeydir.',
        },
      ],
    },
    {
      slug: 'turn-meetings-into-tasks',
      title: 'Toplantı notlarını göreve dönüştürmek: gerçekten yerleşen bir akış',
      description:
        'Çoğu sonraki adım bir defterde ölür. İşte bir toplantıdaki sözlerin kaybolmasını önleyen sade bir toplantı-görev akışı — sorumlular, tarihler ve bağlam.',
      date: '2026-10-20',
      readMinutes: 5,
      tags: ['Görev yönetimi', 'Toplantılar', 'Müşteri başarısı'],
      body: [
        {
          p: 'Her müşteri ekibi bunu yaşamıştır: iyi bir toplantı, üç net sonraki adım, sıcak vedalar — ve iki hafta sonra kimin neyi üstlendiğini kimse söyleyemez. Notlar yazıldı; görevler yazılmadı. Toplantı notlarını göreve dönüştürmek, bir müşteri ekibinin kurabileceği en yüksek kaldıraçlı alışkanlıktır.',
        },
        { h: 'Söyleneni yapılacaktan ayır' },
        {
          p: 'Bir toplantı notunda iki tür satır vardır: olanın kaydı ve bundan sonrasına dair taahhüt. Yalnızca ikinci tür göreve dönüşür. Yazarken taahhütleri işaretle — başına bir ok koymak gibi basit bir alışkanlık yeter — ki sonraki adımlar sen görüşmeden çıkmadan belli olsun.',
        },
        { h: 'Her sonraki adıma üç şeyi ver' },
        {
          ul: [
            'Bir sorumlu; toplantıda yüksek sesle söylenmiş olsun ki sonradan sürpriz olmasın.',
            'Bir son tarih; sonradan uydurulan değil, odada anlaşılan.',
            'Bağlam: hangi müşteri ve geldiği nota bir bağlantı.',
          ],
        },
        { h: 'Bağlam kaybolmadan yap' },
        {
          p: 'Bunun için pencere dakikalarla ölçülür, günlerle değil. Toplantıdan uzaklaştıkça daha çok ayrıntı kaybeder ve görevlerin hiç oluşturulmama olasılığı artar. En iyi akış, görevleri toplantıyı kapatmanın bir parçası olarak yakalar — sonra yaparım diye söz verdiğin ayrı bir angarya olarak değil.',
        },
        {
          quote: 'Toplantıda verilen ve sorumlusu ile tarihiyle göreve yazılan söz tutulur. Notta kalan söz bir umuttur.',
        },
        { h: 'Angaryayı sisteme taşıt' },
        {
          p: 'Bu alışkanlığın başarısız olma nedeni sürtünmedir: isimleri yeniden yazmak, müşteriyi yeniden bulmak, tarihleri kopyalamak. Sürtünmeyi kaldır, alışkanlık yerleşsin. Curahold’da bir toplantıyı kaydetmek, sonraki adımları doğru panoda, müşteriye zaten bağlı görevlere çevirir — böylece kayıt ve plan tek bir eylem olur.',
        },
      ],
    },
    {
      slug: 'task-management-vs-project-management',
      title: 'Görev yönetimi mi, proje yönetimi mi: müşteri ekibin hangisine ihtiyaç duyar?',
      description:
        'Görev yönetimi ve proje yönetimi farklı sorunları çözer. İkisini nasıl ayırt edeceğini ve müşteri ekiplerinin neden bir proje planına değil, müşteriye bağlı görevlere ihtiyaç duyduğunu anlatıyoruz.',
      date: '2026-11-03',
      readMinutes: 7,
      tags: ['Görev yönetimi', 'Proje yönetimi', 'Araçlar'],
      body: [
        {
          p: '“Görev yönetimi” ve “proje yönetimi” sık sık aynı şeymiş gibi kullanılır. Değildir ve yanlışını seçmek, ekiplerin araçlarıyla savaşmaya başlama biçimidir. Kısacası: görev yönetimi süregelen işi yürütür; proje yönetimi, tanımlı bir işi bir bitiş çizgisine götürür.',
        },
        { h: 'Proje yönetimi neyde iyidir' },
        {
          p: 'Bir projenin başı, sonu ve kapsamı vardır: bir lansman, bir göç, bir kurulum. Proje yönetimi araçları burada parlar — bağımlılıklar, zaman çizelgeleri, aşamalar, kritik yol. İşin tek seferlik bir sonuca giden adımlar dizisiyse bu yapı hakkını verir.',
        },
        { h: 'Görev yönetimi neyde iyidir' },
        {
          p: 'Çoğu müşteri başarısı ve müşteri yönetimi işi bir proje değildir. Bitmeyen, tekrar eden bir ritimdir: başlangıçlar, durum görüşmeleri, iş değerlendirmeleri, yenilemeler, bir müşterinin sessizleştiğine dair o sinyal. Bitiş çizgisi yoktur — gelecek hafta vardır. Görev yönetimi buna uyar: sahipli ve tarihli, bir bakışta güvenebileceğin yaşayan bir liste.',
        },
        { h: 'Hangisine ihtiyacın olduğunu nasıl anlarsın' },
        {
          ul: [
            'İş bitiyorsa muhtemelen proje yönetimi istersin.',
            'İş her müşteri için sonsuza dek tekrar ediyorsa görev yönetimi istersin.',
            'Bir görev yalnızca ait olduğu müşterinin yanında anlam kazanıyorsa, müşteri bağlamlı görev yönetimi istersin — ne tek başına bir yapılacaklar uygulaması, ne de bir Gantt şeması.',
          ],
        },
        { h: 'Çoğu müşteri ekibinin aslında istediği melez' },
        {
          p: 'Bir müşteri ekibi için dürüst cevap genellikle bir melezdir: omurga olarak görev yönetimi, her görev hizmet ettiği müşteriye, toplantıya ve yenilemeye bağlı — artı ara sıraki bir başlangıç ya da göç için biraz proje yapısı. Curahold’un kurulduğu boşluk tam da budur: müşterinin yaşadığı yerde yaşayan görevler.',
        },
        {
          quote: 'İşinin biçimine uyan aracı seç. Müşteri işi bir son tarih değil, bir ritimdir — bu yüzden bitirdiğin bir plana değil, güvendiğin bir listeye ihtiyaç duyar.',
        },
      ],
    },
  ],
};

/** The locales the blog is published in — only those with native posts above. */
export const BLOG_LOCALES = Object.keys(BLOG_POSTS) as Locale[];

/** The posts for a locale (empty when the blog is not published in it). */
export const blogPosts = (locale: Locale): BlogPost[] => BLOG_POSTS[locale] ?? [];
