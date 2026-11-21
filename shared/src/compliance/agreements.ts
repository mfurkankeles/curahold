// The customer contract pack: which documents exist, how each is accepted, its
// version, and the rules for re-acceptance. The texts are the docs pages
// docs/site/<lang>/legal-<slug>.md; their SHA-256 per language is written to
// ./legal-hashes.json by scripts/compliance/legal-pack.ts (a test keeps it
// current), and stored with every acceptance (api/src/lib/agreementEvidence.ts).
//
// LEGAL STATUS: drafts for the lawyer (taslak — avukat onayı gerekli).
import type { Locale } from '../i18n/core';

export type AgreementDocId = 'terms' | 'dpa' | 'sla' | 'aup' | 'order_form';

export interface AgreementDoc {
  slug: string;
  version: string;
  /** click: the administrator ticks and clicks; reference: part of the terms, accepted with them; signature: signed per deal. */
  acceptance: 'click' | 'reference' | 'signature';
  /** A material change needs a new click from an administrator after the notice period. */
  noticeDays: number;
}

/** Bump a version on ANY change to a document's text (every language); a material change also needs a re-acceptance. */
export const AGREEMENT_PACK: Record<AgreementDocId, AgreementDoc> = {
  terms: { slug: 'legal-terms', version: '2026-11-21.draft7', acceptance: 'click', noticeDays: 30 },
  dpa: { slug: 'legal-dpa', version: '2026-11-21.draft3', acceptance: 'click', noticeDays: 30 },
  sla: { slug: 'legal-sla', version: '2026-11-19.draft1', acceptance: 'reference', noticeDays: 30 },
  aup: { slug: 'legal-aup', version: '2026-11-21.draft3', acceptance: 'reference', noticeDays: 30 },
  order_form: { slug: 'legal-order-form', version: '2026-11-19.draft1', acceptance: 'signature', noticeDays: 0 },
};

/** Which document wins when two disagree (terms §"Order of precedence"). */
export const PRECEDENCE: AgreementDocId[] = ['order_form', 'dpa', 'terms', 'sla', 'aup'];

/** The two documents an administrator clicks; SLA and AUP come with the terms by reference. */
export const CLICK_DOCS: AgreementDocId[] = (Object.keys(AGREEMENT_PACK) as AgreementDocId[]).filter((d) => AGREEMENT_PACK[d].acceptance === 'click');

/**
 * The unusual terms summarised next to the acceptance box, as Turkish
 * standard-terms law (TBK arts. 20–25) asks for a clear prior warning, and the
 * box itself. English and Turkish are the reviewed sources; the other languages
 * show the English text until the lawyer has approved a translation.
 */
export interface AcceptanceText {
  heading: string;
  keyTerms: string[];
  authority: string;
  box: string;
  button: string;
  copy: string;
}

export const ACCEPTANCE_TEXT: Partial<Record<Locale, AcceptanceText>> & { en: AcceptanceText } = {
  en: {
    heading: 'Before you start: the key terms',
    keyTerms: [
      'The trial is free, opens after our approval and lasts 3 months by default, within the trial limits (by default 25 full seats and 1 GB of storage a full seat) shown at sign-up and on the Billing page. After it ends the company can still read and export, but not change, its data until it subscribes or leaves.',
      'Paid plans are monthly or yearly and renew automatically: a monthly plan can be ended at the end of any month, a yearly plan stops at the end of its year; prices can change with 30 days’ notice. Refunds follow the Refund policy.',
      'Our total liability is capped at the fees paid in the previous 12 months (a higher cap applies to data-protection breaches; no cap where the law forbids one).',
      'Customer data stays the customer’s. We process it only on the customer’s instructions (DPA); it is not used to train AI models.',
      'Data is hosted in the regions listed on the Sub-processors page; transfers abroad use the safeguards in the DPA.',
      'Governing law and courts: as stated in the terms for the contracting entity; disputes between Turkish companies under Turkish law and the Istanbul courts.',
    ],
    authority: 'I am authorised to accept these terms on behalf of the company.',
    box: 'I have read and accept the Terms of service (with the SLA and the Acceptable use policy) and the Data processing agreement.',
    button: 'Accept and start',
    copy: 'A copy (PDF) of each document, in the version you accepted, is sent to your e-mail address.',
  },
  tr: {
    heading: 'Başlamadan önce: temel koşullar',
    keyTerms: [
      'Deneme ücretsizdir, onayımızdan sonra açılır ve varsayılan olarak 3 ay sürer; kayıt sırasında ve Abonelik sayfasında gösterilen deneme sınırları (varsayılan olarak 25 tam koltuk ve tam koltuk başına 1 GB depolama) içinde kullanılır. Bittiğinde şirket abone olana ya da ayrılana kadar verilerini okuyabilir ve dışa aktarabilir, ancak değiştiremez.',
      'Ücretli planlar aylık ya da yıllıktır ve kendiliğinden yenilenir: aylık plan herhangi bir ayın sonunda sonlandırılabilir, yıllık plan yılının sonunda biter; fiyatlar 30 gün önceden bildirilerek değişebilir. İadeler İade politikasına göre yapılır.',
      'Toplam sorumluluğumuz önceki 12 ayda ödenen bedelle sınırlıdır (kişisel verilerin korunmasına ilişkin ihlallerde daha yüksek bir sınır uygulanır; kanunun yasakladığı hâllerde sınır yoktur).',
      'Müşteri verisi müşterinindir. Yalnızca müşterinin talimatıyla işleriz (VİS); yapay zekâ modellerini eğitmek için kullanılmaz.',
      'Veriler Alt işleyenler sayfasında yazan bölgelerde barındırılır; yurt dışına aktarımlar VİS’teki güvencelerle yapılır.',
      'Uygulanacak hukuk ve mahkemeler: sözleşmeyi yapan şirkete göre koşullarda yazdığı gibi; Türk şirketleri arasındaki uyuşmazlıklarda Türk hukuku ve İstanbul mahkemeleri.',
    ],
    authority: 'Bu koşulları şirket adına kabul etmeye yetkiliyim.',
    box: 'Kullanım koşullarını (SLA ve Kabul edilebilir kullanım politikası ile birlikte) ve Veri işleme sözleşmesini okudum, kabul ediyorum.',
    button: 'Kabul et ve başla',
    copy: 'Kabul ettiğiniz sürümdeki her belgenin bir kopyası (PDF) e-posta adresinize gönderilir.',
  },
};

/** The acceptance statement shown with the agreements, in the reader's language (English when missing). */
export const acceptanceText = (locale: Locale): AcceptanceText => ACCEPTANCE_TEXT[locale] ?? ACCEPTANCE_TEXT.en;

/** The exact words a person clicked, as hashed into agreement_evidence.statement_hash. */
export function acceptanceStatement(locale: Locale): string {
  const t = acceptanceText(locale);
  return [t.heading, ...t.keyTerms, t.authority, t.box, t.button].join('\n');
}
