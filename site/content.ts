// The sales site's words, in English and Turkish. Prices and what each plan
// includes come from shared/src/billing.ts and the app's own dictionaries,
// so the site and the product never disagree.
//
// Customer names are invented (the same ones as the demo).

export type SiteLocale = 'en' | 'tr';

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
  tools: { title: string; lead: string; rows: { label: string; names: string }[]; none: string };
  pricing: { title: string; lead: string; monthly: string; yearly: string; save: string; perSeat: string; perSeatYearly: string; choose: string; business: string; fine: string };
  faq: { title: string; items: { q: string; a: string }[] };
  signIn: { title: string; text: string; label: string; go: string; close: string; none: string };
  footer: { story: string; help: string; legal: string; links: { terms: string; privacy: string; kvkk: string; dpa: string; subprocessors: string; cookies: string }; company: string };
}

export const COPY: Record<SiteLocale, SiteCopy> = {
  en: {
    lang: 'en',
    title: 'Curahold: work management for customer success teams',
    description: 'Renewals that start on their own, meetings whose next steps become tasks, and every customer that needs attention at a glance. In English and Turkish.',
    nav: { product: 'Product', pricing: 'Pricing', demo: 'Live demo', help: 'Help', signIn: 'Sign in', tryFree: 'Try it free', other: 'Türkçe' },
    hero: {
      title: 'Hold every customer with care.',
      lead: 'Curahold is where customer success and account teams keep track. Renewals start on their own, every promise made in a meeting becomes a task, and you see at a glance which customer needs you.',
      primary: 'Try it free for 14 days',
      secondary: 'Open the live demo',
      note: 'No card needed. In English and Turkish.',
      customer: 'Ambergate Logistics',
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
        { label: 'Spreadsheets', names: 'Google Sheets and Excel' },
        { label: 'AI assistants', names: 'Claude and ChatGPT, through the connector' },
      ],
      none: 'It also works with none of them.',
    },
    pricing: {
      title: 'Simple prices, per seat',
      lead: 'Every plan starts with a 14-day trial of everything. Viewer seats are free.',
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
      primary: '14 gün ücretsiz dene',
      secondary: 'Canlı demoyu aç',
      note: 'Kart gerekmez. Türkçe ve İngilizce.',
      customer: 'Ambergate Lojistik',
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
        { label: 'Tablolar', names: 'Google Sheets ve Excel' },
        { label: 'Yapay zekâ', names: 'Bağlayıcı üzerinden Claude ve ChatGPT' },
      ],
      none: 'Hiçbiri olmadan da çalışır.',
    },
    pricing: {
      title: 'Kullanıcı başına, sade fiyatlar',
      lead: 'Her plan, her şeyin açık olduğu 14 günlük denemeyle başlar. Görüntüleyen kullanıcılar ücretsiz.',
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
    },
  },
};
