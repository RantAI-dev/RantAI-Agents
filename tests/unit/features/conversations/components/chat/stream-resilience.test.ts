// @vitest-environment node
import { describe, it, expect } from "vitest"
import {
  STREAM_INACTIVITY_MS,
  STREAM_TOOL_INACTIVITY_MS,
  classifyStreamFailure,
  hasRunningToolCall,
  isStreamStalled,
  resolveStreamErrorEvents,
} from "@/features/conversations/components/chat/stream-resilience"

const abortError = () => Object.assign(new Error("The operation was aborted."), { name: "AbortError" })

describe("classifyStreamFailure", () => {
  it("treats a plain AbortError as the user's Stop (silent)", () => {
    expect(classifyStreamFailure(abortError(), null)).toBe("user-abort")
  })

  it("treats an AbortError caused by the offline/stall watchdog as a lost connection", () => {
    expect(classifyStreamFailure(abortError(), "offline")).toBe("connection-lost")
    expect(classifyStreamFailure(abortError(), "stalled")).toBe("connection-lost")
  })

  it("treats a fetch network TypeError as a lost connection", () => {
    expect(classifyStreamFailure(new TypeError("network error"), null)).toBe("connection-lost")
    expect(classifyStreamFailure(new Error("boom"), null, false)).toBe("connection-lost")
  })

  it("positive control: other errors stay generic errors", () => {
    expect(classifyStreamFailure(new Error("Failed to get response: 500"), null)).toBe("error")
  })
})

describe("isStreamStalled", () => {
  it("fires after the idle limit with no bytes", () => {
    expect(isStreamStalled({ msSinceLastByte: STREAM_INACTIVITY_MS, toolRunning: false })).toBe(true)
  })

  it("positive control: does not fire just under the limit", () => {
    expect(isStreamStalled({ msSinceLastByte: STREAM_INACTIVITY_MS - 1, toolRunning: false })).toBe(false)
  })

  it("allows a longer silence while a tool is executing", () => {
    expect(isStreamStalled({ msSinceLastByte: STREAM_INACTIVITY_MS * 2, toolRunning: true })).toBe(false)
    expect(isStreamStalled({ msSinceLastByte: STREAM_TOOL_INACTIVITY_MS, toolRunning: true })).toBe(true)
  })

  it("hasRunningToolCall sees an un-resulted call", () => {
    expect(hasRunningToolCall(["result", "call"])).toBe(true)
    expect(hasRunningToolCall(["result", "error"])).toBe(false)
  })
})

describe("resolveStreamErrorEvents (SSE `error` events)", () => {
  it("surfaces the server errorText when the stream produced nothing", () => {
    expect(
      resolveStreamErrorEvents({ errorTexts: ["This model is busy or rate-limited right now."], hasOutput: false }),
    ).toEqual({ surface: true, message: "This model is busy or rate-limited right now." })
  })

  it("does not surface a transient error when the stream recovered with output", () => {
    expect(resolveStreamErrorEvents({ errorTexts: ["transient"], hasOutput: true })).toEqual({ surface: false })
  })

  it("positive control: no error events, nothing to surface", () => {
    expect(resolveStreamErrorEvents({ errorTexts: [], hasOutput: false })).toEqual({ surface: false })
  })

  it("falls back to a generic message for an empty errorText", () => {
    const result = resolveStreamErrorEvents({ errorTexts: [""], hasOutput: false })
    expect(result.surface).toBe(true)
  })
})
