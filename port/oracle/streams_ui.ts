/**
 * The AI SDK UI message stream half of the streams oracle: the chunk catalog, the
 * whole-turn streams and the legacy `sources` frame. See streams.ts for the overview.
 * Exports `SOURCE_ROWS` because the OpenAI half streams the same retrieval sources.
 */

import { JsonToSseTransformStream, UI_MESSAGE_STREAM_HEADERS } from "ai"
import type { RagSource } from "../../src/features/agent-api/response"

export type Case = { kind: string; input: unknown; expected: unknown }

function add(cases: Case[], kind: string, input: unknown, expected: unknown): void {
  cases.push({ kind, input, expected })
}

/** The retrieval sources the way `agent-api/service.ts` builds them: every optional key
 *  present, `null` when there is no value. */
export const SOURCE_ROWS: RagSource[] = [
  {
    title: "IPA Kelas VIII",
    section: "Bab 1",
    documentId: "30d591e6-7d21-4e9b-92c7-52a14965740a",
    assetKey: null,
    page: 39,
    chunkType: "text",
    chunkIndex: 3,
    anchorChunkIndex: null,
  },
  {
    title: "IPA Kelas VIII",
    section: "Gambar 1.11 Bagian-Bagian Mulut",
    documentId: "30d591e6-7d21-4e9b-92c7-52a14965740a",
    assetKey: "documents/org1/30d591e6/fig-p40.png",
    page: 40,
    chunkType: "figure",
    chunkIndex: null,
    anchorChunkIndex: 4,
  },
  {
    title: "Tanpa apa pun opsional",
    section: null,
    documentId: null,
    assetKey: null,
    page: null,
    chunkType: null,
    chunkIndex: null,
    anchorChunkIndex: null,
  },
]

/** The full SSE text the installed SDK writes for these chunk objects. */
async function uiStreamText(chunks: object[]): Promise<string> {
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })
  return new Response(stream.pipeThrough(new JsonToSseTransformStream())).text()
}

async function uiCase(
  cases: Case[],
  input: { [key: string]: unknown },
  chunks: object[],
): Promise<void> {
  // The chunks ride in the input so the Rust test can rebuild the stream from it.
  add(cases, "ui-stream", { ...input, chunks }, await uiStreamText(chunks))
}

const PROVIDER_METADATA = { openai: { itemId: "item_1", seed: 7 } }

