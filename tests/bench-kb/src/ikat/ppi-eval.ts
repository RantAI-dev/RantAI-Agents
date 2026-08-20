/**
 * IKAT-Bench — prediction-powered estimates of figure selection.
 *
 * The problem this exists to solve: our strongest selection claim rests on 48
 * human-annotated items, and a reviewer is right to say that is thin. Annotating
 * more is the honest fix and remains outstanding. This is the other half — a way
 * to spend a large pile of judge labels WITHOUT letting the judge's bias into
 * the number.
 *
 * ── Why not just score against the judge ──────────────────────────────────
 * Because we measured what that costs. A model-built gold inflates a pipeline
 * containing a model by roughly 1.9x (0.521 against 0.283 on the same system),
 * and our pre-existing harness gold agrees with a person at chance (kappa 0.092).
 * A bigger pile of judge labels is a bigger pile of that bias.
 *
 * ── What a rectified estimator does instead ───────────────────────────────
 * Following the prediction-powered inference idea (Angelopoulos et al.; used for
 * RAG evaluation by ARES, NAACL 2024), the judge is treated as a cheap, biased
 * instrument whose bias is MEASURED on the human-labelled subset and subtracted:
 *
 *     theta_ppi = theta(judge, all items) - [ theta(judge, L) - theta(human, L) ]
 *                 \_______ cheap _______/   \______ the correction ________/
 *
 * The bracket is the judge's bias, estimated where both labels exist. What makes
 * this worth doing rather than merely clever: if the judge is useless, the
 * correction cancels the cheap term and the estimate degrades to the human-only
 * one. It cannot make the number wrong — only fail to make it tighter. That is a
 * strictly better bargain than a silver-gold set, which can be confidently wrong.
 *
 * ── The estimand is pool-restricted, and that is not Table III ────────────
 * The human and the judge both labelled candidates within a per-question pool.
 * So every number here is "of the pool candidates, which did the system emit",
 * which is a different quantity from the open-universe selection in the paper's
 * Table III. It is reported as its own row, never as a replacement.
 *
 * Confidence intervals are bootstrap over QUESTIONS, not over pairs: pairs
 * within a question share a candidate pool and are not independent, and
 * resampling them would report an interval narrower than the data supports.
 *
 * ── The gate, and why it currently fails ──────────────────────────────────
 * The correction is only unbiased if the human-labelled pairs are a RANDOM
 * subsample of the population being estimated. On the data as it stands they are
 * not, and the script refuses to print estimates because of it.
 *
 * The two labelling passes used different pools (eight candidates, then six).
 * Their intersection is what carries both labels — and every harness-gold figure
 * is in both pools by construction, 38 of 38. So the overlap is enriched in
 * positives: 12.1% of overlap pairs are human-YES against 4.9% across the full
 * human protocol, a factor of 2.46. Correcting with a subsample that skews that
 * far toward positives would push the estimate in a direction we cannot bound.
 *
 * What unblocks it is not more human work: it is judge labels on pools drawn the
 * same way the annotator's were. That needs the figure crops for ugm3-built,
 * which no longer exist on disk — 55% of them survive inside the two annotation
 * exports, but rebuilding pools from only the surviving crops would bias the
 * DISTRACTORS instead, which is the same disease in a new place.
 *
 * Usage:
 *   bun tests/bench-kb/src/ikat/ppi-eval.ts
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { cohensKappa } from "../judge"

const BENCH_ROOT = path.resolve(import.meta.dirname, "../..")
const C = path.join(BENCH_ROOT, "corpus")
const BOOT = Number(process.env.IKAT_BOOTSTRAP ?? 10000)

interface KeyRow { item: number; questionId: string; shownFigureIds: string[] }
interface BigAns { item: number; picked: number[] }
interface PRF { p: number; r: number; f1: number }

/** Micro P/R/F1 over (question, candidate) pairs, restricted to the pool. */
function prf(rows: Array<{ pred: Set<string>; gold: Set<string>; pool: string[] }>): PRF {
  let tp = 0, fp = 0, fn = 0
  for (const r of rows) {
    for (const f of r.pool) {
      const p = r.pred.has(f), g = r.gold.has(f)
      if (p && g) tp++
      else if (p) fp++
      else if (g) fn++
    }
  }
  const p = tp + fp ? tp / (tp + fp) : 0
  const r = tp + fn ? tp / (tp + fn) : 0
  return { p, r, f1: p + r ? (2 * p * r) / (p + r) : 0 }
}

/** Deterministic RNG so a reported interval is reproducible. */
function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296)
}

function quantile(xs: number[], q: number): number {
  const a = [...xs].sort((x, y) => x - y)
  const i = (a.length - 1) * q
  const lo = Math.floor(i), hi = Math.ceil(i)
  return lo === hi ? a[lo]! : a[lo]! * (hi - i) + a[hi]! * (i - lo)
}

/**
 * Judge labels, preferring the pass that reused the annotator's pools verbatim.
 *
 * Which file this reads decides whether the estimator is usable at all. The
 * annotation-big pass drew its own six-candidate pools, so its overlap with the
 * human labels is enriched in positives and the correction is invalid. The
 * judge-scale pass reuses the annotator's eight-candidate pool unchanged
 * wherever one exists, so the human labels cover every candidate and the
 * enrichment disappears by construction rather than by luck.
 */
