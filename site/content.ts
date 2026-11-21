// The sales site's words, in eleven languages. Prices and what each plan
// includes come from shared/src/billing.ts and the app's own dictionaries,
// so the site and the product never disagree.
//
// Every language carries every string: tests/site-copy.test.ts fails when a
// language misses a key or still holds the English wording. Customer names
// are invented (the same ones as the demo) and stay as they are written.

import { gated } from './gates';
import type { SiteLocale } from './locales';

export { SITE_LOCALES, type SiteLocale } from './locales';

export interface SiteCopy {
  nav: { product: string; pricing: string; demo: string; blog: string; help: string; signIn: string; tryFree: string; skip: string };
  /** `works` introduces the strip of tools under the product tour. */
  /** The H1 is the kicker (the category) and the title (the outcome); the CTA labels are the header's (site/info). */
  hero: { kicker: string; title: string; lead: string; note: string; works: string; pause: string; play: string };
  /** The live product tour in the hero: four chapters of one customer's loop. */
  tour: SiteTourCopy;
  /** The bento of what sets Curahold apart: six tiles, each a living mini-UI. */
  bento: SiteBentoCopy;
  pricing: { title: string; lead: string; monthly: string; yearly: string;
    /**
     * The yearly saving next to the interval switch. A price-related figure, so it sits behind the price gate
     * (`⟦price|…|⟧`, site/gates.ts): no price figures in public material while pricing is an open owner decision.
     */
    save: string;
    /** The landing page's two-line summary: {from} is the lowest monthly seat price (a yearly plan); `see` links to /pricing/. */
    summary: string;
    see: string;
    perSeat: string; perSeatYearly: string; business: string; fine: string;
    /** On each plan card while the prices are not published (SITE_PRICES, site/gates.ts). */
    announced: string };
  faq: { title: string; items: { q: string; a: string }[] };
  /** The closing call to action. */
  cta: { title: string; text: string };
  /** `placeholder` is an example address: lower-case Latin letters, as an address has to be. */
  signIn: { title: string; text: string; label: string; placeholder: string; go: string; close: string; none: string };
  footer: { story: string; help: string; legal: string; links: { terms: string; privacy: string; kvkk: string; dpa: string; subprocessors: string; cookies: string; refunds: string; accessibility: string; sla: string; aup: string; orderForm: string; disclosure: string }; company: string };
  consent: SiteConsentCopy;
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
  /** The search title and description (45–60 and 100–160 characters); the page shows `title` and `description`. */
  seo: [title: string, description: string];
  title: string;
  description: string;
  /** ISO date (YYYY-MM-DD) the post was published. */
  date: string;
  readMinutes: number;
  tags: string[];
  body: BlogBlock[];
}

/** The hero's product tour. Chapters run in loop order: health, promises, renewals, sprints. */
export interface SiteTourCopy {
  /** Accessible name of the chapter tabs. */
  label: string;
  /** Four chapters: a short tab word, a headline and one sentence. */
  steps: { tab: string; title: string; text: string }[];
  /** Words inside the film that the app's own dictionaries do not carry in every language. */
  ui: {
    /** The signal an account row carries: a late business review, a renewal coming up. */
    chips: { review: string; renewal: string };
    /** The logged meeting: its kind, its name, who was there, and its two next steps. */
    meeting: { kind: string; name: string; ours: string; theirs: string; steps: string[] };
    /** A task that was already waiting in "To do" before the meeting. */
    todo: string;
    /** Toast after the meeting's next steps are saved. */
    tasksOpened: string;
    /** Name of the playbook the renewal starts with. */
    playbook: string;
    /** Three playbook steps, in order. */
    playbookSteps: string[];
    /** Sprint name, e.g. "Sprint 24". */
    sprint: string;
    /** Sprint state chip. */
    active: string;
    /** "{done} of {total} points" — filled by the site. */
    points: string;
    /** "{n} pts left" — filled by the site. */
    ptsLeft: string;
    burndown: string;
    ideal: string;
    actual: string;
    /** The "Code review" workflow stage. */
    review: string;
    /** Three epic names. */
    epics: string[];
    /** Five sprint cards, index-aligned with SPRINT in build-site.ts. */
    tasks: string[];
  };
}

/** The bento grid. Tile order is fixed by build-site.ts: assistant, portal, sync, reports, languages, security. */
export interface SiteBentoCopy {
  title: string;
  lead: string;
  tiles: { h: string; p: string }[];
  /** The assistant thread: the question, the answer's first line, and what it did. */
  ask: { q: string; a: string; did: string };
  /** The customer's portal: the name of the plan they follow. */
  portal: { plan: string };
  /** Short security facts shown as a list in the last tile. */
  facts: string[];
}

