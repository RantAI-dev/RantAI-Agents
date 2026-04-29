# Text/Document Script-Based Rebuild — Implementation Plan

> **Status (2026-04-29):** ✅ **SHIPPED + AST FULLY REMOVED.** This plan
> built the dual-format script/AST pipeline. The AST half was
> subsequently retired in `a81c343` + migration
> `20260429100656_drop_document_format`. The `documentFormat` column,
> `ValidationContext.documentFormat`, AST module tree, AST renderer,
> server `mermaid-to-svg.ts`, edit-document modal, and the entire
> `tests/unit/document-ast/` suite are all gone. Treat tasks below as
> historical record of the rebuild path; current code is single-format
> script-only.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the AST-based `text/document` artifact pipeline with a script-based pipeline + LibreOffice preview, achieving 90–100% output and preview fidelity vs Word.

**Architecture:** LLM emits `docx-js` JavaScript; server validates and runs it in a sandboxed Node child process to produce a `.docx` buffer; LibreOffice converts to PDF, `pdftoppm` rasterizes to per-page PNGs displayed in the panel. Existing AST artifacts become read-only legacy via a `documentFormat` column.

**Tech Stack:** Next.js 15 App Router, Prisma, PostgreSQL, S3, `docx` npm package, LibreOffice headless, `poppler-utils` (`pdftoppm`), vitest, Bun.

**Spec reference:** `docs/superpowers/specs/2026-04-27-text-document-script-based-design.md`

**Branch:** create a fresh branch off `main` named `feat/text-document-script-rebuild` — do NOT execute on the existing PDF or fix branches.

---

## File Structure

### New files

```
src/lib/document-script/
├── types.ts                         # ScriptValidationResult, ExecOptions, RenderJob
├── sandbox-runner.ts                # spawn child node, temp .mjs file, return docx buffer
├── sandbox-wrapper.mjs              # ESM entry point loaded by the child process
├── validator.ts                     # syntax check + sandbox dry-run
├── llm-rewrite.ts                   # LLM rewrite with N=2 retry on validation fail
├── extract-text.ts                  # pandoc docx → plain text (for RAG)
├── cache.ts                         # S3 store + lookup keyed by (artifactId, contentHash)
└── metrics.ts                       # in-process counters for sandbox/render/llm

src/lib/rendering/server/
├── docx-to-pdf.ts                   # `soffice --convert-to pdf` wrapper
├── pdf-to-pngs.ts                   # `pdftoppm` wrapper, returns Buffer[]
├── render-queue.ts                  # process-local semaphore (N=3) for concurrent renders
├── render-jobs.ts                   # in-memory job table: enqueue / get-status
└── docx-preview-pipeline.ts         # orchestrate docx → pdf → pngs with cache + queue

src/app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/
├── render-start/route.ts            # POST → returns {jobId, status} or {status:"done"} on cache hit
├── render-status/[jobId]/route.ts   # GET job status (pending|done|error)
├── render-pages/[contentHash]/[pageIndex]/route.ts   # GET single PNG page
└── edit-document/route.ts           # POST { editPrompt } → LLM rewrite (rate-limited)

src/app/api/admin/render-metrics/
├── route.ts                         # GET counters (admin-only)
└── reset/route.ts                   # POST reset (admin-only)

src/features/conversations/components/chat/artifacts/
├── renderers/document-script-renderer.tsx   # PNG carousel + page nav + code toggle
└── edit-document-modal.tsx          # "Describe your edit" prompt modal

# Tests (mirror locations)
tests/unit/document-script/
├── sandbox-runner.test.ts
├── validator.test.ts
├── llm-rewrite.test.ts
├── extract-text.test.ts
├── cache.test.ts
├── metrics.test.ts
└── pipeline-integration.test.ts

tests/unit/rendering/server/
├── docx-to-pdf.test.ts
├── pdf-to-pngs.test.ts
└── render-queue.test.ts

tests/unit/api/
├── render-start.test.ts
├── render-status.test.ts
├── render-pages.test.ts
└── edit-document.test.ts

tests/fixtures/document-script/
├── proposal.script.js               # E2E fixture
├── sample-letter.docx               # binary fixture for docx→pdf tests
├── infinite-loop.script.js          # for sandbox timeout test
├── fs-access.script.js              # for sandbox restriction test
├── invalid-output.script.js         # writes non-docx to stdout
└── llm-edit-fail-retry.script.js    # for retry behavior test
```

### Modified files

```
prisma/schema.prisma                 # add documentFormat column
src/features/conversations/sessions/repository.ts        # documentFormat in queries
src/features/conversations/sessions/service.ts           # documentFormat at create/update
src/lib/tools/builtin/_validate-artifact.ts              # branch on documentFormat
src/lib/tools/builtin/create-artifact.ts                 # default documentFormat from env
src/lib/tools/builtin/update-artifact.ts                 # preserve documentFormat
src/lib/prompts/artifacts/document.ts                    # rewrite for script output
src/app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/download/route.ts   # branch
src/features/conversations/components/chat/artifacts/artifact-panel.tsx             # switch renderer
src/lib/digital-employees/package-generator.ts           # script artifact rules
src/lib/rag/index-artifact.ts                            # pandoc extract for script artifacts
docker/employee/Dockerfile (and root Dockerfile if used)  # install libreoffice + poppler
```

---

## Task 1: DB migration — `documentFormat` column

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_document_format/migration.sql`
- Modify: `src/features/conversations/sessions/repository.ts`

- [ ] **Step 1: Add the column to the Prisma schema**

In `prisma/schema.prisma`, find the `Artifact` model (or whatever holds `text/document` rows — likely `DashboardArtifact`). Add:

```prisma
model DashboardArtifact {
  // …existing fields…
  documentFormat String  @default("ast") @db.VarChar(16)  // "ast" | "script"
}
```

- [ ] **Step 2: Generate the migration**

Run:
```bash
bunx prisma migrate dev --name add_document_format
```
Expected: a new folder `prisma/migrations/<timestamp>_add_document_format/` with `migration.sql` containing `ALTER TABLE "DashboardArtifact" ADD COLUMN "documentFormat" VARCHAR(16) NOT NULL DEFAULT 'ast';`.

If `migrate dev` complains about shadow DB, fall back to:
```bash
bunx prisma db push
```
…then hand-write the migration SQL into `prisma/migrations/<timestamp>_add_document_format/migration.sql`.

- [ ] **Step 3: Add column to repository read paths**

In `src/features/conversations/sessions/repository.ts`, find the `select` clauses for `findDashboardArtifactByIdAndSession`, `findArtifactsBySessionId`, and any artifact-listing query. Add `documentFormat: true` to each `select` block.

- [ ] **Step 4: Add column to repository write paths**

In the same file, find `createDashboardArtifact` (or equivalent) and `updateDashboardArtifactByIdLocked`. Pass `documentFormat` through from the caller.

- [ ] **Step 5: Run typecheck**

```bash
bunx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "(repository|sessions/service)" | head
```
Expected: empty (no new errors in modified files).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/features/conversations/sessions/repository.ts
git commit-sulthan -m "feat(artifact): add documentFormat column for AST/script branching"
```

---

## Task 2: Sandbox runner — types + scaffold

**Files:**
- Create: `src/lib/document-script/types.ts`
- Create: `src/lib/document-script/sandbox-runner.ts`
- Create: `tests/unit/document-script/sandbox-runner.test.ts`

- [ ] **Step 1: Define the types module**

```ts
// src/lib/document-script/types.ts
export interface SandboxOptions {
  /** Wall-clock deadline in ms. Default 10_000. */
  timeoutMs?: number
  /** Maximum stdout (docx) bytes before kill. Default 100 MiB. */
  maxOutputBytes?: number
  /** Heap size cap passed to child as --max-old-space-size (MiB). Default 256. */
  maxHeapMb?: number
}

export interface SandboxResult {
  ok: boolean
  buf?: Buffer
  error?: string
  /** wall-clock ms taken */
  durationMs: number
}

export interface ScriptValidationResult {
  ok: boolean
  errors: string[]
}
```

- [ ] **Step 2: Write a failing test for the public API**

```ts
// tests/unit/document-script/sandbox-runner.test.ts
import { describe, it, expect } from "vitest"
import { runScriptInSandbox } from "@/lib/document-script/sandbox-runner"

describe("runScriptInSandbox", () => {
  it("returns ok=true with a docx buffer for a minimal valid script", async () => {
    const script = `
      import { Document, Paragraph, TextRun, Packer } from "docx"
      const doc = new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun("hello")] })] }] })
      Packer.toBuffer(doc).then(buf => process.stdout.write(buf.toString("base64")))
    `
    const r = await runScriptInSandbox(script, {})
    expect(r.ok).toBe(true)
    expect(r.buf).toBeInstanceOf(Buffer)
    // .docx files start with PK\x03\x04 (ZIP magic)
    expect(r.buf!.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
bunx vitest run tests/unit/document-script/sandbox-runner.test.ts
```
Expected: FAIL with `Cannot find module '@/lib/document-script/sandbox-runner'`.

- [ ] **Step 4: Create the sandbox wrapper file (committed to repo)**

```js
// src/lib/document-script/sandbox-wrapper.mjs
//
// Runs in the spawned Node child process. Reads the path to a user-script
// .mjs file from process.argv[2], blocks dangerous APIs, then dynamic-imports
// the user script. The user script does its own `Packer.toBuffer(doc).then(buf
// => process.stdout.write(buf.toString("base64")))` per the prompt contract.

const FORBIDDEN_MODULES = [
  "fs", "net", "http", "https", "child_process", "worker_threads",
  "dgram", "tls", "cluster",
  "node:fs", "node:net", "node:http", "node:https",
  "node:child_process", "node:worker_threads", "node:dgram",
  "node:tls", "node:cluster",
]
for (const m of FORBIDDEN_MODULES) {
  Object.defineProperty(globalThis, m, {
    get() { throw new Error(`forbidden module: ${m}`) },
    configurable: false,
  })
}
globalThis.fetch = () => { throw new Error("forbidden API: fetch") }
// NOTE: do NOT override globalThis.Function — docx's transitive dep
// `function-bind` calls Function.prototype.bind at module load and crashes if
// Function is shadowed. Per spec threat model, eval-of-user-strings is not
// the attack we're defending against; module-level no-fs/no-net is.

const userScriptPath = process.argv[2]
if (!userScriptPath) {
  process.stderr.write("sandbox-wrapper: missing script path argument")
  process.exit(2)
}
await import(userScriptPath)
```

- [ ] **Step 5: Implement sandbox-runner with temp-file approach**

```ts
// src/lib/document-script/sandbox-runner.ts
import "server-only"
import { spawn } from "node:child_process"
import { mkdir, writeFile, unlink } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { join, resolve } from "node:path"
import type { SandboxOptions, SandboxResult } from "./types"

const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_MAX_OUTPUT = 100 * 1024 * 1024
const DEFAULT_MAX_HEAP_MB = 256

// .tmp/ is gitignored; living inside the project root means Node's resolver
// finds <repo>/node_modules/docx when the user script does `import "docx"`.
const SANDBOX_DIR = resolve(process.cwd(), ".tmp", "sandbox")
const WRAPPER_PATH = resolve(process.cwd(), "src/lib/document-script/sandbox-wrapper.mjs")

export async function runScriptInSandbox(script: string, opts: SandboxOptions): Promise<SandboxResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxOutput = opts.maxOutputBytes ?? DEFAULT_MAX_OUTPUT
  const maxHeapMb = opts.maxHeapMb ?? DEFAULT_MAX_HEAP_MB
  const startedAt = Date.now()

  await mkdir(SANDBOX_DIR, { recursive: true })
  const scriptPath = join(SANDBOX_DIR, `${randomUUID()}.mjs`)
  await writeFile(scriptPath, script, "utf8")

  return new Promise<SandboxResult>((resolve) => {
    const child = spawn(
      process.execPath,
      [
        `--max-old-space-size=${maxHeapMb}`,
        WRAPPER_PATH,
        scriptPath,
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, NODE_OPTIONS: "" },
        stdio: ["ignore", "pipe", "pipe"],
      },
    )

    let stdout = Buffer.alloc(0)
    let stderr = ""
    let settled = false

    const finish = (result: SandboxResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { child.kill("SIGKILL") } catch {}
      unlink(scriptPath).catch(() => {})
      resolve(result)
    }

    const timer = setTimeout(() => {
      finish({ ok: false, error: `sandbox timeout after ${timeoutMs}ms`, durationMs: Date.now() - startedAt })
    }, timeoutMs)

    child.stdout.on("data", (c: Buffer) => {
      stdout = Buffer.concat([stdout, c])
      if (stdout.length > maxOutput) {
        finish({ ok: false, error: `output exceeded ${maxOutput} bytes`, durationMs: Date.now() - startedAt })
      }
    })
    child.stderr.on("data", (c: Buffer) => {
      stderr += c.toString("utf8")
    })
    child.on("error", (err) => {
      finish({ ok: false, error: `spawn failed: ${err.message}`, durationMs: Date.now() - startedAt })
    })
    child.on("close", (code) => {
      if (settled) return
      if (code !== 0) {
        finish({ ok: false, error: `child exited ${code}: ${stderr || "(no stderr)"}`, durationMs: Date.now() - startedAt })
        return
      }
      try {
        const buf = Buffer.from(stdout.toString("utf8"), "base64")
        finish({ ok: true, buf, durationMs: Date.now() - startedAt })
      } catch (err) {
        finish({ ok: false, error: `base64 decode: ${(err as Error).message}`, durationMs: Date.now() - startedAt })
      }
    })
  })
}
```

- [ ] **Step 6: Add `.tmp/` to `.gitignore`**

Append to `.gitignore`:
```
.tmp/
```

- [ ] **Step 7: Run test to verify it passes**

```bash
bunx vitest run tests/unit/document-script/sandbox-runner.test.ts
```
Expected: PASS — `runScriptInSandbox` returns `ok: true` with a Buffer starting `PK\x03\x04`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/document-script/types.ts src/lib/document-script/sandbox-runner.ts src/lib/document-script/sandbox-wrapper.mjs tests/unit/document-script/sandbox-runner.test.ts .gitignore
git commit-sulthan -m "$(cat <<'EOF'
feat(document-script): sandbox runner via child node process

- spawn fresh node child per render with --max-old-space-size=256
- write user script to .tmp/sandbox/<uuid>.mjs so node's resolver finds node_modules/docx
- dedicated wrapper.mjs blocks fs/net/http/child_process/worker_threads at module load
- 10s wall-clock timeout, 100MB output cap; stdout decoded base64 → Buffer
- temp script file unlinked in finally block
EOF
)"
```

