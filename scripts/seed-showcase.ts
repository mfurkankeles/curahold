// A fuller invented portfolio on top of seed-demo.ts, for the try-it-now demo:
// more customers, their stakeholders, upsell opportunities and a working
// week of tasks. Everything goes through the public API as the admin, so the
// same rules apply as for any other client. No name here is real.
import { deepEnglish, toEnglish } from './seed-showcase.en';
import type { Db } from '../api/src/db';
import { enqueue } from '../api/src/lib/notify';
import { buildWeekly } from '../api/src/lib/weekly';
import { DEFAULT_HEALTH } from '../shared/src/health';
import { labelOf } from '../shared/src/fields';
import { PLAYBOOK_EXAMPLES } from '../shared/src/playbooks';
import { RECORD_PRESETS } from '../shared/src/records';
import { startRenewalsIn } from '../api/src/lib/playbooks';
import { ACCOUNTS as BASE_ACCOUNTS } from './seed-demo';

type Call = <T = any>(method: string, path: string, body?: unknown) => Promise<T>;

const ago = (days: number, hour = 11) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

// [account, kind, days ago, text] — written as the owner would.
const ACTIVITIES: [string, 'note' | 'call' | 'meeting' | 'email' | 'review', number, string][] = [
  ['Quillfield Retail', 'review', 2, 'Çeyrek değerlendirmesi. Selin yeni kampanya takvimini paylaştı; mobil kanalı genişletmek istiyorlar. Ek kullanıcı paketi için teklif bekliyorlar.'],
  ['Quillfield Retail', 'email', 9, 'Kullanım raporunu gönderdim. Tomas fiyatlandırma detaylarını sordu.'],
  ['Harborline Bank', 'call', 4, 'Defne ile yenileme ön görüşmesi. Finans tarafı (Hakan) bütçeyi çeyrek sonuna kadar dondurmak istiyor. Ara çözüm: 3 aylık köprü sözleşme.'],
  ['Harborline Bank', 'note', 15, 'Hakan Ersoy rakip teklifi masaya koymuş olabilir. Yenileme görüşmesinde değer hikayesini rakamlarla anlatalım.'],
  ['Cedarmoor Health', 'meeting', 6, 'Onboarding başlangıç toplantısı yapıldı. Nora ekibine eğitim takvimi istedi; iki oturum planlandı.'],
  ['Velto Mobility', 'call', 41, 'Kerem kullanım düşüşünden memnun değil; yeni ürün ekibi başka araçlara bakıyor. Ece hâlâ destekçimiz.'],
  ['Fjordnet Telecom', 'email', 12, 'Jonas fiyat artışı için onay sürecinin iki hafta süreceğini yazdı.'],
  ['Fjordnet Telecom', 'meeting', 26, 'İrem ile analitik ekibine özel eğitim. Çok olumlu geri bildirim.'],
  ['Orchardly Foods', 'note', 52, 'Küçük ekip, kendi başına iyi gidiyor. Çeyrekte bir kontrol yeterli.'],
  ['Lindenhall Sigorta', 'meeting', 1, 'Burak ile yenileme ve mobil modül görüşmesi. Bilgi güvenliği (Melis) soru listesi gönderecek; yanıtlar onaydan önce gerekiyor.'],
  ['Lindenhall Sigorta', 'call', 8, 'Melis veri saklama süreleri ve KVKK maddelerini sordu. Güvenlik dokümanlarını ilettim.'],
  ['Ambergate Lojistik', 'email', 19, 'Can yenileme için teklif bekliyor; karar vericiyle henüz görüşmedik.'],
  ['Corvina Medya', 'call', 47, 'Aslı bütçe kısıntısı yüzünden indirim istedi. Kullanım düşük.'],
  ['Brightmoor Enerji', 'meeting', 3, 'İkinci marka için genişleme demosu. Victor teknik entegrasyonu olumlu buldu; Elif teklif istedi.'],
  ['Wrenfield Eğitim', 'note', 11, 'Kampanya kurgusu Gizem ile birlikte kuruldu; ilk sonuçlar gelecek hafta.'],
  ['Saltmarsh Turizm', 'call', 33, 'Onur sezon öncesi yoğun; Pelin satın alma tarafında maliyet itirazında.'],
  ['Kilnworth Yapı', 'email', 58, 'Serkan yeni yönetimle önceliklerin değiştiğini yazdı. Görüşme ayarlanamadı.'],
  ['Duskvale Oyun', 'meeting', 5, 'Mila ile aylık görüşme. Başarı hikayesi için olumlu baktı.'],
  // Business reviews, each older than the customer's latest contact: some on rhythm, some coming up, some late.
  ['Harborline Bank', 'review', 80, 'Çeyrek değerlendirmesi: kullanım hedefin üstünde, raporlama tarafında iki istek var. Yenileme öncesi tekrar oturacağız.'],
  ['Ambergate Lojistik', 'review', 104, 'İş değerlendirmesi. Operasyon ekibi memnun; yönetim tarafında sponsor değişti, yeni isimle tanışmamız gerek.'],
  ['Lindenhall Sigorta', 'review', 62, 'Çeyrek değerlendirmesi: mobil modül ihtiyacı ilk kez burada konuşuldu. Güvenlik ekibi sürece dahil edilecek.'],
  ['Brightmoor Enerji', 'review', 38, 'İş değerlendirmesi. İkinci marka planı paylaşıldı; genişleme için demo istendi.'],
  ['Fjordnet Telecom', 'review', 71, 'Çeyrek değerlendirmesi: analitik ekibi yeni eğitim istedi, kullanım istikrarlı.'],
  ['Velto Mobility', 'review', 118, 'İş değerlendirmesi. Ürün ekibindeki değişiklik sonrası kullanım geriliyor; aksiyon planı çıkarıldı.'],
  ['Cedarmoor Health', 'review', 21, 'Onboarding sonu değerlendirmesi: ilk hedefler üzerinden geçildi, sonraki çeyreğin planı yazıldı.'],
  ['Saltmarsh Turizm', 'review', 96, 'Sezon öncesi değerlendirme. Maliyet konusu açık kaldı; sezon sonunda tekrar görüşülecek.'],
  ['Duskvale Oyun', 'review', 47, 'İş değerlendirmesi: ilk ay hedefleri tuttu. Başarı hikayesi fikri burada doğdu.'],
  ['Wrenfield Eğitim', 'review', 84, 'Dönem başı değerlendirmesi. Kampüs lisansı ihtiyacı konuşuldu.'],
  ['Orchardly Foods', 'review', 58, 'Kısa değerlendirme: ekip küçük ama düzenli kullanıyor, analitik eklentisine ilgi var.'],
];

