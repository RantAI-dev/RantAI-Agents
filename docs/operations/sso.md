# Single sign-on (OIDC): runbook

Sign-in runs in the Rust service (`agents-server`, identity-and-access slice S2). It issues the same
NextAuth v5 session cookie the Next.js app issues, so pages still served by Next.js accept a user
who signed in through Rust. SAML 2.0 is a later slice (S6).

## What is served

| Route | What it does |
|---|---|
| `POST /api/auth/login` | Password sign-in. JSON `{ email, password, callbackUrl? }` → `{ user, redirectTo }` and the session cookie |
| `POST /api/auth/logout` | Expires the session cookie (204) |
| `POST /api/mobile/login` | Password sign-in for the mobile app → `{ token, user }` |
| `GET /api/auth/sso/discover?email=` | `{ method: "sso", providerId, providerName, startUrl }` for an email whose domain an enabled provider claims, else `{ method: "password" }` |
| `GET /api/auth/sso/{providerId}/start?callbackUrl=` | Redirects the browser to the identity provider |
| `GET /api/auth/sso/{providerId}/callback` | Where the provider sends the browser back. Register this URL at the provider |
| `GET, POST /api/dashboard/sso/providers` | List and create the organisation's providers (owner or admin) |
| `GET, PATCH, DELETE /api/dashboard/sso/providers/{id}` | Read, change, remove one |
| `POST /api/dashboard/sso/providers/{id}/test` | Fetches discovery and the signing keys, and says what it found |

The router in front (slice S9) must send these paths to Rust. It must **not** send the routes
NextAuth itself still serves (`/api/auth/session`, `/api/auth/csrf`, `/api/auth/callback/*`, …)
until the pages stop calling them.

A failed SSO sign-in sends the browser to `/login?error=<code>`:

| `error` | Meaning | What to do |
|---|---|---|
| `sso_failed` | The answer of the provider could not be verified, the sign-in took over 10 minutes, or the same sign-in was used twice | Start again. If it repeats, the service log has the reason under the request id |
| `account_link_refused` | An account with this email exists and the provider may not take it over (see "Linking" below) | Sign in with the password, or ask an admin |
| `account_not_provisioned` | No account in this organisation, and the provider does not create one | An admin invites the user, or turns on just-in-time provisioning |
| `permission_denied` | The account is suspended | A platform admin lifts the suspension |

## Settings

Set these on the Rust service. `.env.example` does not list the `AUTH_OIDC_*` variables yet.

| Variable | Required | Meaning |
|---|---|---|
| `AUTH_SECRET` (or `NEXTAUTH_SECRET`) | yes | The same secret as the Next.js app: it encrypts the session cookie and the sign-in flow cookie |
| `AUTH_URL` (or `NEXTAUTH_URL`) | for SSO, yes | The origin users open, for example `https://agents.example.com`. It builds the callback URL and decides the `__Secure-` cookie. Without it the origin is read from `Host` and `X-Forwarded-Proto`, which is wrong behind most proxies |
| `CREDENTIAL_ENCRYPTION_KEY` | to store a client secret | The key the `Credential` feature uses (64 hex characters or 32 bytes). Provider client secrets are encrypted with it, the same way |
| `SSO_ALLOW_PRIVATE_NETWORKS` | no, default `false` | Whether a provider an organisation admin adds may live on a private network. See below |
| `TRUSTED_PROXIES` | no, default empty | The proxies whose `X-Forwarded-For` is believed, for the sign-in throttle and the audit log. See `docs/operations/network.md` |

### Providers on a private network (`SSO_ALLOW_PRIVATE_NETWORKS`)

An organisation admin types the provider's URL, and the service then fetches it: discovery, the
signing keys, the token endpoint and the admin "test" button. With `SSO_ALLOW_PRIVATE_NETWORKS`
`false` (the default, and the only value the cloud uses) the service refuses to connect to any
address that is not public: loopback, the private ranges (`10/8`, `172.16/12`, `192.168/16`),
link-local (`169.254/16`, `fe80::/10`, including the cloud metadata service `169.254.169.254`),
CGNAT (`100.64/10`), unique-local (`fc00::/7`, including `fd00:ec2::254`), and IPv4 written inside
IPv6. The check runs on the address the connection actually uses, after DNS, so a name that
resolves to a private address, or changes its answer between two lookups, is refused too. The
service does not follow redirects from a provider and ignores `HTTP(S)_PROXY` for these calls.

A refused provider shows as `upstream_failed` (502) on the test button and `sso_failed` at
sign-in; the log line carries the reason.

- **On-prem with an internal Keycloak** (or any IdP on the company network): set
  `SSO_ALLOW_PRIVATE_NETWORKS=true`. Only do this where every organisation admin is trusted with
  the network the service sits on.
- **The provider from the environment** (`AUTH_OIDC_*`, below) is exempt: the operator chose it,
  not an organisation admin, so it may sit on a private address whatever this setting says.

### One provider from the environment (on-prem)

For an install with one identity provider and no admin step. It is used while its organisation has
no enabled provider of its own; once an admin adds one in the UI, the environment's provider steps
aside. Its provider id is `env-oidc`, so the callback URL is `<AUTH_URL>/api/auth/sso/env-oidc/callback`.

