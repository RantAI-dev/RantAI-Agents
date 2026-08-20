/**
 * IKAT-Bench — paired significance tests for the PLACEMENT ablation.
 *
 * The v9 ablation holds figure SELECTION constant across all three systems and
 * varies only the placement rule. That is what makes it the clean test: any
 * difference in placement quality cannot be explained by one system retrieving
 * better figures, because they all retrieve exactly the same ones.
 *
 * Because the systems are evaluated on the SAME figures, the comparison must be
 * paired. An unpaired test throws away the pairing and understates significance;
 * worse, it lets a handful of items masquerade as a result. Two instruments:
 *
 *   PA@1  — binary per figure (predicted slot == layout-gold slot). Discordant
 *           pairs only carry information, so McNemar's exact test applies.
 *   |PD|  — displacement in sentences, continuous. Paired bootstrap over
 *           figures, 10k resamples, on the mean difference.
 *
 * Figures whose gold slot is unscoreable (idealSlot < 0) are excluded, matching
 * the vacuity rule in placement-metrics: a missing gold is not a zero.
 *
 * Usage:
 *   bun tests/bench-kb/src/ikat/placement-significance.ts <run>
 */
import * as fs from "node:fs"
import * as path from "node:path"

const BENCH_ROOT = path.resolve(import.meta.dirname, "../..")

interface Fig {
  figureId: string
  predictedSlot: number
  idealSlot: number
}
interface Scored {
  questionId: string
  system: string
  figures: Fig[]
}

/** Two-sided exact McNemar over the discordant cells. */
function mcnemarExact(n01: number, n10: number) {
  const n = n01 + n10
  if (n === 0) return { n01, n10, n, p: 1 }
  const lo = Math.min(n01, n10)
  // Sum the binomial tail exactly; n is small enough that comb() is safe in f64
  // for the sizes this benchmark produces.
  let comb = 1
  let tail = 0
  for (let k = 0; k <= lo; k++) {
    if (k > 0) comb = (comb * (n - k + 1)) / k
    tail += comb
  }
  const p = Math.min(1, (tail / Math.pow(2, n)) * 2)
  return { n01, n10, n, p }
}

/** mulberry32 — seeded so a rerun reproduces the same intervals. */
function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Paired bootstrap on the mean of per-item differences. */
function pairedBootstrap(diffs: number[], resamples = 10000, seed = 20260809) {
  const n = diffs.length
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  const obs = mean(diffs)
  const r = rng(seed)
  const means: number[] = []
  for (let b = 0; b < resamples; b++) {
    let s = 0
    for (let i = 0; i < n; i++) s += diffs[(r() * n) | 0]
    means.push(s / n)
  }
  means.sort((a, b) => a - b)
  // Two-sided p: how often does a resample land on the other side of zero?
  const crossings = means.filter((m) => (obs > 0 ? m <= 0 : m >= 0)).length
  return {
    mean: obs,
    ci: [means[Math.floor(resamples * 0.025)], means[Math.floor(resamples * 0.975)]] as [number, number],
    p: Math.min(1, (2 * crossings) / resamples),
  }
}

function main() {
  const run = process.argv[2]
  if (!run) {
    console.error("usage: placement-significance.ts <run>")
    process.exit(1)
  }
  const file = path.join(BENCH_ROOT, "corpus", "results", `results-${run}.json`)
  const { scored } = JSON.parse(fs.readFileSync(file, "utf-8")) as { scored: Scored[] }

  // key = questionId::figureId, so the same physical figure is compared across
  // systems rather than merely the same question.
  const bySys = new Map<string, Map<string, Fig>>()
  for (const s of scored) {
    const m = bySys.get(s.system) ?? new Map<string, Fig>()
    for (const f of s.figures) {
      if (f.idealSlot < 0) continue
      m.set(`${s.questionId}::${f.figureId}`, f)
    }
    bySys.set(s.system, m)
  }

  const systems = [...bySys.keys()].sort()
  console.log(`\n=== placement significance — ${run} ===`)
  for (const s of systems) console.log(`  ${s.padEnd(22)} scoreable figures: ${bySys.get(s)!.size}`)

  for (let i = 0; i < systems.length; i++) {
    for (let j = i + 1; j < systems.length; j++) {
      const A = bySys.get(systems[i])!
      const B = bySys.get(systems[j])!
      const keys = [...A.keys()].filter((k) => B.has(k))

      let n01 = 0
      let n10 = 0
      const pdDiff: number[] = []
      for (const k of keys) {
        const a = A.get(k)!
        const b = B.get(k)!
        const hitA = a.predictedSlot === a.idealSlot ? 1 : 0
        const hitB = b.predictedSlot === b.idealSlot ? 1 : 0
        if (hitA === 0 && hitB === 1) n01++
        if (hitA === 1 && hitB === 0) n10++
        // positive = B is closer to gold than A, i.e. B is better
        pdDiff.push(Math.abs(a.predictedSlot - a.idealSlot) - Math.abs(b.predictedSlot - b.idealSlot))
      }

      const mc = mcnemarExact(n01, n10)
      const bs = pairedBootstrap(pdDiff)
      const paA = [...keys].filter((k) => A.get(k)!.predictedSlot === A.get(k)!.idealSlot).length / keys.length
      const paB = [...keys].filter((k) => B.get(k)!.predictedSlot === B.get(k)!.idealSlot).length / keys.length

      console.log(`\n--- ${systems[i]}  vs  ${systems[j]}   (paired n=${keys.length})`)
      console.log(`  PA@1:  ${paA.toFixed(3)} -> ${paB.toFixed(3)}`)
      console.log(
        `  McNemar exact: n01=${mc.n01} n10=${mc.n10} discordant=${mc.n}  p=${mc.p.toExponential(2)}` +
          `  ${mc.p < 0.05 ? "SIGNIFICANT" : "not significant"}`,
      )
      console.log(
        `  |PD| mean diff (positive = ${systems[j]} closer to gold): ${bs.mean.toFixed(3)}` +
          `  95% CI [${bs.ci[0].toFixed(3)}, ${bs.ci[1].toFixed(3)}]  p=${bs.p.toExponential(2)}` +
          `  ${bs.p < 0.05 ? "SIGNIFICANT" : "not significant"}`,
      )
    }
  }
  console.log()
}

if (import.meta.main) main()
