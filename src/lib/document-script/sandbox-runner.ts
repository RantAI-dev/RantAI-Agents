/**
 * Sandboxed Node child-process executor for docx-js scripts.
 *
 * See design doc: docs/superpowers/specs/2026-04-27-text-document-script-based-design.md
 *
 * Used by:
 *  - validator.ts (dry-run check at create/update)
 *  - docx-preview-pipeline.ts (preview render)
 *  - download/route.ts (script branch for .docx download)
 *  - rag/artifact-indexer.ts (extract text for embedding)
 */
import "server-only"
import { spawn } from "node:child_process"
import { mkdir, writeFile, unlink } from "node:fs/promises"
import { existsSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { SandboxOptions, SandboxResult } from "./types"
import { recordSandbox } from "./metrics"

const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_MAX_OUTPUT = 100 * 1024 * 1024
const DEFAULT_MAX_HEAP_MB = 256

const WRAPPER_REL = join("src", "lib", "document-script", "sandbox-wrapper.mjs")

/**
 * Locate this package's root — the directory containing `src/` and
 * `node_modules/`.
 *
 * Both paths this module needs are package-relative, and neither is knowable
 * from `process.cwd()`:
 *
 *  - the wrapper is a real file on disk, spawned as a child process, so it is
 *    not something the bundler resolves for us;
 *  - the scratch directory has to sit *inside* this package, because the user
 *    script does `import "docx"` and Node resolves that by walking up from the
 *    script's own location. `docx` is a dependency of this package only.
 *
 * This used to be `resolve(process.cwd(), …)`, which is correct exactly when
 * the OSS app runs standalone. The cloud starts its server from `apps/cloud`
 * with this package vendored under `packages/rantai-agents`, so both paths
 * pointed at directories that do not exist and every DOCX artifact failed with
 *
 *   Module not found ".../apps/cloud/src/lib/document-script/sandbox-wrapper.mjs"
 *
 * Candidates are ordered most-authoritative first and the result is cached.
 * Resolution is lazy rather than module-scope: throwing at import time would
 * take down every route that merely *imports* a docx helper, turning a broken
 * download into a broken page.
 */
let packageRootCache: string | null = null

export function resolvePackageRoot(): string {
  if (packageRootCache) return packageRootCache

  const candidates: string[] = []

  // 1. Explicit override. The escape hatch for layouts not anticipated here.
  if (process.env.DOCUMENT_SCRIPT_ROOT) candidates.push(process.env.DOCUMENT_SCRIPT_ROOT)

  // 2. This module's own location — the semantically correct answer whenever
  //    the source layout survives to runtime. Guarded: under a bundler
  //    `import.meta.url` may not be a file: URL, and must not throw here.
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    candidates.push(resolve(here, "..", "..", "..")) // src/lib/document-script -> root
  } catch {
    // bundled or non-file URL; the cwd candidates below cover it
  }

  // 3. OSS app run standalone: cwd is already the package root.
  candidates.push(process.cwd())

  // 4. Cloud monorepo: server starts in apps/cloud, package is a submodule.
  candidates.push(resolve(process.cwd(), "..", "..", "packages", "rantai-agents"))

  for (const candidate of candidates) {
    if (existsSync(join(candidate, WRAPPER_REL))) {
      packageRootCache = candidate
      return candidate
    }
  }

  // Loud and specific: the old failure surfaced as a bare ENOENT from a spawned
  // child, which reads like a broken user script rather than a deployment whose
  // layout we failed to anticipate.
  throw new Error(
    `document-script: could not locate ${WRAPPER_REL}. Tried:\n` +
      candidates.map((c) => `  - ${join(c, WRAPPER_REL)}`).join("\n") +
      `\nSet DOCUMENT_SCRIPT_ROOT to the rantai-agents package root.`,
  )
}

export async function runScriptInSandbox(script: string, opts: SandboxOptions): Promise<SandboxResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxOutput = opts.maxOutputBytes ?? DEFAULT_MAX_OUTPUT
  const maxHeapMb = opts.maxHeapMb ?? DEFAULT_MAX_HEAP_MB
  const startedAt = Date.now()

  const packageRoot = resolvePackageRoot()
  const wrapperPath = join(packageRoot, WRAPPER_REL)
  // .tmp/ is gitignored. It must live under the package root, not the cwd:
  // Node resolves the script's `import "docx"` by walking up from the script's
  // own directory, and `docx` is only in this package's node_modules.
  const sandboxDir = join(packageRoot, ".tmp", "sandbox")

  await mkdir(sandboxDir, { recursive: true })
  const scriptPath = join(sandboxDir, `${randomUUID()}.mjs`)
  await writeFile(scriptPath, script, "utf8")

  return new Promise<SandboxResult>((resolve) => {
    const child = spawn(
      process.execPath,
      [
        `--max-old-space-size=${maxHeapMb}`,
        wrapperPath,
        scriptPath,
      ],
      {
        // The package root, not the caller's cwd — keeps the child's resolution
        // anchored to this package wherever the server happens to be started.
        cwd: packageRoot,
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
      recordSandbox({ ok: result.ok, durationMs: result.durationMs })
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
