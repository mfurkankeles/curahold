// "What's new": the latest changes, in the product itself. Newest first; the
// full list is the release notes in the help pages.
export type NewsAction = { kind: 'quickAdd' } | { kind: 'shortcuts' } | { kind: 'go'; to: string };

export interface News {
  id: string;
  date: string;
  title: { tr: string; en: string };
  body: { tr: string; en: string };
  action?: NewsAction & { label: { tr: string; en: string } };
}

export const NEWS: News[] = [
  {
    id: '2026-11-trash',
    date: '2026-11-12',
    title: { tr: 'Çöp kutusu: silinen 30 gün geri alınabilir', en: 'The trash: what you delete can be put back for 30 days' },
    body: {
      tr: 'Müşteriyi, kaydı, görevi ya da sayfayı silmek artık hemen kesinleşmiyor. Silinen şey 30 gün çöp kutusunda durur; yorumları, dosyaları ve altındaki her şeyle eskisi gibi geri gelir. Silmenin ardından Geri al çıkar; sonrası için menün → Çöp kutusu.',
      en: 'Deleting a customer, a record, a task or a page is no longer final at once. It stays in the trash for 30 days and comes back as it was, with its comments, files and everything under it. Undo is offered right after a delete; later, open your menu → Trash.',
    },
    action: { kind: 'go', to: '/trash', label: { tr: 'Çöp kutusunu aç', en: 'Open the trash' } },
  },
  {
    id: '2026-11-meetings',
    date: '2026-11-12',
    title: { tr: 'Toplantılar ve ayrıntılı yeni görev', en: 'Meetings, and a New task that asks for the details' },
    body: {
      tr: 'Müşteri sayfasında o müşteriyle yapılan bütün toplantılar, iş değerlendirmeleri ve aramalar: kimler vardı, ne konuşuldu, sonraki adımlar. Her sonraki adım müşteriye bağlı bir görev olur. Yeni görev de artık müşteri, kişi, tarih ve öncelik gibi ayrıntıları ayrı alanlarda soruyor.',
      en: 'A customer’s page lists every meeting, business review and call with them: who was there, what was said, the next steps. Each next step becomes a task on the customer. New task now asks for the customer, people, date and priority in their own fields too.',
    },
    action: { kind: 'go', to: '/accounts', label: { tr: 'Müşterilere git', en: 'Go to customers' } },
  },
  {
    id: '2026-11-deals-playbooks',
    date: '2026-11-12',
    title: { tr: 'Playbook’lar, kendiliğinden başlayan yenilemeler, para birimleri', en: 'Playbooks, renewals that start by themselves, currencies' },
    body: {
      tr: 'Yenileme playbook’unu yaz; her müşterinin yenilemesinden (örneğin) 180 gün önce görevleri ve yenileme fırsatı kendiliğinden açılır. Tutarlar kendi para biriminde, toplamlar şirketin kurlarıyla. Fırsatların kendi yorum akışı var: dosya ekle, ekran görüntüsü yapıştır. Raporlar ve paneller ayrıldı; ilgilendiklerini yıldızla.',
      en: 'Write a renewal playbook and its tasks, with a renewal opportunity, open by themselves (say) 180 days before each renewal. Amounts keep their own currency; totals use the company’s rates. Opportunities have their own thread: attach files, paste screenshots. Reports and dashboards are now apart; star what you follow.',
    },
    action: { kind: 'go', to: '/settings/playbooks', label: { tr: 'Playbook’lara git', en: 'Go to playbooks' } },
  },
  {
    id: '2026-11-report-builder',
    date: '2026-11-12',
    title: { tr: 'Kendi raporunu kur; hazır paneller', en: 'Build your own reports; ready-made dashboards' },
    body: {
      tr: 'Raporlar → Raporlar’da kendi raporunu kur: neye bakacağını seç, daralt, grupla, grafiğini seç ve kaydet. Raporlar → Paneller’de yedi hazır panel tek tıkla eklenir. Görünüm de yenilendi.',
      en: 'Build your own under Reports → Reports: pick what to look at, narrow it, group it, choose the chart and save. Under Reports → Dashboards, seven ready-made dashboards are one click away. The look is new, too.',
    },
  },
  {
    id: '2026-11-import-archive',
    date: '2026-11-12',
    title: { tr: 'Dosyadan görev aktar; arşiv', en: 'Import tasks from a file; an archive' },
    body: {
      tr: 'Başka araçtaki görevlerini CSV ya da Excel ile panoya aktar (panonun üstündeki yukarı ok). Tamamlanan görevler 90 gün sonra panonun Arşiv’ine taşınır; oradan aranır ve geri getirilir.',
      en: 'Bring your tasks from another tool with a CSV or Excel file (the up arrow at the top of a board). Finished tasks move to the board’s Archive after 90 days; search them there and bring them back.',
    },
  },
  {
    id: '2026-11-app',
    date: '2026-11-12',
    title: { tr: 'Uygulama olarak kur; canlı yenileme', en: 'Install it as an app; live refresh' },
    body: {
      tr: 'Curahold telefona ve bilgisayara kurulur (adına tıkla → Curahold’u kur; iPhone’da Paylaş → Ana Ekrana Ekle) ve bağlantı yokken son gördüklerini gösterir. Başkasının yaptığı değişiklikler artık sayfayı yenilemeden görünür.',
      en: 'Curahold installs on phones and computers (click your name → Install Curahold; on iPhone, Share → Add to Home Screen) and shows what you last saw when there is no connection. Other people’s changes now appear without reloading.',
    },
  },
  {
    id: '2026-11-rhythm',
    date: '2026-11-12',
    title: { tr: 'Hedefler, değerlendirme ritmi ve dürtmeler', en: 'Targets, a review rhythm and nudges' },
    body: {
      tr: 'Dönem hedefini koy: Raporlar gidişatı ve kalan her hafta ne kazanmak gerektiğini söyler. Müşterilerle değerlendirme ritmi belirle; zamanı gelenler Değerlendirmeler’de. Yerinde sayan görevlerin perşembe günü hatırlatılır.',
      en: 'Set a target for the period: Reports says how it is going and what each remaining week has to bring. Give customers a review rhythm; the ones that are due are under Reviews. Tasks that have gone still are brought up on Thursdays.',
    },
    action: { kind: 'go', to: '/accounts?view=reviews', label: { tr: 'Değerlendirmelere git', en: 'Go to reviews' } },
  },
  {
    id: '2026-11-crm',
    date: '2026-11-12',
    title: { tr: 'Satış hattı, raporlar, ekip ve zaman çizelgesi', en: 'Pipeline, reports, team and a timeline' },
    body: {
      tr: 'Fırsatları aşamalar arasında sürükle; Raporlar’da işlerin ve müşterilerin durumunu, Ekip’te 1:1 hazırlığını, Zaman çizelgesi’nde haftaları gör. Sol menü artık bölümlere ayrılı.',
      en: 'Drag deals between stages; see where work and customers stand in Reports, prepare a 1:1 in Team, and see the weeks ahead in Timeline. The menu on the left now has sections.',
    },
    action: { kind: 'go', to: '/reports', label: { tr: 'Raporlara git', en: 'Go to reports' } },
  },
  {
    id: '2026-11-tasks-plus',
    date: '2026-11-12',
    title: { tr: 'Görevlerde daha fazlası', en: 'More on every task' },
    body: {
      tr: 'Panoya özel alanlar, takip etme, “şunu bekliyor” bağlantıları, süre kaydı, kontrol listeleri, görev geçmişi; panolarda filtreler ve kayıtlı görünümler; müşteriye tek tıkla plan.',
      en: 'A board’s own fields, following, “waits for” links, time spent, checklists and task history; filters and saved views on boards; a plan put on a customer in one click.',
    },
  },
  {
    id: '2026-11-quick-add',
    date: '2026-11-11',
    title: { tr: 'Görevi konuşur gibi yaz', en: 'Write a task the way you would say it' },
    body: {
      tr: 'N tuşuna bas ya da + Yeni’ye dokun: “Acme ile görüşme cuma @Ayşe #Acme !yüksek” yaz; tarih, kişi, müşteri ve öncelik kendiliğinden dolar. Birden çok satır yapıştırırsan her satır ayrı görev olur.',
      en: 'Press N or tap + New: write “Acme call friday @Ayşe #Acme !high” and the date, person, customer and priority fill themselves in. Paste several lines and each becomes a task.',
    },
    action: { kind: 'quickAdd', label: { tr: 'Dene', en: 'Try it' } },
  },
  {
    id: '2026-11-cards',
    date: '2026-11-11',
    title: { tr: 'Müşteri kartları, yenilemeler, ürün haritası', en: 'Customer cards, renewals and a product map' },
    body: {
      tr: 'Müşteriler kart olarak da görünür; neye bakılması gerektiği her kartın üstünde yazar. Yenilemeler ay ay, kimde hangi ürün olduğu ve çapraz satış fırsatları tek ekranda.',
      en: 'Customers also show as cards, each saying what needs a look. Renewals month by month, and who has which product — with the cross-sell gaps — on one screen.',
    },
    action: { kind: 'go', to: '/accounts', label: { tr: 'Müşterilere git', en: 'Go to customers' } },
  },
  {
    id: '2026-11-look',
    date: '2026-11-11',
    title: { tr: 'Yeni görünüm, koyu tema ve kısayollar', en: 'A new look, dark mode and shortcuts' },
    body: {
      tr: 'Menünden açık, koyu ya da cihazına uyan görünümü seç. Telefonda alttaki çubuk, masaüstünde klavye: ? tuşu bütün kısayolları gösterir.',
      en: 'Pick light, dark or your device’s setting from your menu. A bar at the bottom on phones, the keyboard on desktops: press ? to see every shortcut.',
    },
    action: { kind: 'shortcuts', label: { tr: 'Kısayolları gör', en: 'See shortcuts' } },
  },
  {
    id: '2026-11-portal-signin',
    date: '2026-11-06',
    title: { tr: 'Müşteri portalında giriş yolları sizin seçiminiz', en: 'Customer portal: you choose the ways in' },
    body: {
      tr: 'E-posta kodu, Google, Microsoft, passkey ya da şifre: yönetici hangilerinin açık olacağını ve oturumun ne kadar süreceğini seçer.',
      en: 'Email code, Google, Microsoft, passkeys or a password: an admin chooses which are on and how long a session lasts.',
    },
  },
  {
    id: '2026-11-help',
    date: '2026-11-03',
    title: { tr: 'Yardım isteği ve onaylı destek erişimi', en: 'Help requests and support access with consent' },
    body: {
      tr: 'Ekran görüntüsüyle yardım iste; istersen destek ekibine süreli, salt okunur bir erişim ver ve istediğin an kapat.',
      en: 'Ask for help with a screenshot; if you like, give the support team time-limited, read-only access and end it whenever you want.',
    },
  },
  {
    id: '2026-10-timeline',
    date: '2026-10-28',
    title: { tr: 'Müşteri zaman çizelgesi ve açıklanabilir sağlık skoru', en: 'Customer timeline and an explainable health score' },
    body: {
      tr: 'Görüşme, toplantı ve notlar müşterinin zaman çizelgesinde; skorun her puanı bir tık ötede gerekçesiyle.',
      en: 'Calls, meetings and notes on the customer’s timeline; every point of the score is one click from its reason.',
    },
  },
];

const SEEN = 'app_news_seen';
export function newsUnseen(): boolean {
  try {
    return localStorage.getItem(SEEN) !== NEWS[0].id;
  } catch {
    return false;
  }
}
export function markNewsSeen() {
  try {
    localStorage.setItem(SEEN, NEWS[0].id);
  } catch {
    /* per-device */
  }
}
