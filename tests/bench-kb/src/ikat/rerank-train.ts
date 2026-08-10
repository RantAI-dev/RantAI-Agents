/**
 * IKAT-Bench — learn to rank figure candidates, instead of hand-writing a rule.
 *
 * Motivated by a measurement, not by ambition: capping the emitted figures at 1
 * barely moved precision (.157 -> .168) while halving recall. If our ordering
 * carried signal, the first pick would be far better than the third. It is not,
 * so the ranking inside the candidate pool is close to arbitrary — the pool
 * holds a correct figure 44% of the time and we cannot tell which one.
 *
 * That is exactly the case the reranking literature addresses, and the cheap
 * version needs no VLM at serving time: score each candidate with a small model
 * over features we already compute, and let it learn what the hand-written rules
 * were guessing at. Notably, "is this figure anchored in a retrieved chunk" is
 * just one feature among several — so a learned scorer can discover the
 * anchor/description trade-off that the hybrid hard-codes and the router
 * hand-splits.
 *
 * HONESTY ABOUT THE LABELS. Training targets come from the same gold standard
 * that is 80% anchor-derived (see 06-gold-standard-confound.md). A model trained
 * on it will inherit that bias, so results are reported per split — and the
 * clean split is the one that counts, because on the anchor-derived split a
 * learner can win simply by rediscovering the anchor.
 *
 * Documents are split train/test, never questions: figures repeat across
 * questions within a book, so a question-level split would leak.
 *
 * Usage:
 *   IKAT_PROVIDER=ugm IKAT_CORPUS=ugm3-built \
 *     bun tests/bench-kb/src/ikat/rerank-train.ts
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { cosine } from "../lib"
import { genEmbed as embed } from "./providers"
import { buildIndex, EMBED_MODEL, TOP_K, FIG_K, figureIndexText, type DocIndex } from "./systems"

const BENCH_ROOT = path.resolve(import.meta.dirname, "../..")
const CORPUS = path.join(BENCH_ROOT, "corpus", process.env.IKAT_CORPUS ?? "ugm3-built")
const QFILE = path.join(BENCH_ROOT, "corpus", process.env.IKAT_QUESTIONS ?? "questions-ugm-large.json")
const DESC_DIR = path.join(BENCH_ROOT, "corpus", process.env.IKAT_DESCRIPTIONS ?? "descriptions")
const MAX_FIGURES = Number(process.env.IKAT_MAX_FIGURES ?? 3)
const TEST_DOCS = Number(process.env.IKAT_TEST_DOCS ?? 4)

interface Q { id: string; question: string; docSlug: string; goldFigureIds: string[]; type: string }

/** One (question, candidate figure) pair. */
interface Row {
  docSlug: string
  qid: string
  qtype: string
  figureId: string
  x: number[]
  y: number
}

const FEATURES = [
  "descSim", // question vs the figure's own indexed text (description/caption)
  "anchored", // 1 if the figure's anchor chunk is in the TOP_K generator context
  "anchoredWide", // 1 if it is in the wider FIG_K pool
  "anchorRank", // normalised rank of the anchor chunk in retrieval (1 = best)
  "anchorSim", // question vs the anchor chunk itself
  "descSimRel", // descSim minus the mean descSim of this question's pool
  "hasCaption", // printed caption present — a proxy for "the book named this figure"
  "bias",
]

function sigmoid(z: number) {
  return 1 / (1 + Math.exp(-z))
}

/** Logistic regression, L2-regularised, plain batch gradient descent. */
function train(rows: Row[], dim: number, epochs = 400, lr = 0.5, l2 = 1e-3) {
  const w = new Array(dim).fill(0)
  // Positives are rare (a few gold among ~20 candidates); without reweighting
  // the model can score everything 0 and still look accurate.
  const pos = rows.filter((r) => r.y === 1).length
  const posW = pos ? (rows.length - pos) / pos : 1
  for (let e = 0; e < epochs; e++) {
    const g = new Array(dim).fill(0)
    for (const r of rows) {
      const p = sigmoid(r.x.reduce((a, v, i) => a + v * w[i], 0))
      const wt = r.y === 1 ? posW : 1
      const err = (p - r.y) * wt
      for (let i = 0; i < dim; i++) g[i] += err * r.x[i]
    }
    for (let i = 0; i < dim; i++) w[i] -= (lr * (g[i] / rows.length + l2 * w[i]))
  }
  return w
}

