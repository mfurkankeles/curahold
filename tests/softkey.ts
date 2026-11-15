// A software passkey for tests: makes real WebAuthn registration and sign-in
// answers (P-256, "none" attestation, user verified), so the server's checks run
// exactly as they do for a phone or a laptop.
import { createHash, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { isoCBOR } from '@simplewebauthn/server/helpers';

const b64u = (b: Uint8Array | Buffer) => Buffer.from(b).toString('base64url');
const sha = (b: Uint8Array | string) => createHash('sha256').update(b).digest();

export class SoftKey {
  private priv: KeyObject;
  private pubXY: { x: Buffer; y: Buffer };
  readonly credId = Buffer.from(Array.from({ length: 16 }, (_, i) => (i * 37 + Date.now()) & 255));
  private counter = 0;
  constructor(
    public rpId: string,
    public origin = `https://${rpId}`,
  ) {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    this.priv = privateKey;
    const jwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string };
    this.pubXY = { x: Buffer.from(jwk.x, 'base64url'), y: Buffer.from(jwk.y, 'base64url') };
  }
  get id() {
    return b64u(this.credId);
  }

  /** The answer to registration options. */
  register(options: { challenge: string }, origin = this.origin) {
    const cose = new Map<number, number | Uint8Array>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, new Uint8Array(this.pubXY.x)],
      [-3, new Uint8Array(this.pubXY.y)],
    ]);
    const len = Buffer.alloc(2);
    len.writeUInt16BE(this.credId.length);
    const authData = Buffer.concat([sha(this.rpId), Buffer.from([0x45]), Buffer.alloc(4), Buffer.alloc(16), len, this.credId, Buffer.from(isoCBOR.encode(cose as any))]);
    const att = isoCBOR.encode(new Map<string, unknown>([['fmt', 'none'], ['attStmt', new Map()], ['authData', new Uint8Array(authData)]]) as any);
    const clientData = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: options.challenge, origin, crossOrigin: false }));
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key',
      response: { clientDataJSON: b64u(clientData), attestationObject: b64u(att), transports: ['internal'] },
      clientExtensionResults: {},
    };
  }

  /** The answer to sign-in (authentication) options. */
  assert(options: { challenge: string }, origin = this.origin) {
    this.counter++;
    const c = Buffer.alloc(4);
    c.writeUInt32BE(this.counter);
    const authData = Buffer.concat([sha(this.rpId), Buffer.from([0x05]), c]);
    const clientData = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: options.challenge, origin, crossOrigin: false }));
    const signature = sign('sha256', Buffer.concat([authData, sha(clientData)]), this.priv);
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key',
      response: { clientDataJSON: b64u(clientData), authenticatorData: b64u(authData), signature: b64u(signature) },
      clientExtensionResults: {},
    };
  }
}
