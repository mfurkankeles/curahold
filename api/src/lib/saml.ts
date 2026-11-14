// SAML 2.0 SP-initiated login, on top of @node-saml/node-saml — a maintained,
// security-reviewed XML-DSig / SAML implementation. We do NOT hand-roll XML
// canonicalization or signature checking: getting those wrong is the classic
// source of SAML vulnerabilities (signature wrapping, comment injection). The
// library is configured strictly:
//   * wantAssertionsSigned — an unsigned assertion is rejected.
//   * idpCert — the signature must verify against THIS company's configured
//     certificate, so an assertion signed by another company's IdP fails. This
//     is the backbone of cross-company isolation for SAML.
//   * audience — the assertion must be addressed to this company's SP entityID.
//   * the library enforces the assertion's NotBefore / NotOnOrAfter conditions,
//     with a small accepted clock skew.
// Replay (one-time use of an assertion) is handled by the caller via
// claimAssertion() in lib/sso.ts, keyed on a hash of the signed assertion.
import { SAML, ValidateInResponseTo, generateServiceProviderMetadata } from '@node-saml/node-saml';
import type { Config } from '../context';
import { acsUrl, spEntityId, type SsoAuthConfig } from './sso';

/** Build a strict SAML verifier/initiator for one company's configured IdP. */
export function makeSaml(cfg: Config, slug: string, config: Pick<SsoAuthConfig, 'ssoUrl' | 'issuer' | 'cert'>): SAML {
  if (!config.cert) throw new Error('saml: no idp certificate configured');
  return new SAML({
    entryPoint: config.ssoUrl ?? undefined,
    issuer: spEntityId(cfg, slug),
    callbackUrl: acsUrl(cfg, slug),
    idpCert: config.cert,
    // The Response/Assertion Issuer must be the configured IdP entityID.
    idpIssuer: config.issuer ?? undefined,
    // The assertion must be addressed to us.
    audience: spEntityId(cfg, slug),
    // An unsigned assertion is refused; the assertion signature is the trust anchor.
    wantAssertionsSigned: true,
    // IdPs commonly sign only the assertion, not the whole response; the signed
    // assertion is what we trust, so we do not also require a response signature.
    wantAuthnResponseSigned: false,
    // We bind the round-trip with our own signed RelayState (and a per-company
    // cert), and run statelessly, so we do not keep an InResponseTo cache.
    validateInResponseTo: ValidateInResponseTo.never,
    acceptedClockSkewMs: 60_000,
    // Accept whatever NameID format the IdP sends (emailAddress, unspecified…).
    identifierFormat: null,
    disableRequestedAuthnContext: true,
  });
}

/** The IdP redirect URL for an SP-initiated login; `relayState` is our signed state. */
export function samlRedirectUrl(saml: SAML, relayState: string): Promise<string> {
  return saml.getAuthorizeUrlAsync(relayState, {});
}

export interface SamlVerified {
  attributes: Record<string, unknown>;
  nameId: string | null;
  /** The signed assertion XML, for the one-time-use (replay) guard. */
  assertionXml: string;
}

/**
 * Verify a POSTed SAMLResponse. Returns the verified assertion's attributes, or
 * null if the response is not a valid, signed, in-audience assertion. Never
 * throws for an ordinary bad assertion — only genuinely unexpected faults
 * propagate.
 */
export async function verifySamlResponse(saml: SAML, samlResponse: string): Promise<SamlVerified | null> {
  let result: { profile: Record<string, unknown> | null; loggedOut: boolean };
  try {
    result = (await saml.validatePostResponseAsync({ SAMLResponse: samlResponse })) as typeof result;
  } catch {
    // A bad signature, wrong audience, expired or malformed assertion lands here.
    return null;
  }
  const profile = result.profile as (Record<string, unknown> & { getAssertionXml?: () => string; attributes?: Record<string, unknown>; nameID?: string }) | null;
  if (!profile) return null;
  const assertionXml = typeof profile.getAssertionXml === 'function' ? profile.getAssertionXml() : '';
  if (!assertionXml) return null;
  // The library returns single-value attributes both at the top level and under
  // `attributes`; merge, with the attribute map winning, plus the top-level
  // email/mail/nameID the library normalises.
  const attributes: Record<string, unknown> = {
    ...(profile.attributes && typeof profile.attributes === 'object' ? profile.attributes : {}),
  };
  for (const k of ['email', 'mail', 'name', 'displayName']) if (profile[k] != null && attributes[k] == null) attributes[k] = profile[k];
  return { attributes, nameId: typeof profile.nameID === 'string' ? profile.nameID : null, assertionXml };
}

/** SP metadata XML a company hands to its IdP (entityID, ACS URL, binding). */
export function samlMetadata(cfg: Config, slug: string): string {
  return generateServiceProviderMetadata({
    issuer: spEntityId(cfg, slug),
    callbackUrl: acsUrl(cfg, slug),
    wantAssertionsSigned: true,
    identifierFormat: null,
  });
}