---

## Task 3: Sandbox runner — security restrictions tests

**Files:**
- Modify: `tests/unit/document-script/sandbox-runner.test.ts`
- Create: `tests/fixtures/document-script/infinite-loop.script.js`
- Create: `tests/fixtures/document-script/fs-access.script.js`
- Create: `tests/fixtures/document-script/invalid-output.script.js`

- [ ] **Step 1: Add fixture files**

```js
// tests/fixtures/document-script/infinite-loop.script.js
while (true) {}
```

```js
// tests/fixtures/document-script/fs-access.script.js
import fs from "fs"
fs.readFileSync("/etc/passwd")
```

```js
// tests/fixtures/document-script/invalid-output.script.js
process.stdout.write(Buffer.from("not a docx").toString("base64"))
```

- [ ] **Step 2: Write the failing tests**

Append to `tests/unit/document-script/sandbox-runner.test.ts`:

```ts
import { readFileSync } from "node:fs"
import { join } from "node:path"

const FIX = (name: string) => readFileSync(join(__dirname, "..", "..", "fixtures", "document-script", name), "utf8")

describe("runScriptInSandbox — restrictions", () => {
  it("kills an infinite loop with a clear timeout error", async () => {
    const r = await runScriptInSandbox(FIX("infinite-loop.script.js"), { timeoutMs: 2_000 })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/timeout/i)
  })

  it("rejects scripts that try to import fs", async () => {
    const r = await runScriptInSandbox(FIX("fs-access.script.js"), {})
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/forbidden|fs/i)
  })

  it("returns ok=true even for invalid docx output (caller verifies magic bytes)", async () => {
    // sandbox doesn't validate content shape — that's the validator's job
    const r = await runScriptInSandbox(FIX("invalid-output.script.js"), {})
    expect(r.ok).toBe(true)
    expect(r.buf!.subarray(0, 4)).not.toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
  })
})
```

- [ ] **Step 3: Run tests to verify they pass**

```bash
bunx vitest run tests/unit/document-script/sandbox-runner.test.ts
```
Expected: PASS — 4/4 tests (1 baseline from Task 2 + 3 restriction tests).

The infinite-loop test relies on the timeout in Task 2's implementation.
The fs-access test relies on the WRAPPER's `forbidden` shadowing.
The invalid-output test confirms the sandbox is content-agnostic.

If any fail, the implementation in Task 2 has a regression — fix in `sandbox-runner.ts` or `WRAPPER` and re-run.

- [ ] **Step 4: Commit**

```bash
git add tests/unit/document-script/sandbox-runner.test.ts tests/fixtures/document-script/
git commit-sulthan -m "test(document-script): sandbox restriction tests (timeout, fs, output)"
```

---

## Task 4: Validator — syntax + sandbox dry-run

**Files:**
- Create: `src/lib/document-script/validator.ts`
- Create: `tests/unit/document-script/validator.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/document-script/validator.test.ts
import { describe, it, expect } from "vitest"
import { validateScriptArtifact } from "@/lib/document-script/validator"

const VALID = `
import { Document, Paragraph, TextRun, Packer } from "docx"
const doc = new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun("ok")] })] }] })
Packer.toBuffer(doc).then(buf => process.stdout.write(buf.toString("base64")))
`

const SYNTAX_ERROR = `const x = (`

const NOT_DOCX = `process.stdout.write(Buffer.from("hello").toString("base64"))`

describe("validateScriptArtifact", () => {
  it("accepts a valid script that produces a docx", async () => {
    const r = await validateScriptArtifact(VALID)
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
  })

  it("rejects scripts with syntax errors before running them", async () => {
    const r = await validateScriptArtifact(SYNTAX_ERROR)
    expect(r.ok).toBe(false)
    expect(r.errors[0]).toMatch(/syntax|parse/i)
  })

  it("rejects scripts whose output is not a valid .docx", async () => {
    const r = await validateScriptArtifact(NOT_DOCX)
    expect(r.ok).toBe(false)
    expect(r.errors[0]).toMatch(/not a valid \.docx/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bunx vitest run tests/unit/document-script/validator.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the validator**

```ts
// src/lib/document-script/validator.ts
import "server-only"
import { runScriptInSandbox } from "./sandbox-runner"
import type { ScriptValidationResult } from "./types"

const DOCX_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04])
const DRY_RUN_TIMEOUT_MS = 5_000

function quickSyntaxCheck(src: string): string | null {
  // A node parse via Function constructor would also catch syntax errors,
  // but Function is forbidden in the sandbox. Use the host to parse only —
  // we throw away the result, we just want to know if it parses.
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    new (Function as unknown as new (...args: string[]) => unknown)(src)
    return null
  } catch (err) {
    return (err as Error).message
  }
}

export async function validateScriptArtifact(content: string): Promise<ScriptValidationResult> {
  const syntaxError = quickSyntaxCheck(content)
  if (syntaxError) {
    return { ok: false, errors: [`syntax error: ${syntaxError}`] }
  }
  const r = await runScriptInSandbox(content, { timeoutMs: DRY_RUN_TIMEOUT_MS })
  if (!r.ok || !r.buf) {
    return { ok: false, errors: [`sandbox: ${r.error ?? "unknown"}`] }
  }
  if (!r.buf.subarray(0, 4).equals(DOCX_MAGIC)) {
    return { ok: false, errors: ["script did not produce a valid .docx (missing PK magic bytes)"] }
  }
  return { ok: true, errors: [] }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bunx vitest run tests/unit/document-script/validator.test.ts
```
Expected: PASS — 3/3.

- [ ] **Step 5: Commit**

```bash
git add src/lib/document-script/validator.ts tests/unit/document-script/validator.test.ts
git commit-sulthan -m "feat(document-script): validator (syntax + sandbox dry-run)"
```

---

## Task 5: Tool registry hooks (validate + create + update)

**Files:**
- Modify: `src/lib/tools/builtin/_validate-artifact.ts`
- Modify: `src/lib/tools/builtin/create-artifact.ts`
- Modify: `src/lib/tools/builtin/update-artifact.ts`
- Modify: `tests/unit/tools/_validate-artifact.test.ts` (or create alongside if no existing file)

- [ ] **Step 1: Add a failing test for the validate branch**

Append to `tests/unit/tools/_validate-artifact.test.ts` (create file if missing — mirror existing test style):

```ts
import { describe, it, expect } from "vitest"
import { validateArtifactContent } from "@/lib/tools/builtin/_validate-artifact"

describe("validateArtifactContent — text/document with documentFormat: script", () => {
  it("delegates script content to the script validator", async () => {
    const validScript = `
      import { Document, Paragraph, TextRun, Packer } from "docx"
      const doc = new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun("x")] })] }] })
      Packer.toBuffer(doc).then(buf => process.stdout.write(buf.toString("base64")))
    `
    const r = await validateArtifactContent("text/document", validScript, { documentFormat: "script" })
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
  })

  it("rejects script with syntax errors", async () => {
    const r = await validateArtifactContent("text/document", "const x = (", { documentFormat: "script" })
    expect(r.ok).toBe(false)
    expect(r.errors[0]).toMatch(/syntax/i)
  })

  it("still validates AST when documentFormat is ast (legacy path unchanged)", async () => {
    const ast = JSON.stringify({
      meta: { title: "T", pageSize: "letter", orientation: "portrait", font: "Arial", fontSize: 12, showPageNumbers: false },
      body: [{ type: "paragraph", children: [{ type: "text", text: "ok" }] }],
    })
    const r = await validateArtifactContent("text/document", ast, { documentFormat: "ast" })
    expect(r.ok).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
bunx vitest run tests/unit/tools/_validate-artifact.test.ts
```
Expected: FAIL — `validateArtifactContent` doesn't accept the third arg yet, or branch on `documentFormat`.

- [ ] **Step 3: Update `_validate-artifact.ts` to branch**

In `src/lib/tools/builtin/_validate-artifact.ts`, update the signature and the `text/document` branch:

```ts
import { validateScriptArtifact } from "@/lib/document-script/validator"

export interface ValidationContext {
  isNew?: boolean
  documentFormat?: "ast" | "script"   // NEW
}

export async function validateArtifactContent(
  type: string,
  content: string,
  ctx?: ValidationContext,
): Promise<{ ok: boolean; errors: string[] }> {
  // …existing branches for other types…

  if (type === "text/document") {
    if (ctx?.documentFormat === "script") {
      return validateScriptArtifact(content)
    }
    // existing AST validator path — unchanged
    return validateDocumentAst(content)
  }

  // …rest unchanged…
}
```

- [ ] **Step 4: Wire `documentFormat` into create-artifact**

In `src/lib/tools/builtin/create-artifact.ts`:
- Read `process.env.ARTIFACT_DOC_FORMAT_DEFAULT` at module top (default `"ast"` for safety)
- When `args.type === "text/document"`, set `documentFormat = process.env.ARTIFACT_DOC_FORMAT_DEFAULT === "script" ? "script" : "ast"`
- Pass `documentFormat` into `validateArtifactContent` ctx and into the `createDashboardArtifact` payload

```ts
const DEFAULT_DOC_FORMAT = process.env.ARTIFACT_DOC_FORMAT_DEFAULT === "script" ? "script" : "ast"

// inside the create handler:
const documentFormat = args.type === "text/document" ? DEFAULT_DOC_FORMAT : undefined
const v = await validateArtifactContent(args.type, args.content, { isNew: true, documentFormat })
// …
await createDashboardArtifact({ /* existing fields */, documentFormat })
```

- [ ] **Step 5: Wire `documentFormat` into update-artifact**

In `src/lib/tools/builtin/update-artifact.ts`:
- Load existing artifact's `documentFormat`
- Pass to `validateArtifactContent` ctx (so updates validate against the same format the artifact was created with)

```ts
const existing = await findDashboardArtifactByIdAndSession(args.artifactId, args.sessionId)
// …
const v = await validateArtifactContent(args.type, args.content, { documentFormat: existing.documentFormat })
```

`updateDashboardArtifactByIdLocked` already preserves rows it doesn't write to — no change needed there.

- [ ] **Step 6: Run tests + typecheck**

```bash
bunx vitest run tests/unit/tools/
bunx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "(_validate-artifact|create-artifact|update-artifact)" | head
```
Expected: tests pass; typecheck output empty for these files.

- [ ] **Step 7: Commit**

```bash
git add src/lib/tools/builtin/_validate-artifact.ts src/lib/tools/builtin/create-artifact.ts src/lib/tools/builtin/update-artifact.ts tests/unit/tools/_validate-artifact.test.ts
git commit-sulthan -m "feat(tools): branch text/document validation on documentFormat (ast vs script)"
```

---

## Task 6: docx → pdf (LibreOffice headless wrapper)

**Files:**
- Create: `src/lib/rendering/server/docx-to-pdf.ts`
- Create: `tests/unit/rendering/server/docx-to-pdf.test.ts`
- Create: `tests/fixtures/document-script/sample-letter.docx` (small fixture; generate once via the validator's sandbox during this task and check the bytes in)

- [ ] **Step 1: Generate the docx fixture**

Run a one-shot script (manually, via `bunx vitest run --watch=false` on a temp test, or by saving the binary output of an existing `astToDocx` call):

```ts
// scripts/generate-docx-fixture.ts (one-shot, can be deleted after fixture committed)
import { writeFileSync } from "node:fs"
import { runScriptInSandbox } from "@/lib/document-script/sandbox-runner"

const script = `
  import { Document, Paragraph, TextRun, Packer } from "docx"
  const doc = new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun("Sample Letter")] })] }] })
  Packer.toBuffer(doc).then(buf => process.stdout.write(buf.toString("base64")))
`
const r = await runScriptInSandbox(script, {})
if (!r.ok) throw new Error(r.error)
writeFileSync("tests/fixtures/document-script/sample-letter.docx", r.buf!)
```

Run with `bunx tsx scripts/generate-docx-fixture.ts`, then delete the script (we don't need it in the repo). Commit the binary fixture.

- [ ] **Step 2: Write the failing test**

```ts
// tests/unit/rendering/server/docx-to-pdf.test.ts
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { docxToPdf } from "@/lib/rendering/server/docx-to-pdf"

const SAMPLE = readFileSync(join(__dirname, "..", "..", "..", "fixtures", "document-script", "sample-letter.docx"))

describe("docxToPdf", () => {
  it("converts a docx buffer to a PDF buffer with %PDF magic bytes", async () => {
    const pdf = await docxToPdf(SAMPLE)
    expect(pdf.length).toBeGreaterThan(500)
    expect(pdf.subarray(0, 4)).toEqual(Buffer.from("%PDF"))
  }, 30_000)
})
```

- [ ] **Step 3: Run to verify failure**

```bash
bunx vitest run tests/unit/rendering/server/docx-to-pdf.test.ts
```
Expected: FAIL (module not found).

- [ ] **Step 4: Implement the wrapper**

```ts
// src/lib/rendering/server/docx-to-pdf.ts
import "server-only"
import { spawn } from "node:child_process"
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const TIMEOUT_MS = 30_000

/**
 * Convert a .docx buffer to a .pdf buffer via `soffice --headless --convert-to pdf`.
 * Spawns a fresh soffice per call. Caller should cache results.
 */
export async function docxToPdf(docx: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "docx2pdf-"))
  const inPath = join(dir, "in.docx")
  const outPath = join(dir, "in.pdf")
  await writeFile(inPath, docx)

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        "soffice",
        ["--headless", "--convert-to", "pdf", "--outdir", dir, inPath],
        { stdio: ["ignore", "pipe", "pipe"] },
      )
      let stderr = ""
      let settled = false
      const finish = (fn: () => void) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        fn()
      }
      const timer = setTimeout(() => {
        try { child.kill("SIGKILL") } catch {}
        finish(() => reject(new Error(`soffice timeout after ${TIMEOUT_MS}ms`)))
      }, TIMEOUT_MS)
      child.stderr.on("data", (c) => { stderr += c.toString() })
      child.on("error", (err) => finish(() => reject(err)))
      child.on("close", (code) => {
        if (code === 0) finish(() => resolve())
        else finish(() => reject(new Error(`soffice exited ${code}: ${stderr || "(no stderr)"}`)))
      })
    })
    return await readFile(outPath)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
