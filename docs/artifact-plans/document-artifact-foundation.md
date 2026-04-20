# Artifact System Cleanup — 3-Commit PR

## Context

Three unrelated-but-converging pain points in the artifact system, bundled into one foundation PR so the upcoming `text/markdown` → `.docx`/`.pdf` export work lands on clean ground:

1. **Label drift**: `artifact-panel.tsx` has a local `TYPE_LABELS` that disagrees with `constants.ts` and with the prompt-side `CANVAS_TYPE_LABELS`. `text/markdown` shows as "Markdown" in the panel header but "Document" everywhere else (indicator, toolbar, workspace history list, LLM system prompt). Same drift for `text/html`, `application/python`, `application/3d`, etc.
2. **Generic rendering helpers hidden under `lib/slides/`**: `svgToBase64Png`, `fetchImageAsBase64`, `mermaidToBase64Png` are fully generic (zero slides deps) but not discoverable for new artifact types. `fetchImageAsBase64` also carries a dead `unsplash:` branch pointing at the deprecated `source.unsplash.com` endpoint.
3. **No mermaid render cache**: every PPTX export re-renders every mermaid diagram (~200-500 ms each), even if source is unchanged. Blocks performance improvements for the future server-side PDF pipeline which will hit the same hot path.

**Project state**: local dev, no production users. Prisma migrations free to run. Commit convention verified via `git log --oneline -n 30`: Conventional Commits with scope (`feat(agents):`, `refactor(agents):`, `docs(slides):`…). `bun` is the package manager. Vitest is wired (`"test": "vitest run"`) with tests currently only in `features/platform-routes/cron-*/service.test.ts` and `features/runtime/`.

---

## Approach Summary

| Commit | What | Risk | Scope |
|---|---|---|---|
| 1 | Make `src/lib/prompts/artifacts/` the canonical source of labels; UI re-exports | Low — pure refactor, string values stay | ~5 files |
| 2 | Move render helpers to `src/lib/rendering/`, drop dead code, export `resolveQueries` | Low — moves + imports, no behavior change | ~6 files |
| 3 | Add `MermaidRender` Prisma table + cache-aware wrapper + 2 API routes | Medium — new DB table, new network round-trip in hot path | ~7 files |

**Order matters**: Commit 2 must land before Commit 3 because the cache wrapper lives in `src/lib/rendering/mermaid.ts`. Commit 1 is independent but kept first because it's the simplest and unlocks cognitive clarity for the reviewer.

---

## Commit 1 — Consolidate artifact labels (single source of truth)

### Decision
`src/lib/prompts/artifacts/` is the canonical source. Each artifact has a single file (`markdown.ts`, `html.ts`, …) already co-locating `type`, `label`, `summary`, `rules`, `examples`. That's the domain definition — labels naturally belong there. UI `constants.ts` becomes a thin consumer that re-exports `TYPE_LABELS` and keeps only the UI-specific `TYPE_ICONS` + `TYPE_COLORS`. The panel's local map is deleted.

**Why not the other direction (UI as canonical)?** The prompt layer is the *semantic* source — changing a label for the LLM and forgetting to change it for the UI (or vice versa) is exactly the drift we're fixing. One definition per type, co-located with its behavior contract.

**Circular deps?** None. `lib/prompts/artifacts/*.ts` sub-files are pure data (no imports from UI or prisma). `lib/prompts/artifacts/index.ts` only aggregates them. `features/…/constants.ts` can safely import from `@/lib/prompts/artifacts`.

### Files
- `src/lib/prompts/artifacts/index.ts` — add `ARTIFACT_TYPES` typed tuple derived from `ALL_ARTIFACTS`, and typed `ARTIFACT_LABELS: Record<ArtifactType, string>`. **Drop `CANVAS_TYPE_LABELS` entirely** (confirmed sole consumer is `instructions.ts`, which is migrated in this commit). No deprecation alias kept.
- `src/lib/prompts/instructions.ts` — swap `CANVAS_TYPE_LABELS` → `ARTIFACT_LABELS` at L6, L40, L43, L56, L59; drop re-export at L9 (grep confirmed no external consumer).
- `src/features/conversations/components/chat/artifacts/types.ts` — re-export `ArtifactType` + `ARTIFACT_TYPES` from canonical; derive `VALID_ARTIFACT_TYPES` Set from the tuple (kill the manually-maintained union/Set duplication).
- `src/features/conversations/components/chat/artifacts/constants.ts` — replace hard-coded `TYPE_LABELS` with re-export `ARTIFACT_LABELS as TYPE_LABELS` from `@/lib/prompts/artifacts`. Keep `TYPE_ICONS` + `TYPE_COLORS` local (UI-specific).
- `src/features/conversations/components/chat/artifacts/artifact-panel.tsx:54-66` — delete local `TYPE_LABELS`, add `import { TYPE_LABELS } from "./constants"`.

