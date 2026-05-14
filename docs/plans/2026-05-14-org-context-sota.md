# Org-context SOTA migration — plan (2026-05-14)

Goal: One consistent org-context story across the whole codebase. Replace the
two coexisting resolvers (`getOrganizationContext` strict, `getOrganizationContextWithFallback`)
with a **single resolver** that reads from cookie + session + header in a defined
precedence, and migrate every server route + client call to it.

The user has explicitly approved reworking previously-fixed code if needed.

## Scope (measured)

- **67** server routes use `getOrganizationContext` (strict).
- **36** server routes use `getOrganizationContextWithFallback`.
- 0 routes use both — they are mutually exclusive per file.
- **63** client files use raw `fetch("/api/...")`.
- **19** client files already use `useOrgFetch`.
- Auth: NextAuth v5, JWT strategy (`src/lib/auth.ts`).
- Active org persistence today: `localStorage["rantai-active-organization"]` only.

## Architecture (target)

### Active-org persistence

- **HTTP-only cookie** `rantai-active-org` — written by `POST /api/user/active-organization`.
- Lifetime: 1 year, SameSite=Lax, Secure in prod.
- Cookie owns the truth server-side. localStorage is kept as a *read mirror* so
  the client can show the org selector without an extra fetch, but writes go
  through the API.

Why cookie (not session JWT): switching orgs shouldn't require re-issuing the
JWT. Cookie is read by both server components and API routes via
`next/headers`'s `cookies()`.

### Single resolver

```ts
// src/lib/org-context.ts
export interface ActiveOrgContext {
  organizationId: string
  role: "owner" | "admin" | "member" | "viewer"
  membershipId: string
  source: "header" | "cookie" | "auto"
}

export async function resolveActiveOrg(
  request: Request,
  userId: string
): Promise<ActiveOrgContext | null>
```

Precedence:
1. `x-organization-id` request header (explicit override; useful for tests, API tokens)
2. `rantai-active-org` cookie (default for browser sessions)
3. First accepted membership (auto-pick for new users; on hit, the caller may persist by setting cookie)

All branches verify that `userId` has an accepted membership in the resolved org;
otherwise return `null`.

For server components / SSR there's a thin wrapper that builds a `Request` from
`headers()` + `cookies()` for ergonomics. Same return shape.

### Deprecation

- `getOrganizationContext` → delete.
- `getOrganizationContextWithFallback` → delete.
- Re-export shim that throws at runtime in dev (`if NODE_ENV !== 'production'`)
  during migration, then delete entirely.

## Phases

Each phase ends with: tsc clean + manual smoke pass.

### Phase 0 — Foundation (small, isolated)

- 0.1 Cookie helpers: `src/lib/active-org-cookie.ts` (set/get/clear).
- 0.2 New resolver: `src/lib/org-context.ts` with `resolveActiveOrg`.
- 0.3 New endpoint: `POST /api/user/active-organization` (sets cookie after
  membership verify); `DELETE` clears it.
- 0.4 Cookie-write migration shim in `useOrganization` provider: on mount, if
  cookie not set and localStorage has a value, POST to set it.

### Phase 1 — SSR hydration

Migrate every server component that calls `getOrganizationContextWithFallback` /
`findFirst membership` to use `resolveActiveOrg`. List (from prior survey):

- `src/app/dashboard/agent-builder/new/page.tsx`
- `src/features/assistants/components/builder/assistant-page-hydration.ts`
- `src/features/knowledge/components/pages/knowledge-page.tsx`
- Any other server components: grep `getOrganizationContextWithFallback` in `src/app` and `src/features`.

### Phase 2 — API routes (server)

Mechanical migration. For each of the 103 route files:

1. Replace import.
2. Replace call. Where the route was strict before, behavior changes (it will now succeed for users with a cookie). Document any route that *should* remain header-only (none expected — webhook routes don't use this resolver).
3. Pass `context.organizationId` / `context.role` through unchanged — the service layer doesn't need to know.

Order: assistants, knowledge, digital-employees, workflows, credentials, mcp,
embed-keys, agent-api-keys, audit, tools, skills. Roughly biggest blast radius
first so reverts are easier if something explodes.

### Phase 3 — Client hooks

Convert every hook in `src/hooks/use-*.ts` that hits an org-scoped endpoint to
use `useOrgFetch`. We're keeping the header path even with cookie because:
(a) it makes test isolation easier (set the header to spoof org), and
(b) hooks that take an explicit `organizationId` param can pass it via header
without depending on the user's active org.

### Phase 4 — Client components

Convert every component in `src/features/**/*.tsx` that hits an org-scoped
endpoint with raw `fetch` to use `useOrgFetch`. Survey says ~30+ files.

### Phase 5 — Migration

- Backfill orgless assistants (script from prior work — already written at
  `scripts/backfill-orgless-assistants.ts`).
- Check for orgless rows in other tables: Tool, Skill, Workflow, KnowledgeBaseGroup,
  KnowledgeDocument, Category, McpServerConfig, DigitalEmployee. Write similar
  backfill if any exist.

### Phase 6 — Cleanup

- Delete `getOrganizationContext` and `getOrganizationContextWithFallback`.
- Delete the prior fix's two-resolver doc references.
- Update `docs/findings/2026-05-14-agent-builder-org-context-bug.md` with a
  closure note pointing to this plan.

### Phase 7 — Verify

- `bunx tsc --noEmit` clean (modulo pre-existing errors documented in step 0).
- Targeted unit tests: assistants core/service, knowledge documents/service.
- Manual smoke:
  - Single-org user: create agent, see in list + sidebar, edit, delete.
  - Multi-org user: switch org via selector, lists update immediately, no reload.
  - New user: cookie auto-set on first request, lands in their first org.

## Risks

- **Login regression**: cookie helpers must not block auth flow. Mitigation:
  cookie is set lazily after first authenticated request, not in auth callback.
- **Stale clients post-deploy**: existing tabs have localStorage but no cookie.
  Migration shim handles this (POST to set cookie on next mount).
- **Race conditions during first paint**: client briefly without cookie/header.
  Resolver's "auto" branch (first membership) handles this; behavior matches
  what `loadInitialAssistantsForBuilder` already does today.
- **Test fixtures**: unit tests that mock `getOrganizationContext*` need updating.
  Pre-existing test failure (missing `isValidModelAsync` mock) is unrelated and
  remains as-is.

## Rollback plan

Each phase commits separately. Phase N can be reverted without touching N-1
because the old resolvers are kept until Phase 6.

## Out of scope

- Routes that don't use org context (webhook tokens, employee runtime tokens, etc.).
- Multi-tenant isolation hardening on sub-routes that trust the URL ID without
  re-verifying org (e.g. `/api/assistants/[id]/tools` — see `findings` doc, item 4 in "Other issues found"). Tracked separately.
- Org switcher UI polish.
