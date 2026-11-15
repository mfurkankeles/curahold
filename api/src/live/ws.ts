// A WebSocket on Node without a library: the opening handshake and the frames
// (RFC 6455) — enough for short text messages both ways, which is all the live
// channel sends. No extensions (no compression), no binary, nothing larger than
// MAX_FRAME; anything else closes the connection. Tested by tests/live-node.test.ts
// against Node's own WebSocket client (the browser's, in effect).
import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
/** Largest message accepted from a browser. */
export const MAX_FRAME = 16 * 1024;

export interface NodeSocket {
  send(text: string): void;
  close(code: number, reason?: string): void;
  /** Milliseconds since the last thing heard (a message, a ping). */
  quietFor(): number;
}

export interface SocketHandlers {
  message(text: string): void;
  close(): void;
}

function frame(opcode: number, payload: Buffer): Buffer {
  const len = payload.length;
  const head = len < 126 ? Buffer.alloc(2) : len < 65536 ? Buffer.alloc(4) : Buffer.alloc(10);
  head[0] = 0x80 | opcode;
  if (len < 126) head[1] = len;
  else if (len < 65536) {
    head[1] = 126;
    head.writeUInt16BE(len, 2);
  } else {
    head[1] = 127;
    head.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([head, payload]);
}

/** Refuse an upgrade before it happens (wrong address, not a WebSocket). */
export function refuse(socket: Duplex, status: number, text: string) {
  socket.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

/** Complete the handshake and speak WebSocket on this socket; null (and the socket refused) if it is not a proper request. */
export function accept(req: IncomingMessage, socket: Duplex, head: Buffer, on: SocketHandlers): NodeSocket | null {
  const key = req.headers['sec-websocket-key'];
  if (
    req.method !== 'GET' ||
    String(req.headers.upgrade).toLowerCase() !== 'websocket' ||
    req.headers['sec-websocket-version'] !== '13' ||
    typeof key !== 'string' ||
    !/^[A-Za-z0-9+/]{22}==$/.test(key)
  ) {
    refuse(socket, 400, 'Bad Request');
    return null;
  }
  const acceptKey = createHash('sha1')
    .update(key + GUID)
    .digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${acceptKey}\r\n\r\n`);
  const s = socket as Duplex & { setNoDelay?: (b: boolean) => void; setTimeout?: (ms: number) => void };
  s.setNoDelay?.(true);
  s.setTimeout?.(0);

  let buf: Buffer = head.length ? Buffer.from(head) : Buffer.alloc(0);
  let parts: Buffer[] = [];
  let partsLen = 0;
  let closed = false;
  let heard = Date.now();

  const shut = (code: number, reason = '') => {
    if (closed) return;
    closed = true;
    const r = Buffer.from(reason.slice(0, 120));
    const p = Buffer.alloc(2 + r.length);
    p.writeUInt16BE(code, 0);
    r.copy(p, 2);
    try {
      socket.end(frame(0x8, p));
    } catch {
      socket.destroy();
    }
    // A peer that never answers the close is not waited for.
    setTimeout(() => socket.destroy(), 2000).unref?.();
    on.close();
  };

  const read = () => {
    while (!closed) {
      if (buf.length < 2) return;
      const fin = (buf[0] & 0x80) !== 0;
      const rsv = buf[0] & 0x70;
      const op = buf[0] & 0x0f;
      const masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f;
      let at = 2;
      if (len === 126) {
        if (buf.length < 4) return;
        len = buf.readUInt16BE(2);
        at = 4;
      } else if (len === 127) {
        if (buf.length < 10) return;
        const big = buf.readBigUInt64BE(2);
        if (big > BigInt(MAX_FRAME)) return shut(1009, 'too big');
        len = Number(big);
        at = 10;
      }
      // Browsers always mask; no extension was agreed, so no reserved bits.
      if (!masked || rsv) return shut(1002, 'protocol');
      if (len > MAX_FRAME || partsLen + len > MAX_FRAME) return shut(1009, 'too big');
      if (buf.length < at + 4 + len) return;
      const mask = buf.subarray(at, at + 4);
      const data = Buffer.from(buf.subarray(at + 4, at + 4 + len));
      for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
      buf = buf.subarray(at + 4 + len);
      heard = Date.now();
      if (op === 0x8) return shut(1000);
      if (op === 0x9) {
        if (len > 125) return shut(1002, 'protocol');
        socket.write(frame(0xa, data));
        continue;
      }
      if (op === 0xa) continue;
      if (op === 0x2) return shut(1003, 'text only');
      if (op === 0x1 || op === 0x0) {
        if (op === 0x1 && parts.length) return shut(1002, 'protocol');
        if (op === 0x0 && !parts.length) return shut(1002, 'protocol');
        parts.push(data);
        partsLen += data.length;
        if (!fin) continue;
        const text = Buffer.concat(parts).toString('utf8');
        parts = [];
        partsLen = 0;
        on.message(text);
        continue;
      }
      return shut(1002, 'protocol');
    }
  };

  socket.on('data', (chunk: Buffer) => {
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
    if (buf.length > MAX_FRAME + 64) {
      // More than one frame's worth unread: read() takes what it can; a flood is cut off.
      read();
      if (buf.length > MAX_FRAME + 64) shut(1009, 'too big');
      return;
    }
    read();
  });
  const gone = () => {
    if (closed) return;
    closed = true;
    on.close();
  };
  socket.on('close', gone);
  socket.on('error', gone);
  if (buf.length) queueMicrotask(read);

  return {
    send(text) {
      if (!closed) socket.write(frame(0x1, Buffer.from(text, 'utf8')));
    },
    close: shut,
    quietFor: () => Date.now() - heard,
  };
}