### Audit result — label reconciliation
Greped all `lib/prompts/artifacts/*.ts` labels vs UI `constants.ts` labels. **Only one drift:**

| type | prompt sub-file label | UI label | action |
|---|---|---|---|
| `application/3d` (r3f) | **"R3F 3D Scene"** | **"3D Scene"** | **fix `r3f.ts` → "3D Scene"** |

Other 10 types already match: HTML Page, Document, SVG Graphic, React Component, Mermaid Diagram, Code, Spreadsheet, LaTeX / Math, Slides, Python Script. No action needed.

### Test
- `bun run typecheck` (or `npx tsc --noEmit`) — expect 0 errors.
- Manual: open any chat, create/open a markdown artifact → panel header pill shows "Document", not "Markdown".
- Spot-check: open a Python artifact → header shows "Python Script" (not "Python"), toolbar shows "Canvas: Python Script".

### Commit message (draft)
```
refactor(artifacts): unify TYPE_LABELS source of truth

- move label ownership to src/lib/prompts/artifacts/<type>.ts
- export ARTIFACT_TYPES + ArtifactType + ARTIFACT_LABELS from lib/prompts/artifacts
- migrate instructions.ts CANVAS_TYPE_LABELS -> ARTIFACT_LABELS, drop alias
- features/.../artifacts/types.ts + constants.ts re-export from prompts
- drop duplicated local TYPE_LABELS from artifact-panel.tsx
- fix r3f label drift: "R3F 3D Scene" -> "3D Scene" (match UI)
- fix markdown panel label: was "Markdown", now "Document" (match rest)
```

---

## Commit 2 — Extract rendering helpers to `src/lib/rendering/`

### Decision
Three files under a new `src/lib/rendering/` directory, named by what they render, not by the format they output:

```
src/lib/rendering/
  mermaid.ts   # renderMermaidToPng(code, opts?) — was mermaidToBase64Png
  svg.ts       # renderSvgToPng(svg, width, height) — was svgToBase64Png
  images.ts    # fetchImageAsDataUrl(url) — was fetchImageAsBase64, minus dead code
  index.ts     # selective named re-exports (NOT `export *`)
```

**Barrel convention**: `index.ts` uses explicit `export { renderMermaidToPng } from "./mermaid"`, not wildcard. Tree-shaking friendlier + signals what's public API vs module-internal helpers.

**Renames**: explicit verbs (`renderXToY`, `fetchAsDataUrl`) read better at call sites than `xToBase64Y`. "Base64" is an implementation detail of the return format; the return type is a **data URL**, which is more precise.

**Old file `src/lib/slides/svg-to-png.ts`**: deleted. All 6 call sites in `src/lib/slides/generate-pptx.ts` updated to import from `@/lib/rendering`. No thin shim — the file is private to the codebase and grep will catch any miss.

**Dead code removed**: the `unsplash:` branch in `fetchImageAsBase64` (old L88-94). Unsplash resolution is handled at save time by `src/lib/unsplash/resolver.ts`; by the time this helper runs the URL is already a real `https://images.unsplash.com/...` (or `placehold.co` fallback). The `source.unsplash.com` redirect is deprecated since 2023.

**Unsplash `resolveQueries`**: exported from `src/lib/unsplash/index.ts` as `resolveUnsplashQueries(queries: string[]): Promise<Map<string, string>>`. Also expose `resolveContentImages({ content, extract, replace })` — a generic walker that takes extract/replace callbacks so future artifact types (docx, pdf) can reuse cache+lookup without reimplementing JSON walkers. Keep existing `resolveImages` (HTML regex) and `resolveSlideImages` (JSON walker) — they become thin consumers of `resolveContentImages`.

