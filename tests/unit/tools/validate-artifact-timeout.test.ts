// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest"
import {
  validateArtifactContent,
  VALIDATE_TIMEOUT_MS,
  __setValidateTimeoutMsForTesting,
} from "@/lib/tools/builtin/_validate-artifact"

describe("validateArtifactContent — timeout", () => {
  afterEach(() => {
    // Clear any test-only override so other suites see the real budget.
    __setValidateTimeoutMsForTesting(undefined)
  })

  it("exposes a constant 5-second default budget", () => {
    // Public expectation pinned by callers (LLM error message, ops dashboards).
    // If the default ever changes, update this test consciously.
    expect(VALIDATE_TIMEOUT_MS).toBe(5_000)
  })

  it("validates fast content well under the default budget", async () => {
    const start = Date.now()
    const result = await validateArtifactContent("text/markdown", "# Hello\n\nbody")
    const elapsed = Date.now() - start
    expect(result.ok).toBe(true)
    expect(elapsed).toBeLessThan(VALIDATE_TIMEOUT_MS)
  })

  it("returns a timeout error with the budget in the message when a slow validator hangs", async () => {
    // `validateDocument` is genuinely async: it dynamic-imports the
    // script validator, which then spawns a child Node process for the
    // sandbox dry-run. That spawn yields the event loop, so a 0 ms
    // budget reliably fires before the sandbox returns.
    __setValidateTimeoutMsForTesting(0)
    const validScript = `
      import { Document, Paragraph, TextRun, Packer } from "docx"
      const doc = new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun("x")] })] }] })
      Packer.toBuffer(doc).then(buf => process.stdout.write(buf.toString("base64")))
    `
    const result = await validateArtifactContent("text/document", validScript)
    expect(result.ok).toBe(false)
    const message = result.errors.join(" ")
    expect(message).toMatch(/timeout/i)
    expect(message).toMatch(/text\/document/)
    expect(message).toMatch(/0ms/)
  })

  it("clearing the test override restores the default budget", async () => {
    __setValidateTimeoutMsForTesting(0)
    const validScript = `
      import { Document, Paragraph, TextRun, Packer } from "docx"
      const doc = new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun("y")] })] }] })
      Packer.toBuffer(doc).then(buf => process.stdout.write(buf.toString("base64")))
    `
    const slow = await validateArtifactContent("text/document", validScript)
    expect(slow.ok).toBe(false)
    expect(slow.errors.join(" ")).toMatch(/timeout/i)

    __setValidateTimeoutMsForTesting(undefined)
    const fast = await validateArtifactContent("text/markdown", "# title")
    expect(fast.ok).toBe(true)
  })
})
