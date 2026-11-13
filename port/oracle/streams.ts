#!/usr/bin/env bun
/**
 * Oracle for the wire-format port (TypeScript -> Rust): the AI SDK v6 UI message stream
 * and the OpenAI-compatible /v1/chat/completions frames.
 *
 *   bun port/oracle/streams.ts > port/cases/streams.jsonl   (the script writes it directly)
 *
 * Every `expected` is produced by the REAL installed code, none of them by hand:
 * - UI message stream frames come from the installed `ai` package's
 *   `JsonToSseTransformStream` (the same transform `createUIMessageStreamResponse` uses),
 *   plus its `UI_MESSAGE_STREAM_HEADERS` (streams_ui.ts).
 * - OpenAI frames come from the OLD `src/features/agent-api/response.ts`, imported
 *   directly (it has type-only imports only, so a plain Bun script can load it), driven
 *   by the same fake `streamText` result its own test uses (streams_openai.ts).
 *
 * The only line not executed from the old source is the legacy `sources` frame: it is
 * built inside the unexported `appendSourcesEventToUiStreamResponse`
 * (`src/features/chat-public/service.ts` line 249), whose module imports Prisma and the
 * LLM provider and cannot load in a script. The frame is one `JSON.stringify` line and
 * the replication in streams_ui.ts cites it.
 *
 * `Date.now` is frozen so every `created` (unix seconds) is deterministic; the Rust
 * parity test passes the same number. Run with any time zone: no output depends on it.
 */

import { uiCases, type Case } from "./streams_ui"
import { openaiCases } from "./streams_openai"

const FIXED_MS = 1_765_418_400_000
Date.now = () => FIXED_MS

const cases: Case[] = await Promise.all([uiCases(), openaiCases()]).then(([ui, openai]) => [
  ...ui,
  ...openai,
])

await Bun.write(
  Bun.file("port/cases/streams.jsonl"),
  cases.map((c) => JSON.stringify(c)).join("\n") + "\n",
)
console.log(`port/cases/streams.jsonl: ${cases.length} cases`)
