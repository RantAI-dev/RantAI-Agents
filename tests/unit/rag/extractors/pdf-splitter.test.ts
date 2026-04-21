import { describe, it, expect } from "vitest"
import { PDFDocument } from "pdf-lib"
import { splitPdfByPageCount, getPdfPageCount } from "@/lib/rag/extractors/pdf-splitter"

async function makeTestPdf(pages: number): Promise<Buffer> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([600, 800])
    page.drawText(`page ${i + 1}`, { x: 50, y: 750 })
  }
  const bytes = await doc.save()
  return Buffer.from(bytes)
}

describe("splitPdfByPageCount", () => {
  it("returns input unchanged when pages <= segment size", async () => {
    const pdf = await makeTestPdf(10)
    const segs = await splitPdfByPageCount(pdf, 25)
    expect(segs).toHaveLength(1)
    expect(segs[0]).toBe(pdf)
  })

  it("splits a 100-page PDF into 4 × 25-page segments", async () => {
    const pdf = await makeTestPdf(100)
    const segs = await splitPdfByPageCount(pdf, 25)
    expect(segs).toHaveLength(4)
    for (const seg of segs) {
      const count = await getPdfPageCount(seg)
      expect(count).toBe(25)
    }
  })

  it("handles uneven splits (e.g. 60 pages at 25/segment → 25+25+10)", async () => {
    const pdf = await makeTestPdf(60)
    const segs = await splitPdfByPageCount(pdf, 25)
    expect(segs).toHaveLength(3)
    expect(await getPdfPageCount(segs[0])).toBe(25)
    expect(await getPdfPageCount(segs[1])).toBe(25)
    expect(await getPdfPageCount(segs[2])).toBe(10)
  })

  it("throws on pagesPerSegment < 1", async () => {
    const pdf = await makeTestPdf(5)
    await expect(splitPdfByPageCount(pdf, 0)).rejects.toThrow(/pagesPerSegment/)
  })
})
