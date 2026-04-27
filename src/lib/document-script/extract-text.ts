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
      child.on("error", (err) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
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
