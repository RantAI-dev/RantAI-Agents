/**
 * IKAT-Bench — score human annotations, and audit our gold standard against them.
 *
 * This closes the loop opened in 06-gold-standard-confound.md. Two questions,
 * and the second matters more than the first:
 *
 *   1. Do the systems still rank the same way under human gold?
 *   2. How far is our HARNESS gold from human judgement at all? Every selection
 *      number in the paper is scored against that harness gold, so if it
 *      disagrees badly with people, the numbers describe our construction rather
 *      than the task.
 *
 * Agreement is reported as Cohen's kappa over (item, figure) decisions, with the
 * 2x2 cells exposed. Kappa alone is movable by how often either side says yes,
 * so the cells have to be visible — the same rule already applied to the LLM
 * judge in judge.ts.
 *
 * With two or more annotator files, inter-annotator agreement is computed first.
 * That number bounds everything else: our gold cannot be shown to disagree with
 * "human judgement" by more than humans disagree with each other.
 *
 * Usage:
 *   bun tests/bench-kb/src/ikat/score-annotation.ts <answers.json...>
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { cohensKappa } from "../judge"

const BENCH_ROOT = path.resolve(import.meta.dirname, "../..")
const DIR = path.join(BENCH_ROOT, "corpus", "annotation")

interface KeyRow {
  item: number
  questionId: string
  docSlug: string
  type: string
  shownFigureIds: string[]
  harnessGold: string[]
}
interface Answer {
  item: number
  none: boolean
  picked: number[]
}

/** Flatten to one binary decision per (item, shown figure). */
function decisions(key: KeyRow[], ans: Map<number, Answer>): Map<string, number> {
  const out = new Map<string, number>()
  for (const k of key) {
    const a = ans.get(k.item)
    k.shownFigureIds.forEach((fid, j) => {
      const chosen = !a || a.none ? 0 : a.picked.includes(j) ? 1 : 0
      out.set(`${k.item}::${fid}`, chosen)
    })
  }
  return out
}

function main() {
  const files = process.argv.slice(2)
  if (!files.length) {
    console.error("usage: score-annotation.ts <answers.json...>")
    process.exit(1)
  }
  const key = JSON.parse(fs.readFileSync(path.join(DIR, "annotation.KEY.json"), "utf-8")) as KeyRow[]
  const annotators = files.map((f) => {
    const rows = JSON.parse(fs.readFileSync(f, "utf-8")) as Answer[]
    return { name: path.basename(f), dec: decisions(key, new Map(rows.map((r) => [r.item, r]))) }
  })

  console.log(`\n=== human annotation — ${key.length} items, ${annotators.length} annotator(s) ===`)

  if (annotators.length >= 2) {
    console.log(`\ninter-annotator agreement (bounds every comparison below):`)
    for (let i = 0; i < annotators.length; i++)
      for (let j = i + 1; j < annotators.length; j++) {
        const keys = [...annotators[i].dec.keys()]
        const r = cohensKappa(
          keys.map((k) => annotators[i].dec.get(k)!),
          keys.map((k) => annotators[j].dec.get(k)!),
        )
        console.log(
          `  ${annotators[i].name} vs ${annotators[j].name}: kappa=${r.kappa === null ? "n/a" : r.kappa.toFixed(3)}` +
            `  cells 11=${r.n11} 10=${r.n10} 01=${r.n01} 00=${r.n00}`,
        )
      }
  } else {
    console.log(`\n[warn] a single annotator gives no agreement bound. Any disagreement`)
    console.log(`       with our gold below could be this person's idiosyncrasy rather`)
    console.log(`       than a fault in the gold. Treat as indicative only.`)
  }

  // Majority vote across annotators, ties resolved toward NOT showing — the same
  // asymmetry the product needs, where a wrong figure costs more than a missing
  // one.
  const human = new Map<string, number>()
  for (const k of annotators[0].dec.keys()) {
    const votes = annotators.map((a) => a.dec.get(k) ?? 0).reduce((x, y) => x + y, 0)
    human.set(k, votes * 2 > annotators.length ? 1 : 0)
  }

  const harness = new Map<string, number>()
  for (const k of key) {
    const g = new Set(k.harnessGold)
    k.shownFigureIds.forEach((fid) => harness.set(`${k.item}::${fid}`, g.has(fid) ? 1 : 0))
  }

  const ks = [...human.keys()]
  const agr = cohensKappa(ks.map((k) => harness.get(k) ?? 0), ks.map((k) => human.get(k)!))
  console.log(`\nHARNESS gold vs HUMAN gold:`)
  console.log(
    `  kappa=${agr.kappa === null ? "n/a" : agr.kappa.toFixed(3)}  n=${agr.n}` +
      `  both-yes=${agr.n11}  harness-only=${agr.n10}  human-only=${agr.n01}  both-no=${agr.n00}`,
  )
  console.log(`  harness says yes ${agr.n11 + agr.n10} times; humans say yes ${agr.n11 + agr.n01} times`)

  // Split the same way the confound doc does — the whole point is that the two
  // halves of our gold were built differently and may diverge from people by
  // different amounts.
  for (const kind of ["figure_dependent", "other"]) {
    const sub = key.filter((k) => (kind === "figure_dependent" ? k.type === "figure_dependent" : k.type !== "figure_dependent"))
    const sk = sub.flatMap((k) => k.shownFigureIds.map((f) => `${k.item}::${f}`))
    if (!sk.length) continue
    const r = cohensKappa(sk.map((k) => harness.get(k) ?? 0), sk.map((k) => human.get(k) ?? 0))
    console.log(
      `  ${kind === "figure_dependent" ? "clean gold        " : "anchor-derived gold"}: kappa=${r.kappa === null ? "n/a" : r.kappa.toFixed(3)}` +
        `  n=${r.n}  harness-only=${r.n10}  human-only=${r.n01}`,
    )
  }

  const noneItems = key.filter((k) => {
    const picks = k.shownFigureIds.filter((f) => human.get(`${k.item}::${f}`) === 1)
    return picks.length === 0
  }).length
  console.log(`\nitems where humans chose NO figure: ${noneItems}/${key.length}`)
  console.log(`items where the harness has no gold: ${key.filter((k) => !k.harnessGold.length).length}/${key.length}`)

  fs.writeFileSync(
    path.join(DIR, "human-gold.json"),
    JSON.stringify(
      key.map((k) => ({
        questionId: k.questionId,
        type: k.type,
        humanGold: k.shownFigureIds.filter((f) => human.get(`${k.item}::${f}`) === 1),
        harnessGold: k.harnessGold,
      })),
      null,
      2,
    ),
  )
  console.log(`\nwrote ${path.join(DIR, "human-gold.json")} — usable as a gold standard for select-eval`)
}

if (import.meta.main) main()
