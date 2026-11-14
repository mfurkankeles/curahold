// Test-only SAML IdP: an invented, throwaway signing key + self-signed
// certificate (generated at runtime into the OS temp dir, never committed) and
// a signer that produces a signed SAML Response exactly as a real IdP would.
// Nothing here is real IdP data — demo-idp.example, @demo.example only.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SignedXml } from 'xml-crypto';

const RSA_SHA256 = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
const EXC_C14N = 'http://www.w3.org/2001/10/xml-exc-c14n#';
const ENVELOPED = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';
const SHA256 = 'http://www.w3.org/2001/04/xmlenc#sha256';

const iso = (ms: number) => new Date(ms).toISOString();
const stripPem = (pem: string) => pem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, '').replace(/\s+/g, '');

export interface DemoIdp {
  /** The IdP signing certificate as base64 DER (what sso_configs.secret stores). */
  certBase64: string;
  entityId: string;
  /** Build a base64 SAML Response carrying a signed assertion. */
  sign(p: { email: string; name?: string; audience: string; acs: string; recipient?: string; now?: number; notBeforeMs?: number; notOnOrAfterMs?: number; assertionId?: string }): string;
}

/** Generate a fresh demo IdP (unique key + cert). Each call is an independent IdP. */
export function newDemoIdp(entityId = 'https://demo-idp.example/entity'): DemoIdp {
  const dir = mkdtempSync(join(tmpdir(), 'curahold-saml-'));
  const keyPath = join(dir, 'key.pem');
  const certPath = join(dir, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-keyout', keyPath, '-out', certPath, '-days', '3650', '-nodes', '-subj', '/CN=demo-idp.example/O=Demo IdP'], { stdio: 'ignore' });
  const key = readFileSync(keyPath, 'utf8');
  const cert = readFileSync(certPath, 'utf8');
  const certBase64 = stripPem(cert);

  function sign(p: Parameters<DemoIdp['sign']>[0]): string {
    const now = p.now ?? Date.now();
    const name = p.name ?? 'Demo User';
    const aid = p.assertionId ?? `_a${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    const nb = iso(p.notBeforeMs ?? now - 60_000);
    const noa = iso(p.notOnOrAfterMs ?? now + 5 * 60_000);
    const recipient = p.recipient ?? p.acs;
    const assertion =
      `<saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="${aid}" Version="2.0" IssueInstant="${iso(now)}">` +
      `<saml:Issuer>${entityId}</saml:Issuer>` +
      `<saml:Subject><saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">${p.email}</saml:NameID>` +
      `<saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData NotOnOrAfter="${noa}" Recipient="${recipient}"/></saml:SubjectConfirmation></saml:Subject>` +
      `<saml:Conditions NotBefore="${nb}" NotOnOrAfter="${noa}"><saml:AudienceRestriction><saml:Audience>${p.audience}</saml:Audience></saml:AudienceRestriction></saml:Conditions>` +
      `<saml:AuthnStatement AuthnInstant="${iso(now)}" SessionIndex="_s1"><saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement>` +
      `<saml:AttributeStatement>` +
      `<saml:Attribute Name="email"><saml:AttributeValue>${p.email}</saml:AttributeValue></saml:Attribute>` +
      `<saml:Attribute Name="displayName"><saml:AttributeValue>${name}</saml:AttributeValue></saml:Attribute>` +
      `</saml:AttributeStatement></saml:Assertion>`;
    const sig = new SignedXml({ privateKey: key, signatureAlgorithm: RSA_SHA256, canonicalizationAlgorithm: EXC_C14N });
    sig.addReference({ xpath: "//*[local-name(.)='Assertion']", transforms: [ENVELOPED, EXC_C14N], digestAlgorithm: SHA256 });
    sig.getKeyInfoContent = () => `<X509Data><X509Certificate>${certBase64}</X509Certificate></X509Data>`;
    sig.computeSignature(assertion, { location: { reference: "//*[local-name(.)='Issuer']", action: 'after' } });
    const signedAssertion = sig.getSignedXml();
    const response =
      `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_r${Date.now().toString(36)}" Version="2.0" IssueInstant="${iso(now)}" Destination="${p.acs}">` +
      `<saml:Issuer>${entityId}</saml:Issuer>` +
      `<samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>` +
      `${signedAssertion}</samlp:Response>`;
    return Buffer.from(response, 'utf8').toString('base64');
  }

  return { certBase64, entityId, sign };
}
