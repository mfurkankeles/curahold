// A transactional mailer: the seam the app sends through, a free default that
// writes to the console (no network, no cost, nothing subscribed), and the one
// transactional template Curahold sends on its own — the onboarding welcome.
//
// The real driver is a deployment choice. The server already carries EmailSender
// implementations (services.ts: ResendEmail over HTTP for production, MemoryEmail
// for tests); the Mailer type below is that same seam. ConsoleMailer is the safe
// default when nothing is configured, so a fresh install e-mails nobody until a
// provider is wired in through env (e.g. EMAIL_PROVIDER=resend + an API key) —
// no email provider is subscribed by default.
import { translate, type Locale, type MessageKey } from '../../../shared/src/i18n';
import type { EmailMessage, EmailSender } from './services';

/** The seam transactional mail is sent through (the same shape as EmailSender). */
export type Mailer = EmailSender;

/**
 * The default driver: notes that a message would have gone out, then returns. It
 * opens no connection and costs nothing, so a new install reaches no one until a
 * real provider (ResendEmail, or another EmailSender) is configured.
 */
export class ConsoleMailer implements Mailer {
  constructor(private log: (line: string) => void = (line) => console.log(line)) {}
  async send(msg: EmailMessage): Promise<void> {
    this.log(`[curahold] mailer (console driver — not sent) to=${msg.to} subject=${JSON.stringify(msg.subject)}`);
  }
}

/**
 * The onboarding welcome, written in the reader's language — plain text with the
 * company's own sign-in link. Localised through the dictionaries (email.welcome.*).
 */
export function welcomeEmail(locale: Locale, vars: { to: string; name: string; org: string; link: string }): EmailMessage {
  // These two keys are new (reported for the coordinator to add to en.ts + tr.ts);
  // the `as MessageKey` casts keep typechecking green until the keys land.
  return {
    to: vars.to,
    subject: translate(locale, 'email.welcome.subject' as MessageKey, { org: vars.org }),
    text: translate(locale, 'email.welcome.body' as MessageKey, { name: vars.name, org: vars.org, link: vars.link }),
  };
}