async function featuresFor(idx: DocIndex, q: Q): Promise<Row[]> {
  const qVec = (await embed(EMBED_MODEL, q.question)).vectors[0]
  const ranked = idx.doc.chunks
    .map((c) => ({ c, s: cosine(qVec, idx.chunkVecs.get(c.id) ?? []) }))
    .sort((a, b) => b.s - a.s)
  const rankOf = new Map(ranked.map((x, i) => [x.c.id, i]))
  const topIds = new Set(ranked.slice(0, TOP_K).map((x) => x.c.id))
  const wideIds = new Set(ranked.slice(0, FIG_K).map((x) => x.c.id))

  const usable = idx.doc.figures.filter((f) => !f.decorative)
  // Candidates: anchored in the wide pool, plus the best description matches, so
  // the learner sees both families rather than only the one a rule preferred.
  const bySim = usable
    .map((f) => ({ f, s: cosine(qVec, idx.figureVecs.get(f.id) ?? []) }))
    .sort((a, b) => b.s - a.s)
  const cand = new Map<string, (typeof bySim)[number]>()
  for (const e of bySim) if (e.f.anchorChunkId && wideIds.has(e.f.anchorChunkId)) cand.set(e.f.id, e)
  for (const e of bySim.slice(0, FIG_K)) cand.set(e.f.id, e)
  if (!cand.size) return []

  const sims = [...cand.values()].map((e) => e.s)
  const meanSim = sims.reduce((a, b) => a + b, 0) / sims.length
  const gold = new Set(q.goldFigureIds ?? [])
  const nChunks = idx.doc.chunks.length || 1

  return [...cand.values()].map((e) => {
    const a = e.f.anchorChunkId
    const r = a ? (rankOf.get(a) ?? nChunks) : nChunks
    return {
      docSlug: q.docSlug,
      qid: q.id,
      qtype: q.type,
      figureId: e.f.id,
      y: gold.has(e.f.id) ? 1 : 0,
      x: [
        e.s,
        a && topIds.has(a) ? 1 : 0,
        a && wideIds.has(a) ? 1 : 0,
        1 - Math.min(1, r / nChunks),
        a ? cosine(qVec, idx.chunkVecs.get(a) ?? []) : 0,
        e.s - meanSim,
        e.f.caption ? 1 : 0,
        1,
      ],
    }
  })
}

function evaluate(rows: Row[], score: (r: Row) => number, label: string) {
  const byQ = new Map<string, Row[]>()
  for (const r of rows) {
    const arr = byQ.get(r.qid) ?? []
    arr.push(r)
    byQ.set(r.qid, arr)
  }
  const report = (sub: Map<string, Row[]>, name: string) => {
    let tp = 0
    let fp = 0
    let fn = 0
    let hits = 0
    let n = 0
    for (const [, cands] of sub) {
      const gold = cands.filter((c) => c.y === 1).map((c) => c.figureId)
      if (!gold.length) continue
      n++
      const picked = cands
        .slice()
        .sort((a, b) => score(b) - score(a))
        .slice(0, MAX_FIGURES)
        .map((c) => c.figureId)
      const g = new Set(gold)
      const p = new Set(picked)
      tp += [...p].filter((x) => g.has(x)).length
      fp += [...p].filter((x) => !g.has(x)).length
      fn += [...g].filter((x) => !p.has(x)).length
      if ([...p].some((x) => g.has(x))) hits++
    }
    const P = tp + fp ? tp / (tp + fp) : 0
    const R = tp + fn ? tp / (tp + fn) : 0
    const F = P + R ? (2 * P * R) / (P + R) : 0
    console.log(`  ${name.padEnd(26)} n=${String(n).padStart(3)}  P=${P.toFixed(3)} R=${R.toFixed(3)} F1=${F.toFixed(3)}  hit@q=${(hits / (n || 1)).toFixed(3)}`)
  }
  const clean = new Map([...byQ].filter(([, v]) => v[0].qtype === "figure_dependent"))
  const span = new Map([...byQ].filter(([, v]) => v[0].qtype !== "figure_dependent"))
  console.log(`\n${label}`)
  report(byQ, "all")
  report(clean, "clean gold (fig-dependent)")
  report(span, "anchor-derived gold")
}

