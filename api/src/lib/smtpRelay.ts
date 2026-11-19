// Product e-mail through the Google Workspace SMTP relay (smtp-relay.gmail.com),
// for the hosted service on Cloudflare Workers — the owner's choice: our own mail
// and the product's mail both stay on Google Workspace, with no extra service.
//
// Workers have no nodemailer; they have raw TCP sockets (cloudflare:sockets)
// with STARTTLS. This file speaks the few SMTP commands a relay needs over any
// socket that implements SmtpSocket: EHLO → STARTTLS → EHLO → AUTH PLAIN →
// MAIL FROM → RCPT TO → DATA → QUIT. Authentication uses a Workspace user and an
// app password ("Require SMTP Authentication" in the relay settings), because a
// Worker has no fixed address to allow-list. Self-hosted installs use SMTP_URL
// with nodemailer instead (api/src/selfhost.ts) — same relay, same settings.
//
// Configuration (wrangler secrets / vars), docs: help centre "Product e-mail through Google Workspace":
//   EMAIL_PROVIDER      google_relay (default when SMTP_RELAY_USER is set) | resend | console
//   SMTP_RELAY_HOST     smtp-relay.gmail.com
//   SMTP_RELAY_PORT     587 (STARTTLS; port 25 is blocked on Workers)
//   SMTP_RELAY_USER     the sending Workspace user, e.g. no-reply@<domain>
//   SMTP_RELAY_PASSWORD that user's app password
//   EMAIL_FROM          Curahold <no-reply@<domain>>
//
// Limits to watch: the relay accepts up to 10,000 recipients per user per day
// (Google's published limit as known 19 Nov 2026 — check the admin help page).
// When daily sending nears it, or deliverability drops, a dedicated sending
// service becomes necessary (owner decision; Resend is already wired).
import type { EmailMessage, EmailSender } from './services';

export interface SmtpSocket {
  /** Next chunk of text from the server; null when closed. */
  read(): Promise<string | null>;
  write(text: string): Promise<void>;
  /** Upgrades the connection to TLS and returns the secured socket. */
  startTls(): Promise<SmtpSocket>;
  close(): Promise<void>;
}

export type SocketOpener = (host: string, port: number) => Promise<SmtpSocket>;

export interface RelayOptions {
  host: string;
  port: number;
  user: string;
  password: string;
  /** "Name <address>" or an address. */
  from: string;
  /** The name said in EHLO (the sending domain). */
  helo: string;
}

