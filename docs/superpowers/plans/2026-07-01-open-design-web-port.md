# Plan — Port open-design `apps/web` (desktop) → rantai-agents (web)

## Goal
Faithfully port open-design's Next.js `apps/web` (269K LOC, 405 files, 136 `/api/*`
endpoints, 6 internal `@open-design/*` packages) into rantai-agents as an
**isolated** feature under `packages/rantai-agents/src/design/`, mounted at
`/dashboard/design`. Keep THEIR code and UX. Swap ONLY the infra:

| Their desktop infra | Our web infra |
|---|---|
| agent CLI `child_process.spawn` | model gateway (`getChatProvider` + `generateText`/`streamText`) |
| `better-sqlite3` (local file) | Prisma / Postgres |
| local fs (projects/artifacts/design-systems dirs) | S3 / RustFS (+ Prisma for metadata) |
| Electron host / sidecar / platform IPC | web stubs (browser APIs + our API routes) |

Do NOT touch or reuse rantai-agents' existing artifact engine. Keep it separate.

## Target layout (isolated)
```
packages/rantai-agents/src/design/
  web/            ← apps/web/src (their SPA, verbatim then adapted)
  packages/       ← vendored @open-design/{components,contracts,host,platform,sidecar,sidecar-proto}
  server/         ← ported daemon: adapters (gateway/db/storage) + endpoint handlers
src/app/dashboard/design/[[...slug]]/page.tsx  ← mounts their SPA
src/app/api/design/**            ← ported endpoints (OSS) + apps/cloud re-exports
```
Path aliases: `@open-design/*` → `src/design/packages/*`. Keep the design SPA OUT
of the app's global typecheck until it compiles (own tsconfig include), so the
main app build stays green throughout.

## The 3 adapter seams (built once, used everywhere)
1. **gateway adapter** — replace their agent-runtime invocation with a function
   that composes their system prompt and calls our `streamText`/`generateText`,
   emitting the same stream events their web expects.
2. **db adapter** — port their SQLite schema to Prisma models (namespaced,
   e.g. `Design*`), and re-point their query layer at Prisma.
3. **storage adapter** — replace fs project/artifact reads/writes with S3/RustFS
   (bytes) + Prisma (metadata).

## Phases (each ends build-green + committed)

### Phase 0 — Scaffold & vendor  (SEQUENTIAL foundation)
- 0a. Copy `apps/web/src` → `src/design/web`; copy the 6 package `src`s → `src/design/packages/*`.
- 0b. Add npm deps: lexical, @lexical/react, @lexical/utils, @xterm/xterm, @xterm/addon-fit, shiki, jspdf, motion, posthog-js, @formkit/auto-animate (+ confirm react/next/anthropic/openai present).
- 0c. Path aliases (`@open-design/*`) in tsconfig + next config; isolated tsconfig for `src/design`.
- 0d. Stub desktop packages (host/platform/sidecar/sidecar-proto) as web shims (no Electron/IPC).
- 0e. Mount SPA at `/dashboard/design` (catch-all) + nav item; iterate until the shell **compiles**.

### Phase 1 — Adapter seams + data model  (SEQUENTIAL)
- 1a. Port their SQLite schema → Prisma `Design*` models; `db push`.
- 1b. storage adapter (S3/RustFS) ; 1c. gateway adapter (stream events) ; 1d. auth/org scoping.

### Phase 2 — Endpoint port  (PARALLELIZABLE, by domain group)
The 136 endpoints in ~10 groups, each a task → Next route handlers on the seams:
projects · artifacts · design-systems · design-templates · chat/runs(generation) ·
connectors · deploy · automation · media · misc(app-config/health/editors/dialog/etc).
Peripheral/desktop-only groups (dialog/open-folder, dir-exists, editors, codex-pets)
get web-appropriate stubs.

### Phase 3 — Screen/flow bring-up  (PARALLELIZABLE, by feature area)
Get each area rendering + working against ported endpoints: project browser ·
studio/chat · design-system manager · artifact viewer/preview · settings.

### Phase 4 — Integration + E2E  (SEQUENTIAL)
Build-green across the app; run; smoke-test project → generate → preview → export; iterate.

## Execution
Subagent-driven: Phases 0–1 done as tight sequential subagent tasks (foundation,
not parallelizable — they gate everything). Phases 2–3 fan out to parallel
subagents (disjoint files). Two-stage review per task. Realistic note: the
foundation (Phase 0e build-green) is the bottleneck; parallelism accelerates
Phases 2–3, not 0–1.