function day(offset: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

// [name, owner, renewal in N days, annual value, health, tier, website]
const ACCOUNTS: [string, string, number, number, string, string, string][] = [
  ['Lindenhall Sigorta', 'omar', 30, 145000, 'good', 'enterprise', 'lindenhall.example'],
  ['Ambergate Lojistik', 'zeynep', 20, 46000, 'watch', 'mid', 'ambergate.example'],
  ['Corvina Medya', 'lena', 12, 12000, 'risk', 'smb', 'corvina.example'],
  ['Brightmoor Enerji', 'omar', 240, 172000, 'good', 'enterprise', 'brightmoor.example'],
  ['Wrenfield Eğitim', 'lena', 95, 29000, 'good', 'mid', 'wrenfield.example'],
  ['Saltmarsh Turizm', 'zeynep', 55, 41000, 'watch', 'mid', 'saltmarsh.example'],
  ['Kilnworth Yapı', 'omar', 38, 118000, 'risk', 'enterprise', 'kilnworth.example'],
  ['Duskvale Oyun', 'lena', 330, 9000, 'good', 'smb', 'duskvale.example'],
];

// [account, first, last, title, decision, stance]
const CONTACTS: [string, string, string, string, string, string][] = [
  ['Quillfield Retail', 'Selin', 'Aytaç', 'Dijital Kanallar Direktörü', 'decision_maker', 'champion'],
  ['Quillfield Retail', 'Tomas', 'Weller', 'Satın Alma Müdürü', 'approver', 'neutral'],
  ['Harborline Bank', 'Defne', 'Kaya', 'CRM Lideri', 'decision_maker', 'supporter'],
  ['Harborline Bank', 'Hakan', 'Ersoy', 'Finans Direktörü', 'approver', 'skeptic'],
  ['Cedarmoor Health', 'Nora', 'Lindqvist', 'Pazarlama Müdürü', 'decision_maker', 'champion'],
  ['Velto Mobility', 'Kerem', 'Yalın', 'Ürün Başkan Yardımcısı', 'decision_maker', 'blocker'],
  ['Velto Mobility', 'Ece', 'Taner', 'Büyüme Uzmanı', 'user', 'supporter'],
  ['Fjordnet Telecom', 'Jonas', 'Berg', 'Müşteri Deneyimi Direktörü', 'decision_maker', 'neutral'],
  ['Fjordnet Telecom', 'İrem', 'Soylu', 'Analitik Ekip Lideri', 'influencer', 'champion'],
  ['Lindenhall Sigorta', 'Burak', 'Özen', 'Dijital Dönüşüm Direktörü', 'decision_maker', 'champion'],
  ['Lindenhall Sigorta', 'Melis', 'Durmaz', 'Bilgi Güvenliği Müdürü', 'evaluator', 'skeptic'],
  ['Ambergate Lojistik', 'Can', 'Bilgin', 'Operasyon Direktörü', 'decision_maker', 'neutral'],
  ['Corvina Medya', 'Aslı', 'Kurt', 'Genel Müdür', 'decision_maker', 'skeptic'],
  ['Brightmoor Enerji', 'Elif', 'Sarıgül', 'Müşteri İlişkileri Başkanı', 'decision_maker', 'champion'],
  ['Brightmoor Enerji', 'Victor', 'Lane', 'BT Mimarı', 'evaluator', 'supporter'],
  ['Wrenfield Eğitim', 'Gizem', 'Aydın', 'Öğrenci Deneyimi Müdürü', 'decision_maker', 'supporter'],
  ['Saltmarsh Turizm', 'Onur', 'Çelik', 'E-ticaret Müdürü', 'decision_maker', 'neutral'],
  ['Saltmarsh Turizm', 'Pelin', 'Ateş', 'Satın Alma Uzmanı', 'approver', 'blocker'],
  ['Kilnworth Yapı', 'Serkan', 'Doğru', 'Pazarlama Direktörü', 'decision_maker', 'skeptic'],
  ['Duskvale Oyun', 'Mila', 'Novak', 'Kurucu Ortak', 'decision_maker', 'champion'],
];

// [account, name, amount, close in N days]
// [customer, name, amount, closes in N days, stage, kind, status]
const OPPORTUNITIES: [string, string, number, number, string, string, string][] = [
  ['Lindenhall Sigorta', 'Mobil uygulama modülü', 38000, 25, 'proposal', 'expansion', 'open'],
  ['Brightmoor Enerji', 'İkinci marka için genişleme', 64000, 70, 'discovery', 'expansion', 'open'],
  ['Quillfield Retail', 'Ek kullanıcı paketi', 12000, 18, 'commit', 'expansion', 'open'],
  ['Cedarmoor Health', 'Raporlama eklentisi', 8000, 45, 'discovery', 'expansion', 'open'],
  ['Ambergate Lojistik', 'Yıllık yenileme', 46000, 20, 'negotiation', 'renewal', 'open'],
  ['Harborline Bank', 'Çok yıllı yenileme', 96000, 45, 'proposal', 'renewal', 'open'],
  ['Saltmarsh Turizm', 'Sadakat programı pilotu', 22000, 60, 'discovery', 'expansion', 'open'],
  ['Kilnworth Yapı', 'Bayi portalı', 54000, 38, 'negotiation', 'expansion', 'open'],
  ['Wrenfield Eğitim', 'Kampüs lisansı', 31000, 12, 'commit', 'new', 'open'],
  ['Duskvale Oyun', 'Başlangıç paketi', 18000, -9, 'commit', 'new', 'won'],
  ['Orchardly Foods', 'Analitik eklentisi', 9000, -20, 'commit', 'expansion', 'won'],
  ['Fjordnet Telecom', 'Yıllık yenileme', 42000, -6, 'commit', 'renewal', 'won'],
  ['Corvina Medya', 'Reklam modülü', 15000, -14, 'proposal', 'expansion', 'lost'],
];

const HISTORY = [
  'Çeyrek değerlendirme sunumu',
  'Kullanım raporunu paylaş',
  'Eğitim oturumu: yeni ekip üyeleri',
  'Fatura düzeltmesini takip et',
  'Entegrasyon hatasını kapat',
  'Yenileme takvimini onayla',
  'Başarı planını güncelle',
  'Yönetici özeti gönder',
  'Açılış toplantısı notlarını paylaş',
  'Memnuniyet anketi sonuçlarını incele',
  'Yeni modül tanıtımı',
  'Veri aktarımını doğrula',
  'Sözleşme eklerini imzaya gönder',
  'Destek önceliklerini netleştir',
  'Kullanıcı yetkilerini düzenle',
  'Referans görüşmesi ayarla',
  'Kampanya sonuçlarını raporla',
  'Hedef göstergelerini birlikte belirle',
  'Yol haritası paylaşımı',
  'Pilot sonuçlarını sun',
  'Fiyat teklifini güncelle',
  'Teknik inceleme toplantısı',
  'Eksik erişim anahtarlarını iste',
  'Geri bildirimleri ürün ekibine ilet',
  // Finished long enough ago to be in the archive.
  'İlk kurulum toplantısı',
  'Veri eşlemesini tamamla',
  'Yönetici panosunu kur',
  'Kullanıcı eğitimi: birinci oturum',
  'Canlıya geçiş kontrol listesi',
  'İlk ay değerlendirmesi',
];

export async function seedShowcase(send: Call, db?: Db, locale: 'tr' | 'en' = 'tr') {
  // Written in Turkish; an English demo gets every text in English on its way in.
  const tx = (text: string) => (locale === 'en' ? toEnglish(text) : text);
  const call: Call = locale === 'en' ? (((method: string, path: string, body?: unknown) => send(method, path, body === undefined ? body : deepEnglish(body))) as Call) : send;
  const { people, teams } = await call<{ people: { id: string; email: string }[]; teams: { id: string; name: string }[] }>('GET', '/api/people');
  const who = (key: string) => people.find((p) => p.email === `${key}@demo.example`)!.id;
  const cs = teams.find((t) => t.name === 'Customer Success')?.id ?? null;

  const accounts: Record<string, string> = {};
  const ownerOf: Record<string, string | null> = {};
  for (const a of (await call<{ accounts: { id: string; name: string; ownerId: string | null }[] }>('GET', '/api/accounts?limit=100')).accounts) {
    accounts[a.name] = a.id;
    ownerOf[a.name] = a.ownerId;
  }
  for (const [name, owner, renewIn, value, health, tier, site] of ACCOUNTS) {
    const { account } = await call('POST', '/api/accounts', {
      name,
      ownerId: who(owner),
      teamId: owner === 'omar' ? null : cs,
      fields: { renewal_date: day(renewIn), arr: value, health, tier, website: `https://${site}/` },
    });
    accounts[name] = account.id;
    ownerOf[name] = who(owner);
  }

  const { type: contact } = await call('POST', '/api/record-types', { kind: 'contact' });
  for (const [acc, first, last, title, decision, stance] of CONTACTS) {
    const email = `${first}.${last}`.toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/İ/g, 'i');
    await call('POST', '/api/records', {
      typeId: contact.id,
      accountId: accounts[acc],
      name: `${first} ${last}`,
      fields: { first_name: first, last_name: last, title, decision, stance, email: `${email}@${acc.split(' ')[0].toLowerCase()}.example` },
    });
  }
  const { type: opportunity } = await call('POST', '/api/record-types', { kind: 'opportunity' });
  for (const [acc, name, amount, closeIn, stage, kind, status] of OPPORTUNITIES) {
    if (!accounts[acc]) continue;
    await call('POST', '/api/records', { typeId: opportunity.id, accountId: accounts[acc], name, ownerId: ownerOf[acc] ?? null, fields: { amount, close_date: day(closeIn), stage, kind, status } });
  }

  // What the team aims for this quarter (a target for each type of deal), a review with every customer each 90 days, and both nudges on.
  await call('PUT', '/api/rhythm', { targets: { period: 'quarter', amounts: { new: 40000, expansion: 120000, renewal: 80000 }, total: null }, reviewDays: 90, staleDays: 14, escalateDays: 3 });

  // A few customers pay in other currencies, at the company's own rates (invented, like everything here).
  await call('PUT', '/api/admin/fx', { rates: locale === 'en' ? { EUR: 1.08, GBP: 1.27, TRY: 0.029 } : { USD: 34.2, EUR: 37.1, GBP: 43.6 } }).catch(() => undefined);
  const abroad: Record<string, string> = locale === 'en' ? { 'Fjordnet Telecom': 'EUR', 'Brightmoor Enerji': 'EUR', 'Lindenhall Sigorta': 'TRY' } : { 'Fjordnet Telecom': 'EUR', 'Brightmoor Enerji': 'EUR', 'Harborline Bank': 'USD' };
  for (const [name, currency] of Object.entries(abroad)) {
    if (accounts[name]) await call('PATCH', `/api/accounts/${accounts[name]}`, { currency }).catch(() => undefined);
  }

  // Agreements kept as records, each with a link to the signed document (the Renewals view shows them).
  const agreementKind = RECORD_PRESETS.find((x) => x.key === 'agreement')!;
  const { type: agreement } = await call('POST', '/api/record-types', { kind: 'custom', key: agreementKind.key, name: agreementKind.name, fields: agreementKind.fields }).catch(() => ({ type: null }));
  if (agreement) {
    for (const [acc, , renewIn, value] of [...ACCOUNTS, ...BASE_ACCOUNTS]) {
      if (!accounts[acc] || renewIn > 200) continue;
      const slug = acc.split(' ')[0].toLowerCase();
      await call('POST', '/api/records', {
        typeId: agreement.id,
        accountId: accounts[acc],
        name: `${tx(acc)} — ${locale === 'en' ? 'Master agreement' : 'Ana sözleşme'}`,
        ownerId: ownerOf[acc] ?? null,
        fields: { link: `https://docs.example/agreements/${slug}.pdf`, start_date: day(renewIn - 365), end_date: day(renewIn), value, status: 'signed' },
      }).catch(() => undefined);
    }
  }

  // Reports people built, and two dashboards made from the ready-made ones.
  const keep = (name: string, def: unknown, shared = true) => call('POST', '/api/reports/saved', { name, def, shared }).catch(() => undefined);
  await keep('Müşteri bazında yıllık tutar', { source: 'accounts', filters: [], groups: [{ field: 'name' }], measure: { fn: 'sum', field: 'arr' }, chart: 'bar', top: 10 }).catch(() => undefined);
  await keep('Bu çeyrek kapanacak fırsatlar', { source: 'deals', filters: [{ field: 'status', op: 'in', values: ['open'] }, { field: 'close_date', op: 'this', period: 'quarter' }], groups: [], measure: { fn: 'count' }, chart: 'table', columns: ['name', 'account', 'owner', 'stage', 'amount', 'close_date'] });
  await keep('Geciken işlerim', { source: 'tasks', filters: [{ field: 'overdue', op: 'yes' }, { field: 'assignee', op: 'in', values: ['me'] }], groups: [], measure: { fn: 'count' }, chart: 'table', columns: ['title', 'account', 'due', 'priority'] }, false);
  await call('POST', '/api/pages/from-template', { template: 'sales' }).catch(() => undefined);
  await call('POST', '/api/pages/from-template', { template: 'team' }).catch(() => undefined);

  const { boards } = await call<{ boards: { id: string; name: string }[] }>('GET', '/api/boards');
  // The starting boards are named in the company's language.
  const board = (...prefixes: string[]) => boards.find((b) => prefixes.some((x) => b.name.startsWith(x)))!.id;
  const main = board('CS');
  const renewals = board('Yenile', 'Renew');
  // [board, title, column, assignees, due in N days, priority, account]
  const TASKS: [string, string, string, string[], number | null, string, string | null][] = [
    [renewals, 'Yenileme görüşmesi: bütçe onayı', 'doing', ['omar'], 2, 'urgent', 'Lindenhall Sigorta'],
    [renewals, 'Bilgi güvenliği sorularını yanıtla', 'todo', ['omar', 'ada'], 5, 'high', 'Lindenhall Sigorta'],
    [renewals, 'Yenileme teklifi taslağı', 'todo', ['zeynep'], 4, 'high', 'Ambergate Lojistik'],
    [renewals, 'İndirim talebini değerlendir', 'todo', ['lena', 'mert'], -1, 'urgent', 'Corvina Medya'],
    [renewals, 'Karar vericiyle yüz yüze toplantı', 'todo', ['omar'], 8, 'high', 'Kilnworth Yapı'],
    [main, 'Kullanım raporu: son 90 gün', 'doing', ['zeynep'], 1, 'normal', 'Saltmarsh Turizm'],
    [main, 'Yeni kampanya kurgusunu birlikte kur', 'doing', ['lena'], 6, 'normal', 'Wrenfield Eğitim'],
    [main, 'Destek taleplerini gözden geçir', 'todo', ['mert'], 0, 'normal', 'Velto Mobility'],
    [main, 'Başarı hikayesi için onay iste', 'todo', ['lena'], 12, 'low', 'Duskvale Oyun'],
    [main, 'Yönetici sponsoru belirle', 'todo', ['zeynep', 'mert'], 3, 'high', 'Ambergate Lojistik'],
    [main, 'Genişleme fırsatı için demo', 'todo', ['omar'], 10, 'normal', 'Brightmoor Enerji'],
    [main, 'Aylık değer özeti gönder', 'done', ['lena'], -3, 'normal', 'Cedarmoor Health'],
  ];
  const ids: string[] = [];
  for (const [b, title, status, assignees, due, priority, acc] of TASKS) {
    const { task } = await call('POST', '/api/tasks', {
      boardId: b,
      title,
      status,
      assigneeIds: assignees.map(who),
      dueDate: due === null ? null : day(due),
      // Longer pieces of work start a while before they are due (the timeline shows them as bars).
      ...(due !== null && due > 2 && ids.length % 2 === 0 ? { startDate: day(due - 3 - (ids.length % 5) * 2) } : {}),
      priority,
      accountId: acc ? accounts[acc] : null,
    });
    ids.push(task.id);
  }
  await call('POST', `/api/tasks/${ids[0]}/comments`, { body: `@[Omar Haddad](${who('omar')}) finans ekibi çeyrek sonuna kadar beklemek istiyor. Bu hafta bir ara çözüm önerelim mi?` });
  await call('POST', `/api/tasks/${ids[3]}/comments`, { body: `@[Lena Fischer](${who('lena')}) geçen yıl %10 vermiştik, bu sefer kullanım artışını gösterip daha az indirimle kapatmayı deneyelim.` });

  for (const [acc, kind, days, body] of ACTIVITIES) {
    await call('POST', `/api/accounts/${accounts[acc]}/activities`, { kind, body, happenedAt: ago(days) });
  }
  // The pinned note everyone should see first on this customer.
  const pin = await call('POST', `/api/accounts/${accounts['Harborline Bank']}/activities`, {
    kind: 'note',
    body: 'Yenileme stratejisi: değer raporu + 3 aylık köprü sözleşme önerisi. Fiyat artışı konuşulmadan önce Defne ile hizalanalım.',
    happenedAt: ago(1, 9),
    pinned: true,
  });
  void pin;
  await call('PUT', '/api/health/config', { config: { ...DEFAULT_HEALTH, enabled: true } });

  // The main board keeps a type and an outcome on its tasks; a few tasks wait for others,
  // some time is logged, and there is a plan and a checklist ready to use.
  await call('PATCH', `/api/boards/${main}`, {
    taskFields: [
      {
        key: 'kind',
        label: { tr: 'Tür', en: 'Type' },
        type: 'select',
        options: [
          { key: 'meeting', label: { tr: 'Toplantı', en: 'Meeting' }, color: 'sky' },
          { key: 'analysis', label: { tr: 'Analiz', en: 'Analysis' }, color: 'plum' },
          { key: 'followup', label: { tr: 'Takip', en: 'Follow-up' }, color: 'honey' },
          { key: 'training', label: { tr: 'Eğitim', en: 'Training' }, color: 'leaf' },
        ],
      },
      { key: 'outcome', label: { tr: 'Sonuç', en: 'Outcome' }, type: 'text' },
      { key: 'doc', label: { tr: 'Belge bağlantısı', en: 'Document link' }, type: 'url' },
    ],
    form: { on: true, title: 'CS ekibinden talep', intro: 'Ne lazım olduğunu yaz; ekip sıraya alır, ilerledikçe haber veririz.', fields: ['description', 'account', 'due', 'f:kind'], column: null },
  }).catch(() => undefined);
  const kinds = ['meeting', 'analysis', 'followup', 'training'];
  const onMain = TASKS.map((t, i) => ({ t, id: ids[i] })).filter((x) => x.t[0] === main);
  for (const [i, x] of onMain.entries()) {
    const { task } = await call('GET', `/api/tasks/${x.id}`);
    await call('PATCH', `/api/tasks/${x.id}`, { baseVersion: task.version, fields: { kind: kinds[i % kinds.length] } }).catch(() => undefined);
  }
  if (onMain.length > 4) {
    await call('POST', `/api/tasks/${onMain[1].id}/links`, { otherId: onMain[0].id, kind: 'blocked_by' }).catch(() => undefined);
    await call('POST', `/api/tasks/${onMain[3].id}/links`, { otherId: onMain[2].id, kind: 'relates' }).catch(() => undefined);
    await call('POST', `/api/tasks/${onMain[0].id}/time`, { minutes: 90, note: 'Hazırlık' }).catch(() => undefined);
    await call('POST', `/api/tasks/${onMain[2].id}/time`, { minutes: 45 }).catch(() => undefined);
    await call('PUT', `/api/tasks/${onMain[1].id}/watch`, {}).catch(() => undefined);
  }
  await call('POST', '/api/checklists', { name: 'QBR hazırlığı', items: ['Kullanım verisini çek', 'Değer özetini yaz', 'Sunumu hazırla', 'Prova yap', 'Davetleri gönder'] }).catch(() => undefined);
  // The renewal playbook, and renewals that start by themselves six months ahead, with an opportunity each.
  const ex = PLAYBOOK_EXAMPLES.find((x) => x.key === 'renewal')!;
  const renewalPlan = await call<{ plan: { id: string } }>('POST', '/api/plans', {
    name: labelOf(ex.name, locale),
    description: labelOf(ex.description, locale),
    boardId: renewals,
    anchor: 'renewal',
    tasks: ex.steps.map((st) => ({ title: labelOf(st.title, locale), dueInDays: st.days, assignee: 'account_owner' })),
  }).catch(() => null);
  await call('PUT', '/api/rhythm', { renewal: { days: 180, planId: renewalPlan?.plan.id ?? null, opportunity: true } }).catch(() => undefined);
  await call('POST', '/api/plans', {
    name: 'Onboarding (ilk 30 gün)',
    description: 'Yeni bir müşterinin ilk ayı.',
    boardId: main,
    tasks: [
      { title: 'Açılış toplantısı: {account_name}', dueInDays: 2, assignee: 'account_owner', subtasks: ['Gündemi gönder', 'Katılımcıları doğrula'] },
      { title: 'Kurulum ve veri aktarımı', dueInDays: 7, assignee: 'account_owner' },
      { title: 'Ekip eğitimi', dueInDays: 14, assignee: 'account_owner' },
      { title: '30. gün değerlendirmesi: {account_name}', dueInDays: 30, assignee: 'account_owner' },
    ],
  }).catch(() => undefined);
  await call('POST', '/api/views', { boardId: main, name: 'Bu hafta ve geciken', filters: { due: ['late', 'today', 'week'] }, shared: true }).catch(() => undefined);

  // Ten weeks of finished work (and a few older ones, already in the archive), so the reports
  // have a past to show. Only with the database at hand: written in one go, with their own dates.
  const past: { id: string; title: string; board: string; by: string; account: string | null; priority: string; made: number; done: number; due: number; minutes: number | null }[] = [];
  if (db) {
    // Not on the customers that have gone quiet: a finished task counts as contact, and their story is the silence.
    const QUIET = ['Velto Mobility', 'Orchardly Foods', 'Corvina Medya', 'Saltmarsh Turizm', 'Kilnworth Yapı'];
    const names = Object.keys(accounts).filter((n) => !QUIET.includes(n));
    const crew = ['zeynep', 'lena', 'omar', 'mert', 'ada'];
    const doneAgo = [2, 3, 5, 6, 8, 9, 11, 12, 13, 16, 17, 19, 22, 24, 26, 29, 31, 33, 36, 40, 44, 47, 52, 58, 96, 104, 113, 121, 138, 152];
    const took = [2, 4, 1, 6, 3, 9, 5, 2, 7, 3];
    for (const [i, title] of HISTORY.entries()) {
      const made = doneAgo[i] + took[i % took.length];
      past.push({
        id: crypto.randomUUID(),
        title: tx(title),
        board: i % 3 === 2 ? renewals : main,
        by: who(crew[i % crew.length]),
        account: accounts[names[(i * 5) % names.length]] ?? null,
        priority: i % 6 === 0 ? 'high' : 'normal',
        made,
        done: doneAgo[i],
        // Three in four were on time; the rest ran a couple of days over.
        due: i % 4 === 3 ? doneAgo[i] + 2 : doneAgo[i] - (i % 3),
        minutes: doneAgo[i] < 30 && made % 2 === 0 ? 30 + (made % 4) * 30 : null,
      });
    }
  }

  if (db) {
    // This morning's renewal round has already run: renewals within six months are under way.
    // It opens its own transactions, so it runs here and never inside db.system below: the
    // in-browser database has a single connection and a nested transaction would wait forever.
    await startRenewalsIn(db, new Date()).catch((e) => console.warn('[seed] renewals', e));
    // Seven weeks of score history, ending at today's score, so trends and drops show.
    await db.system(async (q) => {
      const rows = await q.query(`select id, name, (fields->>'health_score')::int as score, org_id from accounts where jsonb_typeof(fields->'health_score') = 'number'`);
      const falling = new Set(['Velto Mobility', 'Kilnworth Yapı', 'Corvina Medya', 'Saltmarsh Turizm']);
      const rising = new Set(['Brightmoor Enerji', 'Lindenhall Sigorta']);
      let seed = 7;
      const noise = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280 - 0.5) * 4;
      const points: { org: string; account: string; d: number; score: number }[] = [];
      for (const r of rows) {
        const start = falling.has(r.name) ? Math.min(92, r.score + 28) : rising.has(r.name) ? Math.max(20, r.score - 18) : r.score;
        for (let d = 49; d >= 1; d--) {
          // A step down (or up) a few days ago, otherwise a slow drift.
          const step = d > 5 ? start : r.score + (start - r.score) * (d / 5) * 0.3;
          points.push({ org: r.org_id, account: r.id, d, score: Math.max(0, Math.min(100, Math.round(step + (d > 1 ? noise() : 0)))) });
        }
      }
      await q.query(
        `insert into health_history (org_id, account_id, day, score)
         select x.org, x.account, current_date - x.d, x.score from jsonb_to_recordset($1::jsonb) as x(org uuid, account uuid, d int, score int) on conflict do nothing`,
        [JSON.stringify(points)],
      );
      // The past: finished work spread over ten weeks (what is older than ninety days is already in
      // the archive, as the nightly sweep would have left it); open work opened over the last three.
      if (past.length) {
        await q.query(
          `with x as (select * from jsonb_to_recordset($1::jsonb) as r(id uuid, title text, board uuid, by uuid, account uuid, priority text, made int, done int, due int)),
           ins as (
             insert into tasks (id, org_id, board_id, title, status, assignee_ids, account_id, priority, position, created_by, updated_by,
                                created_at, updated_at, done_at, due_date, archived_at)
             select x.id, b.org_id, x.board, x.title, 'done', array[x.by], x.account, x.priority, 9000000 + x.made * 1024, x.by, x.by,
                    now() - make_interval(days => x.made), now() - make_interval(days => x.done), now() - make_interval(days => x.done), current_date - x.due,
                    case when x.done > 90 then now() - make_interval(days => x.done - 90) end
               from x join boards b on b.id = x.board
             returning id, org_id, created_by, created_at)
           insert into task_events (org_id, task_id, actor_id, kind, created_at) select org_id, id, created_by, 'created', created_at from ins`,
          [JSON.stringify(past)],
        );
        await q.query(
          `insert into time_entries (org_id, task_id, user_id, minutes, day, note)
           select t.org_id, t.id, x.by, x.minutes, current_date - x.done, '' from jsonb_to_recordset($1::jsonb) as x(id uuid, by uuid, minutes int, done int)
             join tasks t on t.id = x.id where x.minutes is not null`,
          [JSON.stringify(past)],
        );
      }
      const opened = ids.map((id, i) => ({ id, made: 1 + ((i * 3) % 19), done: 1 + (i % 3) }));
      await q.query(
        `update tasks t set created_at = case when t.done_at is not null then least(now() - make_interval(days => x.made), now() - interval '6 days') else now() - make_interval(days => x.made) end,
                -- What was already finished was finished a day or three ago, not this minute.
                done_at = case when t.done_at is not null then now() - make_interval(days => x.done) end,
                updated_at = case when t.done_at is not null then now() - make_interval(days => x.done) else t.updated_at end
           from jsonb_to_recordset($1::jsonb) as x(id uuid, made int, done int) where t.id = x.id`,
        [JSON.stringify(opened)],
      );
      await q.query(
        `update task_events e set created_at = now() - make_interval(days => x.made)
           from jsonb_to_recordset($1::jsonb) as x(id uuid, made int) where e.task_id = x.id and e.kind = 'created'`,
        [JSON.stringify(opened)],
      );
      // Two tasks nobody has touched for a while (a 1:1 brings them up).
      for (const id of [ids[9], ids[14]].filter(Boolean)) {
        await q.query(`update tasks set created_at = now() - interval '24 days', updated_at = now() - interval '17 days' where id = $1 and done_at is null`, [id]);
      }
      // A weekly summary waiting in everyone's bell, as on a Monday morning.
      const users = await q.query(`select u.id, u.org_id, coalesce(u.locale, o.locale) as locale from users u join orgs o on o.id = u.org_id where u.status = 'active'`);
      for (const u of users) {
        const data = await buildWeekly(q, u.org_id, u.id, new Date(), u.locale);
        if (data) await enqueue(q, [{ orgId: u.org_id, userId: u.id, kind: 'weekly', dedupeKey: `weekly:${u.id}:demo`, data }]);
      }
    });
  }
}
