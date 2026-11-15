// What the demo's in-tab API gets in place of api/src/lib/saml.ts (swapped in
// by vite.demo.config.ts). The real module wraps @node-saml/node-saml, which is
// built on Node's crypto, zlib and util and cannot run in a browser tab: bundled,
// it stopped the whole demo at start-up. The demo has no identity provider to
// talk to, so here a SAML sign-in can never begin and never succeeds; the admin
// screens that show the SSO settings and the SP metadata keep working.
import type * as Real from '../../../api/src/lib/saml';
import { acsUrl, spEntityId } from '../../../api/src/lib/sso';

const unavailable = (): never => {
  throw new Error('saml: single sign-on does not run in the demo');
};

export const makeSaml: typeof Real.makeSaml = unavailable;
export const samlRedirectUrl: typeof Real.samlRedirectUrl = unavailable;
/** Fail closed: no assertion is ever accepted in the demo. */
export const verifySamlResponse: typeof Real.verifySamlResponse = async () => null;

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The same SP metadata a real install hands its IdP (entityID, ACS URL, binding). */
export const samlMetadata: typeof Real.samlMetadata = (cfg, slug) =>
  `<?xml version="1.0"?>\n` +
  `<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${xml(spEntityId(cfg, slug))}">\n` +
  `  <SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol" AuthnRequestsSigned="false" WantAssertionsSigned="true">\n` +
  `    <AssertionConsumerService index="1" isDefault="true" Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${xml(acsUrl(cfg, slug))}"/>\n` +
  `  </SPSSODescriptor>\n` +
  `</EntityDescriptor>\n`;