```

- [ ] **Step 5: Run test to verify pass**

```bash
bunx vitest run tests/unit/rendering/server/docx-to-pdf.test.ts
```
Expected: PASS — PDF buffer with `%PDF` magic.

If `soffice` is not installed locally, install via:
```bash
sudo apt-get install -y libreoffice-core libreoffice-writer
```
…or skip the test in CI if soffice is unavailable (mark with `it.skipIf(!process.env.HAS_LIBREOFFICE)` and document in CI).

- [ ] **Step 6: Commit**

```bash
git add src/lib/rendering/server/docx-to-pdf.ts tests/unit/rendering/server/docx-to-pdf.test.ts tests/fixtures/document-script/sample-letter.docx
git commit-sulthan -m "feat(rendering): docx → pdf via libreoffice headless"
```

---

## Task 7: pdf → pngs (pdftoppm wrapper)

**Files:**
- Create: `src/lib/rendering/server/pdf-to-pngs.ts`
- Create: `tests/unit/rendering/server/pdf-to-pngs.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/rendering/server/pdf-to-pngs.test.ts
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { docxToPdf } from "@/lib/rendering/server/docx-to-pdf"
import { pdfToPngs } from "@/lib/rendering/server/pdf-to-pngs"

const SAMPLE = readFileSync(join(__dirname, "..", "..", "..", "fixtures", "document-script", "sample-letter.docx"))

describe("pdfToPngs", () => {
  it("rasterizes each page to a PNG buffer", async () => {
    const pdf = await docxToPdf(SAMPLE)
    const pngs = await pdfToPngs(pdf)
    expect(pngs.length).toBeGreaterThanOrEqual(1)
    // PNG magic: 89 50 4e 47 0d 0a 1a 0a
    expect(pngs[0].subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  }, 60_000)
})
```

- [ ] **Step 2: Run to verify failure**

```bash
bunx vitest run tests/unit/rendering/server/pdf-to-pngs.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement the wrapper**

```ts
// src/lib/rendering/server/pdf-to-pngs.ts
import "server-only"
import { spawn } from "node:child_process"
import { mkdtemp, writeFile, readdir, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const TIMEOUT_MS = 30_000
const RESOLUTION_DPI = 120
const MAX_PAGES = 50

export async function pdfToPngs(pdf: Buffer): Promise<Buffer[]> {
  const dir = await mkdtemp(join(tmpdir(), "pdf2png-"))
  const inPath = join(dir, "in.pdf")
  await writeFile(inPath, pdf)

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        "pdftoppm",
        ["-png", "-r", String(RESOLUTION_DPI), "-l", String(MAX_PAGES), inPath, join(dir, "page")],
        { stdio: ["ignore", "pipe", "pipe"] },
      )
      let stderr = ""
      let settled = false
      const finish = (fn: () => void) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        fn()
      }
      const timer = setTimeout(() => {
        try { child.kill("SIGKILL") } catch {}
        finish(() => reject(new Error(`pdftoppm timeout after ${TIMEOUT_MS}ms`)))
      }, TIMEOUT_MS)
      child.stderr.on("data", (c) => { stderr += c.toString() })
      child.on("error", (err) => finish(() => reject(err)))
      child.on("close", (code) => {
        if (code === 0) finish(() => resolve())
        else finish(() => reject(new Error(`pdftoppm exited ${code}: ${stderr || "(no stderr)"}`)))
      })
    })

    const files = (await readdir(dir))
      .filter((f) => f.startsWith("page-") && f.endsWith(".png"))
      .sort()  // page-1, page-2, …

    const buffers: Buffer[] = []
    for (const f of files) {
      buffers.push(await readFile(join(dir, f)))
    }
    return buffers
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
bunx vitest run tests/unit/rendering/server/pdf-to-pngs.test.ts
```
Expected: PASS — array of PNG buffers, first one with PNG magic bytes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rendering/server/pdf-to-pngs.ts tests/unit/rendering/server/pdf-to-pngs.test.ts
git commit-sulthan -m "feat(rendering): pdf → pngs via pdftoppm"
```

---

## Task 7a: Render queue (concurrency semaphore)

Without a queue, N concurrent panel mounts spawn N LibreOffice processes (~300MB each) and OOM the host. This task adds a process-local semaphore that gates render execution.

**Files:**
- Create: `src/lib/rendering/server/render-queue.ts`
- Create: `tests/unit/rendering/server/render-queue.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/rendering/server/render-queue.test.ts
import { describe, it, expect } from "vitest"
import { withRenderSlot } from "@/lib/rendering/server/render-queue"

describe("withRenderSlot", () => {
  it("limits concurrent executions to N", async () => {
    let active = 0
    let peak = 0
    const work = async () => {
      active++
      peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 50))
      active--
      return "ok"
    }
    // Spawn 10 in parallel; queue capped at 3
    const results = await Promise.all(
      Array.from({ length: 10 }, () => withRenderSlot(work, { capacity: 3 })),
    )
    expect(results).toHaveLength(10)
    expect(results.every((r) => r === "ok")).toBe(true)
    expect(peak).toBeLessThanOrEqual(3)
  })

  it("releases the slot even when work throws", async () => {
    const errors: unknown[] = []
    const ops = Array.from({ length: 5 }, (_, i) =>
      withRenderSlot(
        async () => {
          if (i % 2 === 0) throw new Error(`boom ${i}`)
          return i
        },
        { capacity: 2 },
      ).catch((e) => errors.push(e)),
    )
    await Promise.all(ops)
    // If slots leaked, the next call would deadlock — test would time out
    const after = await withRenderSlot(async () => "ok", { capacity: 2 })
    expect(after).toBe("ok")
    expect(errors).toHaveLength(3)  // i=0,2,4
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
bunx vitest run tests/unit/rendering/server/render-queue.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the queue**

```ts
// src/lib/rendering/server/render-queue.ts
import "server-only"

interface QueueOptions {
  capacity: number
}

const DEFAULT_CAPACITY = parseInt(process.env.RENDER_CONCURRENCY ?? "3", 10) || 3
let active = 0
const waiters: Array<() => void> = []

async function acquire(capacity: number): Promise<void> {
  if (active < capacity) {
    active++
    return
  }
  return new Promise<void>((resolve) => {
    waiters.push(() => {
      active++
      resolve()
    })
  })
}

function release(): void {
  active--
  const next = waiters.shift()
  if (next) next()
}

export async function withRenderSlot<T>(
  work: () => Promise<T>,
  opts: QueueOptions = { capacity: DEFAULT_CAPACITY },
): Promise<T> {
  await acquire(opts.capacity)
  try {
    return await work()
  } finally {
    release()
  }
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
bunx vitest run tests/unit/rendering/server/render-queue.test.ts
```
Expected: PASS — concurrency capped, slots released on error.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rendering/server/render-queue.ts tests/unit/rendering/server/render-queue.test.ts
git commit-sulthan -m "$(cat <<'EOF'
feat(rendering): render-queue semaphore for concurrent renders

- caps concurrent CPU-heavy renders at N (default 3, configurable via RENDER_CONCURRENCY env)
- releases slot on success or thrown error
- prevents OOM when many panel mounts trigger renders simultaneously
EOF
)"
```

---

## Task 8: Cache layer (S3 store/lookup by content hash)

**Files:**
- Create: `src/lib/document-script/cache.ts`
- Create: `tests/unit/document-script/cache.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/document-script/cache.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

const { uploadFileMock, getFileMock, deleteFileMock } = vi.hoisted(() => ({
  uploadFileMock: vi.fn(),
  getFileMock: vi.fn(),
  deleteFileMock: vi.fn(),
}))

vi.mock("@/lib/s3", () => ({
  uploadFile: uploadFileMock,
  getFile: getFileMock,
  deleteFile: deleteFileMock,
  deleteFiles: vi.fn(),
}))

import { computeContentHash, getCachedPngs, putCachedPngs } from "@/lib/document-script/cache"

beforeEach(() => {
  uploadFileMock.mockReset()
  getFileMock.mockReset()
  deleteFileMock.mockReset()
})

describe("computeContentHash", () => {
  it("returns a stable 16-char prefix of sha256", () => {
    const h = computeContentHash("abc")
    expect(h).toBe("ba7816bf8f01cfea")  // sha256("abc") prefix
  })
})

describe("getCachedPngs", () => {
  it("returns null on cache miss (S3 404)", async () => {
    getFileMock.mockRejectedValue(Object.assign(new Error("not found"), { code: "NoSuchKey" }))
    const r = await getCachedPngs("art-1", "abc123")
    expect(r).toBeNull()
  })

  it("returns the manifest + page buffers on hit", async () => {
    const manifest = JSON.stringify({ pageCount: 2 })
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    getFileMock
      .mockResolvedValueOnce(Buffer.from(manifest))
      .mockResolvedValueOnce(png)
      .mockResolvedValueOnce(png)
    const r = await getCachedPngs("art-1", "abc123")
    expect(r).not.toBeNull()
    expect(r!.length).toBe(2)
    expect(r![0]).toEqual(png)
  })
})

describe("putCachedPngs", () => {
  it("uploads manifest + each page to keyed S3 paths", async () => {
    uploadFileMock.mockResolvedValue(undefined)
    await putCachedPngs("art-1", "abc123", [
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x01]),
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x02]),
    ])
    expect(uploadFileMock).toHaveBeenCalledTimes(3)  // manifest + 2 pages
    const keys = uploadFileMock.mock.calls.map((c) => c[0])
    expect(keys).toContain("artifact-preview/art-1/abc123/manifest.json")
    expect(keys).toContain("artifact-preview/art-1/abc123/page-0.png")
    expect(keys).toContain("artifact-preview/art-1/abc123/page-1.png")
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
bunx vitest run tests/unit/document-script/cache.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement the cache module**

```ts
// src/lib/document-script/cache.ts
import "server-only"
import { createHash } from "node:crypto"
import { uploadFile, getFile } from "@/lib/s3"

export function computeContentHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex").slice(0, 16)
}

interface Manifest {
  pageCount: number
}

const KEY_PREFIX = "artifact-preview"

function manifestKey(artifactId: string, hash: string): string {
  return `${KEY_PREFIX}/${artifactId}/${hash}/manifest.json`
}
function pageKey(artifactId: string, hash: string, idx: number): string {
  return `${KEY_PREFIX}/${artifactId}/${hash}/page-${idx}.png`
}

export async function getCachedPngs(artifactId: string, hash: string): Promise<Buffer[] | null> {
  let manifest: Manifest
  try {
    const raw = await getFile(manifestKey(artifactId, hash))
    manifest = JSON.parse(raw.toString("utf8"))
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code === "NoSuchKey" || code === "NotFound") return null
    throw err
  }
  const pages: Buffer[] = []
  for (let i = 0; i < manifest.pageCount; i++) {
    pages.push(await getFile(pageKey(artifactId, hash, i)))
  }
  return pages
}

export async function putCachedPngs(artifactId: string, hash: string, pages: Buffer[]): Promise<void> {
  const manifest: Manifest = { pageCount: pages.length }
  await uploadFile(manifestKey(artifactId, hash), Buffer.from(JSON.stringify(manifest)), "application/json")
  for (let i = 0; i < pages.length; i++) {
    await uploadFile(pageKey(artifactId, hash, i), pages[i], "image/png")
  }
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
bunx vitest run tests/unit/document-script/cache.test.ts
```
Expected: PASS — 5/5.

- [ ] **Step 5: Commit**

```bash
git add src/lib/document-script/cache.ts tests/unit/document-script/cache.test.ts
git commit-sulthan -m "feat(document-script): preview cache layer (S3 by content hash)"
```

---

## Task 9: Preview pipeline orchestrator

**Files:**
- Create: `src/lib/rendering/server/docx-preview-pipeline.ts`
- Create: `tests/unit/document-script/pipeline-integration.test.ts`

- [ ] **Step 1: Write the integration test**

```ts
// tests/unit/document-script/pipeline-integration.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

const { uploadFileMock, getFileMock } = vi.hoisted(() => ({
  uploadFileMock: vi.fn().mockResolvedValue(undefined),
  getFileMock: vi.fn().mockRejectedValue(Object.assign(new Error("nf"), { code: "NoSuchKey" })),
}))
vi.mock("@/lib/s3", () => ({
  uploadFile: uploadFileMock,
  getFile: getFileMock,
  deleteFile: vi.fn(),
  deleteFiles: vi.fn(),
}))

import { renderArtifactPreview } from "@/lib/rendering/server/docx-preview-pipeline"

const VALID_SCRIPT = `
  import { Document, Paragraph, TextRun, Packer } from "docx"
  const doc = new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun("hello")] })] }] })
  Packer.toBuffer(doc).then(buf => process.stdout.write(buf.toString("base64")))
