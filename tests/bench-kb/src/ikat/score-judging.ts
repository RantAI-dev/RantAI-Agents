/**
 * IKAT-Bench — score judge verdicts against the withheld key.
 *
 * The judge never saw the key: for placement it never saw layout-gold, and for
 * quality it never saw which system produced which answer. This joins the two
 * back together and computes the numbers that go in the paper.
 *
 * Two outputs:
 *
 *   placement — agreement between the judge's chosen slot and layout-gold. This
 *     is the study that licenses the metric. It is reported whatever it says: a
 *     weak correlation is a finding about layout-gold, not a reason to re-run.
 *     Also reports inter-judge agreement across independent judges, which bounds
 *     how much of any disagreement with layout-gold is just judge noise.
 *
 *   quality — per-system means on the figure-dependent split. This is claim C1:
 *     whether systems that can see the figure answer better than ones that
 *     cannot.
 *
 * Usage:
 *   bun tests/bench-kb/src/ikat/score-judging.ts placement <run> <verdicts.json...>
 *   bun tests/bench-kb/src/ikat/score-judging.ts quality   <run> <verdicts.json>
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { pearson } from "../placement-metrics"

const BENCH_ROOT = path.resolve(import.meta.dirname, "../..")
const JUDGE_DIR = path.join(BENCH_ROOT, "corpus", "judging")

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN)

function scorePlacement(run: string, verdictFiles: string[]) {
  const key = JSON.parse(
    fs.readFileSync(path.join(JUDGE_DIR, `${run}-placement.KEY.json`), "utf-8"),
  ) as Array<{ item: number; system: string; layoutGoldSlot: number; systemSlot: number }>
  const byItem = new Map(key.map((k) => [k.item, k]))

  const judges = verdictFiles.map(
    (f) => JSON.parse(fs.readFileSync(f, "utf-8")) as Array<{ item: number; slot: number }>,
  )

  console.log(`\n=== placement validity — ${run} ===`)
  console.log(`judges: ${judges.length}, items: ${byItem.size}\n`)

  const perJudge: Array<Map<number, number>> = judges.map((v) => new Map(v.map((x) => [x.item, x.slot])))

  for (const [i, jm] of perJudge.entries()) {
    const judgeSlots: number[] = []
    const goldSlots: number[] = []
    for (const [item, k] of byItem) {
      const s = jm.get(item)
      // -1 means the judge rejected the figure outright; it is not a position,
      // so it cannot enter a correlation over positions.
      if (s === undefined || s < 0) continue
      judgeSlots.push(s)
      goldSlots.push(k.layoutGoldSlot)
    }
    const n = judgeSlots.length
    const exact = judgeSlots.filter((s, x) => s === goldSlots[x]).length / n
    const within1 = judgeSlots.filter((s, x) => Math.abs(s - goldSlots[x]) <= 1).length / n
    const r = pearson(judgeSlots, goldSlots)
    console.log(
      `judge ${i + 1}: n=${n}  r=${r === null ? "n/a" : r.toFixed(3)}  ` +
        `exact=${exact.toFixed(3)}  within-1=${within1.toFixed(3)}  ` +
        `rejected=${byItem.size - n}`,
    )
  }

  // Inter-judge agreement bounds how much disagreement with layout-gold is
  // attributable to the judge rather than to the metric.
  if (perJudge.length >= 2) {
    for (let a = 0; a < perJudge.length; a++) {
      for (let b = a + 1; b < perJudge.length; b++) {
        const xs: number[] = []
        const ys: number[] = []
        for (const item of byItem.keys()) {
          const s1 = perJudge[a].get(item)
          const s2 = perJudge[b].get(item)
          if (s1 === undefined || s2 === undefined || s1 < 0 || s2 < 0) continue
          xs.push(s1)
          ys.push(s2)
        }
        const exact = xs.filter((x, i) => x === ys[i]).length / xs.length
        const within1 = xs.filter((x, i) => Math.abs(x - ys[i]) <= 1).length / xs.length
        const r = pearson(xs, ys)
        console.log(
          `\ninter-judge ${a + 1}v${b + 1}: n=${xs.length}  r=${r === null ? "n/a" : r.toFixed(3)}  ` +
            `exact=${exact.toFixed(3)}  within-1=${within1.toFixed(3)}`,
        )
      }
    }
  }

  // How well does each SYSTEM's own placement match the judge, as a sanity
  // cross-check on the harness rather than on the metric?
  console.log(`\nsystem placement vs judge (majority of judges):`)
  const bySys = new Map<string, { d: number[] }>()
  for (const [item, k] of byItem) {
    const slots = perJudge.map((m) => m.get(item)).filter((s): s is number => s !== undefined && s >= 0)
    if (!slots.length) continue
    slots.sort((x, y) => x - y)
    const med = slots[Math.floor(slots.length / 2)]
    const e = bySys.get(k.system) ?? { d: [] }
    e.d.push(Math.abs(k.systemSlot - med))
    bySys.set(k.system, e)
  }
  for (const [sys, e] of [...bySys.entries()].sort((a, b) => mean(a[1].d) - mean(b[1].d))) {
    console.log(`  ${sys.padEnd(20)} n=${String(e.d.length).padStart(3)}  mean |slot − judge| = ${mean(e.d).toFixed(2)}`)
  }
}

function scoreQuality(run: string, verdictFile: string) {
  const key = JSON.parse(
    fs.readFileSync(path.join(JUDGE_DIR, `${run}-quality-figdep.KEY.json`), "utf-8"),
  ) as Array<{ item: number; mapping: Array<{ label: string; system: string }> }>
  const byItem = new Map(key.map((k) => [k.item, new Map(k.mapping.map((m) => [m.label, m.system]))]))

  const verdicts = JSON.parse(fs.readFileSync(verdictFile, "utf-8")) as Array<{
    item: number
    scores: Array<{ label: string; completeness: number; faithfulness: number; helpfulness: number }>
  }>

  const acc = new Map<string, { c: number[]; f: number[]; h: number[] }>()
  let unmatched = 0
  for (const v of verdicts) {
    const map = byItem.get(v.item)
    if (!map) {
      unmatched++
      continue
    }
    for (const s of v.scores ?? []) {
      const sys = map.get(s.label)
      if (!sys) {
        unmatched++
        continue
      }
      const e = acc.get(sys) ?? { c: [], f: [], h: [] }
      e.c.push(s.completeness)
      e.f.push(s.faithfulness)
      e.h.push(s.helpfulness)
      acc.set(sys, e)
    }
  }

  console.log(`\n=== answer quality on figure-dependent questions — ${run} ===`)
  console.log(`(these questions are answerable ONLY from the figure)\n`)
  console.log(`${"system".padEnd(20)} ${"n".padStart(4)}  complete  faithful  helpful`)
  for (const [sys, e] of [...acc.entries()].sort((a, b) => mean(b[1].c) - mean(a[1].c))) {
    console.log(
      `${sys.padEnd(20)} ${String(e.c.length).padStart(4)}  ` +
        `${mean(e.c).toFixed(2).padStart(8)}  ${mean(e.f).toFixed(2).padStart(8)}  ${mean(e.h).toFixed(2).padStart(7)}`,
    )
  }
  if (unmatched) console.log(`\n[warn] ${unmatched} verdict rows could not be matched to the key`)
}

function main() {
  const [kind, run, ...files] = process.argv.slice(2)
  if (!kind || !run || !files.length) {
    console.error("usage: score-judging.ts placement|quality <run> <verdicts.json...>")
    process.exit(1)
  }
  if (kind === "placement") scorePlacement(run, files)
  else if (kind === "quality") scoreQuality(run, files[0])
  else {
    console.error(`unknown kind: ${kind}`)
    process.exit(1)
  }
}

if (import.meta.main) main()
