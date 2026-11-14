/**
 * The tool frames of the AI SDK, from the SDK itself.
 *
 * The Rust chat writes the tool chunks of a turn by hand (`agents_contracts::ui_stream`), so
 * the bytes have to be the ones the installed `ai` package writes. This script drives the real
 * `streamText(...).toUIMessageStream()` with a mock model from `ai/test` and prints the SSE
 * frames, so the Rust test can assert the same bytes.
 *
 *   bun scripts/oracle-tool-frames.ts
 *
 * It must run from the repository root: outside it, Bun resolves another `ai` from its cache.
 */

import { stepCountIs, streamText, tool, type LanguageModelV3StreamPart } from "ai"
import { MockLanguageModelV3 } from "ai/test"
import { z } from "zod"

const TOOL_NAME = "calculator"

const INPUT = { expression: "2 + 3 * 4" }
const INPUT_JSON = '{"expression":"2 + 3 * 4"}'

/** The model: one tool call first, then the answer. */
function mockModel(fail: boolean): MockLanguageModelV3 {
  let called = 0
  return new MockLanguageModelV3({
    modelId: "mock",
    doStream: async () => {
      called += 1
      const parts: LanguageModelV3StreamPart[] =
        called === 1
          ? [
              { type: "stream-start", warnings: [] },
              { type: "tool-input-start", id: "call_1", toolName: TOOL_NAME },
              { type: "tool-input-delta", id: "call_1", delta: '{"expression":' },
              { type: "tool-input-delta", id: "call_1", delta: '"2 + 3 * 4"}' },
              { type: "tool-call", toolCallId: "call_1", toolName: TOOL_NAME, input: INPUT_JSON },
              {
                type: "finish",
                finishReason: "tool-calls",
                usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
              },
            ]
          : [
              { type: "stream-start", warnings: [] },
              { type: "text-start", id: "txt-0" },
              { type: "text-delta", id: "txt-0", delta: "The answer is 14." },
              { type: "text-end", id: "txt-0" },
              {
                type: "finish",
                finishReason: "stop",
                usage: { inputTokens: 12, outputTokens: 6, totalTokens: 18 },
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

/** The turn: the tool runs, then the model answers. */
async function turn(label: string, fail: boolean, steps: number): Promise<void> {
  const result = streamText({
    model: mockModel(fail),
    prompt: "what is 2 + 3 * 4?",
    tools: {
      [TOOL_NAME]: tool({
        description: "Evaluate a mathematical expression.",
        inputSchema: z.object({ expression: z.string() }),
        execute: async ({ expression }) => {
          if (fail) throw new Error("the calculator is broken")
          return { success: true, expression, result: 14 }
        },
      }),
    },
    stopWhen: stepCountIs(steps),
  })
  const text = await result.toUIMessageStreamResponse().text()
  process.stdout.write(`=== ${label} ===\n${text}\n`)
}

await turn("one step, the tool answers", false, 1)
await turn("two steps, the tool answers", false, 3)
await turn("the tool fails", true, 1)