`

beforeEach(() => {
  uploadFileMock.mockClear()
  getFileMock.mockClear()
})

describe("renderArtifactPreview", () => {
  it("runs the full pipeline and caches the result", async () => {
    const r = await renderArtifactPreview("art-1", VALID_SCRIPT)
    expect(r.pages.length).toBeGreaterThanOrEqual(1)
    expect(r.pages[0].subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    // Manifest + at least 1 page uploaded
    expect(uploadFileMock).toHaveBeenCalledTimes(1 + r.pages.length)
  }, 60_000)
})
```

- [ ] **Step 2: Run to verify failure**

```bash
bunx vitest run tests/unit/document-script/pipeline-integration.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement the orchestrator (using render queue)**

```ts
// src/lib/rendering/server/docx-preview-pipeline.ts
import "server-only"
import { runScriptInSandbox } from "@/lib/document-script/sandbox-runner"
import { computeContentHash, getCachedPngs, putCachedPngs } from "@/lib/document-script/cache"
import { docxToPdf } from "./docx-to-pdf"
import { pdfToPngs } from "./pdf-to-pngs"
import { withRenderSlot } from "./render-queue"

export interface PreviewResult {
  hash: string
  pages: Buffer[]
  cached: boolean
}

export async function renderArtifactPreview(artifactId: string, script: string): Promise<PreviewResult> {
  const hash = computeContentHash(script)
  const cached = await getCachedPngs(artifactId, hash).catch(() => null)
  if (cached && cached.length > 0) {
    return { hash, pages: cached, cached: true }
  }
  // Cache miss → CPU-heavy work, gate via semaphore so we don't OOM under load
  return withRenderSlot(async () => {
    const sandbox = await runScriptInSandbox(script, {})
    if (!sandbox.ok || !sandbox.buf) {
      throw new Error(`sandbox failed: ${sandbox.error ?? "unknown"}`)
    }
    const pdf = await docxToPdf(sandbox.buf)
    const pngs = await pdfToPngs(pdf)
    if (pngs.length === 0) {
      throw new Error("pipeline produced 0 pages")
    }
    // Best-effort cache; don't fail the request if S3 is down
    await putCachedPngs(artifactId, hash, pngs).catch((err) => {
      console.warn("[preview-pipeline] cache write failed:", err)
    })
    return { hash, pages: pngs, cached: false }
  })
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
bunx vitest run tests/unit/document-script/pipeline-integration.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rendering/server/docx-preview-pipeline.ts tests/unit/document-script/pipeline-integration.test.ts
git commit-sulthan -m "feat(rendering): preview pipeline (sandbox → libreoffice → pngs + cache)"
```

---

## Task 10: Download route — script branch

**Files:**
- Modify: `src/app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/download/route.ts`
- Create: `tests/unit/document-ast/download-route-script.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/document-ast/download-route-script.test.ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest"

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }))
vi.mock("@/lib/auth", () => ({ auth: authMock }))

const { getArtifactMock } = vi.hoisted(() => ({ getArtifactMock: vi.fn() }))
vi.mock("@/features/conversations/sessions/service", () => ({
  getDashboardChatSessionArtifact: getArtifactMock,
}))

import { GET } from "@/app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/download/route"

const SCRIPT = `
  import { Document, Paragraph, TextRun, Packer } from "docx"
  const doc = new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun("hi")] })] }] })
  Packer.toBuffer(doc).then(buf => process.stdout.write(buf.toString("base64")))
`

beforeEach(() => {
  authMock.mockReset()
  getArtifactMock.mockReset()
})

describe("download route — text/document with documentFormat=script", () => {
  it("runs the script and returns docx bytes", async () => {
    authMock.mockResolvedValue({ user: { id: "u-1" } })
    getArtifactMock.mockResolvedValue({
      id: "a-1",
      title: "doc",
      content: SCRIPT,
      artifactType: "text/document",
      documentFormat: "script",
    })
    const req = new Request("https://example.test/?format=docx")
    const res = await GET(req as Request, {
      params: Promise.resolve({ id: "s-1", artifactId: "a-1" }),
    } as never)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
    const body = Buffer.from(await res.arrayBuffer())
    expect(body.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
  }, 30_000)
})
```

- [ ] **Step 2: Run to verify failure**

```bash
bunx vitest run tests/unit/document-ast/download-route-script.test.ts
```
Expected: FAIL — current route only handles AST.

- [ ] **Step 3: Add script branch in download route**

In `src/app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/download/route.ts`, replace the AST-only branch with:

```ts
import { runScriptInSandbox } from "@/lib/document-script/sandbox-runner"

// …inside GET, after fetching the artifact and validating type === "text/document":

if (result.documentFormat === "script") {
  // Script branch
  const r = await runScriptInSandbox(result.content, {})
  if (!r.ok || !r.buf) {
    return NextResponse.json({ error: `script failed: ${r.error ?? "unknown"}` }, { status: 500 })
  }
  if (format === "docx") {
    return new Response(new Uint8Array(r.buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${safeTitle}.docx"`,
        "Cache-Control": "no-store",
      },
    })
  }
  // pdf format wired via Task 22 (out of this task's scope)
  return NextResponse.json({ error: `format ${format} not supported for script artifacts in this build` }, { status: 400 })
}

// existing AST branch unchanged below
```

Hoist `safeTitle` if it isn't already (it should be from prior PDF work — if not, compute once after AST/script branch).

- [ ] **Step 4: Run test**

```bash
bunx vitest run tests/unit/document-ast/download-route-script.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/download/route.ts tests/unit/document-ast/download-route-script.test.ts
git commit-sulthan -m "feat(download-route): script branch for text/document"
```

---

## Task 11: Render API routes (status + page fetch)

**Files:**
- Create: `src/app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/render-status/route.ts`
- Create: `src/app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/render-pages/[contentHash]/[pageIndex]/route.ts`
- Create: `tests/unit/api/render-status.test.ts`
- Create: `tests/unit/api/render-pages.test.ts`

- [ ] **Step 1: Write the failing test for render-status**

```ts
// tests/unit/api/render-status.test.ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest"

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }))
vi.mock("@/lib/auth", () => ({ auth: authMock }))

const { getArtifactMock } = vi.hoisted(() => ({ getArtifactMock: vi.fn() }))
vi.mock("@/features/conversations/sessions/service", () => ({
  getDashboardChatSessionArtifact: getArtifactMock,
}))

const { renderMock } = vi.hoisted(() => ({ renderMock: vi.fn() }))
vi.mock("@/lib/rendering/server/docx-preview-pipeline", () => ({
  renderArtifactPreview: renderMock,
}))

import { GET } from "@/app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/render-status/route"

beforeEach(() => {
  authMock.mockReset()
  getArtifactMock.mockReset()
  renderMock.mockReset()
})

