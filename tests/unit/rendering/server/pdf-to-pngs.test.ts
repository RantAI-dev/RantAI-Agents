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
