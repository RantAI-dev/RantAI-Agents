/**
 * QA INC-002: Indonesian answers carried stray Chinese/Cyrillic tokens
 * ("sistem机器 yang", "cabang人工智能"). A live re-run after the prompt fix
 * still produced "广泛应用", so the stream is guarded as well.
 */
import { describe, expect, it, vi } from "vitest"
import {
  createScriptGuardTransform,
  shouldGuardScript,
  type ScriptRepair,
} from "../../src/lib/llm/script-guard"

type Part = { type: string; id?: string; text?: string }

async function run(chunks: string[], repair: ScriptRepair): Promise<string> {
  const stream = createScriptGuardTransform(repair)({ tools: {}, stopStream: () => {} })
  const writer = stream.writable.getWriter()
  const reader = stream.readable.getReader()
  const out: string[] = []
  const pump = (async () => {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      const v = value as unknown as Part
      if (v.type === "text-delta" && v.text) out.push(v.text)
    }
  })()
  for (const text of chunks) await writer.write({ type: "text-delta", id: "t0", text } as never)
  await writer.write({ type: "text-end", id: "t0" } as never)
  await writer.close()
  await pump
  return out.join("")
}

const dictionary: ScriptRepair = async (fragment) =>
  ({ "机器": "mesin", "广泛应用": "diterapkan secara luas", "人工智能": "kecerdasan buatan" })[fragment] ?? null

describe("script guard", () => {
  it("replaces a CJK run in context and keeps word spacing", async () => {
    await expect(run(["AI adalah sistem机器 yang belajar."], dictionary)).resolves.toBe(
      "AI adalah sistem mesin yang belajar.",
    )
  })

  it("holds a run split across deltas until it is complete", async () => {
    const repair = vi.fn(dictionary)
    const out = await run(["AI telah 广泛", "应用 di berbagai bidang."], repair)
    expect(out).toBe("AI telah diterapkan secara luas di berbagai bidang.")
    expect(repair).toHaveBeenCalledTimes(1)
    expect(repair.mock.calls[0][0]).toBe("广泛应用")
  })

  it("repairs a run at the very end of the answer", async () => {
    await expect(run(["Ini cabang ", "人工智能"], dictionary)).resolves.toBe("Ini cabang kecerdasan buatan")
  })

  it("drops the run when the repair is itself contaminated or fails", async () => {
    const dirty: ScriptRepair = async () => "мешин"
    await expect(run(["sistem机器 yang"], dirty)).resolves.toBe("sistem yang")
    const broken: ScriptRepair = async () => {
      throw new Error("timeout")
    }
    await expect(run(["sistem机器 yang"], broken)).resolves.toBe("sistem yang")
  })

  it("passes clean text through untouched without calling repair (control)", async () => {
    const repair = vi.fn(dictionary)
    const text = "Pembelajaran mesin adalah cabang kecerdasan buatan — “AI” — dengan 3 pilar."
    await expect(run([text.slice(0, 20), text.slice(20)], repair)).resolves.toBe(text)
    expect(repair).not.toHaveBeenCalled()
  })
})

describe("shouldGuardScript", () => {
  it("guards Latin-script users only", () => {
    expect(shouldGuardScript("jelaskan apa itu ai")).toBe(true)
    expect(shouldGuardScript("人工智能是什么")).toBe(false)
    expect(shouldGuardScript("Переведи: hello")).toBe(false)
  })
})