**What is NOT being moved**: `src/lib/slides/chart-to-svg.ts` — it's slides-specific (uses slides types). Stays put.

### Files
- **Create**: `src/lib/rendering/mermaid.ts`, `src/lib/rendering/svg.ts`, `src/lib/rendering/images.ts`, `src/lib/rendering/index.ts`
- **Delete**: `src/lib/slides/svg-to-png.ts`
- **Modify**: `src/lib/slides/generate-pptx.ts` (update imports, L4)
- **Modify**: `src/lib/unsplash/resolver.ts` — export `resolveQueries` as named export; **add `resolveContentImages` helper (mandatory, not optional)**; refactor existing `resolveHtmlImages` + `resolveSlideImages` to be thin consumers of it. Two consumers prove the abstraction before a 3rd (docx/pdf) comes online — no unused helper.
- **Modify**: `src/lib/unsplash/index.ts` (re-export `resolveUnsplashQueries` + `resolveContentImages`)

**Stop-and-discuss trigger**: if refactoring the two existing consumers to the shared abstraction turns out to be significantly messy (e.g., the callback signature balloons to accommodate both JSON-walking and regex-replace patterns, or the shared helper ends up with type unions covering both cases), **halt and discuss before silent-deferring**. Don't land the helper as unused, and don't leave drifted duplicate logic.

### Test
- `bun run typecheck` — 0 errors.
- Manual: open a slides artifact with at least one mermaid diagram AND one Unsplash image → click download → open the `.pptx` → diagram renders correctly, image embeds correctly.

### Commit message (draft)
```
refactor(artifacts): extract render helpers to lib/rendering

- move mermaid/svg/image helpers from lib/slides to lib/rendering
- rename to verb-first: renderMermaidToPng, renderSvgToPng, fetchImageAsDataUrl
- drop dead unsplash: branch in fetchImageAsDataUrl (server resolver
  handles it at save time; source.unsplash.com deprecated 2023)
- export resolveQueries from @/lib/unsplash as resolveUnsplashQueries
- add generic resolveContentImages(extract, replace) for future types
```

---

## Commit 3 — MermaidRender cache

### Decisions (confirmed)

**Storage**: Prisma table `MermaidRender`, Bytes column, 2 MB cap per entry. Storage-agnostic helper interface (`getCachedMermaid` / `putCachedMermaid`) so future S3 migration is a backend swap only — caller code unchanged. Migration path documented in code comments.

**Why DB (not IndexedDB, not S3)?**
- User requirement: *"Harus bisa di-consume dari client (export pipeline saat ini) maupun server (future PDF pipeline)"* — rules out IndexedDB (client-only).
- S3 adds an extra round-trip and requires a Document-like pointer table anyway. DB Bytes are simpler for the typical <500 KB mermaid PNG.
- Early-stage scope: S3 pattern is overkill right now. When/if storage pressure hits, the `{get,put}CachedMermaid` interface stays the same — just swap the backend + write a backfill job.

**Multi-tenancy — orgId scoping**

Codebase is first-class multi-tenant: 20+ Prisma models carry `organizationId`, `Document.organizationId?` is nullable (null = global/shared), and `getOrganizationContextWithFallback` is used in 30+ API routes. Artifact creation flows through `context.organizationId` → S3 key path. Cross-org cache hits would be an information-disclosure vector (existence probing via timing).

**Decision — query-level scoping, NOT hash-level**:
- Hash stays a pure content-address: `sha256(source + theme + w + h + mermaidVersion)`. No orgId in hash input.
- Row carries `organizationId String?` (matches `Document.organizationId?` pattern, null = shared/orphan sessions).
- Lookup query: `WHERE hash = ? AND organizationId = ?` — scoped via compound index `@@index([hash, organizationId])`.
- Server enforces orgId from session via `getOrganizationContextWithFallback` — client only sends `hash`, cannot spoof org.
- Trade-off: two orgs rendering identical source produce two cache entries (hit rate cost). Acceptable for tenancy isolation. Docs this trade-off in code comment.

