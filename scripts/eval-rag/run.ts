/**
 * RAG eval runner.
 *
 * Usage:
 *   bun scripts/eval-rag/run.ts [path-to-golden.json]
 *   bun scripts/eval-rag/run.ts                       # defaults to tests/fixtures/rag-golden.json
 *
 * For each entry in the golden set, fires the retrieval pipeline (NOT full
 * chat — we don't burn LLM tokens per eval run) and records:
 *   - which documents surfaced
 *   - chunk count + cosine score stats
 *   - retrieval wallclock
 *
 * Writes the raw result + an aggregate summary to eval-runs/<timestamp>.json
 * and prints a one-line summary per query to stdout.
 *
 * Run twice — once before a change, once after — and diff the summaries.
 * (A proper compare.ts tool can be added later; for now just compare the
 * JSON files by hand or with `diff`.)
 */

import * as dotenv from "dotenv"
dotenv.config()

import * as fs from "fs"
import * as path from "path"
import { smartHybridRetrieve, smartRetrieve } from "../../src/lib/rag"
import { summarize } from "./lib/metrics"
import type { GoldenEntry, GoldenSet, QueryResult, RunReport } from "./lib/types"

const DEFAULT_GOLDEN_PATH = path.join(process.cwd(), "tests", "fixtures", "rag-golden.json")
const RUNS_DIR = path.join(process.cwd(), "eval-runs")

async function runOne(
  entry: GoldenEntry,
  defaultGroups: string[] | undefined,
  withLlmJudge: boolean,
): Promise<QueryResult> {
  const start = Date.now()
  const groupIds = entry.knowledgeBaseGroupIds ?? defaultGroups
  try {
    // Try hybrid first (matches the chat-public + widget surfaces); fall back
    // to vector-only if hybrid returns empty context (rare but possible).
    const hybrid = await smartHybridRetrieve(entry.query, {
      enableEntitySearch: true,
      groupIds,
    })

    let retrievedDocs: string[] = []
    let scoreMin: number | null = null
    let scoreMax: number | null = null
    let scoreMean: number | null = null
    let chunkCount = 0
    // For LLM-as-judge: keep full chunks (title + content), not just titles.
    let contextChunks: Array<{ documentTitle: string; content: string }> = []

    if (hybrid.context) {
      const seen = new Set<string>()
      const uniqueDocs: string[] = []
      for (const r of hybrid.results) {
        const title = r.documentTitle ?? "(no title)"
        if (!seen.has(title)) {
          seen.add(title)
          uniqueDocs.push(title)
        }
      }
      retrievedDocs = uniqueDocs
      chunkCount = hybrid.results.length
      const scores = hybrid.results.map((r) => r.vectorScore).filter((s) => s > 0)
      if (scores.length) {
        scoreMin = Math.min(...scores)
        scoreMax = Math.max(...scores)
        scoreMean = scores.reduce((a, b) => a + b, 0) / scores.length
      }
      contextChunks = hybrid.results.map((r) => ({
        documentTitle: r.documentTitle ?? "(no title)",
        content: r.content,
      }))
    } else {
      const fallback = await smartRetrieve(entry.query, {
        minSimilarity: 0.3,
        groupIds,
      })
      retrievedDocs = fallback.sources.map((s) => s.documentTitle)
      chunkCount = fallback.chunks.length
      const scores = fallback.chunks.map((c) => c.similarity)
      if (scores.length) {
        scoreMin = Math.min(...scores)
        scoreMax = Math.max(...scores)
        scoreMean = scores.reduce((a, b) => a + b, 0) / scores.length
      }
      contextChunks = fallback.chunks.map((c) => ({
        documentTitle: c.documentTitle,
        content: c.content,
      }))
    }

    const baseResult: QueryResult = {
      id: entry.id,
      query: entry.query,
      kind: entry.kind,
      retrievedDocs,
      chunkCount,
      scoreMin,
      scoreMax,
      scoreMean,
      retrieveMs: Date.now() - start,
      errored: false,
    }

    if (!withLlmJudge || contextChunks.length === 0) return baseResult

    // Generate an answer from the retrieved chunks, then ask the judge model
    // whether each claim is grounded. This is the expensive path — keep it
    // behind the --with-llm-judge flag.
    const genStart = Date.now()
    let answerText = ""
    let faithfulness: number | undefined
    let faithfulnessReason: string | undefined
    try {
      const { generateEvalAnswer, judgeFaithfulness } = await import("./lib/llm-judge")
      answerText = await generateEvalAnswer(entry.query, contextChunks)
      const judged = await judgeFaithfulness(entry.query, answerText, contextChunks)
      faithfulness = judged.score
      faithfulnessReason = judged.reason
    } catch (err) {
      console.warn(`  [judge] ${entry.id}: ${(err as Error).message?.slice(0, 120)}`)
    }
    return {
      ...baseResult,
      answerText,
      generateMs: Date.now() - genStart,
      faithfulness,
      faithfulnessReason,
    }
  } catch (err) {
    return {
      id: entry.id,
      query: entry.query,
      kind: entry.kind,
      retrievedDocs: [],
      chunkCount: 0,
      scoreMin: null,
      scoreMax: null,
      scoreMean: null,
      retrieveMs: Date.now() - start,
      errored: true,
      errorMessage: (err as Error).message?.slice(0, 200) ?? "unknown error",
    }
  }
}

