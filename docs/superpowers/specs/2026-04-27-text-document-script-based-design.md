# Text/Document Artifact — Script-Based Rebuild Design

**Status:** Approved by user 2026-04-27. Awaiting spec review before implementation plan.
**Author:** Claude (brainstorming session)
**Goal:** Bring `text/document` artifact output and preview fidelity to parity with Claude.ai's docx-skill workflow (90–100% confidence rate). User chose this path explicitly: "harus setara dengan claude".

---

## 1. Background and motivation

The current `text/document` artifact uses a typed JSON schema (`DocumentAst`, validated via Zod) that the LLM emits, which the server renders to `.docx` via the `docx-js` library and to a panel preview via a React component. This architecture has two structural ceilings:

- **Output expressiveness is bounded by the schema.** Features that `docx-js` supports natively but `DocumentAst` does not — multi-column sections, `PositionalTab` with dot-leaders, comments, tracked changes, custom heading style overrides, image positioning anchors, multi-level numbered lists with custom format codes — cannot be expressed by the LLM. Output ceiling estimated at ~70% of what `docx-js` can produce.
- **Panel preview is a React/Tailwind approximation, not the actual docx.** Spacing, font metrics, page break placement, and table padding all drift from what the user sees on opening the file in Word. Preview fidelity estimated at ~70% match.

The official Anthropic Claude Skill at `docs/artifact-plans/-docx.md` instructs Claude to write `docx-js` JavaScript directly and rely on LibreOffice for preview. That approach yields ~100% feature surface and true WYSIWYG by construction, because preview *is* the rendered docx.

User decision: **adopt the Claude Skill workflow**. Replace the AST-based pipeline with a script-based pipeline + LibreOffice preview. Existing AST artifacts become read-only legacy.

## 2. Architectural decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| Artifact content type | JavaScript docx-generation script | Full `docx-js` surface area, matches Claude.ai |
| Sandbox | Node child process per render | Pattern proven (mermaid-to-svg) — bypasses Turbopack, isolated by OS |
| Preview engine | LibreOffice headless → PDF → PNG per page | Only path to true WYSIWYG (~99% match) |
| Existing artifacts | Read-only legacy, tagged `documentFormat: "ast"` | Q1=C: fresh-start, no migration |
| New artifact format | `documentFormat: "script"`, default for all new `text/document` | Goes through new pipeline |
| Editing UX | Prompt-based ("describe your edit" → LLM rewrites script) | Q2=A: matches Claude.ai. No inline JS editor. No paragraph-level edits. |
| Validation | TS syntax parse + sandbox dry-run + magic-byte check on output | Replace Zod schema validation |
| RAG indexing | `pandoc -f docx -t plain` on generated docx | Same downstream as today, just different input source |
| Versioning | Diff JS code between versions | Acceptable downgrade from content-aware diff |

## 3. Architecture overview

```
LLM emits JS script (artifact content)
       │
       ▼ (server-side, on create/update)
[Validator]   syntax + sandbox dry-run (5s budget)
       │
       ▼
[Render queue]   semaphore N=3 — caps concurrent CPU-heavy renders
       │
       ▼
[Sandbox executor]   Node child process, restricted env, 10s wall-clock
       │  → docx buffer
       ▼
[Renderer]   LibreOffice headless: docx → pdf → page PNGs (pdftoppm)
       │
       ▼
[Cache layer]   S3 keyed by (artifactId, contentHash) + lifecycle TTL
       │
       ├──► Panel preview: PNG carousel + page nav (async job + SSE/poll)
       ├──► Download endpoint: docx buffer (cached)
       └──► RAG: pandoc extract → vector index
```

The render queue is a process-local semaphore that gates **both** sandbox execution and LibreOffice convert. Without it, N concurrent panel mounts would spawn N LibreOffice processes (~300MB each) and OOM the host. Default N=3, configurable via `RENDER_CONCURRENCY` env. Calls beyond N wait their turn; wait time bounded by render duration × queue depth.

## 4. Components and file structure

### 4.1 New files (~16)