function loadJudge(): { source: string; labels: Map<string, { pool: string[]; pos: Set<string> }> } {
  // Override to score a different judge's labels (same schema) against the
  // same human gold — e.g. judge-labels-minimax.json for the cross-vendor kappa.
  const scaled = process.env.IKAT_JUDGE_LABELS ?? path.join(C, "annotation-scale", "judge-labels.json")
  const out = new Map<string, { pool: string[]; pos: Set<string> }>()
  if (fs.existsSync(scaled)) {
    const d = JSON.parse(fs.readFileSync(scaled, "utf-8")) as {
      model: string
      labels: Array<{ questionId: string; shownFigureIds: string[]; picked: string[] }>
    }
    for (const r of d.labels) out.set(r.questionId, { pool: r.shownFigureIds, pos: new Set(r.picked) })
    return { source: `annotation-scale (${d.model}), pools reused verbatim`, labels: out }
  }
  const bigKey = JSON.parse(fs.readFileSync(path.join(C, "annotation-big", "annotation.KEY.json"), "utf-8")) as KeyRow[]
  const bigAns = JSON.parse(fs.readFileSync(path.join(C, "annotation-big", "sonnet-answers.json"), "utf-8")) as BigAns[]
  const byItem = new Map(bigKey.map((k) => [k.item, k]))
  for (const a of bigAns) {
    const k = byItem.get(a.item)
    if (!k) continue
    const ids = k.shownFigureIds
    out.set(k.questionId, {
      pool: ids,
      pos: new Set((a.picked ?? []).filter((i) => i >= 0 && i < ids.length).map((i) => ids[i]!)),
    })
  }
  return { source: "annotation-big (six-candidate pools, NOT the annotator's)", labels: out }
}