| Variable | Default | Meaning |
|---|---|---|
| `AUTH_OIDC_PRESET` | `generic` | `keycloak`, `entra`, `google` or `generic` |
| `AUTH_OIDC_ISSUER` | — | The issuer (Keycloak: the realm URL). Not needed for `entra` and `google` |
| `AUTH_OIDC_TENANT_ID` | — | `entra` only: the directory (tenant) id, a GUID |
| `AUTH_OIDC_HOSTED_DOMAIN` | — | `google` only: the Workspace domain users must belong to |
| `AUTH_OIDC_DISCOVERY_URL` | `<issuer>/.well-known/openid-configuration` | Only if the provider publishes discovery elsewhere |
| `AUTH_OIDC_CLIENT_ID` | — | Required |
| `AUTH_OIDC_CLIENT_SECRET` | — | The client secret, for a confidential client |
| `AUTH_OIDC_ORG_ID` | — | Required: the organisation users join |
| `AUTH_OIDC_NAME` | `Single sign-on` | The button label |
| `AUTH_OIDC_EMAIL_DOMAINS` | — | Comma-separated domains. They route `discover`, and decide which existing accounts may be linked |
| `AUTH_OIDC_JIT` | `false` | `true` creates the user and the membership at the first sign-in |
| `AUTH_OIDC_DEFAULT_ROLE` | `member` | The role of a new membership: `admin`, `member` or `viewer` |
| `AUTH_OIDC_SCOPES` | `openid email profile` | Comma- or space-separated |
| `AUTH_OIDC_GROUPS_CLAIM` | `groups` | The ID token claim that lists the user's groups |
| `AUTH_OIDC_ROLE_MAPPING` | — | `group=role` pairs, comma-separated, for example `it-admins=admin,staff=member` |

A half-set provider (an issuer without a client id or an organisation, an Entra tenant of `common`)
stops the service at start with a message that names the variable.

## How a sign-in is decided

- **Linking.** A user is found by the provider's `sub`, never by email alone. A first sign-in whose
  email matches an existing account links it only if the provider says the email is verified, the
  domain is one of the provider's email domains, the account is not a platform admin, and the
  account belongs to this organisation or to none. Otherwise `account_link_refused`.
- **Just-in-time.** With it on, an unknown user is created without a password, with a membership of
  the default role (or the mapped role). A pending invitation is accepted at the first sign-in.
- **Groups.** Each team or department whose `externalId` (set in the org settings) equals a group
  in the token gets the user as a member with source `idp`. At every sign-in those memberships are
  made to match the token: added and removed. Memberships an admin added by hand are never touched.
  A token without the groups claim changes nothing; an empty list removes every `idp` membership.
- **Role mapping.** The strongest mapped role (`admin` > `member` > `viewer`) is applied at every
  sign-in. `owner` cannot be mapped, and an owner's role is never changed by it.
- **Domains.** An email domain may be claimed by one organisation's providers only.
- Every SSO sign-in updates the identity's last sign-in time and writes an `sso.login` audit row;
  every provider change writes `sso.provider.create`, `.update` or `.delete`.

## Keycloak

1. In the realm, **Clients → Create client**: type OpenID Connect, a client id such as `rantai`.
2. **Client authentication** on (a confidential client). Standard flow on; direct access grants off.
3. **Valid redirect URIs**: the callback URL from the provider's settings in RantAI (for the
   environment provider, `<AUTH_URL>/api/auth/sso/env-oidc/callback`). **Web origins**: `AUTH_URL`.
4. **Advanced → Proof Key for Code Exchange Code Challenge Method**: `S256`.
5. **Credentials** tab: copy the client secret.
6. Groups (optional): **Client scopes → `<client>-dedicated` → Add mapper → Group Membership**,
   token claim name `groups`, *Full group path* off, *Add to ID token* on.
7. Make sure users have an email and that it is verified (**Users → Email verified**), or linking
   of existing accounts is refused.
8. In RantAI: preset `keycloak`, issuer `https://<host>/realms/<realm>`, the client id and secret.
   Press **Test**: it must show the realm as the issuer.

## Microsoft Entra ID

1. **Entra admin center → App registrations → New registration**. Supported account types: *this
   organisational directory only* (single tenant). Multi-tenant registrations are not supported.
2. **Redirect URI**: platform *Web*, the callback URL.
3. **Certificates & secrets → New client secret**: copy the value (not the id).
4. **Overview**: copy the *Application (client) id* and the *Directory (tenant) id*.
5. **Token configuration → Add optional claim → ID → `email`**, and `xms_edov` (the email domain
   is verified). Without `xms_edov` Entra's email is not trusted for linking existing accounts:
   a new user is still created with just-in-time provisioning.
6. Groups (optional): **Token configuration → Add groups claim → Security groups**, ID token,
   *Group ID*. The claim carries group object ids: put those ids in the teams' `externalId`. A
   user in more than 200 groups gets no claim (Entra's overage), and their memberships are then left
   as they are.
7. In RantAI: preset `entra`, the tenant id (a GUID), the client id and secret.

## Google Workspace

1. **Google Cloud console → APIs & Services → OAuth consent screen**: user type *Internal*.
2. **Credentials → Create credentials → OAuth client ID**: type *Web application*; authorised
   redirect URI: the callback URL.
3. Copy the client id and secret.
4. In RantAI: preset `google`, the client id and secret, and the hosted domain (your Workspace
   domain). The token's `hd` claim must equal it; a personal Gmail account is refused.
5. Google sends no groups claim; manage teams by hand or with a later SCIM slice.

## Limits worth knowing

- The password throttle (5 tries per email, 30 per address, per 15 minutes) counts per instance:
  N instances allow N times as many tries. The address is the last `X-Forwarded-For` entry, which
  is right with exactly one proxy in front.
- A sign-in started in a second tab before the first one finished is refused (`sso_failed`); the
  user starts again. This is the replay guard: the flow lives in a cookie, never on the server.
- Discovery and the signing keys are cached for 10 minutes per instance; a token signed with an
  unknown key refetches the keys at once (at most every 30 seconds).
