/**
 * Live check of practice generation v2 against a real OpenAI-compatible
 * gateway, on passages retrieved beforehand (JSON files from the deployment).
 *
 *   PRACTICE_BASE_URL=... PRACTICE_API_KEY=... bun scripts/practice-live/run.ts <type> <count> <grade> <topic.json>...
 *
 * Each topic file: { topic, rows: [{ title, section, text }] }. Prints the set
 * and the report as JSON. Not part of the test suite: it needs the model.
 */
import { readFileSync } from "fs"
import { buildPracticeSet, type TopicMaterial } from "../../src/features/agent-api/practice/engine"
import { aiCheck } from "../../src/features/agent-api/practice/checker"
import {
  adapterMaxTokens, adapterSchema, adapterSystem, adapterUserMessage, parseAdapterReply,
} from "../../src/features/agent-api/practice/generate-contract"
import { passagesForPractice } from "../../src/features/agent-api/practice/passages"
import type { PracticeType } from "../../src/features/agent-api/practice/types"

const [type, count, grade, ...files] = process.argv.slice(2)
const BASE = process.env.PRACTICE_BASE_URL!.replace(/\/+$/, "")
const KEY = process.env.PRACTICE_API_KEY!
const PRACTICE = process.env.PRACTICE_MODEL || "practice"
const CHECKER = process.env.CHECKER_MODEL || "base"

async function chat(model: string, messages: unknown[], maxTokens: number, temperature: number, schema: unknown, timeoutMs: number) {
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature, response_format: { type: "json_schema", json_schema: { name: "x", schema } } }),
    })
    if (!res.ok) return null
    const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    return body.choices?.[0]?.message?.content ?? null
  } catch {
    return null
  }
}

async function main() {
  const topics: TopicMaterial[] = files.map((f) => {
    const d = JSON.parse(readFileSync(f, "utf-8")) as { topic: string; rows: Array<{ title: string | null; section: string | null; text: string }> }
    return { topic: d.topic, passages: passagesForPractice(d.rows.map((r) => ({ title: r.title ?? "Buku", section: r.section, text: r.text }))) }
  })
  const system = adapterSystem(grade)
  const t0 = Date.now()
  const result = await buildPracticeSet(
    { topics, count: Number(count), type: type as PracticeType, verify: process.env.VERIFY !== "false" },
    {
      generate: async (tipe, n, passage) => {
        const r = await chat(PRACTICE, [{ role: "system", content: system }, { role: "user", content: adapterUserMessage(tipe, n, passage) }], adapterMaxTokens(n), 0.1, adapterSchema(tipe, n), 120_000)
        return r === null ? null : parseAdapterReply(r, tipe)
      },
      check: (s, passage) => aiCheck((m, o) => chat(CHECKER, m, o.maxTokens, o.temperature, o.schema, o.timeoutMs), s, passage),
    },
  )
  console.log(JSON.stringify({
    seconds: Math.round((Date.now() - t0) / 100) / 10,
    passages: topics.map((t) => ({ topic: t.topic, n: t.passages.length, chars: t.passages.map((p) => p.text.length) })),
    adapterCalls: result.adapterCalls, checksRun: result.checksRun, rejected: result.rejected, rejectedExamples: result.rejectedExamples,
    questions: result.questions.map((q) => ({ tipe: q.tipe, topic: q.topic, skenario: q.skenario, pertanyaan: q.pertanyaan, opsi: q.opsi, kunci: q.kunci, passage: q.passage.text.slice(0, 300) })),
  }, null, 1))
}

void main()
