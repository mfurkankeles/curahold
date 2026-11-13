// Words of the demo hub (curahold.com/demo): guided tours of the live product.
// The tours themselves — titles, steps, roles, goals, areas — are in
// shared/src/tours.ts; this file holds only the page around them.
import type { TourLang } from '../shared/src/tours';

export interface HubCopy {
  title: string;
  description: string;
  nav: { tours: string; pricing: string; docs: string; other: string; start: string };
  hero: { title: string; lead: string; primary: string; secondary: string; note: (tours: number) => string };
  peek: { customer: string; risk: string; renews: string; overdue: string; why: string; other: string; watch: string; step: string; tipTitle: string; tipBody: string; next: string };
  picker: { title: string; count: (n: number) => string };
  filters: { title: string; clear: string; role: string; goal: string; area: string; show: string };
  results: { count: (n: number) => string; empty: string; clear: string };
  card: { start: string; meta: (minutes: number, steps: number) => string; as: string };
  band: { title: string; text: string; primary: string; secondary: string };
  foot: { home: string; privacy: string; terms: string; made: string };
}

export const HUB: Record<TourLang, HubCopy> = {
  en: {
    title: 'Guided tours of the live product — Curahold',
    description: 'Short guided tours that run on the real Curahold, in your browser, with an invented company. Pick one for your role: renewals, customer health, the team’s week, reports, CuraAI and more.',
    nav: { tours: 'Tours', pricing: 'Pricing', docs: 'Docs', other: 'Türkçe', start: 'Start free' },
    hero: {
      title: 'Take the tour. It’s the real product.',
      lead: 'Every tour runs on the live app in your browser, with an invented company and its customers. Nothing to install, nothing sent anywhere — and you can step off a tour to click around whenever you like.',
      primary: 'Start the two-minute tour',
      secondary: 'Explore on your own',
      note: (n) => `${n} tours, one or two minutes each, in English and Turkish.`,
    },
    peek: {
      customer: 'Corvina Media',
      risk: 'At risk',
      renews: 'Renews in 12 days',
      overdue: '1 overdue',
      why: 'Why?',
      other: 'Velto Mobility',
      watch: 'Worth watching',
      step: '3 of 5',
      tipTitle: 'Not just a colour',
      tipBody: 'The health score comes with its reasons.',
      next: 'Next',
    },
    picker: { title: 'Show me tours for', count: (n) => `${n} tours` },
    filters: { title: 'Filter tours', clear: 'Clear', role: 'Your role', goal: 'What you want to do', area: 'Part of the product', show: 'Filters' },
    results: { count: (n) => (n === 1 ? '1 tour' : `${n} tours`), empty: 'No tour matches all of these.', clear: 'Clear the filters' },
    card: { start: 'Start tour', meta: (m, s) => `${m} min · ${s} steps`, as: 'as' },
    band: {
      title: 'Seen enough? Try it with your own customers.',
      text: 'Start a workspace in a minute. Fourteen days free, no card needed, in English and Turkish.',
      primary: 'Start free',
      secondary: 'Read the docs',
    },
    foot: { home: 'Curahold home', privacy: 'Privacy', terms: 'Terms', made: 'Everything in these tours is invented: the company, its people and its customers.' },
  },
  tr: {
    title: 'Canlı ürünün rehberli turları — Curahold',
    description: 'Gerçek Curahold üzerinde, tarayıcında, uydurma bir şirketle çalışan kısa rehberli turlar. Rolüne uygun olanı seç: yenilemeler, müşteri sağlığı, ekibin haftası, raporlar, CuraAI ve daha fazlası.',
    nav: { tours: 'Turlar', pricing: 'Fiyatlar', docs: 'Belgeler', other: 'English', start: 'Ücretsiz başla' },
    hero: {
      title: 'Tura çık. Gördüğün gerçek ürün.',
      lead: 'Her tur, tarayıcında çalışan canlı uygulamanın üstünde, uydurma bir şirket ve müşterileriyle ilerler. Kurulacak bir şey yok, hiçbir veri bir yere gitmiyor — istediğin an turdan çıkıp kendin gezebilirsin.',
      primary: 'İki dakikalık turu başlat',
      secondary: 'Kendi başına gez',
      note: (n) => `${n} tur; her biri bir iki dakika, Türkçe ve İngilizce.`,
    },
    peek: {
      customer: 'Corvina Media',
      risk: 'Riskte',
      renews: '12 gün sonra yenileniyor',
      overdue: '1 geciken',
      why: 'Neden?',
      other: 'Velto Mobility',
      watch: 'Takip edilmeli',
      step: '3 / 5',
      tipTitle: 'Yalnızca bir renk değil',
      tipBody: 'Sağlık skoru, nedenleriyle birlikte gelir.',
      next: 'İleri',
    },
    picker: { title: 'Şunun için turları göster', count: (n) => `${n} tur` },
    filters: { title: 'Turları süz', clear: 'Temizle', role: 'Rolün', goal: 'Ne yapmak istiyorsun', area: 'Ürünün hangi kısmı', show: 'Filtreler' },
    results: { count: (n) => `${n} tur`, empty: 'Bunların hepsine uyan bir tur yok.', clear: 'Filtreleri temizle' },
    card: { start: 'Turu başlat', meta: (m, s) => `${m} dk · ${s} adım`, as: '' },
    band: {
      title: 'Yeterince gördün mü? Kendi müşterilerinle dene.',
      text: 'Bir dakikada çalışma alanını aç. On dört gün ücretsiz, kart gerekmez; Türkçe ve İngilizce.',
      primary: 'Ücretsiz başla',
      secondary: 'Belgeleri oku',
    },
    foot: { home: 'Curahold ana sayfa', privacy: 'Gizlilik', terms: 'Koşullar', made: 'Bu turlardaki her şey uydurmadır: şirket, çalışanları ve müşterileri.' },
  },
};
