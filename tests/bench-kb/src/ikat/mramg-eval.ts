/**
 * IKAT-Bench — evaluate our figure selection on MRAMG-Bench.
 *
 * Every number this project has produced was measured on a private corpus with a
 * gold standard we built ourselves and then found to be partly broken (80% of it
 * agrees with human judgement at chance — docs/paper/07-human-gold-audit.md).
 * That makes the results uncomparable to anything published, however carefully
 * they are tested internally.
 *
 * MRAMG-Bench (arXiv:2502.04176) fixes that: public data, published per-subset
 * numbers, and gold image lists we did not author. The Recipe subset is the one
 * that discriminates — its documents carry ~5 images each, so selection is a
 * real choice rather than a formality (on their Web subset the average document
 * has 1.0 images and every method scores near-identically).
 *
 * PROTOCOL, kept as close to theirs as our task allows:
 *   - Candidates are the images of the question's provenance document, which is
 *     what their LLM-based baseline sees.
 *   - Each image's text is the document prose IMMEDIATELY BEFORE its <PIC>
 *     placeholder. The document stores images inline in reading order, so this
 *     is the same anchor our own pipeline uses, and the same information their
 *     placeholder-based baseline has.
 *   - Image Precision, as defined in the paper: "the percentage of correct
 *     images in the multimodal answer relative to the total number of inserted
 *     images". Recall and F1 are reported alongside because precision alone can
 *     be bought with silence.
 *
 * What is NOT the same: their systems generate an answer and insert images while
 * we only select. Precision is computed over the same quantity — images emitted
 * versus images correct — so the comparison is meaningful, but it is a selection
 * result placed next to end-to-end systems, and that is stated rather than
 * glossed.
 *
 * Usage:
 *   IKAT_PROVIDER=ugm bun tests/bench-kb/src/ikat/mramg-eval.ts [limit]
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { rerankTexts } from "./systems"

const DIR = process.env.MRAMG_DIR ?? "/ikat/mramg"
const TOP_K = Number(process.env.IKAT_RERANK_TOP_K ?? 2)
const MIN = Number(process.env.IKAT_RERANK_MIN ?? 0.1)
/** Characters of preceding prose used to represent an image. */
const CTX = Number(process.env.MRAMG_CTX ?? 400)

interface QA { id: string; question: string; provenance: number[]; images_list: string[] }

function loadDocs(SUBSET: string): Map<number, { text: string; images: string[] }> {
  const out = new Map<number, { text: string; images: string[] }>()
  for (const line of fs.readFileSync(path.join(DIR, `doc_${SUBSET}.jsonl`), "utf-8").trim().split("\n")) {
    const d = JSON.parse(line) as Record<string, unknown>
    out.set(d["0"] as number, { text: (d["1"] as string) ?? "", images: (d["2"] as string[]) ?? [] })
  }
  return out
}

/** Text standing in for each image: the prose that precedes its placeholder. */
function imageContexts(text: string, images: string[]): Map<string, string> {
  const parts = text.split("<PIC>")
  const out = new Map<string, string>()
  images.forEach((id, i) => {
    // parts[i] is everything before placeholder i. Take its tail — the sentences
    // nearest the image, not the top of the document.
    const before = (parts[i] ?? "").trim()
    const after = (parts[i + 1] ?? "").trim().slice(0, Math.floor(CTX / 3))
    out.set(id, `${before.slice(-CTX)} ${after}`.trim())
  })
  return out
}

interface SubsetResult {
  subset: string; n: number; skipped: number; P: number; R: number; F: number
  emitted: number; silentPct: number; meanCands: number
  // Raw counts, because the published comparison is by DOMAIN and domains pool
  // subsets. Pooling precision means summing tp/fp, never averaging P.
  tp: number; fp: number; fn: number
  /** Questions where every candidate is already a gold image, so there is
   *  nothing to select and precision is forced to 1 whenever anything is
   *  emitted. A high value means the subset does not test selection at all. */
  degeneratePct: number
  perQ: Array<{ tp: number; emitted: number; gold: number }>
}

