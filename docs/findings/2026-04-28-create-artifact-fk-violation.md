# `create_artifact` FK violation — root cause investigation

**Date:** 2026-04-28
**Symptom:** `[create_artifact] Persistence error: Foreign key constraint violated: Document_sessionId_fkey`
**Investigator:** systematic-debugging Phase 1 (no fixes yet — diagnosis only)

## Error fingerprint

```
PrismaClientKnownRequestError P2003
at src/lib/tools/builtin/create-artifact.ts:159
prisma.document.create({ data: { ..., sessionId: context.sessionId || null, ... } })
```

Schema (`prisma/schema.prisma:308-309`):
```prisma
sessionId    String?
session      DashboardSession? @relation(fields: [sessionId], references: [id], onDelete: SetNull)
```

`Document.sessionId` is **nullable**, so the FK only fires when a non-null value is passed AND no matching `DashboardSession.id` row exists.

## Evidence chain (request log, in order)

1. `PATCH /api/dashboard/chat/sessions/cmoi7glc50012dylm2xm7bakp` → **404**
2. `GET /api/dashboard/chat/sessions/cmoi7glc50012dylm2xm7bakp` → **404**
3. `POST /api/chat` accepts the request and proceeds (does not validate sessionId)
4. `[Memory] Loaded working memory for thread cmoi7glc...: 0 entities, 0 facts` — memory layer doesn't gate on DB existence
5. LLM tool-calls `create_artifact` → S3 upload succeeds → `prisma.document.create()` → **FK violation**

## Data-flow trace (client → server)

### Client: `src/hooks/use-chat-sessions.tsx:305-341` — `createSession`
```ts
const tempId = crypto.randomUUID()                          // (UUID-format)
setSessions((prev) => [{ id: tempId, ... }, ...prev])
setActiveSessionId(tempId)                                  // active immediately
fetch("/api/dashboard/chat/sessions", { method: "POST" })    // background, non-awaited
  .then(({ id, title }) => { /* sets dbId on the local session */ })
return newSession                                            // returns synchronously
```

### Client: `src/features/conversations/components/chat/chat-workspace.tsx:950`
```ts
const apiSessionId = session?.dbId || session?.id   // ← falls back to tempId
```

`apiSessionId` is then sent to `/api/chat` as `body.sessionId`.

### Server: `src/app/api/chat/route.ts` → `runChat` → `service.ts:690`
```ts
sessionId: body.sessionId || undefined    // passed verbatim into tool context
```
**No validation** that the session exists.

### Server: `src/lib/tools/builtin/create-artifact.ts:159-181`
```ts
await prisma.document.create({
  data: { ..., sessionId: context.sessionId || null, ... }
})
```
Trusts the context value blindly → FK violation when sessionId is bogus.

## Two independent ways this triggers

### A. Race condition (UUID tempId leaks into /api/chat)

If user sends a message *before* the background `POST /api/dashboard/chat/sessions` resolves:
- `session.dbId` is still undefined
- `apiSessionId` falls back to `session.id` = the **UUID tempId**
- A UUID never matches a Prisma cuid → guaranteed FK violation

Reproducible by clicking "New Chat" and immediately sending a message.

### B. Stale dbId pointing at a deleted/wiped session (THIS log)

The id in the failing log is `cmoi7glc50012dylm2xm7bakp` — that's a **cuid**, not a UUID. So the background POST *did* succeed at some earlier point and the dbId was set. The 404s on PATCH/GET prove the row was later deleted from `DashboardSession`.

Likely deletion paths:
- Manual `DELETE /api/dashboard/chat/sessions/<id>` from another tab
- Database reset (note `git status` shows `prisma/dev.db`, migrations, and `schema.prisma` deleted from working tree — though postgres is the live DB, not sqlite, so this is incidental)
- Backend cleanup job / cascading delete from User or Organization
- Manual SQL truncation during dev

Once the row is gone, the client retains the dbId in component state (and possibly hydrated SSR state — see `readHydratedSessionsFromDocument`). PATCH/GET 404 silently; the client never invalidates the cached session.

## Why each layer fails to catch this

| Layer | What it should do | What it does |
|---|---|---|
| Client `createSession` | Await POST before activating session | Returns synchronously with tempId; race-vulnerable |
| Client `apiSessionId` | Refuse to use tempId for server calls | Falls back to `session?.id` (which is the tempId UUID) |
| Client PATCH 404 handler | Invalidate stale session on 404 | Logs error, retains stale dbId |
| `/api/chat` | Validate `body.sessionId` exists OR auto-create | Passes through unvalidated |
| `create_artifact` | Verify FK target before insert OR null-it | Blindly trusts and FKs |
| `Document.sessionId` schema | (already nullable + onDelete: SetNull) | Correct, but doesn't help on insert |

## Reproduction steps

**For path A (race):**
1. Hard-refresh, click "New Chat"
2. Immediately type a message that requires `create_artifact` (e.g. "buatkan spreadsheet 5 tahun…")
3. Hit send within ~50ms of clicking "New Chat"
4. Network tab: `/api/chat` body has `sessionId: <UUID format>` → FK violation

**For path B (stale):**
1. Open a chat (let session POST complete; dbId is set)
2. In another tab/curl, `DELETE /api/dashboard/chat/sessions/<id>`
3. Continue chatting in tab 1 with a tool-calling prompt
4. PATCH/GET return 404; `create_artifact` FK-violates

## Open questions before fixing

1. **Is path A actually firing today?** Check whether the original log included a UUID-format sessionId or only the cuid. The cuid in this log is path B. If we never see UUIDs, path A may already be rare in practice (the background POST is usually fast enough), but it's still a correctness bug.
2. **Why was the session deleted?** Did the user run a `prisma migrate reset` / truncation recently? The 404s suggest the row went away outside the user's explicit action — investigate background cleanup jobs.
3. **What's the desired UX when a session is gone?** Auto-create a new session? Hard-error and ask the client to refresh? Persist the artifact with `sessionId: null` (orphan)?

## Recommended fix shape (NOT applied — diagnosis only)

Fix in priority order:

1. **`/api/chat` — validate or auto-create the session** (root cause for both paths). Either:
   - 410 Gone if sessionId is provided but doesn't exist (force client to recreate), OR
   - Auto-create a `DashboardSession` row using the provided id (UUID or cuid) so the FK target always exists.

2. **`createSession` — await the background POST** (eliminates path A). Make `createSession` return a Promise that resolves with `{ id, dbId }` and have `chat-workspace` await it before allowing send.

3. **Client PATCH/GET 404 handler** — when a session 404s, invalidate the cached entry and re-create or evict it from local state.

4. **Defense-in-depth in `create_artifact`** — verify the session exists before insert (or coerce `sessionId` to `null` if not). This makes the tool resilient even if upstream layers regress.

Per Phase 4.5 of systematic-debugging: this is **not a 3+-fix architectural rewrite case**; it's three discrete, independent fixes at three layers. Each addresses a real gap. None of them alone is sufficient for full resilience.
