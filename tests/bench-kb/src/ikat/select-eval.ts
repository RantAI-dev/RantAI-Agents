/**
 * IKAT-Bench — evaluate figure SELECTION on its own, without generation.
 *
 * Selection is decided before a single token is generated, so it can be measured
 * with an embedding pass instead of a full bench run: four systems over 486
 * questions is ~16 GPU-hours through run-bench.ts and minutes through this. It
 * also removes generator variance from the comparison entirely, which makes it
 * the cleaner instrument for a selection question, not merely the cheaper one.
 *
 * Reported per system:
 *   P / R / F1  — micro, over (question, figure) pairs
 *   emitted     — figures shown per question; the over-emission we are fighting
 *   silent      — share of questions where the system showed nothing. For a
 *                 gated system this is a feature, so it is reported next to
 *                 precision rather than buried.
 *   waste       — figures emitted on questions that have no gold figure at all.
 *                 Every one of these is guaranteed wrong.
 *
 * Usage:
 *   IKAT_CORPUS=ugm3-built bun tests/bench-kb/src/ikat/select-eval.ts \
 *     anchor anchor_mramg_place sel_wide sel_ranked sel_gated
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { buildIndex, selectOnly, type SystemId } from "./systems"

const BENCH_ROOT = path.resolve(import.meta.dirname, "../..")
const CORPUS = path.join(BENCH_ROOT, "corpus", process.env.IKAT_CORPUS ?? "ugm3-built")
const QFILE = path.join(BENCH_ROOT, "corpus", process.env.IKAT_QUESTIONS ?? "questions-ugm-large.json")
const DESC_DIR = path.join(BENCH_ROOT, "corpus", process.env.IKAT_DESCRIPTIONS ?? "descriptions")
const MAX_FIGURES = Number(process.env.IKAT_MAX_FIGURES ?? 3)

interface Q {
  id: string
  question: string
  docSlug: string
  goldFigureIds: string[]
}

interface Acc {
  tp: number
  fp: number
  fn: number
  emitted: number
  questions: number
  silent: number
  waste: number
}

const blank = (): Acc => ({ tp: 0, fp: 0, fn: 0, emitted: 0, questions: 0, silent: 0, waste: 0 })

async function main() {
  const systems = process.argv.slice(2) as SystemId[]
  if (!systems.length) {
    console.error("usage: select-eval.ts <system...>")
    process.exit(1)
  }

  const questions = JSON.parse(fs.readFileSync(QFILE, "utf-8")) as Q[]
  const descriptions = new Map<string, string>()
  if (fs.existsSync(DESC_DIR)) {
    for (const f of fs.readdirSync(DESC_DIR).filter((x) => x.endsWith(".json"))) {
      for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(path.join(DESC_DIR, f), "utf-8")) as Record<string, string>)) {
        descriptions.set(k, v)
      }
    }
  }

  const acc = new Map<SystemId, Acc>(systems.map((s) => [s, blank()]))
  // Per-question outcomes, so the comparison can be tested rather than eyeballed.
  // Aggregates alone cannot support a claim that one selector beats another: the
  // systems see the same questions, so the test has to be paired, and paired
  // tests need the pairs. Claims have already been retracted here for want of
  // exactly this.
  const perQuestion: Array<Record<string, unknown>> = []
  const files = fs.readdirSync(CORPUS).filter((f) => f.endsWith(".json"))
  console.log(`corpus=${path.basename(CORPUS)} docs=${files.length} questions=${questions.length} maxFigures=${MAX_FIGURES}`)
  console.log(`descriptions cached: ${descriptions.size}\n`)

  for (const [n, file] of files.entries()) {
    const doc = JSON.parse(fs.readFileSync(path.join(CORPUS, file), "utf-8"))
    const dq = questions.filter((q) => q.docSlug === doc.slug)
    if (!dq.length) continue
    const idx = await buildIndex(doc, descriptions)
    for (const q of dq) {
      const gold = new Set(q.goldFigureIds ?? [])
      const row: Record<string, unknown> = { questionId: q.id, gold: [...gold] }
      for (const s of systems) {
        const emitted = new Set(await selectOnly(s, idx, q.question, MAX_FIGURES))
        const a = acc.get(s)!
        a.questions++
        a.emitted += emitted.size
        if (!emitted.size) a.silent++
        if (!gold.size) a.waste += emitted.size
        for (const e of emitted) (gold.has(e) ? a.tp++ : a.fp++)
        for (const g of gold) if (!emitted.has(g)) a.fn++
        row[s] = [...emitted]
      }
      perQuestion.push(row)
    }
    console.log(`[${n + 1}/${files.length}] ${doc.slug} (${dq.length} questions)`)
  }

  console.log(`\n${"system".padEnd(22)} ${"P".padStart(6)} ${"R".padStart(6)} ${"F1".padStart(6)}  ${"fig/q".padStart(6)} ${"silent".padStart(7)} ${"waste".padStart(6)}`)
  const rows: Array<{ s: string; f1: number; line: string }> = []
  for (const s of systems) {
    const a = acc.get(s)!
    const P = a.tp + a.fp ? a.tp / (a.tp + a.fp) : 0
    const R = a.tp + a.fn ? a.tp / (a.tp + a.fn) : 0
    const F = P + R ? (2 * P * R) / (P + R) : 0
    rows.push({
      s,
      f1: F,
      line:
        `${s.padEnd(22)} ${P.toFixed(3).padStart(6)} ${R.toFixed(3).padStart(6)} ${F.toFixed(3).padStart(6)}  ` +
        `${(a.emitted / a.questions).toFixed(2).padStart(6)} ${((100 * a.silent) / a.questions).toFixed(0).padStart(6)}% ${String(a.waste).padStart(6)}`,
    })
  }
  for (const r of rows.sort((x, y) => y.f1 - x.f1)) console.log(r.line)

  const out = path.join(BENCH_ROOT, "corpus", "results", `select-eval-${path.basename(CORPUS)}.json`)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, JSON.stringify({ totals: Object.fromEntries(acc), perQuestion }, null, 2))
  console.log(`\nwrote ${out}`)
}

if (import.meta.main) main()
