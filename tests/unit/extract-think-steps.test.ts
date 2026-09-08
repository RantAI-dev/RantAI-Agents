/**
 * The extract variant re-emits <think> blocks as reasoning parts. The AI SDK
 * UI-stream serializer closes every open reasoning part at `finish-step`, so
 * a reasoning id that spans a tool call (step 1 → step 2) makes every
 * post-tool reasoning delta fail with "reasoning part <id> not found" and the
 * second thinking block is lost. Reasoning must end at each step boundary and
 * restart with a fresh id in the next step.
 */
import { describe, it, expect } from "vitest"
import { createExtractThinkTransform } from "../../src/lib/llm/strip-think"

type Part = { type: string; id?: string; text?: string }

async function run(parts: Part[]): Promise<Part[]> {
  const factory = createExtractThinkTransform()
  const stream = factory({ tools: {}, stopStream: () => {} })
  const writer = stream.writable.getWriter()
  const reader = stream.readable.getReader()
  const out: Part[] = []
  const pump = (async () => {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      out.push(value as unknown as Part)
    }
  })()
  for (const p of parts) await writer.write(p as never)
  await writer.close()
  await pump
  return out
}

describe("createExtractThinkTransform across steps", () => {
  it("ends reasoning at finish-step and starts a new id in the next step", async () => {
    const out = await run([
      { type: "start-step" },
      { type: "text-delta", id: "t0", text: "<think>plan</think>" },
      { type: "text-end", id: "t0" },
      { type: "tool-call", id: "c1" },
      { type: "finish-step" },
      { type: "start-step" },
      { type: "text-delta", id: "t1", text: "<think>review</think>Done." },
      { type: "text-end", id: "t1" },
      { type: "finish-step" },
    ])
    const types = out.map((p) => p.type)
    const firstFinish = types.indexOf("finish-step")
    const before = out.slice(0, firstFinish)
    const after = out.slice(firstFinish + 1)

    // Step 1 reasoning is closed before the step ends.
    expect(before.map((p) => p.type)).toContain("reasoning-end")
    const id1 = before.find((p) => p.type === "reasoning-start")?.id
    // Step 2 opens a fresh reasoning part with a different id.
    const start2 = after.find((p) => p.type === "reasoning-start")
    expect(start2).toBeDefined()
    expect(start2!.id).not.toBe(id1)
    // Every reasoning-delta references a part that is currently open.
    const open = new Set<string>()
    for (const p of out) {
      if (p.type === "reasoning-start") open.add(p.id!)
      if (p.type === "reasoning-delta") expect(open.has(p.id!), `delta for ${p.id}`).toBe(true)
      if (p.type === "reasoning-end") open.delete(p.id!)
    }
    expect(open.size).toBe(0)
  })
})
