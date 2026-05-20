import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
import { extractDocxText } from "@/lib/document-script/extract-text"

const SAMPLE = readFileSync(join(__dirname, "..", "..", "fixtures", "document-script", "sample-letter.docx"))

// Production gracefully handles missing pandoc (logs once, returns ""). CI
// images don't ship pandoc, so skip rather than fail when the binary is absent.
const HAS_PANDOC = spawnSync("pandoc", ["--version"], { stdio: "ignore" }).status === 0

describe("extractDocxText", () => {
  it.skipIf(!HAS_PANDOC)("extracts plain text from a docx buffer via pandoc", async () => {
    const text = await extractDocxText(SAMPLE)
    expect(text).toContain("Sample Letter")
  }, 30_000)
})
