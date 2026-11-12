# Curahold for Salesforce: the package customers install

Since September 2025 a Salesforce user can no longer approve an app that is
not installed in their org, and new "connected apps" can no longer be
created. So Curahold reaches Salesforce through an **External Client App**
that a customer's administrator installs once, from a link, as a small
managed package. It contains no code and no data model: only the app's
identity and the two permissions it asks for (`api`, `refresh_token`).

This folder is the package's project. The two metadata files it needs are
made by Salesforce, in the Dev Hub, and retrieved here (step 3): they carry
ids that only the Dev Hub can issue, so they are not written by hand.

Nothing here is listed on AppExchange. The package is **unlisted**: only
someone with the install link can install it. The security review is applied
for before the first paying Salesforce customer (INTEGRATIONS.md).

## What has to exist first (the owner's accounts)

1. A Salesforce **Partner Community** membership (free) and its Partner
   Business Org, with **Dev Hub** and **second-generation packaging** turned on.
2. A **namespace** registered in a Developer Edition org and linked to the Dev
   Hub (a namespace can never be changed; `curahold` if it is free).
3. The Salesforce CLI (`sf`) on the machine that builds the package.

## Steps

1. **Sign the CLI in to the Dev Hub** (opens Salesforce's own sign-in page):

   ```
   sf org login web --set-default-dev-hub --alias DevHub
   ```

2. **Create the app in the Dev Hub**: Setup → External Client App Manager →
   New External Client App.

   | Setting | Value |
   | --- | --- |
   | Name / API name | `Curahold` |
   | Distribution state | Packaged |
   | Enable OAuth | yes |
   | Callback URL | `https://<central host>/api/connect/callback` |
   | Scopes | Manage user data via APIs (`api`); Perform requests at any time (`refresh_token`) |
   | Require PKCE | yes (Curahold sends it) |
   | Require secret for web server flow / for refresh token flow | yes |
   | Refresh token rotation | on |
   | Refresh token validity | expire if not used for 30 days |
   | Allowed addresses for token renewal | the relay's address (`tools/relay`), once Salesforce enforces it for this app |

   Copy the consumer key and secret into the Curahold server's secrets
   (`SALESFORCE_CLIENT_ID`, `SALESFORCE_CLIENT_SECRET`). They are never
   written into this repository.

3. **Retrieve the two packageable files** (type names in lower case: with
   capitals the command quietly returns nothing):

   ```
   sf project retrieve start --metadata externalclientapplication --target-org DevHub
   sf project retrieve start --metadata extlclntappoauthsettings --target-org DevHub
   ```

   This fills `force-app/main/default/externalClientApps/` and
   `force-app/main/default/extlClntAppOauthSettings/`.

4. **Check the header file** `Curahold.eca-meta.xml`:
   - `<distributionState>` is `Packaged`;
   - `<orgScopedExternalApp>` is there, as `<Dev Hub org id>:Curahold`
     (`sf org display --target-org DevHub` shows the id).

   The OAuth settings file keeps the `<oauthLink>` Salesforce wrote into it:
   that is what makes every customer's install use the one key held in the
   Dev Hub.

5. **Set the namespace** in `sfdx-project.json`, then create the package once:

   ```
   sf package create --name "Curahold" --package-type Managed --path force-app --target-dev-hub DevHub
   ```

6. **Build a version, try it, then promote it** (a customer can only install
   a promoted version in production):

   ```
   sf package version create --package "Curahold" --installation-key-bypass --code-coverage --wait 20
   sf package install --package <04t… id> --target-org <a scratch or sandbox org> --wait 15
   sf package version promote --package <04t… id>
   ```

   In the test org: connect it from Curahold (Settings → CRMs and
   spreadsheets → Salesforce, tick "sandbox" for a sandbox), run a sync, change
   a customer on both sides.

7. **The install link** for customers is

   ```
   https://login.salesforce.com/packaging/installPackage.apexp?p0=<04t… id>
   ```

   (`test.salesforce.com` for a sandbox). Put it in the Curahold server's
   settings so the connect screen can show it to administrators.

## What a customer's administrator does

Opens the install link, chooses "Install for admins only" (or for the users
who will connect), and approves. After that, anyone in their org with the
right Curahold permission can connect Salesforce from Curahold in the usual
way. They can remove the app at any time from Setup → Installed Packages;
Curahold then loses access at once.

## What is checked on our side

| Salesforce's control (partner apps in more than two orgs) | Where |
| --- | --- |
| PKCE on sign-in | `api/src/routes/sync.ts` (`pkce`), `tests/relay.test.ts` |
| A refresh token is replaced on every use | `refreshGrant` keeps the new one; one renewal at a time per connection (`crmCtx` in `api/src/sync/engine.ts`) |
| A refresh token unused for 30 days expires | set on the app (step 2); a connection that expires asks to be reconnected |
| Renewals come from known addresses | `tools/relay` + `SALESFORCE_RELAY_URL` / `SALESFORCE_RELAY_KEY` |

## Still to confirm with a real partner account

- The exact names of the settings in step 2 (Salesforce renames them between releases).
- Whether the address rule is enforced for an app in fewer than three orgs
  (if not, the relay can wait until the third Salesforce customer).
- The yearly listing fee, if any, should the app be listed later.
