// Ready-made playbooks an admin can start from: the usual ways a customer
// team onboards, renews, reviews and closes. Each step is due so many days
// after the start, or so many days before the renewal or close date
// (see PlanAnchor in model.ts). Text comes in both languages; the
// company's own playbooks are written in whatever language it likes.
import type { Localized, PlanAnchor } from './model';

export interface PlaybookExample {
  key: 'renewal' | 'onboarding' | 'review' | 'close';
  name: Localized;
  description: Localized;
  anchor: PlanAnchor;
  /** Days after the start, or days before the anchor date. */
  steps: { days: number; title: Localized }[];
}

export const PLAYBOOK_EXAMPLES: PlaybookExample[] = [
  {
    key: 'renewal',
    name: { en: 'Renewal', tr: 'Yenileme' },
    description: { en: 'Six months before every renewal, from the health check to the signature.', tr: 'Her yenilemeden altı ay önce: sağlık kontrolünden imzaya.' },
    anchor: 'renewal',
    steps: [
      { days: 180, title: { en: 'Renewal kick-off: review health and usage for {account_name}', tr: 'Yenileme başlangıcı: {account_name} için sağlık ve kullanımı gözden geçir' } },
      { days: 150, title: { en: 'Confirm who decides and who holds the budget', tr: 'Karar vericiyi ve bütçe sahibini netleştir' } },
      { days: 120, title: { en: 'Business review: results so far, goals for next year', tr: 'İş değerlendirmesi: bugüne kadarki sonuçlar, gelecek yılın hedefleri' } },
      { days: 90, title: { en: 'Send the renewal proposal', tr: 'Yenileme teklifini gönder' } },
      { days: 60, title: { en: 'Agree the terms and the price', tr: 'Koşulları ve fiyatı netleştir' } },
      { days: 30, title: { en: 'Get the agreement signed', tr: 'Sözleşmeyi imzalat' } },
      { days: 7, title: { en: 'Close the renewal and share the notes', tr: 'Yenilemeyi kapat, notları paylaş' } },
    ],
  },
  {
    key: 'onboarding',
    name: { en: 'Onboarding', tr: 'Onboarding' },
    description: { en: 'The first sixty days of a new customer.', tr: 'Yeni bir müşterinin ilk altmış günü.' },
    anchor: 'start',
    steps: [
      { days: 0, title: { en: 'Welcome call with {account_name}', tr: '{account_name} ile tanışma görüşmesi' } },
      { days: 3, title: { en: 'Agree goals and a success plan', tr: 'Hedefleri ve başarı planını netleştir' } },
      { days: 7, title: { en: 'Set up the account and invite the users', tr: 'Hesabı kur, kullanıcıları davet et' } },
      { days: 14, title: { en: 'First training session', tr: 'İlk eğitim oturumu' } },
      { days: 30, title: { en: '30-day check-in: is it working?', tr: '30. gün görüşmesi: her şey yolunda mı?' } },
      { days: 60, title: { en: 'Hand over from onboarding to account management', tr: 'Onboarding’den hesap yönetimine devret' } },
    ],
  },
  {
    key: 'review',
    name: { en: 'Business review', tr: 'İş değerlendirmesi' },
    description: { en: 'Two weeks to prepare and hold a business review.', tr: 'Bir iş değerlendirmesini iki haftada hazırla ve yap.' },
    anchor: 'start',
    steps: [
      { days: 0, title: { en: 'Pull the usage and results for {account_name}', tr: '{account_name} için kullanım ve sonuçları topla' } },
      { days: 5, title: { en: 'Draft the review deck', tr: 'Sunum taslağını hazırla' } },
      { days: 10, title: { en: 'Send the agenda to the customer', tr: 'Gündemi müşteriye gönder' } },
      { days: 14, title: { en: 'Hold the review and log it', tr: 'Değerlendirmeyi yap ve kaydet' } },
    ],
  },
  {
    key: 'close',
    name: { en: 'Closing a deal', tr: 'Fırsatı kapatma' },
    description: { en: 'The last month before a deal’s close date.', tr: 'Bir fırsatın kapanış tarihinden önceki son ay.' },
    anchor: 'close',
    steps: [
      { days: 30, title: { en: 'Confirm the decision process and the timeline', tr: 'Karar sürecini ve takvimi netleştir' } },
      { days: 21, title: { en: 'Send the proposal for {record_name}', tr: '{record_name} için teklifi gönder' } },
      { days: 14, title: { en: 'Answer the open questions', tr: 'Açık soruları yanıtla' } },
      { days: 7, title: { en: 'Send the agreement for signature', tr: 'Sözleşmeyi imzaya gönder' } },
      { days: 0, title: { en: 'Close it: won or lost, with the reason', tr: 'Kapat: kazanıldı ya da kaybedildi, nedeniyle' } },
    ],
  },
];
