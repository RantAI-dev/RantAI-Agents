import "server-only"
import { spawn } from "node:child_process"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const TIMEOUT_MS = 15_000

/**
 * D-86: track pandoc availability across the process lifetime so we don't
 * spam the same ENOENT line for every artifact when the binary is missing
 * (e.g. dev machine without `apt install pandoc`). The caller in
 * `artifact-indexer.ts` already falls back to embedding the script source,
 * so the only behavioural cost of a missing binary is the embed quality.
 */
let pandocMissingLogged = false

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
      child.on("error", (err) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        const isMissingBinary = (err as NodeJS.ErrnoException).code === "ENOENT"
        if (isMissingBinary && !pandocMissingLogged) {
          pandocMissingLogged = true
          console.warn(
            "[extract-text] pandoc binary not found — RAG embedding for text/document will fall back to script source. Install pandoc for higher-quality embeddings.",
          )
        }
        reject(new Error(`pandoc spawn failed: ${err.message}`))
      })
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
