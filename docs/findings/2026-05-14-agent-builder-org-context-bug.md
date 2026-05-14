# Agent Builder — Deep-scan findings (2026-05-14)

Scope: Investigating user-reported bugs in agent builder:
1. New agents (from template or manual/wizard) don't appear in the list.
2. New agent appears in sidebar but clicking it acts like "create new" (empty form).
3. Sidebar requires a hot reload to refresh.

User's hunch: organization-related. **Confirmed.**

> **Status (2026-05-14): Resolved via project-wide SOTA migration.**
> See `docs/plans/2026-05-14-org-context-sota.md` for the full plan. Short
> version: replaced the two-resolver split with a single `resolveActiveOrg`
> in `src/lib/org-context.ts` (header → cookie → first-membership precedence),
> migrated 103 API routes, 16 SSR loaders, 20 client hooks, and 34 feature
> components. Backfill script for orgless rows at
> `scripts/backfill-orgless-rows.ts`. Net new TypeScript errors: **0**.

---

## TL;DR

Two interlocking root causes, plus several smaller issues that worsen the UX:

- **A. Org-context mismatch.** `use-assistants.ts` (and ~26 other hooks) call `fetch()` **without the `x-organization-id` header**. The matching API routes (`/api/assistants` GET/POST and `/api/assistants/[id]` GET/PUT/DELETE) call `getOrganizationContext` **without fallback**, so a missing header makes the server treat the request as "no org" → creates **orgless** agents (`organizationId: null`) and lists only built-ins + orgless. Meanwhile server-side page hydration (`loadInitialAssistantsForBuilder`, `agent-builder/new/page.tsx`) uses **`getOrganizationContextWithFallback`** → returns the user's first-org agents. The two views are scoped to different sets and don't intersect.
- **B. Hook state isolation.** Each `useAssistants()` instance has its own React state. `addAssistant`/`updateAssistant`/`deleteAssistant` only mutate the calling instance. The only cross-instance sync is `ASSISTANT_CHANGE_EVENT`, which is **only** dispatched by `selectAssistant`. So creating an agent in the builder page doesn't notify the sidebar — hence "perlu hot reload".

Together they produce the exact symptoms the user described.

---

## Evidence map

### A. Header inconsistency

**Server side — strict resolver (no fallback) used by the assistants CRUD:**

`src/lib/organization.ts:16-54` — `getOrganizationContext(request, userId)`:
- Reads `request.headers.get("x-organization-id")`.
- If missing → returns `null` immediately.

`src/app/api/assistants/route.ts:22, 45` — both GET and POST call the strict resolver and pass `orgContext?.organizationId ?? null` downstream.

`src/app/api/assistants/[id]/route.ts:31, 65, 108` — GET/PUT/DELETE also use the strict resolver.

`src/features/assistants/core/service.ts:128-136` — `createAssistantForUser` writes whatever `organizationId` it's handed straight into the DB:

```ts
const createData: Prisma.AssistantUncheckedCreateInput = {
  ...
  organizationId: params.organizationId,   // null when no header
  createdBy: params.userId,
}
```

`src/features/assistants/core/repository.ts:10-23` — `listAssistantsByScope(null)` returns rows where `isBuiltIn = true OR organizationId IS NULL`. With a real `organizationId`, returns `isBuiltIn = true OR organizationId = X`. **The two sets don't overlap.**

**Server side — fallback resolver used by hydration & wizard:**

`src/lib/organization.ts:60-77` — `getOrganizationContextWithFallback`: when header missing, falls back to `prisma.organizationMember.findFirst({ where: { userId, acceptedAt: { not: null }}})`.

Used by:
- `src/features/assistants/components/builder/assistant-page-hydration.ts:60, 80` (server hydration for `/dashboard/agent-builder` and `/dashboard/agent-builder/[id]`).
- `src/app/api/assistants/wizard/stream/route.ts:16` (wizard chat).

`src/app/dashboard/agent-builder/new/page.tsx:10-14` is even cruder — it doesn't call the resolver at all, just `prisma.organizationMember.findFirst(...)` directly. Same "first org" semantics, but it doesn't respect `x-organization-id` either, so it can pick a different first org than the client's active-org localStorage.

**Client side — `use-assistants.ts` uses bare `fetch`:**

`src/hooks/use-assistants.ts:100, 200, 226, 256` — every call site:
```ts
const response = await fetch("/api/assistants")
const response = await fetch("/api/assistants", { method: "POST", ... })
const response = await fetch(`/api/assistants/${id}`, { method: "PUT", ... })
const response = await fetch(`/api/assistants/${id}`, { method: "DELETE" })
```
None of them set `x-organization-id`.

**The proper helper exists and is used elsewhere:**

`src/hooks/use-organization.tsx:294-315` exports `useOrgFetch()`, which adds the header automatically. It's used by `use-tools.ts`, `use-skills.ts`, `use-mcp-servers.ts`, `use-marketplace.ts`, `use-tasks.ts`, `chat-home.tsx`, `chat-workspace.tsx`, etc.

It's **not** used by `use-assistants.ts`.

### B. State isolation between `useAssistants` instances

