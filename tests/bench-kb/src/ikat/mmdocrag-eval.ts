/**
 * IKAT-Bench — figure selection on MMDocRAG, a second external benchmark.
 *
 * Why a second one. Every internal number is scored against a gold we defined,
 * and our own harness gold agrees with a person at chance. MRAMG closed part of
 * that gap, but a single external benchmark is a single point of failure — and
 * three of its six subsets turned out to pose no selection decision at all,
 * because every candidate in them is already a gold image.
 *
 * MMDocRAG~(arXiv:2505.16470) does not have that problem, and we checked before
 * relying on it rather than after:
 *
 *   2055 questions, 147 documents, 4 domains (academic, financial, news,
 *   research report), 5.0 image candidates per question against 1.5 gold, and
 *   0.5% of questions where every candidate is gold. The selection decision is
 *   real almost everywhere.
 *
 * Two further properties matter for cost and for honesty. Each candidate ships
 * with an author-provided `img_description`, so this path needs the 25 MB
 * annotation file and not the 2 GB image archive — and, more importantly, the
 * text representing an image is THEIRS, not ours. On our own corpus we generate
 * figure descriptions with a VLM, which leaves open whether a result reflects
 * the ranker or our description step. Here it cannot.
 *
 * The gold is expert-annotated by the benchmark's authors. We annotate nothing.
 *
 * Usage:
 *   MMDOCRAG_DIR=corpus/mmdocrag bun tests/bench-kb/src/ikat/mmdocrag-eval.ts [limit]
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { rerankTexts } from "./systems"

const BENCH_ROOT = path.resolve(import.meta.dirname, "../..")
const DIR = process.env.MMDOCRAG_DIR ?? path.join(BENCH_ROOT, "corpus", "mmdocrag")
const FILE = process.env.MMDOCRAG_FILE ?? "dev_15.jsonl"
const TOP_K = Number(process.env.IKAT_RERANK_TOP_K ?? 2)
const MIN = Number(process.env.IKAT_RERANK_MIN ?? 0.1)

interface Quote { quote_id: string; type?: string; img_path?: string; img_description?: string }
interface Row {
  q_id: number
  doc_name: string
  domain: string
  question: string
  img_quotes?: Quote[]
  gold_quotes?: string[]
}

async function main() {
  const limit = Number(process.argv[2] ?? process.env.MMDOCRAG_LIMIT ?? 0)
  const rows = fs
    .readFileSync(path.join(DIR, FILE), "utf-8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as Row)
  const qa = limit ? rows.slice(0, limit) : rows

  console.log(`MMDocRAG ${FILE}: ${qa.length} questions, ${new Set(qa.map((r) => r.doc_name)).size} documents`)
  console.log(`selection: top-${TOP_K} @ ${MIN}; image text = the benchmark's own img_description\n`)

  let tp = 0, fp = 0, fn = 0
  let emitted = 0, silent = 0, skipped = 0, degenerate = 0, candTotal = 0
  const perDomain = new Map<string, { tp: number; fp: number; fn: number; n: number }>()

  for (const [i, r] of qa.entries()) {
    const cands = (r.img_quotes ?? []).filter((q) => (q.img_description ?? "").trim())
    if (cands.length < 1) { skipped++; continue }
    // Gold is stated over all quote ids; only the image ones are ours to select.
    const gold = new Set((r.gold_quotes ?? []).filter((g) => g.startsWith("image")))
    candTotal += cands.length
    if (cands.every((c) => gold.has(c.quote_id))) degenerate++

    const scores = await rerankTexts(r.question, cands.map((c) => c.img_description!))
    const picked = cands
      .map((c, j) => ({ id: c.quote_id, s: scores[j] ?? 0 }))
      .filter((x) => x.s >= MIN)
      .sort((a, b) => b.s - a.s)
      .slice(0, TOP_K)
      .map((x) => x.id)

    emitted += picked.length
    if (!picked.length) silent++
    let qtp = 0, qfp = 0, qfn = 0
    for (const p of picked) (gold.has(p) ? (tp++, qtp++) : (fp++, qfp++))
    for (const g of gold) if (!picked.includes(g)) (fn++, qfn++)

    const d = perDomain.get(r.domain) ?? { tp: 0, fp: 0, fn: 0, n: 0 }
    d.tp += qtp; d.fp += qfp; d.fn += qfn; d.n += 1
    perDomain.set(r.domain, d)

    if ((i + 1) % 200 === 0) console.log(`  ${i + 1}/${qa.length}…`)
  }

  const n = qa.length - skipped
  const prf = (tp: number, fp: number, fn: number) => {
    const P = tp + fp ? tp / (tp + fp) : 0
    const R = tp + fn ? tp / (tp + fn) : 0
    return { P: 100 * P, R: 100 * R, F: P + R ? (100 * 2 * P * R) / (P + R) : 0 }
  }
  const o = prf(tp, fp, fn)

  console.log(`\nscored ${n} questions (${skipped} skipped: no described image candidate)`)
  console.log(`mean image candidates per question: ${(candTotal / (n || 1)).toFixed(1)}`)
  console.log(`emitted ${emitted} images, silent on ${((100 * silent) / (n || 1)).toFixed(0)}% of questions`)
  console.log(`questions where EVERY candidate is gold: ${((100 * degenerate) / (n || 1)).toFixed(1)}%\n`)
  console.log(`Image Precision  ${o.P.toFixed(2)}`)
  console.log(`Image Recall     ${o.R.toFixed(2)}`)
  console.log(`Image F1         ${o.F.toFixed(2)}`)

  console.log(`\nby domain — a spread here is evidence about genre, which one corpus cannot give\n`)
  console.log(`domain                          n      IP      IR      IF1`)
  for (const [dom, d] of [...perDomain].sort((a, b) => b[1].n - a[1].n)) {
    const r = prf(d.tp, d.fp, d.fn)
    console.log(
      `${dom.padEnd(31)} ${String(d.n).padEnd(6)} ${r.P.toFixed(2).padEnd(7)} ${r.R.toFixed(2).padEnd(7)} ${r.F.toFixed(2)}`,
    )
  }

  const out = path.join(BENCH_ROOT, "corpus", "results", "mmdocrag-selection.json")
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, JSON.stringify({
    file: FILE, topK: TOP_K, min: MIN, n, tp, fp, fn,
    meanCands: candTotal / (n || 1), silentPct: (100 * silent) / (n || 1),
    degeneratePct: (100 * degenerate) / (n || 1),
    overall: o,
    byDomain: Object.fromEntries([...perDomain].map(([k, v]) => [k, { ...v, ...prf(v.tp, v.fp, v.fn) }])),
  }, null, 2))
  console.log(`\nwrote ${out}`)
}

if (import.meta.main) main()
