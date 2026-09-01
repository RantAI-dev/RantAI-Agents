/**
 * The sandbox must work regardless of the process's working directory.
 *
 * This is its own file because sandbox-runner resolves the package root once
 * and caches it; a fresh module registry per file lets us chdir before the
 * first call.
 *
 * Why it exists: sandbox-runner previously built both the wrapper path and the
 * sandbox scratch directory from `process.cwd()`, which is only the package
 * root when the OSS app runs standalone. The cloud runs its server from
 * `apps/cloud`, so in production both resolved to paths that do not exist:
 *
 *   Module not found "/app/apps/cloud/src/lib/document-script/sandbox-wrapper.mjs"
 *
 * Every DOCX artifact path (create-validation, preview, download, RAG indexing)
 * failed on it, while this suite stayed green — because vitest happens to run
 * with cwd already at the package root. Running from anywhere else is the
 * property that was never covered.
 */
import { describe, it, expect, afterAll } from "vitest"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const originalCwd = process.cwd()
afterAll(() => process.chdir(originalCwd))

describe("runScriptInSandbox — working directory independence", () => {
  it("renders a docx when cwd is not the package root", async () => {
    // Somewhere with no node_modules and no src/ — the shape of any deployment
    // that starts the server from a subdirectory.
    process.chdir(mkdtempSync(join(tmpdir(), "sandbox-cwd-")))

    const { runScriptInSandbox } = await import("@/lib/document-script/sandbox-runner")

    const script = `
      import { Document, Paragraph, TextRun, Packer } from "docx"
      const doc = new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun("hello")] })] }] })
      Packer.toBuffer(doc).then(buf => process.stdout.write(buf.toString("base64")))
    `
    const r = await runScriptInSandbox(script, {})

    // Asserting on the error text too: the two failure modes are distinct and
    // fixing only the first leaves the second, which is how a partial fix reads
    // as progress. Wrapper missing -> ERR_MODULE_NOT_FOUND on sandbox-wrapper;
    // scratch dir outside the package -> "Cannot find package 'docx'".
    expect(r.error ?? "").not.toMatch(/sandbox-wrapper/)
    expect(r.error ?? "").not.toMatch(/Cannot find package 'docx'/)
    expect(r.ok).toBe(true)
    expect(r.buf!.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
  })
})
