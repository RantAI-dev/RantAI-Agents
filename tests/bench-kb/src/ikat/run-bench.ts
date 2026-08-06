/**
 * IKAT-Bench step 5 — run every system over the question set and score it.
 *
 * Produces three things, all written to corpus/results/:
 *   results-<run>.json      per-question, per-system raw outputs (auditable)
 *   summary-<run>.json      the tables that go in the paper
 *   diagnostics-<run>.json  judge self-consistency / position-bias / parse rates
 *
 * Nothing is reported that was not produced here. If a cell is missing from a
 * table it is because the run did not produce it, not because it was omitted.
 *
 * Usage:
 *   bun tests/bench-kb/src/ikat/run-bench.ts [--limit N] [--systems a,b] [--judge N] [--run NAME]
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { loadEnv } from "./env"
import { cosine, sleep } from "../lib"
import { genEmbed as embed, providerInfo, flushEmbedCache } from "./providers"
import {
  DEFAULT_JUDGE,
  assertJudgeIndependence,
  judgeAnswerQuality,
  judgePlacementSlot,
  summarizeDiagnostics,
} from "../judge"
import {
  buildIndex,
  buildDescriptions,
  runSystem,
  figureIndexText,
  EMBED_MODEL,
  GEN_MODEL,
  TOP_K,
  type DocIndex,
  type SystemId,
  type SystemOutput,
} from "./systems"
import {
  idealSlot,
  groundedFigureF1,
  meanAbsDisplacement,
  placementAccuracy,
  figureSelection,
  macroAverage,
  pearson,
  type PlacedFigure,
} from "../placement-metrics"
import type { BuiltDoc, FigureRecord } from "./build-corpus"
import type { BenchQuestion } from "./generate-questions"

loadEnv()

const BENCH_ROOT = path.resolve(import.meta.dirname, "../..")
const BUILT_DIR = path.join(BENCH_ROOT, "corpus", process.env.IKAT_CORPUS ?? "built")
const RESULTS_DIR = path.join(BENCH_ROOT, "corpus", "results")
const QUESTIONS = path.join(BENCH_ROOT, "corpus", process.env.IKAT_QUESTIONS ?? "questions.json")
const DESC_DIR = path.join(BENCH_ROOT, "corpus", "descriptions")

const ALL_SYSTEMS: SystemId[] = [
  "text_only",
  "caption_match",
  "co_embed",
  "anchor",
  "anchor_vlm",
  "anchor_hybrid",
]
/** Vision model used ONCE per figure at ingest, for S5. Not the judge's vendor. */
const DESCRIBE_MODEL = process.env.IKAT_DESCRIBE_MODEL ?? "google/gemini-3-flash-preview"

// ── Per-question scoring ───────────────────────────────────────────────────

interface Scored {
  questionId: string
  system: SystemId
  answer: string
  figures: PlacedFigure[]
  goldFigureIds: string[]
  grounded: ReturnType<typeof groundedFigureF1>
  mad: number | null
  ms: number
  genTokens: number
}

/**
 * Resolve each emitted figure's ideal slot: the slot after the answer sentence
 * most similar to the figure's source-adjacent prose.
 *
 * The comparison is done in the SAME embedding space as retrieval, so the metric
 * introduces no new model of its own. Sensitivity to this choice is an ablation.
 */