`src/hooks/use-assistants.ts:82-95` — state is purely local `useState`. No SWR/react-query/zustand. Each call to `useAssistants()` allocates its own `assistants`, `selectedAssistantId`, etc.

Instances in play:
- `src/features/assistants/components/builder/agent-builder-page-client.tsx:83-89` (list page) — hydrated with `initialAssistants`.
- `src/features/assistants/components/builder/agent-editor-page-client.tsx:124-131` (editor page) — hydrated with `initialAssistants`.
- `src/features/assistants/wizard/components/wizard-page-client.tsx:58` (wizard) — hydrated.
- `src/app/dashboard/_components/app-sidebar.tsx:432-435` (sidebar) — **NOT** hydrated → falls through to client `fetchAssistants()` which sends no header.

Cross-instance sync points (`src/hooks/use-assistants.ts:152-175`):
```ts
const handleAssistantChange = (event: CustomEvent<string>) => {
  ...
  if (!assistants.some((a) => a.id === nextAssistantId)) {
    void fetchAssistants()
  }
}
```
The event is dispatched **only** by `selectAssistant` (line 191-195). `addAssistant` / `updateAssistant` / `deleteAssistant` do not dispatch it. So creating in the builder page never tells the sidebar to refresh.

### C. Editor "init guard" trap

`src/features/assistants/components/builder/agent-editor-page-client.tsx:171, 181-188`:

```ts
const initializedRef = useRef(false)
...
useEffect(() => {
  if (isNew || isLoading || initializedRef.current) return
  const agent = assistants.find((a) => a.id === id)
  if (agent) {
    setForm(getInitialState(agent))
    initializedRef.current = true
  }
}, [isNew, isLoading, assistants, id])
```

- `initialAssistants` was supplied → `isLoading` flips to `false` immediately.
- If the assistant is **not** in `assistants` (because hydration used first-org and the agent is orgless), the `if (agent)` branch is skipped, the form stays at defaults, and `initializedRef.current` stays `false`.
- A later refetch could re-evaluate this effect, but there's no refetch on `pathname` change. The editor renders a blank/default form and the user reads it as "creating new".

There is also a defensive redirect at line 174-178: `if (id === "new") router.replace("/dashboard/agent-builder/new")`. Harmless, but means any phantom `id="new"` would loop into the wizard.

---

## Reproduction walkthrough

Assume user has one membership in org `A` (`A.id`), no active-org header is being sent.

1. Load `/dashboard/agent-builder`.
   Server hydration → fallback → returns assistants where `organizationId = A.id OR isBuiltIn`. **List looks correct.**

2. Click "Create Agent" → `/dashboard/agent-builder/new`.
   Wizard server component does its own `findFirst` (still org A). Wizard chat endpoint uses fallback. **Looks fine.**

3. Complete wizard → `handleCreate` → `addAssistant({...})` (`wizard-page-client.tsx:111`).
   `useAssistants.addAssistant` → `fetch("/api/assistants", { method: "POST", ... })` — **no header**.
   Server POST: `getOrganizationContext` → null → `createAssistantForUser({ organizationId: null, ... })` → row written with `organizationId = NULL`. The agent is **orgless**.

4. `refetch()` runs (same instance): GET `/api/assistants` (no header) → server returns built-ins + orgless agents → local state replaced. **The newly created orgless agent IS in this response, so the wizard's local list contains it.** But the user immediately gets `router.replace('/dashboard/agent-builder/${created.id}')`.

5. Navigate to `/dashboard/agent-builder/${id}` (editor). Server hydration uses fallback → first-org agents only → **the new orgless agent is missing from `initialAssistants`**. Editor's init effect can't find `id` in `assistants` → form stays at defaults. UI looks like a fresh blank agent. **Matches the "saat di klik malah membuat baru" report.**

6. Navigate back to `/dashboard/agent-builder`. Hydration again → first-org agents only → **new agent missing from list**. **Matches "tidak muncul di list".**

7. Sidebar: it has its own `useAssistants()` instance with **no** `initialAssistants`, so it does a client fetch. That fetch (no header) returns built-ins + orgless → **does contain the new agent**. **Matches "muncul di sidebar".** Click sidebar entry → editor → same Step 5 trap.

8. Refresh page (hot reload) → sidebar remounts → its client fetch runs again, but result is unchanged. What "hot reload" actually fixes: cross-instance staleness between sidebar and list when the user has been navigating without remounting the sidebar. After a refresh, the sidebar's fetch is fresh.

---

## Other issues found along the way

These are real but smaller — flag for follow-up.

1. **Wizard's `new/page.tsx` server component** (`src/app/dashboard/agent-builder/new/page.tsx:10-14`) bypasses `getOrganizationContextWithFallback` and queries `findFirst` directly. For multi-org users, this can pick a different first org than what `loadInitialAssistantsForBuilder` (which uses the proper resolver) would pick. Wizard catalogs (tools/skills/mcp/kbs) may show a different org's data than the rest of the UI.