export const COPY: Record<SiteLocale, SiteCopy> = {
  en: {
    nav: { product: 'Product', pricing: 'Pricing', demo: 'Live demo', blog: 'Blog', help: 'Help', signIn: 'Sign in', tryFree: 'Try it free', skip: 'Skip to content' },
    hero: {
      kicker: 'Work management for customer teams',
      title: 'Every renewal, every promise, every task, on time.',
      lead: 'See each customer’s health and the reasons behind it, turn a meeting’s next steps into tasks, and let renewals open themselves ninety days ahead.',
      note: '3 months free once approved, no card needed.',
      works: 'Works beside the tools you have today',
      pause: 'Pause',
      play: 'Play',
    },
    tour: {
      label: 'Product tour',
      steps: [
        { tab: 'Health', title: 'See who needs you', text: 'Every account carries a score from 0 to 100 and the reasons behind it, so the one going quiet comes forward by itself.' },
        { tab: 'Promises', title: 'Keep every promise', text: 'Log the meeting and its next steps become tasks, each with an owner and a date. Nothing said in the room gets lost.' },
        { tab: 'Renewals', title: 'Renew early', text: 'Ninety days before the date, the renewal playbook opens its tasks and a renewal opportunity. Nobody has to remember.' },
        { tab: 'Sprints', title: 'Ship in sprints', text: 'Epics, story points and linked tasks on the same boards, with a burndown that draws itself as the cards close.' },
      ],
      ui: {
        chips: { review: 'Business review 14 days late', renewal: 'Renewal in 94 days' },
        meeting: {
          kind: 'Business review',
          name: 'Q3 business review',
          ours: 'Our side: Zeynep Tunç, Ada Demir',
          theirs: 'Their side: Selin Aytaç',
          steps: ['Send the extra seats quote', 'Draft the usage report for their finance team'],
        },
        todo: 'Share the usage report',
        tasksOpened: '2 tasks opened',
        playbook: 'Renewal playbook',
        playbookSteps: ['Review usage and health', 'Book the renewal call', 'Send the renewal quote'],
        sprint: 'Sprint 24',
        active: 'Active',
        points: '{done} of {total} points',
        ptsLeft: '{n} pts left',
        burndown: 'Burndown',
        ideal: 'Ideal',
        actual: 'Actual',
        review: 'Code review',
        epics: ['Billing', 'Mobile', 'Onboarding'],
        tasks: ['Usage report for the finance team', 'Welcome checklist', 'Fix the CSV export', 'Seat-based invoices', 'Push notifications on iOS'],
      },
    },
    bento: {
      title: 'The rest of the job, built in',
      lead: 'Your customers get their own door, your assistant gets real answers, and your data stays yours.',
      tiles: [
        { h: 'Ask your assistant about your accounts', p: 'Connect Claude or ChatGPT. It works as you: it sees and changes only what you can.' },
        { h: 'A portal for your customers', p: 'They sign in with a link in their email and see only what you share: their tasks, their requests, your replies.' },
        { h: 'In step with the tools you have', p: 'Your CRM, spreadsheets and chat. A change on either side shows up on the other.' },
        { h: 'The quarter on one screen', p: 'Targets, the weighted pipeline and the health of the whole portfolio, in reports and dashboards you can build yourself.' },
        { h: 'Eleven languages, right\u2011to\u2011left included', p: 'Each person picks their own. The whole interface follows, mirrored where it should be.' },
        { h: 'Your data stays yours', p: 'Every company is kept apart by row-level rules in the database itself, and tests check that separation on every change.' },
      ],
      ask: { q: 'Which accounts need me this week?', a: 'Three need your attention:', did: 'I’ve opened a task for Zeynep: book the Marevo review.' },
      portal: { plan: 'Onboarding' },
      facts: ['SSO with SAML 2.0 or OpenID Connect', 'SCIM provisioning', 'Audit log', '⟦eu|Database in the European Union|⟧', 'Runs on your own servers too'],
    },
    pricing: {
      title: 'Simple prices, per seat',
      lead: 'Every plan starts with a 3-month trial of everything. Viewer seats are free.',
      monthly: 'Monthly',
      yearly: 'Yearly',
      save: '⟦price|about 20% less|⟧',
      summary: '⟦price|From {from} per seat a month on a yearly plan. Every plan starts with three months free, no card needed.|Prices are announced at launch. Every plan starts with three months free once approved, no card needed.⟧',
      see: 'Compare the plans',
      perSeat: 'per seat a month',
      perSeatYearly: 'per seat a month, paid yearly',
      business: 'Everything in Team, plus',
      fine: '⟦price|Prices in US dollars; taxes are added at checkout. Seats follow the people who have joined. Payments are handled by Paddle, our reseller.|Taxes are added at checkout. Seats follow the people who have joined. Payments are handled by Paddle, our reseller.⟧',
      announced: 'Price announced at launch',
    },
    faq: {
      title: 'Questions',
      items: [
        { q: '⟦eu|Where is our data kept?|How is our data kept apart?⟧', a: '⟦eu|The database is in the European Union. |⟧Every company is kept apart by row-level rules in the database itself, and tests check that separation on every change. A data processing agreement is available (a draft under legal review).' },
        { q: 'Can we run it on our own servers?', a: 'Yes. A single-company package runs on your own server or cloud with its own database; it has no billing.' },
        { q: 'Do we need a CRM?', a: 'No. Customers can come from a spreadsheet, or be added by hand. If you have a CRM, Curahold keeps in step with it both ways.' },
        { q: 'Can we cancel at any time?', a: 'Yes. A cancelled plan works until the end of the period paid for, and everything can be exported.' },
        { q: 'Can we use our own words?', a: 'Yes. Call your customers accounts, partners or clients, and the whole interface follows. The app, the help center and the live demo all speak eleven languages.' },
        { q: 'How does setting up work?', a: 'Choose your address, bring your customers from a spreadsheet and invite your team. A guided setup takes you through each step.' },
      ],
    },
    cta: { title: 'Give every customer a team that never forgets.', text: 'Three months free once approved, with everything switched on. Bring your customers from a spreadsheet and a guided setup takes you through the rest.' },
    signIn: {
      title: 'Sign in',
      text: 'Every company has its own address. Type yours to go to its sign-in page.',
      label: 'Your company address',
      placeholder: 'yourcompany',
      go: 'Go',
      close: 'Close',
      none: 'No address yet? Start the free trial.',
    },
    footer: {
      story: 'The name comes from the Latin cura, care, and the English hold.',
      help: 'Help center',
      legal: 'Legal',
      links: { terms: 'Terms of service', privacy: 'Privacy policy', kvkk: 'KVKK notice', dpa: 'Data processing', subprocessors: 'Sub-processors', cookies: 'Cookies', refunds: 'Refund policy', accessibility: 'Accessibility', sla: "Service levels", aup: "Acceptable use", orderForm: "Order form", disclosure: "Report a security issue" },
      company: '[Company legal name]',
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
  },
  tr: {
    nav: { product: 'Ürün', pricing: 'Fiyatlar', demo: 'Canlı demo', blog: 'Blog', help: 'Yardım', signIn: 'Giriş yap', tryFree: 'Ücretsiz deneyin', skip: 'İçeriğe atla' },
    hero: {
      kicker: 'Müşteri ekipleri için iş yönetimi',
      title: 'Her yenileme, her söz, her görev zamanında.',
      lead: 'Her müşterinin sağlığını nedenleriyle görün, toplantıdaki sonraki adımları göreve dönüştürün; yenilemeler doksan gün önceden kendiliğinden açılsın.',
      note: 'Onaydan sonra 3 ay ücretsiz, kart gerekmez.',
      works: 'Bugünkü araçlarınızın yanında çalışır',
      pause: 'Durdur',
      play: 'Oynat',
    },
    tour: {
      label: 'Ürün turu',
      steps: [
        { tab: 'Sağlık', title: 'Sizi kimin beklediğini görün', text: 'Her müşterinin 0–100 arası bir skoru ve ardındaki nedenleri var; sessizleşen müşteri kendiliğinden öne çıkar.' },
        { tab: 'Sözler', title: 'Verilen her sözü tutun', text: 'Toplantıyı kaydedin; sonraki adımlar sorumlusu ve tarihiyle göreve dönüşsün. Masada konuşulan hiçbir şey kaybolmaz.' },
        { tab: 'Yenileme', title: 'Yenilemeye erken başlayın', text: 'Tarihten doksan gün önce yenileme playbook’u görevlerini ve yenileme fırsatını açar. Kimsenin hatırlaması gerekmez.' },
        { tab: 'Sprint', title: 'Sprint’lerle teslim edin', text: 'Epikler, hikaye puanları ve bağlı görevler aynı panolarda; kartlar kapandıkça burndown grafiği kendini çizer.' },
      ],
      ui: {
        chips: { review: 'İş değerlendirmesi 14 gün gecikti', renewal: 'Yenilemeye 94 gün var' },
        meeting: {
          kind: 'İş değerlendirmesi',
          name: '3. çeyrek iş değerlendirmesi',
          ours: 'Bizden: Zeynep Tunç, Ada Demir',
          theirs: 'Onlardan: Selin Aytaç',
          steps: ['Ek kullanıcı teklifini gönder', 'Finans ekibi için kullanım raporunu hazırla'],
        },
        todo: 'Kullanım raporunu paylaş',
        tasksOpened: '2 görev açıldı',
        playbook: 'Yenileme playbook’u',
        playbookSteps: ['Kullanımı ve sağlığı gözden geçir', 'Yenileme görüşmesini planla', 'Yenileme teklifini gönder'],
        sprint: 'Sprint 24',
        active: 'Aktif',
        points: '{done} / {total} puan bitti',
        ptsLeft: '{n} puan kaldı',
        burndown: 'Burndown grafiği',
        ideal: 'İdeal',
        actual: 'Gerçekleşen',
        review: 'Kod incelemesi',
        epics: ['Faturalama', 'Mobil', 'Kurulum'],
        tasks: ['Finans ekibi için kullanım raporu', 'Karşılama kontrol listesi', 'CSV dışa aktarımını düzelt', 'Kullanıcı bazlı faturalar', 'iOS’ta anlık bildirimler'],
      },
    },
    bento: {
      title: 'İşin geri kalanı da hazır',
      lead: 'Müşterilerinize kendi kapıları, asistanınıza gerçek cevaplar, size de verilerinizin tam kontrolü.',
      tiles: [
        { h: 'Müşterilerinizi asistanınıza sorun', p: 'Claude ya da ChatGPT’yi bağlayın. Sizin adınıza çalışır: yalnızca sizin görebildiğinizi görür, değiştirebildiğinizi değiştirir.' },
        { h: 'Müşterilerinize özel portal', p: 'E-postalarına gelen bağlantıyla girerler ve yalnızca paylaştığınızı görürler: görevlerini, taleplerini, yanıtlarınızı.' },
        { h: 'Kullandığınız araçlarla aynı adımda', p: 'CRM’iniz, tablolarınız ve sohbet uygulamanız. Bir taraftaki değişiklik diğerinde de görünür.' },
        { h: 'Çeyrek tek ekranda', p: 'Hedefler, ağırlıklı fırsat tahmini ve bütün portföyün sağlığı; kendiniz kurabileceğiniz rapor ve panellerde.' },
        { h: 'On bir dil, sağdan sola yazılanlar dahil', p: 'Herkes kendi dilini seçer. Bütün arayüz ona uyar; gereken yerde ayna gibi döner.' },
        { h: 'Verileriniz sizin kalır', p: 'Her şirket, veritabanının kendi içindeki satır kurallarıyla ayrılır; bu ayrım her değişiklikte testlerle denetlenir.' },
      ],
      ask: { q: 'Bu hafta hangi müşteriler beni bekliyor?', a: 'Üç müşteri ilgi bekliyor:', did: 'Zeynep’e bir görev açtım: Marevo değerlendirmesini planlamak.' },
      portal: { plan: 'Başlangıç' },
      facts: ['SAML 2.0 ya da OpenID Connect ile SSO', 'SCIM ile kullanıcı yönetimi', 'Denetim kaydı', '⟦eu|Veritabanı Avrupa Birliği’nde|⟧', 'Kendi sunucunuzda da çalışır'],
    },
    pricing: {
      title: 'Kullanıcı başına, sade fiyatlar',
      lead: 'Her plan, her şeyin açık olduğu 3 aylık denemeyle başlar. İzleyiciler ücretsiz.',
      monthly: 'Aylık',
      yearly: 'Yıllık',
      save: '⟦price|yaklaşık %20 daha az|⟧',
      summary: '⟦price|Fiyatlar, yıllık planda kullanıcı başına aylık {from} ile başlar. Her plan, kart gerektirmeyen üç aylık ücretsiz denemeyle başlar.|Fiyatlar lansmanda açıklanacak. Her plan, onaydan sonra kart gerektirmeyen üç aylık ücretsiz denemeyle başlar.⟧',
      see: 'Planları karşılaştırın',
      perSeat: 'kullanıcı başına, aylık',
      perSeatYearly: 'kullanıcı başına aylık, yıllık ödemede',
      business: 'Team’deki her şey, artı',
      fine: '⟦price|Fiyatlar ABD doları cinsindendir; vergiler ödeme sırasında eklenir. Kullanıcı sayısı, katılan kişi sayısına göre belirlenir. Ödemeleri satıcımız Paddle alır.|Vergiler ödeme sırasında eklenir. Kullanıcı sayısı, katılan kişi sayısına göre belirlenir. Ödemeleri satıcımız Paddle alır.⟧',
      announced: 'Fiyat lansmanda açıklanacak',
    },
    faq: {
      title: 'Sorular',
      items: [
        { q: '⟦eu|Verilerimiz nerede tutuluyor?|Verilerimiz nasıl ayrı tutuluyor?⟧', a: '⟦eu|Veritabanı Avrupa Birliği’nde. |⟧Her şirket, veritabanının kendi içindeki satır kurallarıyla ayrılır; bu ayrım her değişiklikte testlerle denetlenir. Bir veri işleme sözleşmesi mevcuttur (hukuki incelemedeki taslak).' },
        { q: 'Kendi sunucularımızda çalıştırabilir miyiz?', a: 'Evet. Tek şirketlik paket, kendi veritabanıyla kendi sunucunuzda ya da bulutunuzda çalışır; aboneliği yoktur.' },
        { q: 'CRM’imiz olması gerekiyor mu?', a: 'Hayır. Müşteriler bir tablodan gelebilir ya da elle eklenebilir. CRM’iniz varsa Curahold onunla iki yönlü uyumlu kalır.' },
        { q: 'İstediğimiz zaman iptal edebilir miyiz?', a: 'Evet. İptal edilen plan ödenmiş dönemin sonuna kadar çalışır ve her şey dışa aktarılabilir.' },
        { q: 'Kendi kelimelerimizi kullanabilir miyiz?', a: 'Evet. Müşterilerinize müşteri, partner ya da hesap deyin; bütün arayüz ona göre konuşur. Uygulama, yardım merkezi ve canlı demo on bir dilde.' },
        { q: 'Kurulum nasıl işliyor?', a: 'Adresinizi seçin, müşterilerinizi bir tablodan aktarın, ekibinizi davet edin. Rehberli kurulum her adımda size yol gösterir.' },
      ],
    },
    cta: { title: 'Her müşterinize hiçbir şeyi unutmayan bir ekip verin.', text: 'Onaydan sonra üç ay ücretsiz, her şey açık. Müşterilerinizi bir tablodan aktarın, gerisini rehberli kurulum adım adım gösterir.' },
    signIn: {
      title: 'Giriş yap',
      text: 'Her şirketin kendi adresi var. Giriş sayfasına gitmek için şirketinizin adresini yazın.',
      label: 'Şirketinizin adresi',
      placeholder: 'sirketiniz',
      go: 'Devam',
      close: 'Kapat',
      none: 'Henüz adresiniz yok mu? Ücretsiz deneyin.',
    },
    footer: {
      story: 'Adı Latince cura (özen) ile İngilizce hold (tutmak) sözcüklerinden gelir.',
      help: 'Yardım merkezi',
      legal: 'Yasal',
      links: { terms: 'Kullanım koşulları', privacy: 'Gizlilik politikası', kvkk: 'KVKK aydınlatma metni', dpa: 'Veri işleme sözleşmesi', subprocessors: 'Alt işleyenler', cookies: 'Çerezler', refunds: 'İade politikası', accessibility: 'Erişilebilirlik', sla: "Hizmet düzeyi sözleşmesi", aup: "Kabul edilebilir kullanım", orderForm: "Sipariş formu", disclosure: "Güvenlik sorunu bildirin" },
      company: '[Şirket unvanı]',
    },
    consent: {
      title: 'Gizliliğiniz, sizin seçiminiz',
      body: 'Yalnızca siteyi çalıştırmak için gerekeni kullanırız. Açık rızanızla sitenin nasıl kullanıldığını da ölçer ve Curahold’u beğenebilecek kişilere ulaşırız. Siz seçene kadar zorunlu olmayan hiçbir şey yüklenmez.',
      acceptAll: 'Tümünü kabul edin',
      rejectAll: 'Zorunlu olmayanları reddedin',
      manage: 'Tercihlerinizi yönetin',
      save: 'Tercihlerinizi kaydedin',
      close: 'Kapat',
      alwaysOn: 'Her zaman açık',
      manageTitle: 'Gizlilik tercihleri',
      necessaryTitle: 'Zorunlu',
      necessaryBody: 'Bu seçimi hatırlar ve sayfanın çalışmasını sağlar. Sizi izlemez ve kapatılamaz.',
      analyticsTitle: 'Analitik',
      analyticsBody: 'Sitenin nasıl kullanıldığını anlamamıza ve onu iyileştirmemize yardımcı olur. Google Analytics yalnızca açık rızanızla yüklenir.',
      marketingTitle: 'Pazarlama',
      marketingBody: 'Reklamlarımızın etkisini ölçmemizi ve Curahold’u faydalı bulabilecek kişilere ulaşmamızı sağlar. Meta ve TikTok pikselleri yalnızca açık rızanızla yüklenir.',
      reopen: 'Gizlilik tercihleri',
      policy: 'Çerez politikasını okuyun',
      ariaBanner: 'Gizlilik ve çerez onayı',
    },
  },
  ar: {
    nav: { product: 'المنتج', pricing: 'الأسعار', demo: 'عرض مباشر', blog: 'المدونة', help: 'المساعدة', signIn: 'تسجيل الدخول', tryFree: 'جرّبه مجانًا', skip: 'تخطَّ إلى المحتوى' },
    hero: {
      kicker: 'إدارة العمل لفرق العملاء',
      title: 'كل تجديد وكل وعد وكل مهمة في موعدها.',
      lead: 'اعرف صحة كل عميل وأسبابها، وحوّل الخطوات التالية في كل اجتماع إلى مهام، ودع التجديدات تبدأ وحدها قبل موعدها بتسعين يومًا.',
      note: '3 أشهر مجانًا بعد الموافقة، دون بطاقة دفع.',
      works: 'يعمل بجانب أدواتك الحالية',
      pause: 'إيقاف مؤقت',
      play: 'تشغيل',
    },
    tour: {
      label: 'جولة في المنتج',
      steps: [
        { tab: 'الصحة', title: 'اعرف من يحتاج إليك', text: 'لكل عميل مؤشر من 0 إلى 100 مع أسبابه، فيتقدّم العميل الذي خفت صوته من تلقاء نفسه.' },
        { tab: 'الوعود', title: 'أوفِ بكل وعد', text: 'سجّل الاجتماع فتتحول خطواته التالية إلى مهام، لكل منها مالك وتاريخ. لا يضيع شيء مما قيل.' },
        { tab: 'التجديدات', title: 'ابدأ التجديد مبكرًا', text: 'قبل الموعد بتسعين يومًا يفتح كتيب عمل التجديد مهامه وفرصة تجديد. لا حاجة لأن يتذكر أحد.' },
        { tab: 'السبرنتات', title: 'أنجز العمل في سبرنتات', text: 'الإيبكات ونقاط القصة والمهام المترابطة على اللوحات نفسها، ومخطط العمل المتبقي (Burndown) يرسم نفسه كلما أُغلقت البطاقات.' },
      ],
      ui: {
        chips: { review: 'مراجعة الأعمال متأخرة 14 يومًا', renewal: 'التجديد بعد 94 يومًا' },
        meeting: {
          kind: 'مراجعة أعمال',
          name: 'مراجعة أعمال الربع الثالث',
          ours: 'من جانبنا: Zeynep Tunç، Ada Demir',
          theirs: 'من جانبهم: Selin Aytaç',
          steps: ['أرسل عرض المقاعد الإضافية', 'جهّز تقرير الاستخدام لفريقهم المالي'],
        },
        todo: 'شارك تقرير الاستخدام',
        tasksOpened: 'فُتحت مهمتان',
        playbook: 'كتيب عمل التجديد',
        playbookSteps: ['راجع الاستخدام والصحة', 'احجز مكالمة التجديد', 'أرسل عرض التجديد'],
        sprint: 'سبرنت 24',
        active: 'نشط',
        points: '{done} من {total} نقطة',
        ptsLeft: 'متبقٍّ {n} نقطة',
        burndown: 'مخطط الاحتراق',
        ideal: 'المثالي',
        actual: 'الفعلي',
        review: 'مراجعة الكود',
        epics: ['الفوترة', 'الجوال', 'الاستقبال'],
        tasks: ['تقرير استخدام للفريق المالي', 'قائمة الترحيب', 'إصلاح تصدير CSV', 'فواتير حسب المقاعد', 'إشعارات فورية على iOS'],
      },
    },
    bento: {
      title: 'بقية العمل جاهزة أيضًا',
      lead: 'لعملائك بابهم الخاص، ولمساعدك إجابات حقيقية، وبياناتك تبقى لك.',
      tiles: [
        { h: 'اسأل مساعدك عن عملائك', p: 'اربط Claude أو ChatGPT. يعمل بصفتك: لا يرى ولا يغيّر إلا ما تستطيع أنت.' },
        { h: 'بوابة لعملائك', p: 'يدخلون برابط يصلهم بالبريد ويرون ما تشاركه فقط: مهامهم وطلباتهم وردودك.' },
        { h: 'على إيقاع أدواتك', p: 'نظام إدارة العملاء والجداول وتطبيق المحادثة. أي تغيير في طرف يظهر في الآخر.' },
        { h: 'الربع كله على شاشة واحدة', p: 'الأهداف والفرص المرجّحة وصحة المحفظة كلها، في تقارير ولوحات معلومات تبنيها بنفسك.' },
        { h: 'إحدى عشرة لغة، ومنها ما يُكتب من اليمين', p: 'كلٌّ يختار لغته، فتتبعه الواجهة كلها وتنعكس حيث يلزم.' },
        { h: 'بياناتك تبقى لك', p: 'تُفصل كل شركة بقواعد على مستوى الصفوف في قاعدة البيانات نفسها، وتتحقق الاختبارات من هذا الفصل مع كل تغيير.' },
      ],
      ask: { q: 'أي العملاء يحتاجون إليّ هذا الأسبوع؟', a: 'ثلاثة يحتاجون إلى اهتمامك:', did: 'فتحتُ مهمة لـ Zeynep: حجز مراجعة Marevo.' },
      portal: { plan: 'الاستقبال' },
      facts: ['دخول موحّد عبر SAML 2.0 أو OpenID Connect', 'إدارة المستخدمين عبر SCIM', 'سجل التدقيق', '⟦eu|قاعدة البيانات في الاتحاد الأوروبي|⟧', 'يعمل على خوادمك أيضًا'],
    },
    pricing: {
      title: 'أسعار بسيطة، لكل مقعد',
      lead: 'تبدأ كل خطة بتجربة مجانية لكل شيء لمدة 3 أشهر. مقاعد المشاهدة مجانية.',
      monthly: 'شهري',
      yearly: 'سنوي',
      save: '⟦price|أقل بنحو 20٪|⟧',
      summary: '⟦price|تبدأ الأسعار من {from} لكل مقعد شهريًا في الخطة السنوية. وتبدأ كل خطة بثلاثة أشهر مجانًا دون بطاقة دفع.|تُعلَن الأسعار عند الإطلاق. وتبدأ كل خطة بثلاثة أشهر مجانًا بعد الموافقة، دون بطاقة دفع.⟧',
      see: 'قارن بين الخطط',
      perSeat: 'لكل مقعد شهريًا',
      perSeatYearly: 'لكل مقعد شهريًا، بدفع سنوي',
      business: 'كل ما في الفريق، بالإضافة إلى',
      fine: '⟦price|الأسعار بالدولار الأمريكي؛ تُضاف الضرائب عند الدفع. يتبع عدد المقاعد الأشخاص الذين انضموا. يتولى المدفوعات بائعنا المعتمد Paddle.|تُضاف الضرائب عند الدفع. يتبع عدد المقاعد الأشخاص الذين انضموا. يتولى المدفوعات بائعنا المعتمد Paddle.⟧',
      announced: 'يُعلَن السعر عند الإطلاق',
    },
    faq: {
      title: 'أسئلة',
      items: [
        { q: '⟦eu|أين تُحفظ بياناتنا؟|كيف تُفصل بياناتنا عن غيرها؟⟧', a: '⟦eu|قاعدة البيانات في الاتحاد الأوروبي. |⟧تُفصل كل شركة بقواعد على مستوى الصفوف في قاعدة البيانات نفسها، وتتحقق الاختبارات من هذا الفصل مع كل تغيير. وتتوفر اتفاقية لمعالجة البيانات (مسودة قيد المراجعة القانونية).' },
        { q: 'هل يمكننا تشغيله على خوادمنا الخاصة؟', a: 'نعم. تعمل حزمة الشركة الواحدة على خادمك أو سحابتك بقاعدة بياناتها الخاصة؛ وليست لها اشتراكات.' },
        { q: 'هل نحتاج إلى نظام إدارة عملاء؟', a: 'لا. يمكن أن يأتي العملاء من جدول بيانات أو يُضافوا يدويًا. وإن كان لديك نظام إدارة عملاء، يبقى Curahold متوافقًا معه في الاتجاهين.' },
        { q: 'هل يمكننا الإلغاء في أي وقت؟', a: 'نعم. تعمل الخطة الملغاة حتى نهاية المدة المدفوعة، ويمكن تصدير كل شيء.' },
        { q: 'هل يمكننا استخدام كلماتنا الخاصة؟', a: 'نعم. سمِّ عملاءك حسابات أو شركاء أو زبائن، وتتبع الواجهة كلها ذلك. التطبيق ومركز المساعدة والعرض المباشر متاحة كلها بإحدى عشرة لغة.' },
        { q: 'كيف يجري الإعداد؟', a: 'اختر عنوانك، واجلب عملاءك من جدول بيانات، وادعُ فريقك. ويرشدك الإعداد الموجَّه في كل خطوة.' },
      ],
    },
    cta: { title: 'امنح كل عميل فريقًا لا ينسى.', text: 'ثلاثة أشهر مجانًا بعد الموافقة، وكل شيء مفعّل. اجلب عملاءك من جدول بيانات، ويرشدك الإعداد الموجَّه في بقية الخطوات.' },
    signIn: {
      title: 'تسجيل الدخول',
      text: 'لكل شركة عنوانها الخاص. اكتب عنوان شركتك للانتقال إلى صفحة تسجيل دخولها.',
      label: 'عنوان شركتك',
      placeholder: 'yourcompany',
      go: 'انتقل',
      close: 'إغلاق',
      none: 'ليس لديك عنوان بعد؟ ابدأ التجربة المجانية.',
    },
    footer: {
      story: 'يأتي الاسم من اللاتينية cura (العناية) والإنجليزية hold (الإمساك).',
      help: 'مركز المساعدة',
      legal: 'الشؤون القانونية',
      links: { terms: 'شروط الخدمة', privacy: 'سياسة الخصوصية', kvkk: 'إشعار KVKK', dpa: 'معالجة البيانات', subprocessors: 'المعالِجون الفرعيون', cookies: 'ملفات تعريف الارتباط', refunds: 'سياسة الاسترداد', accessibility: 'إمكانية الوصول', sla: "اتفاقية مستوى الخدمة", aup: "الاستخدام المقبول", orderForm: "نموذج الطلب", disclosure: "الإبلاغ عن مشكلة أمنية" },
      company: '[الاسم القانوني للشركة]',
    },
    consent: {
      title: 'خصوصيتك، اختيارك',
      body: 'نستخدم فقط ما يلزم لتشغيل الموقع. وبموافقتك نقيس أيضًا كيفية استخدامه ونصل إلى من قد يهمّهم Curahold. لا يُحمَّل أي شيء غير ضروري قبل أن تختار.',
      acceptAll: 'قبول الكل',
      rejectAll: 'رفض غير الضروري',
      manage: 'إدارة الخيارات',
      save: 'حفظ الخيارات',
      close: 'إغلاق',
      alwaysOn: 'مفعّل دائمًا',
      manageTitle: 'خيارات الخصوصية',
      necessaryTitle: 'ضروري',
      necessaryBody: 'يتذكر هذا الاختيار ويُبقي الصفحة تعمل. لا يتتبعك أبدًا ولا يمكن إيقافه.',
      analyticsTitle: 'التحليلات',
      analyticsBody: 'تساعدنا على فهم كيفية استخدام الموقع لنحسّنه. لا يُحمَّل Google Analytics إلا بموافقتك.',
      marketingTitle: 'التسويق',
      marketingBody: 'يتيح لنا القياس والوصول إلى من قد يجدون Curahold مفيدًا. لا تُحمَّل بكسلات Meta وTikTok إلا بموافقتك.',
      reopen: 'خيارات الخصوصية',
      policy: 'اقرأ سياسة ملفات تعريف الارتباط',
      ariaBanner: 'الموافقة على الخصوصية وملفات تعريف الارتباط',
    },
  },
  he: {
    nav: { product: 'מוצר', pricing: 'תמחור', demo: 'הדגמה חיה', blog: 'בלוג', help: 'עזרה', signIn: 'התחברות', tryFree: 'תקופת ניסיון חינם', skip: 'דלג לתוכן' },
    hero: {
      kicker: 'ניהול עבודה לצוותי לקוחות',
      title: 'כל חידוש, כל הבטחה וכל משימה, בזמן.',
      lead: 'ראו את הבריאות של כל לקוח ואת הסיבות לה, הפכו את הצעדים הבאים מכל פגישה למשימות, ותנו לחידושים להיפתח מעצמם תשעים יום מראש.',
      note: '3 חודשים בחינם לאחר אישור, בלי כרטיס אשראי.',
      works: 'עובד לצד הכלים של היום',
      pause: 'השהיה',
      play: 'הפעלה',
    },
    tour: {
      label: 'סיור במוצר',
      steps: [
        { tab: 'בריאות', title: 'ראו מי צריך אתכם', text: 'לכל לקוח ציון מ-0 עד 100 והסיבות שמאחוריו, כך שהלקוח שהשתתק עולה לראש הרשימה מעצמו.' },
        { tab: 'הבטחות', title: 'עמדו בכל הבטחה', text: 'תעדו את הפגישה והצעדים הבאים שלה הופכים למשימות, לכל אחת בעלים ותאריך. שום דבר שנאמר בחדר לא הולך לאיבוד.' },
        { tab: 'חידושים', title: 'התחילו לחדש מוקדם', text: 'תשעים יום לפני התאריך, פלייבוק החידוש פותח את המשימות שלו והזדמנות חידוש. אף אחד לא צריך לזכור.' },
        { tab: 'ספרינטים', title: 'שחררו בספרינטים', text: 'אפיקים, סטורי פוינטס ומשימות מקושרות על אותם לוחות, וגרף הברנדאון מצטייר מעצמו כשהכרטיסים נסגרים.' },
      ],
      ui: {
        chips: { review: 'סקירה עסקית באיחור של 14 ימים', renewal: 'חידוש בעוד 94 ימים' },
        meeting: { kind: 'סקירה עסקית', name: 'סקירה עסקית לרבעון 3', ours: 'מצידנו: Zeynep Tunç, Ada Demir', theirs: 'מצידם: Selin Aytaç', steps: ['שלחו הצעה למושבים נוספים', 'הכינו דוח שימוש לצוות הכספים שלהם'] },
        todo: 'שתף את דוח השימוש',
        tasksOpened: 'נפתחו 2 משימות',
        playbook: 'פלייבוק חידוש',
        playbookSteps: ['סקור שימוש ובריאות', 'קבע שיחת חידוש', 'שלח הצעת חידוש'],
        sprint: 'ספרינט 24',
        active: 'פעיל',
        points: '{done} מתוך {total} נקודות',
        ptsLeft: 'נותרו {n} נק׳',
        burndown: 'ברנדאון',
        ideal: 'אידיאלי',
        actual: 'בפועל',
        review: 'סקירת קוד',
        epics: ['חיוב', 'מובייל', 'קליטה'],
        tasks: ['דוח שימוש לצוות הכספים', 'רשימת קבלת פנים', 'תיקון ייצוא CSV', 'חשבוניות לפי מושבים', 'התראות פוש ב-iOS'],
      },
    },
    bento: {
      title: 'שאר העבודה, כבר בפנים',
      lead: 'ללקוחות שלכם דלת משלהם, לעוזר שלכם תשובות אמיתיות, והנתונים שלכם נשארים שלכם.',
      tiles: [
        { h: 'שאלו את העוזר שלכם על הלקוחות', p: 'חברו את Claude או את ChatGPT. הוא פועל בשמכם: רואה ומשנה רק מה שאתם יכולים.' },
        { h: 'פורטל ללקוחות שלכם', p: 'הם נכנסים עם קישור שמגיע לדוא״ל ורואים רק את מה ששיתפתם: המשימות שלהם, הבקשות שלהם, התשובות שלכם.' },
        { h: 'בקצב אחד עם הכלים שלכם', p: 'ה-CRM, הגיליונות והצ׳אט. שינוי בצד אחד מופיע גם בצד השני.' },
        { h: 'הרבעון על מסך אחד', p: 'יעדים, צבר הזדמנויות משוקלל ובריאות כל התיק, בדוחות ובלוחות מחוונים שאתם בונים בעצמכם.' },
        { h: 'אחת עשרה שפות, כולל מימין לשמאל', p: 'כל אחד בוחר את השפה שלו. כל הממשק מתאים את עצמו, ומתהפך היכן שצריך.' },
        { h: 'הנתונים שלכם נשארים שלכם', p: 'כל חברה מופרדת בכללים ברמת השורה במסד הנתונים עצמו, ובדיקות מוודאות את ההפרדה הזו בכל שינוי.' },
      ],
      ask: { q: 'אילו לקוחות צריכים אותי השבוע?', a: 'שלושה זקוקים לתשומת לב:', did: 'פתחתי משימה ל-Zeynep: לקבוע את הסקירה של Marevo.' },
      portal: { plan: 'קליטה' },
      facts: ['SSO עם SAML 2.0 או OpenID Connect', 'ניהול משתמשים ב-SCIM', 'יומן ביקורת', '⟦eu|מסד הנתונים באיחוד האירופי|⟧', 'רץ גם על השרתים שלכם'],
    },
    pricing: {
      title: 'תמחור פשוט, לכל מושב',
      lead: 'כל תוכנית מתחילה בתקופת הניסיון של 3 חודשים בכל התכונות. מושבי צפייה חינם.',
      monthly: 'חודשי',
      yearly: 'שנתי',
      save: '⟦price|בכ-20% פחות|⟧',
      summary: '⟦price|החל מ-{from} למושב לחודש בתוכנית שנתית. כל תוכנית מתחילה בשלושה חודשים בחינם, בלי כרטיס אשראי.|המחירים יפורסמו בהשקה. כל תוכנית מתחילה בשלושה חודשים בחינם לאחר אישור, בלי כרטיס אשראי.⟧',
      see: 'השוואת תוכניות',
      perSeat: 'למושב לחודש',
      perSeatYearly: 'למושב לחודש, בתשלום שנתי',
      business: 'כל מה שבצוות, ובנוסף',
      fine: '⟦price|המחירים בדולר אמריקאי; מסים מתווספים בתשלום. מספר המושבים עוקב אחר מי שהצטרף. את התשלומים מטפל המשווק שלנו Paddle.|מסים מתווספים בתשלום. מספר המושבים עוקב אחר מי שהצטרף. את התשלומים מטפל המשווק שלנו Paddle.⟧',
      announced: 'המחיר יפורסם בהשקה',
    },
    faq: {
      title: 'שאלות',
      items: [
        { q: '⟦eu|היכן נשמרים הנתונים שלנו?|איך הנתונים שלנו מופרדים?⟧', a: '⟦eu|מסד הנתונים נמצא באיחוד האירופי. |⟧כל חברה מופרדת בכללים ברמת השורה במסד הנתונים עצמו, ובדיקות מוודאות את ההפרדה הזו בכל שינוי. יש הסכם עיבוד נתונים (טיוטה בבדיקה משפטית).' },
        { q: 'אפשר להריץ על שרתים שלנו?', a: 'כן. חבילת החברה היחידה רצה על השרת או הענן שלכם עם מסד נתונים משלה; אין לה חיוב.' },
        { q: 'צריך CRM?', a: 'לא. לקוחות יכולים להגיע מגיליון או להתווסף ידנית. אם יש לכם CRM, Curahold נשאר מסונכרן איתו בשני הכיוונים.' },
        { q: 'אפשר לבטל בכל עת?', a: 'כן. תוכנית שבוטלה עובדת עד סוף התקופה ששולמה, והכול ניתן לייצוא.' },
        { q: 'אפשר להשתמש במילים שלנו?', a: 'כן. קראו ללקוחות שלכם חשבונות, שותפים או קליינטים, וכל הממשק יתאים את עצמו. האפליקציה, מרכז העזרה וההדגמה החיה זמינים באחת עשרה שפות.' },
        { q: 'איך עובדת ההקמה?', a: 'בחרו כתובת, הביאו את הלקוחות מגיליון והזמינו את הצוות. ההקמה המודרכת מובילה אתכם בכל שלב.' },
      ],
    },
    cta: { title: 'תנו לכל לקוח צוות שלא שוכח.', text: 'שלושה חודשים בחינם לאחר אישור, עם הכול פתוח. הביאו את הלקוחות מגיליון, וההקמה המודרכת תלווה אתכם בשאר הדרך.' },
    signIn: {
      title: 'התחברות',
      text: 'לכל חברה כתובת משלה. הקלידו את כתובת החברה שלכם כדי לעבור לדף ההתחברות שלה.',
      label: 'כתובת החברה שלכם',
      placeholder: 'yourcompany',
      go: 'עבור',
      close: 'סגור',
      none: 'אין עדיין כתובת? התחילו תקופת ניסיון חינם.',
    },
    footer: {
      story: 'השם מגיע מהלטינית cura (טיפול) ומהאנגלית hold (להחזיק).',
      help: 'מרכז עזרה',
      legal: 'משפטי',
      links: { terms: 'תנאי השירות', privacy: 'מדיניות פרטיות', kvkk: 'הודעת KVKK', dpa: 'עיבוד נתונים', subprocessors: 'מעבדי משנה', cookies: 'עוגיות', refunds: 'מדיניות החזרים', accessibility: 'נגישות', sla: "הסכם רמת שירות", aup: "שימוש מקובל", orderForm: "טופס הזמנה", disclosure: "דיווח על בעיית אבטחה" },
      company: '[שם חברה רשמי]',
    },
    consent: {
      title: 'הפרטיות שלכם, הבחירה שלכם',
      body: 'אנחנו משתמשים רק במה שנדרש להפעלת האתר. בהסכמתכם נמדוד גם איך משתמשים בו ונגיע לאנשים ש-Curahold עשוי לעניין אותם. שום דבר שאינו הכרחי לא נטען עד שתבחרו.',
      acceptAll: 'אישור הכול',
      rejectAll: 'דחיית הלא הכרחיים',
      manage: 'ניהול בחירות',
      save: 'שמירת הבחירות',
      close: 'סגירה',
      alwaysOn: 'פעיל תמיד',
      manageTitle: 'בחירות פרטיות',
      necessaryTitle: 'הכרחי',
      necessaryBody: 'זוכר את הבחירה הזו ושומר שהדף יעבוד. לעולם לא עוקב אחריכם ואי אפשר לכבות אותו.',
      analyticsTitle: 'אנליטיקה',
      analyticsBody: 'עוזר לנו להבין איך משתמשים באתר כדי שנוכל לשפר אותו. Google Analytics נטען רק בהסכמתכם.',
      marketingTitle: 'שיווק',
      marketingBody: 'מאפשר לנו למדוד ולהגיע לאנשים ש-Curahold עשוי להועיל להם. הפיקסלים של Meta ו-TikTok נטענים רק בהסכמתכם.',
      reopen: 'בחירות פרטיות',
      policy: 'מדיניות העוגיות',
      ariaBanner: 'הסכמה לפרטיות ולעוגיות',
    },
  },
  fa: {
    nav: { product: 'محصول', pricing: 'قیمت‌ها', demo: 'دموی زنده', blog: 'وبلاگ', help: 'راهنما', signIn: 'ورود', tryFree: 'رایگان امتحان کنید', skip: 'پرش به محتوا' },
    hero: {
      kicker: 'مدیریت کار برای تیم‌های مشتری',
      title: 'هر تمدید، هر قول و هر وظیفه، سرِ وقت.',
      lead: 'سلامت هر مشتری را همراه با دلایلش ببینید، گام‌های بعدی هر جلسه را به وظیفه تبدیل کنید و بگذارید تمدیدها نود روز زودتر خودشان شروع شوند.',
      note: '۳ ماه رایگان پس از تأیید، بدون نیاز به کارت.',
      works: 'کنار ابزارهای امروزتان کار می‌کند',
      pause: 'توقف',
      play: 'پخش',
    },
    tour: {
      label: 'گشتی در محصول',
      steps: [
        { tab: 'سلامت', title: 'ببینید چه کسی به شما نیاز دارد', text: 'هر مشتری امتیازی از ۰ تا ۱۰۰ دارد، همراه با دلایلش؛ مشتری‌ای که ساکت شده خودش جلو می‌آید.' },
        { tab: 'قول‌ها', title: 'به هر قولی عمل کنید', text: 'جلسه را ثبت کنید تا گام‌های بعدی‌اش به وظیفه تبدیل شود، هرکدام با مالک و تاریخ. هیچ حرفی از جلسه گم نمی‌شود.' },
        { tab: 'تمدیدها', title: 'تمدید را زود شروع کنید', text: 'نود روز پیش از موعد، پلی‌بوک تمدید وظایفش و یک فرصت تمدید را باز می‌کند. لازم نیست کسی به یاد داشته باشد.' },
        { tab: 'اسپرینت‌ها', title: 'با اسپرینت تحویل دهید', text: 'اپیک‌ها، استوری پوینت‌ها و وظایف مرتبط روی همان بردها؛ نمودار برن‌داون با بسته‌شدن کارت‌ها خودش رسم می‌شود.' },
      ],
      ui: {
        chips: { review: 'بازبینی کسب‌وکار ۱۴ روز عقب افتاده', renewal: 'تمدید تا ۹۴ روز دیگر' },
        meeting: {
          kind: 'بازبینی کسب‌وکار',
          name: 'بازبینی کسب‌وکار سه‌ماههٔ سوم',
          ours: 'از طرف ما: Zeynep Tunç، Ada Demir',
          theirs: 'از طرف آن‌ها: Selin Aytaç',
          steps: ['ارسال پیشنهاد کاربران بیشتر', 'آماده‌سازی گزارش استفاده برای تیم مالی'],
        },
        todo: 'اشتراک‌گذاری گزارش استفاده',
        tasksOpened: '۲ وظیفه باز شد',
        playbook: 'پلی‌بوک تمدید',
        playbookSteps: ['بازبینی استفاده و سلامت', 'تنظیم تماس تمدید', 'ارسال پیشنهاد تمدید'],
        sprint: 'اسپرینت ۲۴',
        active: 'فعال',
        points: '{done} از {total} امتیاز',
        ptsLeft: '{n} امتیاز مانده',
        burndown: 'نمودار برن‌داون',
        ideal: 'ایده‌آل',
        actual: 'واقعی',
        review: 'بازبینی کد',
        epics: ['صورت‌حساب', 'موبایل', 'آنبوردینگ'],
        tasks: ['گزارش استفاده برای تیم مالی', 'چک‌لیست خوشامدگویی', 'رفع خروجی CSV', 'صورت‌حساب بر پایهٔ کاربر', 'اعلان‌های پوش در iOS'],
      },
    },
    bento: {
      title: 'باقی کار هم آماده است',
      lead: 'برای مشتریانتان درِ خودشان، برای دستیارتان پاسخ‌های واقعی، و داده‌هایتان همچنان از آنِ شما.',
      tiles: [
        { h: 'از دستیارتان دربارهٔ مشتریان بپرسید', p: 'Claude یا ChatGPT را وصل کنید. به‌جای شما کار می‌کند: فقط همان را می‌بیند و تغییر می‌دهد که شما می‌توانید.' },
        { h: 'پورتالی برای مشتریانتان', p: 'با پیوندی که به ایمیلشان می‌رسد وارد می‌شوند و فقط آنچه را به اشتراک گذاشته‌اید می‌بینند: وظایفشان، درخواست‌هایشان، پاسخ‌های شما.' },
        { h: 'هم‌گام با ابزارهایتان', p: 'CRM، صفحه‌گسترده‌ها و گفت‌وگوی تیمی. تغییر در هر طرف، در طرف دیگر هم دیده می‌شود.' },
        { h: 'کل فصل روی یک صفحه', p: 'هدف‌ها، فرصت‌های وزن‌دار و سلامت کل پرتفوی؛ در گزارش‌ها و داشبوردهایی که خودتان می‌سازید.' },
        { h: 'یازده زبان، با راست‌به‌چپ', p: 'هر کس زبان خودش را برمی‌گزیند. کل رابط با آن هماهنگ می‌شود و هرجا لازم باشد آینه‌ای می‌شود.' },
        { h: 'داده‌هایتان از آنِ شما می‌ماند', p: 'هر شرکت با قاعده‌هایی در سطح سطر در خودِ پایگاه داده جدا می‌شود و آزمون‌ها این جداسازی را در هر تغییر بررسی می‌کنند.' },
      ],
      ask: { q: 'این هفته کدام مشتریان به من نیاز دارند؟', a: 'سه مشتری به توجه نیاز دارند:', did: 'برای Zeynep یک وظیفه باز کردم: تنظیم بازبینی Marevo.' },
      portal: { plan: 'آنبوردینگ' },
      facts: ['SSO با SAML 2.0 یا OpenID Connect', 'مدیریت کاربران با SCIM', 'گزارش ممیزی', '⟦eu|پایگاه داده در اتحادیهٔ اروپا|⟧', 'روی سرورهای خودتان هم اجرا می‌شود'],
    },
    pricing: {
      title: 'قیمت‌های ساده، به ازای هر کاربر',
      lead: 'هر طرح با یک دورهٔ آزمایشی ۳ماهه از همهٔ امکانات آغاز می‌شود. بینندگان رایگان‌اند.',
      monthly: 'ماهانه',
      yearly: 'سالانه',
      save: '⟦price|حدود ۲۰٪ کمتر|⟧',
      summary: '⟦price|از {from} برای هر کاربر در ماه با طرح سالانه. هر طرح با سه ماه رایگان و بدون نیاز به کارت شروع می‌شود.|قیمت‌ها هنگام عرضه اعلام می‌شود. هر طرح پس از تأیید با سه ماه رایگان و بدون نیاز به کارت شروع می‌شود.⟧',
      see: 'مقایسهٔ طرح‌ها',
      perSeat: 'هر کاربر در ماه',
      perSeatYearly: 'هر کاربر در ماه، با پرداخت سالانه',
      business: 'همه چیزِ طرح تیم، به‌علاوهٔ',
      fine: '⟦price|قیمت‌ها به دلار آمریکا است؛ مالیات هنگام پرداخت افزوده می‌شود. شمار کاربران از افرادی که پیوسته‌اند پیروی می‌کند. پرداخت‌ها را فروشنده ما Paddle انجام می‌دهد.|مالیات هنگام پرداخت افزوده می‌شود. شمار کاربران از افرادی که پیوسته‌اند پیروی می‌کند. پرداخت‌ها را فروشنده ما Paddle انجام می‌دهد.⟧',
      announced: 'قیمت هنگام عرضه اعلام می‌شود',
    },
    faq: {
      title: 'پرسش‌ها',
      items: [
        { q: '⟦eu|داده‌های ما کجا نگهداری می‌شود؟|داده‌های ما چگونه جدا نگه داشته می‌شود؟⟧', a: '⟦eu|پایگاه داده در اتحادیهٔ اروپا است. |⟧هر شرکت با قاعده‌هایی در سطح سطر در خودِ پایگاه داده جدا می‌شود و آزمون‌ها این جداسازی را در هر تغییر بررسی می‌کنند. قرارداد پردازش داده در دسترس است (پیش‌نویسی که در حال بررسی حقوقی است).' },
        { q: 'می‌توانیم روی سرورهای خودمان اجرا کنیم؟', a: 'بله. بستهٔ تک‌شرکتی با پایگاه دادهٔ خودش روی سرور یا ابر شما اجرا می‌شود و صورت‌حساب اشتراک ندارد.' },
        { q: 'به CRM نیاز داریم؟', a: 'خیر. مشتریان می‌توانند از یک صفحه‌گسترده بیایند یا دستی افزوده شوند. اگر CRM دارید، Curahold دوطرفه با آن هماهنگ می‌ماند.' },
        { q: 'هر وقت بخواهیم می‌توانیم لغو کنیم؟', a: 'بله. طرح لغوشده تا پایان دورهٔ پرداخت‌شده کار می‌کند و از همه چیز می‌توان خروجی گرفت.' },
        { q: 'می‌توانیم از واژه‌های خودمان استفاده کنیم؟', a: 'بله. مشتریانتان را حساب، شریک یا کارفرما بنامید؛ کل رابط از آن پیروی می‌کند. برنامه، مرکز راهنما و دموی زنده هر سه به یازده زبان در دسترس‌اند.' },
        { q: 'راه‌اندازی چگونه انجام می‌شود؟', a: 'آدرستان را انتخاب کنید، مشتریانتان را از یک صفحه‌گسترده بیاورید و تیمتان را دعوت کنید. راه‌اندازی گام‌به‌گام در هر مرحله راهنمایتان است.' },
      ],
    },
    cta: { title: 'به هر مشتری تیمی بدهید که چیزی را فراموش نمی‌کند.', text: 'سه ماه رایگان پس از تأیید، با همهٔ امکانات. مشتریانتان را از یک صفحه‌گسترده بیاورید؛ راه‌اندازی گام‌به‌گام بقیهٔ راه را نشانتان می‌دهد.' },
    signIn: {
      title: 'ورود',
      text: 'هر شرکت آدرس خودش را دارد. برای رفتن به صفحهٔ ورود، آدرس شرکتتان را بنویسید.',
      label: 'آدرس شرکت شما',
      placeholder: 'yourcompany',
      go: 'ادامه',
      close: 'بستن',
      none: 'هنوز آدرسی ندارید؟ دورهٔ آزمایشی رایگان را شروع کنید.',
    },
    footer: {
      story: 'نام از cura لاتین (مراقبت) و hold انگلیسی (نگه داشتن) می‌آید.',
      help: 'مرکز راهنما',
      legal: 'حقوقی',
      links: { terms: 'شرایط خدمات', privacy: 'سیاست حریم خصوصی', kvkk: 'اطلاعیه KVKK', dpa: 'پردازش داده', subprocessors: 'پردازشگران فرعی', cookies: 'کوکی‌ها', refunds: 'سیاست بازپرداخت', accessibility: 'دسترس‌پذیری', sla: "توافق‌نامهٔ سطح خدمات", aup: "استفادهٔ قابل قبول", orderForm: "فرم سفارش", disclosure: "گزارش یک مشکل امنیتی" },
      company: '[نام حقوقی شرکت]',
    },
    consent: {
      title: 'حریم خصوصی شما، انتخاب شما',
      body: 'فقط از آنچه برای کارکردن سایت لازم است استفاده می‌کنیم. با رضایت شما، نحوهٔ استفاده از سایت را هم می‌سنجیم و به کسانی می‌رسیم که شاید Curahold به کارشان بیاید. تا انتخاب نکنید، هیچ چیز غیرضروری بارگذاری نمی‌شود.',
      acceptAll: 'پذیرش همه',
      rejectAll: 'رد موارد غیرضروری',
      manage: 'مدیریت انتخاب‌ها',
      save: 'ذخیرهٔ انتخاب‌ها',
      close: 'بستن',
      alwaysOn: 'همیشه فعال',
      manageTitle: 'انتخاب‌های حریم خصوصی',
      necessaryTitle: 'ضروری',
      necessaryBody: 'این انتخاب را به خاطر می‌سپارد و صفحه را سرپا نگه می‌دارد. هرگز شما را ردیابی نمی‌کند و خاموش‌شدنی نیست.',
      analyticsTitle: 'تحلیل',
      analyticsBody: 'به ما کمک می‌کند بفهمیم سایت چگونه استفاده می‌شود تا بهترش کنیم. Google Analytics فقط با رضایت شما بارگذاری می‌شود.',
      marketingTitle: 'بازاریابی',
      marketingBody: 'به ما امکان می‌دهد اثر را بسنجیم و به کسانی برسیم که Curahold برایشان مفید است. پیکسل‌های Meta و TikTok فقط با رضایت شما بارگذاری می‌شوند.',
      reopen: 'انتخاب‌های حریم خصوصی',
      policy: 'سیاست کوکی را بخوانید',
      ariaBanner: 'رضایت حریم خصوصی و کوکی',
    },
  },
  'zh-Hans': {
    nav: { product: '产品', pricing: '价格', demo: '在线演示', blog: '博客', help: '帮助', signIn: '登录', tryFree: '免费试用', skip: '跳到正文' },
    hero: { kicker: '面向客户团队的工作管理', title: '每一次续约、每一个承诺、每一项任务，\u200b都按时完成。', lead: '查看每个客户的健康评分及其原因，把会议中的后续步骤直接变成任务，续约在到期前 90 天自动启动。', note: '申请通过后 3 个月免费，无需信用卡。', works: '与你现有的工具并行工作', pause: '暂停', play: '播放' },
    tour: {
      label: '产品导览',
      steps: [
        { tab: '健康', title: '看清谁需要你', text: '每个客户都有 0 到 100 的评分和背后的原因，变得沉默的客户会自己浮上来。' },
        { tab: '承诺', title: '兑现每个承诺', text: '记录会议，后续步骤就会变成任务，各有负责人和日期。会上说过的话，一句都不会丢。' },
        { tab: '续约', title: '提早开始续约', text: '到期前九十天，续约行动手册会自动开启任务和一个续约商机，不必靠谁记着。' },
        { tab: '迭代', title: '按迭代交付', text: '史诗、故事点和关联任务都在同一批看板上，燃尽图随着卡片关闭自动绘制。' },
      ],
      ui: {
        chips: { review: '业务回顾已延迟 14 天', renewal: '94 天后续约' },
        meeting: { kind: '业务回顾', name: '第三季度业务回顾', ours: '我方：Zeynep Tunç、Ada Demir', theirs: '对方：Selin Aytaç', steps: ['发送增购席位报价', '起草财务团队的使用情况报告'] },
        todo: '分享使用情况报告',
        tasksOpened: '已创建 2 个任务',
        playbook: '续约行动手册',
        playbookSteps: ['回顾使用情况与健康度', '预约续约沟通', '发送续约报价'],
        sprint: '迭代 24',
        active: '进行中',
        points: '已完成 {done}/{total} 点',
        ptsLeft: '剩余 {n} 点',
        burndown: '燃尽图',
        ideal: '理想',
        actual: '实际',
        review: '代码评审',
        epics: ['计费', '移动端', '入门引导'],
        tasks: ['财务团队的使用情况报告', '欢迎清单', '修复 CSV 导出', '按席位开票', 'iOS 推送通知'],
      },
    },
    bento: {
      title: '其余的工作，也已备好',
      lead: '客户有自己的入口，助手给出真实的答案，数据始终属于你。',
      tiles: [
        { h: '向助手询问你的客户', p: '连接 Claude 或 ChatGPT。它以你的身份工作：只能查看和修改你有权限的内容。' },
        { h: '给客户的专属门户', p: '客户通过邮件里的链接登录，只看到你共享的内容：他们的任务、他们的请求、你的回复。' },
        { h: '与现有工具保持同步', p: '你的 CRM、电子表格和聊天工具。任何一边的变更，都会出现在另一边。' },
        { h: '整个季度，一屏看清', p: '目标、加权商机和整个客户组合的健康度，都在你可以自己搭建的报表和仪表板里。' },
        { h: '十一种语言，支持从右到左', p: '每个人选择自己的语言，整个界面随之切换，需要时还会镜像排版。' },
        { h: '你的数据始终属于你', p: '每家公司由数据库本身的行级规则彼此隔离，每次变更都有测试检查这种隔离。' },
      ],
      ask: { q: '这周哪些客户需要我？', a: '有三个客户需要你关注：', did: '我已为 Zeynep 创建任务：安排 Marevo 的业务回顾。' },
      portal: { plan: '入门引导' },
      facts: ['支持 SAML 2.0 或 OpenID Connect 单点登录', 'SCIM 用户配置', '审计日志', '⟦eu|数据库位于欧盟|⟧', '也可在你自己的服务器上运行'],
    },
    pricing: {
      title: '简单的按席位定价',
      lead: '每个套餐都以 3 个月全功能试用开始。只读席位免费。',
      monthly: '按月',
      yearly: '按年',
      save: '⟦price|约便宜 20%|⟧',
      summary: '⟦price|按年付每席位每月 {from} 起。每个套餐都以 3 个月免费试用开始，无需信用卡。|价格将在正式发布时公布。每个套餐都在申请通过后以 3 个月免费试用开始，无需信用卡。⟧',
      see: '比较套餐',
      perSeat: '每席位每月',
      perSeatYearly: '每席位每月，按年付费',
      business: '包含团队版的一切，另加',
      fine: '⟦price|价格以美元计；结账时另加税费。席位数随加入的成员变化。付款由我们的经销商 Paddle 处理。|结账时另加税费。席位数随加入的成员变化。付款由我们的经销商 Paddle 处理。⟧',
      announced: '价格将在发布时公布',
    },
    faq: {
      title: '常见问题',
      items: [
        { q: '⟦eu|我们的数据保存在哪里？|我们的数据如何隔离？⟧', a: '⟦eu|数据库位于欧盟。|⟧每家公司由数据库本身的行级规则彼此隔离，每次变更都有测试检查这种隔离。我们提供数据处理协议（草稿，正在法律审查中）。' },
        { q: '可以在我们自己的服务器上运行吗？', a: '可以。单公司版在你自己的服务器或云上运行，拥有独立数据库；没有订阅计费。' },
        { q: '需要 CRM 吗？', a: '不需要。客户可以从电子表格导入，或手动添加。如果你有 CRM，Curahold 会与它双向保持同步。' },
        { q: '可以随时取消吗？', a: '可以。取消的套餐会运行到已付费周期结束，且一切都可导出。' },
        { q: '可以使用我们自己的称呼吗？', a: '可以。把你的客户称作账户、合作伙伴或委托方，整个界面都会随之变化。应用、帮助中心和在线演示都支持十一种语言。' },
        { q: '如何完成设置？', a: '选择你的地址，从电子表格导入客户，邀请你的团队。引导式设置会带你完成每一步。' },
      ],
    },
    cta: { title: '让每位客户都有一支从不遗忘的团队。', text: '申请通过后三个月免费，全部功能开放。从电子表格导入客户，其余步骤由引导式设置带你完成。' },
    signIn: { title: '登录', text: '每家公司都有自己的地址。输入你公司的地址即可前往其登录页面。', label: '你的公司地址', placeholder: 'yourcompany', go: '前往', close: '关闭', none: '还没有地址？开始免费试用。' },
    footer: {
      story: '名字来自拉丁语 cura（关怀）与英语 hold（守护）。',
      help: '帮助中心',
      legal: '法律',
      links: { terms: '服务条款', privacy: '隐私政策', kvkk: 'KVKK 告知', dpa: '数据处理', subprocessors: '次级处理方', cookies: 'Cookie', refunds: '退款政策', accessibility: '无障碍', sla: "服务等级协议", aup: "可接受使用", orderForm: "订单表", disclosure: "报告安全问题" },
      company: '[公司法定名称]',
    },
    consent: {
      title: '你的隐私，由你决定',
      body: '我们只使用运行网站所必需的内容。经你同意后，我们还会统计网站的使用情况，并触达可能对 Curahold 感兴趣的人。在你做出选择之前，不会加载任何非必要内容。',
      acceptAll: '全部接受',
      rejectAll: '拒绝非必要项',
      manage: '管理选项',
      save: '保存选项',
      close: '关闭',
      alwaysOn: '始终开启',
      manageTitle: '隐私选项',
      necessaryTitle: '必要',
      necessaryBody: '记住此选择并保证页面正常运行。它们绝不会跟踪你，也无法关闭。',
      analyticsTitle: '分析',
      analyticsBody: '帮助我们了解网站的使用情况，以便改进。仅在你同意后才会加载 Google Analytics。',
      marketingTitle: '营销',
      marketingBody: '让我们能够衡量效果，并触达可能觉得 Curahold 有用的人。仅在你同意后才会加载 Meta 和 TikTok 像素。',
      reopen: '隐私选项',
      policy: '阅读 Cookie 政策',
      ariaBanner: '隐私与 Cookie 同意',
    },
  },
  'zh-Hant': {
    nav: { product: '產品', pricing: '定價', demo: '線上展示', blog: '部落格', help: '說明', signIn: '登入', tryFree: '免費試用', skip: '跳至主要內容' },
    hero: { kicker: '為客戶團隊打造的工作管理', title: '每一次續約、每一個承諾、每一項任務，\u200b都準時完成。', lead: '查看每位客戶的健康評分與背後原因，把會議中的後續步驟直接變成任務，續約會在到期前 90 天自動啟動。', note: '申請核准後 3 個月免費，不需信用卡。', works: '與你現有的工具並行運作', pause: '暫停', play: '播放' },
    tour: {
      label: '產品導覽',
      steps: [
        { tab: '健康', title: '看清誰需要你', text: '每位客戶都有 0 到 100 的評分與背後的原因，變得沉默的客戶會自己浮上來。' },
        { tab: '承諾', title: '兌現每個承諾', text: '記錄會議，後續步驟就會變成任務，各有負責人與日期。會議上說過的話，一句都不會遺漏。' },
        { tab: '續約', title: '提早開始續約', text: '到期前九十天，續約行動手冊會自動開啟任務與一個續約交易，不必靠誰記著。' },
        { tab: '衝刺', title: '以衝刺交付', text: '史詩、故事點數與關聯任務都在同一批看板上，燃盡圖隨著卡片關閉自動繪製。' },
      ],
      ui: {
        chips: { review: '業務檢視已延遲 14 天', renewal: '94 天後續約' },
        meeting: { kind: '業務檢視', name: '第三季業務檢視', ours: '我方：Zeynep Tunç、Ada Demir', theirs: '對方：Selin Aytaç', steps: ['寄送加購席次報價', '草擬財務團隊的使用情況報告'] },
        todo: '分享使用狀況報告',
        tasksOpened: '已建立 2 個任務',
        playbook: '續約行動手冊',
        playbookSteps: ['檢視使用狀況與健康度', '預約續約會談', '寄送續約報價'],
        sprint: '衝刺 24',
        active: '進行中',
        points: '已完成 {done}/{total} 點',
        ptsLeft: '剩餘 {n} 點',
        burndown: '燃盡圖',
        ideal: '理想',
        actual: '實際',
        review: '程式碼審查',
        epics: ['計費', '行動版', '客戶導入'],
        tasks: ['財務團隊的使用情況報告', '歡迎檢查清單', '修正 CSV 匯出', '依席次開立發票', 'iOS 推播通知'],
      },
    },
    bento: {
      title: '其餘的工作，也已備妥',
      lead: '客戶有自己的入口，助理給出真實的答案，資料始終屬於你。',
      tiles: [
        { h: '向助理詢問你的客戶', p: '連結 Claude 或 ChatGPT。它以你的身分工作：只能檢視與修改你有權限的內容。' },
        { h: '給客戶的專屬入口網站', p: '客戶透過電子郵件裡的連結登入，只看到你分享的內容：他們的任務、他們的請求、你的回覆。' },
        { h: '與現有工具保持同步', p: '你的 CRM、試算表與聊天工具。任何一邊的變更，都會出現在另一邊。' },
        { h: '整個季度，一個畫面看清', p: '目標、加權交易與整個客戶組合的健康度，都在你可以自行建立的報表與儀表板裡。' },
        { h: '十一種語言，支援由右至左', p: '每個人選擇自己的語言，整個介面隨之切換，需要時還會鏡像排版。' },
        { h: '你的資料始終屬於你', p: '每家公司由資料庫本身的列級規則彼此隔離，每次變更都有測試檢查這種隔離。' },
      ],
      ask: { q: '這週哪些客戶需要我？', a: '有三位客戶需要你關注：', did: '我已為 Zeynep 建立任務：安排 Marevo 的業務檢視。' },
      portal: { plan: '客戶導入' },
      facts: ['支援 SAML 2.0 或 OpenID Connect 單一登入', 'SCIM 使用者佈建', '稽核記錄', '⟦eu|資料庫位於歐盟|⟧', '也可在你自己的伺服器上執行'],
    },
    pricing: {
      title: '簡單的按席次定價',
      lead: '每個方案都以 3 個月全功能試用開始。唯讀席次免費。',
      monthly: '按月',
      yearly: '按年',
      save: '⟦price|約便宜 20%|⟧',
      summary: '⟦price|年繳每席次每月 {from} 起。每個方案都以 3 個月免費試用開始，不需信用卡。|價格將於正式推出時公布。每個方案都在申請核准後以 3 個月免費試用開始，不需信用卡。⟧',
      see: '比較方案',
      perSeat: '每席次每月',
      perSeatYearly: '每席次每月，按年付費',
      business: '包含團隊版的一切，另加',
      fine: '⟦price|價格以美元計；結帳時另加稅金。席次數隨加入的成員變化。付款由我們的經銷商 Paddle 處理。|結帳時另加稅金。席次數隨加入的成員變化。付款由我們的經銷商 Paddle 處理。⟧',
      announced: '價格將於推出時公布',
    },
    faq: {
      title: '常見問題',
      items: [
        { q: '⟦eu|我們的資料儲存在哪裡？|我們的資料如何隔離？⟧', a: '⟦eu|資料庫位於歐盟。|⟧每家公司由資料庫本身的列級規則彼此隔離，每次變更都有測試檢查這種隔離。我們提供資料處理合約（草稿，正在法律審查中）。' },
        { q: '可以在我們自己的伺服器上執行嗎？', a: '可以。單公司版在你自己的伺服器或雲端上執行，擁有獨立資料庫；沒有訂閱計費。' },
        { q: '需要 CRM 嗎？', a: '不需要。客戶可以從試算表匯入，或手動新增。如果你有 CRM，Curahold 會與它雙向保持同步。' },
        { q: '可以隨時取消嗎？', a: '可以。取消的方案會運作到已付費週期結束，且一切都可匯出。' },
        { q: '可以使用我們自己的稱呼嗎？', a: '可以。把你的客戶稱作帳戶、夥伴或委託方，整個介面都會隨之改變。應用程式、說明中心與線上展示都支援十一種語言。' },
        { q: '如何完成設定？', a: '選擇你的網址，從試算表匯入客戶，邀請你的團隊。引導式設定會帶你完成每一步。' },
      ],
    },
    cta: { title: '讓每位客戶都有一支從不遺忘的團隊。', text: '申請核准後三個月免費，全部功能開放。從試算表匯入客戶，其餘步驟由引導式設定帶你完成。' },
    signIn: { title: '登入', text: '每家公司都有自己的網址。輸入你公司的網址即可前往其登入頁面。', label: '你的公司網址', placeholder: 'yourcompany', go: '前往', close: '關閉', none: '還沒有網址？開始免費試用。' },
    footer: {
      story: '名字來自拉丁語 cura（關懷）與英語 hold（守護）。',
      help: '說明中心',
      legal: '法律',
      links: { terms: '服務條款', privacy: '隱私權政策', kvkk: 'KVKK 告知', dpa: '資料處理', subprocessors: '次要處理方', cookies: 'Cookie', refunds: '退款政策', accessibility: '無障礙', sla: "服務水準協議", aup: "可接受使用", orderForm: "訂購單", disclosure: "回報安全問題" },
      company: '[公司法定名稱]',
    },
    consent: {
      title: '你的隱私，由你決定',
      body: '我們只使用網站運作所必需的內容。經你同意後，我們也會統計網站的使用情況，並接觸可能對 Curahold 感興趣的人。在你做出選擇之前，不會載入任何非必要內容。',
      acceptAll: '全部接受',
      rejectAll: '拒絕非必要項目',
      manage: '管理選項',
      save: '儲存選項',
      close: '關閉',
      alwaysOn: '一律開啟',
      manageTitle: '隱私選項',
      necessaryTitle: '必要',
      necessaryBody: '記住這項選擇並確保頁面正常運作。它們絕不會追蹤你，也無法關閉。',
      analyticsTitle: '分析',
      analyticsBody: '協助我們瞭解網站的使用情況，以便改進。只有在你同意後才會載入 Google Analytics。',
      marketingTitle: '行銷',
      marketingBody: '讓我們能夠衡量成效，並接觸可能覺得 Curahold 有用的人。只有在你同意後才會載入 Meta 與 TikTok 像素。',
      reopen: '隱私選項',
      policy: '閱讀 Cookie 政策',
      ariaBanner: '隱私與 Cookie 同意',
    },
  },
  ja: {
    nav: { product: '製品', pricing: '料金', demo: 'ライブデモ', blog: 'ブログ', help: 'ヘルプ', signIn: 'ログイン', tryFree: '無料で試す', skip: '本文へスキップ' },
    hero: { kicker: 'カスタマーチームのための業務管理', title: '更新も、約束も、タスクも、\u200b期日どおりに。', lead: '顧客ごとのヘルススコアを理由とともに確認し、会議の次のステップをそのままタスクに。更新は期日の90日前に自動で始まります。', note: '承認後3か月無料、カード登録は不要です。', works: '今のツールの横で動きます', pause: '一時停止', play: '再生' },
    tour: {
      label: '製品ツアー',
      steps: [
        { tab: 'ヘルス', title: '対応が\u200b必要な\u200b顧客が\u200bわかる', text: 'すべての顧客に0〜100のスコアとその理由がつき、反応が途絶えた顧客は自然と上位に表示されます。' },
        { tab: '約束', title: '約束を\u200bすべて\u200b守る', text: 'ミーティングを記録すると、次のステップが担当者と期日つきのタスクになります。その場で話したことは何ひとつ失われません。' },
        { tab: '更新', title: '更新は\u200b早めに\u200b始める', text: '更新日の90日前に、更新プレイブックがタスクと更新の商談を自動で開きます。誰かが覚えておく必要はありません。' },
        { tab: 'スプリント', title: 'スプリントで\u200b届ける', text: 'エピック、ストーリーポイント、リンクされたタスクを同じボードで管理。カードが完了するたびにバーンダウンが描かれます。' },
      ],
      ui: {
        chips: { review: 'ビジネスレビューが14日遅延', renewal: '更新まであと94日' },
        meeting: { kind: 'ビジネスレビュー', name: '第3四半期ビジネスレビュー', ours: '自社：Zeynep Tunç、Ada Demir', theirs: '先方：Selin Aytaç', steps: ['追加シートの見積もりを送る', '経理チーム向けの利用状況レポートを作成'] },
        todo: '利用状況レポートを共有',
        tasksOpened: '2件のタスクを作成',
        playbook: '更新プレイブック',
        playbookSteps: ['利用状況とヘルスを確認', '更新の打ち合わせを設定', '更新の見積もりを送る'],
        sprint: 'スプリント 24',
        active: '進行中',
        points: '{done} / {total} pt 完了',
        ptsLeft: '残り {n} pt',
        burndown: 'バーンダウン',
        ideal: '理想',
        actual: '実績',
        review: 'コードレビュー',
        epics: ['請求', 'モバイル', 'オンボーディング'],
        tasks: ['経理チーム向けの利用状況レポート', 'ウェルカムチェックリスト', 'CSVエクスポートを修正', 'シート単位の請求書', 'iOSのプッシュ通知'],
      },
    },
    bento: {
      title: '残りの\u200b仕事も、\u200bすべて\u200b揃っています',
      lead: '顧客には専用の入口を、アシスタントには確かな答えを。そしてデータは、あなたのものであり続けます。',
      tiles: [
        { h: '顧客のことを\u200bアシスタントに\u200b聞く', p: 'Claude や ChatGPT を接続。あなたとして動作し、あなたに見えるものだけを見て、変更できるものだけを変更します。' },
        { h: '顧客のための\u200bポータル', p: '顧客はメールで届くリンクからログインし、共有された内容だけを確認できます。自分のタスク、リクエスト、そしてあなたからの返信です。' },
        { h: 'お使いの\u200bツールと\u200b足並みを\u200bそろえる', p: 'CRM、スプレッドシート、チャット。どちらかで変更すれば、もう一方にも反映されます。' },
        { h: '四半期を\u200b1画面で', p: '目標、加重パイプライン、ポートフォリオ全体のヘルスを、自分で組み立てられるレポートとダッシュボードで。' },
        { h: '11言語、\u200b右から左の\u200b言語にも\u200b対応', p: '各自が自分の言語を選ぶと、インターフェース全体が切り替わり、必要に応じて左右も反転します。' },
        { h: 'データは\u200bあなたのもの', p: '会社ごとにデータベース自体の行単位のルールで分離し、変更のたびにテストでその分離を確認しています。' },
      ],
      ask: { q: '今週、対応が必要な顧客は？', a: '対応が必要な顧客は3社です：', did: 'Zeynep にタスクを作成しました：Marevo のレビューを設定。' },
      portal: { plan: 'オンボーディング' },
      facts: ['SAML 2.0 または OpenID Connect による SSO', 'SCIM プロビジョニング', '監査ログ', '⟦eu|データベースは欧州連合内|⟧', '自社サーバーでも稼働'],
    },
    pricing: {
      title: 'シンプルな、\u200bシート単位の\u200b料金',
      lead: 'どのプランも全機能の3か月間トライアルから。閲覧シートは無料。',
      monthly: '月額',
      yearly: '年額',
      save: '⟦price|約20%お得|⟧',
      summary: '⟦price|年払いプランなら1シートあたり月額{from}から。どのプランも3か月の無料トライアルから始められ、カード登録は不要です。|料金はローンチ時に発表します。どのプランも承認後3か月の無料トライアルから始められ、カード登録は不要です。⟧',
      see: 'プランを比較',
      perSeat: '1シートあたり月額',
      perSeatYearly: '1シートあたり月額、年払い',
      business: 'チームのすべてに加えて',
      fine: '⟦price|価格は米ドル。税は決済時に加算されます。シート数は参加した人数に従います。決済は再販業者の Paddle が処理します。|税は決済時に加算されます。シート数は参加した人数に従います。決済は再販業者の Paddle が処理します。⟧',
      announced: '料金はローンチ時に発表',
    },
    faq: {
      title: 'よくある質問',
      items: [
        { q: '⟦eu|データは\u200bどこに\u200b保管されますか？|データは\u200bどのように\u200b分離されますか？⟧', a: '⟦eu|データベースは欧州連合にあります。|⟧各社はデータベース自体の行単位のルールで互いに分離し、変更のたびにテストでその分離を確認しています。データ処理契約をご用意しています（法務レビュー中の草案）。' },
        { q: '自社サーバーで\u200b運用できますか？', a: 'はい。シングルカンパニー版は、専用のデータベースとともに自社のサーバーまたはクラウドで動作します。課金はありません。' },
        { q: 'CRM は\u200b必要ですか？', a: 'いいえ。顧客はスプレッドシートから取り込むことも、手動で追加することもできます。CRM があれば、Curahold はそれと双方向で同期を保ちます。' },
        { q: 'いつでも\u200b解約できますか？', a: 'はい。解約したプランは支払い済み期間の終わりまで動作し、すべてをエクスポートできます。' },
        { q: '自社の\u200b呼び方を\u200b使えますか？', a: 'はい。顧客をアカウント、パートナー、クライアントなど自社の呼び方に変えると、インターフェース全体がそれに従います。アプリ、ヘルプセンター、ライブデモのすべてが11言語に対応しています。' },
        { q: 'セットアップは\u200bどのように\u200b進みますか？', a: 'アドレスを選び、顧客をスプレッドシートから取り込み、チームを招待します。ガイド付きセットアップが各ステップをご案内します。' },
      ],
    },
    cta: { title: 'すべての\u200b顧客に、\u200b何も\u200b忘れない\u200bチームを。', text: '承認後3か月間無料、すべての機能が使えます。顧客をスプレッドシートから取り込めば、残りはガイド付きセットアップがご案内します。' },
    signIn: { title: 'ログイン', text: '各社に専用のアドレスがあります。自社のアドレスを入力して、そのログインページへ進みます。', label: '会社のアドレス', placeholder: 'yourcompany', go: '移動', close: '閉じる', none: 'まだアドレスがありませんか？無料トライアルを始めましょう。' },
    footer: {
      story: '名前はラテン語の cura（ケア）と英語の hold（抱える）に由来します。',
      help: 'ヘルプセンター',
      legal: '法的情報',
      links: { terms: '利用規約', privacy: 'プライバシーポリシー', kvkk: 'KVKK 通知', dpa: 'データ処理', subprocessors: 'サブプロセッサー', cookies: 'Cookie', refunds: '返金ポリシー', accessibility: 'アクセシビリティ', sla: "サービスレベル契約", aup: "利用ポリシー", orderForm: "注文書", disclosure: "セキュリティの問題を報告" },
      company: '[会社正式名称]',
    },
    consent: {
      title: 'プライバシーは、あなたの選択で',
      body: 'サイトの運営に必要なものだけを使用します。同意いただいた場合に限り、サイトの利用状況の計測と、Curahold に関心を持ちそうな方へのご案内も行います。選択いただくまで、必須でないものは一切読み込まれません。',
      acceptAll: 'すべて許可',
      rejectAll: '必須以外を拒否',
      manage: '設定を管理',
      save: '設定を保存',
      close: '閉じる',
      alwaysOn: '常にオン',
      manageTitle: 'プライバシー設定',
      necessaryTitle: '必須',
      necessaryBody: 'この選択を記憶し、ページを正しく動作させます。追跡は一切行わず、オフにはできません。',
      analyticsTitle: 'アナリティクス',
      analyticsBody: 'サイトの使われ方を把握し、改善に役立てます。Google Analytics は同意いただいた場合にのみ読み込まれます。',
      marketingTitle: 'マーケティング',
      marketingBody: '効果を計測し、Curahold が役立ちそうな方に情報を届けます。Meta と TikTok のピクセルは同意いただいた場合にのみ読み込まれます。',
      reopen: 'プライバシー設定',
      policy: 'Cookie ポリシーを読む',
      ariaBanner: 'プライバシーと Cookie の同意',
    },
  },
  ko: {
    nav: { product: '제품', pricing: '가격', demo: '라이브 데모', blog: '블로그', help: '도움말', signIn: '로그인', tryFree: '무료로 시작', skip: '본문으로 건너뛰기' },
    hero: { kicker: '고객 팀을 위한 업무 관리', title: '모든 갱신, 모든 약속, 모든 작업을 제때.', lead: '고객마다 헬스 스코어와 그 이유를 확인하고, 미팅의 다음 단계를 바로 작업으로 만드세요. 갱신은 만료 90일 전에 자동으로 시작됩니다.', note: '승인 후 3개월 무료, 카드가 필요 없습니다.', works: '지금 쓰는 도구 옆에서 함께 일합니다', pause: '일시 정지', play: '재생' },
    tour: {
      label: '제품 둘러보기',
      steps: [
        { tab: '헬스', title: '누가 나를 필요로 하는지 한눈에', text: '모든 고객에게 0~100점의 스코어와 그 이유가 표시되어, 조용해진 고객이 저절로 맨 위로 올라옵니다.' },
        { tab: '약속', title: '모든 약속을 지키세요', text: '미팅을 기록하면 다음 단계가 담당자와 날짜가 있는 작업이 됩니다. 회의에서 나온 말은 하나도 사라지지 않습니다.' },
        { tab: '갱신', title: '갱신은 일찍 시작하세요', text: '갱신일 90일 전에 갱신 플레이북이 작업과 갱신 영업 기회를 자동으로 엽니다. 누군가 기억할 필요가 없습니다.' },
        { tab: '스프린트', title: '스프린트로 출시하세요', text: '에픽, 스토리 포인트, 연결된 작업이 같은 보드에 있고, 카드가 닫힐 때마다 번다운이 스스로 그려집니다.' },
      ],
      ui: {
        chips: { review: '비즈니스 리뷰 14일 지연', renewal: '94일 후 갱신' },
        meeting: { kind: '비즈니스 리뷰', name: '3분기 비즈니스 리뷰', ours: '우리 측: Zeynep Tunç, Ada Demir', theirs: '고객 측: Selin Aytaç', steps: ['추가 좌석 견적 보내기', '재무팀용 사용 현황 보고서 작성'] },
        todo: '사용 현황 보고서 공유',
        tasksOpened: '작업 2개 생성됨',
        playbook: '갱신 플레이북',
        playbookSteps: ['사용 현황과 헬스 검토', '갱신 미팅 예약', '갱신 견적 보내기'],
        sprint: '스프린트 24',
        active: '진행 중',
        points: '{total}포인트 중 {done} 완료',
        ptsLeft: '{n}포인트 남음',
        burndown: '번다운',
        ideal: '이상',
        actual: '실제',
        review: '코드 리뷰',
        epics: ['결제', '모바일', '온보딩'],
        tasks: ['재무팀용 사용 현황 보고서', '환영 체크리스트', 'CSV 내보내기 수정', '좌석 기준 청구서', 'iOS 푸시 알림'],
      },
    },
    bento: {
      title: '나머지 업무도 모두 준비되어 있습니다',
      lead: '고객에게는 전용 입구를, 어시스턴트에게는 진짜 답을, 그리고 데이터는 언제나 여러분의 것으로.',
      tiles: [
        { h: '어시스턴트에게 고객에 대해 물어보세요', p: 'Claude나 ChatGPT를 연결하세요. 사용자 본인으로서 동작해, 볼 수 있는 것만 보고 바꿀 수 있는 것만 바꿉니다.' },
        { h: '고객을 위한 포털', p: '고객은 이메일로 받은 링크로 로그인해 공유된 내용만 봅니다. 자신의 작업, 요청, 그리고 여러분의 답변입니다.' },
        { h: '쓰던 도구와 발맞춰', p: 'CRM, 스프레드시트, 메신저. 한쪽에서 바뀌면 다른 쪽에도 반영됩니다.' },
        { h: '분기를 한 화면에', p: '목표, 가중 파이프라인, 전체 포트폴리오의 헬스를 직접 구성하는 보고서와 대시보드에서 확인하세요.' },
        { h: '11개 언어, 오른쪽에서 왼쪽으로 쓰는 언어까지', p: '각자 자신의 언어를 고르면 인터페이스 전체가 따라 바뀌고, 필요한 곳은 좌우가 반전됩니다.' },
        { h: '데이터는 여러분의 것입니다', p: '회사마다 데이터베이스 자체의 행 단위 규칙으로 분리되며, 변경할 때마다 테스트로 이 분리를 확인합니다.' },
      ],
      ask: { q: '이번 주에 내가 챙겨야 할 고객은?', a: '세 곳에 관심이 필요합니다:', did: 'Zeynep에게 작업을 만들었습니다: Marevo 리뷰 예약.' },
      portal: { plan: '온보딩' },
      facts: ['SAML 2.0 또는 OpenID Connect SSO', 'SCIM 프로비저닝', '감사 로그', '⟦eu|데이터베이스는 유럽 연합에 위치|⟧', '자체 서버에서도 실행'],
    },
    pricing: {
      title: '간단한 좌석당 가격',
      lead: '모든 요금제는 모든 기능의 3개월 체험으로 시작합니다. 보기 전용 좌석은 무료입니다.',
      monthly: '월간',
      yearly: '연간',
      save: '⟦price|약 20% 저렴|⟧',
      summary: '⟦price|연간 요금제 기준 좌석당 월 {from}부터. 모든 요금제는 카드 없이 3개월 무료 체험으로 시작합니다.|요금은 출시 때 공개합니다. 모든 요금제는 승인 후 카드 없이 3개월 무료 체험으로 시작합니다.⟧',
      see: '요금제 비교',
      perSeat: '좌석당 월',
      perSeatYearly: '좌석당 월, 연 결제 시',
      business: '팀의 모든 것에 더해',
      fine: '⟦price|가격은 미국 달러이며, 세금은 결제 시 추가됩니다. 좌석 수는 합류한 인원을 따릅니다. 결제는 리셀러인 Paddle이 처리합니다.|세금은 결제 시 추가됩니다. 좌석 수는 합류한 인원을 따릅니다. 결제는 리셀러인 Paddle이 처리합니다.⟧',
      announced: '요금은 출시 때 공개',
    },
    faq: {
      title: '자주 묻는 질문',
      items: [
        { q: '⟦eu|데이터는 어디에 보관되나요?|데이터는 어떻게 분리되나요?⟧', a: '⟦eu|데이터베이스는 유럽 연합에 있습니다. |⟧각 회사는 데이터베이스 자체의 행 단위 규칙으로 서로 분리되며, 변경할 때마다 테스트로 이 분리를 확인합니다. 데이터 처리 계약을 제공합니다(법률 검토 중인 초안).' },
        { q: '자체 서버에서 실행할 수 있나요?', a: '네. 단일 회사 패키지는 전용 데이터베이스와 함께 자체 서버나 클라우드에서 실행되며, 구독 요금이 없습니다.' },
        { q: 'CRM이 필요한가요?', a: '아니요. 고객은 스프레드시트에서 가져오거나 직접 추가할 수 있습니다. CRM이 있다면 Curahold가 양방향으로 동기화를 유지합니다.' },
        { q: '언제든 해지할 수 있나요?', a: '네. 해지한 요금제는 결제한 기간이 끝날 때까지 작동하며, 모든 것을 내보낼 수 있습니다.' },
        { q: '우리만의 용어를 쓸 수 있나요?', a: '네. 고객을 계정, 파트너 또는 클라이언트로 부르면 인터페이스 전체가 그에 따릅니다. 앱과 도움말 센터, 라이브 데모 모두 11개 언어를 지원합니다.' },
        { q: '설정은 어떻게 진행되나요?', a: '주소를 선택하고, 스프레드시트에서 고객을 가져오고, 팀을 초대합니다. 안내형 설정이 단계마다 도와드립니다.' },
      ],
    },
    cta: { title: '모든 고객에게 잊지 않는 팀을 선물하세요.', text: '승인 후 모든 기능을 3개월 동안 무료로. 스프레드시트에서 고객을 가져오면 나머지는 안내형 설정이 도와드립니다.' },
    signIn: { title: '로그인', text: '회사마다 고유한 주소가 있습니다. 회사 주소를 입력하면 해당 로그인 페이지로 이동합니다.', label: '회사 주소', placeholder: 'yourcompany', go: '이동', close: '닫기', none: '아직 주소가 없나요? 무료 체험을 시작하세요.' },
    footer: {
      story: '이름은 라틴어 cura(돌봄)와 영어 hold(지키다)에서 왔습니다.',
      help: '도움말 센터',
      legal: '법적 고지',
      links: { terms: '서비스 약관', privacy: '개인정보 처리방침', kvkk: 'KVKK 고지', dpa: '데이터 처리', subprocessors: '하위 처리자', cookies: '쿠키', refunds: '환불 정책', accessibility: '접근성', sla: "서비스 수준 계약", aup: "이용 정책", orderForm: "주문서", disclosure: "보안 문제 신고" },
      company: '[회사 법인명]',
    },
    consent: {
      title: '개인정보, 선택은 여러분의 몫입니다',
      body: '사이트 운영에 꼭 필요한 것만 사용합니다. 동의하시면 사이트 이용 현황을 측정하고 Curahold에 관심 있을 만한 분들께 다가가는 데에도 사용합니다. 선택하시기 전에는 필수가 아닌 어떤 것도 로드되지 않습니다.',
      acceptAll: '모두 허용',
      rejectAll: '필수 외 거부',
      manage: '선택 관리',
      save: '선택 저장',
      close: '닫기',
      alwaysOn: '항상 켜짐',
      manageTitle: '개인정보 설정',
      necessaryTitle: '필수',
      necessaryBody: '이 선택을 기억하고 페이지가 작동하도록 합니다. 추적하지 않으며 끌 수 없습니다.',
      analyticsTitle: '분석',
      analyticsBody: '사이트가 어떻게 쓰이는지 이해하고 개선하는 데 도움이 됩니다. Google Analytics는 동의한 경우에만 로드됩니다.',
      marketingTitle: '마케팅',
      marketingBody: '성과를 측정하고 Curahold가 도움이 될 만한 분들께 다가갈 수 있게 합니다. Meta 및 TikTok 픽셀은 동의한 경우에만 로드됩니다.',
      reopen: '개인정보 설정',
      policy: '쿠키 정책 읽기',
      ariaBanner: '개인정보 및 쿠키 동의',
    },
  },
  hi: {
    nav: {
      product: "प्रोडक्ट",
      pricing: "कीमतें",
      demo: "लाइव डेमो",
      blog: "ब्लॉग",
      help: "सहायता",
      signIn: "साइन इन करें",
      tryFree: "मुफ़्त आज़माएं",
      skip: "कंटेंट पर जाएं",
    },
    hero: {
      kicker: "ग्राहक टीमों के लिए वर्क मैनेजमेंट",
      title: "हर रिन्यूअल, हर वादा, हर टास्क, समय पर।",
      lead: "हर ग्राहक की हेल्थ और उसकी वजहें देखें, मीटिंग के अगले स्टेप को टास्क में बदलें, और रिन्यूअल को नब्बे दिन पहले अपने आप खुलने दें।",
      note: "मंज़ूरी के बाद 3 महीने मुफ़्त, कार्ड की ज़रूरत नहीं।",
      works: "आज के आपके टूल के साथ-साथ काम करता है",
      pause: "रोकें",
      play: "चलाएं",
    },
    tour: {
      label: "प्रोडक्ट टूर",
      steps: [{
          tab: "हेल्थ",
          title: "देखें किसे आपकी ज़रूरत है",
          text: "हर अकाउंट का 0 से 100 तक का स्कोर और उसकी वजहें होती हैं, ताकि शांत होता अकाउंट अपने आप सामने आ जाए।",
        }, {
          tab: "वादे",
          title: "हर वादा निभाएं",
          text: "मीटिंग दर्ज करें और उसके अगले स्टेप टास्क बन जाते हैं, हर एक ओनर और तारीख के साथ। मीटिंग में कही कोई बात नहीं खोती।",
        }, {
          tab: "रिन्यूअल",
          title: "जल्दी रिन्यू करें",
          text: "तारीख से नब्बे दिन पहले, रिन्यूअल प्लेबुक अपने टास्क और एक रिन्यूअल अवसर खोल देती है। किसी को याद नहीं रखना पड़ता।",
        }, {
          tab: "स्प्रिंट",
          title: "स्प्रिंट में शिप करें",
          text: "एपिक, स्टोरी पॉइंट और लिंक किए गए टास्क एक ही बोर्ड पर, ऐसे बर्नडाउन के साथ जो कार्ड बंद होते ही खुद बनता है।",
        }],
      ui: {
        chips: {
          review: "बिज़नेस रिव्यू 14 दिन देर से",
          renewal: "94 दिनों में रिन्यूअल",
        },
        meeting: {
          kind: "बिज़नेस रिव्यू",
          name: "Q3 बिज़नेस रिव्यू",
          ours: "हमारी तरफ़: Zeynep Tunç, Ada Demir",
          theirs: "उनकी तरफ़: Selin Aytaç",
          steps: ["अतिरिक्त सीटों का कोटेशन भेजें", "फ़ाइनेंस टीम के लिए यूसेज रिपोर्ट का ड्राफ़्ट बनाएं"],
        },
        todo: "उपयोग रिपोर्ट शेयर करें",
        tasksOpened: "2 टास्क खोले गए",
        playbook: "रिन्यूअल प्लेबुक",
        playbookSteps: ["उपयोग और हेल्थ की समीक्षा करें", "रिन्यूअल कॉल बुक करें", "रिन्यूअल कोटेशन भेजें"],
        sprint: "स्प्रिंट 24",
        active: "सक्रिय",
        points: "{total} में से {done} पॉइंट",
        ptsLeft: "{n} पॉइंट बाकी",
        burndown: "बर्नडाउन",
        ideal: "आदर्श",
        actual: "असल",
        review: "कोड रिव्यू",
        epics: ["बिलिंग", "मोबाइल", "ऑनबोर्डिंग"],
        tasks: ["फ़ाइनेंस टीम के लिए यूसेज रिपोर्ट", "स्वागत चेकलिस्ट", "CSV एक्सपोर्ट ठीक करें", "सीट के हिसाब से इनवॉइस", "iOS पर पुश नोटिफ़िकेशन"],
      },
    },
    bento: {
      title: "बाकी काम भी, पहले से तैयार",
      lead: "आपके ग्राहकों को उनका अपना दरवाज़ा मिलता है, आपके असिस्टेंट को असली जवाब, और आपका डेटा आपका ही रहता है।",
      tiles: [{
          h: "अपने असिस्टेंट से अपने अकाउंट के बारे में पूछें",
          p: "Claude या ChatGPT कनेक्ट करें। यह आपके रूप में काम करता है: सिर्फ़ वही देखता और बदलता है जो आप कर सकते हैं।",
        }, {
          h: "आपके ग्राहकों के लिए एक पोर्टल",
          p: "वे अपने ईमेल के लिंक से साइन इन करते हैं और सिर्फ़ वही देखते हैं जो आप शेयर करते हैं: उनके टास्क, उनके अनुरोध, आपके जवाब।",
        }, {
          h: "आपके मौजूदा टूल के साथ तालमेल में",
          p: "आपका CRM, स्प्रेडशीट और चैट। किसी भी तरफ़ का बदलाव दूसरी तरफ़ दिखता है।",
        }, {
          h: "पूरी तिमाही एक स्क्रीन पर",
          p: "लक्ष्य, वेटेड पाइपलाइन और पूरे पोर्टफ़ोलियो की हेल्थ, उन रिपोर्ट और डैशबोर्ड में जिन्हें आप खुद बना सकते हैं।",
        }, {
          h: "ग्यारह भाषाएं, दाएं से बाएं वाली भी",
          p: "हर व्यक्ति अपनी भाषा चुनता है। पूरा इंटरफ़ेस उसके साथ चलता है, जहां ज़रूरी हो वहां उलटा भी।",
        }, {
          h: "आपका डेटा आपका ही रहता है",
          p: "हर कंपनी डेटाबेस के अपने ही पंक्ति-स्तर के नियमों से अलग रखी जाती है, और हर बदलाव पर टेस्ट इस अलगाव की जांच करते हैं।",
        }],
      ask: {
        q: "इस हफ़्ते किन अकाउंट को मेरी ज़रूरत है?",
        a: "तीन पर आपका ध्यान चाहिए:",
        did: "मैंने Zeynep के लिए एक टास्क खोला है: Marevo का रिव्यू बुक करें।",
      },
      portal: {
        plan: "ऑनबोर्डिंग",
      },
      facts: ["SAML 2.0 या OpenID Connect के साथ SSO", "SCIM प्रोविज़निंग", "ऑडिट लॉग", "⟦eu|यूरोपीय संघ में डेटाबेस|⟧", "आपके अपने सर्वर पर भी चलता है"],
    },
    pricing: {
      title: "आसान कीमतें, प्रति सीट",
      lead: "हर प्लान सब कुछ के 3 महीने के ट्रायल से शुरू होता है। व्यूअर सीटें मुफ़्त हैं।",
      monthly: "मासिक",
      yearly: "सालाना",
      save: "⟦price|करीब 20% कम|⟧",
      summary: "⟦price|सालाना प्लान पर प्रति सीट प्रति महीना {from} से शुरू। हर प्लान तीन महीने के मुफ़्त ट्रायल से शुरू होता है, कार्ड की ज़रूरत नहीं।|कीमतें लॉन्च पर घोषित होंगी। हर प्लान मंज़ूरी के बाद तीन महीने के मुफ़्त ट्रायल से शुरू होता है, कार्ड की ज़रूरत नहीं।⟧",
      see: "प्लान की तुलना करें",
      perSeat: "प्रति सीट प्रति महीना",
      perSeatYearly: "प्रति सीट प्रति महीना, सालाना भुगतान",
      business: "Team में सब कुछ, और साथ में",
      fine: "⟦price|कीमतें अमेरिकी डॉलर में; टैक्स चेकआउट पर जोड़े जाते हैं। सीटें जुड़े हुए लोगों के हिसाब से चलती हैं। भुगतान हमारे रीसेलर Paddle संभालते हैं।|टैक्स चेकआउट पर जोड़े जाते हैं। सीटें जुड़े हुए लोगों के हिसाब से चलती हैं। भुगतान हमारे रीसेलर Paddle संभालते हैं।⟧",
      announced: "कीमत लॉन्च पर घोषित होगी",
    },
    faq: {
      title: "सवाल",
      items: [{
          q: "⟦eu|हमारा डेटा कहां रखा जाता है?|हमारा डेटा अलग कैसे रखा जाता है?⟧",
          a: "⟦eu|डेटाबेस यूरोपीय संघ में है। |⟧हर कंपनी डेटाबेस के अपने ही पंक्ति-स्तर के नियमों से अलग रखी जाती है, और हर बदलाव पर टेस्ट इस अलगाव की जांच करते हैं। डेटा प्रोसेसिंग एग्रीमेंट उपलब्ध है (कानूनी समीक्षा में चल रहा ड्राफ़्ट)।",
        }, {
          q: "क्या हम इसे अपने सर्वर पर चला सकते हैं?",
          a: "हां। एक-कंपनी पैकेज आपके अपने सर्वर या क्लाउड पर, अपने डेटाबेस के साथ चलता है; इसमें बिलिंग नहीं होती।",
        }, {
          q: "क्या हमें CRM चाहिए?",
          a: "नहीं। ग्राहक स्प्रेडशीट से आ सकते हैं, या हाथ से जोड़े जा सकते हैं। अगर आपके पास CRM है, तो Curahold दोनों तरफ़ उसके साथ तालमेल में रहता है।",
        }, {
          q: "क्या हम कभी भी रद्द कर सकते हैं?",
          a: "हां। रद्द किया गया प्लान भुगतान की गई अवधि के अंत तक काम करता है, और सब कुछ एक्सपोर्ट किया जा सकता है।",
        }, {
          q: "क्या हम अपने शब्द इस्तेमाल कर सकते हैं?",
          a: "हां। अपने ग्राहकों को अकाउंट, पार्टनर या क्लाइंट कहें, और पूरा इंटरफ़ेस उसी के हिसाब से चलेगा। ऐप, सहायता केंद्र और लाइव डेमो, तीनों ग्यारह भाषाओं में हैं।",
        }, {
          q: "सेटअप कैसे होता है?",
          a: "अपना पता चुनें, स्प्रेडशीट से अपने ग्राहक लाएं, अपनी टीम को आमंत्रित करें। गाइडेड सेटअप हर कदम पर आपका साथ देता है।",
        }],
    },
    cta: {
      title: "हर ग्राहक को ऐसी टीम दें जो कभी नहीं भूलती।",
      text: "मंज़ूरी के बाद तीन महीने मुफ़्त, सब कुछ चालू। स्प्रेडशीट से अपने ग्राहक लाएं, बाकी कदम गाइडेड सेटअप बताता है।",
    },
    signIn: {
      title: "साइन इन करें",
      text: "हर कंपनी का अपना पता होता है। उसके साइन-इन पेज पर जाने के लिए अपना पता टाइप करें।",
      label: "आपकी कंपनी का पता",
      placeholder: "yourcompany",
      go: "जाएं",
      close: "बंद करें",
      none: "अभी कोई पता नहीं? मुफ़्त ट्रायल शुरू करें।",
    },
    footer: {
      story: "यह नाम लैटिन शब्द cura (देखभाल) और अंग्रेज़ी शब्द hold से बना है।",
      help: "सहायता केंद्र",
      legal: "कानूनी",
      links: {
        terms: "सेवा की शर्तें",
        privacy: "गोपनीयता नीति",
        kvkk: "KVKK सूचना",
        dpa: "डेटा प्रोसेसिंग",
        subprocessors: "सब-प्रोसेसर",
        cookies: "कुकी",
        refunds: "रिफ़ंड नीति",
        accessibility: "एक्सेसिबिलिटी",
        sla: "सर्विस लेवल एग्रीमेंट",
        aup: "स्वीकार्य उपयोग",
        orderForm: "ऑर्डर फ़ॉर्म",
        disclosure: "सुरक्षा समस्या की रिपोर्ट करें",
      },
      company: "[कंपनी का कानूनी नाम]",
    },
    consent: {
      title: "आपकी गोपनीयता, आपकी पसंद",
      body: "हम सिर्फ़ वही इस्तेमाल करते हैं जो साइट चलाने के लिए ज़रूरी है। आपकी सहमति से हम यह भी मापते हैं कि इसका इस्तेमाल कैसे होता है और उन लोगों तक पहुंचते हैं जिन्हें Curahold पसंद आ सकता है। जब तक आप न चुनें, कुछ भी गैर-ज़रूरी लोड नहीं होता।",
      acceptAll: "सभी स्वीकार करें",
      rejectAll: "गैर-ज़रूरी अस्वीकार करें",
      manage: "पसंद मैनेज करें",
      save: "पसंद सेव करें",
      close: "बंद करें",
      alwaysOn: "हमेशा चालू",
      manageTitle: "गोपनीयता की पसंद",
      necessaryTitle: "ज़रूरी",
      necessaryBody: "यह पसंद याद रखती है और पेज को चलाए रखती है। ये कभी आपको ट्रैक नहीं करतीं और बंद नहीं की जा सकतीं।",
      analyticsTitle: "एनालिटिक्स",
      analyticsBody: "हमें समझने में मदद करता है कि साइट कैसे इस्तेमाल होती है, ताकि हम इसे बेहतर बना सकें। Google Analytics सिर्फ़ आपकी सहमति से लोड होता है।",
      marketingTitle: "मार्केटिंग",
      marketingBody: "हमें अपने प्रचार का असर मापने और उन लोगों तक पहुंचने देता है जिन्हें Curahold उपयोगी लग सकता है। Meta और TikTok पिक्सेल सिर्फ़ आपकी सहमति से लोड होते हैं।",
      reopen: "गोपनीयता की पसंद",
      policy: "कुकी नीति पढ़ें",
      ariaBanner: "गोपनीयता और कुकी सहमति",
    },
  },
  ms: {
    nav: {
      product: "Produk",
      pricing: "Harga",
      demo: "Demo langsung",
      blog: "Blog",
      help: "Bantuan",
      signIn: "Log masuk",
      tryFree: "Cuba percuma",
      skip: "Langkau ke kandungan",
    },
    hero: {
      kicker: "Pengurusan kerja untuk pasukan pelanggan",
      title: "Setiap pembaharuan, janji dan tugasan, tepat pada masa.",
      lead: "Lihat kesihatan setiap pelanggan dan sebab di sebaliknya, jadikan langkah seterusnya daripada mesyuarat sebagai tugasan, dan biarkan pembaharuan dibuka sendiri sembilan puluh hari lebih awal.",
      note: "3 bulan percuma selepas diluluskan, tiada kad diperlukan.",
      works: "Bekerja di sebelah alat yang anda ada hari ini",
      pause: "Jeda",
      play: "Main",
    },
    tour: {
      label: "Lawatan produk",
      steps: [{
          tab: "Kesihatan",
          title: "Lihat siapa yang memerlukan anda",
          text: "Setiap akaun membawa skor dari 0 hingga 100 dan sebab di sebaliknya, jadi yang semakin senyap muncul di hadapan dengan sendirinya.",
        }, {
          tab: "Janji",
          title: "Tunaikan setiap janji",
          text: "Rekodkan mesyuarat dan langkah seterusnya menjadi tugasan, setiap satu dengan pemilik dan tarikh. Tiada apa yang dikatakan dalam bilik mesyuarat hilang.",
        }, {
          tab: "Pembaharuan",
          title: "Perbaharui lebih awal",
          text: "Sembilan puluh hari sebelum tarikh, playbook pembaharuan membuka tugasannya dan peluang pembaharuan. Tiada sesiapa perlu mengingatinya.",
        }, {
          tab: "Sprint",
          title: "Hantar hasil dalam sprint",
          text: "Epik, mata cerita dan tugasan yang dipautkan pada papan yang sama, dengan burndown yang terlukis sendiri apabila kad ditutup.",
        }],
      ui: {
        chips: {
          review: "Semakan perniagaan lewat 14 hari",
          renewal: "Pembaharuan dalam 94 hari",
        },
        meeting: {
          kind: "Semakan perniagaan",
          name: "Semakan perniagaan S3",
          ours: "Pihak kami: Zeynep Tunç, Ada Demir",
          theirs: "Pihak mereka: Selin Aytaç",
          steps: ["Hantar sebut harga pengguna tambahan", "Draf laporan penggunaan untuk pasukan kewangan mereka"],
        },
        todo: "Kongsi laporan penggunaan",
        tasksOpened: "2 tugasan dibuka",
        playbook: "Playbook pembaharuan",
        playbookSteps: ["Semak penggunaan dan kesihatan", "Tempah panggilan pembaharuan", "Hantar sebut harga pembaharuan"],
        sprint: "Sprint 24",
        active: "Aktif",
        points: "{done} daripada {total} mata",
        ptsLeft: "{n} mata lagi",
        burndown: "Burndown",
        ideal: "Ideal",
        actual: "Sebenar",
        review: "Semakan kod",
        epics: ["Pengebilan", "Mudah alih", "Onboarding"],
        tasks: ["Laporan penggunaan untuk pasukan kewangan", "Senarai semak alu-aluan", "Betulkan eksport CSV", "Invois berasaskan pengguna", "Pemberitahuan tolak pada iOS"],
      },
    },
    bento: {
      title: "Selebihnya kerja, sudah terbina",
      lead: "Pelanggan anda mendapat pintu mereka sendiri, pembantu anda mendapat jawapan sebenar, dan data anda kekal milik anda.",
      tiles: [{
          h: "Tanya pembantu anda tentang akaun anda",
          p: "Sambungkan Claude atau ChatGPT. Ia bertindak sebagai anda: ia hanya melihat dan mengubah apa yang anda boleh.",
        }, {
          h: "Portal untuk pelanggan anda",
          p: "Mereka log masuk dengan pautan dalam e-mel mereka dan hanya melihat apa yang anda kongsi: tugasan mereka, permintaan mereka, balasan anda.",
        }, {
          h: "Selaras dengan alat yang anda ada",
          p: "CRM, hamparan dan sembang anda. Perubahan di mana-mana pihak dipaparkan di pihak yang satu lagi.",
        }, {
          h: "Suku tahun pada satu skrin",
          p: "Sasaran, saluran jualan berwajaran dan kesihatan seluruh portfolio, dalam laporan dan papan pemuka yang boleh anda bina sendiri.",
        }, {
          h: "Sebelas bahasa, termasuk kanan-ke-kiri",
          p: "Setiap orang memilih bahasanya sendiri. Seluruh antara muka mengikut, dicerminkan di mana perlu.",
        }, {
          h: "Data anda kekal milik anda",
          p: "Setiap syarikat diasingkan oleh peraturan peringkat baris dalam pangkalan data itu sendiri, dan ujian menyemak pengasingan ini pada setiap perubahan.",
        }],
      ask: {
        q: "Akaun mana yang memerlukan saya minggu ini?",
        a: "Tiga memerlukan perhatian anda:",
        did: "Saya telah membuka tugasan untuk Zeynep: tempah semakan Marevo.",
      },
      portal: {
        plan: "Onboarding",
      },
      facts: ["SSO dengan SAML 2.0 atau OpenID Connect", "Peruntukan SCIM", "Log audit", "⟦eu|Pangkalan data di Kesatuan Eropah|⟧", "Juga berjalan pada pelayan anda sendiri"],
    },
    pricing: {
      title: "Harga ringkas, bagi setiap pengguna",
      lead: "Setiap pelan bermula dengan percubaan 3 bulan untuk semua ciri. Pemerhati adalah percuma.",
      monthly: "Bulanan",
      yearly: "Tahunan",
      save: "⟦price|kira-kira 20% kurang|⟧",
      summary: "⟦price|Dari {from} setiap pengguna sebulan dengan pelan tahunan. Setiap pelan bermula dengan tiga bulan percuma, tiada kad diperlukan.|Harga diumumkan semasa pelancaran. Setiap pelan bermula dengan tiga bulan percuma selepas diluluskan, tiada kad diperlukan.⟧",
      see: "Bandingkan pelan",
      perSeat: "setiap pengguna sebulan",
      perSeatYearly: "setiap pengguna sebulan, dibayar tahunan",
      business: "Semua dalam Team, serta",
      fine: "⟦price|Harga dalam dolar AS; cukai ditambah semasa pembayaran. Bilangan pengguna mengikut orang yang telah menyertai. Pembayaran dikendalikan oleh Paddle, penjual semula kami.|Cukai ditambah semasa pembayaran. Bilangan pengguna mengikut orang yang telah menyertai. Pembayaran dikendalikan oleh Paddle, penjual semula kami.⟧",
      announced: "Harga diumumkan semasa pelancaran",
    },
    faq: {
      title: "Soalan",
      items: [{
          q: "⟦eu|Di mana data kami disimpan?|Bagaimana data kami diasingkan?⟧",
          a: "⟦eu|Pangkalan data berada di Kesatuan Eropah. |⟧Setiap syarikat diasingkan oleh peraturan peringkat baris dalam pangkalan data itu sendiri, dan ujian menyemak pengasingan ini pada setiap perubahan. Perjanjian pemprosesan data tersedia (draf dalam semakan undang-undang).",
        }, {
          q: "Bolehkah kami menjalankannya pada pelayan kami sendiri?",
          a: "Ya. Pakej satu syarikat berjalan pada pelayan atau awan anda sendiri dengan pangkalan datanya sendiri; ia tiada pengebilan.",
        }, {
          q: "Adakah kami memerlukan CRM?",
          a: "Tidak. Pelanggan boleh datang daripada hamparan, atau ditambah secara manual. Jika anda mempunyai CRM, Curahold kekal selaras dengannya dua hala.",
        }, {
          q: "Bolehkah kami membatalkan bila-bila masa?",
          a: "Ya. Pelan yang dibatalkan berfungsi sehingga akhir tempoh yang dibayar, dan semuanya boleh dieksport.",
        }, {
          q: "Bolehkah kami menggunakan perkataan kami sendiri?",
          a: "Ya. Panggil pelanggan anda akaun, rakan kongsi atau klien, dan seluruh antara muka mengikut. Aplikasi, pusat bantuan dan demo langsung semuanya tersedia dalam sebelas bahasa.",
        }, {
          q: "Bagaimana persediaan berjalan?",
          a: "Pilih alamat anda, bawa pelanggan anda daripada hamparan, jemput pasukan anda. Persediaan berpandu membimbing anda pada setiap langkah.",
        }],
    },
    cta: {
      title: "Berikan setiap pelanggan pasukan yang tidak pernah lupa.",
      text: "Tiga bulan percuma selepas diluluskan, dengan semua ciri dihidupkan. Bawa pelanggan anda daripada hamparan dan persediaan berpandu membimbing anda selebihnya.",
    },
    signIn: {
      title: "Log masuk",
      text: "Setiap syarikat mempunyai alamatnya sendiri. Taip alamat anda untuk pergi ke halaman log masuknya.",
      label: "Alamat syarikat anda",
      placeholder: "yourcompany",
      go: "Pergi",
      close: "Tutup",
      none: "Belum ada alamat? Mulakan percubaan percuma.",
    },
    footer: {
      story: "Nama ini berasal daripada perkataan Latin cura, penjagaan, dan perkataan Inggeris hold.",
      help: "Pusat bantuan",
      legal: "Undang-undang",
      links: {
        terms: "Terma perkhidmatan",
        privacy: "Dasar privasi",
        kvkk: "Notis KVKK",
        dpa: "Pemprosesan data",
        subprocessors: "Subpemproses",
        cookies: "Kuki",
        refunds: "Dasar bayaran balik",
        accessibility: "Kebolehcapaian",
        sla: "Perjanjian tahap perkhidmatan",
        aup: "Penggunaan yang boleh diterima",
        orderForm: "Borang pesanan",
        disclosure: "Laporkan masalah keselamatan",
      },
      company: "[Nama sah syarikat]",
    },
    consent: {
      title: "Privasi anda, pilihan anda",
      body: "Kami hanya menggunakan apa yang diperlukan untuk menjalankan laman ini. Dengan persetujuan anda, kami juga mengukur cara ia digunakan dan menjangkau orang yang mungkin menyukai Curahold. Tiada apa yang tidak penting dimuatkan sehingga anda memilih.",
      acceptAll: "Terima semua",
      rejectAll: "Tolak yang tidak penting",
      manage: "Urus pilihan",
      save: "Simpan pilihan",
      close: "Tutup",
      alwaysOn: "Sentiasa hidup",
      manageTitle: "Pilihan privasi",
      necessaryTitle: "Diperlukan",
      necessaryBody: "Mengingati pilihan ini dan memastikan halaman berfungsi. Ia tidak pernah menjejaki anda dan tidak boleh dimatikan.",
      analyticsTitle: "Analitik",
      analyticsBody: "Membantu kami memahami cara laman ini digunakan, supaya kami boleh menambah baiknya. Memuatkan Google Analytics hanya dengan persetujuan anda.",
      marketingTitle: "Pemasaran",
      marketingBody: "Membolehkan kami mengukur keberkesanan iklan kami dan menjangkau orang yang mungkin mendapati Curahold berguna. Memuatkan piksel Meta dan TikTok hanya dengan persetujuan anda.",
      reopen: "Pilihan privasi",
      policy: "Baca dasar kuki",
      ariaBanner: "Persetujuan privasi dan kuki",
    },
  },
};

// The site's languages are listed once, in site/locales.ts; COPY must hold every
// one of them (TypeScript says which is missing). A language without copy has no
// page — the builder never ships machine text dressed as native.

/** The landing page's copy for one of the site's languages. */
export const siteCopy = (locale: SiteLocale): SiteCopy => gated(COPY[locale]);

/** The consent words for a locale. */
export const siteConsent = (locale: SiteLocale): SiteConsentCopy => siteCopy(locale).consent;

/**
 * The story right after the hero: one customer (the demo's Marevo) through six
 * steps, told in text on one side while a product screen follows the scroll on
 * the other. Every screen is drawn from the app's own words where the app has
 * them; these are the words it does not.
 */
export interface SiteStoryCopy {
  /** The quiet link at the foot of the hero that leads into the story. */
  cue: string;
  title: string;
  lead: string;
  /** Six steps, in order: health drops, the promise, the task, the sprint, the portal, the renewal. */
  steps: { title: string; text: string }[];
  ui: {
    /** Toast once the meeting is saved and its next step has become a task. */
    opened: string;
    /** Task field: the meeting the task came from. */
    from: string;
    /** The customer-success board the task lands on. */
    board: string;
    /** The reply the customer reads under the finished task in their portal. */
    reply: string;
  };
}

export const STORY_COPY: Partial<Record<SiteLocale, SiteStoryCopy>> = {
  en: {
    cue: 'Scroll to follow one customer',
    title: 'One customer, start to finish',
    lead: 'Follow Marevo through one quarter: a warning, a promise, the work that keeps it, and a renewal saved.',
    steps: [
      { title: 'The score drops, and says why', text: 'Marevo slips from 60 to 48 and turns at risk. Open Why? and the reasons are listed: no touch in 38 days, three overdue tasks, no champion.' },
      { title: 'A promise is made in the room', text: 'At the Q3 business review, Selin asks for a usage report for their finance team. Zeynep logs it as a next step before the call ends.' },
      { title: 'It becomes a task by itself', text: 'Saving the meeting turns the next step into a task: it has an owner and a due date, it is linked to Marevo, and it is shared with them.' },
      { title: 'The sprint ships it', text: 'The product team builds it in Sprint 24, on a card linked to the promise. When the card reaches Done, the sprint’s points move with it.' },
      { title: 'Marevo sees it in their portal', text: 'Selin signs in with the link in her email. The task shows as done, with Zeynep’s reply under it. Nobody had to write a status email.' },
      { title: 'The renewal is saved, and health climbs back', text: 'With a recent touch and nothing overdue, Marevo’s score climbs back to 85. The renewal opportunity closes as won, well before the date.' },
    ],
    ui: {
      opened: 'Task opened',
      from: 'From the meeting',
      board: 'Customer success',
      reply: 'The usage report is ready in your workspace.',
    },
  },
  tr: {
    cue: 'Kaydırın, bir müşteriyi baştan sona izleyin',
    title: 'Bir müşteri, baştan sona',
    lead: 'Marevo’nun bir çeyreğini izleyin: bir uyarı, verilen bir söz, o sözü tutan iş ve kurtarılan bir yenileme.',
    steps: [
      { title: 'Skor düşer ve nedenini söyler', text: 'Marevo 60’tan 48’e iner ve riskli olur. “Neden?” bağlantısını açın; sebepler orada: 38 gündür temas yok, üç görev gecikmiş, güçlü destekçi yok.' },
      { title: 'Söz toplantıda verilir', text: '3. çeyrek iş değerlendirmesinde Selin, finans ekipleri için bir kullanım raporu ister. Zeynep görüşme bitmeden bunu sonraki adım olarak yazar.' },
      { title: 'Söz kendiliğinden göreve dönüşür', text: 'Toplantıyı kaydedince sonraki adım göreve dönüşür: sorumlusu ve son tarihi bellidir, Marevo’ya bağlıdır ve onlarla paylaşılır.' },
      { title: 'Sprint onu teslim eder', text: 'Ürün ekibi bunu Sprint 24’te, söze bağlı bir kartta geliştirir. Kart Tamamlandı’ya ulaşınca sprint puanları da onunla ilerler.' },
      { title: 'Marevo onu kendi portalında görür', text: 'Selin e-postasındaki bağlantıyla girer. Görev tamamlandı olarak görünür, altında Zeynep’in yanıtı durur. Kimsenin durum e-postası yazması gerekmez.' },
      { title: 'Yenileme kurtulur, sağlık geri yükselir', text: 'Yakın zamanda temas var, geciken iş yok; Marevo’nun skoru yeniden 85’e çıkar. Yenileme fırsatı, tarihinden çok önce kazanıldı olarak kapanır.' },
    ],
    ui: {
      opened: 'Görev açıldı',
      from: 'Geldiği toplantı',
      board: 'Müşteri başarısı',
      reply: 'Kullanım raporu çalışma alanınızda hazır.',
    },
  },
  ar: {
    cue: 'مرّر لتتابع عميلًا واحدًا',
    title: 'عميل واحد، من البداية إلى النهاية',
    lead: 'تابع Marevo على مدى ربع سنة: تحذير، ثم وعد، ثم العمل الذي يفي به، ثم تجديد أُنقذ.',
    steps: [
      { title: 'تنخفض الدرجة وتقول السبب', text: 'تهبط Marevo من 60 إلى 48 وتصبح معرّضة للخطر. افتح «لماذا؟» فتجد الأسباب: لا تواصل منذ 38 يومًا، وثلاث مهام متأخرة، ولا مناصر.' },
      { title: 'يُقطع الوعد في الاجتماع', text: 'في مراجعة أعمال الربع الثالث تطلب Selin تقرير استخدام لفريقهم المالي. تسجّلها Zeynep خطوةً تالية قبل أن تنتهي المكالمة.' },
      { title: 'يتحوّل إلى مهمة تلقائيًا', text: 'عند حفظ الاجتماع تصبح الخطوة التالية مهمة: لها مسؤول وتاريخ استحقاق، ومرتبطة بـ Marevo، ومُشارَكة معهم.' },
      { title: 'السبرنت يسلّمها', text: 'يبنيها فريق المنتج في سبرنت 24 على بطاقة مرتبطة بالوعد. وحين تصل البطاقة إلى «تم» تتقدّم نقاط السبرنت معها.' },
      { title: 'تراها Marevo في بوابتها', text: 'تدخل Selin عبر الرابط في بريدها. تظهر المهمة منجزة وتحتها ردّ Zeynep. لم يضطر أحد إلى كتابة بريد عن سير العمل.' },
      { title: 'يُنقذ التجديد وتعود الصحة', text: 'مع تواصل حديث ولا شيء متأخر، تعود درجة Marevo إلى 85. وتُغلق فرصة التجديد رابحةً قبل موعدها بوقت طويل.' },
    ],
    ui: { opened: 'فُتحت المهمة', from: 'من الاجتماع', board: 'نجاح العملاء', reply: 'تقرير الاستخدام جاهز في مساحة عملكم.' },
  },
  he: {
    cue: 'גללו כדי ללוות לקוח אחד',
    title: 'לקוח אחד, מההתחלה ועד הסוף',
    lead: 'לוו את Marevo לאורך רבעון אחד: אזהרה, הבטחה, העבודה שמקיימת אותה וחידוש שניצל.',
    steps: [
      { title: 'הציון יורד ואומר למה', text: 'Marevo יורדת מ־60 ל־48 ועוברת לסיכון. פתחו את „למה?” והסיבות שם: אין מגע כבר 38 ימים, שלוש משימות באיחור, אין תומך מרכזי.' },
      { title: 'הבטחה ניתנת בחדר', text: 'בסקירה העסקית של רבעון 3, Selin מבקשת דוח שימוש לצוות הכספים שלהם. Zeynep רושמת זאת כצעד הבא עוד לפני שהשיחה נגמרת.' },
      { title: 'היא הופכת למשימה מעצמה', text: 'שמירת הפגישה הופכת את הצעד הבא למשימה: יש לה אחראי ותאריך יעד, היא מקושרת ל־Marevo ומשותפת איתם.' },
      { title: 'הספרינט מספק אותה', text: 'צוות המוצר בונה אותה בספרינט 24, על כרטיס שמקושר להבטחה. כשהכרטיס מגיע ל„הושלם”, נקודות הספרינט מתקדמות איתו.' },
      { title: 'Marevo רואה אותה בפורטל שלה', text: 'Selin נכנסת עם הקישור שבדוא״ל. המשימה מופיעה כהושלמה, והתשובה של Zeynep מתחתיה. אף אחד לא נדרש לכתוב דוא״ל עדכון.' },
      { title: 'החידוש ניצל והבריאות חוזרת', text: 'עם מגע עדכני ושום דבר באיחור, הציון של Marevo חוזר ל־85. הזדמנות החידוש נסגרת בהצלחה, הרבה לפני המועד.' },
    ],
    ui: { opened: 'המשימה נפתחה', from: 'מהפגישה', board: 'הצלחת לקוחות', reply: 'דוח השימוש מוכן בסביבת העבודה שלכם.' },
  },
  fa: {
    cue: 'اسکرول کنید و یک مشتری را دنبال کنید',
    title: 'یک مشتری، از آغاز تا پایان',
    lead: 'Marevo را در یک فصل دنبال کنید: یک هشدار، یک قول، کاری که آن قول را نگه می‌دارد و تمدیدی که نجات پیدا می‌کند.',
    steps: [
      { title: 'امتیاز پایین می‌آید و دلیلش را می‌گوید', text: 'Marevo از ۶۰ به ۴۸ می‌رسد و در خطر قرار می‌گیرد. «چرا؟» را باز کنید؛ دلیل‌ها آنجاست: ۳۸ روز بدون تماس، سه وظیفهٔ عقب‌افتاده، بدون حامی.' },
      { title: 'قول در جلسه داده می‌شود', text: 'در بازبینی کسب‌وکار فصل سوم، Selin یک گزارش استفاده برای تیم مالی‌شان می‌خواهد. Zeynep پیش از پایان تماس آن را گام بعدی ثبت می‌کند.' },
      { title: 'خودبه‌خود وظیفه می‌شود', text: 'با ذخیرهٔ جلسه، گام بعدی به وظیفه تبدیل می‌شود: مسئول و موعد دارد، به Marevo پیوند خورده و با آن‌ها به اشتراک گذاشته شده است.' },
      { title: 'اسپرینت تحویلش می‌دهد', text: 'تیم محصول آن را در اسپرینت ۲۴، روی کارتی که به قول پیوند دارد، می‌سازد. وقتی کارت به «انجام‌شده» می‌رسد، امتیازهای اسپرینت هم با آن جلو می‌روند.' },
      { title: 'Marevo آن را در پورتال خودش می‌بیند', text: 'Selin با پیوندی که در ایمیلش است وارد می‌شود. وظیفه انجام‌شده دیده می‌شود و پاسخ Zeynep زیر آن است. هیچ‌کس مجبور نشد ایمیل گزارش وضعیت بنویسد.' },
      { title: 'تمدید نجات پیدا می‌کند و سلامت برمی‌گردد', text: 'با تماسی تازه و بدون کار عقب‌افتاده، امتیاز Marevo دوباره به ۸۵ می‌رسد. فرصت تمدید خیلی پیش از موعد با موفقیت بسته می‌شود.' },
    ],
    ui: { opened: 'وظیفه باز شد', from: 'از جلسه', board: 'موفقیت مشتری', reply: 'گزارش استفاده در فضای کار شما آماده است.' },
  },
  'zh-Hans': {
    cue: '向下滚动，跟随一位客户',
    title: '一位客户，从头到尾',
    lead: '跟随 Marevo 走完一个季度：一次预警、一个承诺、兑现承诺的工作，以及一次挽回的续约。',
    steps: [
      { title: '分数下降，并说明原因', text: 'Marevo 从 60 降到 48，变为有风险。点开“为什么？”，原因一目了然：38 天没有联系、3 个任务逾期、没有内部支持者。' },
      { title: '承诺在会上做出', text: '在第三季度业务回顾中，Selin 希望为他们的财务团队拿到一份使用情况报告。通话还没结束，Zeynep 就把它记为后续步骤。' },
      { title: '它自动变成任务', text: '保存会议后，后续步骤就成了任务：有负责人、有截止日期，关联到 Marevo，并与对方共享。' },
      { title: '迭代把它交付', text: '产品团队在迭代 24 中，用一张关联到该承诺的卡片完成开发。卡片进入“完成”时，迭代的点数随之推进。' },
      { title: 'Marevo 在自己的门户里看到', text: 'Selin 通过邮件中的链接登录，看到任务已完成，下方是 Zeynep 的回复。没有人需要再写进度邮件。' },
      { title: '续约保住了，健康度回升', text: '近期有联系、没有逾期事项，Marevo 的分数回到 85。续约商机远在到期日之前就以赢单关闭。' },
    ],
    ui: { opened: '任务已创建', from: '来源会议', board: '客户成功', reply: '使用情况报告已在你们的工作区准备好。' },
  },
  'zh-Hant': {
    cue: '向下捲動，跟著一位客戶走',
    title: '一位客戶，從頭到尾',
    lead: '跟著 Marevo 走過一個季度：一次警訊、一個承諾、兌現承諾的工作，以及一次挽回的續約。',
    steps: [
      { title: '分數下滑，並說出原因', text: 'Marevo 從 60 掉到 48，變成有風險。打開「為什麼？」，原因都在那裡：38 天沒有接觸、3 項任務逾期、沒有擁護者。' },
      { title: '承諾在會議上做出', text: '在第三季業務檢視中，Selin 想為他們的財務團隊取得一份使用情況報告。通話結束前，Zeynep 就把它記成後續步驟。' },
      { title: '它自動變成任務', text: '儲存會議後，後續步驟就變成任務：有負責人、有截止日，連結到 Marevo，並與對方共用。' },
      { title: '衝刺把它交付', text: '產品團隊在衝刺 24 中，以一張連結到承諾的卡片完成開發。卡片移到「完成」時，衝刺點數也跟著前進。' },
      { title: 'Marevo 在自己的入口網站看到', text: 'Selin 用電子郵件裡的連結登入，任務顯示為已完成，下方是 Zeynep 的回覆。沒有人需要再寫進度郵件。' },
      { title: '續約保住了，健康度回升', text: '最近有接觸、沒有逾期事項，Marevo 的分數回到 85。續約交易遠在到期日之前就以贏得結案。' },
    ],
    ui: { opened: '任務已建立', from: '來源會議', board: '客戶成功', reply: '使用情況報告已在你們的工作區準備好。' },
  },
  ja: {
    cue: 'スクロールして、ひとつの顧客を追う',
    title: 'ひとつの顧客を、最初から最後まで',
    lead: 'Marevo の一四半期を追いかけます。警告、約束、それを守る仕事、そして守られた更新。',
    steps: [
      { title: 'スコアが下がり、理由を示す', text: 'Marevo は 60 から 48 に下がり、リスクありになります。「理由」を開くと、38日間接触なし、期限超過のタスク3件、推進者なし、と並んでいます。' },
      { title: '約束はミーティングで生まれる', text: '第3四半期ビジネスレビューで、Selin が経理チーム向けの利用状況レポートを求めます。Zeynep は通話が終わる前に、それを次のステップとして記録します。' },
      { title: 'それはひとりでにタスクになる', text: 'ミーティングを保存すると、次のステップがタスクになります。担当者と期日があり、Marevo にひもづき、先方とも共有されます。' },
      { title: 'スプリントが届ける', text: 'プロダクトチームはスプリント 24 で、約束にひもづいたカードとしてこれを開発します。カードが「完了」に進むと、スプリントのポイントも一緒に進みます。' },
      { title: 'Marevo は自分のポータルで確認する', text: 'Selin はメールのリンクからログインします。タスクは完了と表示され、その下に Zeynep の返信があります。誰も進捗メールを書く必要はありません。' },
      { title: '更新は守られ、ヘルスが戻る', text: '最近の接触があり、期限超過もないので、Marevo のスコアは 85 に戻ります。更新の商談は期日よりずっと前に受注で完了します。' },
    ],
    ui: { opened: 'タスクを作成しました', from: '元のミーティング', board: 'カスタマーサクセス', reply: '利用状況レポートをワークスペースにご用意しました。' },
  },
  ko: {
    cue: '스크롤해서 한 고객을 따라가 보세요',
    title: '한 고객, 처음부터 끝까지',
    lead: 'Marevo의 한 분기를 따라가 보세요. 경고 하나, 약속 하나, 그 약속을 지키는 일, 그리고 지켜 낸 갱신.',
    steps: [
      { title: '점수가 떨어지고, 이유를 알려 줍니다', text: 'Marevo가 60에서 48로 떨어지며 위험 상태가 됩니다. ‘이유’를 열면 38일째 접점 없음, 기한 초과 작업 3개, 챔피언 없음이 보입니다.' },
      { title: '약속은 회의에서 생깁니다', text: '3분기 비즈니스 리뷰에서 Selin이 재무팀용 사용 현황 보고서를 요청합니다. Zeynep은 통화가 끝나기 전에 이를 다음 단계로 기록합니다.' },
      { title: '저절로 작업이 됩니다', text: '회의를 저장하면 다음 단계가 작업이 됩니다. 담당자와 마감일이 있고, Marevo에 연결되며, 고객과 공유됩니다.' },
      { title: '스프린트가 전달합니다', text: '제품 팀은 약속에 연결된 카드로 스프린트 24에서 이를 개발합니다. 카드가 ‘완료’에 도달하면 스프린트 포인트도 함께 움직입니다.' },
      { title: 'Marevo는 자기 포털에서 확인합니다', text: 'Selin은 이메일의 링크로 로그인합니다. 작업은 완료로 표시되고, 그 아래에 Zeynep의 답장이 있습니다. 아무도 진행 상황 메일을 쓰지 않아도 됩니다.' },
      { title: '갱신을 지키고, 건강도가 회복됩니다', text: '최근 접점이 있고 기한 초과도 없으니 Marevo의 점수는 85로 돌아옵니다. 갱신 기회는 마감일보다 한참 전에 성사로 마무리됩니다.' },
    ],
    ui: { opened: '작업이 생성됨', from: '출처 회의', board: '고객 성공', reply: '사용 현황 보고서가 워크스페이스에 준비되어 있습니다.' },
  },
  hi: {
    cue: "एक ग्राहक को फ़ॉलो करने के लिए स्क्रॉल करें",
    title: "एक ग्राहक, शुरू से आख़िर तक",
    lead: "एक तिमाही में Marevo को फ़ॉलो करें: एक चेतावनी, एक वादा, उसे निभाने वाला काम, और बचाया गया रिन्यूअल।",
    steps: [{
        title: "स्कोर गिरता है, और वजह बताता है",
        text: "Marevo 60 से 48 पर फिसलता है और जोखिम में आ जाता है। “क्यों?” खोलें और वजहें दिखती हैं: 38 दिनों से कोई संपर्क नहीं, तीन देर वाले टास्क, कोई चैंपियन नहीं।",
      }, {
        title: "मीटिंग में एक वादा होता है",
        text: "Q3 बिज़नेस रिव्यू में, Selin अपनी फ़ाइनेंस टीम के लिए एक यूसेज रिपोर्ट मांगती हैं। कॉल खत्म होने से पहले Zeynep इसे अगले स्टेप के रूप में दर्ज करती हैं।",
      }, {
        title: "यह अपने आप टास्क बन जाता है",
        text: "मीटिंग सेव करने पर अगला स्टेप एक टास्क बन जाता है: इसका एक ओनर और नियत तारीख है, यह Marevo से लिंक है, और उनके साथ शेयर किया गया है।",
      }, {
        title: "स्प्रिंट इसे शिप करता है",
        text: "प्रोडक्ट टीम इसे स्प्रिंट 24 में, वादे से लिंक किए एक कार्ड पर बनाती है। कार्ड पूरा हुआ तक पहुंचने पर स्प्रिंट के पॉइंट भी साथ बढ़ते हैं।",
      }, {
        title: "Marevo इसे अपने पोर्टल में देखता है",
        text: "Selin अपने ईमेल के लिंक से साइन इन करती हैं। टास्क पूरा दिखता है, नीचे Zeynep का जवाब है। किसी को स्टेटस ईमेल नहीं लिखना पड़ा।",
      }, {
        title: "रिन्यूअल बच जाता है, और हेल्थ वापस बढ़ती है",
        text: "हाल के संपर्क और किसी देर वाले काम के न होने से Marevo का स्कोर वापस 85 तक चढ़ता है। रिन्यूअल अवसर तारीख से काफ़ी पहले जीती के रूप में बंद होता है।",
      }],
    ui: {
      opened: "टास्क खोला गया",
      from: "मीटिंग से",
      board: "कस्टमर सक्सेस",
      reply: "यूसेज रिपोर्ट आपके वर्कस्पेस में तैयार है।",
    },
  },
  ms: {
    cue: "Tatal untuk mengikuti seorang pelanggan",
    title: "Seorang pelanggan, dari awal hingga akhir",
    lead: "Ikuti Marevo sepanjang satu suku tahun: satu amaran, satu janji, kerja yang menunaikannya, dan pembaharuan yang diselamatkan.",
    steps: [{
        title: "Skor jatuh, dan menyatakan sebabnya",
        text: "Marevo merosot dari 60 ke 48 dan menjadi berisiko. Buka Mengapa? dan sebab-sebabnya disenaraikan: tiada hubungan selama 38 hari, tiga tugasan lewat, tiada penyokong utama.",
      }, {
        title: "Janji dibuat dalam bilik mesyuarat",
        text: "Pada semakan perniagaan S3, Selin meminta laporan penggunaan untuk pasukan kewangan mereka. Zeynep merekodkannya sebagai langkah seterusnya sebelum panggilan tamat.",
      }, {
        title: "Ia menjadi tugasan dengan sendirinya",
        text: "Menyimpan mesyuarat menjadikan langkah seterusnya tugasan: ia mempunyai pemilik dan tarikh akhir, dipautkan kepada Marevo, dan dikongsi dengan mereka.",
      }, {
        title: "Sprint mengeluarkannya",
        text: "Pasukan produk membinanya dalam Sprint 24, pada kad yang dipautkan kepada janji. Apabila kad sampai ke Selesai, mata sprint turut bergerak.",
      }, {
        title: "Marevo melihatnya dalam portal mereka",
        text: "Selin log masuk dengan pautan dalam e-melnya. Tugasan dipaparkan sebagai selesai, dengan balasan Zeynep di bawahnya. Tiada sesiapa perlu menulis e-mel status.",
      }, {
        title: "Pembaharuan diselamatkan, dan kesihatan pulih",
        text: "Dengan hubungan terkini dan tiada yang lewat, skor Marevo naik semula ke 85. Peluang pembaharuan ditutup sebagai dimenangi, jauh sebelum tarikhnya.",
      }],
    ui: {
      opened: "Tugasan dibuka",
      from: "Daripada mesyuarat",
      board: "Kejayaan pelanggan",
      reply: "Laporan penggunaan sudah sedia dalam ruang kerja anda.",
    },
  },
};

/**
 * The languages the story ships in: all eleven. A language missing here would leave the
 * story — and the hero's cue that leads into it — out of its page entirely: no English
 * on its page and no empty section. tests/site-copy.test.ts holds the list to this.
 */
export const STORY_LOCALES = Object.keys(STORY_COPY) as SiteLocale[];

/** The story's words for a locale, or null where the story does not ship yet. */
export const siteStory = (locale: SiteLocale): SiteStoryCopy | null => STORY_COPY[locale] ?? null;

// The blog's own labels, in the languages the blog is written in.
export const BLOG_COPY: Partial<Record<SiteLocale, SiteBlogCopy>> = {
  en: {
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
  tr: {
    nav: 'Blog',
    title: 'Curahold blog',
    lead: 'Müşteri başarısı ve müşteri yönetimi ekipleri için görev yönetimi üzerine sade, işe yarar yazılar — ve Curahold’u farklı kılan toplantıdan göreve akışı.',
    metaTitle: 'Blog: müşteri ekipleri için görev yönetimi — Curahold',
    metaDescription: 'Görev yönetimi, toplantıları göreve dönüştürme ve müşteri başarısı ekipleri için CRM-görev melez akışı üzerine rehberler.',
    readMore: 'Yazıyı okuyun',
    backToBlog: 'Tüm yazılar',
    minRead: 'dk okuma',
    updated: 'Yayımlandı',
    tags: 'Konular',
  },
};

/** The blog's labels for a locale; English where the blog is not written in it. */
export const siteBlog = (locale: SiteLocale): SiteBlogCopy => BLOG_COPY[locale] ?? BLOG_COPY.en!;

// Blog posts, authored per language. A locale appears on the blog only when it
// has native posts here — the builder never dresses English text as another
// language, so hreflang on a post lists only the languages it truly exists in.
// Content is invented and genuinely useful; it names no real person or company.
export const BLOG_POSTS: Partial<Record<SiteLocale, BlogPost[]>> = {
  en: [
    {
      slug: 'what-is-task-management',
      seo: ['What is task management? A guide for customer teams', 'A plain guide to task management for customer success and account teams: what a task is, the few fields that matter, and keeping the list honest.'],
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
      seo: ['Turn meeting notes into tasks that get done | Curahold', 'Most next steps die in a notebook. A simple meeting-to-task workflow, with owners, dates and context, so the promises made in a meeting are kept.'],
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
      seo: ['Task vs project management for customer teams', 'Task management and project management solve different problems. How to tell them apart, and why customer teams need tasks tied to the customer.'],
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
      seo: ['Görev yönetimi nedir? Müşteri ekipleri için rehber', 'Müşteri başarısı ve müşteri yönetimi ekipleri için sade bir görev yönetimi rehberi: görev nedir, hangi alanlar önemlidir, liste nasıl dürüst kalır.'],
      title: 'Görev yönetimi nedir? Müşteri ekipleri için pratik bir rehber',
      description:
        'Müşteri başarısı ve müşteri yönetimi ekipleri için sade bir görev yönetimi rehberi: görev aslında nedir, hangi birkaç alan önemlidir ve ortak liste nasıl dürüst tutulur.',
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
            'Başlık: sonucu sade sözlerle; eylemi değil. “Yenileme teklifi gönderilecek”, “Yenileme” değil.',
            'Sorumlu: başkaları yardım etse bile tam olarak tek kişi.',
            'Son tarih: gerçek bir tarih, ki liste sırada ne olduğuna göre sıralanabilsin.',
            'Durum: nerede olduğu — yapılacak, yapılıyor, bitti — ve ihtiyaç olana kadar daha fazlası değil.',
            'Bağlam: geldiği müşteri, toplantı ya da konu, tek tıkla erişilir.',
          ],
        },
        { h: 'Listeyi dürüst tutun' },
        {
          p: 'Bir görev listesi ancak ekip ona güvenirse işe yarar. Bu güven iki alışkanlıkla kurulur: kafanızda ya da gelen kutunuzda görev olmayan hiçbir şey kalmaz ve bir görev bittiği an kapatılır — haftalık toplu temizliğe bırakılmaz. Gerçeğin gerisinde kalan liste sessizce okunmaz olur.',
        },
        {
          quote: 'En iyi görev listesi, ekibinizin pazartesi sabahı gerçekten açtığı listedir — çünkü onlara bir kez bile yalan söylememiştir.',
        },
        { h: 'Görev yönetimi müşteriyle buluştuğunda' },
        {
          p: 'Genel yapılacaklar uygulamaları her görevi aynı sayar. Müşteri ekipleri böyle çalışmaz: bir görev neredeyse her zaman bir müşteriye, bir toplantıya ya da bir yenilemeye aittir. Görev o bağlamın yanında yaşadığında — ve bir iş değerlendirmesini bitirmek takip adımlarını kendiliğinden oluşturabildiğinde — liste angarya olmaktan çıkar, planın kendisi olur. Görevlerle müşteri bağlamının bu melezi, Curahold’un tam da üzerine kurulduğu şeydir.',
        },
      ],
    },
    {
      slug: 'turn-meetings-into-tasks',
      seo: ['Toplantı notlarını göreve dönüştürmek | Curahold', 'Sonraki adımların çoğu bir defterde kalır. Sorumlu, tarih ve bağlamla, toplantıda verilen sözlerin kaybolmasını önleyen sade bir akış.'],
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
        { h: 'Söyleneni yapılacaktan ayırın' },
        {
          p: 'Bir toplantı notunda iki tür satır vardır: olanın kaydı ve bundan sonrasına dair taahhüt. Yalnızca ikinci tür göreve dönüşür. Yazarken taahhütleri işaretleyin — başına bir ok koymak gibi basit bir alışkanlık yeter — ki sonraki adımlar siz görüşmeden çıkmadan belli olsun.',
        },
        { h: 'Her sonraki adıma üç şey verin' },
        {
          ul: [
            'Bir sorumlu; toplantıda yüksek sesle söylenmiş olsun ki sonradan sürpriz olmasın.',
            'Bir son tarih; sonradan uydurulan değil, odada anlaşılan.',
            'Bağlam: hangi müşteri ve geldiği nota bir bağlantı.',
          ],
        },
        { h: 'Bağlam kaybolmadan yapın' },
        {
          p: 'Bunun için pencere dakikalarla ölçülür, günlerle değil. Toplantıdan uzaklaştıkça daha çok ayrıntı kaybeder ve görevlerin hiç oluşturulmama olasılığı artar. En iyi akış, görevleri toplantıyı kapatmanın bir parçası olarak yakalar — sonra yaparım diye söz verdiğiniz ayrı bir angarya olarak değil.',
        },
        {
          quote: 'Toplantıda verilen ve sorumlusu ile tarihiyle göreve yazılan söz tutulur. Notta kalan söz bir umuttur.',
        },
        { h: 'Angaryayı sisteme bırakın' },
        {
          p: 'Bu alışkanlığın başarısız olma nedeni sürtünmedir: isimleri yeniden yazmak, müşteriyi yeniden bulmak, tarihleri kopyalamak. Sürtünmeyi kaldırın, alışkanlık yerleşsin. Curahold’da bir toplantıyı kaydetmek, sonraki adımları doğru panoda, müşteriye zaten bağlı görevlere çevirir — böylece kayıt ve plan tek bir eylem olur.',
        },
      ],
    },
    {
      slug: 'task-management-vs-project-management',
      seo: ['Görev yönetimi mi, proje yönetimi mi? | Curahold', 'Görev ve proje yönetimi farklı sorunları çözer. İkisini nasıl ayırt edeceğinizi ve müşteri ekiplerinin neden müşteriye bağlı görevler istediğini anlatıyoruz.'],
      title: 'Görev yönetimi mi, proje yönetimi mi: müşteri ekibinizin ihtiyacı hangisi?',
      description:
        'Görev yönetimi ve proje yönetimi farklı sorunları çözer. İkisini nasıl ayırt edeceğinizi ve müşteri ekiplerinin neden bir proje planına değil, müşteriye bağlı görevlere ihtiyaç duyduğunu anlatıyoruz.',
      date: '2026-11-03',
      readMinutes: 7,
      tags: ['Görev yönetimi', 'Proje yönetimi', 'Araçlar'],
      body: [
        {
          p: '“Görev yönetimi” ve “proje yönetimi” sık sık aynı şeymiş gibi kullanılır. Değildir ve yanlışını seçmek, ekiplerin araçlarıyla savaşmaya başlama biçimidir. Kısacası: görev yönetimi süregelen işi yürütür; proje yönetimi, tanımlı bir işi bir bitiş çizgisine götürür.',
        },
        { h: 'Proje yönetimi neyde iyidir' },
        {
          p: 'Bir projenin başı, sonu ve kapsamı vardır: bir lansman, bir göç, bir kurulum. Proje yönetimi araçları burada parlar — bağımlılıklar, zaman çizelgeleri, aşamalar, kritik yol. İşiniz tek seferlik bir sonuca giden adımlar dizisiyse bu yapı hakkını verir.',
        },
        { h: 'Görev yönetimi neyde iyidir' },
        {
          p: 'Çoğu müşteri başarısı ve müşteri yönetimi işi bir proje değildir. Bitmeyen, tekrar eden bir ritimdir: başlangıçlar, durum görüşmeleri, iş değerlendirmeleri, yenilemeler, bir müşterinin sessizleştiğine dair o sinyal. Bitiş çizgisi yoktur — gelecek hafta vardır. Görev yönetimi buna uyar: sahipli ve tarihli, bir bakışta güvenebileceğiniz yaşayan bir liste.',
        },
        { h: 'Hangisine ihtiyacınız olduğunu nasıl anlarsınız?' },
        {
          ul: [
            'İş bir gün bitiyorsa muhtemelen proje yönetimi istersiniz.',
            'İş her müşteri için sürekli tekrar ediyorsa görev yönetimi istersiniz.',
            'Bir görev yalnızca ait olduğu müşterinin yanında anlam kazanıyorsa, müşteri bağlamlı görev yönetimi istersiniz — ne tek başına bir yapılacaklar uygulaması, ne de bir Gantt şeması.',
          ],
        },
        { h: 'Çoğu müşteri ekibinin aslında istediği melez' },
        {
          p: 'Bir müşteri ekibi için dürüst cevap genellikle bir melezdir: omurga olarak görev yönetimi, her görev hizmet ettiği müşteriye, toplantıya ve yenilemeye bağlı — artı ara sıraki bir başlangıç ya da göç için biraz proje yapısı. Curahold’un kurulduğu boşluk tam da budur: müşterinin yaşadığı yerde yaşayan görevler.',
        },
        {
          quote: 'İşinizin biçimine uyan aracı seçin. Müşteri işi bir son tarih değil, bir ritimdir — bu yüzden bitirdiğiniz bir plana değil, güvendiğiniz bir listeye ihtiyaç duyar.',
        },
      ],
    },
  ],
};

/** The locales the blog is published in — only those with native posts above. */
export const BLOG_LOCALES = Object.keys(BLOG_POSTS) as SiteLocale[];

/** The posts for a locale (empty when the blog is not published in it). */
export const blogPosts = (locale: SiteLocale): BlogPost[] => BLOG_POSTS[locale] ?? [];