```
src/lib/document-script/
├── sandbox-runner.ts         # spawn child node from temp .mjs file, return buffer
├── validator.ts              # syntax + sandbox dry-run
├── llm-rewrite.ts            # LLM rewrite with N=2 retry on validation fail
├── cache.ts                  # S3 store + lookup keyed by content hash
├── metrics.ts                # in-process counters: sandbox_ok/fail, render_ok/fail, durations
└── types.ts                  # ScriptValidationResult, ExecOptions, etc.

src/lib/rendering/server/
├── docx-to-pdf.ts            # `soffice --convert-to pdf` wrapper
├── pdf-to-pngs.ts            # `pdftoppm` wrapper, returns Buffer[]
├── render-queue.ts           # process-local semaphore (N=3) for concurrent renders
├── render-jobs.ts            # in-memory job table: enqueue / get-status / cleanup-done
└── docx-preview-pipeline.ts  # orchestrates docx → pdf → pngs with cache + queue

src/features/conversations/components/chat/artifacts/renderers/
├── document-script-renderer.tsx   # NEW renderer for script artifacts (PNG carousel)
└── document-renderer.tsx          # EXISTING — kept untouched for legacy AST artifacts

# Test fixtures + tests
tests/unit/document-script/
├── sandbox-runner.test.ts
├── validator.test.ts
├── llm-rewrite.test.ts
└── pipeline-integration.test.ts

tests/unit/rendering/server/
├── docx-to-pdf.test.ts
├── pdf-to-pngs.test.ts
└── render-queue.test.ts
```

### 4.2 Modified files (~6)

- `src/app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/download/route.ts` — branch on `documentFormat` (script vs ast)
- `src/features/conversations/sessions/service.ts` — handle `documentFormat` at create/update
- `src/features/conversations/sessions/repository.ts` — query/persist `documentFormat` column
- `prisma/schema.prisma` — add `documentFormat String @default("ast")` column to artifact table; new migration
- `src/features/conversations/components/chat/artifacts/artifact-panel.tsx` — switch renderer based on `documentFormat`
- `src/lib/prompts/artifacts/document.ts` — REWRITE: instructs LLM to emit JS script using docx-js, embed Claude Skill rules
- `src/lib/tools/builtin/_validate-artifact.ts` — add branch for `documentFormat: "script"` validation
- `src/lib/tools/builtin/create-artifact.ts` — default `documentFormat: "script"` when type is `text/document`
- `src/lib/tools/builtin/update-artifact.ts` — preserve existing `documentFormat` on update
- `src/lib/digital-employees/package-generator.ts` — script artifact transfer rules

### 4.3 Infrastructure

- **Docker image:** install `libreoffice-core` + `poppler-utils` (~250MB layer)
- **No daemon initially:** spawn `soffice` per render. Add daemon later if perf becomes an issue (cold start ~2–5s, warm convert ~500ms–1.5s).
- **Feature flag:** `ARTIFACT_DOC_FORMAT_DEFAULT` env var (`"script"` or `"ast"`) — controls default for new artifacts. Initial deploy starts with `"ast"` (no behavior change); flipped to `"script"` once integration tests pass in staging. Allows emergency rollback to `"ast"` without code revert.

## 5. Data flow

### 5.0 Async job model (preview/render)

Renders are CPU-heavy (1–6s) and can outlast a single HTTP request budget on serverless edges (10s default). Treat preview as an **async job**:

- `POST /render-start` — checks cache; on miss, enqueues a job, returns `{ jobId, status: "pending" | "done", hash }`. On cache hit, returns `{ status: "done", hash, pageCount }` immediately.
- `GET /render-status/:jobId` — returns `{ status: "pending" | "done" | "error", hash?, pageCount?, error? }`. Panel polls every 1s while pending (or subscribes via SSE — see §5.6).
- `GET /render-pages/:contentHash/:pageIndex` — returns the PNG bytes for a specific page (after status=done).

Job state lives in a process-local in-memory table `renderJobs: Map<jobId, RenderJob>` cleaned up 60s after completion. Jobs survive only for the lifetime of the process (acceptable: the cache survives, so a re-render after restart is cheap).

### 5.1 Create flow

1. User: "Buatkan proposal infrastruktur ke client X"
2. LLM streams `create_artifact` tool call with `type="text/document"`, `content="<JS script>"`
3. Server validate: syntax check + sandbox dry-run (5s budget, 100MB output cap)
4. If valid: persist artifact (`documentFormat="script"`), return success to LLM
5. Background job: render preview via pipeline → cache PNGs in S3
6. Panel polls or subscribes via SSE; shows PNGs when ready

