// The guided tours of the demo hub (curahold.com/demo). Each tour runs on the
// real product — the whole app, with invented data, in the visitor's browser
// (see vite.demo.config.ts) — and walks a few steps, each pointing at a real
// element on a real screen. The hub page lists them (and filters them by role,
// goal and area); the demo app plays one when it is opened with ?tour=<id>.
//
// A step points at an element with a CSS selector. Where a screen has no
// stable hook, the element carries data-tour="…" in the app. Every step of
// every tour is checked in a browser (tests/e2e/tours.ts): when a screen
// changes and a step no longer finds its element, the check says which.

export type TourLang = 'en' | 'tr';
type Words = Record<TourLang, string>;

/** The areas of the product; the hub groups tours by these, in this order. */
export const TOUR_AREAS = {
  start: { en: 'Start here', tr: 'Buradan başla', blurb: { en: 'The product in a few minutes: what your team sees first thing, and where everything lives.', tr: 'Birkaç dakikada ürün: ekibinin sabah ilk gördüğü ekran ve her şeyin nerede olduğu.' } },
  customers: { en: 'Customers and health', tr: 'Müşteriler ve sağlık', blurb: { en: 'Every customer on one page, with a health score that says why — not just a colour.', tr: 'Her müşteri tek sayfada; yalnızca renk değil, nedenini de söyleyen bir sağlık skoru.' } },
  revenue: { en: 'Renewals and revenue', tr: 'Yenilemeler ve gelir', blurb: { en: 'Renewals that never surprise you, and a pipeline whose forecast moves as deals do.', tr: 'Sürpriz yapmayan yenilemeler ve fırsatlar ilerledikçe güncellenen bir tahmin.' } },
  work: { en: 'Tasks and the team’s week', tr: 'Görevler ve ekibin haftası', blurb: { en: 'Write a task like a sentence, run the team on boards, and see who carries what.', tr: 'Görevi cümle gibi yaz, ekibi panolarla yönet, kimin ne taşıdığını gör.' } },
  insight: { en: 'Reports and dashboards', tr: 'Raporlar ve paneller', blurb: { en: 'Build a report in a minute, or put a ready-made dashboard on your home.', tr: 'Bir dakikada rapor kur ya da hazır bir paneli ana sayfana al.' } },
  ai: { en: 'CuraAI', tr: 'CuraAI', blurb: { en: 'Ask in your own words; answers come from your workspace and the docs, with their sources.', tr: 'Kendi cümlelerinle sor; cevaplar çalışma alanından ve belgelerden, kaynağıyla gelir.' } },
  portal: { en: 'Customer portal', tr: 'Müşteri portalı', blurb: { en: 'Give each customer a portal of their own: shared work, requests and replies in one place.', tr: 'Her müşteriye kendi portalı: paylaşılan işler, talepler ve yanıtlar tek yerde.' } },
  connect: { en: 'Connections and setup', tr: 'Bağlantılar ve kurulum', blurb: { en: 'Bring your CRM along, shape Curahold to your process, and decide who sees what.', tr: 'CRM’ini getir, Curahold’u sürecine göre şekillendir, kimin neyi göreceğine karar ver.' } },
} as const satisfies Record<string, Words & { blurb: Words }>;
export type TourArea = keyof typeof TOUR_AREAS;

/** What someone wants to get done; a tour serves one or more. */
export const TOUR_GOALS = {
  keep: { en: 'Keep customers', tr: 'Müşteriyi elde tut' },
  grow: { en: 'Renew and grow', tr: 'Yenile ve büyüt' },
  week: { en: 'Run the team’s week', tr: 'Ekibin haftasını yönet' },
  answer: { en: 'Answer customers faster', tr: 'Müşteriye hızlı dön' },
  see: { en: 'See where things stand', tr: 'Durumu gör' },
  setup: { en: 'Set it up your way', tr: 'Kendine göre kur' },
} as const satisfies Record<string, Words>;
export type TourGoal = keyof typeof TOUR_GOALS;

/** Who it is for. */
export const TOUR_ROLES = {
  csm: { en: 'Customer success', tr: 'Müşteri başarısı' },
  sales: { en: 'Account management', tr: 'Hesap yönetimi' },
  lead: { en: 'Team lead', tr: 'Ekip lideri' },
  exec: { en: 'Executive', tr: 'Yönetici' },
  ops: { en: 'Operations and admin', tr: 'Operasyon ve sistem' },
} as const satisfies Record<string, Words>;
export type TourRole = keyof typeof TOUR_ROLES;

