# Identity and access: SSO, organisations, teams, RBAC, sharing

Status: approved by the owner, 2026-11-14. Built in Rust (`rust/`), behind the strangler: each
surface switches from Next.js to Rust when its slice lands. The knowledge base stays out of agents
for now; agents reach other platforms through the API and a WebSocket.

## 1. What the owner asked for

1. Sign in with the client's identity provider: OIDC/OAuth (Keycloak, Microsoft 365 / Entra ID,
   Google, any OIDC provider) and SAML 2.0.
2. An organisation is a company. Inside it: departments and teams, nested.
3. RBAC that is much stronger than today's:
   - only admins build agents
   - admins choose who may use each agent, by team, department, user or the whole company
4. Chat sharing, by the same teams, departments and users.
5. No knowledge base on agents for now. Agents are reachable from other platforms over the HTTP API
   and a WebSocket.

## 2. Today (what changes)

| Area | Today | Problem |
|---|---|---|
| Login | NextAuth credentials provider only (`src/lib/auth.ts`); `User.passwordHash` is required | No SSO; an SSO user has no password |
| Org structure | `Organization` plus `OrganizationMember.role` (free text: owner/admin/member/viewer) | Flat; no departments or teams |
| Agents | Any `member` may create and edit; every member of the org sees every agent | No per-agent access |
| Chats | Private to the owner | No sharing |
| API access | `AgentApiKey` per assistant, `/v1/chat/completions` in TypeScript | Not in Rust; no WebSocket |
| Platform admin | `User.role = ADMIN` | Stays as it is |

## 3. Model

### 3.1 Tenancy tiers

```
Organization (company)                         tenant boundary: nothing crosses it
 └─ OrgUnit kind=department                    any depth, any number of children
     └─ OrgUnit kind=team
         └─ OrgUnit kind=team ...
```

- `OrgUnit { id, organizationId, parentId?, kind: department|team, name, slug, externalId?,
  createdAt, updatedAt }`
  - `externalId` is the IdP group the unit is synced from.
  - Unique `(organizationId, parentId, slug)`.
  - A cycle is rejected on every write.
- `OrgUnitMember { unitId, userId, role: lead|member, source: manual|idp }`: a user may be in
  any number of units.
- **Inheritance**: a grant to a unit applies to its members and to the members of every
  descendant unit. A grant to a team does not apply to its parent department.

### 3.2 Roles and permissions

Permissions are the unit of enforcement. Roles are named sets of permissions. Every check goes
through one pure function in `agents-core::authz`:

```rust
authorize(principal: &Principal, action: Permission, resource: &Resource) -> Decision
```

Organisation roles. These are the existing four; `member` loses agent building.

| Permission | owner | admin | member | viewer |
|---|---|---|---|---|
| `org.manage` (name, delete, billing hooks) | ✓ | | | |
| `org.members.manage` (invite, remove, set role) | ✓ | ✓ | | |
| `org.units.manage` (departments, teams, membership) | ✓ | ✓ | | |
| `org.sso.manage` (identity providers, mappings) | ✓ | ✓ | | |
| `org.audit.read` | ✓ | ✓ | | |
| `agents.create` / `agents.manage` (edit, delete, bindings, access) | ✓ | ✓ | | |
| `agents.use` (only agents granted to the user, §3.3) | ✓ | ✓ | ✓ | ✓ |
| `api_keys.manage` (agent API keys, WebSocket clients) | ✓ | ✓ | | |
| `chats.share` | ✓ | ✓ | ✓ | |
| `chats.read_shared` | ✓ | ✓ | ✓ | ✓ |

- A team **lead** gets `org.units.manage` limited to their own unit and its descendants: they add
  and remove members, but cannot create units at the top level.
- An owner cannot be removed or demoted while they are the only owner.
- Custom roles (an org-defined permission set) fit this model later as an `OrgRole` table. They
  are not in the first cut.

### 3.3 Agent access

- `AssistantGrant { assistantId, subjectType: org|unit|user, subjectId, level: use|manage,
  grantedBy, createdAt }`, unique `(assistantId, subjectType, subjectId)`.
- A user may **use** an agent if:
  - they are owner or admin, or
  - a grant matches them directly, through a unit they are in or below, or through `org`.
- `manage` on a grant lets a non-admin edit that one agent. This is optional delegation;
  `agents.create` stays admin-only.
- **A new agent starts with no grants**: only admins see it until it is shared. The builder
  shows the access panel before publishing.
- Built-in agents are visible to everyone, as today. An org can hide one with a deny grant later;
  not in the first cut.
- Everything that lists or runs an agent goes through the same check: the list, chat, the API,
  the WebSocket, the default-assistant resolution, and sessions. A user who loses access keeps
  their old chats read-only and cannot send new messages.

### 3.4 Chat sharing

- `ChatShare { sessionId, subjectType: org|unit|user, subjectId, level: view, sharedBy,
  createdAt, revokedAt? }`.
- Only the chat's owner, or an admin, shares and revokes. Shares stay inside the organisation.
- A recipient sees a read-only transcript. "Continue" forks a copy into the recipient's own
  sessions, only if the recipient may use the agent.