2. **`useDigitalEmployees` route mismatch** (`src/app/api/dashboard/digital-employees/route.ts:20, 40`): GET uses strict `getOrganizationContext`, POST uses fallback. Same disease as `/api/assistants` but mirrored — you can create a digital employee while having no header (it'll land in your first org), then list won't show it (list returns nothing without a header). Worth auditing the same way.

3. **Broad pattern**: 26+ hooks use raw `fetch` against org-scoped endpoints (see `grep` results in the investigation). The ones most likely to bite users next are: `use-default-assistant.ts`, `use-workflows.ts`, `use-digital-employees.ts`, `use-models.ts`, `use-assistant-tools.ts`, `use-assistant-skills.ts`, `use-assistant-mcp-servers.ts`, `use-assistant-workflows.ts`. These all touch the agent-builder editor.

4. **`agent-editor-page-client.tsx:171-188`** — the `initializedRef` latch makes the editor never recover from a missing hydrate. Even when `refetch()` later returns the agent, the form won't be initialized from it (the guard is set false but the effect won't run unless `assistants` re-changes after the guard was reset).

5. **`useAssistants.addAssistant` does not dispatch `ASSISTANT_CHANGE_EVENT`** (`use-assistants.ts:197-221`). Neither do `updateAssistant` or `deleteAssistant`. Only `selectAssistant` does. So any cross-tab/cross-instance refresh requires the user to explicitly select the new agent.

6. **`selectedAssistant` fallback** (`use-assistants.ts:185-187`): `selectedAssistantId ? assistants.find(...) ?? assistants[0] : assistants[0]`. If the selected-id refers to an orgless agent that disappears on next list, we silently snap to `assistants[0]` (probably a built-in). The user sees their selection change with no warning.

7. **`listAssistantsByScope`** sort: `orderBy: [{ isBuiltIn: "desc" }, { createdAt: "asc" }]` — built-ins always first, newest **last**. Combined with no "newest first" default in the sidebar map, freshly created agents appear at the *bottom* of long lists. UX foot-gun but not a bug per se.

---

## Recommended fix order

(High-impact → low.)

1. **Switch `use-assistants.ts` to `useOrgFetch`** for all four calls (GET / POST / PUT / DELETE). Single-file change, fixes both list-vs-create scoping and the "create disappears" symptom. Verify with a multi-org user: create → appears in same-org list.

2. **Decide & unify the resolver story** across `/api/assistants*` and `/api/dashboard/digital-employees*`. Options:
   - (a) Strict everywhere + require the client to always send the header (preferred — explicit, no silent fallbacks).
   - (b) Fallback everywhere (simpler, but multi-org users get surprises when they don't send a header).
   Don't keep the current per-method split — that's where bugs hide.

3. **Make `useAssistants` cross-instance sync work for create/update/delete.** Either:
   - Dispatch a generic `rantai-assistants-changed` event from `addAssistant`/`updateAssistant`/`deleteAssistant` and have other instances refetch, **or**
   - Lift the assistants list into a single SWR/Zustand store so all consumers share state. (SWR by URL key with a `mutate("/api/assistants")` after writes is the smallest diff.)

4. **Remove or rework the editor `initializedRef` guard** (`agent-editor-page-client.tsx`). At minimum, when `assistants` updates and the form hasn't been initialized yet, re-run the find. Better: drive the editor form from a derived state that always reflects the latest agent record.

5. **Make `agent-builder/new/page.tsx` use `getOrganizationContextWithFallback`** instead of raw `findFirst`. Keeps multi-org users in a single, well-defined org context.

6. **Audit the 26 raw-fetch hooks.** Mechanical sweep: replace `fetch(` with `orgFetch(` where the target is org-scoped. Sibling bugs are almost certainly hiding in there.

7. **Existing orgless rows.** Any agents created during the bug window have `organizationId = NULL`. Decide: backfill them into a default org per `createdBy` (preferred — they immediately become visible again), or surface them in the UI as "global / no org". Write a one-shot migration.

---

## File reference index

- `src/hooks/use-assistants.ts` — local-state hook, raw fetch (bug A entry point)
- `src/hooks/use-organization.tsx` — `useOrgFetch` lives here
- `src/lib/organization.ts` — strict vs fallback resolvers
- `src/app/api/assistants/route.ts` — list+create, strict resolver
- `src/app/api/assistants/[id]/route.ts` — get+update+delete, strict resolver
- `src/app/api/assistants/wizard/stream/route.ts` — wizard chat, fallback
- `src/features/assistants/core/service.ts` — `createAssistantForUser` writes `organizationId` straight through
- `src/features/assistants/core/repository.ts` — `listAssistantsByScope` (the `OR` query)
- `src/features/assistants/components/builder/assistant-page-hydration.ts` — page hydration, fallback
- `src/features/assistants/components/builder/agent-builder-page-client.tsx` — list page
- `src/features/assistants/components/builder/agent-editor-page-client.tsx` — editor (init-guard trap)
- `src/features/assistants/wizard/components/wizard-page-client.tsx` — wizard create flow
- `src/app/dashboard/agent-builder/new/page.tsx` — wizard SSR, raw `findFirst`
- `src/app/dashboard/_components/app-sidebar.tsx` — sidebar (its own `useAssistants()`)