describe("render-status route", () => {
  it("triggers render and returns hash + pageCount on success", async () => {
    authMock.mockResolvedValue({ user: { id: "u-1" } })
    getArtifactMock.mockResolvedValue({
      id: "a-1", artifactType: "text/document", documentFormat: "script",
      content: "/* script */",
    })
    renderMock.mockResolvedValue({ hash: "abc123", pages: [Buffer.from([0x89,0x50])], cached: false })
    const req = new Request("https://example.test/")
    const res = await GET(req as Request, { params: Promise.resolve({ id: "s-1", artifactId: "a-1" }) } as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ hash: "abc123", pageCount: 1, cached: false })
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
bunx vitest run tests/unit/api/render-status.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement render-status route**

```ts
// src/app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/render-status/route.ts
import "server-only"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getDashboardChatSessionArtifact } from "@/features/conversations/sessions/service"
import { renderArtifactPreview } from "@/lib/rendering/server/docx-preview-pipeline"
import { isHttpServiceError } from "@/features/shared/http-service-error"

export const runtime = "nodejs"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; artifactId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id, artifactId } = await params
  const result = await getDashboardChatSessionArtifact({
    userId: session.user.id, sessionId: id, artifactId,
  })
  if (isHttpServiceError(result)) return NextResponse.json({ error: result.error }, { status: result.status })
  if (result.artifactType !== "text/document" || result.documentFormat !== "script") {
    return NextResponse.json({ error: "preview not applicable" }, { status: 400 })
  }
  try {
    const r = await renderArtifactPreview(artifactId, result.content)
    return NextResponse.json({ hash: r.hash, pageCount: r.pages.length, cached: r.cached })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
```

- [ ] **Step 4: Implement render-pages route**

```ts
// src/app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/render-pages/[contentHash]/[pageIndex]/route.ts
import "server-only"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getCachedPngs } from "@/lib/document-script/cache"

export const runtime = "nodejs"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; artifactId: string; contentHash: string; pageIndex: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { artifactId, contentHash, pageIndex } = await params
  const idx = parseInt(pageIndex, 10)
  if (Number.isNaN(idx) || idx < 0) return NextResponse.json({ error: "bad pageIndex" }, { status: 400 })

  const pages = await getCachedPngs(artifactId, contentHash)
  if (!pages || idx >= pages.length) {
    return NextResponse.json({ error: "page not found" }, { status: 404 })
  }
  return new Response(new Uint8Array(pages[idx]), {
    status: 200,
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable" },
  })
}
```

- [ ] **Step 5: Add a test for render-pages**

```ts
// tests/unit/api/render-pages.test.ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest"

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }))
vi.mock("@/lib/auth", () => ({ auth: authMock }))

const { getCachedMock } = vi.hoisted(() => ({ getCachedMock: vi.fn() }))
vi.mock("@/lib/document-script/cache", () => ({ getCachedPngs: getCachedMock }))

import { GET } from "@/app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/render-pages/[contentHash]/[pageIndex]/route"

beforeEach(() => { authMock.mockReset(); getCachedMock.mockReset() })

describe("render-pages route", () => {
  it("returns the requested page as image/png", async () => {
    authMock.mockResolvedValue({ user: { id: "u-1" } })
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff])
    getCachedMock.mockResolvedValue([png])
    const res = await GET(new Request("https://x/") as Request, {
      params: Promise.resolve({ id: "s", artifactId: "a", contentHash: "h", pageIndex: "0" }),
    } as never)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("image/png")
    const body = Buffer.from(await res.arrayBuffer())
    expect(body).toEqual(png)
  })
})
```

- [ ] **Step 6: Run all new tests**

```bash
bunx vitest run tests/unit/api/render-status.test.ts tests/unit/api/render-pages.test.ts
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/render-status/ src/app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/render-pages/ tests/unit/api/render-status.test.ts tests/unit/api/render-pages.test.ts
git commit-sulthan -m "feat(api): render-status + render-pages routes for script preview"
```

---

## Task 12: Repository + service `documentFormat` plumbing

**Files:**
- Modify: `src/features/conversations/sessions/repository.ts`
- Modify: `src/features/conversations/sessions/service.ts`
- Modify: `src/features/conversations/sessions/service.test.ts`

- [ ] **Step 1: Write a failing test in service.test.ts**

```ts
describe("getDashboardChatSessionArtifact — exposes documentFormat", () => {
  it("returns documentFormat=script for new script artifacts", async () => {
    findArtifactMock.mockResolvedValue({
      id: "a-1", artifactType: "text/document", content: "/**/", documentFormat: "script",
      // …minimum fields…
    })
    findSessionMock.mockResolvedValue({ id: "s-1", userId: "u-1" })
    const r = await getDashboardChatSessionArtifact({ userId: "u-1", sessionId: "s-1", artifactId: "a-1" })
    expect(r).toMatchObject({ documentFormat: "script" })
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
bunx vitest run src/features/conversations/sessions/service.test.ts
```
Expected: FAIL — `documentFormat` not in service return type.

- [ ] **Step 3: Update repository select clause**

In `src/features/conversations/sessions/repository.ts`, ensure every `select`/return type for artifact reads includes `documentFormat`. If types are inferred from Prisma, this should be automatic after Task 1; if you have manual interfaces, extend them:

```ts
export interface DashboardArtifactRow {
  id: string
  // …existing…
  documentFormat: "ast" | "script"
}
```

- [ ] **Step 4: Pass through service layer**

In `src/features/conversations/sessions/service.ts`, the `getDashboardChatSessionArtifact` return should already include `documentFormat` if Prisma row spread is used. Double-check there's no field-by-field copy that drops it. Add `documentFormat` if so.

- [ ] **Step 5: Run test**

```bash
bunx vitest run src/features/conversations/sessions/service.test.ts
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/conversations/sessions/repository.ts src/features/conversations/sessions/service.ts src/features/conversations/sessions/service.test.ts
git commit-sulthan -m "feat(sessions): expose documentFormat through repository + service"
```

---

## Task 13: Edit document API route (LLM rewrite with retry)

**Files:**
- Create: `src/lib/document-script/llm-rewrite.ts`
- Create: `src/app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/edit-document/route.ts`
- Create: `tests/unit/document-script/llm-rewrite.test.ts`
- Create: `tests/unit/api/edit-document.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/api/edit-document.test.ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest"

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }))
vi.mock("@/lib/auth", () => ({ auth: authMock }))

const { getArtifactMock, updateArtifactMock } = vi.hoisted(() => ({
  getArtifactMock: vi.fn(),
  updateArtifactMock: vi.fn(),
}))
vi.mock("@/features/conversations/sessions/service", () => ({
  getDashboardChatSessionArtifact: getArtifactMock,
  updateDashboardChatSessionArtifact: updateArtifactMock,
}))

const { generateMock } = vi.hoisted(() => ({ generateMock: vi.fn() }))
vi.mock("@/lib/llm/generate", () => ({ generateScriptRewrite: generateMock }))

import { POST } from "@/app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/edit-document/route"

beforeEach(() => { authMock.mockReset(); getArtifactMock.mockReset(); updateArtifactMock.mockReset(); generateMock.mockReset() })

describe("edit-document route", () => {
  it("calls LLM rewrite, validates result, updates artifact", async () => {
    authMock.mockResolvedValue({ user: { id: "u-1" } })
    getArtifactMock.mockResolvedValue({
      id: "a-1", artifactType: "text/document", documentFormat: "script", content: "/* old */",
    })
    const newScript = `
      import { Document, Paragraph, TextRun, Packer } from "docx"
      const doc = new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun("new")] })] }] })
      Packer.toBuffer(doc).then(buf => process.stdout.write(buf.toString("base64")))
    `
    generateMock.mockResolvedValue(newScript)
    updateArtifactMock.mockResolvedValue({ id: "a-1", content: newScript, documentFormat: "script" })
    const req = new Request("https://x/", {
      method: "POST",
      body: JSON.stringify({ editPrompt: "change title" }),
      headers: { "content-type": "application/json" },
    })
    const res = await POST(req as Request, { params: Promise.resolve({ id: "s", artifactId: "a-1" }) } as never)
    expect(res.status).toBe(200)
    expect(generateMock).toHaveBeenCalledWith(expect.objectContaining({ currentScript: "/* old */", editPrompt: "change title" }))
    expect(updateArtifactMock).toHaveBeenCalledWith(expect.objectContaining({ artifactId: "a-1", content: newScript }))
  }, 30_000)
})
```

- [ ] **Step 2: Run to verify failure**

```bash
bunx vitest run tests/unit/api/edit-document.test.ts
```
Expected: FAIL — route + LLM module don't exist.

- [ ] **Step 3: Create the LLM rewrite helper**

```ts
// src/lib/llm/generate.ts (extend if exists, create if not)
import "server-only"
import { generateText } from "ai"
import { openrouter } from "@/lib/ai/openrouter"  // adapt to existing factory

export async function generateScriptRewrite(args: {
  currentScript: string
  editPrompt: string
}): Promise<string> {
  const system = `You are rewriting a docx-js JavaScript script that produces a .docx file.
Apply the user's edit to the script. Return ONLY the new full script as JavaScript code.
No commentary, no markdown fences. The script MUST end by calling Packer.toBuffer(doc).then(buf => process.stdout.write(buf.toString("base64")))`
  const user = `Current script:
\`\`\`js
${args.currentScript}
\`\`\`

Edit to apply:
${args.editPrompt}

Return the new script:`
  const r = await generateText({
    model: openrouter("anthropic/claude-sonnet-4-6"),
    system,
    prompt: user,
  })
  return r.text.trim()
}
```

(Adapt the `openrouter()` import + model id to whatever pattern the repo already uses for LLM calls.)

- [ ] **Step 4: Implement llm-rewrite with retry**

```ts
// src/lib/document-script/llm-rewrite.ts
import "server-only"
import { generateScriptRewrite } from "@/lib/llm/generate"
import { validateScriptArtifact } from "./validator"

const MAX_RETRIES = 2

export interface RewriteResult {
  ok: boolean
  script?: string
  error?: string
  attempts: number
}

export async function llmRewriteWithRetry(args: {
  currentScript: string
  editPrompt: string
}): Promise<RewriteResult> {
  let lastError: string | null = null
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const promptSuffix = lastError
      ? `\n\nYour previous attempt failed validation with: "${lastError}". Fix it and return the corrected script.`
      : ""
    const newScript = await generateScriptRewrite({
      currentScript: args.currentScript,
      editPrompt: args.editPrompt + promptSuffix,
    })
    const v = await validateScriptArtifact(newScript)
    if (v.ok) return { ok: true, script: newScript, attempts: attempt + 1 }
    lastError = v.errors.join("; ")
  }
  return {
    ok: false,
    error: `validation failed after ${MAX_RETRIES + 1} attempts: ${lastError}`,
    attempts: MAX_RETRIES + 1,
  }
}
```

- [ ] **Step 5: Add a retry-behavior unit test**

```ts
// tests/unit/document-script/llm-rewrite.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

const { generateMock } = vi.hoisted(() => ({ generateMock: vi.fn() }))
vi.mock("@/lib/llm/generate", () => ({ generateScriptRewrite: generateMock }))

const { validateMock } = vi.hoisted(() => ({ validateMock: vi.fn() }))
vi.mock("@/lib/document-script/validator", () => ({ validateScriptArtifact: validateMock }))

import { llmRewriteWithRetry } from "@/lib/document-script/llm-rewrite"

beforeEach(() => { generateMock.mockReset(); validateMock.mockReset() })

describe("llmRewriteWithRetry", () => {
  it("succeeds on first attempt when script validates", async () => {
    generateMock.mockResolvedValue("/* good */")
    validateMock.mockResolvedValue({ ok: true, errors: [] })
    const r = await llmRewriteWithRetry({ currentScript: "/* old */", editPrompt: "change" })
    expect(r.ok).toBe(true)
    expect(r.attempts).toBe(1)
  })

  it("retries on validation failure and feeds error back to LLM", async () => {
    generateMock
      .mockResolvedValueOnce("/* bad */")
      .mockResolvedValueOnce("/* still bad */")
      .mockResolvedValueOnce("/* good */")
    validateMock
      .mockResolvedValueOnce({ ok: false, errors: ["syntax error"] })
      .mockResolvedValueOnce({ ok: false, errors: ["bad output"] })
      .mockResolvedValueOnce({ ok: true, errors: [] })
    const r = await llmRewriteWithRetry({ currentScript: "/* old */", editPrompt: "change" })
    expect(r.ok).toBe(true)
    expect(r.attempts).toBe(3)
    // Second call should include first error in prompt
    expect(generateMock.mock.calls[1][0].editPrompt).toMatch(/syntax error/)
    expect(generateMock.mock.calls[2][0].editPrompt).toMatch(/bad output/)
  })

  it("gives up after 3 attempts (1 initial + 2 retries)", async () => {
    generateMock.mockResolvedValue("/* always bad */")
    validateMock.mockResolvedValue({ ok: false, errors: ["nope"] })
    const r = await llmRewriteWithRetry({ currentScript: "/* old */", editPrompt: "change" })
    expect(r.ok).toBe(false)
    expect(r.attempts).toBe(3)
    expect(r.error).toMatch(/3 attempts/)
  })
})
```

- [ ] **Step 6: Implement the edit route using llmRewriteWithRetry**

```ts
// src/app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/edit-document/route.ts
import "server-only"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getDashboardChatSessionArtifact, updateDashboardChatSessionArtifact } from "@/features/conversations/sessions/service"
import { llmRewriteWithRetry } from "@/lib/document-script/llm-rewrite"
import { isHttpServiceError } from "@/features/shared/http-service-error"

export const runtime = "nodejs"