- Unit shares follow the same inheritance as grants. Removing a user from a unit removes their
  access with it.
- No public links in the first cut.

### 3.5 Identity providers and sign-in

Sign-in moves to Rust: `agents-server` gains `/api/auth/*`. During the strangler, Rust issues the
same NextAuth v5 session cookie (JWE `dir` + `A256CBC-HS512`, with the same claims), so the pages
still served by Next.js accept it unchanged. `agents-auth` already decodes this cookie; encoding
uses the same key derivation.

- `IdentityProvider { id, organizationId, kind: oidc|saml, name, enabled, config (JSON;
  secrets encrypted with the existing `Credential` encryption), emailDomains[],
  jitProvisioning, defaultRole, createdAt, updatedAt }`.
- `UserIdentity { userId, providerId, subject, email, lastLoginAt }`, unique `(providerId,
  subject)`. Linking goes by the IdP's immutable subject, never by email alone.
- `User.passwordHash` becomes nullable. An SSO-only user has none.
- **OIDC** (Keycloak, Entra ID, Google, Okta, any provider with discovery): authorisation-code flow
  with PKCE, `state` and `nonce`; ID token verified against JWKS (issuer, audience, expiry). Each
  provider kind is a preset that only fills defaults: Entra ID's tenant issuer, Google's `hd`
  hosted domain, Keycloak's realm URL.
- **SAML 2.0**: SP-initiated, signed assertions required, with audience, recipient,
  `NotOnOrAfter` and replay checked. The SP metadata is published per provider.
- **Discovery**: the login page asks for an email. If the domain matches a provider's
  `emailDomains`, it goes to that IdP; otherwise to the password form, if the org allows passwords.
  An org can turn password sign-in off.
- **Provisioning**:
  - With `jitProvisioning` on, the first login creates the user and the membership, using
    `defaultRole`.
  - **Group mapping**: IdP groups (`groups` claim or SAML attribute) map to units (by
    `OrgUnit.externalId`) and to an org role. Units with `source=idp` are re-synced at every login;
    manual memberships are left alone.
  - SCIM is a later slice.
- **Single-deployment clients**: a provider may also come from environment variables, for an
  on-prem install with one IdP and no admin UI step.

### 3.6 Agents on other platforms

- `AgentApiKey` stays: one key per agent, created only by holders of `api_keys.manage`. The key acts
  as the agent itself in its org, not as a user. Scopes, IP allowlist and expiry as today.
- HTTP: `POST /v1/chat/completions` (OpenAI-compatible, streaming and not), from the D5 slice.
- **WebSocket**: `GET /v1/agents/{assistantId}/ws` with the key in the `Authorization` header or
  the first message. JSON frames carry user messages in and the UI-stream chunks out, plus `ping`.
  One conversation per socket, with an optional `sessionId` to resume.
- Knowledge-base retrieval is off for every agent in this phase. The capability gate already
  answers 409 for it, and the builder hides it.

### 3.7 Audit

Every change to members, units, roles, grants, shares, identity providers and keys writes an
`AuditLog` row (`action` such as `rbac.grant.create`, `sso.provider.update`), with the actor and
the IP.

## 4. Enforcement rules

- One authorisation path: routes never compare roles themselves; they call `authz::authorize`.
- Another org's resources are always 404, never 403. A known resource the caller may not act on
  is 403 `permission_denied`.
- Every list query filters in SQL by the same rule as `authorize`, never by filtering in memory
  after a broad query. A property test checks the two agree.
- Tests follow AGENTS.md: every new dynamic route has a tenancy test with a positive control, and
  every security property is seen failing against its bug.

## 5. Slices

| # | Slice | Depends on | Worker |
|---|---|---|---|
| S1 | Schema (units, grants, shares, IdP, identities, nullable password) + `agents-core::authz` + store queries | none | Claude (foundation, security) |
| S2 | Sign-in in Rust: password login, session cookie issue, logout, OIDC with presets, JIT, group mapping | S1 schema | Claude (security) |
| S3 | Org admin API: members, invites, roles, units tree, unit membership, audit | S1 | MiniMax |
| S4 | Agent RBAC: admin-only create, grants API, filtered lists, chat/API/default resolution respect grants | S1 | MiniMax |
| S5 | Chat sharing API: share, revoke, list shared with me, read-only view, fork | S1, S4 | MiniMax |
| S6 | SAML 2.0 | S2 | Claude (security) |
| S7 | Agent API keys in Rust, `/v1/chat/completions`, the WebSocket | S4 | MiniMax |
| S8 | Next.js UI: login with SSO, org settings (members, teams, SSO), agent access panel, share dialog, KB hidden in the builder | S3–S5 | MiniMax |
| S9 | The router: Next.js rewrites send the ported paths to Rust | S4 | Claude |

S9 is what makes the RBAC real. Until the UI's `/api/assistants/**`, `/api/chat` and the session
routes reach Rust, the TypeScript routes, which have no grants, still answer.
