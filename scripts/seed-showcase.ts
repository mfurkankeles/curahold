// A fuller invented portfolio on top of seed-demo.ts, for the try-it-now demo:
// more customers, their stakeholders, upsell opportunities and a working
// week of tasks. Everything goes through the public API as the admin, so the
// same rules apply as for any other client. No name here is real.
import type { Db } from '../api/src/db';
import { enqueue } from '../api/src/lib/notify';
import { buildWeekly } from '../api/src/lib/weekly';
import { DEFAULT_HEALTH } from '../shared/src/health';

type Call = <T = any>(method: string, path: string, body?: unknown) => Promise<T>;

const ago = (days: number, hour = 11) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

// [account, kind, days ago, text] — written as the owner would.
const ACTIVITIES: [string, 'note' | 'call' | 'meeting' | 'email', number, string][] = [
  ['Quillfield Retail', 'meeting', 2, 'Çeyrek değerlendirmesi. Selin yeni kampanya takvimini paylaştı; mobil kanalı genişletmek istiyorlar. Ek kullanıcı paketi için teklif bekliyorlar.'],
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
const OPPORTUNITIES: [string, string, number, number][] = [
  ['Lindenhall Sigorta', 'Mobil uygulama modülü', 38000, 25],
  ['Brightmoor Enerji', 'İkinci marka için genişleme', 64000, 70],
  ['Quillfield Retail', 'Ek kullanıcı paketi', 12000, 18],
  ['Cedarmoor Health', 'Raporlama eklentisi', 8000, 45],
];

export async function seedShowcase(call: Call, db?: Db) {
  const { people, teams } = await call<{ people: { id: string; email: string }[]; teams: { id: string; name: string }[] }>('GET', '/api/people');
  const who = (key: string) => people.find((p) => p.email === `${key}@demo.example`)!.id;
  const cs = teams.find((t) => t.name === 'Customer Success')?.id ?? null;

  const accounts: Record<string, string> = {};
  for (const a of (await call<{ accounts: { id: string; name: string }[] }>('GET', '/api/accounts?limit=100')).accounts) accounts[a.name] = a.id;
  for (const [name, owner, renewIn, value, health, tier, site] of ACCOUNTS) {
    const { account } = await call('POST', '/api/accounts', {
      name,
      ownerId: who(owner),
      teamId: owner === 'omar' ? null : cs,
      fields: { renewal_date: day(renewIn), arr: value, health, tier, website: `https://${site}/` },
    });
    accounts[name] = account.id;
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
  for (const [acc, name, amount, closeIn] of OPPORTUNITIES) {
    await call('POST', '/api/records', { typeId: opportunity.id, accountId: accounts[acc], name, fields: { amount, close_date: day(closeIn), status: 'open' } });
  }

  const { boards } = await call<{ boards: { id: string; name: string }[] }>('GET', '/api/boards');
  const board = (prefix: string) => boards.find((b) => b.name.startsWith(prefix))!.id;
  const main = board('CS');
  const renewals = board('Yenile');
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

  if (db) {
    // Seven weeks of score history, ending at today's score, so trends and drops show.
    await db.system(async (q) => {
      const rows = await q.query(`select id, name, (fields->>'health_score')::int as score, org_id from accounts where jsonb_typeof(fields->'health_score') = 'number'`);
      const falling = new Set(['Velto Mobility', 'Kilnworth Yapı', 'Corvina Medya', 'Saltmarsh Turizm']);
      const rising = new Set(['Brightmoor Enerji', 'Lindenhall Sigorta']);
      let seed = 7;
      const noise = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280 - 0.5) * 4;
      for (const r of rows) {
        const start = falling.has(r.name) ? Math.min(92, r.score + 28) : rising.has(r.name) ? Math.max(20, r.score - 18) : r.score;
        for (let d = 49; d >= 1; d--) {
          // A step down (or up) a few days ago, otherwise a slow drift.
          const step = d > 5 ? start : r.score + (start - r.score) * (d / 5) * 0.3;
          const v = Math.max(0, Math.min(100, Math.round(step + (d > 1 ? noise() : 0))));
          await q.query('insert into health_history (org_id, account_id, day, score) values ($1, $2, current_date - $3::int, $4) on conflict do nothing', [r.org_id, r.id, d, v]);
        }
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
