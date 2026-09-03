import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
import { docxToPdf } from "@/lib/rendering/server/docx-to-pdf"
import { pdfToPngs } from "@/lib/rendering/server/pdf-to-pngs"

const SAMPLE = readFileSync(join(__dirname, "..", "..", "..", "fixtures", "document-script", "sample-letter.docx"))

// docxToPdf is the input producer here; without libreoffice we can't even
// get a PDF to feed into pdfToPngs.
const HAS_LIBREOFFICE =
  spawnSync("libreoffice", ["--version"], { stdio: "ignore" }).status === 0 ||
  spawnSync("soffice", ["--version"], { stdio: "ignore" }).status === 0

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

describe("pdfToPngs", () => {
  it.skipIf(!HAS_LIBREOFFICE)("rasterizes each page to a PNG buffer", async () => {
    const pdf = await docxToPdf(SAMPLE)
    const pngs = await pdfToPngs(pdf)
    expect(pngs.length).toBeGreaterThanOrEqual(1)
    // PNG magic: 89 50 4e 47 0d 0a 1a 0a
    expect(pngs[0].subarray(0, 8)).toEqual(PNG_MAGIC)
  }, 60_000)

  /**
   * Regression: the reads used to race the temp-directory cleanup.
   *
   * `return Promise.all(...)` completed the try block as soon as the promise
   * existed, so the `finally` began deleting the directory while the page reads
   * were still in flight. In production that surfaced as
   * `ENOENT … open '/tmp/pdf2png-XXXXXX/page-14.png'` for a file readdir had
   * just listed, and as an `unhandledRejection` rather than a reportable error.
   *
   * Honest caveat: this is a timing bug and the assertions below do NOT fail
   * deterministically against the old code — it only lost the race on a loaded
   * host, and repeated attempts on an idle machine (including with
   * UV_THREADPOOL_SIZE=1) did not reproduce it. What this test does buy is real
   * coverage of the multi-page path, where the old shape was most exposed, plus
   * a guard that no page read escapes as an unhandled rejection. The mechanism
   * itself was verified separately: with the cleanup awaiting, a rejection
   * arriving mid-finally is reported as unhandled; with `return await` it is
   * not.
   */
  it.skipIf(!HAS_LIBREOFFICE)("returns every page of a multi-page pdf without losing one to cleanup", async () => {
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on("unhandledRejection", onUnhandled)
    try {
      const pdf = await docxToPdf(await buildMultiPageDocx(14))
      const pngs = await pdfToPngs(pdf)

      expect(pngs.length).toBe(14)
      // Every page must be a real PNG — a partially-read or missing page would
      // otherwise slip through as a short/empty buffer.
      for (const png of pngs) expect(png.subarray(0, 8)).toEqual(PNG_MAGIC)

      await new Promise((r) => setTimeout(r, 50)) // let any stray rejection land
      expect(unhandled).toEqual([])
    } finally {
      process.off("unhandledRejection", onUnhandled)
    }
  }, 120_000)
})

/** A docx with exactly `pages` pages, via explicit page breaks. */
async function buildMultiPageDocx(pages: number): Promise<Buffer> {
  const { Document, Packer, Paragraph, PageBreak, TextRun } = await import("docx")
  const children: InstanceType<typeof Paragraph>[] = []
  for (let p = 1; p <= pages; p++) {
    children.push(new Paragraph({ children: [new TextRun(`page ${p}`)] }))
    if (p < pages) children.push(new Paragraph({ children: [new PageBreak()] }))
  }
  return Packer.toBuffer(new Document({ sections: [{ children }] })) as Promise<Buffer>
}
