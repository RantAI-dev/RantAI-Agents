/**
 * IKAT-Bench — paired significance tests for figure SELECTION.
 *
 * Selectors are evaluated on the same questions, so the comparison is paired and
 * an unpaired test of two F1 numbers would both throw away that pairing and let
 * a handful of questions look like a result. Two instruments, because selection
 * has two failure modes that move in opposite directions:
 *
 *   hit@q   — did the system emit at least one correct figure for this question?
 *             Binary and paired -> McNemar exact. This is the recall-ish view.
 *   prec@q  — share of this question's emitted figures that were correct.
 *             Continuous -> paired bootstrap on the mean difference. Questions
 *             where a system emitted nothing are excluded from ITS precision, in
 *             the same spirit as the vacuity rule in placement-metrics: silence
 *             is not a wrong answer, and scoring it as zero would punish exactly
 *             the abstention we want.
 *
 * Silence is therefore reported separately rather than folded into a score. A
 * selector that abstains often can be excellent on what it does emit, and that
 * trade is a product decision — the numbers should show it, not hide it.
 *
 * Usage:
 *   bun tests/bench-kb/src/ikat/selection-significance.ts <select-eval json>
 */
import * as fs from "node:fs"

interface Row {
  questionId: string
  gold: string[]
  [system: string]: unknown
}

function mcnemarExact(n01: number, n10: number) {
  const n = n01 + n10
  if (n === 0) return { n01, n10, n, p: 1 }
  const lo = Math.min(n01, n10)
  let comb = 1
  let tail = 0
  for (let k = 0; k <= lo; k++) {
    if (k > 0) comb = (comb * (n - k + 1)) / k
    tail += comb
  }
  return { n01, n10, n, p: Math.min(1, (tail / Math.pow(2, n)) * 2) }
}

function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pairedBootstrap(diffs: number[], resamples = 10000, seed = 20260809) {
  if (!diffs.length) return { mean: NaN, ci: [NaN, NaN] as [number, number], p: 1 }
  const n = diffs.length
  const obs = diffs.reduce((a, b) => a + b, 0) / n
  const r = rng(seed)
  const means: number[] = []
  for (let b = 0; b < resamples; b++) {
    let s = 0
    for (let i = 0; i < n; i++) s += diffs[(r() * n) | 0]
    means.push(s / n)
  }
  means.sort((a, b) => a - b)
  const crossings = means.filter((m) => (obs > 0 ? m <= 0 : m >= 0)).length
  return {
    mean: obs,
    ci: [means[Math.floor(resamples * 0.025)], means[Math.floor(resamples * 0.975)]] as [number, number],
    p: Math.min(1, (2 * crossings) / resamples),
  }
}

function main() {
  const file = process.argv[2]
  if (!file) {
    console.error("usage: selection-significance.ts <select-eval json>")
    process.exit(1)
  }
  const data = JSON.parse(fs.readFileSync(file, "utf-8")) as { perQuestion: Row[] }
  const rows = data.perQuestion
  if (!rows?.length) {
    console.error("no perQuestion data — rerun select-eval.ts with the current version")
    process.exit(1)
  }
  const systems = Object.keys(rows[0]).filter((k) => k !== "questionId" && k !== "gold")

  console.log(`\n=== selection significance — ${rows.length} questions ===\n`)
  console.log(`${"system".padEnd(22)} ${"hit@q".padStart(7)} ${"prec@q".padStart(7)} ${"silent".padStart(7)}`)
  const hit = new Map<string, number[]>()
  const prec = new Map<string, Array<number | null>>()
  for (const s of systems) {
    const h: number[] = []
    const p: Array<number | null> = []
    for (const r of rows) {
      const gold = new Set(r.gold)
      const em = (r[s] as string[]) ?? []
      h.push(gold.size && em.some((e) => gold.has(e)) ? 1 : 0)
      p.push(em.length ? em.filter((e) => gold.has(e)).length / em.length : null)
    }
    hit.set(s, h)
    prec.set(s, p)
    const scored = p.filter((x): x is number => x !== null)
    console.log(
      `${s.padEnd(22)} ${(h.reduce((a, b) => a + b, 0) / h.length).toFixed(3).padStart(7)} ` +
        `${(scored.reduce((a, b) => a + b, 0) / (scored.length || 1)).toFixed(3).padStart(7)} ` +
        `${((100 * (p.length - scored.length)) / p.length).toFixed(0).padStart(6)}%`,
    )
  }

  for (let i = 0; i < systems.length; i++) {
    for (let j = i + 1; j < systems.length; j++) {
      const A = systems[i]
      const B = systems[j]
      const ha = hit.get(A)!
      const hb = hit.get(B)!
      let n01 = 0
      let n10 = 0
      for (let k = 0; k < ha.length; k++) {
        if (!ha[k] && hb[k]) n01++
        if (ha[k] && !hb[k]) n10++
      }
      const mc = mcnemarExact(n01, n10)

      // Precision is compared only on questions where BOTH emitted something;
      // otherwise the difference is about willingness to speak, not accuracy,
      // and that is already reported as `silent`.
      const pa = prec.get(A)!
      const pb = prec.get(B)!
      const diffs: number[] = []
      for (let k = 0; k < pa.length; k++) if (pa[k] !== null && pb[k] !== null) diffs.push(pb[k]! - pa[k]!)
      const bs = pairedBootstrap(diffs)

      console.log(`\n--- ${A}  vs  ${B}`)
      console.log(
        `  hit@q  McNemar exact: n01=${mc.n01} n10=${mc.n10} discordant=${mc.n}  p=${mc.p.toExponential(2)}` +
          `  ${mc.p < 0.05 ? "SIGNIFICANT" : "not significant"}`,
      )
      console.log(
        `  prec@q (both spoke, n=${diffs.length}) mean diff ${bs.mean.toFixed(3)}` +
          `  95% CI [${bs.ci[0].toFixed(3)}, ${bs.ci[1].toFixed(3)}]  p=${bs.p.toExponential(2)}` +
          `  ${bs.p < 0.05 ? "SIGNIFICANT" : "not significant"}`,
      )
    }
  }
  console.log()
}

if (import.meta.main) main()
