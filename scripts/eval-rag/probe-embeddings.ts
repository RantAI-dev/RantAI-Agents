/**
 * Probe & benchmark OpenRouter embedding models against the PSAK corpus.
 *
 * Usage:
 *   bun scripts/eval-rag/probe-embeddings.ts
 *
 * What it does, per candidate model:
 *   1. Probe availability (POST to /embeddings with a dummy input). Skip if 404 / model_not_found.
 *   2. Capture: dimension, ms per embedding, estimated cost.
 *   3. Embed 8 PSAK queries + their expected doc titles.
 *   4. Compute mean cosine similarity (query, expected-doc-title) for each model.
 *   5. Print a comparison table sorted by similarity desc.
 *
 * The similarity number isn't a full retrieval benchmark — it just sanity-
 * checks whether the model places PSAK queries near PSAK titles in vector
 * space. A real eval needs ingesting the full corpus + running the golden
 * set, which is expensive (re-embed 98 docs per model). This probe filters
 * the candidate list down to ~2-3 worth full-ingest testing.
 *
 * Skips models you don't have access to silently (so the script works even
 * if your OpenRouter account doesn't include every catalog model).
 *
 * Cost: ~5-15 candidate models × 9 embeddings = ~50-150 API calls total.
 * Should be well under $0.05 at the cheapest models, ~$0.20 if you include
 * text-embedding-3-large.
 */

import * as dotenv from "dotenv"
dotenv.config()

const OPENROUTER_URL = "https://openrouter.ai/api/v1/embeddings"

// Candidate models to probe. Add new ones here as OpenRouter exposes them.
// IDs follow OpenRouter naming (provider/model). The script silently skips
// any that 404 or return model_not_found, so it's safe to over-include.
const CANDIDATES: Array<{ id: string; targetDim?: number; family: string }> = [
  // Qwen3 family — multilingual-trained, native Indonesian support
  { id: "qwen/qwen3-embedding-8b", family: "qwen3" },
  { id: "qwen/qwen3-embedding-4b", family: "qwen3" },
  { id: "qwen/qwen3-embedding-0.6b", family: "qwen3" },

  // OpenAI text-embedding-3 family — `dimensions` parameter supported
  { id: "openai/text-embedding-3-large", targetDim: 1024, family: "openai-3" },
  { id: "openai/text-embedding-3-small", targetDim: 1024, family: "openai-3" },
  { id: "openai/text-embedding-3-large", family: "openai-3" }, // default dim too
  { id: "openai/text-embedding-3-small", family: "openai-3" },

  // Older OpenAI
  { id: "openai/text-embedding-ada-002", family: "openai-ada" },

  // Cohere — multilingual-strong, may or may not be on OpenRouter
  { id: "cohere/embed-multilingual-v3.0", family: "cohere" },
  { id: "cohere/embed-multilingual-light-v3.0", family: "cohere" },

  // Voyage — strong multilingual, may not be on OpenRouter
  { id: "voyage/voyage-multilingual-2", family: "voyage" },
  { id: "voyage/voyage-3", family: "voyage" },

  // BAAI BGE family — Apache-2.0, multilingual-strong (most likely self-host only)
  { id: "baai/bge-m3", family: "bge" },

  // Mistral / Mixtral embed (if they exist on OpenRouter)
  { id: "mistralai/mistral-embed", family: "mistral" },
]

// PSAK queries with their expected-most-relevant document title.
// Picked to span 3 PSAK series + ISAK + Indonesian/English phrasing.
const TEST_PAIRS: Array<{ query: string; expectedTitle: string }> = [
  { query: "What is PSAK 113 about fair value measurement?", expectedTitle: "PSAK 113 Pengukuran Nilai Wajar" },
  { query: "Jelaskan akuntansi sewa menurut PSAK 116", expectedTitle: "PSAK 116 Sewa" },
  { query: "Bagaimana pengakuan kontrak asuransi menurut PSAK 117", expectedTitle: "PSAK 117 Kontrak Asuransi" },
  { query: "What is PSAK 201 Penyajian Laporan Keuangan?", expectedTitle: "PSAK 201 Penyajian Laporan Keuangan" },
  { query: "PSAK 216 model biaya dan revaluasi aset tetap", expectedTitle: "PSAK 216 Aset Tetap" },
  { query: "ISAK 119 pengharian liabilitas keuangan dengan instrumen ekuitas", expectedTitle: "ISAK 119 Pengharian Liabilitas Keuangan Dengan Instrumen Ekuitas" },
  { query: "PSAK 338 kombinasi bisnis entitas sepengendali", expectedTitle: "PSAK 338 Kombinasi Bisnis Entitas Sepengendali" },
  { query: "kerangka konseptual pelaporan keuangan SAK", expectedTitle: "Kerangka Konsept Pelaporan Keuangan" },
]

interface EmbedResult {
  embedding: number[]
  /** Total tokens billed for the request (when provider returns it). */
  totalTokens?: number
  ms: number
}

async function embedOne(
  apiKey: string,
  modelId: string,
  text: string,
  dimensions?: number
): Promise<EmbedResult | { error: string; status?: number }> {
  const start = Date.now()
  try {
    const body: Record<string, unknown> = { model: modelId, input: text }
    if (dimensions) body.dimensions = dimensions
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) {
      const text = (await res.text()).slice(0, 200)
      return { error: text, status: res.status }
    }
    const data = (await res.json()) as {
      data?: Array<{ embedding?: number[] }>
      usage?: { total_tokens?: number }
    }
    const embedding = data.data?.[0]?.embedding
    if (!embedding || !Array.isArray(embedding) || !embedding.length) {
      return { error: "no embedding in response" }
    }
    return { embedding, totalTokens: data.usage?.total_tokens, ms: Date.now() - start }
  } catch (err) {
    return { error: (err as Error).message?.slice(0, 200) ?? "unknown", status: -1 }
  }
}

