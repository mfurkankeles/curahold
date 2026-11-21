// A request for a free trial, sent from the sales site's form and decided by
// the platform owner in the owner console (Requests). The form (site + its
// public route) writes a request through api/src/lib/trialRequests.ts
// `insertTrialRequest`; the console reads, contacts, approves or rejects it.
// Approving creates the company with the departments chosen, invites its
// first administrator, and starts a trial with a seat cap and an end date.

import { CATALOGUE } from './billing';

/** 'success' is Customer Success together with technical support; every department is optional. */
export const TRIAL_DEPARTMENTS = ['insideSales', 'sales', 'onboarding', 'success', 'product', 'finance'] as const;
export type TrialDepartment = (typeof TRIAL_DEPARTMENTS)[number];

export const TRIAL_REQUEST_STATUSES = ['new', 'contacted', 'approved', 'rejected'] as const;
export type TrialRequestStatus = (typeof TRIAL_REQUEST_STATUSES)[number];

/** Defaults the owner can change in the console (Requests → settings); seats and months come from the price list (shared/src/plans.json → trial). */
export const TRIAL_DEFAULTS = {
  seatCap: CATALOGUE.trial.autoApproveSeats,
  months: CATALOGUE.trial.months,
  reminderDays: [14, 7, 1],
  /** File space per full seat during the trial (plans.json trial.caps), shown on the request form. */
  storageGbPerSeat: CATALOGUE.trial.caps.storageGbPerSeat ?? null,
} as const;

/** One consent the person gave (or did not), as shown to them: which text, which version, its digest. */
export interface TrialConsent {
  /** e.g. "notice" (privacy notice, always shown), "processing", "marketing", "transfer", "iys". */
  key: string;
  version: string;
  /** sha-256 of the exact text shown. */
  hash: string;
  granted: boolean;
}

/** What the form sends (after the email code was right). Everything optional is null when not given. */
export interface TrialRequestInput {
  name: string;
  email: string;
  /** When the work address was proven with a code; the form must not send unverified requests. */
  emailVerifiedAt: string;
  /** Why a personal (free-mail) address was used; the form asks only then. The console flags it. */
  freeMailNote: string | null;
  phone: string | null;
  title: string | null;
  linkedinUrl: string | null;
  company: string;
  website: string | null;
  /** ISO 3166-1 alpha-2, upper case. */
  country: string;
  city: string | null;
  industry: string | null;
  /** A size band, e.g. "1-10", "11-50", "51-200", "201-1000", "1000+". */
  companySize: string | null;
  /** How many people will use it. */
  teamSize: number | null;
  /** Seats asked for in total, and optionally per department. */
  seats: number | null;
  seatsByDepartment: Partial<Record<TrialDepartment, number>>;
  departments: TrialDepartment[];
  /** Short keys of the problems picked, plus their own words. */
  problems: string[];
  problemText: string | null;
  /** Tools in use today, by kind: free text names (feeds the integration roadmap). */
  tools: { crm?: string[]; tasks?: string[]; accounting?: string[]; bi?: string[]; other?: string | null };
  customersManaged: string | null;
  timeline: string | null;
  heardFrom: string | null;
  /** One of the eleven locales. */
  language: string;
  contactTime: string | null;
  /** Which site / variant the form was on, e.g. "site", "site-a". */
  source: string | null;
  utm: Record<string, string>;
  consents: TrialConsent[];
  /** Separate, optional permission for marketing messages. */
  marketing: boolean;
  /** Country of the sender's IP when the consent was given (two letters), when known. */
  ipCountry: string | null;
}

/** A request as the console lists it. */
export interface TrialRequestRow {
  id: string;
  ref: string;
  status: TrialRequestStatus;
  name: string;
  email: string;
  company: string;
  country: string;
  departments: TrialDepartment[];
  seats: number | null;
  createdAt: string;
  /** Another request from the same address, the same email domain (not a public mail service) or the same company name. */
  duplicateOf: string | null;
}

/** A request with everything on it, and what was decided. */
export interface TrialRequestDetail extends TrialRequestRow, Omit<TrialRequestInput, 'name' | 'email' | 'company' | 'country' | 'departments' | 'seats'> {
  contactedAt: string | null;
  decidedAt: string | null;
  decidedBy: string | null;
  seatCap: number | null;
  trialEndsAt: string | null;
  orgId: string | null;
  orgSlug: string | null;
  rejectReason: string | null;
  /** The polite answer prepared on rejection (sent only by the owner, from his own mail). */
  replyDraft: string | null;
  note: string | null;
  /** Other requests that look like the same company. */
  duplicates: { id: string; ref: string; status: TrialRequestStatus; company: string; email: string }[];
}
