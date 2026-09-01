/**
 * Unit tests for the chain-of-thought stripper.
 *
 * The case worth guarding is the one that reached production: some chat
 * templates emit the `<think>` opener themselves, so the model produces only the
 * CLOSING tag. A stripper that keys off the opener never enters thinking mode,
 * and the student is shown the model's private planning ("Okay, the user is
 * asking about...") as though it were the answer.
 */
import { describe, it, expect } from "vitest"
import { createStripThinkTransform } from "../../src/lib/llm/strip-think"

type Part = { type: string; id?: string; text?: string }

/** Push `chunks` through the transform and return the emitted text. */
async function run(chunks: string[], { end = true } = {}): Promise<string> {
  const factory = createStripThinkTransform()
  const stream = factory({ tools: {}, stopStream: () => {} })

  const parts: Part[] = chunks.map((text) => ({ type: "text-delta", id: "t0", text }))
  if (end) parts.push({ type: "text-end", id: "t0" })

  const writer = stream.writable.getWriter()
  const reader = stream.readable.getReader()

  const collected: string[] = []
  const pump = (async () => {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      const v = value as unknown as Part
      if (v.type === "text-delta" && typeof v.text === "string") collected.push(v.text)
    }
  })()

  for (const p of parts) await writer.write(p as never)
  await writer.close()
  await pump
  return collected.join("")
}

describe("createStripThinkTransform", () => {
  it("passes ordinary text through untouched", async () => {
    expect(await run(["Gradien adalah ", "kemiringan garis."])).toBe(
      "Gradien adalah kemiringan garis."
    )
  })

  it("strips a well-formed think block", async () => {
    const out = await run(["<think>rencana rahasia</think>", "Jawabannya 42."])
    expect(out).not.toContain("rencana rahasia")
    expect(out).not.toContain("think")
    expect(out.trim()).toBe("Jawabannya 42.")
  })

  it("strips a think block split across chunk boundaries", async () => {
    const out = await run(["<thi", "nk>bocor", "an</thi", "nk>Halo"])
    expect(out).not.toContain("bocoran")
  })

  // The production regression: closer with no opener.
  //
  // Note the boundary of what a streaming transform can promise. Text already
  // handed to the client cannot be recalled, so the reasoning is only removed
  // when the closer arrives before anything has been emitted. That is why the
  // real fix is upstream (`LLM_EXTRA_BODY` turning the model's thinking mode
  // off) and this is only the net beneath it.
  it("drops the reasoning when the closer arrives before anything is emitted", async () => {
    const out = await run([
      "Okay, the user is asking about gerak lurus. I should recall the definition." +
        "</think>\n\nGerak lurus beraturan adalah gerak dengan kecepatan tetap.",
    ])
    expect(out).not.toContain("Okay, the user is asking")
    expect(out).not.toContain("think")
    expect(out.trim()).toBe(
      "Gerak lurus beraturan adalah gerak dengan kecepatan tetap."
    )
  })

  it("never prints a stray closing tag, even mid-answer", async () => {
    const out = await run(["Jawaban dimulai. ", "</think>", "Lanjutannya di sini."])
    expect(out).not.toContain("think")
    expect(out).toContain("Jawaban dimulai.")
    expect(out).toContain("Lanjutannya di sini.")
  })

  it("never prints a stray closer even when split across chunks", async () => {
    const out = await run(["reasoning</th", "ink>Jawaban."])
    expect(out).not.toContain("think")
    expect(out).toContain("Jawaban.")
  })

  it("flushes the held-back tail so the last word is not lost", async () => {
    // The tail is held back in case a tag is still forming; text-end must drain
    // it, otherwise answers lose their final characters.
    expect(await run(["Kutipan yang ter", "sedia"])).toBe("Kutipan yang tersedia")
  })

  it("emits nothing for an unterminated think block rather than leaking it", async () => {
    const out = await run(["<think>masih berpikir tanpa penutup"])
    expect(out).toBe("")
  })
})