const catalog: Array<{ input: { [key: string]: unknown }; chunks: object[] }> = [
  { input: { type: "start" }, chunks: [{ type: "start" }] },
  {
    input: { type: "start", messageId: "msg_1", messageMetadata: { stepCount: 2 } },
    chunks: [{ type: "start", messageMetadata: { stepCount: 2 }, messageId: "msg_1" }],
  },
  { input: { type: "start-step" }, chunks: [{ type: "start-step" }] },
  { input: { type: "finish-step" }, chunks: [{ type: "finish-step" }] },
  { input: { type: "text-start", id: "text-1" }, chunks: [{ type: "text-start", id: "text-1" }] },
  {
    input: { type: "text-start", id: "text-1", providerMetadata: PROVIDER_METADATA },
    chunks: [{ type: "text-start", id: "text-1", providerMetadata: PROVIDER_METADATA }],
  },
  {
    input: { type: "text-delta", id: "text-1", delta: "Halo, dunia!" },
    chunks: [{ type: "text-delta", id: "text-1", delta: "Halo, dunia!" }],
  },
  {
    input: { type: "text-delta", id: "text-1", delta: "" },
    chunks: [{ type: "text-delta", id: "text-1", delta: "" }],
  },
  {
    input: {
      type: "text-delta",
      id: "text-1",
      delta: "Selamat 🎉\n\"baris baru\"\ttab\\backslash\u0000end 🇮🇩 中文 عربى",
    },
    chunks: [
      {
        type: "text-delta",
        id: "text-1",
        delta: "Selamat 🎉\n\"baris baru\"\ttab\\backslash\u0000end 🇮🇩 中文 عربى",
      },
    ],
  },
  { input: { type: "text-end", id: "text-1" }, chunks: [{ type: "text-end", id: "text-1" }] },
  {
    input: { type: "reasoning-start", id: "reason-1" },
    chunks: [{ type: "reasoning-start", id: "reason-1" }],
  },
  {
    input: { type: "reasoning-delta", id: "reason-1", delta: "Sebab-akibat… 🧠\n" },
    chunks: [{ type: "reasoning-delta", id: "reason-1", delta: "Sebab-akibat… 🧠\n" }],
  },
  {
    input: { type: "reasoning-end", id: "reason-1" },
    chunks: [{ type: "reasoning-end", id: "reason-1" }],
  },
  {
    input: {
      type: "tool-input-start",
      toolCallId: "call_search_1",
      toolName: "knowledge_search",
    },
    chunks: [
      { type: "tool-input-start", toolCallId: "call_search_1", toolName: "knowledge_search" },
    ],
  },
  {
    input: {
      type: "tool-input-start",
      toolCallId: "call_search_1",
      toolName: "knowledge_search",
      providerExecuted: false,
      providerMetadata: PROVIDER_METADATA,
      dynamic: true,
      title: "Cari di buku",
    },
    chunks: [
      {
        type: "tool-input-start",
        toolCallId: "call_search_1",
        toolName: "knowledge_search",
        providerExecuted: false,
        providerMetadata: PROVIDER_METADATA,
        dynamic: true,
        title: "Cari di buku",
      },
    ],
  },
  {
    input: { type: "tool-input-delta", toolCallId: "call_search_1", inputTextDelta: '{"city":' },
    chunks: [{ type: "tool-input-delta", toolCallId: "call_search_1", inputTextDelta: '{"city":' }],
  },
  {
    input: { type: "tool-input-delta", toolCallId: "call_search_1", inputTextDelta: "" },
    chunks: [{ type: "tool-input-delta", toolCallId: "call_search_1", inputTextDelta: "" }],
  },
  {
    input: {
      type: "tool-input-available",
      toolCallId: "call_search_1",
      toolName: "knowledge_search",
      input: { city: "Jakarta", units: "metric", days: 7, ratio: 0.5, note: "a\"b" },
    },
    chunks: [
      {
        type: "tool-input-available",
        toolCallId: "call_search_1",
        toolName: "knowledge_search",
        input: { city: "Jakarta", units: "metric", days: 7, ratio: 0.5, note: "a\"b" },
      },
    ],
  },
  {
    input: {
      type: "tool-input-available",
      toolCallId: "call_search_2",
      toolName: "artifact_create",
      input: {
        title: "Laporan",
        chapters: [
          { title: "Pendahuluan", page: 1 },
          { title: "Isi", page: 2 },
        ],
      },
      providerExecuted: false,
      title: "Buat artikel",
    },
    chunks: [
      {
        type: "tool-input-available",
        toolCallId: "call_search_2",
        toolName: "artifact_create",
        input: {
          title: "Laporan",
          chapters: [
            { title: "Pendahuluan", page: 1 },
            { title: "Isi", page: 2 },
          ],
        },
        providerExecuted: false,
        title: "Buat artikel",
      },
    ],
  },
  {
    input: {
      type: "tool-input-available",
      toolCallId: "call_edge",
      toolName: "edge_inputs",
      input: { empty: "", none: null, list: [], deep: { a: { b: { c: [1, 2, 3] } } } },
    },
    chunks: [
      {
        type: "tool-input-available",
        toolCallId: "call_edge",
        toolName: "edge_inputs",
        input: { empty: "", none: null, list: [], deep: { a: { b: { c: [1, 2, 3] } } } },
      },
    ],
  },
  {
    input: {
      type: "tool-input-error",
      toolCallId: "call_bad",
      toolName: "knowledge_search",
      input: "{oops",
      errorText: "Invalid tool input: unterminated string",
    },
    chunks: [
      {
        type: "tool-input-error",
        toolCallId: "call_bad",
        toolName: "knowledge_search",
        input: "{oops",
        errorText: "Invalid tool input: unterminated string",
      },
    ],
  },
  {
    input: {
      type: "tool-approval-request",
      approvalId: "appr_1",
      toolCallId: "call_search_1",
    },
    chunks: [{ type: "tool-approval-request", approvalId: "appr_1", toolCallId: "call_search_1" }],
  },
  {
    input: {
      type: "tool-output-available",
      toolCallId: "call_search_1",
      output: { sources: SOURCE_ROWS.slice(0, 2), answer: "42" },
      preliminary: true,
    },
    chunks: [
      {
        type: "tool-output-available",
        toolCallId: "call_search_1",
        output: { sources: SOURCE_ROWS.slice(0, 2), answer: "42" },
        preliminary: true,
      },
    ],
  },
  {
    input: { type: "tool-output-available", toolCallId: "call_2", output: "teks biasa" },
    chunks: [{ type: "tool-output-available", toolCallId: "call_2", output: "teks biasa" }],
  },
  {
    input: {
      type: "tool-output-error",
      toolCallId: "call_search_1",
      errorText: "Knowledge base unreachable",
      providerExecuted: false,
      dynamic: true,
    },
    chunks: [
      {
        type: "tool-output-error",
        toolCallId: "call_search_1",
        errorText: "Knowledge base unreachable",
        providerExecuted: false,
        dynamic: true,
      },
    ],
  },
  {
    input: { type: "tool-output-denied", toolCallId: "call_search_1" },
    chunks: [{ type: "tool-output-denied", toolCallId: "call_search_1" }],
  },
  {
    input: {
      type: "source-url",
      sourceId: "https://example.com/sumber",
      url: "https://example.com/sumber",
      title: "Sumber daring",
    },
    chunks: [
      {
        type: "source-url",
        sourceId: "https://example.com/sumber",
        url: "https://example.com/sumber",
        title: "Sumber daring",
      },
    ],
  },
  {
    input: {
      type: "source-url",
      sourceId: "https://example.com/tanpa-judul",
      url: "https://example.com/tanpa-judul",
    },
    chunks: [
      {
        type: "source-url",
        sourceId: "https://example.com/tanpa-judul",
        url: "https://example.com/tanpa-judul",
      },
    ],
  },
  {
    input: {
      type: "source-document",
      sourceId: "30d591e6",
      mediaType: "text/plain",
      title: "IPA Kelas VIII",
      filename: "Bab 1",
      providerMetadata: { rantai: { page: 39 } },
    },
    chunks: [
      {
        type: "source-document",
        sourceId: "30d591e6",
        mediaType: "text/plain",
        title: "IPA Kelas VIII",
        filename: "Bab 1",
        providerMetadata: { rantai: { page: 39 } },
      },
    ],
  },
  {
    input: {
      type: "source-document",
      sourceId: "30d591e6",
      mediaType: "text/plain",
      title: "Tanpa nama file",
    },
    chunks: [
      {
        type: "source-document",
        sourceId: "30d591e6",
        mediaType: "text/plain",
        title: "Tanpa nama file",
      },
    ],
  },
  {
    input: { type: "file", mediaType: "image/webp", url: "data:image/webp;base64,AAEC" },
    chunks: [{ type: "file", mediaType: "image/webp", url: "data:image/webp;base64,AAEC" }],
  },
  {
    input: {
      type: "finish",
      finishReason: "stop",
      messageMetadata: { totalUsage: { inputTokens: 11, outputTokens: 7, totalTokens: 18 } },
    },
    chunks: [
      {
        type: "finish",
        finishReason: "stop",
        messageMetadata: { totalUsage: { inputTokens: 11, outputTokens: 7, totalTokens: 18 } },
      },
    ],
  },
  {
    input: { type: "finish", finishReason: "tool-calls" },
    chunks: [{ type: "finish", finishReason: "tool-calls" }],
  },
  { input: { type: "finish" }, chunks: [{ type: "finish" }] },
  {
    input: { type: "abort", reason: "Request aborted" },
    chunks: [{ type: "abort", reason: "Request aborted" }],
  },
  { input: { type: "abort" }, chunks: [{ type: "abort" }] },
  {
    input: { type: "message-metadata", messageMetadata: { stepCount: 3 } },
    chunks: [{ type: "message-metadata", messageMetadata: { stepCount: 3 } }],
  },
  {
    input: { type: "data-trace", data: { traceId: "rag-trace-1" } },
    chunks: [{ type: "data-trace", data: { traceId: "rag-trace-1" } }],
  },
  {
    input: { type: "data-progress", id: "progress_1", data: { percent: 50, note: null }, transient: true },
    chunks: [
      { type: "data-progress", id: "progress_1", data: { percent: 50, note: null }, transient: true },
    ],
  },
]