async function main() {
  // Parse positional args (golden path) and flags (--with-llm-judge).
  const args = process.argv.slice(2)
  const withLlmJudge = args.includes("--with-llm-judge")
  const goldenPath = args.find((a) => !a.startsWith("--")) ?? DEFAULT_GOLDEN_PATH
  if (!fs.existsSync(goldenPath)) {
    console.error(
      `[eval-rag] golden set not found at ${goldenPath}\n` +
      "  1. run: bun scripts/eval-rag/generate-candidates.ts\n" +
      "  2. curate tests/fixtures/rag-golden-seed.json -> tests/fixtures/rag-golden.json"
    )
    process.exit(1)
  }

  const set: GoldenSet = JSON.parse(fs.readFileSync(goldenPath, "utf-8"))
  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}_${Math.random().toString(36).slice(2, 6)}`
  console.log(
    `[eval-rag] run ${runId} — ${set.entries.length} queries from ${set.name}@${set.version}` +
    (withLlmJudge ? " [LLM judge ON]" : "")
  )

  const results: QueryResult[] = []
  for (const entry of set.entries) {
    const result = await runOne(entry, set.defaultGroupIds, withLlmJudge)
    results.push(result)
    const recallLabel = entry.expectedDocs.length
      ? ` recall: ${entry.expectedDocs.filter((e) => result.retrievedDocs.some((r) => r.toLowerCase().includes(e.toLowerCase()))).length}/${entry.expectedDocs.length}`
      : ""
    const scoreLabel = result.scoreMax !== null ? ` scoreMax: ${result.scoreMax.toFixed(3)}` : ""
    const faithLabel = result.faithfulness !== undefined ? ` faith: ${result.faithfulness.toFixed(2)}` : ""
    console.log(
      `  ${entry.kind.padEnd(9)} ${result.errored ? "✗" : "✓"} ${result.retrieveMs}ms  ${entry.id}${recallLabel}${scoreLabel}${faithLabel}`
    )
    if (result.errored) console.log(`    error: ${result.errorMessage}`)
  }

  const report: RunReport = {
    runId,
    startedAt: results.length ? new Date(Date.now() - results.reduce((s, r) => s + r.retrieveMs, 0)).toISOString() : new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    goldenSet: { name: set.name, version: set.version },
    results,
    summary: summarize(set.entries, results),
  }

  fs.mkdirSync(RUNS_DIR, { recursive: true })
  const outPath = path.join(RUNS_DIR, `${runId}.json`)
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2))

  console.log("\n[eval-rag] summary:")
  console.log(`  context recall:       ${(report.summary.contextRecall * 100).toFixed(1)}% (${report.summary.expectedDocsHitCount}/${report.summary.expectedDocsTotal} expected docs hit)`)
  console.log(`  retrieval p50/p95:    ${report.summary.latencyP50Ms}ms / ${report.summary.latencyP95Ms}ms`)
  console.log(`  errored queries:      ${report.summary.erroredCount}/${report.summary.queryCount}`)
  if (report.summary.faithfulnessAvg !== undefined) {
    console.log(`  faithfulness (avg):   ${(report.summary.faithfulnessAvg * 100).toFixed(1)}% over ${report.summary.faithfulnessCount} judged queries`)
  }
  console.log(`  report written to:    ${outPath}`)
  process.exit(0)
}

main().catch((err) => {
  console.error("[eval-rag] run failed:", err)
  process.exit(1)
})
