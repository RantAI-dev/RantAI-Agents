// @vitest-environment node
import { describe, it, expect } from "vitest"
import {
  applyUiStreamEvent,
  timelineFromMessage,
  timelineToPersisted,
  timelineText,
  stripRecoveredFence,
  type TimelinePart,
} from "@/features/conversations/components/chat/message-timeline"

function run(events: Array<Record<string, unknown>>, start: TimelinePart[] = []) {
  let t = start
  let now = 1000
  for (const e of events) {
    now += 100
    t = applyUiStreamEvent(t, e, now)
  }
  return t
}

describe("applyUiStreamEvent — ordering", () => {
  it("keeps text → tool → text in the order the stream produced it", () => {
    const t = run([
      { type: "text-start", id: "t1" },
      { type: "text-delta", id: "t1", delta: "Let me check. " },
      { type: "text-end", id: "t1" },
      { type: "tool-input-start", toolCallId: "c1", toolName: "web_search" },
      { type: "tool-input-available", toolCallId: "c1", toolName: "web_search", input: { query: "x" } },
      { type: "tool-output-available", toolCallId: "c1", output: { hits: 3 } },
      { type: "text-start", id: "t2" },
      { type: "text-delta", id: "t2", delta: "Found 3." },
    ])
    expect(t.map((p) => p.type)).toEqual(["text", "tool", "text"])
    expect((t[0] as { text: string }).text).toBe("Let me check. ")
    expect((t[2] as { text: string }).text).toBe("Found 3.")
  })

  it("opens a new text segment after a tool even without an explicit text-start", () => {
    const t = run([
      { type: "text-delta", delta: "a" },
      { type: "tool-input-start", toolCallId: "c1", toolName: "calc" },
      { type: "text-delta", delta: "b" },
    ])
    expect(t.map((p) => p.type)).toEqual(["text", "tool", "text"])
  })

  it("updates a tool part in place instead of appending a duplicate", () => {
    const t = run([
      { type: "tool-input-start", toolCallId: "c1", toolName: "calc" },
      { type: "tool-input-available", toolCallId: "c1", toolName: "calc", input: { a: 1 } },
      { type: "tool-output-available", toolCallId: "c1", output: 2 },
    ])
    expect(t).toHaveLength(1)
    const tool = t[0] as Extract<TimelinePart, { type: "tool" }>
    expect(tool.state).toBe("done")
    expect(tool.input).toEqual({ a: 1 })
    expect(tool.output).toBe(2)
    expect(tool.startedAt).toBe(1100)
    expect(tool.endedAt).toBe(1300)
  })

  it("marks tool errors", () => {
    const t = run([
      { type: "tool-input-start", toolCallId: "c1", toolName: "calc" },
      { type: "tool-output-error", toolCallId: "c1", errorText: "boom" },
    ])
    const tool = t[0] as Extract<TimelinePart, { type: "tool" }>
    expect(tool.state).toBe("error")
    expect(tool.errorText).toBe("boom")
  })

  it("accepts a tool-result for a call it never saw (server-side tools)", () => {
    const t = run([{ type: "tool-result", toolCallId: "c9", toolName: "kb", output: { ok: true } }])
    expect(t).toHaveLength(1)
    expect((t[0] as { state: string }).state).toBe("done")
  })

  it("puts reasoning first and accumulates deltas into one part", () => {
    const t = run([
      { type: "reasoning-start" },
      { type: "reasoning-delta", delta: "think " },
      { type: "reasoning-delta", delta: "more" },
      { type: "reasoning-end" },
      { type: "text-delta", delta: "answer" },
    ])
    expect(t.map((p) => p.type)).toEqual(["reasoning", "text"])
    const r = t[0] as Extract<TimelinePart, { type: "reasoning" }>
    expect(r.text).toBe("think more")
    expect(r.streaming).toBe(false)
    expect(r.durationMs).toBe(300)
  })

  it("does not mutate the input array", () => {
    const start: TimelinePart[] = [{ type: "text", text: "a" }]
    const next = applyUiStreamEvent(start, { type: "text-delta", delta: "b" }, 1)
    expect(start[0]).toEqual({ type: "text", text: "a" })
    expect(next[0]).toEqual({ type: "text", text: "ab" })
  })
})

describe("timelineFromMessage", () => {
  it("prefers metadata.parts when present", () => {
    const t = timelineFromMessage({
      content: "ignored",
      metadata: {
        parts: [
          { type: "text", text: "before" },
          { type: "tool", toolCallId: "c1", toolName: "x", state: "done" },
          { type: "text", text: "after" },
        ],
      },
    })
    expect(t.map((p) => p.type)).toEqual(["text", "tool", "text"])
  })

  it("falls back to legacy shape: reasoning, tool-invocation parts, then content", () => {
    const t = timelineFromMessage({
      content: "hello",
      parts: [
        { type: "tool-invocation", toolCallId: "c1", toolName: "x", state: "result", args: { q: 1 }, output: 2 },
      ],
      metadata: { reasoning: "hmm", reasoningDurationMs: 42 },
    })
    expect(t.map((p) => p.type)).toEqual(["reasoning", "tool", "text"])
    const tool = t[1] as Extract<TimelinePart, { type: "tool" }>
    expect(tool.state).toBe("done")
    expect(tool.input).toEqual({ q: 1 })
    expect((t[2] as { text: string }).text).toBe("hello")
  })

  it("falls back to metadata.toolCalls after a refresh", () => {
    const t = timelineFromMessage({
      content: "x",
      metadata: {
        toolCalls: [{ toolCallId: "c1", toolName: "y", state: "done", input: {}, output: { id: "a" } }],
      },
    })
    expect(t.map((p) => p.type)).toEqual(["tool", "text"])
  })

  it("returns a single text part for a plain message", () => {
    expect(timelineFromMessage({ content: "plain" })).toEqual([{ type: "text", text: "plain" }])
  })
})

describe("timelineToPersisted / timelineText", () => {
  it("drops transient fields and empty text parts", () => {
    const t: TimelinePart[] = [
      { type: "reasoning", text: "r", streaming: false, durationMs: 5 },
      { type: "text", text: "" },
      { type: "tool", toolCallId: "c1", toolName: "x", state: "done", startedAt: 1, endedAt: 2 },
      { type: "text", text: "body" },
    ]
    const p = timelineToPersisted(t)
    expect(p).toEqual([
      { type: "reasoning", text: "r", durationMs: 5 },
      { type: "tool", toolCallId: "c1", toolName: "x", state: "done", startedAt: 1, endedAt: 2 },
      { type: "text", text: "body" },
    ])
    expect(timelineText(t)).toBe("body")
  })
})

describe("stripRecoveredFence", () => {
  it("removes the fenced block whose body matches the recovered artifact content", () => {
    const content = '{"theme":{},"slides":[]}'
    const text = `Here is the deck:\n\n\`\`\`json\n${content}\n\`\`\`\n\nEnjoy.`
    expect(stripRecoveredFence(text, content)).toBe("Here is the deck:\n\nEnjoy.")
  })

  it("removes a bare JSON body when there is no fence", () => {
    const content = '{"cells":[]}'
    expect(stripRecoveredFence(`${content}`, content)).toBe("")
  })

  it("leaves text alone when the content is not found", () => {
    expect(stripRecoveredFence("hello", "nope")).toBe("hello")
  })
})