const PLAIN_TURN = [
  { type: "start", messageId: "msg_1" },
  { type: "start-step" },
  { type: "text-start", id: "text-1" },
  { type: "text-delta", id: "text-1", delta: "Kelenjar ludah menghasilkan air liur.\n" },
  { type: "text-delta", id: "text-1", delta: "" },
  { type: "text-delta", id: "text-1", delta: "Emoji 🎉 dan \"kutip\"." },
  { type: "text-end", id: "text-1" },
  { type: "finish-step" },
  {
    type: "finish",
    finishReason: "stop",
    messageMetadata: { totalUsage: { inputTokens: 11, outputTokens: 7, totalTokens: 18 } },
  },
]

const TOOL_TURN = [
  { type: "start", messageId: "msg_2" },
  { type: "start-step" },
  { type: "tool-input-start", toolCallId: "call_search_1", toolName: "knowledge_search" },
  { type: "tool-input-delta", toolCallId: "call_search_1", inputTextDelta: '{"query":"ra' },
  { type: "tool-input-delta", toolCallId: "call_search_1", inputTextDelta: 'ngkuman"}' },
  {
    type: "tool-input-available",
    toolCallId: "call_search_1",
    toolName: "knowledge_search",
    input: { query: "rangkuman" },
  },
  { type: "tool-approval-request", approvalId: "appr_1", toolCallId: "call_search_1" },
  {
    type: "tool-output-available",
    toolCallId: "call_search_1",
    output: { answer: "Ada" },
  },
  { type: "finish-step" },
  { type: "finish", finishReason: "tool-calls" },
]

