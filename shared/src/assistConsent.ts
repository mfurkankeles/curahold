// The AI assistant's consent notice (KVKK m.5/1 and m.9, GDPR Art. 6(1)(a)
// and 7): what every chat surface shows before the first question reaches the
// server, and the version the server checks the recorded answer against
// (api/src/assistant/consent.ts, migration 0243).
//
// Bump ASSIST_CONSENT_VERSION with any change to the notice's meaning (the
// words in the dictionaries under `assistConsent.*`, the provider, the
// retention): every person is then asked again, because a "yes" to an older
// notice is no longer a "yes" to what happens now.

/**
 * The notice version a recorded "yes" must match. .2: the Arabic purpose line said "answering on your behalf" and
 * the Hebrew and Persian withdraw lines mixed forms of address; a "yes" to the Arabic wording was not a "yes" to the
 * real purpose, so everyone is asked once more (localisation review, 21 Nov 2026).
 */
export const ASSIST_CONSENT_VERSION = '2026-11-21.2';

/** Where a chat happens: in the app, in the customer portal, or on the public docs and sales site. */
export type AssistConsentSurface = 'app' | 'portal' | 'docs' | 'site';

/** A person's current answer: true (accepted this version), false (declined or withdrew), null (not asked yet, or asked about an older version). */
export interface AssistConsentState {
  version: string;
  granted: boolean | null;
  at: string | null;
}

/** The dictionary keys of the notice, in the order they are shown. */
export const ASSIST_CONSENT_LINES = ['assistConsent.what', 'assistConsent.why', 'assistConsent.keep', 'assistConsent.withdraw'] as const;
