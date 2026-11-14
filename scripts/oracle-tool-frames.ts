/**
 * The tool frames of the AI SDK, from the SDK itself.
 *
 * The Rust chat writes the tool chunks of a turn by hand (`agents_contracts::ui_stream`), so
 * the bytes have to be the ones the installed `ai` package writes. This script drives the real
 * `streamText(...).toUIMessageStreamResponse()` with a mock model from `ai/test`, the old
 * approval gate (`gateToolsForApproval`) and the old `onError` of `chat-public/service.ts`, and
 * prints the SSE frames, so the Rust tests (`agents-server/tests/chat_tools*.rs`) can assert
 * the same bytes.
 *
 *   bun scripts/oracle-tool-frames.ts
 *
 * It must run from the repository root: outside it, Bun resolves another `ai` from its cache.
 */

import {
  stepCountIs,
  streamText,
  tool,
  type LanguageModelV3StreamPart,
  type ToolSet,
} from "ai"
import { MockLanguageModelV3 } from "ai/test"
import { z } from "zod"

import { gateToolsForApproval, respondToToolApproval } from "../src/lib/tools/approval"

const INPUT_JSON = '{"expression":"2 + 3 * 4"}'

/** The usage of a step, in the shape `LanguageModelV3Usage` has. */
function usage(input: number, output: number) {
  return {
    inputTokens: { total: input, noCache: input, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: output, text: output, reasoning: undefined },
  }
}

/** A model that calls `toolName` with `input` first, then answers. */
function mockModel(toolName: string, input: string): MockLanguageModelV3 {
  let called = 0
  return new MockLanguageModelV3({
    modelId: "mock",
    doStream: async () => {
      called += 1
      const parts: LanguageModelV3StreamPart[] =
        called === 1
          ? [
              { type: "stream-start", warnings: [] },
              { type: "tool-input-start", id: "call_1", toolName },
              { type: "tool-input-delta", id: "call_1", delta: input },
              { type: "tool-input-end", id: "call_1" },
              { type: "tool-call", toolCallId: "call_1", toolName, input },
              {
                type: "finish",
                finishReason: { unified: "tool-calls", raw: "tool_calls" },
                usage: usage(10, 5),
              },
            ]
          : [
              { type: "stream-start", warnings: [] },
              { type: "text-start", id: "txt-0" },
              { type: "text-delta", id: "txt-0", delta: "The answer is 14." },
              { type: "text-end", id: "txt-0" },
              {
                type: "finish",
                finishReason: { unified: "stop", raw: "stop" },
                usage: usage(12, 6),
              },
            ]
      return {
        stream: new ReadableStream({
          start(controller) {
            for (const part of parts) controller.enqueue(part)
            controller.close()
          },
        }),
      }
    },
  })
}

/** The `onError` of `toUIMessageStreamResponse` in `chat-public/service.ts`. */
function onError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error)
  if (/401|403|unauthor|api[_ ]?key|no auth|invalid.?key/i.test(msg)) {
    return "The model provider rejected the request — its API key may be missing or invalid. Try a different model."
  }
  if (/429|rate.?limit|quota|temporarily|overloaded|unavailable/i.test(msg)) {
    return "This model is busy or rate-limited right now. Please wait a moment or switch models."
  }
  return "The model didn't return a response. Please try again or switch models."
}

function tools(name: string, fail: boolean): ToolSet {
  return {
    [name]: tool({
      description: "Evaluate a mathematical expression.",
      inputSchema: z.object({ expression: z.string() }),
      execute: async ({ expression }) => {
        if (fail) throw new Error("the calculator is broken")
        return { success: true, expression, result: 14 }
      },
    }),
  }
}

interface Turn {
  label: string
  /** The tool the model calls; the turn always offers `calculator`. */
  toolName?: string
  input?: string
  fail?: boolean
  steps: number
  /** The approval mode; unset means the tools are not gated. */
  gate?: "off" | "risky" | "all"
  /** The decision the user sends before the tool waits for it. */
  decision?: boolean
}

async function turn(t: Turn): Promise<void> {
  const name = t.toolName ?? "calculator"
  let set = tools("calculator", t.fail === true)
  let gated: string[] = []
  if (t.gate) {
    ;({ tools: set, gated } = gateToolsForApproval(set, { mode: t.gate, userId: "user_1" }))
  }
  if (t.decision !== undefined) {
    respondToToolApproval({ toolCallId: "call_1", userId: "user_1", approved: t.decision })
  }
  const result = streamText({
    model: mockModel(name, t.input ?? INPUT_JSON),
    prompt: "what is 2 + 3 * 4?",
    tools: set,
    stopWhen: stepCountIs(t.steps),
  })
  const response = result.toUIMessageStreamResponse({
    headers: gated.length > 0 ? { "X-Tool-Approval": gated.join(",") } : undefined,
    onError,
  })
  const header = response.headers.get("X-Tool-Approval")
  const text = await response.text()
  process.stdout.write(`=== ${t.label} ===\nX-Tool-Approval: ${header}\n${text}\n`)
}

await turn({ label: "one step, the tool answers", steps: 1 })
await turn({ label: "two steps, the tool answers", steps: 3 })
await turn({ label: "the tool fails", fail: true, steps: 1 })
await turn({ label: "the input does not fit the schema", input: '{"expr":1}', steps: 1 })
await turn({ label: "the model names no such tool", toolName: "nope", steps: 1 })
await turn({ label: "gated: approved", gate: "all", decision: true, steps: 1 })
await turn({ label: "gated: denied", gate: "all", decision: false, steps: 1 })
await turn({ label: "risky mode spares the calculator", gate: "risky", steps: 1 })