function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom > 0 ? dot / denom : 0
}

interface ModelReport {
  id: string
  targetDim?: number
  family: string
  status: "ok" | "skipped" | "error"
  errorSample?: string
  actualDim?: number
  meanQueryMs?: number
  meanCosine?: number
  perPairCosine?: number[]
  totalTokens?: number
}

async function probeModel(
  apiKey: string,
  cand: { id: string; targetDim?: number; family: string }
): Promise<ModelReport> {
  const label = cand.targetDim ? `${cand.id} (dim=${cand.targetDim})` : cand.id
  console.log(`\n[probe] ${label}`)

  // Step 1: single dummy probe to verify availability + capture dim.
  const dummy = await embedOne(apiKey, cand.id, "test", cand.targetDim)
  if ("error" in dummy) {
    console.log(`  ✗ skipped: ${dummy.status ?? "?"} — ${dummy.error.slice(0, 120)}`)
    return {
      id: cand.id,
      targetDim: cand.targetDim,
      family: cand.family,
      status: "skipped",
      errorSample: dummy.error,
    }
  }
  const actualDim = dummy.embedding.length
  console.log(`  ✓ dim=${actualDim}, probe ${dummy.ms}ms`)

  // Step 2: embed query + expected title for each pair, compute cosine.
  const queryMs: number[] = []
  const pairCosines: number[] = []
  let tokens = 0

  for (const { query, expectedTitle } of TEST_PAIRS) {
    const qRes = await embedOne(apiKey, cand.id, query, cand.targetDim)
    if ("error" in qRes) {
      console.log(`  ✗ query embed failed mid-run: ${qRes.error}`)
      return {
        id: cand.id,
        targetDim: cand.targetDim,
        family: cand.family,
        status: "error",
        actualDim,
        errorSample: qRes.error,
      }
    }
    const dRes = await embedOne(apiKey, cand.id, expectedTitle, cand.targetDim)
    if ("error" in dRes) {
      return {
        id: cand.id,
        targetDim: cand.targetDim,
        family: cand.family,
        status: "error",
        actualDim,
        errorSample: dRes.error,
      }
    }
    queryMs.push(qRes.ms, dRes.ms)
    pairCosines.push(cosine(qRes.embedding, dRes.embedding))
    tokens += (qRes.totalTokens ?? 0) + (dRes.totalTokens ?? 0)
  }

  const meanMs = Math.round(queryMs.reduce((s, v) => s + v, 0) / queryMs.length)
  const meanCos = pairCosines.reduce((s, v) => s + v, 0) / pairCosines.length

  console.log(`  meanCos=${meanCos.toFixed(3)} meanMs=${meanMs} tokens=${tokens}`)
  return {
    id: cand.id,
    targetDim: cand.targetDim,
    family: cand.family,
    status: "ok",
    actualDim,
    meanQueryMs: meanMs,
    meanCosine: meanCos,
    perPairCosine: pairCosines,
    totalTokens: tokens,
  }
}

async function main() {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    console.error("[probe] OPENROUTER_API_KEY not set")
    process.exit(1)
  }
  console.log(`[probe] testing ${CANDIDATES.length} candidate models on ${TEST_PAIRS.length} PSAK query/title pairs`)
  console.log(`[probe] OpenRouter endpoint: ${OPENROUTER_URL}`)

  const reports: ModelReport[] = []
  for (const cand of CANDIDATES) {
    reports.push(await probeModel(apiKey, cand))
  }

  // Summary table — sort by meanCosine desc, OKs first.
  const ok = reports.filter((r) => r.status === "ok").sort((a, b) => (b.meanCosine ?? 0) - (a.meanCosine ?? 0))
  const skipped = reports.filter((r) => r.status !== "ok")

  console.log("\n=".repeat(60))
  console.log("RESULTS (sorted by meanCosine descending)")
  console.log("=".repeat(60))
  console.log("rank  model                                    dim   meanMs  meanCos")
  console.log("-".repeat(75))
  ok.forEach((r, i) => {
    const id = r.targetDim ? `${r.id}@${r.targetDim}` : r.id
    const idStr = id.padEnd(40)
    const dim = String(r.actualDim).padStart(4)
    const ms = String(r.meanQueryMs).padStart(6)
    const cos = r.meanCosine!.toFixed(3).padStart(7)
    console.log(`${String(i + 1).padStart(4)}  ${idStr} ${dim}  ${ms}  ${cos}`)
  })

  if (skipped.length) {
    console.log("\nSkipped / errored:")
    for (const r of skipped) {
      console.log(`  ✗ ${r.id}${r.targetDim ? `@${r.targetDim}` : ""} — ${r.errorSample?.slice(0, 100)}`)
    }
  }

  // Save full report
  const path = await import("path")
  const fs = await import("fs")
  const outPath = path.join(process.cwd(), "eval-runs", `embedding-probe-${new Date().toISOString().replace(/[:.]/g, "-")}.json`)
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify({ reports, testPairs: TEST_PAIRS }, null, 2))
  console.log(`\n[probe] full report: ${outPath}`)

  // Recommendation
  console.log("\nRecommendation:")
  console.log("  - Highest meanCos at lowest dim → best latency-quality tradeoff for embedding swap.")
  console.log("  - Drop ≤ 3% from your current model's meanCos = safe swap candidate.")
  console.log("  - Drop > 5% = quality regression risk; stick with current or test deeper.")
}

main().catch((err) => {
  console.error("[probe] failed:", err)
  process.exit(1)
})
