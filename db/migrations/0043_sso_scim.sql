-- Enterprise single sign-on (SAML 2.0 + OIDC) and SCIM 2.0 provisioning, per
-- company. A company's administrator points Curahold at the company's own
-- identity provider; its people then sign in there, and the IdP may push user
-- provisioning over SCIM. Everything here is org-scoped: an assertion, a token
-- or a SCIM call for one company can only ever touch that company's rows.
--
-- Trust model, in one place:
--  * The SSO config row holds the IdP the admin chose. The signing material
--    (SAML IdP certificate, OIDC client secret) lives in `secret`, sealed with
--    AES-GCM by the API exactly like connections.secret; the request role has
--    no column grant on `secret` and reads it only through sso_auth_config(),
--    which a SECURITY DEFINER function anchors to the caller's own company.
--  * The SSO login routes (api/src/routes/sso.ts) run before the person is
--    known. They resolve the company from a signed RelayState / state (SAML,
--    OIDC) or the URL slug, then do every read and write inside
--    db.tenant({orgId, userId: null}) so row-level security pins them to that
--    company. A user is found-or-provisioned there, then a session is minted
--    through the existing openSession() path — SSO changes nothing about how a
--    session is stored or checked.
--  * SCIM clients present a per-company bearer token. scim_resolve_token()
--    (SECURITY DEFINER, like resolve_org) turns the token's hash into the one
--    company it belongs to; every SCIM operation then runs in that company's
--    tenant transaction, so RLS keeps provisioning inside it.

-- ------------------------------------------------------------- sso_configs

-- One row per company. protocol is the login protocol (saml | oidc); SCIM is
-- independent and may be on with or without an SSO login protocol set.
create table sso_configs (
  org_id          uuid primary key references orgs(id) on delete cascade,
  protocol        text check (protocol is null or protocol in ('saml', 'oidc')),
  enabled         boolean not null default false,
  -- When enforced, the company's people are expected to use SSO only; the
  -- login page hides the email form (see api/src/routes/sso.ts "info").
  enforced        boolean not null default false,
  -- SAML: the IdP entityID. OIDC: the issuer (the `iss` the id_token must carry).
  issuer          text check (issuer is null or length(issuer) between 1 and 500),
  -- SAML: the IdP's SSO (redirect) URL. OIDC: the authorization endpoint.
  sso_url         text check (sso_url is null or (length(sso_url) <= 1000 and sso_url ~ '^https://')),
  -- OIDC only.
  token_url       text check (token_url is null or (length(token_url) <= 1000 and token_url ~ '^https://')),
  jwks_url        text check (jwks_url is null or (length(jwks_url) <= 1000 and jwks_url ~ '^https://')),
  client_id       text check (client_id is null or length(client_id) <= 400),
  -- Which assertion attribute / id_token claim carries the person's address and
  -- display name. SAML often sends a URN; OIDC usually sends `email` / `name`.
  attr_email      text not null default 'email' check (length(attr_email) between 1 and 200),
  attr_name       text check (attr_name is null or length(attr_name) between 1 and 200),
  -- Sealed (AES-GCM, api/src/lib/crypto seal/unseal): {"cert": "<base64 DER>"}
  -- for SAML (the IdP signing certificate), {"clientSecret": "..."} for OIDC.
  secret          text,
  -- SCIM 2.0 provisioning.
  scim_enabled    boolean not null default false,
  -- sha256 of the bearer token (the token itself is shown once and never stored).
  scim_token_hash text unique check (scim_token_hash is null or length(scim_token_hash) = 64),
  -- Last few characters of the token, so the admin can recognise which is live.
  scim_token_hint text check (scim_token_hint is null or length(scim_token_hint) <= 12),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid,
  foreign key (org_id, updated_by) references users (org_id, id) on delete set null (updated_by)
);

alter table sso_configs enable row level security;
-- Any member may read the non-secret config: the login page asks whether SSO is
-- on and which protocol, and that is not sensitive. Changing it needs org.manage.
create policy sso_configs_select on sso_configs for select using (org_id = app_org());
create policy sso_configs_write on sso_configs for all
  using (org_id = app_org() and app_has_perm('org.manage'))
  with check (org_id = app_org() and app_has_perm('org.manage'));
-- Credentials stay out of reach of the request role: every column but `secret`.
-- (0001's blanket grant only covered tables that already existed, so this table
--  gets exactly the columns it should, and `secret` is read only via the
--  SECURITY DEFINER function below.)
grant select (org_id, protocol, enabled, enforced, issuer, sso_url, token_url, jwks_url, client_id,
              attr_email, attr_name, scim_enabled, scim_token_hash, scim_token_hint,
              created_at, updated_at, updated_by) on sso_configs to curahold_app;
grant insert, update, delete on sso_configs to curahold_app;

-- -------------------------------------------------- sso_seen_assertions

-- One-time use of each SAML assertion, per company: the ACS receiver records a
-- hash of the signed assertion and refuses a hash it has seen, so a captured
-- assertion cannot be replayed inside its short validity window. Rows are swept
-- by the receiver once they pass expires_at.
create table sso_seen_assertions (
  org_id        uuid not null references orgs(id) on delete cascade,
  assertion_key text not null check (length(assertion_key) = 64),
  expires_at    timestamptz not null,
  seen_at       timestamptz not null default now(),
  primary key (org_id, assertion_key)
);
alter table sso_seen_assertions enable row level security;
create policy sso_seen_assertions_all on sso_seen_assertions for all
  using (org_id = app_org()) with check (org_id = app_org());
grant select, insert, delete on sso_seen_assertions to curahold_app;

-- ------------------------------------------------- functions (pre-sign-in)

-- The SSO login routes need the sealed signing material, which the request role
-- cannot select. This returns the company's own SSO config (secret included),
-- and only ever its own: it is anchored to app_org(), which the route sets from
-- the signed state / URL slug before calling it. SECURITY DEFINER so it can read
-- the `secret` column; it leaks nothing across companies.
create function sso_auth_config()
returns table (
  protocol text, enabled boolean, enforced boolean, issuer text, sso_url text,
  token_url text, jwks_url text, client_id text, attr_email text, attr_name text,
  secret text, scim_enabled boolean
)
language sql stable security definer set search_path = public, pg_temp as $$
  select protocol, enabled, enforced, issuer, sso_url, token_url, jwks_url, client_id,
         attr_email, attr_name, secret, scim_enabled
    from sso_configs where org_id = app_org()
$$;

-- A SCIM bearer token identifies exactly one company. Used before any company
-- is known (the token is the only input), like resolve_org: SECURITY DEFINER,
-- returns the one company whose SCIM is on and whose token hash matches.
create function scim_resolve_token(p_token_hash text)
returns table (org_id uuid)
language sql stable security definer set search_path = public, pg_temp as $$
  select org_id from sso_configs
   where scim_token_hash = p_token_hash and scim_enabled and length(p_token_hash) = 64
$$;

revoke all on function sso_auth_config() from public;
revoke all on function scim_resolve_token(text) from public;
grant execute on function sso_auth_config() to curahold_app;
grant execute on function scim_resolve_token(text) to curahold_app;