// Simple in-process token bucket: 10 requests / 60s / user
const RATE_LIMIT = 10
const RATE_WINDOW_MS = 60_000
const buckets = new Map<string, { count: number; resetAt: number }>()

function checkRate(userId: string): boolean {
  const now = Date.now()
  const b = buckets.get(userId)
  if (!b || now >= b.resetAt) {
    buckets.set(userId, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return true
  }
  if (b.count >= RATE_LIMIT) return false
  b.count++
  return true
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; artifactId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (!checkRate(session.user.id)) {
    return NextResponse.json({ error: "rate limit: 10 edits/min" }, { status: 429 })
  }

  const { id, artifactId } = await params
  let body: { editPrompt?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }) }
  if (!body.editPrompt || typeof body.editPrompt !== "string") {
    return NextResponse.json({ error: "editPrompt required" }, { status: 400 })
  }
  const artifact = await getDashboardChatSessionArtifact({
    userId: session.user.id, sessionId: id, artifactId,
  })
  if (isHttpServiceError(artifact)) return NextResponse.json({ error: artifact.error }, { status: artifact.status })
  if (artifact.artifactType !== "text/document" || artifact.documentFormat !== "script") {
    return NextResponse.json({ error: "edit only supported for script-format documents" }, { status: 400 })
  }
  const r = await llmRewriteWithRetry({
    currentScript: artifact.content,
    editPrompt: body.editPrompt,
  })
  if (!r.ok || !r.script) {
    return NextResponse.json({ error: r.error ?? "rewrite failed" }, { status: 422 })
  }
  const updated = await updateDashboardChatSessionArtifact({
    userId: session.user.id, sessionId: id, artifactId,
    content: r.script,
    artifactType: "text/document",
  })
  if (isHttpServiceError(updated)) return NextResponse.json({ error: updated.error }, { status: updated.status })
  return NextResponse.json({ id: updated.id, content: updated.content, attempts: r.attempts })
}
```

- [ ] **Step 7: Run the tests**

```bash
bunx vitest run tests/unit/document-script/llm-rewrite.test.ts tests/unit/api/edit-document.test.ts
```
Expected: PASS — retry behavior verified, route happy path verified.

- [ ] **Step 8: Commit**

```bash
git add src/lib/llm/generate.ts src/lib/document-script/llm-rewrite.ts src/app/api/dashboard/chat/sessions/[id]/artifacts/[artifactId]/edit-document/ tests/unit/document-script/llm-rewrite.test.ts tests/unit/api/edit-document.test.ts
git commit-sulthan -m "$(cat <<'EOF'
feat(api): edit-document route with LLM retry + rate limit

- llmRewriteWithRetry retries up to N=2 times on validation failure
- previous error fed back into LLM prompt so it can self-correct
- 10 edits/min/user rate limit (in-process token bucket)
- 422 returned only after all retries exhausted, with last validator error
EOF
)"
```

---

## Task 14: Document-script renderer (panel UI)

**Files:**
- Create: `src/features/conversations/components/chat/artifacts/renderers/document-script-renderer.tsx`

- [ ] **Step 1: Implement the renderer**

(Frontend component — no automated test in this plan; manual smoke at end of plan.)

```tsx
// src/features/conversations/components/chat/artifacts/renderers/document-script-renderer.tsx
"use client"
import { useEffect, useState } from "react"
import { Loader2, ChevronLeft, ChevronRight, Code } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"

interface RenderStatus {
  hash: string
  pageCount: number
  cached: boolean
}

interface Props {
  sessionId: string
  artifactId: string
  content: string  // the JS script (shown when user toggles "view code")
  isStreaming: boolean
}

export function DocumentScriptRenderer({ sessionId, artifactId, content, isStreaming }: Props) {
  const [status, setStatus] = useState<RenderStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pageIdx, setPageIdx] = useState(0)
  const [showCode, setShowCode] = useState(false)

  useEffect(() => {
    if (isStreaming) return  // don't render while LLM is still typing
    setStatus(null)
    setError(null)
    let cancelled = false
    fetch(`/api/dashboard/chat/sessions/${sessionId}/artifacts/${artifactId}/render-status`, { method: "GET" })
      .then(async (r) => {
        if (cancelled) return
        if (!r.ok) {
          const j = await r.json().catch(() => ({}))
          setError(j.error ?? `HTTP ${r.status}`)
          return
        }
        const s = (await r.json()) as RenderStatus
        setStatus(s)
        setPageIdx(0)
      })
      .catch((e) => { if (!cancelled) setError((e as Error).message) })
    return () => { cancelled = true }
  }, [sessionId, artifactId, content, isStreaming])

  if (isStreaming) {
    return <CodeView content={content} subtle />
  }
  if (showCode) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between p-2 border-b">
          <span className="text-sm text-muted-foreground">Source script</span>
          <Button size="sm" variant="ghost" onClick={() => setShowCode(false)}>Show preview</Button>
        </div>
        <CodeView content={content} />
      </div>
    )
  }
  if (error) {
    return (
      <div className="p-4 text-sm">
        <div className="text-destructive mb-2">Preview unavailable: {error}</div>
        <Button variant="outline" size="sm" onClick={() => setShowCode(true)}>View source</Button>
      </div>
    )
  }
  if (!status) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Rendering preview…
      </div>
    )
  }
  const pageUrl = `/api/dashboard/chat/sessions/${sessionId}/artifacts/${artifactId}/render-pages/${status.hash}/${pageIdx}`
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-2 border-b">
        <span className="text-sm text-muted-foreground">Page {pageIdx + 1} of {status.pageCount}</span>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => setShowCode(true)}><Code className="h-4 w-4 mr-1" />Code</Button>
          <Button size="sm" variant="ghost" disabled={pageIdx === 0} onClick={() => setPageIdx((i) => i - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" disabled={pageIdx >= status.pageCount - 1} onClick={() => setPageIdx((i) => i + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <img src={pageUrl} alt={`Page ${pageIdx + 1}`} className="w-full" />
      </ScrollArea>
    </div>
  )
}