const RAG_TURN = [
  { type: "start", messageMetadata: { traceId: "rag-trace-1" }, messageId: "msg_3" },
  { type: "start-step" },
  { type: "reasoning-start", id: "reason-1" },
  { type: "reasoning-delta", id: "reason-1", delta: "Mencari di buku…" },
  { type: "reasoning-end", id: "reason-1" },
  { type: "text-start", id: "text-1" },
  { type: "text-delta", id: "text-1", delta: "Kelenjar parotis [1] adalah yang terbesar." },
  { type: "text-end", id: "text-1" },
  {
    type: "source-document",
    sourceId: "30d591e6",
    mediaType: "text/plain",
    title: "IPA Kelas VIII",
    filename: "Bab 1",
  },
  { type: "finish-step" },
  { type: "finish", finishReason: "stop" },
]

const ERROR_TURN = [
  { type: "start", messageId: "msg_4" },
  { type: "start-step" },
  {
    type: "error",
    errorText: "The model didn't return a response. Please try again or switch models.",
  },
]

const ABORT_TURN = [
  { type: "start", messageId: "msg_5" },
  { type: "start-step" },
  { type: "abort", reason: "Request aborted" },
]

/** The frame the old UI stream appends AFTER `[DONE]`; the Rust service replaces it with
 *  `source-document` chunks before `finish` (differences.md row 12). Replicated from the
 *  line inside `appendSourcesEventToUiStreamResponse`, `service.ts` line 249. */
function legacySourcesFrame(sources: RagSource[]): string {
  return `data: ${JSON.stringify({ type: "sources", sources })}\n\n`
}

export async function uiCases(): Promise<Case[]> {
  const cases: Case[] = []
  for (const entry of catalog) await uiCase(cases, entry.input, entry.chunks)
  await uiCase(cases, { turn: "plain" }, PLAIN_TURN)
  await uiCase(cases, { turn: "tool" }, TOOL_TURN)
  await uiCase(cases, { turn: "rag" }, RAG_TURN)
  await uiCase(cases, { turn: "error" }, ERROR_TURN)
  await uiCase(cases, { turn: "abort" }, ABORT_TURN)
  add(cases, "ui-terminator", null, await uiStreamText([]))
  add(cases, "ui-headers", null, UI_MESSAGE_STREAM_HEADERS)
  add(cases, "legacy-sources-frame", { sources: SOURCE_ROWS }, legacySourcesFrame(SOURCE_ROWS))
  return cases
}
