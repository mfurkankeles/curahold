// The demo company in Turkish: the language the seed itself is written in, so
// its texts go in as they are (`text` stays empty).
import type { SeedWords } from './types';

export const words: SeedWords = {
  company: 'Demo Şirketi',
  timezone: 'Europe/Istanbul',
  money: {
    currency: 'TRY',
    rate: 1,
    fx: { USD: 34.2, EUR: 37.1, GBP: 43.6 },
    abroad: { 'Fjordnet Telecom': 'EUR', 'Brightmoor Enerji': 'EUR', 'Harborline Bank': 'USD' },
  },
  people: { ada: 'Ada Demir', mert: 'Mert Aksoy', zeynep: 'Zeynep Tunç', lena: 'Lena Fischer', omar: 'Omar Haddad', sofia: 'Sofia Rossi' },
  customer: { first: 'Selin', last: 'Kaya' },
  fullName: (first, last) => `${first} ${last}`,
  teams: { cs: 'Müşteri Başarısı', am: 'Hesap Yönetimi' },
  base: {
    ask: 'geçen çeyreğin kullanım grafiğini de ekleyebilir misin?',
    planned: [
      ['review', 'Çeyrek iş değerlendirmesi', 'Kullanım, hedefler ve yenileme yol haritası.', 7, 60, ['mert', 'zeynep'], 'quarterly'],
      ['meeting', 'Yeni modül tanıtımı', 'Ekibe yeni modülü gösterelim ve soruları alalım.', 2, 45, ['lena'], 'none'],
      ['call', 'Aylık durum araması', 'Kısa durum ve açık işler.', 21, 30, ['mert'], 'monthly'],
    ],
    tasks: [
      'Çeyrek iş değerlendirmesi hazırlığı',
      'Onboarding başlangıç toplantısı',
      'Kullanım düşüşünü araştır',
      'Yeni ürün eğitimi planla',
      'Memnuniyet anketi sonuçlarını paylaş',
      'Yenileme teklifini gönder',
      'Fiyat artışı onayını al',
      'Sözleşme imzası',
      'Bütçe taslağını gözden geçir',
    ],
    sprint: ['Sprint 1', 'İlk sprint'],
    subtasks: ['Gündemi yaz', 'Kullanım rakamlarını çek', 'Sunumu gönder'],
    meetingType: ['İş değerlendirmesi', 'Hedefler · Kullanım · Riskler · Yol haritası'],
    boards: { cs: 'CS — Genel', renewals: 'Yenilemeler', notes: 'Ada — notlar' },
  },
  text: {},
};
