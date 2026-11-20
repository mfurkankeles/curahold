// Outside services behind small interfaces, so tests run without a network
// and a self-hosted install can swap providers.

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Where an answer to this message should go, when not back to the sender. */
  replyTo?: string;
  /** Extra headers: Message-ID, In-Reply-To and References keep a conversation in one thread. */
  headers?: Record<string, string>;
}

/**
 * Mail that could not be sent: the server refused the sign-in, the sender or the recipient, was busy, or could not be
 * reached. Every sender throws this, so the app answers the person with one plain sentence (errors.mail_unavailable)
 * while the reason, which may name the mail server's settings, goes only to the operator's error log.
 */
export class MailError extends Error {
  constructor(
    message: string,
    /** Worth one more try soon (a 4xx reply, a rate limit, a connection that dropped). */
    readonly transient = false,
  ) {
    super(message);
    this.name = 'MailError';
  }
}

export interface EmailSender {
  send(msg: EmailMessage): Promise<void>;
  /** false: mail is kept or printed, not delivered (setup health tells the install's owner). */
  readonly delivers?: boolean;
}

/** Keeps messages in memory (tests, local development). */
export class MemoryEmail implements EmailSender {
  readonly delivers = false;
  sent: EmailMessage[] = [];
  async send(msg: EmailMessage) {
    this.sent.push(msg);
  }
  last(to?: string) {
    const list = to ? this.sent.filter((m) => m.to === to) : this.sent;
    return list[list.length - 1];
  }
}

/** Resend's HTTP API — one of the sub-processors listed in the DPA. */
export class ResendEmail implements EmailSender {
  constructor(
    private apiKey: string,
    private from: string,
    private fetchFn: typeof fetch = fetch,
  ) {}
  async send(msg: EmailMessage) {
    const res = await this.fetchFn('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: this.from, to: [msg.to], subject: msg.subject, text: msg.text, ...(msg.html ? { html: msg.html } : {}), ...(msg.replyTo ? { reply_to: msg.replyTo } : {}), ...(msg.headers ? { headers: msg.headers } : {}) }),
    });
    if (!res.ok) throw new MailError(`email provider answered ${res.status}`, res.status === 429 || res.status >= 500);
  }
}

export interface Storage {
  put(key: string, data: ArrayBuffer, mime: string): Promise<void>;
  get(key: string): Promise<{ data: ArrayBuffer; mime: string } | null>;
  delete(key: string): Promise<void>;
}

/** File storage in memory, for tests and the demo. */
export class MemoryStorage implements Storage {
  private items = new Map<string, { data: ArrayBuffer; mime: string }>();
  async put(key: string, data: ArrayBuffer, mime: string) {
    this.items.set(key, { data, mime });
  }
  async get(key: string) {
    return this.items.get(key) ?? null;
  }
  async delete(key: string) {
    this.items.delete(key);
  }
  has(key: string) {
    return this.items.has(key);
  }
}

/** Cloudflare R2 bucket binding. */
export interface R2Like {
  put(key: string, value: ArrayBuffer, opts?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer>; httpMetadata?: { contentType?: string } } | null>;
  delete(key: string): Promise<void>;
}

/** File storage on Cloudflare R2 (production). */
export class R2Storage implements Storage {
  constructor(private bucket: R2Like) {}
  async put(key: string, data: ArrayBuffer, mime: string) {
    await this.bucket.put(key, data, { httpMetadata: { contentType: mime } });
  }
  async get(key: string) {
    const obj = await this.bucket.get(key);
    if (!obj) return null;
    return { data: await obj.arrayBuffer(), mime: obj.httpMetadata?.contentType ?? 'application/octet-stream' };
  }
  async delete(key: string) {
    await this.bucket.delete(key);
  }
}
