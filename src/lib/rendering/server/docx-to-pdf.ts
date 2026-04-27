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