### 5.2 Streaming UX

- **During LLM streaming:** panel shows the JS code with syntax highlight, line-by-line build (matches existing code-artifact streaming pattern). The "Code" view is also accessible later via a toggle.
- **After streaming + validation passes:** panel switches to a **two-pane** state:
  - Top: thin progress bar / step indicator showing "Sandbox → LibreOffice → Rasterize" with the active step highlighted
  - Bottom: faded code view (so user always has *something* to look at, not a blank spinner)
- **On render done (~2–6s typical):** the bottom pane swaps from code view to PNG carousel
- **On render error:** panel shows the specific error from the render-status response (e.g. "Sandbox timeout", "LibreOffice convert failed") plus a "Retry" button that re-enqueues the job. Code view stays accessible.
- **Total time-to-preview:** ~3–7 seconds from LLM finish (including queue wait under load)
- Avoids the dead-spinner UX where panel shows nothing for 6 seconds.

### 5.3 Edit flow (prompt-based — matches Claude.ai)

1. User clicks pencil icon → "Describe your edit" modal opens
2. User: "Ubah deadline jadi 2026-06-30 dan tambahkan section budget"
3. Frontend POST `/api/dashboard/chat/sessions/:id/artifacts/:artifactId/edit-document` with `{ editPrompt }`
4. Server: `llmRewriteWithRetry(currentScript, editPrompt)` (see §7.1) attempts up to **N=2 retries** if validation fails — each retry includes the prior validation error in the prompt so the LLM can self-correct
5. On success: persist new version (archive old script to S3 versioned key)
6. Edit history: each version's `metadata.editPrompt` records the user's prompt for audit trail
7. Trigger preview re-render (new contentHash invalidates cache lookup; render-start enqueues new job)
8. Panel polls `/render-status` and updates carousel when ready

**Failure path:** if all retries fail validation → 422 to client with the last validator error message. Frontend shows the error in the modal so user can refine their edit prompt.

**Rate limit:** edit endpoint capped at 10 requests/minute per user (LLM cost protection). Returns 429 if exceeded.

No inline JS editing. No paragraph-level structural edits. Per Q2=A.

### 5.4 Preview flow

1. Panel mounts artifact viewer with `documentFormat="script"`
2. POST `/api/.../render-start` with `{ artifactId }` — server computes `contentHash = sha256(scriptUtf8Bytes)` (16-char prefix used as cache key) and checks cache
3. Server response branches:
   - **Cache HIT:** `{ status: "done", hash, pageCount }` — panel renders PNG carousel immediately
   - **Cache MISS:** `{ status: "pending", jobId, hash }` — panel polls `/render-status/:jobId` every 1s until `status=done` or shows error
4. Render job (server-side, queued by render-queue.ts):
   - Acquire semaphore slot (waits if N=3 already running)
   - `runSandboxedScript(script)` → docx buffer (timeout 10s, OOM kill at 256MB)
   - `docxToPdf(docx)` → pdf buffer (timeout 30s)
   - `pdfToPngs(pdf)` → PNG[] (one per page, max 50)
   - `putCachedPngs(artifactId, contentHash, pngs)` — best-effort
   - Update job status → `done`, release semaphore slot
   - Increment metrics: `render_ok` or `render_fail`
5. Panel fetches each page via `/render-pages/:contentHash/:pageIndex` as user paginates (lazy, browser caches Immutable headers).

### 5.5 Download flow

1. User clicks "Download as Word"
2. Server checks if cached docx exists for `(artifactId, contentHash)`:
   - **HIT:** stream cached docx
   - **MISS:** load script → sandbox exec → docx buffer → cache → stream
