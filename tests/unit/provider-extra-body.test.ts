/**
 * Unit tests for the managed-provider extra-body merge.
 *
 * Two production facts drive these. Self-hosted vLLM only reports token usage
 * when asked (`stream_options.include_usage`), so without it every response
 * carries usage 0/0/0 and credit tracking is blind. But vLLM also *rejects*
 * that field unless the same request sets `stream: true` — so injecting it
 * unconditionally converts every non-streaming call into a 400.
 */
import { describe, it, expect } from "vitest"
import { mergeExtraBody } from "../../src/lib/llm/provider"

const EXTRA = {
  chat_template_kwargs: { thinking_mode: "off" },
  stream_options: { include_usage: true },
}

const parse = (s: string) => JSON.parse(s) as Record<string, unknown>

describe("mergeExtraBody", () => {
  it("leaves the body untouched when there is nothing to add", () => {
    const body = JSON.stringify({ model: "base", stream: true })
    expect(mergeExtraBody(body, null)).toBe(body)
  })

  it("adds stream_options to a streaming request, so usage comes back", () => {
    const out = parse(mergeExtraBody(JSON.stringify({ model: "base", stream: true }), EXTRA))
    expect(out.stream_options).toEqual({ include_usage: true })
    expect(out.chat_template_kwargs).toEqual({ thinking_mode: "off" })
  })

  it("drops stream_options from a non-streaming request", () => {
    // vLLM: "Stream options can only be defined when stream=True" → 400.
    const out = parse(mergeExtraBody(JSON.stringify({ model: "base", stream: false }), EXTRA))
    expect(out).not.toHaveProperty("stream_options")
    expect(out.chat_template_kwargs).toEqual({ thinking_mode: "off" })
  })

  it("drops stream_options when stream is absent entirely", () => {
    const out = parse(mergeExtraBody(JSON.stringify({ model: "base" }), EXTRA))
    expect(out).not.toHaveProperty("stream_options")
  })

  it("treats a truthy-but-not-true stream value as non-streaming", () => {
    // Only a real boolean true is legal upstream; "true" the string is not.
    const out = parse(mergeExtraBody(JSON.stringify({ model: "base", stream: "true" }), EXTRA))
    expect(out).not.toHaveProperty("stream_options")
  })

  it("preserves the caller's own fields", () => {
    const out = parse(
      mergeExtraBody(
        JSON.stringify({ model: "base", stream: true, messages: [{ role: "user", content: "halo" }], temperature: 0.3 }),
        EXTRA
      )
    )
    expect(out.model).toBe("base")
    expect(out.temperature).toBe(0.3)
    expect(out.messages).toHaveLength(1)
  })

  it("returns the input unchanged when the body is not JSON", () => {
    expect(mergeExtraBody("not json at all", EXTRA)).toBe("not json at all")
  })

  it("returns the input unchanged for a JSON array body", () => {
    expect(mergeExtraBody("[1,2,3]", EXTRA)).toBe("[1,2,3]")
  })
})
