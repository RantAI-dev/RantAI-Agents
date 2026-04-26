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
    const result = await validateArtifactContent(
      "text/document",
      JSON.stringify({
        meta: { title: "x" },
        body: [{ type: "paragraph", children: [{ type: "text", text: "y" }] }],
      }),
    )
    const elapsed = Date.now() - start
    expect(result.ok).toBe(true)
    expect(elapsed).toBeLessThan(VALIDATE_TIMEOUT_MS)
  })

  it("returns a timeout error with the budget in the message when a slow validator hangs", async () => {
    // Validators are dispatched through `Promise.resolve().then(...)` (a
    // microtask) which can settle before any setTimeout-based timer
    // fires for sync validators, so a tiny-but-positive budget is not
    // a reliable trigger. We use validateDocument with a large body
    // that pulls in the Unsplash resolver and then trip the timeout
    // by setting the budget to 0 — at that boundary even an awaited
    // microtask path is reliably interrupted because the resolver's
    // own awaits surrender control.
    __setValidateTimeoutMsForTesting(0)
    // text/document validator is genuinely async (Zod parse + Unsplash
    // resolution); the awaits inside it yield control, letting the
    // 0ms timer beat the validator.
    const result = await validateArtifactContent(
      "text/document",
      JSON.stringify({
        meta: { title: "x" },
        body: [
          { type: "image", src: "unsplash:mountain", alt: "a", width: 100, height: 100 },
          { type: "paragraph", children: [{ type: "text", text: "y" }] },
        ],
      }),
    )
    expect(result.ok).toBe(false)
    const message = result.errors.join(" ")
    expect(message).toMatch(/timeout/i)
    expect(message).toMatch(/text\/document/)
    expect(message).toMatch(/0ms/)
  })

  it("clearing the test override restores the default budget", async () => {
    __setValidateTimeoutMsForTesting(0)
    const slow = await validateArtifactContent(
      "text/document",
      JSON.stringify({
        meta: { title: "x" },
        body: [
          { type: "image", src: "unsplash:cat", alt: "a", width: 100, height: 100 },
        ],
      }),
    )
    expect(slow.ok).toBe(false)
    expect(slow.errors.join(" ")).toMatch(/timeout/i)

    __setValidateTimeoutMsForTesting(undefined)
    const fast = await validateArtifactContent("text/markdown", "# title")
    expect(fast.ok).toBe(true)
  })
})
