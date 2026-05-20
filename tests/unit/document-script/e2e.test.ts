import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
import { validateScriptArtifact } from "@/lib/document-script/validator"
import { renderArtifactPreview } from "@/lib/rendering/server/docx-preview-pipeline"
import { extractDocxText } from "@/lib/document-script/extract-text"
import { runScriptInSandbox } from "@/lib/document-script/sandbox-runner"

const PROPOSAL = readFileSync(join(__dirname, "..", "..", "fixtures", "document-script", "proposal.script.js"), "utf8")

// Mock S3 for cache layer — note: actual export is `downloadFile`, not `getFile`
import { vi } from "vitest"
vi.mock("@/lib/s3", () => ({
  uploadFile: vi.fn().mockResolvedValue({ key: "x", url: "", size: 0 }),
  downloadFile: vi.fn().mockRejectedValue(Object.assign(new Error("nf"), { code: "NoSuchKey" })),
  deleteFile: vi.fn(),
  deleteFiles: vi.fn(),
}))

// End-to-end exercises pandoc (text extraction) + docx-preview-pipeline
// (libreoffice). Both are optional dev/CI deps; skip when missing.
const HAS_PANDOC = spawnSync("pandoc", ["--version"], { stdio: "ignore" }).status === 0
const HAS_LIBREOFFICE =
  spawnSync("libreoffice", ["--version"], { stdio: "ignore" }).status === 0 ||
  spawnSync("soffice", ["--version"], { stdio: "ignore" }).status === 0

describe("script-based text/document — end-to-end", () => {
  it.skipIf(!HAS_PANDOC || !HAS_LIBREOFFICE)("validates → renders → extracts text", async () => {
    // Validate
    const v = await validateScriptArtifact(PROPOSAL)
    expect(v.ok).toBe(true)

    // Render preview
    const preview = await renderArtifactPreview("art-e2e", PROPOSAL)
    expect(preview.pages.length).toBeGreaterThanOrEqual(1)

    // Run + extract
    const r = await runScriptInSandbox(PROPOSAL, {})
    expect(r.ok).toBe(true)
    const text = await extractDocxText(r.buf!)
    expect(text).toContain("Infrastructure Migration Proposal")
    expect(text).toContain("Executive summary")
  }, 90_000)
})