function main() {
  const humanRows = JSON.parse(fs.readFileSync(path.join(C, "annotation", "human-gold.json"), "utf-8")) as Array<{ questionId: string; humanGold: string[] }>
  const smallKey = JSON.parse(fs.readFileSync(path.join(C, "annotation", "annotation.KEY.json"), "utf-8")) as KeyRow[]
  const sel = JSON.parse(fs.readFileSync(path.join(C, "results", "select-eval-ugm3-built.json"), "utf-8")) as {
    perQuestion: Array<Record<string, unknown>>
  }

  const { source: judgeSource, labels: judge } = loadJudge()
  console.log(`judge labels: ${judgeSource}`)
  const human = new Map(humanRows.map((h) => [h.questionId, new Set(h.humanGold)]))
  // What the annotator was actually shown. A candidate outside this set has no
  // human label and must not be silently counted as a rejection.
  const humanSaw = new Map(smallKey.map((k) => [k.questionId, new Set(k.shownFigureIds)]))

  const systems = Object.keys(sel.perQuestion[0] ?? {}).filter((k) => k !== "questionId" && k !== "gold")
  const preds = new Map<string, Map<string, Set<string>>>()
  for (const s of systems) preds.set(s, new Map())
  for (const row of sel.perQuestion) {
    const qid = row.questionId as string
    for (const s of systems) preds.get(s)!.set(qid, new Set((row[s] as string[]) ?? []))
  }

  // ── Two populations ──────────────────────────────────────────────────────
  // ALL: every question the judge labelled and the systems were scored on.
  // L:   the subset where a person labelled every candidate in that pool, so
  //      judge and human are comparable pair for pair.
  const all: string[] = []
  const L: string[] = []
  for (const [qid, J] of judge) {
    if (!preds.get(systems[0]!)!.has(qid)) continue
    all.push(qid)
    const saw = humanSaw.get(qid)
    if (saw && J.pool.some((f) => saw.has(f))) L.push(qid)
  }

  const poolOf = (qid: string, restrictToHuman: boolean) => {
    const J = judge.get(qid)!
    const saw = humanSaw.get(qid)
    return restrictToHuman && saw ? J.pool.filter((f) => saw.has(f)) : J.pool
  }

  // ── Instrument check ─────────────────────────────────────────────────────
  const hv: number[] = [], jv: number[] = []
  for (const qid of L) for (const f of poolOf(qid, true)) {
    hv.push(human.get(qid)!.has(f) ? 1 : 0)
    jv.push(judge.get(qid)!.pos.has(f) ? 1 : 0)
  }
  const k = cohensKappa(jv, hv)
  console.log(`\n=== judge vs human, on the pairs both labelled ===`)
  console.log(`questions ${L.length}, pairs ${hv.length}`)
  console.log(`kappa=${k.kappa === null ? "n/a" : k.kappa.toFixed(3)}  both-yes=${k.n11} judge-only=${k.n10} human-only=${k.n01} both-no=${k.n00}`)
  console.log(`judge says yes ${k.n11 + k.n10}x, human ${k.n11 + k.n01}x — permissiveness ${((k.n11 + k.n10) / Math.max(1, k.n11 + k.n01)).toFixed(2)}x`)

  // ── Representativeness gate ──────────────────────────────────────────────
  // Prevalence among the pairs carrying a human label, against prevalence across
  // the annotator's whole protocol. PPI needs these to agree; the ratio is the
  // bias the correction would silently inherit.
  let fullTot = 0, fullPos = 0
  for (const [qid, saw] of humanSaw) {
    const h = human.get(qid)
    if (!h) continue
    fullTot += saw.size
    fullPos += [...saw].filter((f) => h.has(f)).length
  }
  const subPos = hv.reduce((a, b) => a + b, 0)
  const pFull = fullPos / Math.max(1, fullTot)
  const pSub = subPos / Math.max(1, hv.length)
  const enrich = pSub / Math.max(1e-9, pFull)

  console.log(`\n=== representativeness of the labelled subsample ===`)
  console.log(`positive rate, full human protocol : ${fullPos}/${fullTot} = ${(100 * pFull).toFixed(1)}%`)
  console.log(`positive rate, pairs used here     : ${subPos}/${hv.length} = ${(100 * pSub).toFixed(1)}%`)
  console.log(`enrichment                         : ${enrich.toFixed(2)}x`)

  const TOL = Number(process.env.IKAT_PPI_TOL ?? 1.25)
  if (enrich > TOL || enrich < 1 / TOL) {
    console.log(`\nREFUSING to report estimates.`)
    console.log(`  PPI corrects a cheap estimator using pairs that carry both labels. That`)
    console.log(`  correction is unbiased only if those pairs are a random subsample of the`)
    console.log(`  population. At ${enrich.toFixed(2)}x they are not: the two labelling passes used`)
    console.log(`  different candidate pools, and every gold figure lands in both by`)
    console.log(`  construction, so the overlap over-represents positives.`)
    console.log(`\n  The estimator below is implemented and tested; it is the DATA that is`)
    console.log(`  not eligible. What it needs is judge labels on pools drawn the same way`)
    console.log(`  the annotator's were — a re-export at the same candidate count, which`)
    console.log(`  needs the ugm3-built figure crops regenerated (they were deleted; 55%`)
    console.log(`  survive inside the annotation exports, but rebuilding from only those`)
    console.log(`  would bias the distractors instead).`)
    console.log(`\n  Set IKAT_PPI_TOL higher to see the numbers anyway. They will be wrong.`)
    return
  }

  // ── Estimates ────────────────────────────────────────────────────────────
  const rowsFor = (qids: string[], gold: "human" | "judge", sys: string, restrict: boolean) =>
    qids.map((qid) => ({
      pred: preds.get(sys)!.get(qid) ?? new Set<string>(),
      gold: gold === "human" ? human.get(qid) ?? new Set<string>() : judge.get(qid)!.pos,
      pool: poolOf(qid, restrict),
    }))

  console.log(`\n=== figure selection, pool-restricted (NOT the open-universe Table III) ===`)
  console.log(`human-labelled questions n=${L.length}; judge-labelled n=${all.length}\n`)
  console.log(`system            human-only F1 [95% CI]        PPI F1 [95% CI]              judge-only F1  width`)

  const rand = rng(20260813)
  for (const sys of systems) {
    const humanOnly = prf(rowsFor(L, "human", sys, true)).f1
    const judgeOnL = prf(rowsFor(L, "judge", sys, true)).f1
    const judgeAll = prf(rowsFor(all, "judge", sys, false)).f1
    const ppi = judgeAll - (judgeOnL - humanOnly)

    // Bootstrap: resample L and ALL independently, recompute both terms.
    const bH: number[] = [], bP: number[] = []
    for (let b = 0; b < BOOT; b++) {
      const Ls = Array.from({ length: L.length }, () => L[Math.floor(rand() * L.length)]!)
      const As = Array.from({ length: all.length }, () => all[Math.floor(rand() * all.length)]!)
      const h = prf(rowsFor(Ls, "human", sys, true)).f1
      const jl = prf(rowsFor(Ls, "judge", sys, true)).f1
      const ja = prf(rowsFor(As, "judge", sys, false)).f1
      bH.push(h)
      bP.push(ja - (jl - h))
    }
    const hLo = quantile(bH, 0.025), hHi = quantile(bH, 0.975)
    const pLo = quantile(bP, 0.025), pHi = quantile(bP, 0.975)
    const shrink = (1 - (pHi - pLo) / Math.max(1e-9, hHi - hLo)) * 100

    console.log(
      `${sys.padEnd(16)}  ${humanOnly.toFixed(3)} [${hLo.toFixed(3)}, ${hHi.toFixed(3)}]` +
        `      ${ppi.toFixed(3)} [${pLo.toFixed(3)}, ${pHi.toFixed(3)}]` +
        `      ${judgeAll.toFixed(3)}        ${shrink >= 0 ? "-" : "+"}${Math.abs(shrink).toFixed(0)}%`,
    )
  }
  console.log(`\nbootstrap ${BOOT} resamples over questions; "width" is the change in interval width against human-only.`)
  console.log(`A negative width is the point: the same 95% confidence, from a narrower interval, at no extra human cost.`)
}

if (import.meta.main) main()