3. Response: `Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `Content-Disposition: attachment; filename="<safeTitle>.docx"`

## 6. Sandbox security model

### 6.1 Process isolation + module resolution

**Critical implementation detail:** the user script imports `docx` (and possibly other allowed packages) as bare specifiers (`import { Document } from "docx"`). For Node's resolver to find these in `node_modules`, the script must be loaded from a path **inside the project tree**, not from a `data:` URL.

Approach:
1. Write the user script to a temp file inside the project directory: `<repo>/.tmp/sandbox/<jobId>.mjs`. Bundlers leave `.tmp/` alone; Node's resolver walks up from this path and finds `<repo>/node_modules/docx`.
2. Spawn `node --input-type=module --experimental-vm-modules --max-old-space-size=256 <wrapper.mjs>` where the wrapper imports the temp file via `await import(filePath)` and captures stdout.
3. Pass `cwd: <repo>` and `env: { ...process.env, NODE_OPTIONS: "" }` to ensure clean environment.
4. Delete the temp file in a `finally` block (best-effort — `.tmp/sandbox/` is gitignored and periodically cleaned).

Hard limits per child:
- `--max-old-space-size=256` (256MB heap cap)
- 10-second wall-clock timeout (kill via `child.kill("SIGKILL")`)
- Output capped at 100MB (kill if exceeded)
- `NODE_OPTIONS=""` (strip parent's Next/Turbopack loader flags)

### 6.2 Restricted runtime (in-script policy)

The wrapper script that runs in the child enforces module/API restrictions **before** importing the user file:

```ts
// Block at module-load time. We can't truly sandbox node — these are hardening
// against accidental misuse, not malicious code from a trusted boundary.
const FORBIDDEN_MODULES = ["fs", "net", "http", "https", "child_process",
  "worker_threads", "dgram", "tls", "cluster", "node:fs", "node:net",
  "node:http", "node:https", "node:child_process", "node:worker_threads",
  "node:dgram", "node:tls", "node:cluster"]
for (const m of FORBIDDEN_MODULES) {
  // shadow as an unresolvable import target
  Object.defineProperty(globalThis, m, {
    get() { throw new Error(`forbidden module: ${m}`) },
    configurable: false,
  })
}
globalThis.fetch = () => { throw new Error("forbidden API: fetch") }
// NOTE: do NOT override globalThis.Function. docx's transitive dep `function-bind`
// calls `Function.prototype.bind.call(...)` at module load and crashes if Function
// is shadowed. The threat model (§ next paragraph) treats the LLM as trusted-
// but-fallible — `new Function("...")` would only matter for malicious string-
// based code injection, which is not in scope. Module-level no-fs/no-net is the
// real protection.
```

The user script's `import { Document } from "docx"` resolves through Node's normal loader — the temp file's location lets it find `node_modules/docx`. Forbidden modules are blocked because they're not in node_modules of the docx-only allowlist (the user script can technically write `import "fs"` and Node will resolve it from core; we catch this at runtime via the property-shadow above when fs internals are accessed).

**Threat model boundary:** the LLM is treated as a trusted-but-fallible source. The sandbox protects against accidental destructive operations (LLM hallucinates `fs.writeFile` to the wrong path, or burns CPU in an infinite loop), not against a deliberately malicious adversary. A determined attacker with prompt-injection access to the LLM could craft scripts to bypass the JS-level restrictions; deeper isolation (firejail, Docker, Firecracker) is out of scope for v1 but documented as Phase 3 hardening.

### 6.3 Failure handling

| Failure mode | Detection | User-facing |
|---|---|---|
| Script syntax error | TS parse step | Validation error in tool result; LLM rewrites |
| Sandbox timeout (>10s) | wall-clock | "Generation took too long — script may have infinite loop" |
| Sandbox memory limit | child exit code 137 / OOM | "Document too complex" |
| Output not valid docx | magic-byte check on buffer (must start with `PK\x03\x04`) | "Script did not produce a valid Word document" |
| Sandbox tries forbidden API | wrapper-injected stub throws → child stderr | "Script attempted forbidden operation: \<api-name\>" (e.g. `fs.readFileSync`, `fetch`, `require("net")`) |
| LibreOffice convert fail | exit code | Fallback to "Preview unavailable, download to view" |
| LibreOffice timeout | wrapper timeout 30s | Same fallback |
| pdftoppm fail | exit code | Same fallback |
| Cache S3 fail (read or write) | catch | Skip cache for this request, run the full render-and-serve pipeline (degraded perf, still works); next successful cache write recovers the cache hit path |

### 6.4 Non-failures (warn but proceed)

- Script logs to stderr but produces valid docx → log server-side, accept
- Render succeeds but PNG count > 50 → cap at first 50 pages, add note in panel
- LibreOffice convert succeeds but pdftoppm produces zero pages → panel shows "Preview unavailable, download to view" with a working download link

## 7. Validator design

```ts
async function validateScriptArtifact(content: string): Promise<ValidationResult> {
  // 1. Syntax check via TypeScript compiler API
  const syntaxErrors = parseScript(content)
  if (syntaxErrors.length > 0) {
    return { ok: false, errors: syntaxErrors.map(formatTsError) }
  }

  // 2. Sandbox dry-run (5s budget, smaller than render budget)
  try {
    const buf = await runSandboxedScript(content, { timeoutMs: 5_000 })
    if (!isValidDocxMagic(buf)) {
      return { ok: false, errors: ["script did not produce a valid .docx"] }
    }
    return { ok: true, errors: [] }
  } catch (err) {
    return { ok: false, errors: [`sandbox: ${err.message}`] }
  }
}
```

The dry-run produces a docx buffer that we discard — purely a "does it execute and produce something docx-shaped" check. The real render at preview time uses a 10s budget and persists the result.

### 7.1 LLM rewrite with retry

The edit endpoint and any future "regenerate" path use a wrapper that retries on validation failure with the error fed back to the LLM:

```ts
const MAX_RETRIES = 2

