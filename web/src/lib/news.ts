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

const SEEN = 'tw_news_seen';
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
