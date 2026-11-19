// Product e-mail through the Google Workspace SMTP relay (api/src/lib/smtpRelay.ts):
// the SMTP dialog against a scripted relay, the message format, and which mail
// path a Worker picks from its settings.
import { describe, expect, it } from 'vitest';
import { SmtpRelayEmail, buildMessage, mailProvider, relayOptions, type SmtpSocket } from '../api/src/lib/smtpRelay';

/** A relay that answers like smtp-relay.gmail.com and records what it was told. */
function fakeRelay(opts: { auth?: number; tls?: boolean } = {}) {
  const said: string[] = [];
  let data = '';
  let inData = false;
  let tls = false;
  const queue: string[] = ['220 smtp-relay.gmail.com ESMTP ready\r\n'];
  const answer = (line: string) => {
    if (inData) {
      data += line + '\r\n';
      if (line === '.') {
        inData = false;
        queue.push('250 2.0.0 OK queued\r\n');
      }
      return;
    }
    said.push(line.startsWith('AUTH') ? 'AUTH ***' : line);
    if (line.startsWith('EHLO')) queue.push(`250-smtp-relay.gmail.com\r\n${opts.tls === false || tls ? '' : '250-STARTTLS\r\n'}250 AUTH PLAIN LOGIN\r\n`);
    else if (line === 'STARTTLS') queue.push('220 2.0.0 Ready to start TLS\r\n');
    else if (line.startsWith('AUTH PLAIN')) queue.push(`${opts.auth ?? 235} auth\r\n`);
    else if (line.startsWith('MAIL FROM') || line.startsWith('RCPT TO')) queue.push('250 OK\r\n');
    else if (line === 'DATA') {
      inData = true;
      queue.push('354 Go ahead\r\n');
    } else if (line === 'QUIT') queue.push('221 bye\r\n');
  };
  let pending = '';
  const socket = (): SmtpSocket => ({
    read: async () => queue.shift() ?? null,
    write: async (t) => {
      pending += t;
      const lines = pending.split('\r\n');
      pending = lines.pop()!;
      lines.forEach(answer);
    },
    startTls: async () => {
      tls = true;
      return socket();
    },
    close: async () => undefined,
  });
  return { open: async () => socket(), said, data: () => data, tls: () => tls };
}

const options = relayOptions({ SMTP_RELAY_USER: 'no-reply@example.com', SMTP_RELAY_PASSWORD: 'app-password', EMAIL_FROM: 'Curahold <no-reply@example.com>' });

describe('Google Workspace SMTP relay', () => {
  it('speaks STARTTLS, authenticates, and delivers one message', async () => {
    const relay = fakeRelay();
    await new SmtpRelayEmail(options, relay.open).send({ to: 'Ada <ada@example.org>', subject: 'Giriş bağlantınız', text: 'Merhaba.\n.dot line' });
    expect(relay.tls()).toBe(true);
    expect(relay.said).toEqual(['EHLO example.com', 'STARTTLS', 'EHLO example.com', 'AUTH ***', 'MAIL FROM:<no-reply@example.com>', 'RCPT TO:<ada@example.org>', 'DATA', 'QUIT']);
    expect(relay.data()).toMatch(/Subject: =\?UTF-8\?B\?/);
    expect(relay.data().endsWith('\r\n.\r\n')).toBe(true);
  });

  it('refuses to send without TLS and reports a failed sign-in', async () => {
    await expect(new SmtpRelayEmail(options, fakeRelay({ tls: false }).open).send({ to: 'a@example.org', subject: 's', text: 't' })).rejects.toThrow(/STARTTLS/);
    await expect(new SmtpRelayEmail(options, fakeRelay({ auth: 535 }).open).send({ to: 'a@example.org', subject: 's', text: 't' })).rejects.toThrow(/auth/);
  });

  it('builds a MIME message with both parts, its own Message-ID and the thread headers it is given', () => {
    const m = buildMessage({ to: 'a@example.org', subject: 'Hi', text: 'plain', html: '<p>html</p>', replyTo: 'support@example.com', headers: { 'In-Reply-To': '<x@y>' } }, 'Curahold <no-reply@example.com>', new Date('2026-11-19T10:00:00Z'), '11111111-2222-4333-8444-555555555555');
    expect(m).toContain('Message-ID: <11111111-2222-4333-8444-555555555555@example.com>');
    expect(m).toContain('In-Reply-To: <x@y>');
    expect(m).toContain('Reply-To: support@example.com');
    expect(m).toContain('multipart/alternative');
    expect(m.match(/Content-Transfer-Encoding: base64/g)!.length).toBe(2);
  });

  it('picks the relay when it is configured, Resend when chosen or alone, else the log', () => {
    expect(mailProvider({ SMTP_RELAY_USER: 'u', SMTP_RELAY_PASSWORD: 'p', RESEND_API_KEY: 'k' })).toBe('google_relay');
    expect(mailProvider({ EMAIL_PROVIDER: 'resend', SMTP_RELAY_USER: 'u', SMTP_RELAY_PASSWORD: 'p' })).toBe('resend');
    expect(mailProvider({ RESEND_API_KEY: 'k' })).toBe('resend');
    expect(mailProvider({})).toBe('console');
    expect(options).toMatchObject({ host: 'smtp-relay.gmail.com', port: 587, helo: 'example.com' });
  });
});