async function llmRewriteWithRetry(
  currentScript: string,
  editPrompt: string,
): Promise<{ ok: true; script: string } | { ok: false; error: string }> {
  let lastError: string | null = null
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const promptSuffix = lastError
      ? `\n\nYour previous attempt failed validation with: "${lastError}". Fix it and return the corrected script.`
      : ""
    const newScript = await generateScriptRewrite({
      currentScript, editPrompt, promptSuffix,
    })
    const v = await validateScriptArtifact(newScript)
    if (v.ok) return { ok: true, script: newScript }
    lastError = v.errors.join("; ")
  }
  return { ok: false, error: `validation failed after ${MAX_RETRIES + 1} attempts: ${lastError}` }
}
```

Total worst-case latency for a failing edit: 3 × (LLM call + sandbox dry-run) ≈ 9–15s. Acceptable for an explicit user action; rate-limited to 10/min/user.

## 8. RAG indexing

Generated docx is converted to plain text via `pandoc -f docx -t plain` (already installed for existing artifact pipelines), then chunked and embedded by `indexArtifactContent` exactly like every other artifact today.

Triggers (fire-and-forget after the artifact is persisted):
- After successful create
- After successful edit (replaces existing chunks)
- After version restore

The pandoc extract runs **once per content change**, not per panel mount or download. The plain-text output is held in memory only long enough to feed the embedder; we don't persist it as a separate artifact.

Failure mode: same as today — fire-and-forget, mark `metadata.ragIndexed: false` if it fails.

## 9. Migration strategy (Q1=C — fresh-start)

### 9.1 DB migration

```sql
ALTER TABLE artifacts ADD COLUMN document_format VARCHAR(16) NOT NULL DEFAULT 'ast';
```

All existing rows tagged `'ast'`. New rows default to value of `ARTIFACT_DOC_FORMAT_DEFAULT` env (`'script'` after rollout).

### 9.2 Legacy support

Old AST artifacts:
- Render via existing React `document-renderer.tsx` (untouched)
- `astToDocx` renderer untouched, served on `?format=docx` for legacy
- Panel shows banner: *"This is a legacy document format. Create a new document to use the latest features."*
- Edit button hidden — legacy artifacts are read-only
- Download still works (uses cached/regenerated AST → docx)

### 9.3 No automatic conversion

Per Q1=C, AST artifacts are never auto-migrated to script format. If user wants the new format, they recreate the document by prompting the LLM fresh.

### 9.4 Cleanup phase (Phase 2 — scheduled, not "someday")

Cleanup is a **planned follow-up**, not indefinite legacy. Sequenced as:

**Phase 1 (this rebuild):** ship script-mode alongside AST. Both code paths active. Existing artifacts read-only AST. Feature flag controls default for new artifacts.

**Soak period:** 2–4 weeks of script-mode in production. Monitor:
- Sandbox failure rate (target <1% of renders)
- LibreOffice convert failure rate (target <0.5%)
- User-reported preview/output quality issues (target zero P0/P1)
- Server resource ceiling (memory/CPU under steady load)

**Phase 2 cleanup task (separate plan, ~1 week):** triggered only after soak passes. Steps:

1. **Bulk migrate existing AST artifacts to script format** via LLM job:
   - For each row with `documentFormat='ast'`, send the AST JSON to the LLM with a "convert to docx-js script" prompt
   - Validate the resulting script (syntax + sandbox dry-run + magic-byte check)
   - On pass: update row, set `documentFormat='script'`, archive old AST content to versioned S3 key for rollback
   - On fail: leave row as AST, log to a "needs manual review" queue (expected to be small — odd edge cases)
2. **After bulk migration:** count remaining `documentFormat='ast'` rows. If <5% of total `text/document` artifacts, proceed to code removal. Otherwise, iterate on the prompt and re-migrate.
3. **Code removal commit (single PR, easy revert):**
   - Delete `src/lib/document-ast/` (schema, to-docx, examples, validators)
   - Delete `src/features/conversations/components/chat/artifacts/renderers/document-renderer.tsx`
   - Delete the AST branch in `download/route.ts`, `_validate-artifact.ts`, `service.ts`
   - Drop the `documentFormat` column (or hard-default to `'script'`)
   - Remove the legacy banner from artifact-panel
   - Remove the rollback path in `ARTIFACT_DOC_FORMAT_DEFAULT` (keep flag temporarily; remove in next release)
4. **For artifacts that failed bulk migration:** keep as legacy with a clear UI message ("This document uses an old format and can't be edited. Recreate from scratch to use latest features.") OR — if the count is tiny — manually convert each one with engineer attention.

**Rollback during soak:** if any P0 issue surfaces, flip `ARTIFACT_DOC_FORMAT_DEFAULT='ast'` and investigate. New artifacts revert to AST. Phase 2 deferred until issue resolved.

**Why not delete now:** removing AST code in this rebuild PR creates a single-commit migration with no escape hatch. If sandbox or LibreOffice has a bug we didn't catch, every new artifact would fail with no fallback. The phased approach trades 2–4 weeks of duplicate code for safety and rollback.

## 10. Rollback path

If catastrophic issues:
1. Flip `ARTIFACT_DOC_FORMAT_DEFAULT` env var back to `'ast'`
2. New artifacts created from that point use AST format again
3. Already-created script artifacts stay script-format (no auto-rollback per artifact)
4. Investigate, fix, flip back

The legacy AST renderer + `astToDocx` stay in the codebase indefinitely — we never delete the rollback target.

## 10a. Cache eviction strategy

**Problem:** every edit creates a new `contentHash`, leaving old hashes' PNGs orphaned in S3. A single artifact with 20 versions × 10 pages × 100KB = 20MB. A workspace with 1000 artifacts = 20GB. Costs accumulate fast.

**Strategy:**

1. **S3 lifecycle rule** on the `artifact-preview/*` prefix: objects expire 30 days after creation. Active artifacts are re-rendered (and re-cached) on every panel mount, so anything touched recently gets a fresh expiry; truly stale entries age out.
2. **On-write cleanup (best-effort):** when `putCachedPngs(artifactId, newHash, ...)` runs, fire-and-forget delete any keys under `artifact-preview/<artifactId>/` whose hash != newHash AND whose hash != latestVersionHash. Bound this to N=10 deletes per call to avoid blocking. Failures logged, not retried — lifecycle rule is the safety net.
3. **Per-version caps:** if an artifact has >20 cached hashes, evict the oldest (sorted by S3 LastModified) on the next write.

**No reads from CDN/Edge cache** — these are private user previews; serve directly from S3 via signed-url or proxy through Next route handler with `Cache-Control: private, max-age=31536000, immutable` (browsers cache, CDNs don't).

## 11. Test coverage

| Layer | Test |
|---|---|
| Sandbox runner | Inject malicious scripts: infinite loop (timeout), `fs.readFileSync` (rejected), `fetch` call (rejected), `require("net")` (rejected), valid script → docx buffer returned with valid magic bytes. |
| Validator | Syntax errors → reject with error array. Sandbox dry-run timeout → reject. Invalid output → reject. Valid → accept. |
| docx-to-pdf | Sample docx fixture → assert PDF buffer + `%PDF` magic bytes + non-empty. |
| pdf-to-pngs | Sample PDF fixture → assert PNG[] with length matching page count. |
| Pipeline integration | E2E: script fixture → docx → pdf → pngs, verify final PNG count matches expected page count and SHA-256 hash matches a checked-in reference (regenerate with a flag if intentional rendering changes). |
| Renderer | New `document-script-renderer.tsx` mounts, fetches PNGs, displays carousel, paginates, handles loading + error states. |
| Edit flow API | POST `/edit-document` with mock LLM, assert new version persisted with new contentHash and old archived. |
| Migration smoke | Create AST artifact in DB (legacy), assert read-only render, no edit button. |
| Cache | Cache hit returns cached PNGs without re-render. Cache miss triggers render. |

## 12. Performance budget

| Operation | Cold | Warm |
|---|---|---|
| Sandbox script execution (typical doc) | ~500ms | ~200ms |
| LibreOffice docx → pdf | ~2–5s (first call) | ~500ms–1.5s |
| pdftoppm pdf → pngs (5 pages) | ~500ms | ~300ms |
| Total preview render (cold) | ~3–6s | ~1–2s |
| Cache hit (panel load) | <100ms | <100ms |

Cache hit rate target: >90% for steady-state usage (preview triggered once per save, multiple panel mounts share cache).

## 12a. Observability — counters for soak gating

The Phase 2 cleanup criteria (sandbox failure <1%, LibreOffice failure <0.5%) are unverifiable without metrics. Add a lightweight in-process counter module:

```ts
// src/lib/document-script/metrics.ts
interface Counters {
  sandbox_attempts: number
  sandbox_failures: number
  sandbox_duration_ms_total: number   // for averaging
  render_attempts: number
  render_failures: number
  render_duration_ms_total: number
  llm_rewrite_attempts: number
  llm_rewrite_retries: number          // increments per retry, not per call
  llm_rewrite_failures: number
}
```

Persist to memory (resets on process restart — acceptable for sampling). Expose two endpoints under `/api/admin/render-metrics`:

- `GET /api/admin/render-metrics` — returns current counters JSON, gated by `session.user.role === "admin"`
- `POST /api/admin/render-metrics/reset` — reset to zero, admin-only

Operator runs `curl /api/admin/render-metrics` periodically during the soak period and computes failure rates. If we want long-term metrics later, replace the in-memory store with Prometheus / OpenTelemetry exporter — out of scope for v1.

## 13. Out of scope (defer to future tasks)

- LibreOffice daemon mode (warm-start optimization)
- Inline JS editor for script artifacts (Q2=A explicitly says no)
- PDF export format from script artifacts (separate plan; LibreOffice already produces PDF as part of preview pipeline so this is a small follow-up)
- Tracked changes / comments authoring UX (LLM can produce these via script, but no dedicated UI)
- Multi-user collaborative editing of script artifacts

## 13a. Scheduled but separate plan (Phase 2)

These have their own dedicated plan after the 2–4 week soak passes — not "someday":

- Automatic AST → script migration job (LLM-based bulk convert with validation)
- Removing the legacy AST renderer + `astToDocx` + `DocumentAst` schema files
- Dropping the `documentFormat` column (or hard-defaulting to `'script'`)
- Removing the legacy banner from artifact-panel

## 14. Open questions resolved during brainstorming

| Question | Resolution |
|---|---|
| Coexist or replace? | Q1=C — fresh-start, AST goes legacy read-only |
| Inline editor? | Q2=A — prompt-based only |
| Browser-based preview (`docx-preview` lib)? | Rejected — user wants 90–100% confidence, browser libs cap ~90% |
| Server LibreOffice cost acceptable? | Yes — user accepted 250MB disk, ~300MB resident memory |
| Daemon vs per-render soffice? | Per-render initially. Daemon as optimization if needed. |

## 15. Effort estimate

~3–5 weeks engineer-time, single-track:

- Week 1: sandbox runner + validator + DB migration + tool registry hooks
- Week 2: LibreOffice integration + preview pipeline + cache layer
- Week 3: New panel renderer + edit flow API + streaming UX
- Week 4: Prompt rewrite + RAG + integration tests + Docker image
- Week 5: Polish, edge cases, performance tuning, soak test in staging

Implementation should be split into incremental tasks via the writing-plans skill (next step).
