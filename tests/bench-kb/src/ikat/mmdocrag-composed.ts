/**
 * IKAT-Bench — the COMPOSED pipeline on MMDocRAG, not just its ranking stage.
 *
 * Every external number we have so far was produced by the cross-encoder alone.
 * The vision gate — the stage that raised precision from 0.304 to 0.542 on our
 * own corpus — has never been run against anyone else's gold. So the honest
 * statement about our external results has been that they test the weakest
 * configuration we own, and that is the gap this closes.
 *
 * The pipeline under test is the deployed one:
 *
 *   prefilter   cross-encoder ranks the candidates, keep top N (N = 2)
 *   gate        a vision-language model sees each survivor AS AN IMAGE and may
 *               only remove it; it cannot add or reorder
 *   emit        the highest remaining cross-encoder score, or nothing
 *
 * ── Why this benchmark is the hard case for the gate ──────────────────────
 * MMDocRAG supplies an author-written description for every candidate, so the
 * text a ranker sees is already good. Our own corpus is the opposite: four
 * figures in five have no caption at all. The gate's value was measured in that
 * regime — sight buys recall when text about the image is missing. Here it is
 * not missing, so if the gate helps anyway that is a stronger result than we
 * expected, and if it does not, that is the boundary of the claim rather than a
 * failure of it. Either outcome is worth the run; neither is assumed.
 *
 * ── What this emits ───────────────────────────────────────────────────────
 * `--manifest` writes the prefilter survivors with their image paths, for a
 * judge that reads files rather than answering HTTP. `--score <verdicts.json>`
 * applies those verdicts and reports the composed pipeline against
 * cross-encoder-alone on the identical sample — the only comparison that
 * isolates the gate.
 *
 * Usage:
 *   MMDOCRAG_IMAGES=corpus/mmdocrag/images bun … mmdocrag-composed.ts --manifest 200
 *   bun … mmdocrag-composed.ts --score corpus/mmdocrag/verdicts.json
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { rerankTexts } from "./systems"

const BENCH_ROOT = path.resolve(import.meta.dirname, "../..")
const DIR = process.env.MMDOCRAG_DIR ?? path.join(BENCH_ROOT, "corpus", "mmdocrag")
const IMAGES = process.env.MMDOCRAG_IMAGES ?? path.join(DIR, "images")
const FILE = process.env.MMDOCRAG_FILE ?? "dev_15.jsonl"
const TOP_N = Number(process.env.IKAT_PREFILTER_N ?? 2)
const MIN = Number(process.env.IKAT_RERANK_MIN ?? 0.1)
const OUT = path.join(DIR, "composed")

interface Quote { quote_id: string; img_path?: string; img_description?: string }
interface Row { q_id: number; doc_name: string; domain: string; question: string; img_quotes?: Quote[]; gold_quotes?: string[] }

interface Item {
  q_id: number
  domain: string
  question: string
  gold: string[]
  /** Survivors of the prefilter, best first, with the score that ordered them. */
  survivors: Array<{ quote_id: string; score: number; image: string }>
}

function prf(tp: number, fp: number, fn: number) {
  const p = tp + fp ? tp / (tp + fp) : 0
  const r = tp + fn ? tp / (tp + fn) : 0
  return { P: 100 * p, R: 100 * r, F: p + r ? (100 * 2 * p * r) / (p + r) : 0 }
}