const CRLF = '\r\n';
const b64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};
const wrap = (s: string) => s.replace(/.{1,76}/g, (m) => m + CRLF).trimEnd();
/** RFC 2047 encoded word when a header holds anything beyond ASCII. */
const header = (v: string) => (/^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${b64(v)}?=`);
const addressOf = (v: string) => /<([^>]+)>/.exec(v)?.[1] ?? v.trim();
const clean = (v: string) => v.replace(/[\r\n]+/g, ' ');

function fromHeader(from: string): string {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
  return m && m[1] ? `${header(m[1].replace(/^"|"$/g, ''))} <${m[2]}>` : from;
}

/** The whole message, headers and body, with dot-stuffing done. */
export function buildMessage(msg: EmailMessage, from: string, now: Date = new Date(), id = crypto.randomUUID()): string {
  const domain = addressOf(from).split('@')[1] ?? 'localhost';
  const extra = Object.entries(msg.headers ?? {}).filter(([k]) => /^[A-Za-z0-9-]+$/.test(k));
  const hasId = extra.some(([k]) => k.toLowerCase() === 'message-id');
  const lines = [
    `From: ${fromHeader(clean(from))}`,
    `To: ${clean(msg.to)}`,
    `Subject: ${header(clean(msg.subject))}`,
    `Date: ${now.toUTCString().replace('GMT', '+0000')}`,
    ...(hasId ? [] : [`Message-ID: <${id}@${domain}>`]),
    ...(msg.replyTo ? [`Reply-To: ${clean(msg.replyTo)}`] : []),
    ...extra.map(([k, v]) => `${k}: ${clean(v)}`),
    'MIME-Version: 1.0',
  ];
  const part = (type: string, body: string) => [`Content-Type: ${type}; charset=UTF-8`, 'Content-Transfer-Encoding: base64', '', wrap(b64(body))].join(CRLF);
  let body: string;
  if (msg.html) {
    const boundary = `=_cura_${id.replace(/-/g, '')}`;
    lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    body = ['', `--${boundary}`, part('text/plain', msg.text), `--${boundary}`, part('text/html', msg.html), `--${boundary}--`, ''].join(CRLF);
    return [...lines, body].join(CRLF).replace(/\r\n\./g, '\r\n..');
  }
  return [...lines, part('text/plain', msg.text)].join(CRLF).replace(/\r\n\./g, '\r\n..');
}

class Reader {
  private buf = '';
  constructor(private s: SmtpSocket) {}
  /** One full reply (multi-line replies end with "NNN "). */
  async reply(): Promise<{ code: number; text: string }> {
    for (;;) {
      const lines = this.buf.split(CRLF);
      for (let i = 0; i < lines.length - 1; i++) {
        if (/^\d{3} /.test(lines[i]!) || /^\d{3}$/.test(lines[i]!)) {
          const text = lines.slice(0, i + 1).join('\n');
          this.buf = lines.slice(i + 1).join(CRLF);
          return { code: Number(lines[i]!.slice(0, 3)), text };
        }
      }
      const chunk = await this.s.read();
      if (chunk == null) throw new Error('smtp: connection closed');
      this.buf += chunk;
    }
  }
  swap(s: SmtpSocket) {
    this.s = s;
    this.buf = '';
  }
}

export class SmtpRelayEmail implements EmailSender {
  constructor(
    private o: RelayOptions,
    private open: SocketOpener,
  ) {}

  async send(msg: EmailMessage): Promise<void> {
    let sock = await this.open(this.o.host, this.o.port);
    const r = new Reader(sock);
    const expect = async (ok: number[], step: string) => {
      const res = await r.reply();
      if (!ok.includes(res.code)) throw new Error(`smtp ${step}: ${res.text.slice(0, 200)}`);
      return res;
    };
    const say = (line: string) => sock.write(line + CRLF);
    try {
      await expect([220], 'greeting');
      await say(`EHLO ${this.o.helo}`);
      const ehlo = await expect([250], 'ehlo');
      if (!/STARTTLS/i.test(ehlo.text)) throw new Error('smtp: the server does not offer STARTTLS');
      await say('STARTTLS');
      await expect([220], 'starttls');
      sock = await sock.startTls();
      r.swap(sock);
      await say(`EHLO ${this.o.helo}`);
      await expect([250], 'ehlo (tls)');
      await say(`AUTH PLAIN ${b64(`\u0000${this.o.user}\u0000${this.o.password}`)}`);
      await expect([235], 'auth');
      await say(`MAIL FROM:<${addressOf(this.o.from)}>`);
      await expect([250], 'mail from');
      await say(`RCPT TO:<${addressOf(msg.to)}>`);
      await expect([250, 251], 'rcpt to');
      await say('DATA');
      await expect([354], 'data');
      await sock.write(buildMessage(msg, this.o.from) + `${CRLF}.${CRLF}`);
      await expect([250], 'message');
      await say('QUIT');
      await r.reply().catch(() => undefined);
    } finally {
      await sock.close().catch(() => undefined);
    }
  }
}

/** The Workers socket (cloudflare:sockets), adapted to SmtpSocket. Only callable inside a Worker. */
export const workerSockets: SocketOpener = async (host, port) => {
  // @ts-expect-error — a module of the Workers runtime, not of Node.
  const { connect } = (await import('cloudflare:sockets')) as { connect: (a: { hostname: string; port: number }, o: { secureTransport: 'starttls' }) => WorkerSocket };
  return adapt(connect({ hostname: host, port }, { secureTransport: 'starttls' }));
};

interface WorkerSocket {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  startTls(): WorkerSocket;
  close(): Promise<void>;
}

function adapt(s: WorkerSocket): SmtpSocket {
  const reader = s.readable.getReader();
  const writer = s.writable.getWriter();
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  return {
    read: async () => {
      const { value, done } = await reader.read();
      return done ? null : dec.decode(value, { stream: true });
    },
    write: (t) => writer.write(enc.encode(t)),
    startTls: async () => {
      reader.releaseLock();
      writer.releaseLock();
      return adapt(s.startTls());
    },
    close: () => s.close(),
  };
}

export interface MailEnv {
  EMAIL_PROVIDER?: string;
  SMTP_RELAY_HOST?: string;
  SMTP_RELAY_PORT?: string;
  SMTP_RELAY_USER?: string;
  SMTP_RELAY_PASSWORD?: string;
  EMAIL_FROM?: string;
  RESEND_API_KEY?: string;
}

/** Which mail path a Worker uses: the Google relay when it is configured, Resend when chosen or only it is set, else none. */
export function mailProvider(env: MailEnv): 'google_relay' | 'resend' | 'console' {
  const p = (env.EMAIL_PROVIDER ?? '').trim();
  if (p === 'google_relay' || p === 'resend' || p === 'console') return p;
  if (env.SMTP_RELAY_USER && env.SMTP_RELAY_PASSWORD) return 'google_relay';
  if (env.RESEND_API_KEY) return 'resend';
  return 'console';
}

export function relayOptions(env: MailEnv): RelayOptions {
  const from = env.EMAIL_FROM || `Curahold <${env.SMTP_RELAY_USER}>`;
  return {
    host: env.SMTP_RELAY_HOST || 'smtp-relay.gmail.com',
    port: Number(env.SMTP_RELAY_PORT || 587),
    user: env.SMTP_RELAY_USER ?? '',
    password: env.SMTP_RELAY_PASSWORD ?? '',
    from,
    helo: addressOf(from).split('@')[1] ?? 'localhost',
  };
}
