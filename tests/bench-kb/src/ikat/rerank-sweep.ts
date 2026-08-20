/**
 * IKAT-Bench — find the cross-encoder's operating point instead of guessing it.
 *
 * The admission floor was set to 0.1 from a three-example probe. That produced
 * the most precise selector we have measured (P 0.250 against human gold, versus
 * 0.076 for the next best) and the lowest recall (0.072 against harness gold),
 * and nothing about the probe justified 0.1 over any other value.
 *
 * Scores are computed ONCE per question and thresholds applied afterwards.
 * Re-running the reranker per threshold would be both wasteful and risky: the
 * service shares a GPU with generation and wedges under sustained load — once
 * its CUDA context breaks it returns errors for every request until restarted,
 * which is how an earlier probe produced a convincing but entirely fictitious
 * "capacity limit".
 *
 * Reports precision, recall, F1 and abstention at each threshold, against
 * whichever gold the question file carries. Both golds matter and they disagree:
 * the harness gold marks 2.5x more figures correct than a person does, so it
 * rewards over-emission, while the human gold rewards silence.
 *
 * Usage:
 *   IKAT_QUESTIONS=questions-human-gold.json \
 *     bun tests/bench-kb/src/ikat/rerank-sweep.ts
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { buildIndex, rerankCandidates, type FigureTextMode } from "./systems"

const BENCH_ROOT = path.resolve(import.meta.dirname, "../..")
const CORPUS = path.join(BENCH_ROOT, "corpus", process.env.IKAT_CORPUS ?? "ugm3-built")
const QFILE = path.join(BENCH_ROOT, "corpus", process.env.IKAT_QUESTIONS ?? "questions-ugm-large.json")
const DESC_DIR = path.join(BENCH_ROOT, "corpus", process.env.IKAT_DESCRIPTIONS ?? "descriptions")
const MAX_FIGURES = Number(process.env.IKAT_MAX_FIGURES ?? 3)
const THRESHOLDS = (process.env.IKAT_THRESHOLDS ?? "0,0.001,0.01,0.05,0.1,0.2,0.4,0.6,0.8")
  .split(",")
  .map(Number)

interface Q { id: string; question: string; docSlug: string; goldFigureIds: string[]; type?: string }

async function main() {
  const questions = JSON.parse(fs.readFileSync(QFILE, "utf-8")) as Q[]
  const descriptions = new Map<string, string>()
  if (fs.existsSync(DESC_DIR))
    for (const f of fs.readdirSync(DESC_DIR).filter((x) => x.endsWith(".json")))
      for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(path.join(DESC_DIR, f), "utf-8")) as Record<string, string>))
        descriptions.set(k, v)

  // qid -> ranked candidates with their cross-encoder score, scored once.
  const MODE = (process.env.IKAT_FIGTEXT as FigureTextMode) ?? "desc"
  const scored = new Map<
    string,
    { gold: Set<string>; ranked: Array<{ id: string; s: number; anchored: boolean; cos: number }>; type: string }
  >()

  const files = fs.readdirSync(CORPUS).filter((f) => f.endsWith(".json")).sort()
  for (const [n, file] of files.entries()) {
    const doc = JSON.parse(fs.readFileSync(path.join(CORPUS, file), "utf-8"))
    const dq = questions.filter((q) => q.docSlug === doc.slug)
    if (!dq.length) continue
    const idx = await buildIndex(doc, descriptions)
    for (const q of dq) {
      scored.set(q.id, {
        gold: new Set(q.goldFigureIds ?? []),
        ranked: await rerankCandidates(idx, q.question, MODE),
        type: q.type ?? "",
      })
    }
    console.log(`[${n + 1}/${files.length}] ${doc.slug} (${dq.length} questions)`)
  }

  console.log(`\ngold=${path.basename(QFILE)}  questions=${scored.size}  figureText=${MODE}`)

  // Split, because ctx-mode is circular on figure_dependent questions: those were
  // WRITTEN from the figure's surrounding prose, so scoring that same prose
  // against them is guaranteed to match. Only the non-figure_dependent half
  // carries information about whether context beats description.
  for (const [label, want] of [["figure_dependent (CIRCULAR for ctx)", true], ["other questions (clean)", false]] as const) {
    const sub = [...scored.values()].filter((v) => (v.type === "figure_dependent") === want)
    if (!sub.length) continue
    for (const t of [0.05, 0.1, 0.2]) {
      let tp = 0, fp = 0, fn = 0
      for (const v of sub) {
        const picked = v.ranked.filter((c) => c.s >= t).slice(0, 2).map((c) => c.id)
        for (const p of picked) (v.gold.has(p) ? tp++ : fp++)
        for (const g of v.gold) if (!picked.includes(g)) fn++
      }
      const P = tp + fp ? tp / (tp + fp) : 0
      const R = tp + fn ? tp / (tp + fn) : 0
      const F = P + R ? (2 * P * R) / (P + R) : 0
      console.log(`  ${label.padEnd(36)} top-2 @${t}  P=${P.toFixed(3)} R=${R.toFixed(3)} F1=${F.toFixed(3)}  (n=${sub.length})`)
    }
  }

  // Fusion rules, evaluated over scores computed ONCE. The cross-encoder is the
  // most precise selector measured and the anchor has the better recall, so the
  // question is whether they compose or merely trade. Rules are deliberately
  // simple and parameter-light — with 48 human-gold items, anything with a fitted
  // weight would be fitting noise.
  type Cand = { id: string; s: number; anchored: boolean; cos: number }
  const RULES: Array<{ name: string; pick: (c: Cand[]) => string[] }> = [
    { name: "rerank only @0.01", pick: (c) => c.filter((x) => x.s >= 0.01).slice(0, MAX_FIGURES).map((x) => x.id) },
    { name: "rerank only @0.2", pick: (c) => c.filter((x) => x.s >= 0.2).slice(0, MAX_FIGURES).map((x) => x.id) },
    {
      // Union: anything the reranker likes, PLUS anchored figures it merely
      // tolerates. Tests whether the anchor rescues recall the reranker drops.
      name: "rerank@0.2 + anchored@0.001",
      pick: (c) => {
        const keep = c.filter((x) => x.s >= 0.2 || (x.anchored && x.s >= 0.001))
        return keep.slice(0, MAX_FIGURES).map((x) => x.id)
      },
    },
    {
      // Intersection: the reranker must approve AND the figure must belong to a
      // retrieved passage. Should be the most precise thing available.
      name: "rerank@0.01 AND anchored",
      pick: (c) => c.filter((x) => x.s >= 0.01 && x.anchored).slice(0, MAX_FIGURES).map((x) => x.id),
    },
    {
      // Anchor as a tiebreak only — same admission as rerank-only, but anchored
      // candidates sort first among survivors.
      name: "rerank@0.01, anchored first",
      pick: (c) =>
        c
          .filter((x) => x.s >= 0.01)
          .slice()
          .sort((a, b) => Number(b.anchored) - Number(a.anchored) || b.s - a.s)
          .slice(0, MAX_FIGURES)
          .map((x) => x.id),
    },
    // Top-k x threshold grid. The single best candidate at a low floor beat every
    // three-figure rule, which says the 2nd and 3rd picks are almost always
    // wrong: dropping them buys precision without costing the correct figure.
    ...[1, 2, 3].flatMap((k) =>
      [0.001, 0.01, 0.05, 0.1, 0.2, 0.4].map((t) => ({
        name: `top-${k} @${t}`,
        pick: (c: Cand[]) => c.filter((x) => x.s >= t).slice(0, k).map((x) => x.id),
      })),
    ),
    { name: "anchored only (no reranker)", pick: (c) => c.filter((x) => x.anchored).slice(0, MAX_FIGURES).map((x) => x.id) },
  ]

  console.log(`\n${"fusion rule".padEnd(30)} ${"P".padStart(6)} ${"R".padStart(6)} ${"F1".padStart(6)} ${"fig/q".padStart(7)} ${"silent".padStart(7)}`)
  const rows: Array<{ f: number; line: string }> = []
  for (const r of RULES) {
    let tp = 0, fp = 0, fn = 0, emitted = 0, silent = 0
    for (const [, v] of scored) {
      const picked = r.pick(v.ranked)
      emitted += picked.length
      if (!picked.length) silent++
      for (const p of picked) (v.gold.has(p) ? tp++ : fp++)
      for (const g of v.gold) if (!picked.includes(g)) fn++
    }
    const P = tp + fp ? tp / (tp + fp) : 0
    const R = tp + fn ? tp / (tp + fn) : 0
    const F = P + R ? (2 * P * R) / (P + R) : 0
    rows.push({ f: F, line: `${r.name.padEnd(30)} ${P.toFixed(3).padStart(6)} ${R.toFixed(3).padStart(6)} ${F.toFixed(3).padStart(6)} ${(emitted / scored.size).toFixed(2).padStart(7)} ${((100 * silent) / scored.size).toFixed(0).padStart(6)}%` })
  }
  for (const r of rows.sort((a, b) => b.f - a.f)) console.log(r.line)
  console.log(`\n${"threshold".padEnd(10)} ${"P".padStart(6)} ${"R".padStart(6)} ${"F1".padStart(6)} ${"fig/q".padStart(7)} ${"silent".padStart(7)}`)
  for (const t of THRESHOLDS) {
    let tp = 0
    let fp = 0
    let fn = 0
    let emitted = 0
    let silent = 0
    for (const [, v] of scored) {
      const picked = v.ranked.filter((c) => c.s >= t).slice(0, MAX_FIGURES).map((c) => c.id)
      emitted += picked.length
      if (!picked.length) silent++
      for (const p of picked) (v.gold.has(p) ? tp++ : fp++)
      for (const g of v.gold) if (!picked.includes(g)) fn++
    }
    const P = tp + fp ? tp / (tp + fp) : 0
    const R = tp + fn ? tp / (tp + fn) : 0
    const F = P + R ? (2 * P * R) / (P + R) : 0
    console.log(
      `${String(t).padEnd(10)} ${P.toFixed(3).padStart(6)} ${R.toFixed(3).padStart(6)} ${F.toFixed(3).padStart(6)} ` +
        `${(emitted / scored.size).toFixed(2).padStart(7)} ${((100 * silent) / scored.size).toFixed(0).padStart(6)}%`,
    )
  }
}

if (import.meta.main) main()