async function buildManifest(limit: number) {
  const rows = fs.readFileSync(path.join(DIR, FILE), "utf-8").trim().split("\n").map((l) => JSON.parse(l) as Row)
  // Deterministic stride rather than the first N: the file is ordered by
  // document, so a prefix would be a handful of documents rather than a sample
  // of the benchmark, and the domain mix would be whatever came first.
  const stride = Math.max(1, Math.floor(rows.length / limit))
  const sample = rows.filter((_, i) => i % stride === 0).slice(0, limit)

  const items: Item[] = []
  let noImage = 0
  for (const [i, r] of sample.entries()) {
    const cands = (r.img_quotes ?? []).filter((q) => (q.img_description ?? "").trim() && q.img_path)
    if (!cands.length) continue
    const gold = (r.gold_quotes ?? []).filter((g) => g.startsWith("image"))
    const scores = await rerankTexts(r.question, cands.map((c) => c.img_description!))
    const ranked = cands
      .map((c, j) => ({ quote_id: c.quote_id, score: scores[j] ?? 0, image: path.join(IMAGES, path.basename(c.img_path!)) }))
      .filter((x) => x.score >= MIN)
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_N)
    const present = ranked.filter((x) => fs.existsSync(x.image))
    if (present.length !== ranked.length) noImage++
    items.push({ q_id: r.q_id, domain: r.domain, question: r.question, gold, survivors: present })
    if ((i + 1) % 50 === 0) console.log(`  prefiltered ${i + 1}/${sample.length}…`)
  }

  fs.mkdirSync(OUT, { recursive: true })
  const f = path.join(OUT, "manifest.json")
  fs.writeFileSync(f, JSON.stringify(items, null, 2))
  const nsurv = items.reduce((a, it) => a + it.survivors.length, 0)
  console.log(`\nsampled ${items.length} questions by stride ${stride} across ${new Set(items.map((i) => i.domain)).size} domains`)
  console.log(`prefilter kept ${nsurv} candidates (${(nsurv / items.length).toFixed(2)} per question); ${items.filter((i) => !i.survivors.length).length} questions already empty`)
  if (noImage) console.log(`${noImage} questions lost a survivor to a missing image file`)
  console.log(`wrote ${f}`)
}

function score(verdictPath: string) {
  const items = JSON.parse(fs.readFileSync(path.join(OUT, "manifest.json"), "utf-8")) as Item[]
  const verdicts = new Map<number, string[]>()
  for (const v of JSON.parse(fs.readFileSync(verdictPath, "utf-8")) as Array<{ q_id: number; keep: string[] }>) {
    verdicts.set(v.q_id, v.keep)
  }
  const missing = items.filter((i) => i.survivors.length && !verdicts.has(i.q_id))
  if (missing.length) {
    console.error(`${missing.length} questions have survivors but no verdict — refusing to score a partial run`)
    process.exit(1)
  }

  let a = [0, 0, 0], b = [0, 0, 0] // cross-encoder alone, composed
  let gated = 0, kept = 0
  for (const it of items) {
    const gold = new Set(it.gold)
    const alone = it.survivors.slice(0, 1).map((s) => s.quote_id)
    const keep = new Set(verdicts.get(it.q_id) ?? [])
    const survived = it.survivors.filter((s) => keep.has(s.quote_id))
    gated += it.survivors.length
    kept += survived.length
    const composed = survived.slice(0, 1).map((s) => s.quote_id)
    for (const [pick, acc] of [[alone, a], [composed, b]] as const) {
      for (const p of pick) gold.has(p) ? acc[0]++ : acc[1]++
      for (const g of gold) if (!pick.includes(g)) acc[2]++
    }
  }
  const A = prf(a[0], a[1], a[2]), B = prf(b[0], b[1], b[2])
  console.log(`\nsame ${items.length} questions, same prefilter, top-1 emitted\n`)
  console.log(`system                          IP      IR      IF1`)
  console.log(`cross-encoder alone           ${A.P.toFixed(2).padStart(6)}  ${A.R.toFixed(2).padStart(6)}  ${A.F.toFixed(2).padStart(6)}`)
  console.log(`+ vision gate (composed)      ${B.P.toFixed(2).padStart(6)}  ${B.R.toFixed(2).padStart(6)}  ${B.F.toFixed(2).padStart(6)}`)
  console.log(`\ngate saw ${gated} candidates and kept ${kept} (${((100 * kept) / Math.max(1, gated)).toFixed(0)}%)`)
  // An earlier version of this line claimed recall could not rise because the
  // gate only removes. That is wrong once emission is top-1: removing a wrongly
  // ranked leader PROMOTES the next survivor into the emitted slot, so deletion
  // reorders what is emitted even though it never reorders the list.
  console.log(`Removal reorders what is EMITTED: discarding a wrongly ranked leader`)
  console.log(`promotes the next survivor into the top-1 slot, so recall can rise.`)
  fs.writeFileSync(path.join(OUT, "composed-result.json"), JSON.stringify({ n: items.length, alone: A, composed: B, gated, kept }, null, 2))
}

const args = process.argv.slice(2)
if (args.includes("--score")) score(args[args.indexOf("--score") + 1]!)
else await buildManifest(Number(args[args.indexOf("--manifest") + 1] ?? 200))