**Why not `@@unique([hash, organizationId])`?** PostgreSQL NULL != NULL, so upsert against a nullable compound unique silently creates duplicates anyway (see CLAUDE.md memory). Skip the unique constraint. Rare duplicate rows accepted — content is identical (same Bytes for same hash), future LRU cleanup dedupes. Insert via `findFirst` + conditional `create`/no-op.

**Why no standalone `@@index([organizationId])`?** No concrete use case now. Lookup path uses compound index; cleanup cron (when built) will use `@@index([lastAccessedAt])`. Add org-only index when a metrics/cascade query actually needs it.

**Access pattern for client-side render** (current slides PPTX export runs in the browser):
- Client computes `hash` → `GET /api/rendering/mermaid?hash=<sha>` → hit? return `{ pngDataUrl }` ; miss? 404.
- Miss path: client renders with `mermaid.render()` → canvas → data URL → `postMermaidCacheEntry(hash, pngDataUrl)` (fire-and-forget via `fetch` POST). Wrapped in a single function with a `// TODO: swap to navigator.sendBeacon if this becomes hot path — sendBeacon survives page-unload but is fire-and-forget only (no response).` comment so future swap is one-line.
- Fallback: any fetch error → `console.warn("[mermaid-cache] …")` → fall through to local render, skip write. Never blocks export.

**Why not just keep it all in memory?**
Per-browser-session Map works today but dies on reload. DB persists across sessions AND across users in the same org (user A renders "architecture.mmd" → user B clicks the same deck → cache hit).

**Hash input** (deterministic, content-addressed):
```
sha256(source + "\x00" + themeJSON + "\x00" + width + "x" + height + "\x00" + mermaidVersion)
```
`mermaidVersion` is a constant hard-coded in `src/lib/rendering/mermaid.ts`, bumped manually when we upgrade `mermaid`. Safer than reading from `package.json` at runtime (would require `fs` server-side or a build-time inject).

Themes are currently hard-coded inside `renderMermaidToPng` (see old `svg-to-png.ts:129-141`), so themeJSON for now is just `"default-v1"`. When theme is exposed as an arg, it enters the hash.

**2 MB cap behavior** (confirmed): render always succeeds and returns the data URL to the caller. Write path checks size:
```
size > CAP (2 MB):
  console.warn("[mermaid-cache] skip store, size=X bytes exceeds cap=Y")
  return  // no throw — caller already has the render
size <= CAP:
  fire-and-forget POST
```
No truncate. No compression. Log includes actual size so cap-hit frequency can be observed and limit adjusted later.

**TTL**: none. Mermaid output is deterministic from (source, theme, dimensions, version). `lastAccessedAt` updated on hit for future LRU eviction.

**Cleanup**: out of scope for this PR. Follow-up ticket: `/api/cron/cleanup-mermaid-cache` mirroring `cleanup-attachments` pattern (`src/app/api/cron/cleanup-attachments/route.ts`). Add a TODO comment in the model referencing this.

**API auth**: endpoints are behind the standard session auth — reuse the same pattern as other `/api/` routes (not the cron-secret pattern; these are user-triggered). Session resolves to `organizationId` via `getOrganizationContextWithFallback`. Cache reads are scoped to the caller's org; writes scoped identically.

### Files
- **Create**: `prisma/migrations/<timestamp>_mermaid_render_cache/migration.sql` (via `bun prisma migrate dev --name mermaid_render_cache`)
- **Modify**: `prisma/schema.prisma` — add `MermaidRender` model
- **Create**: `src/lib/rendering/mermaid-cache.ts` — server-side helpers: `getCachedMermaid(hash)`, `putCachedMermaid(hash, bytes, meta)`, `hashMermaidInput(input)`. Interface storage-agnostic (Bytes today, S3 swap-in path documented in comments).
- **Modify**: `src/lib/rendering/mermaid.ts` — wrap `renderMermaidToPng` with cache-aware path; hash + API calls happen here
- **Create**: `src/app/api/rendering/mermaid/route.ts` — `GET` (lookup) + `POST` (store). Returns `{ pngDataUrl }` | 404. Reuses existing auth middleware pattern.
- **Possibly modify**: `src/lib/slides/generate-pptx.ts` — no change expected (wrapper is transparent)

