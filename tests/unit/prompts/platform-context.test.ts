import { describe, expect, it } from "vitest"
import {
  buildPlatformContextInstruction,
  LANGUAGE_INSTRUCTION,
} from "@/lib/prompts/instructions"

// QA finding-1: TC-803 (identity leak), CHAT-035 (stale year), INC-002 (script
// contamination). The rules only help if they reach the model, so these pin
// the text the chat, widget, agent-api and chatflow paths now all append.
describe("buildPlatformContextInstruction", () => {
  const now = new Date("2026-09-25T03:00:00Z")

  it("names the assistant and forbids claiming another vendor's identity", () => {
    const text = buildPlatformContextInstruction({ assistantName: "Just Chat", now })
    expect(text).toContain("You are Just Chat")
    expect(text).toMatch(/Never claim to be, or to be made by, another company/)
    for (const vendor of ["Claude", "Anthropic", "MiniMax", "OpenAI"]) {
      expect(text).toContain(vendor)
    }
  })

  it("offers the white-labelled model name only when one is given", () => {
    const withModel = buildPlatformContextInstruction({ modelName: "RantAI Nano", now })
    expect(withModel).toContain('you may say "RantAI Nano"')

    const without = buildPlatformContextInstruction({ now })
    expect(without).not.toContain("you may say")
    expect(without).toContain("You are RantAI Assistant")
  })

  it("states today's date in the requested zone", () => {
    // 03:00 UTC on the 25th is still the 24th in Los Angeles — the zone matters.
    const jakarta = buildPlatformContextInstruction({ now, timeZone: "Asia/Jakarta" })
    expect(jakarta).toContain("25 September 2026")
    expect(jakarta).toContain("(Asia/Jakarta)")

    const la = buildPlatformContextInstruction({ now, timeZone: "America/Los_Angeles" })
    expect(la).toContain("24 September 2026")
  })

  it("falls back to UTC for an unknown zone instead of throwing", () => {
    const text = buildPlatformContextInstruction({ now, timeZone: "Mars/Olympus" })
    expect(text).toContain("25 September 2026")
    expect(text).toContain("(UTC)")
  })
})

describe("LANGUAGE_INSTRUCTION", () => {
  it("forbids non-Latin script in Indonesian/English replies", () => {
    expect(LANGUAGE_INSTRUCTION).toMatch(/Latin script only/)
    expect(LANGUAGE_INSTRUCTION).toMatch(/Chinese/)
    expect(LANGUAGE_INSTRUCTION).toMatch(/Cyrillic/)
  })
})
