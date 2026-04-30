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

    // D-84: pdftoppm names files `page-1.png … page-N.png` and zero-pads
    // the index when N > 9, but the zero-padding behaviour is implicit.
    // Sort numerically by the integer extracted from the filename so the
    // page order is correct regardless of pdftoppm's padding heuristic.
    const PAGE_RE = /^page-(\d+)\.png$/
    const files = (await readdir(dir))
      .map((f) => {
        const m = f.match(PAGE_RE)
        return m ? { name: f, idx: parseInt(m[1], 10) } : null
      })
      .filter((x): x is { name: string; idx: number } => x !== null)
      .sort((a, b) => a.idx - b.idx)

    return Promise.all(files.map((f) => readFile(join(dir, f.name))))
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