### Prisma model (draft)
```prisma
// =============================================================================
// Mermaid Render Cache
// =============================================================================
// Content-addressed cache for mermaid -> PNG rendering. Scoped per organization
// at the QUERY level (not in the hash) so the hash stays a pure function of
// content. Server resolves organizationId from session; client cannot spoof.
//
// No @@unique([hash, organizationId]): PostgreSQL NULL != NULL makes upserts
// on nullable compound unique silently duplicate. Insert via findFirst +
// conditional create. Rare duplicates are acceptable — same hash produces
// identical Bytes, LRU cleanup dedupes.
//
// Follow-up: cleanup cron at /api/cron/cleanup-mermaid-cache (LRU by
// lastAccessedAt), mirroring cleanup-attachments pattern. Storage backend
// is swappable (current: Bytes; potential: S3 via a pointer field) without
// changing the {get,put}CachedMermaid helper signatures.
model MermaidRender {
  id             String   @id @default(cuid())
  hash           String   // sha256(source + theme + width + height + mermaidVersion)
  organizationId String?  // null = global/orphan session (matches Document pattern)
  png            Bytes    // Rendered PNG. Entries > 2MB skip cache write (logged).
  width          Int
  height         Int
  mermaidVersion String
  createdAt      DateTime @default(now())
  lastAccessedAt DateTime @default(now())

  @@index([hash, organizationId]) // primary lookup path
  @@index([lastAccessedAt])       // future LRU cleanup cron
}
```

### Test
- Typecheck pass.
- Unit test for `hashMermaidInput` at `src/lib/rendering/mermaid-cache.test.ts` (vitest). Minimum cases:
  - Same input → same hash (stability).
  - Different `source` → different hash.
  - Different `themeJSON` → different hash.
  - Different `width`/`height` → different hash.
  - Different `mermaidVersion` → different hash.
- Manual:
  1. Open a slides artifact with mermaid.
  2. Download PPTX → observe ~1s render (cold).
  3. Reload page, download again → observably faster.
  4. `bun prisma studio` → `MermaidRender` table has rows with non-null `png` and `lastAccessedAt > createdAt` after step 3.
  5. Verify row's `organizationId` matches the active org (or null if chat session had no org context).

### Commit message (draft)
```
feat(artifacts): add MermaidRender cache

- new Prisma model MermaidRender (Bytes PNG, org-scoped at query level)
- hash is pure content-address: sha256(source+theme+dims+mermaidVersion)
- organizationId scoping via compound @@index([hash, organizationId]);
  server resolves orgId from session (client cannot spoof)
- no @@unique (NULL != NULL pitfall); insert via findFirst + conditional create
- src/lib/rendering/mermaid-cache.ts — storage-agnostic helpers
  (getCachedMermaid / putCachedMermaid); S3 swap is backend-only
- 2MB cap on PNG size: render always returns to caller; oversized entries
  skip write with console.warn including size (observability for tuning)
- postMermaidCacheEntry wraps POST in a single function with a TODO for
  future navigator.sendBeacon swap
- GET/POST /api/rendering/mermaid (session-auth, org from session context)
- renderMermaidToPng now checks cache before rendering, writes on miss;
  any cache error logs and passes through to local render
- unit test for hashMermaidInput (stability + per-component sensitivity)
- follow-up: LRU cleanup cron + S3 backend migration (out of scope)
```

---

## Execution order

0. Plan persisted to `docs/artifact-plans/document-artifact-foundation.md` (done).
1. Commit 1 (consolidate labels) → typecheck → manual smoke → `git commit-sulthan`
2. Commit 2 (extract rendering) → typecheck → manual smoke → `git commit-sulthan`
3. Commit 3 (mermaid cache) → `bun prisma migrate dev --name mermaid_render_cache` → typecheck → `bun run test` → manual smoke → `git commit-sulthan`
4. Draft PR description covering all three commits + follow-ups (LRU cleanup cron, S3 migration if needed, `text/markdown` docx/pdf export as the unlocked work).

Each commit produces a working tree that passes typecheck. Never use `git commit` — always `git commit-sulthan`. Do NOT include `.claude/`, Claude log residue, or any unrelated WIP files (check `git status` before staging; use explicit `git add <path>` not `git add .`).