async function resolveIdealSlots(
  out: SystemOutput,
  figuresById: Map<string, FigureRecord>,
): Promise<PlacedFigure[]> {
  if (!out.figures.length) return []
  if (!out.sentences.length) {
    // No sentences to place into: mark unscoreable rather than pretending slot 0.
    return out.figures.map((f) => ({ figureId: f.figureId, predictedSlot: f.slot, idealSlot: -1 }))
  }

  const sentVecs = (await embed(EMBED_MODEL, out.sentences)).vectors
  const placed: PlacedFigure[] = []
  for (const ef of out.figures) {
    const rec = figuresById.get(ef.figureId)
    if (!rec?.ctx) {
      placed.push({ figureId: ef.figureId, predictedSlot: ef.slot, idealSlot: -1 })
      continue
    }
    const ctxVec = (await embed(EMBED_MODEL, rec.ctx)).vectors[0]
    const sims = sentVecs.map((v) => cosine(ctxVec, v))
    placed.push({ figureId: ef.figureId, predictedSlot: ef.slot, idealSlot: idealSlot(sims) })
    await sleep(40)
  }
  return placed
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const val = (flag: string, dflt?: string) => {
    const i = args.indexOf(flag)
    return i >= 0 ? args[i + 1] : dflt
  }
  const limit = parseInt(val("--limit", "1000")!, 10)
  const judgeN = parseInt(val("--judge", "40")!, 10)
  const runName = val("--run", `run-${Date.now()}`)!
  const systems = (val("--systems", ALL_SYSTEMS.join(","))!.split(",") as SystemId[]).filter((s) =>
    ALL_SYSTEMS.includes(s),
  )

  // Guard first, before spending anything: a same-vendor judge invalidates the
  // whole run, and finding out after the API bill is worse than failing now.
  // Only meaningful when a judge actually runs; a judge-less structural run has
  // no self-preference to guard against.
  if (judgeN > 0) assertJudgeIndependence(DEFAULT_JUDGE, [GEN_MODEL, DESCRIBE_MODEL])

  fs.mkdirSync(RESULTS_DIR, { recursive: true })
  fs.mkdirSync(DESC_DIR, { recursive: true })

  const questions: BenchQuestion[] = JSON.parse(fs.readFileSync(QUESTIONS, "utf-8")).slice(0, limit)
  const docSlugs = Array.from(new Set(questions.map((q) => q.docSlug)))
  console.log(
    `[ikat] run ${runName}: ${questions.length} questions, ${docSlugs.length} docs, systems=[${systems.join(",")}]`,
  )
  console.log(`[ikat] generator=${GEN_MODEL} embed=${EMBED_MODEL} judge=${DEFAULT_JUDGE.model} k=${TOP_K}`)

  // Descriptions are needed only when S5 runs; building them is the ingest-time
  // cost of that system and is reported separately from serving.
  // Both description-using systems need the ingest-time descriptions: S5 passes
  // them to the generator, S6 additionally indexes them for its recall arm.
  const needDescriptions = systems.includes("anchor_vlm") || systems.includes("anchor_hybrid")

  // Figure records for every document: small (no vectors), needed throughout to
  // resolve metrics. The heavy per-document INDEXES are built one at a time
  // below and released immediately after that document's questions are done —
  // holding all 13 at once alongside the box's resident vLLM and ollama models
  // got the process killed by the OOM reaper, twice, with no error in the log.
  const figuresById = new Map<string, FigureRecord>()
  const descByDoc = new Map<string, Map<string, string>>()
  for (const slug of docSlugs) {
    const doc = JSON.parse(fs.readFileSync(path.join(BUILT_DIR, `${slug}.json`), "utf-8")) as BuiltDoc
    doc.figures.forEach((f) => figuresById.set(f.id, f))
  }

  // ── Run, document by document ──
  const scored: Scored[] = []
  const raw: Array<{ q: BenchQuestion; system: SystemId; out: SystemOutput }> = []

  for (const slug of docSlugs) {
    const doc = JSON.parse(fs.readFileSync(path.join(BUILT_DIR, `${slug}.json`), "utf-8")) as BuiltDoc

    let desc = new Map<string, string>()
    if (needDescriptions) {
      const t0 = Date.now()
      desc = await buildDescriptions(doc, DESCRIBE_MODEL, path.join(DESC_DIR, `${slug}.json`))
      console.log(`[ikat] descriptions for ${slug} ready in ${((Date.now() - t0) / 1000).toFixed(0)}s`)
    }
    descByDoc.set(slug, desc)

    console.log(`[ikat] indexing ${slug} (${doc.chunks.length} chunks)…`)
    let baseIdx: DocIndex | null = await buildIndex(doc, desc)

    for (const q of questions.filter((x) => x.docSlug === slug)) {
    for (const system of systems) {
      try {
        // S5 differs from S4 only in having descriptions available.
        if (!baseIdx) continue
        const idx: DocIndex =
          system === "anchor_vlm" || system === "anchor_hybrid"
            ? baseIdx
            : { ...baseIdx, descriptions: new Map() }
        const out = await runSystem(system, idx, q.question)
        const placed = await resolveIdealSlots(out, figuresById)
        scored.push({
          questionId: q.id,
          system,
          answer: out.answer,
          figures: placed,
          goldFigureIds: q.goldFigureIds,
          grounded: groundedFigureF1(placed, q.goldFigureIds, 1),
          mad: meanAbsDisplacement(placed),
          ms: out.ms,
          genTokens: out.genTokens,
        })
        raw.push({ q, system, out })
      } catch (err) {
        console.warn(`[ikat] ${system} failed on ${q.id}: ${err instanceof Error ? err.message : err}`)
      }
    }
    if (scored.length % 25 === 0) console.log(`[ikat] … ${scored.length} system-runs done`)
    }

    // Release this document's vectors before touching the next one.
    baseIdx = null
    // Nudge the collector where the runtime offers one — dropping the reference
    // is what matters, this only makes the release prompt rather than eventual.
    const gc = (globalThis as { Bun?: { gc?: (sync: boolean) => void } }).Bun?.gc
    if (gc) gc(true)
  }

  // ── Judge: answer quality (sampled) ──
  const agreements: number[] = []
  const quality = new Map<SystemId, Array<{ c: number; f: number; h: number }>>()
  // --judge 0 skips every judged measure. The structural metrics (GF-F1, PA@k,
  // |PD|, selection F1) are model-free, so a judge-less run still produces the
  // headline results; only answer quality and the validity study are deferred.
  const judgeTargets =
    judgeN > 0 ? raw.filter((_, i) => i % Math.max(1, Math.ceil(raw.length / judgeN)) === 0) : []
  console.log(
    judgeN > 0
      ? `[ikat] judging answer quality on ${judgeTargets.length} outputs…`
      : `[ikat] judging DISABLED (--judge 0): structural metrics only`,
  )
  for (const t of judgeTargets) {
    try {
      const r = await judgeAnswerQuality(DEFAULT_JUDGE, t.q.question, t.q.goldAnswer, t.out.answer)
      agreements.push(r.agreement)
      const arr = quality.get(t.system) ?? []
      arr.push({ c: r.value.completeness, f: r.value.faithfulness, h: r.value.helpfulness })
      quality.set(t.system, arr)
    } catch (err) {
      console.warn(`[ikat] judge failed: ${err instanceof Error ? err.message : err}`)
    }
  }

  // ── Judge: placement validity (does layout-gold match a reader's choice?) ──
  // Run on OUR system's outputs that actually emitted a figure. This is the
  // study that licenses the metric, so it is reported whatever it says.
  const validityJudge: number[] = []
  const validityGold: number[] = []
  const validityTargets =
    judgeN > 0
      ? raw
          .filter((r) => (r.system === "anchor" || r.system === "anchor_vlm") && r.out.figures.length > 0)
          .slice(0, judgeN)
      : []
  console.log(`[ikat] placement-validity study on ${validityTargets.length} items…`)
  for (const t of validityTargets) {
    const ef = t.out.figures[0]
    const rec = figuresById.get(ef.figureId)
    if (!rec) continue
    const s = scored.find((x) => x.questionId === t.q.id && x.system === t.system)
    const gold = s?.figures.find((f) => f.figureId === ef.figureId)?.idealSlot
    if (gold === undefined || gold < 0) continue
    try {
      const r = await judgePlacementSlot(
        DEFAULT_JUDGE,
        t.out.sentences,
        figureIndexText(rec, descByDoc.get(t.q.docSlug)?.get(rec.id)),
      )
      agreements.push(r.agreement)
      if (!r.value.reject && r.value.slot >= 0) {
        validityJudge.push(r.value.slot)
        validityGold.push(gold)
      }
    } catch (err) {
      console.warn(`[ikat] placement judge failed: ${err instanceof Error ? err.message : err}`)
    }
  }

  // ── Aggregate ──
  const byType = (qid: string) => questions.find((q) => q.id === qid)?.type ?? "factual"

  const summary = {
    run: runName,
    generatedAt: new Date().toISOString(),
    config: {
      generator: GEN_MODEL,
      embedder: EMBED_MODEL,
      judge: DEFAULT_JUDGE.model,
      topK: TOP_K,
      ...providerInfo(),
    },
    corpus: { docs: docSlugs.length, questions: questions.length },
    systems: systems.map((system) => {
      const rows = scored.filter((s) => s.system === system)
      const qual = quality.get(system) ?? []
      const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
      return {
        system,
        n: rows.length,
        // Headline: right figure AND right place.
        // Vacuous questions (no gold figure, none emitted) contribute null and
        // are skipped by macroAverage — see prf() in placement-metrics.
        groundedFigureF1: macroAverage(rows.map((r) => r.grounded.grounded?.f1 ?? null)),
        figureSelectionF1: macroAverage(rows.map((r) => r.grounded.selection?.f1 ?? null)),
        scoredQuestions: rows.filter((r) => r.grounded.grounded !== null).length,
        placementAccuracyAt1: macroAverage(rows.map((r) => r.grounded.placementAccuracy)),
        meanAbsDisplacement: macroAverage(rows.map((r) => r.mad)),
        answerCompleteness: mean(qual.map((x) => x.c)),
        answerFaithfulness: mean(qual.map((x) => x.f)),
        answerHelpfulness: mean(qual.map((x) => x.h)),
        meanLatencyMs: mean(rows.map((r) => r.ms)),
        meanGenTokens: mean(rows.map((r) => r.genTokens)),
        // C1 instrument: how the system fares when the answer is only in a figure.
        figureDependent: {
          n: rows.filter((r) => byType(r.questionId) === "figure_dependent").length,
          groundedFigureF1: macroAverage(
            rows
              .filter((r) => byType(r.questionId) === "figure_dependent")
              .map((r) => r.grounded.grounded?.f1 ?? null),
          ),
        },
      }
    }),
    placementValidity: {
      n: validityJudge.length,
      pearson: pearson(validityJudge, validityGold),
      exactAgreement:
        validityJudge.length
          ? validityJudge.filter((v, i) => v === validityGold[i]).length / validityJudge.length
          : null,
      within1:
        validityJudge.length
          ? validityJudge.filter((v, i) => Math.abs(v - validityGold[i]) <= 1).length / validityJudge.length
          : null,
    },
  }

  const diag = summarizeDiagnostics(DEFAULT_JUDGE, agreements)

  fs.writeFileSync(path.join(RESULTS_DIR, `results-${runName}.json`), JSON.stringify({ scored, raw }, null, 2))
  fs.writeFileSync(path.join(RESULTS_DIR, `summary-${runName}.json`), JSON.stringify(summary, null, 2))
  fs.writeFileSync(path.join(RESULTS_DIR, `diagnostics-${runName}.json`), JSON.stringify(diag, null, 2))

  console.log("\n=== IKAT-Bench summary ===")
  for (const s of summary.systems) {
    const f = (v: number | null) => (v === null ? "  n/a" : v.toFixed(3))
    console.log(
      `${s.system.padEnd(14)} GF-F1=${f(s.groundedFigureF1)}  selF1=${f(s.figureSelectionF1)}  ` +
        `PA@1=${f(s.placementAccuracyAt1)}  |PD|=${f(s.meanAbsDisplacement)}  ` +
        `compl=${f(s.answerCompleteness)}  faith=${f(s.answerFaithfulness)}  figQ-GF1=${f(s.figureDependent.groundedFigureF1)}`,
    )
  }
  console.log(
    `\nplacement validity: n=${summary.placementValidity.n} r=${summary.placementValidity.pearson?.toFixed(3) ?? "n/a"} ` +
      `exact=${summary.placementValidity.exactAgreement?.toFixed(3) ?? "n/a"} within1=${summary.placementValidity.within1?.toFixed(3) ?? "n/a"}`,
  )
  console.log(
    `judge: agreement=${diag.meanAgreement} unanimous=${diag.unanimousRate} n=${diag.nJudgements}`,
  )
  console.log(`\nwrote results to ${RESULTS_DIR}/*-${runName}.json`)
}

if (import.meta.main) {
  // Persist the embedding cache on the way out, success or failure — a run that
  // dies to a provider quota must not throw away the embeddings it already paid
  // for, or the retry costs the same again.
  const done = () => flushEmbedCache()
  main()
    .then(done)
    .catch((e) => {
      done()
      console.error(e)
      process.exit(1)
    })
}
