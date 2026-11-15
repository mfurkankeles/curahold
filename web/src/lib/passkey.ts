// Passkeys in the browser (WebAuthn), for signing in, the second step,
// confirming it is you, and adding one in Sign-in security.
import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { post } from './api';
import { deviceLabel, getDeviceId } from './device';

const DEMO = import.meta.env.APP_DEMO === true;

/** Passkeys work here (not in the demo, which has no server to check them). */
export const passkeysHere = () => !DEMO && typeof window !== 'undefined' && browserSupportsWebAuthn();

type Options = { challengeId: string; options: any };

/** Asks the browser for a passkey answer to these options; null when the person cancels. */
export async function passkeyAnswer(o: Options) {
  const response = await startAuthentication({ optionsJSON: o.options }).catch(() => null);
  return response ? { challengeId: o.challengeId, response } : null;
}

/** Signs in with a passkey alone. False when the person cancelled. */
export async function signInWithPasskey(): Promise<boolean> {
  const o = await post<Options>('/auth/passkey/options', {});
  const a = await passkeyAnswer(o);
  if (!a) return false;
  await post('/auth/passkey', { ...a, deviceId: getDeviceId(), deviceLabel: deviceLabel() });
  return true;
}

/** Adds a passkey to the signed-in person. False when the person cancelled. */
export async function addPasskey(): Promise<boolean> {
  const o = await post<Options>('/me/security/passkeys/options', {});
  const response = await startRegistration({ optionsJSON: o.options }).catch(() => null);
  if (!response) return false;
  await post('/me/security/passkeys', { challengeId: o.challengeId, response, name: deviceLabel() || undefined });
  return true;
}
