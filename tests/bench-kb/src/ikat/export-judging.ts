/**
 * IKAT-Bench — export blinded judging batches.
 *
 * The judge here is a sub-agent rather than an API call, which removes the cost
 * blocker on the judged measures. It does not remove the need for the controls,
 * so this exporter enforces them at the point where the data leaves the harness:
 *
 *   - BLINDING. System identities are stripped and replaced with A/B/C… under a
 *     seeded permutation that differs per item. The key is written to a separate
 *     file the judge never sees.
 *   - NO LEAKAGE. Nothing in the exported text names a system, a mechanism, or
 *     which answer came from the authors' method.
 *   - FIXED ITEM ORDER. Items are emitted in a deterministic order so a rerun
 *     produces a comparable batch.
 *
 * Two batch types:
 *   quality   — answer completeness / faithfulness / helpfulness against the
 *               textbook reference. Restricted to figure-dependent questions
 *               when --fig-dep is passed, which is what claim C1 needs.
 *   placement — forced choice of the best insertion slot for a figure, used to
 *               test whether layout-gold agrees with a competent reader.
 *
 * Usage:
 *   bun tests/bench-kb/src/ikat/export-judging.ts <run> quality [--fig-dep] [--limit N]
 *   bun tests/bench-kb/src/ikat/export-judging.ts <run> placement [--limit N]
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { shuffle } from "../judge"

const BENCH_ROOT = path.resolve(import.meta.dirname, "../..")
const RESULTS_DIR = path.join(BENCH_ROOT, "corpus", "results")
const OUT_DIR = path.join(BENCH_ROOT, "corpus", "judging")

interface RawEntry {
  q: { id: string; type: string; question: string; goldAnswer: string; docSlug: string; goldFigureIds: string[] }
  system: string
  out: { answer: string; sentences: string[]; figures: Array<{ figureId: string; slot: number }> }
}

interface ScoredEntry {
  questionId: string
  system: string
  figures: Array<{ figureId: string; predictedSlot: number; idealSlot: number }>
}

function main() {
  const [run, kind] = process.argv.slice(2)
  const args = process.argv.slice(2)
  const figDepOnly = args.includes("--fig-dep")
  const li = args.indexOf("--limit")
  const limit = li >= 0 ? parseInt(args[li + 1], 10) : 60
  const seed = 20260807

  if (!run || !kind) {
    console.error("usage: export-judging.ts <run> quality|placement [--fig-dep] [--limit N]")
    process.exit(1)
  }
  const raw = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, `results-${run}.json`), "utf-8")) as {
    raw: RawEntry[]
    scored: ScoredEntry[]
  }
  fs.mkdirSync(OUT_DIR, { recursive: true })

  if (kind === "quality") {
    // Group by question so every system's answer to the same question is judged
    // side by side — a within-question comparison is far more informative than
    // scoring answers in isolation, and it is where blinding matters most.
    const byQ = new Map<string, RawEntry[]>()
    for (const r of raw.raw) {
      if (figDepOnly && r.q.type !== "figure_dependent") continue
      if (!r.out.answer?.trim()) continue
      const arr = byQ.get(r.q.id) ?? []
      arr.push(r)
      byQ.set(r.q.id, arr)
    }

    const items: unknown[] = []
    const key: unknown[] = []
    const qids = Array.from(byQ.keys()).sort().slice(0, limit)
    for (const [qi, qid] of qids.entries()) {
      const entries = shuffle(byQ.get(qid)!, seed + qi)
      const labels = entries.map((_, i) => String.fromCharCode(65 + i))
      items.push({
        item: qi + 1,
        question: entries[0].q.question,
        reference: entries[0].q.goldAnswer,
        answers: entries.map((e, i) => ({ label: labels[i], text: e.out.answer })),
      })
      key.push({ item: qi + 1, questionId: qid, mapping: entries.map((e, i) => ({ label: labels[i], system: e.system })) })
    }
    fs.writeFileSync(path.join(OUT_DIR, `${run}-quality${figDepOnly ? "-figdep" : ""}.json`), JSON.stringify(items, null, 2))
    fs.writeFileSync(path.join(OUT_DIR, `${run}-quality${figDepOnly ? "-figdep" : ""}.KEY.json`), JSON.stringify(key, null, 2))
    console.log(`[ikat] quality batch: ${items.length} items, ${qids.length} questions, blinded key written separately`)
    return
  }

  if (kind === "placement") {
    // The judge must know what the figure SHOWS to place it. We give it the
    // ingest-time VLM description — never the figure's source context, which is
    // what defines ideal() in the metric and would make the judgement circular.
    const DESC_DIR = path.join(BENCH_ROOT, "corpus", "descriptions")
    const desc = new Map<string, string>()
    if (fs.existsSync(DESC_DIR)) {
      for (const f of fs.readdirSync(DESC_DIR).filter((x) => x.endsWith(".json"))) {
        const m = JSON.parse(fs.readFileSync(path.join(DESC_DIR, f), "utf-8")) as Record<string, string>
        for (const [k, v] of Object.entries(m)) desc.set(k, v)
      }
    }

    // One item per emitted figure with a scoreable gold slot. The judge picks a
    // slot; layout-gold is withheld so the choice is independent of it.
    const idealOf = new Map<string, number>()
    for (const s of raw.scored) {
      for (const f of s.figures) idealOf.set(`${s.questionId}::${s.system}::${f.figureId}`, f.idealSlot)
    }

    const items: unknown[] = []
    const key: unknown[] = []
    let n = 0
    for (const r of raw.raw) {
      if (n >= limit) break
      for (const f of r.out.figures) {
        if (n >= limit) break
        const ideal = idealOf.get(`${r.q.id}::${r.system}::${f.figureId}`)
        if (ideal === undefined || ideal < 0) continue
        if (!r.out.sentences.length) continue
        const d = desc.get(f.figureId)
        // No description means the judge would be placing an unknown picture.
        // Skipping is honest; guessing on an id string is not.
        if (!d) continue
        n++
        items.push({
          item: n,
          question: r.q.question,
          answerSentences: r.out.sentences,
          figureDescription: d,
        })
        key.push({ item: n, questionId: r.q.id, system: r.system, figureId: f.figureId, layoutGoldSlot: ideal, systemSlot: f.slot })
      }
    }
    fs.writeFileSync(path.join(OUT_DIR, `${run}-placement.json`), JSON.stringify(items, null, 2))
    fs.writeFileSync(path.join(OUT_DIR, `${run}-placement.KEY.json`), JSON.stringify(key, null, 2))
    console.log(`[ikat] placement batch: ${items.length} items; layout-gold withheld from the judge file`)
    return
  }

  console.error(`unknown batch kind: ${kind}`)
  process.exit(1)
}

if (import.meta.main) main()