/** Who the visitor is during the tour (the people of the demo company, or a customer in the portal). */
export type TourPerson = 'ada' | 'mert' | 'zeynep' | 'sofia' | 'customer';

export interface TourStep {
  /** The screen for this step (an address inside the app). Left out: wherever the last step left off. */
  path?: string;
  /** The element the step points at (a CSS selector). Left out: a card in the middle of the screen. */
  at?: string;
  title: Words;
  body: Words;
  /** The visitor does it: the tour goes on when they click the element. */
  click?: boolean;
  /** A key the tour presses for the visitor when the step starts (N opens quick add anywhere). */
  press?: string;
}

export interface Tour {
  id: string;
  area: TourArea;
  goals: TourGoal[];
  roles: TourRole[];
  /** Signed in as (default Ada, the administrator). */
  as?: TourPerson;
  /** About how long it takes, in minutes. */
  minutes: number;
  title: Words;
  blurb: Words;
  steps: TourStep[];
}

export const TOURS: Tour[] = [
  {
    id: 'overview',
    area: 'start',
    goals: ['see', 'keep', 'week'],
    roles: ['csm', 'sales', 'lead', 'exec', 'ops'],
    minutes: 2,
    title: { en: 'Curahold in two minutes', tr: 'İki dakikada Curahold' },
    blurb: { en: 'Home, your customers, the team’s load and CuraAI — the tour to start with.', tr: 'Ana sayfa, müşterilerin, ekibin yükü ve CuraAI — başlamak için en iyi tur.' },
    steps: [
      {
        path: '/home',
        title: { en: 'This is the real product', tr: 'Bu, ürünün kendisi' },
        body: {
          en: 'Not a recording: Curahold is running in this tab, with an invented company and its customers. You are Ada, who leads customer success there. Click around any time — the tour waits.',
          tr: 'Bir kayıt değil: Curahold bu sekmede çalışıyor, uydurma bir şirket ve müşterileriyle. Sen oranın müşteri başarısını yöneten Ada’sın. İstediğin an tıklayıp gez — tur seni bekler.',
        },
      },
      {
        at: 'a.tab',
        title: { en: 'A home for each role', tr: 'Her role kendi ana sayfası' },
        body: {
          en: 'My day for the team, Team view for leads, a Leadership summary for executives. Each page is cards you can move, add and remove with “Edit page”.',
          tr: 'Ekip için Günüm, liderler için Ekip görünümü, yöneticiler için Yönetim özeti. Her sayfa, “Sayfayı düzenle” ile taşıyıp ekleyip çıkarabildiğin kartlardan oluşur.',
        },
      },
      {
        at: '.pane:has(.loadrow)',
        title: { en: 'Who carries what', tr: 'Kim ne taşıyor' },
        body: {
          en: 'Customers, open work and overdue tasks per person, so a lead sees who is stretched before anyone has to say it. Click a name for that person’s week.',
          tr: 'Kişi başına müşteri, açık iş ve geciken görev; böylece lider kimin zorlandığını kimse söylemeden görür. O kişinin haftası için bir isme tıkla.',
        },
      },
      {
        path: '/accounts',
        at: '.acard',
        title: { en: 'Customers who need you come first', tr: 'Seni bekleyen müşteri en üstte' },
        body: {
          en: 'Every customer is a card, sorted by who needs attention — and the card says why: a low score, overdue work, a renewal on its way.',
          tr: 'Her müşteri bir kart; kimin ilgi beklediğine göre sıralı — ve kart nedenini söyler: düşük skor, geciken iş, yaklaşan yenileme.',
        },
      },
      {
        at: '.cura__fab',
        title: { en: 'Ask anything, anywhere', tr: 'Her yerde, her şeyi sor' },
        body: {
          en: 'CuraAI answers questions about your workspace and the product, with the source of each answer. It is on every screen.',
          tr: 'CuraAI, çalışma alanın ve ürün hakkındaki sorulara her cevabın kaynağıyla birlikte cevap verir. Her ekranda seninle.',
        },
      },
    ],
  },
  {
    id: 'health',
    area: 'customers',
    goals: ['keep'],
    roles: ['csm', 'lead'],
    minutes: 2,
    title: { en: 'Find out why a customer is at risk', tr: 'Bir müşterinin neden riskte olduğunu bul' },
    blurb: { en: 'A health score that explains itself, and the customer’s whole story on one timeline.', tr: 'Kendini açıklayan bir sağlık skoru ve müşterinin tüm hikâyesi tek zaman çizelgesinde.' },
    steps: [
      {
        path: '/accounts',
        at: '.acard',
        title: { en: 'Start with the one at the top', tr: 'En üsttekiyle başla' },
        body: {
          en: 'The list puts the customers who need attention first. The top card is the most urgent one right now.',
          tr: 'Liste, ilgi bekleyen müşterileri öne alır. En üstteki kart şu an en acil olanı.',
        },
      },
      {
        at: '.acard__name',
        click: true,
        title: { en: 'Open it', tr: 'Onu aç' },
        body: { en: 'Click the customer’s name.', tr: 'Müşterinin adına tıkla.' },
      },
      {
        at: '.healthline button',
        click: true,
        title: { en: 'Not just a colour', tr: 'Yalnızca bir renk değil' },
        body: {
          en: 'The health score comes with its reasons. Click “Why?”.',
          tr: 'Sağlık skoru, nedenleriyle birlikte gelir. “Neden?”e tıkla.',
        },
      },
      {
        at: '.healthwhy',
        title: { en: 'Every point, accounted for', tr: 'Her puanın bir karşılığı var' },
        body: {
          en: 'When you last talked, overdue work, support requests, usage — each part with the points it earned, and the trend. You choose the parts and their weights.',
          tr: 'En son ne zaman konuşulduğu, geciken işler, destek talepleri, kullanım — her parça kazandığı puanla, yanında gidişat. Parçaları ve ağırlıklarını sen seçersin.',
        },
      },
      {
        at: '.tl__start',
        title: { en: 'The whole story, in one place', tr: 'Tüm hikâye tek yerde' },
        body: {
          en: 'Calls, meetings, notes, emails and changes on one timeline. Log a call right here, and the score takes it into account.',
          tr: 'Aramalar, toplantılar, notlar, e-postalar ve değişiklikler tek zaman çizelgesinde. Bir aramayı buradan kaydet; skor bunu hesaba katar.',
        },
      },
    ],
  },
  {
    id: 'health-setup',
    area: 'customers',
    goals: ['setup', 'keep'],
    roles: ['ops', 'lead'],
    minutes: 1,
    title: { en: 'Make the health score yours', tr: 'Sağlık skorunu kendine göre kur' },
    blurb: { en: 'Choose what counts and how much, and see every customer’s new score before you save.', tr: 'Neyin, ne kadar sayılacağını seç; kaydetmeden önce her müşterinin yeni skorunu gör.' },
    steps: [
      {
        path: '/settings/health',
        at: '.sheet + .sheet',
        title: { en: 'What the score is made of', tr: 'Skor neyden oluşuyor' },
        body: {
          en: 'Each part is a signal — days since you last talked, overdue work, support requests, a field of your own — with a weight. Change a weight and see what happens.',
          tr: 'Her parça bir sinyal — son görüşmeden bu yana geçen gün, geciken iş, destek talepleri, kendi alanların — ve bir ağırlık. Bir ağırlığı değiştir, ne olduğuna bak.',
        },
      },
      {
        at: '.sheet + .sheet + .sheet',
        title: { en: 'See it before you save it', tr: 'Kaydetmeden önce gör' },
        body: {
          en: 'Where “healthy” and “at risk” begin, and a preview of the score every customer would get. No surprises the morning after.',
          tr: '“Sağlıklı” ve “riskte”nin nereden başladığı ve her müşterinin alacağı skorun önizlemesi. Ertesi sabah sürpriz yok.',
        },
      },
    ],
  },
  {
    id: 'renewals',
    area: 'revenue',
    goals: ['grow', 'keep'],
    roles: ['csm', 'sales'],
    minutes: 2,
    title: { en: 'Never be surprised by a renewal', tr: 'Hiçbir yenileme sürpriz olmasın' },
    blurb: { en: 'Renewals month by month, with the deal and the contract beside each customer.', tr: 'Ay ay yenilemeler; her müşterinin yanında fırsatı ve sözleşmesi.' },
    steps: [
      {
        path: '/accounts?view=renewals',
        at: '.renewals',
        title: { en: 'What renews, and when', tr: 'Ne, ne zaman yenileniyor' },
        body: {
          en: 'Customers grouped by the month their contract renews, with the value at stake and how much of it needs attention.',
          tr: 'Müşteriler sözleşmelerinin yenilendiği aya göre gruplanır; yanında tutar ve bunun ne kadarının ilgi beklediği.',
        },
      },
      {
        at: '.rchip--deal',
        title: { en: 'The deal, right beside it', tr: 'Fırsat hemen yanında' },
        body: {
          en: 'Each renewal’s opportunity and its stage, so the person who owns the customer and the person who owns the deal look at the same thing.',
          tr: 'Her yenilemenin fırsatı ve aşaması; müşterinin sahibi ile fırsatın sahibi aynı şeye bakar.',
        },
      },
      {
        at: '.rchip:not(.rchip--deal)',
        title: { en: 'And the contract', tr: 'Ve sözleşme' },
        body: {
          en: 'The agreement is one click away — no digging through folders the week it renews.',
          tr: 'Sözleşme bir tık uzakta — yenileme haftasında klasör karıştırmak yok.',
        },
      },
      {
        path: '/calendar',
        at: '.cal-kind[data-kind="renewal"]',
        title: { en: 'On the calendar, too', tr: 'Takvimde de' },
        body: {
          en: 'Renewals sit on the calendar next to meetings, calls and reviews. Switch any kind on or off here.',
          tr: 'Yenilemeler takvimde toplantı, arama ve değerlendirmelerin yanında durur. Her türü buradan açıp kapat.',
        },
      },
    ],
  },
  {
    id: 'pipeline',
    area: 'revenue',
    goals: ['grow', 'see'],
    roles: ['sales', 'exec'],
    minutes: 2,
    title: { en: 'Move a deal, watch the forecast', tr: 'Fırsatı taşı, tahmini izle' },
    blurb: { en: 'Opportunities by stage against the quarter’s target, and dashboards that are ready on day one.', tr: 'Çeyrek hedefine karşı aşama aşama fırsatlar ve baştan hazır paneller.' },
    steps: [
      {
        path: '/records/opportunity',
        at: '.targetline',
        title: { en: 'The quarter at a glance', tr: 'Bir bakışta çeyrek' },
        body: {
          en: 'This quarter’s target and how far along the team is. It moves as deals move.',
          tr: 'Bu çeyreğin hedefi ve ekibin ne kadar yol aldığı. Fırsatlar ilerledikçe o da ilerler.',
        },
      },
      {
        at: '.board .column',
        title: { en: 'Deals by stage', tr: 'Aşama aşama fırsatlar' },
        body: {
          en: 'Drag a deal to another stage, or onto Won, and the target line above changes straight away. Try it.',
          tr: 'Bir fırsatı başka aşamaya ya da Kazanıldı’ya sürükle; üstteki hedef çizgisi hemen değişir. Dene.',
        },
      },
      {
        at: '.board .card',
        title: { en: 'Everything on the card', tr: 'Her şey kartın üstünde' },
        body: {
          en: 'Amount, customer, close date and owner — the customer’s health right there too, because a deal is only as safe as the account behind it.',
          tr: 'Tutar, müşteri, kapanış tarihi ve sahibi — müşterinin sağlığı da orada; çünkü bir fırsat, arkasındaki hesap kadar güvenlidir.',
        },
      },
      {
        path: '/dashboards',
        at: '.dashpick',
        title: { en: 'Dashboards, ready made', tr: 'Hazır paneller' },
        body: {
          en: 'Sales pipeline, renewals and risk, team performance, an executive summary. Use them as they are, or change them.',
          tr: 'Satış hunisi, yenilemeler ve risk, ekip performansı, yönetim özeti. Olduğu gibi kullan ya da değiştir.',
        },
      },
    ],
  },
  {
    id: 'quick-add',
    area: 'work',
    goals: ['week'],
    roles: ['csm', 'sales', 'lead'],
    minutes: 1,
    title: { en: 'Write a task like a sentence', tr: 'Görevi cümle gibi yaz' },
    blurb: { en: 'Press N anywhere; the date, the person, the customer and the priority fill themselves in.', tr: 'Her yerde N’ye bas; tarih, kişi, müşteri ve öncelik kendiliğinden dolar.' },
    steps: [
      {
        path: '/my',
        at: '.group__head',
        title: { en: 'Your work, by when it’s due', tr: 'İşlerin, ne zaman bittiğine göre' },
        body: {
          en: 'My tasks gathers everything that is yours from every board, grouped into what is late, today, this week and later.',
          tr: 'Görevlerim, her panodaki sana ait işleri toplar: gecikenler, bugün, bu hafta ve sonrası.',
        },
      },
      {
        press: 'n',
        at: '.qa__input',
        title: { en: 'Press N, then just write', tr: 'N’ye bas, sonra yaz' },
        body: {
          en: 'Try: “Renewal call friday @Zeynep #Velto !high”. The date, the person, the customer and the priority are picked out as you type.',
          tr: 'Dene: “Yenileme görüşmesi cuma @Zeynep #Velto !yüksek”. Tarih, kişi, müşteri ve öncelik sen yazarken ayrılır.',
        },
      },
      {
        at: '.qa__tip',
        title: { en: 'Several at once', tr: 'Bir kerede birkaç tane' },
        body: {
          en: 'Paste a list — from a meeting’s notes, say — and each line becomes a task of its own.',
          tr: 'Bir liste yapıştır — mesela toplantı notlarından — her satır ayrı bir görev olur.',
        },
      },
    ],
  },
  {
    id: 'board',
    area: 'work',
    goals: ['week'],
    roles: ['lead', 'csm'],
    minutes: 2,
    title: { en: 'Run the team’s work on a board', tr: 'Ekibin işini panoda yönet' },
    blurb: { en: 'Boards for each team, filters and views, and every detail of a task in one panel.', tr: 'Her ekibe pano, filtreler ve görünümler; bir görevin her ayrıntısı tek panelde.' },
    steps: [
      {
        path: '/home',
        at: '.navlink--board',
        click: true,
        title: { en: 'Boards hold the team’s work', tr: 'Ekibin işi panolarda' },
        body: { en: 'Open the customer success board.', tr: 'Müşteri başarısı panosunu aç.' },
      },
      {
        at: '.board .column',
        title: { en: 'Your process, as columns', tr: 'Süreç, sütun sütun' },
        body: {
          en: 'Columns are the steps you work through; cards are tasks with an owner, a customer and a date. Drag a card along when it moves.',
          tr: 'Sütunlar çalıştığın adımlar; kartlar sahibi, müşterisi ve tarihi olan görevler. İlerleyen kartı sürükle.',
        },
      },
      {
        at: '.toolbar',
        title: { en: 'Filter, save, switch', tr: 'Filtrele, kaydet, değiştir' },
        body: {
          en: 'Only mine or everyone, filters by person, customer or date, saved views, a list instead of a board — and the archive.',
          tr: 'Sadece benimkiler ya da herkes; kişiye, müşteriye, tarihe göre filtre; kayıtlı görünümler; pano yerine liste — ve arşiv.',
        },
      },
      {
        at: '.board .card',
        click: true,
        title: { en: 'Open a task', tr: 'Bir görevi aç' },
        body: { en: 'Click any card.', tr: 'Herhangi bir karta tıkla.' },
      },
      {
        at: '.panel',
        title: { en: 'Everything about a task', tr: 'Bir görevle ilgili her şey' },
        body: {
          en: 'Follow it, link it to the task it waits for, log time, tick off a checklist — and at the bottom, every change it went through.',
          tr: 'Takip et, beklediği göreve bağla, süre gir, kontrol listesini işaretle — en altta da geçirdiği her değişiklik.',
        },
      },
    ],
  },
  {
    id: 'playbook',
    area: 'customers',
    goals: ['keep', 'setup'],
    roles: ['csm', 'ops'],
    minutes: 1,
    title: { en: 'Onboard a customer in one click', tr: 'Bir tıkla müşteri devreye al' },
    blurb: { en: 'Playbooks turn your team’s way of doing things into tasks, with owners and dates.', tr: 'Playbook’lar ekibinin iş yapma biçimini sahipli ve tarihli görevlere çevirir.' },
    steps: [
      {
        path: '/accounts',
        at: '.acard__name',
        click: true,
        title: { en: 'Pick a customer', tr: 'Bir müşteri seç' },
        body: { en: 'Open one.', tr: 'Birini aç.' },
      },
      {
        at: '[data-tour="apply-playbook"]',
        click: true,
        title: { en: 'Apply a playbook', tr: 'Playbook uygula' },
        body: {
          en: 'A playbook is a set of tasks your team always does — for onboarding, a business review, closing a deal. Open the list.',
          tr: 'Playbook, ekibinin hep yaptığı görevlerin listesi — devreye alma, iş değerlendirmesi, fırsat kapatma için. Listeyi aç.',
        },
      },
      {
        at: '.planpop',
        title: { en: 'Tasks, owners and dates in one go', tr: 'Görev, sahip ve tarih tek seferde' },
        body: {
          en: 'Choose one and every task lands on the right board, with someone responsible and a due date counted from today.',
          tr: 'Birini seç; her görev doğru panoya, bir sorumluyla ve bugünden sayılan bir tarihle düşer.',
        },
      },
      {
        path: '/settings/playbooks',
        at: '.sheet',
        title: { en: 'Write your own', tr: 'Kendininkini yaz' },
        body: {
          en: 'Start from an example or from nothing; automations can apply a playbook for you when something happens.',
          tr: 'Bir örnekten ya da sıfırdan başla; otomasyonlar bir şey olduğunda playbook’u senin yerine uygulayabilir.',
        },
      },
    ],
  },
  {
    id: 'reviews',
    area: 'customers',
    goals: ['keep', 'week'],
    roles: ['csm', 'lead'],
    minutes: 1,
    title: { en: 'Keep a rhythm with every customer', tr: 'Her müşteriyle bir ritim tut' },
    blurb: { en: 'Business reviews that come round on time, and every meeting on one calendar.', tr: 'Vaktinde gelen iş değerlendirmeleri ve her toplantı tek takvimde.' },
    steps: [
      {
        path: '/accounts?view=reviews',
        at: '.renewals',
        title: { en: 'Who is due a review', tr: 'Kimin değerlendirmesi geldi' },
        body: {
          en: 'Customers whose business review is late, coming up in the next 30 days, or later. Mark one done and the next date moves on by itself.',
          tr: 'İş değerlendirmesi geciken, 30 gün içinde gelen ya da daha sonra olan müşteriler. Birini yapıldı işaretle; sıradaki tarih kendiliğinden ilerler.',
        },
      },
      {
        path: '/calendar',
        at: '.cal-kind[data-kind="meeting"]',
        title: { en: 'Meetings, calls and reviews', tr: 'Toplantılar, aramalar, değerlendirmeler' },
        body: {
          en: 'Everything held with customers lands on one calendar — by day, week, month or year.',
          tr: 'Müşterilerle yapılan her şey tek takvime düşer — gün, hafta, ay ya da yıl olarak.',
        },
      },
      {
        at: '.cal-who',
        title: { en: 'Yours, or the team’s', tr: 'Seninki ya da ekibinki' },
        body: {
          en: 'Leads can look at a whole team’s calendar, or one person’s — only where their role allows it.',
          tr: 'Liderler bütün ekibin ya da bir kişinin takvimine bakabilir — yalnızca rollerinin izin verdiği yerde.',
        },
      },
    ],
  },
  {
    id: 'reports',
    area: 'insight',
    goals: ['see'],
    roles: ['lead', 'exec'],
    minutes: 2,
    title: { en: 'Build a report in a minute', tr: 'Bir dakikada rapor kur' },
    blurb: { en: 'An overview that’s ready on day one, a report builder anyone can use, and each person’s week.', tr: 'Baştan hazır bir genel bakış, herkesin kullanabileceği rapor kurucu ve her kişinin haftası.' },
    steps: [
      {
        path: '/reports',
        at: '.sheet',
        title: { en: 'Ready before you ask', tr: 'Sen sormadan hazır' },
        body: {
          en: 'Work coming in and getting done week by week, who carries what, and time logged — without building anything.',
          tr: 'Hafta hafta gelen ve biten iş, kimin ne taşıdığı ve girilen süre — hiçbir şey kurmadan.',
        },
      },
      {
        path: '/reports/new',
        at: '.rb__rail',
        title: { en: 'Your own report, step by step', tr: 'Kendi raporun, adım adım' },
        body: {
          en: 'Choose what to look at — tasks, customers, opportunities — then filter it, group it and pick how to count it.',
          tr: 'Neye bakacağını seç — görevler, müşteriler, fırsatlar — sonra filtrele, grupla ve nasıl sayılacağını seç.',
        },
      },
      {
        at: '.rb__chart',
        title: { en: 'See it as you build it', tr: 'Kurarken gör' },
        body: {
          en: 'The result changes with every choice. Save it, and put it on a dashboard or on your home.',
          tr: 'Sonuç her seçimde değişir. Kaydet; bir panele ya da ana sayfana koy.',
        },
      },
      {
        path: '/team',
        at: '.owner',
        title: { en: 'Each person’s week', tr: 'Her kişinin haftası' },
        body: {
          en: 'Customers, open work and what is late for each person — and a view to prepare a one-to-one.',
          tr: 'Her kişinin müşterileri, açık işleri ve gecikenleri — ve birebir görüşmeye hazırlanmak için bir görünüm.',
        },
      },
    ],
  },
  {
    id: 'curaai',
    area: 'ai',
    goals: ['answer', 'see'],
    roles: ['csm', 'sales', 'lead', 'exec', 'ops'],
    minutes: 1,
    title: { en: 'Ask CuraAI', tr: 'CuraAI’ya sor' },
    blurb: { en: 'Questions in your own words; answers with their sources. In this demo, Claude writes them.', tr: 'Kendi cümlelerinle sorular; kaynağıyla cevaplar. Bu demoda cevapları Claude yazıyor.' },
    steps: [
      {
        at: '.cura__fab',
        click: true,
        title: { en: 'On every screen', tr: 'Her ekranda' },
        body: { en: 'Open CuraAI.', tr: 'CuraAI’yı aç.' },
      },
      {
        at: '.cura .ask__chip',
        title: { en: 'Start with a question like these', tr: 'Bunlar gibi bir soruyla başla' },
        body: {
          en: 'How to import customers, who can see a field, how to connect a CRM — or anything else.',
          tr: 'Müşteriler nasıl içe aktarılır, bir alanı kim görebilir, CRM nasıl bağlanır — ya da başka herhangi bir şey.',
        },
      },
      {
        at: '.cura input.input',
        title: { en: 'Or ask in your own words', tr: 'Ya da kendi cümlelerinle sor' },
        body: {
          en: '“Which customers renew this quarter and are at risk?” In this demo, Claude answers from the docs and the workspace, and says where each answer came from.',
          tr: '“Bu çeyrek yenilenecek ve riskte olan müşteriler hangileri?” Bu demoda Claude belgelerden ve çalışma alanından cevap verir; her cevabın nereden geldiğini söyler.',
        },
      },
      {
        at: '.cura__write',
        title: { en: 'A person, when you need one', tr: 'Gerektiğinde bir insan' },
        body: {
          en: 'If an answer is not enough, write to support from here — the question comes along.',
          tr: 'Cevap yetmezse buradan desteğe yaz — soru da yanında gider.',
        },
      },
    ],
  },
  {
    id: 'portal',
    area: 'portal',
    goals: ['answer'],
    roles: ['csm', 'ops'],
    as: 'customer',
    minutes: 2,
    title: { en: 'A portal for each customer', tr: 'Her müşteriye bir portal' },
    blurb: { en: 'Your customers open requests and follow them in a portal of their own; you answer from your board.', tr: 'Müşterilerin kendi portallarında talep açar ve takip eder; sen panondan cevap verirsin.' },
    steps: [
      {
        path: '/',
        at: '.p-top',
        title: { en: 'You are the customer now', tr: 'Şimdi müşterisin' },
        body: {
          en: 'Selin works at Quillfield Retail, one of the company’s customers. This is Quillfield’s own portal, on an address of its own.',
          tr: 'Selin, şirketin müşterilerinden Quillfield Retail’de çalışıyor. Burası Quillfield’ın kendi adresindeki kendi portalı.',
        },
      },
      {
        at: '.p-list',
        title: { en: 'Only what is theirs', tr: 'Yalnızca kendilerine ait olan' },
        body: {
          en: 'Everything Quillfield has open with the team, and where each request stands. Nothing of any other customer, ever.',
          tr: 'Quillfield’ın ekiple açık olan her şeyi ve her talebin durumu. Başka bir müşterinin hiçbir şeyi asla görünmez.',
        },
      },
      {
        at: '.p-head a',
        title: { en: 'Asking is easy', tr: 'Sormak kolay' },
        body: {
          en: 'A new request lands on the team’s board as a task; the answer comes back here and by email. Switch back to the team with “Viewing as” above.',
          tr: 'Yeni talep ekibin panosuna görev olarak düşer; cevap buraya ve e-postayla gelir. Yukarıdaki “Kim olarak” ile ekibe geri dön.',
        },
      },
    ],
  },
  {
    id: 'crm',
    area: 'connect',
    goals: ['setup'],
    roles: ['ops'],
    minutes: 2,
    title: { en: 'Bring your CRM along', tr: 'CRM’ini yanında getir' },
    blurb: { en: 'Salesforce, HubSpot, Dynamics 365 and more, or a spreadsheet — connected in four steps.', tr: 'Salesforce, HubSpot, Dynamics 365 ve daha fazlası ya da bir tablo — dört adımda bağlı.' },
    steps: [
      {
        path: '/settings/sources',
        at: '.tiles',
        title: { en: 'Where your customers already are', tr: 'Müşterilerin zaten neredeyse' },
        body: {
          en: 'Connect a CRM or a spreadsheet; customers, contacts and deals come over, and stay in step as they change.',
          tr: 'Bir CRM ya da tablo bağla; müşteriler, kişiler ve fırsatlar gelir ve değiştikçe eşit kalır.',
        },
      },
      {
        at: '[data-tour="crm-demo"]',
        title: { en: 'Try it with a pretend CRM', tr: 'Uydurma bir CRM ile dene' },
        body: {
          en: 'The demo cannot reach a real CRM, so this one has invented data — and walks the very same steps.',
          tr: 'Demo gerçek bir CRM’e ulaşamaz; bu yüzden bunun verisi uydurma — ama aynı adımları yürür.',
        },
      },
      {
        at: '[data-tour="crm-demo"] button',
        click: true,
        title: { en: 'Connect it', tr: 'Bağla' },
        body: {
          en: 'Allow access, choose what comes over, match the fields, start the first sync. Click to begin.',
          tr: 'İzin ver, neyin geleceğini seç, alanları eşle, ilk eşitlemeyi başlat. Başlamak için tıkla.',
        },
      },
    ],
  },
  {
    id: 'roles',
    area: 'connect',
    goals: ['setup'],
    roles: ['ops', 'lead'],
    minutes: 1,
    title: { en: 'Decide who sees what', tr: 'Kimin neyi göreceğine karar ver' },
    blurb: { en: 'Roles with plain permissions, and who holds each one.', tr: 'Anlaşılır izinlerle roller ve her rolde kimlerin olduğu.' },
    steps: [
      {
        path: '/settings/roles',
        at: '.matrix',
        title: { en: 'Roles, in plain words', tr: 'Anlaşılır roller' },
        body: {
          en: 'Each row is something a person can do; each column a role. Tick what each role may do — the app and the data follow.',
          tr: 'Her satır bir kişinin yapabileceği bir şey, her sütun bir rol. Her rolün neyi yapabileceğini işaretle — uygulama da veri de buna uyar.',
        },
      },
      {
        at: '.matrix__count',
        title: { en: 'And who holds each one', tr: 'Ve her rolde kim var' },
        body: {
          en: 'See the people in a role, and look at the product through their eyes before you change anything for them.',
          tr: 'Bir roldeki kişileri gör ve onlar için bir şey değiştirmeden önce ürüne onların gözünden bak.',
        },
      },
    ],
  },
];

export const tourById = (id: string | null | undefined): Tour | undefined => TOURS.find((t) => t.id === id);

/** Where a visitor starts a workspace of their own. */
export const SIGNUP_URL = 'https://app.curahold.com/signup';
