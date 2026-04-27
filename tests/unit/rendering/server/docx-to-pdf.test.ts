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
