import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
import { docxToPdf } from "@/lib/rendering/server/docx-to-pdf"

const SAMPLE = readFileSync(join(__dirname, "..", "..", "..", "fixtures", "document-script", "sample-letter.docx"))

// docxToPdf shells out to libreoffice/soffice; ubuntu-latest doesn't ship it
// so the prebuilt-binary route in CI can't run this. Production code already
// surfaces a friendly error when missing.
const HAS_LIBREOFFICE =
  spawnSync("libreoffice", ["--version"], { stdio: "ignore" }).status === 0 ||
  spawnSync("soffice", ["--version"], { stdio: "ignore" }).status === 0

describe("docxToPdf", () => {
  it.skipIf(!HAS_LIBREOFFICE)("converts a docx buffer to a PDF buffer with %PDF magic bytes", async () => {
    const pdf = await docxToPdf(SAMPLE)
    expect(pdf.length).toBeGreaterThan(500)
    expect(pdf.subarray(0, 4)).toEqual(Buffer.from("%PDF"))
  }, 30_000)
})
