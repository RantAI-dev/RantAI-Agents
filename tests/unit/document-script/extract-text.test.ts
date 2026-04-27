import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { extractDocxText } from "@/lib/document-script/extract-text"

const SAMPLE = readFileSync(join(__dirname, "..", "..", "fixtures", "document-script", "sample-letter.docx"))

describe("extractDocxText", () => {
  it("extracts plain text from a docx buffer via pandoc", async () => {
    const text = await extractDocxText(SAMPLE)
    expect(text).toContain("Sample Letter")
  }, 30_000)
})