async function evalSubset(SUBSET: string, limit: number): Promise<SubsetResult> {
  const docs = loadDocs(SUBSET)
  const qa = fs
    .readFileSync(path.join(DIR, `${SUBSET}_mqa.jsonl`), "utf-8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as QA)
    .slice(0, limit)

  console.log(`MRAMG-${SUBSET}: ${qa.length} questions, ${docs.size} documents`)
  console.log(`selection: top-${TOP_K} @ ${MIN}, image text = ${CTX} chars before its placeholder\n`)

  let tp = 0
  let fp = 0
  let fn = 0
  let emitted = 0
  let silent = 0
  let candTotal = 0
  let skipped = 0
  let degenerate = 0
  // Per-question outcomes, so the margin against a published comparator can be
  // given an interval instead of being quoted bare. A difference of a few points
  // on 200 questions is exactly the claim a reviewer asks to see bounded.
  const perQ: Array<{ tp: number; emitted: number; gold: number }> = []

  for (const [n, q] of qa.entries()) {
    const cands: Array<{ id: string; text: string }> = []
    for (const p of q.provenance ?? []) {
      const d = docs.get(p)
      if (!d) continue
      const ctx = imageContexts(d.text, d.images)
      for (const id of d.images) cands.push({ id, text: ctx.get(id) ?? "" })
    }
    if (!cands.length) {
      skipped++
      continue
    }
    candTotal += cands.length

    const scores = await rerankTexts(q.question, cands.map((c) => c.text))
    const picked = cands
      .map((c, i) => ({ id: c.id, s: scores[i] ?? 0 }))
      .filter((x) => x.s >= MIN)
      .sort((a, b) => b.s - a.s)
      .slice(0, TOP_K)
      .map((x) => x.id)

    const gold = new Set(q.images_list ?? [])
    // No wrong answer is available here: every candidate is gold, so emitting
    // anything scores perfect precision. Counted, not silently enjoyed.
    if (cands.every((c) => gold.has(c.id))) degenerate++
    emitted += picked.length
    if (!picked.length) silent++
    let qtp = 0
    for (const p of picked) (gold.has(p) ? (tp++, qtp++) : fp++)
    for (const g of gold) if (!picked.includes(g)) fn++
    perQ.push({ tp: qtp, emitted: picked.length, gold: gold.size })

    if ((n + 1) % 50 === 0) console.log(`  ${n + 1}/${qa.length}…`)
  }

  const P = tp + fp ? tp / (tp + fp) : 0
  const R = tp + fn ? tp / (tp + fn) : 0
  const F = P + R ? (2 * P * R) / (P + R) : 0
  const n = qa.length - skipped
  const result: SubsetResult = {
    subset: SUBSET, n, skipped, P: 100 * P, R: 100 * R, F: 100 * F,
    emitted, silentPct: (100 * silent) / (n || 1), meanCands: candTotal / (n || 1),
    tp, fp, fn, degeneratePct: (100 * degenerate) / (n || 1), perQ,
  }

  console.log(`\nscored ${n} questions (${skipped} skipped: provenance doc missing)`)
  console.log(`mean candidates per question: ${(candTotal / (n || 1)).toFixed(1)}`)
  console.log(`emitted ${emitted} images, silent on ${((100 * silent) / (n || 1)).toFixed(0)}% of questions`)
  const degPct = (100 * degenerate) / (n || 1)
  console.log(`questions where EVERY candidate is gold: ${degPct.toFixed(1)}%` +
    (degPct > 50 ? "  <-- precision is forced here; this subset does not test selection" : "") + "\n")
  console.log(`Image Precision  ${(100 * P).toFixed(2)}`)
  console.log(`Image Recall     ${(100 * R).toFixed(2)}`)
  console.log(`Image F1         ${(100 * F).toFixed(2)}`)

  // Published Image Precision, Table 4 of arXiv:2502.04176.
  //
  // The table reports by DOMAIN, not by subset — a distinction that nearly
  // produced a wrong comparison here. Academic = arxiv alone; Lifestyle pools
  // recipe AND manual, so neither of those may be compared to it on its own.
  const PUBLISHED: Record<string, { domain: string; rows: string[] }> = {
    arxiv: {
      domain: "Academic Data (= arxiv alone)",
      rows: [
        "LLM-based   GPT-4o 65.28 | Claude-3.5-Sonnet 62.17 | Gemini-1.5-Pro 59.85",
        "            DeepSeek-V3 46.57 | Llama-3.3-70B 38.78 | Llama-3.1-8B 1.50",
        "MLLM-based  GPT-4o 60.39 | Gemini-1.5-Pro 58.13 | Claude-3.5-Sonnet 47.12",
        "            InternVL-2.5-78B 36.62 | Qwen2-VL-72B 31.99 | Qwen2-VL-7B 1.63",
        "Rule-based  DeepSeek-V3 56.12 | GPT-4o 55.42 | Claude-3.5-Sonnet 55.17",
        "            Llama-3.3-70B 53.00 | InternVL-2.5-78B 52.21 | Qwen2-VL-7B 49.17",
      ],
    },
    recipe: { domain: "Lifestyle Data (= recipe + manual POOLED — not comparable to one alone)", rows: [] },
    manual: { domain: "Lifestyle Data (= recipe + manual POOLED — not comparable to one alone)", rows: [] },
  }
  const pub = PUBLISHED[SUBSET]
  if (pub) {
    console.log(`\npublished Image Precision — ${pub.domain}:`)
    if (pub.rows.length) for (const r of pub.rows) console.log(`  ${r}`)
    else
      console.log(
        `  Lifestyle: Gemini-1.5-Pro 62.23 | Claude-3.5-Sonnet 59.83 | GPT-4o 47.48 |\n` +
          `             DeepSeek-V3 45.71 | Llama-3.3-70B 35.29 | Llama-3.1-8B 11.71\n` +
          `  Pool this subset WITH the other before comparing.`,
      )
  }
  return result
}

/**
 * Reporting every subset, not the one that flatters us.
 *
 * The paper previously reported Academic alone. One subset chosen from six reads
 * as selection whether or not it was, and the only way to answer that is to run
 * the rest and publish them at the same time — including the ones we lose.
 */
async function main() {
  const limit = Number(process.argv[2] ?? process.env.MRAMG_LIMIT ?? 300)
  const requested = process.env.MRAMG_SUBSET ?? "recipe"
  const subsets = requested === "all"
    ? ["arxiv", "wit", "wiki", "web", "recipe", "manual"]
    : [requested]

  const all: SubsetResult[] = []
  for (const s of subsets) {
    console.log(`\n${"=".repeat(66)}`)
    all.push(await evalSubset(s, limit))
  }

  // Always persist, including for a single subset. The first per-question run
  // completed and its data was discarded because only the all-subsets path wrote
  // anything — fifteen minutes of compute for a number already on screen.
  {
    const out = path.join(DIR, "..", "results", `mramg-${subsets.join("-")}.json`)
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(out, JSON.stringify({ topK: TOP_K, min: MIN, ctx: CTX, results: all }, null, 2))
    console.log(`\nwrote ${out}`)
  }

  if (all.length > 1) {
    console.log(`\n${"=".repeat(66)}\nALL SUBSETS — Image Precision / Recall / F1\n`)
    console.log(`subset    n     cands  silent%  all-gold%  IP      IR      IF1`)
    for (const r of all)
      console.log(
        `${r.subset.padEnd(9)} ${String(r.n).padEnd(5)} ${r.meanCands.toFixed(1).padEnd(6)} ` +
          `${r.silentPct.toFixed(0).padEnd(8)} ${r.degeneratePct.toFixed(1).padEnd(10)} ` +
          `${r.P.toFixed(2).padEnd(7)} ${r.R.toFixed(2).padEnd(7)} ${r.F.toFixed(2)}`,
      )
    console.log(
      `\n"all-gold%" is the share of questions where every candidate is already a gold\n` +
        `image. Where it is high, precision is arithmetic rather than earned and the\n` +
        `subset does not test selection under this candidate construction. That is a\n` +
        `property of how WE build candidates — the images of the question's provenance\n` +
        `document — not a defect in the benchmark.`,
    )
    // Published comparators are reported per DOMAIN. Pool the raw counts —
    // averaging per-subset precision would weight a 200-question subset the same
    // as a 2360-question one and is simply a different quantity.
    const DOMAINS: Record<string, string[]> = {
      "Web Data": ["wit", "wiki", "web"],
      "Academic Data": ["arxiv"],
      "Lifestyle Data": ["recipe", "manual"],
    }
    const PUB_DOMAIN: Record<string, string> = {
      "Web Data": "best published 93.63 (Gemini-1.5-Pro, LLM-based)",
      "Academic Data": "best published 65.28 (GPT-4o, LLM-based)",
      "Lifestyle Data": "best published 62.23 (Gemini-1.5-Pro, LLM-based)",
    }
    console.log(`\npooled by domain — the unit the published table uses\n`)
    console.log(`domain            n      IP      IR      IF1     comparator`)
    for (const [dom, subs] of Object.entries(DOMAINS)) {
      const rows = all.filter((r) => subs.includes(r.subset))
      if (rows.length !== subs.length) continue
      const tp = rows.reduce((a, r) => a + r.tp, 0)
      const fp = rows.reduce((a, r) => a + r.fp, 0)
      const fn = rows.reduce((a, r) => a + r.fn, 0)
      const n = rows.reduce((a, r) => a + r.n, 0)
      const P = tp + fp ? (100 * tp) / (tp + fp) : 0
      const R = tp + fn ? (100 * tp) / (tp + fn) : 0
      const F = P + R ? (2 * P * R) / (P + R) : 0
      console.log(
        `${dom.padEnd(17)} ${String(n).padEnd(6)} ${P.toFixed(2).padEnd(7)} ${R.toFixed(2).padEnd(7)} ` +
          `${F.toFixed(2).padEnd(7)} ${PUB_DOMAIN[dom] ?? ""}`,
      )
    }

    const out = path.join(DIR, "..", "results", "mramg-all-subsets.json")
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(out, JSON.stringify({ topK: TOP_K, min: MIN, ctx: CTX, results: all }, null, 2))
    console.log(`\nwrote ${out}`)
  }
}

if (import.meta.main) main()