async function main() {
  const questions = JSON.parse(fs.readFileSync(QFILE, "utf-8")) as Q[]
  const descriptions = new Map<string, string>()
  if (fs.existsSync(DESC_DIR)) {
    for (const f of fs.readdirSync(DESC_DIR).filter((x) => x.endsWith(".json")))
      for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(path.join(DESC_DIR, f), "utf-8")) as Record<string, string>))
        descriptions.set(k, v)
  }

  const files = fs.readdirSync(CORPUS).filter((f) => f.endsWith(".json")).sort()
  const all: Row[] = []
  for (const [i, file] of files.entries()) {
    const doc = JSON.parse(fs.readFileSync(path.join(CORPUS, file), "utf-8"))
    const dq = questions.filter((q) => q.docSlug === doc.slug && q.goldFigureIds?.length)
    if (!dq.length) continue
    const idx = await buildIndex(doc, descriptions)
    for (const q of dq) all.push(...(await featuresFor(idx, q)))
    console.log(`[${i + 1}/${files.length}] ${doc.slug} — ${all.length} pairs so far`)
  }

  // Split by DOCUMENT, and ROTATE. Figures recur across questions within a book,
  // so a question-level split would put the same figure on both sides. A single
  // 4-document test set leaves ~37 scoreable questions, which is far too few to
  // separate these systems — the first run of this script produced exactly that
  // and the numbers swung several points between splits. Rotating over every
  // fold and pooling the held-out predictions costs one extra training pass per
  // fold and makes every question a test question exactly once.
  const docs = [...new Set(all.map((r) => r.docSlug))].sort()
  const folds: string[][] = []
  for (let i = 0; i < docs.length; i += TEST_DOCS) folds.push(docs.slice(i, i + TEST_DOCS))
  console.log(`\npairs: ${all.length}  docs=${docs.length}  folds=${folds.length} (${TEST_DOCS} docs each)`)
  console.log(`positives: ${all.filter((r) => r.y).length}`)

  const pooled: Row[] = []
  const learned = new Map<string, number>()
  const wAvg = new Array(FEATURES.length).fill(0)
  for (const [fi, fold] of folds.entries()) {
    const testDocs = new Set(fold)
    const tr = all.filter((r) => !testDocs.has(r.docSlug))
    const te = all.filter((r) => testDocs.has(r.docSlug))
    if (!te.length || !tr.some((r) => r.y)) continue
    const w = train(tr, FEATURES.length)
    w.forEach((v, i) => (wAvg[i] += v / folds.length))
    for (const r of te) {
      learned.set(`${r.qid}::${r.figureId}`, r.x.reduce((a, v, i) => a + v * w[i], 0))
      pooled.push(r)
    }
    console.log(`  fold ${fi + 1}: train=${tr.length} test=${te.length}`)
  }

  console.log(`\nmean learned weights across folds:`)
  FEATURES.forEach((f, i) => console.log(`  ${f.padEnd(14)} ${wAvg[i].toFixed(3)}`))

  // Baselines are scored on the SAME candidate pool, so the comparison is about
  // ORDERING rather than about who was handed a better pool.
  evaluate(pooled, (r) => r.x[0], "BASELINE — description similarity only")
  evaluate(pooled, (r) => r.x[1] * 10 + r.x[0], "BASELINE — anchored-first, then similarity (hybrid-like)")
  evaluate(pooled, (r) => learned.get(`${r.qid}::${r.figureId}`) ?? 0, "LEARNED reranker (pooled held-out)")

  // ── Router ────────────────────────────────────────────────────────────────
  // The two families are complementary rather than competing: descriptions win
  // decisively where the answer needs a specific picture, the anchor wins where
  // the question is about a passage. A rule that picks one per question should
  // beat either alone, and a hybrid that always blends them.
  //
  // The routing decision is made from the CANDIDATE POOL, not from the question
  // text: a question that genuinely needs a figure tends to have one candidate
  // whose description matches it far better than the rest, while a passage
  // question has a strong anchor match and a flat description profile. Those are
  // four cheap numbers, which keeps the classifier honest at this sample size —
  // a logistic model over a 1024-dim question embedding would overfit 219
  // questions long before it learned anything transferable.
  const qFeat = new Map<string, { x: number[]; y: number; doc: string }>()
  for (const r of pooled) {
    const e = qFeat.get(r.qid)
    const maxDesc = Math.max(e?.x[0] ?? -1, r.x[0])
    const maxAnchor = Math.max(e?.x[1] ?? -1, r.x[4])
    const nAnch = (e?.x[2] ?? 0) + (r.x[1] ? 1 : 0)
    const spread = Math.max(e?.x[3] ?? -1, r.x[5])
    qFeat.set(r.qid, {
      x: [maxDesc, maxAnchor, nAnch, spread, 1],
      y: r.qtype === "figure_dependent" ? 1 : 0,
      doc: r.docSlug,
    })
  }
  const qRows: Row[] = [...qFeat.entries()].map(([qid, v]) => ({
    docSlug: v.doc, qid, qtype: "", figureId: "", x: v.x, y: v.y,
  }))

  // Same document rotation, so the router is never evaluated on a book it was
  // fitted on.
  const routeScore = new Map<string, number>()
  for (const fold of folds) {
    const testDocs = new Set(fold)
    const tr = qRows.filter((r) => !testDocs.has(r.docSlug))
    const te = qRows.filter((r) => testDocs.has(r.docSlug))
    if (!te.length || !tr.some((r) => r.y)) continue
    const w = train(tr, 5)
    for (const r of te) routeScore.set(r.qid, sigmoid(r.x.reduce((a, v, i) => a + v * w[i], 0)))
  }
  const acc = qRows.filter((r) => routeScore.has(r.qid))
  const correct = acc.filter((r) => (routeScore.get(r.qid)! >= 0.5 ? 1 : 0) === r.y).length
  console.log(`\nrouter accuracy (held-out): ${(correct / acc.length).toFixed(3)} on ${acc.length} questions`)

  const desc = (r: Row) => r.x[0]
  const model = (r: Row) => learned.get(`${r.qid}::${r.figureId}`) ?? 0
  evaluate(pooled, (r) => ((routeScore.get(r.qid) ?? 0) >= 0.5 ? desc(r) : model(r)), "ROUTED — learned router picks per question")
  evaluate(pooled, (r) => (r.qtype === "figure_dependent" ? desc(r) : model(r)), "ROUTED — ORACLE router (upper bound)")
}

if (import.meta.main) main()
