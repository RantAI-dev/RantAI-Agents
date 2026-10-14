import { describe, it, expect } from "vitest"
import pptxgen from "pptxgenjs"
import { extractTextFromBuffer } from "@/lib/files/parsers"

describe("Office PPTX text extraction (TC-980)", () => {
  it("extracts text from a real PPTX buffer without throwing object error", async () => {
    const pres = new pptxgen()
    const slide = pres.addSlide()
    slide.addText("Knowledge Base PPTX Ingestion Test", { x: 1, y: 1, fontSize: 18 })
    const buffer = (await pres.write({ outputType: "nodebuffer" })) as Buffer

    const text = await extractTextFromBuffer(
      buffer,
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "test-presentation.pptx"
    )

    expect(text).toContain("Knowledge Base PPTX Ingestion Test")
  })

  it("rejects gracefully when corrupted buffer is provided", async () => {
    const corruptBuffer = Buffer.from("this is not a valid pptx binary stream")
    await expect(
      extractTextFromBuffer(
        corruptBuffer,
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "corrupt.pptx"
      )
    ).rejects.toThrow()
  })
})