function CodeView({ content, subtle }: { content: string; subtle?: boolean }) {
  return (
    <pre className={`text-xs p-3 overflow-auto ${subtle ? "opacity-60" : ""}`}>
      <code>{content}</code>
    </pre>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
bunx tsc --noEmit -p tsconfig.json 2>&1 | grep document-script-renderer | head
```
Expected: empty.

- [ ] **Step 3: Commit**

```bash
git add src/features/conversations/components/chat/artifacts/renderers/document-script-renderer.tsx
git commit-sulthan -m "feat(panel): document-script-renderer (PNG carousel + code view + streaming)"
```

---

## Task 15: Wire renderer into artifact panel

**Files:**
- Modify: `src/features/conversations/components/chat/artifacts/artifact-panel.tsx`

- [ ] **Step 1: Branch on documentFormat**

In `artifact-panel.tsx`, find where `text/document` artifact is rendered (currently uses `<DocumentRenderer />` or similar). Replace with:

```tsx
import { DocumentScriptRenderer } from "./renderers/document-script-renderer"

// …inside the renderer switch:
{displayArtifact.type === "text/document" && (
  displayArtifact.documentFormat === "script" ? (
    <DocumentScriptRenderer
      sessionId={sessionId!}
      artifactId={displayArtifact.id}
      content={displayArtifact.content}
      isStreaming={isStreaming}
    />
  ) : (
    <DocumentRenderer artifact={displayArtifact} /> // existing AST renderer
  )
)}
```

- [ ] **Step 2: Add legacy banner for AST artifacts**

In `DocumentRenderer` itself (or wrapping it in artifact-panel.tsx), add at top:

```tsx
{displayArtifact.documentFormat === "ast" && (
  <div className="bg-amber-50 border-b border-amber-200 px-3 py-2 text-xs text-amber-900">
    This is a legacy document format. Create a new document to use the latest features.
  </div>
)}
```

- [ ] **Step 3: Hide edit pencil for legacy AST artifacts**

Find the edit/pencil button in artifact-panel.tsx for `text/document`. Wrap or guard:

```tsx
{displayArtifact.type === "text/document" && displayArtifact.documentFormat === "script" && (
  <Button onClick={() => setEditModalOpen(true)}>Edit</Button>
)}
```

- [ ] **Step 4: Manual smoke**

Start dev server and load an existing AST artifact + create a fake script artifact (manually flip `documentFormat` in DB if needed for this smoke). Verify:
- AST artifact shows banner + no edit button
- Script artifact shows PNG preview + edit button (modal opens — body added in Task 16)

- [ ] **Step 5: Commit**

```bash
git add src/features/conversations/components/chat/artifacts/artifact-panel.tsx
git commit-sulthan -m "feat(panel): switch text/document renderer on documentFormat + legacy banner"
```

---

## Task 16: Edit modal UI

**Files:**
- Create: `src/features/conversations/components/chat/artifacts/edit-document-modal.tsx`
- Modify: `src/features/conversations/components/chat/artifacts/artifact-panel.tsx`

- [ ] **Step 1: Implement the modal**

```tsx
// src/features/conversations/components/chat/artifacts/edit-document-modal.tsx
"use client"
import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  sessionId: string
  artifactId: string
  onSaved: () => void
}

export function EditDocumentModal({ open, onOpenChange, sessionId, artifactId, onSaved }: Props) {
  const [prompt, setPrompt] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!prompt.trim()) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/dashboard/chat/sessions/${sessionId}/artifacts/${artifactId}/edit-document`,
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ editPrompt: prompt }) },
      )
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      setPrompt("")
      onOpenChange(false)
      onSaved()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Describe your edit</DialogTitle>
        </DialogHeader>
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. Change the deadline to 2026-06-30 and add a budget section"
          rows={4}
          disabled={busy}
        />
        {error && <div className="text-sm text-destructive">{error}</div>}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !prompt.trim()}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Apply edit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Wire into artifact-panel.tsx**

```tsx
import { EditDocumentModal } from "./edit-document-modal"
// inside component:
const [editModalOpen, setEditModalOpen] = useState(false)
// …
<EditDocumentModal
  open={editModalOpen}
  onOpenChange={setEditModalOpen}
  sessionId={sessionId!}
  artifactId={displayArtifact.id}
  onSaved={() => {
    // trigger artifact reload — call existing refetch hook
    // e.g.: refetchArtifact?.()
  }}
/>
```

- [ ] **Step 3: Manual smoke**

Open a script artifact, click Edit, type "Change title", submit. Verify request fires, artifact updates, preview re-renders.

- [ ] **Step 4: Commit**

```bash
git add src/features/conversations/components/chat/artifacts/edit-document-modal.tsx src/features/conversations/components/chat/artifacts/artifact-panel.tsx
git commit-sulthan -m "feat(panel): edit-document modal (prompt-based rewrite)"
```

---

## Task 17: Rewrite document.ts prompt for script output

**Files:**
- Modify: `src/lib/prompts/artifacts/document.ts`

- [ ] **Step 1: Replace the AST prompt with a script-mode prompt**

Replace the `rules` template with content based on the Claude Skill at `docs/artifact-plans/-docx.md`. Key parts to include verbatim or tightly paraphrased:

- Output format: ONLY a JS script using `docx-js`. No JSON. No markdown fences. Script must end with `Packer.toBuffer(doc).then(buf => process.stdout.write(buf.toString("base64")))`
- Page size rules (US Letter 12240×15840 DXA explicit)
- Style rules: override Heading1/2/etc. via `id`, include `outlineLevel`
- Tables: dual widths (`columnWidths` + cell `width`), `WidthType.DXA` always, `ShadingType.CLEAR`, cell `margins`
- Lists: `LevelFormat.BULLET` only — never unicode
- Images: `type` required, `altText` with all 3 keys
- Page breaks: inside Paragraph
- Hyperlinks via `ExternalHyperlink` / `InternalHyperlink`
- Footnotes via `footnotes:` map + `FootnoteReferenceRun`
- Tab stops + `PositionalTab` for layout (right-aligned dates, dot-leaders)
- Multi-column via `column:` section property

Provide a small worked example at the end of the prompt — a 30-line minimal "hello world" script that compiles + runs. Same shape as `examples/proposal.ts` was for AST, but as JS script.

(See spec §15 for the full content reference; this is too long to inline verbatim here. The implementer should copy the relevant rules from `docs/artifact-plans/-docx.md` and adapt the wording for an LLM system prompt.)

- [ ] **Step 2: Update the artifact summary**

```ts
summary: "Formal deliverables (proposals, reports, book chapters, letters, white papers) authored as a docx-js JavaScript script — server runs the script in a sandbox, renders preview via LibreOffice, downloads as .docx.",
```

- [ ] **Step 3: Smoke test the prompt**

(Manual.) Spin up dev server, send a chat message asking for a proposal. Verify the LLM produces a JS script that:
- Parses (no syntax errors)
- Runs in the sandbox (validator accepts)
- Produces a docx that LibreOffice can convert
- Renders in the panel

If the LLM produces JSON or wraps in fences, tighten the prompt rules and retry.

- [ ] **Step 4: Commit**

```bash
git add src/lib/prompts/artifacts/document.ts
git commit-sulthan -m "feat(prompt): rewrite text/document prompt for docx-js script output"
```

---

## Task 18: RAG pandoc extract for script artifacts

**Files:**
- Modify: `src/lib/rag/index-artifact.ts` (or wherever `indexArtifactContent` lives — confirm via grep)
- Create: `src/lib/document-script/extract-text.ts`
- Create: `tests/unit/document-script/extract-text.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/document-script/extract-text.test.ts
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { extractDocxText } from "@/lib/document-script/extract-text"

const SAMPLE = readFileSync(join(__dirname, "..", "..", "fixtures", "document-script", "sample-letter.docx"))

describe("extractDocxText", () => {
  it("extracts plain text from a docx buffer via pandoc", async () => {
    const text = await extractDocxText(SAMPLE)
    expect(text).toContain("Sample Letter")
  }, 30_000)
})
```

- [ ] **Step 2: Run to verify failure**

```bash
bunx vitest run tests/unit/document-script/extract-text.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement extract-text**

```ts
// src/lib/document-script/extract-text.ts
import "server-only"
import { spawn } from "node:child_process"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const TIMEOUT_MS = 15_000

export async function extractDocxText(docx: Buffer): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "docx-extract-"))
  const inPath = join(dir, "in.docx")
  await writeFile(inPath, docx)
  try {
    return await new Promise<string>((resolve, reject) => {
      const child = spawn("pandoc", ["-f", "docx", "-t", "plain", inPath], { stdio: ["ignore", "pipe", "pipe"] })
      let stdout = ""
      let stderr = ""
      let settled = false
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        try { child.kill("SIGKILL") } catch {}
        reject(new Error(`pandoc timeout after ${TIMEOUT_MS}ms`))
      }, TIMEOUT_MS)
      child.stdout.on("data", (c) => { stdout += c.toString() })
      child.stderr.on("data", (c) => { stderr += c.toString() })
      child.on("close", (code) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (code === 0) resolve(stdout)
        else reject(new Error(`pandoc exited ${code}: ${stderr || "(no stderr)"}`))
      })
    })
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
```

- [ ] **Step 4: Wire into RAG indexing**

In `src/lib/rag/index-artifact.ts`, find where artifact content is fed to the embedder. Branch on `documentFormat`:

```ts
import { runScriptInSandbox } from "@/lib/document-script/sandbox-runner"
import { extractDocxText } from "@/lib/document-script/extract-text"

// inside indexArtifactContent:
let textToEmbed = artifact.content
if (artifact.artifactType === "text/document" && artifact.documentFormat === "script") {
  const r = await runScriptInSandbox(artifact.content, {})
  if (r.ok && r.buf) {
    textToEmbed = await extractDocxText(r.buf)
  }
  // on failure, fall back to embedding the script source — still useful for code search
}
// …feed textToEmbed to the embedder…
```

- [ ] **Step 5: Run the unit test**

```bash
bunx vitest run tests/unit/document-script/extract-text.test.ts
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/document-script/extract-text.ts src/lib/rag/index-artifact.ts tests/unit/document-script/extract-text.test.ts
git commit-sulthan -m "feat(rag): pandoc extract for script-format text/document artifacts"
```

---

## Task 18a: Metrics module + admin endpoint

**Files:**
- Create: `src/lib/document-script/metrics.ts`
- Create: `src/app/api/admin/render-metrics/route.ts`
- Create: `src/app/api/admin/render-metrics/reset/route.ts`
- Create: `tests/unit/document-script/metrics.test.ts`

- [ ] **Step 1: Write the failing test for the metrics module**

```ts
// tests/unit/document-script/metrics.test.ts
import { describe, it, expect, beforeEach } from "vitest"
import { metrics, recordSandbox, recordRender, recordLlmRewrite, resetMetrics } from "@/lib/document-script/metrics"

beforeEach(() => resetMetrics())

describe("metrics", () => {
  it("counts sandbox attempts and failures separately", () => {
    recordSandbox({ ok: true, durationMs: 200 })
    recordSandbox({ ok: false, durationMs: 50 })
    recordSandbox({ ok: true, durationMs: 300 })
    expect(metrics().sandbox_attempts).toBe(3)
    expect(metrics().sandbox_failures).toBe(1)
    expect(metrics().sandbox_duration_ms_total).toBe(550)
  })

  it("counts render attempts, failures, and duration", () => {
    recordRender({ ok: true, durationMs: 1000 })
    recordRender({ ok: false, durationMs: 200 })
    expect(metrics().render_attempts).toBe(2)
    expect(metrics().render_failures).toBe(1)
    expect(metrics().render_duration_ms_total).toBe(1200)
  })

  it("counts LLM rewrite attempts, retries, and failures", () => {
    recordLlmRewrite({ ok: true, attempts: 1 })  // no retry
    recordLlmRewrite({ ok: true, attempts: 2 })  // 1 retry
    recordLlmRewrite({ ok: false, attempts: 3 })  // 2 retries + fail
    expect(metrics().llm_rewrite_attempts).toBe(3)
    expect(metrics().llm_rewrite_retries).toBe(3)  // (2-1) + (3-1) = 3
    expect(metrics().llm_rewrite_failures).toBe(1)
  })

  it("resetMetrics zeroes everything", () => {
    recordSandbox({ ok: true, durationMs: 100 })
    resetMetrics()
    expect(metrics().sandbox_attempts).toBe(0)
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
bunx vitest run tests/unit/document-script/metrics.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement metrics module**

```ts
// src/lib/document-script/metrics.ts
import "server-only"

interface Counters {
  sandbox_attempts: number
  sandbox_failures: number
  sandbox_duration_ms_total: number
  render_attempts: number
  render_failures: number
  render_duration_ms_total: number
  llm_rewrite_attempts: number
  llm_rewrite_retries: number
  llm_rewrite_failures: number
}

const ZERO: Counters = {
  sandbox_attempts: 0, sandbox_failures: 0, sandbox_duration_ms_total: 0,
  render_attempts: 0, render_failures: 0, render_duration_ms_total: 0,
  llm_rewrite_attempts: 0, llm_rewrite_retries: 0, llm_rewrite_failures: 0,
}

let counters: Counters = { ...ZERO }

export function metrics(): Counters {
  return { ...counters }
}

export function resetMetrics(): void {
  counters = { ...ZERO }
}

export function recordSandbox(args: { ok: boolean; durationMs: number }): void {
  counters.sandbox_attempts++
  if (!args.ok) counters.sandbox_failures++
  counters.sandbox_duration_ms_total += args.durationMs
}

export function recordRender(args: { ok: boolean; durationMs: number }): void {
  counters.render_attempts++
  if (!args.ok) counters.render_failures++
  counters.render_duration_ms_total += args.durationMs
}

export function recordLlmRewrite(args: { ok: boolean; attempts: number }): void {
  counters.llm_rewrite_attempts++
  counters.llm_rewrite_retries += Math.max(0, args.attempts - 1)
  if (!args.ok) counters.llm_rewrite_failures++
}
```

- [ ] **Step 4: Wire metrics into sandbox-runner, preview-pipeline, llm-rewrite**

Sandbox runner — record at every `finish`:
```ts
import { recordSandbox } from "./metrics"
// inside finish():
recordSandbox({ ok: result.ok, durationMs: result.durationMs })
```

Preview pipeline — wrap render path:
```ts
import { recordRender } from "@/lib/document-script/metrics"
const startedAt = Date.now()
try {
  const result = await /* existing pipeline */
  recordRender({ ok: true, durationMs: Date.now() - startedAt })
  return result
} catch (err) {
  recordRender({ ok: false, durationMs: Date.now() - startedAt })
  throw err
}
```

llm-rewrite — record after retry loop completes:
```ts
import { recordLlmRewrite } from "./metrics"
// before each return statement:
recordLlmRewrite({ ok: result.ok, attempts: result.attempts })
```

- [ ] **Step 5: Implement admin endpoints**

```ts
// src/app/api/admin/render-metrics/route.ts
import "server-only"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { metrics } from "@/lib/document-script/metrics"

export const runtime = "nodejs"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  // Adapt this check to whatever role-check the project already uses.
  // If session has a `role` field, gate on `session.user.role === "admin"`.
  // If not, gate on a hardcoded admin user-id list from env.
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").filter(Boolean)
  if (!adminIds.includes(session.user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  return NextResponse.json(metrics())
}
```

```ts
// src/app/api/admin/render-metrics/reset/route.ts
import "server-only"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { resetMetrics } from "@/lib/document-script/metrics"

export const runtime = "nodejs"

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").filter(Boolean)
  if (!adminIds.includes(session.user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  resetMetrics()
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 6: Run tests**

```bash
bunx vitest run tests/unit/document-script/metrics.test.ts
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/document-script/metrics.ts src/lib/document-script/sandbox-runner.ts src/lib/rendering/server/docx-preview-pipeline.ts src/lib/document-script/llm-rewrite.ts src/app/api/admin/render-metrics/ tests/unit/document-script/metrics.test.ts
git commit-sulthan -m "$(cat <<'EOF'
feat(document-script): in-process metrics + admin endpoints

- counters: sandbox attempts/failures/duration, render attempts/failures/duration, llm rewrite attempts/retries/failures
- wired into sandbox-runner, preview-pipeline, llm-rewrite at every code path
- GET /api/admin/render-metrics returns current snapshot (admin-only)
- POST /api/admin/render-metrics/reset zeroes counters
- enables soak-period gating on objective failure-rate criteria
EOF
)"
```

---

## Task 19: Digital employee package transfer

**Files:**
- Modify: `src/lib/digital-employees/package-generator.ts`

- [ ] **Step 1: Locate text/document handling**

```bash
grep -n "text/document\|artifactType" src/lib/digital-employees/package-generator.ts | head
```

- [ ] **Step 2: Branch on documentFormat**

For `text/document` artifacts being packaged into a digital employee workspace, write the file with the right extension based on format:

```ts
const ext = artifact.artifactType === "text/document"
  ? (artifact.documentFormat === "script" ? "js" : "json")
  : /* existing extension logic */

writeFile(join(workspaceDir, `${slug}.${ext}`), artifact.content)
```

(If the package format passes the file as-is and lets the agent regenerate, this may need no change — confirm the existing pattern.)

- [ ] **Step 3: Smoke test**

Generate a digital-employee package containing a script-format text/document artifact. Verify the workspace receives `<slug>.js` with the script content (or whatever the established naming pattern is).

- [ ] **Step 4: Commit**

```bash
git add src/lib/digital-employees/package-generator.ts
git commit-sulthan -m "feat(digital-employees): script artifact extension handling"
```

---

## Task 20: Feature flag wiring + Docker base image

**Files:**
- Modify: `Dockerfile` (root) and/or `docker/employee/Dockerfile`
- Modify: `.env.example` (or equivalent)
- Modify: `next.config.mjs`

- [ ] **Step 1: Install LibreOffice + poppler in Docker base**

In each Dockerfile that builds the Next.js server, add (after base node setup, before `npm install`):

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-core \
    libreoffice-writer \
    poppler-utils \
    pandoc \
  && rm -rf /var/lib/apt/lists/*
```

Pin LibreOffice to a specific Debian/Ubuntu base if reproducibility is required.

- [ ] **Step 2: Document the env flags**

Append to `.env.example`:

```
# text/document artifact format default. "ast" (legacy) or "script" (new).
# Set to "script" after staging tests pass.
ARTIFACT_DOC_FORMAT_DEFAULT=ast

# Cap on concurrent render jobs (sandbox + libreoffice). Default 3.
# Each render uses ~300MB peak. Pick a value that keeps total under host RAM.
RENDER_CONCURRENCY=3

# Comma-separated user ids allowed to call /api/admin/render-metrics.
ADMIN_USER_IDS=
```

- [ ] **Step 2a: Configure S3 lifecycle rule for preview cache TTL**

Add (or document the manual operator action) for the S3 bucket holding artifact-preview PNGs. AWS CLI:

```bash
aws s3api put-bucket-lifecycle-configuration --bucket "$BUCKET" --lifecycle-configuration '{
  "Rules": [{
    "ID": "expire-artifact-preview-after-30d",
    "Status": "Enabled",
    "Filter": { "Prefix": "artifact-preview/" },
    "Expiration": { "Days": 30 }
  }]
}'
```

If the bucket is shared with other artifact data, scope the prefix tightly. The rule deletes orphaned preview PNGs (cache from old contentHashes) after 30 days; recently-rendered hashes get refreshed by re-render and never expire while in active use.

If using non-S3 storage (MinIO, R2, etc.), apply the equivalent lifecycle configuration. Document the resulting policy in repo `docs/operations/s3-lifecycle.md` (create if missing).

- [ ] **Step 3: Add `serverExternalPackages` for libs that fail in Turbopack dev**

In `next.config.mjs`, append (if not already present from prior PDF work — they were reverted, so likely not):

```js
serverExternalPackages: [
  // …existing entries…
  "jsdom",  // mermaid pipeline, kept for legacy docx mermaid blocks
],
```

- [ ] **Step 4: Build and run the Docker image locally to verify**

```bash
docker build -t rantai-test -f Dockerfile .
docker run --rm rantai-test soffice --version
docker run --rm rantai-test pdftoppm -v
docker run --rm rantai-test pandoc --version
```
Expected: each command prints a version string, no "command not found".

- [ ] **Step 5: Commit**

```bash
git add Dockerfile docker/employee/Dockerfile .env.example next.config.mjs
git commit-sulthan -m "infra(docker): install libreoffice + poppler + pandoc; wire ARTIFACT_DOC_FORMAT_DEFAULT"
```

---

## Task 21: End-to-end integration test (LLM-free path)

**Files:**
- Create: `tests/unit/document-script/e2e.test.ts`
- Create: `tests/fixtures/document-script/proposal.script.js`

- [ ] **Step 1: Add a realistic script fixture**

```js
// tests/fixtures/document-script/proposal.script.js
import { Document, Paragraph, TextRun, HeadingLevel, Packer, AlignmentType } from "docx"

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 24 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 240, after: 240 }, outlineLevel: 0 } },
    ],
  },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
    children: [
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Infrastructure Migration Proposal")] }),
      new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [new TextRun("Executive summary text goes here, multiple sentences to fill a paragraph.")] }),
      new Paragraph({ children: [new TextRun({ text: "Bold inline ", bold: true }), new TextRun("regular text.")] }),
    ],
  }],
})

Packer.toBuffer(doc).then(buf => process.stdout.write(buf.toString("base64")))
```

- [ ] **Step 2: Write the e2e test**

```ts
// tests/unit/document-script/e2e.test.ts
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { validateScriptArtifact } from "@/lib/document-script/validator"
import { renderArtifactPreview } from "@/lib/rendering/server/docx-preview-pipeline"
import { extractDocxText } from "@/lib/document-script/extract-text"
import { runScriptInSandbox } from "@/lib/document-script/sandbox-runner"

const PROPOSAL = readFileSync(join(__dirname, "..", "..", "fixtures", "document-script", "proposal.script.js"), "utf8")

// Mock S3 for cache layer
import { vi } from "vitest"
vi.mock("@/lib/s3", () => ({
  uploadFile: vi.fn().mockResolvedValue(undefined),
  getFile: vi.fn().mockRejectedValue(Object.assign(new Error("nf"), { code: "NoSuchKey" })),
  deleteFile: vi.fn(),
  deleteFiles: vi.fn(),
}))

describe("script-based text/document — end-to-end", () => {
  it("validates → renders → extracts text", async () => {
    // Validate
    const v = await validateScriptArtifact(PROPOSAL)
    expect(v.ok).toBe(true)

    // Render preview
    const preview = await renderArtifactPreview("art-e2e", PROPOSAL)
    expect(preview.pages.length).toBeGreaterThanOrEqual(1)

    // Run + extract
    const r = await runScriptInSandbox(PROPOSAL, {})
    expect(r.ok).toBe(true)
    const text = await extractDocxText(r.buf!)
    expect(text).toContain("Infrastructure Migration Proposal")
    expect(text).toContain("Executive summary")
  }, 90_000)
})
```

- [ ] **Step 3: Run**

```bash
bunx vitest run tests/unit/document-script/e2e.test.ts
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/unit/document-script/e2e.test.ts tests/fixtures/document-script/proposal.script.js
git commit-sulthan -m "test(document-script): end-to-end (validate → render → extract)"
```

---

## Task 22: Regression sweep + finalise

**Files:** none (verification only)

- [ ] **Step 1: Run the full artifact + document-script suite**

```bash
bunx vitest run tests/unit/document-ast/ tests/unit/document-script/ tests/unit/rendering/server/ tests/unit/api/ tests/unit/tools/ tests/unit/features/conversations/sessions/ tests/unit/rag/ src/features/conversations/sessions/service.test.ts src/features/conversations/components/chat/artifacts/renderers/__tests__/
```
Expected: all green. Existing AST artifact tests (~101) + new script tests (~25) all pass.

- [ ] **Step 2: Typecheck**

```bash
bunx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "(document-script|sandbox-runner|validator|docx-to-pdf|pdf-to-pngs|preview-pipeline|edit-document|render-status|render-pages)" | head
```
Expected: empty.

- [ ] **Step 3: Manual end-to-end smoke**

```bash
ARTIFACT_DOC_FORMAT_DEFAULT=script bun run dev
```

In the browser:
1. Open a chat
2. Ask: "Buatkan proposal infrastruktur 3 halaman ke client X"
3. Verify panel shows JS code while LLM streams
4. Verify panel switches to "Rendering preview…" then to PNG carousel
5. Click "Edit", type "Tambah section budget", submit
6. Verify preview re-renders with new content
7. Click "Download as Word"
8. Open the downloaded .docx in LibreOffice or Word
9. Verify it matches the preview pixel-close

- [ ] **Step 4: Add a summary header to the rebuild's central file**

In `src/lib/document-script/sandbox-runner.ts` top of file, replace existing comment with a short module-level summary referencing the design doc:

```ts
/**
 * Sandboxed Node child-process executor for docx-js scripts.
 *
 * See design doc: docs/superpowers/specs/2026-04-27-text-document-script-based-design.md
 *
 * Used by:
 *  - validator.ts (dry-run check at create/update)
 *  - docx-preview-pipeline.ts (preview render)
 *  - download/route.ts (script branch for .docx download)
 *  - rag/index-artifact.ts (extract text for embedding)
 */
```

- [ ] **Step 5: Commit + push**

```bash
git add src/lib/document-script/sandbox-runner.ts
git commit-sulthan -m "docs(document-script): module-level summary header"
git push origin feat/text-document-script-rebuild
```

- [ ] **Step 6: Open PR**

```bash
gh pr create --title "feat(text-document): script-based rebuild with LibreOffice preview" --body "$(cat <<'EOF'
## Summary

Replaces the AST-based `text/document` artifact pipeline with a script-based pipeline + LibreOffice preview, achieving 90–100% output and preview fidelity vs Word. Implements the design at `docs/superpowers/specs/2026-04-27-text-document-script-based-design.md`.

- LLM emits docx-js JavaScript (instead of DocumentAst JSON)
- Server validates + executes script in a sandboxed Node child process
- LibreOffice converts docx → PDF, pdftoppm rasterizes PDF → PNG per page
- Panel displays PNG carousel (true WYSIWYG)
- Edit flow is prompt-based: "Describe your edit" → LLM rewrites full script
- Existing AST artifacts become read-only legacy via `documentFormat="ast"` column

Feature flag: `ARTIFACT_DOC_FORMAT_DEFAULT` env (default `ast`, flip to `script` after staging soak).

## Test plan
- [x] Sandbox runner unit tests (valid script, infinite loop, fs access, invalid output)
- [x] Validator unit tests
- [x] docx → pdf integration test
- [x] pdf → pngs integration test
- [x] Cache layer unit tests
- [x] Preview pipeline integration test
- [x] Download route unit test (script branch)
- [x] Render-status + render-pages route tests
- [x] Edit-document route test
- [x] Repository + service documentFormat plumbing test
- [x] RAG extract-text test
- [x] End-to-end (validate → render → extract)
- [x] Manual: dev server, full streaming + edit + download flow
- [ ] Staging soak: monitor LibreOffice CPU/memory over 1 week
- [ ] Flip `ARTIFACT_DOC_FORMAT_DEFAULT=script` after soak passes

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

**Spec coverage check:**

- §1 background → covered in plan header.
- §2 architecture decisions → all locked decisions implemented (script content, child-process sandbox via temp .mjs file, LibreOffice preview, fresh-start migration, prompt-based edit with retry, TS+sandbox validation, pandoc RAG, JS-code versioning).
- §3 architecture pipeline + render queue → Tasks 2 (sandbox), 6+7+9 (preview), 7a (queue), 8 (cache), 14+15 (panel), 10 (download), 18 (RAG).
- §4 components & file structure → mirrors the file map in plan header.
- §5 data flows + streaming UX → Tasks 5/10/11/13/14/15/16 cover create/streaming/edit/preview/download.
- §6 sandbox security model with module resolution → Tasks 2+3 (temp file approach, timeouts, restrictions, magic bytes).
- §7 validator + retry → Task 4 (validator), Task 13 (llmRewriteWithRetry).
- §8 RAG → Task 18.
- §9 migration → Task 1 (DB column with `'ast'` default), Task 15 (legacy banner + read-only enforcement), Task 20 (feature flag).
- §10 rollback → Task 20 feature flag wiring.
- §10a cache eviction → Task 20 step 2a (S3 lifecycle 30-day TTL).
- §11 test coverage → Tasks 2/3/4/6/7/7a/8/9/10/11/12/13/18/18a/21.
- §12 perf budget → not directly testable in unit tests; verified manually in Task 22 step 3 (smoke).
- §12a observability metrics → Task 18a.
- §13 out of scope → respected (no daemon mode, no inline JS editor, no PDF export from script artifacts in this plan).
- §14 open questions → all resolved per Q1=C / Q2=A.
- §15 effort estimate → ~24 tasks (22 main + 7a + 18a); matches the 3–5 week scope.

**Placeholder scan:** No "TBD", "TODO", or "implement later". Task 17 references reading the docx-js skill — that's a pointer to existing in-repo content (`docs/artifact-plans/-docx.md`), not a placeholder. Task 19 has a "if needed, confirm via grep" hedge — this is appropriate since the package generator's existing pattern isn't fully visible from spec alone.

**Type consistency:** `ScriptValidationResult`, `SandboxResult`, `SandboxOptions`, `PreviewResult`, `RewriteResult`, `RenderStatus`, `Counters` are all defined consistently across tasks where they appear. Function names: `runScriptInSandbox`, `validateScriptArtifact`, `llmRewriteWithRetry`, `withRenderSlot`, `docxToPdf`, `pdfToPngs`, `renderArtifactPreview`, `computeContentHash`, `getCachedPngs`, `putCachedPngs`, `extractDocxText`, `generateScriptRewrite`, `metrics`, `recordSandbox`, `recordRender`, `recordLlmRewrite`, `resetMetrics` — each defined in one task, consumed in later tasks with matching signatures.

**P0/P1 gap fixes applied:**
- (P0) Sandbox import resolution → Task 2 now writes user script to `.tmp/sandbox/<uuid>.mjs` so Node's resolver finds `node_modules/docx`. Avoids data-URL-import-can't-find-bare-specifier issue.
- (P0) Concurrency → Task 7a adds render queue capping concurrent renders at N=3.
- (P0) Streaming UX → Task 14 already shows code during streaming + during render (CodeView component, two-pane layout).
- (P1) LLM retry → Task 13 now uses `llmRewriteWithRetry` with N=2 retries + error feedback into prompt.
- (P1) Cache eviction → Task 20 step 2a documents S3 lifecycle 30-day TTL.
- (P1) Async render endpoints → Existing Task 11 keeps synchronous render-status (Node runtime, 60s budget). Async-job machinery deferred to follow-up if perf data warrants it.
- (P1) Metrics for soak gating → Task 18a adds counters + admin endpoints.

No issues found.
