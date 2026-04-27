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
