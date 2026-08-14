/**
 * IKAT-Bench — scale figure-relevance labels beyond what a person annotated.
 *
 * The headline selection number rests on 48 human-annotated items. That is the
 * binding constraint on the strongest claim in the paper, and more annotation is
 * the honest fix — but it is human work measured in weeks. This script builds
 * the other half of a prediction-powered estimate: the same labelling task, run
 * by a judge, over every question the systems were scored on.
 *
 * ── Why the judge must see exactly what the person saw ────────────────────
 * A rectified estimator is only valid if the judge is the SAME function on the
 * labelled and unlabelled halves. Two things follow, and both are enforced here:
 *
 *   1. For questions a person annotated, the judge is handed that item's pool
 *      VERBATIM from annotation.KEY.json — same candidates, same order. Anything
 *      else measures a different instrument and the agreement figure stops
 *      licensing the correction.
 *   2. For the rest, the pool is built by the same rule export-annotation.ts
 *      uses: harness-gold figures first, distractors drawn from the SAME book,
 *      padded to eight, then shuffled. Cross-book distractors would be trivially
 *      rejectable and would flatter the judge on the unlabelled half only —
 *      which is precisely the asymmetry that would bias the correction.
 *
 * The prompt is a translation of the instruction the human annotators read, kept
 * deliberately close: "does this image genuinely help answer the question",
 * abstention offered first, decoration explicitly not a reason to pick. A judge
 * asked a subtly different question is a different instrument again.
 *
 * ── What this cannot do ───────────────────────────────────────────────────
 * These labels are NOT a gold standard and must never be used as one. They exist
 * to be corrected by the human labels in ppi-eval.ts. Scored directly they carry
 * the judge's bias whole — the on-prem VLM, measured against these same people,
 * said yes 2.9x too often.
 *
 * Usage:
 *   IKAT_PROVIDER=openrouter bun tests/bench-kb/src/ikat/judge-scale.ts --dry
 *   IKAT_PROVIDER=openrouter bun tests/bench-kb/src/ikat/judge-scale.ts --limit 5
 *   IKAT_PROVIDER=openrouter bun tests/bench-kb/src/ikat/judge-scale.ts
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { chat } from "../lib"

const BENCH_ROOT = path.resolve(import.meta.dirname, "../..")
const CORPUS = path.join(BENCH_ROOT, "corpus", process.env.IKAT_CORPUS ?? "ugm3-built")
const FIG_DIR = path.join(BENCH_ROOT, "corpus", process.env.IKAT_FIGURES ?? "ugm3-figures")
const QFILE = path.join(BENCH_ROOT, "corpus", process.env.IKAT_QUESTIONS ?? "questions-ugm-large.json")
const ANN = path.join(BENCH_ROOT, "corpus", "annotation")
const SEL = path.join(BENCH_ROOT, "corpus", "results", "select-eval-ugm3-built.json")
const OUT = path.join(BENCH_ROOT, "corpus", "annotation-scale")

/** Pinned. A judge that silently changes version invalidates every κ measured
 *  against it, and the whole correction hangs off that κ. */
const JUDGE_MODEL = process.env.IKAT_SCALE_JUDGE ?? "anthropic/claude-sonnet-4.5"
const N_CAND = 8

interface Q { id: string; question: string; docSlug: string; goldFigureIds: string[]; type: string }
interface KeyRow { item: number; questionId: string; docSlug: string; type: string; shownFigureIds: string[]; harnessGold: string[] }
interface Fig { id: string; assetFile?: string; decorative?: boolean }

/** Deterministic per-question seed. The original export seeds off the item's
 *  index, which is unavailable for questions no one annotated; hashing the id
 *  keeps the draw reproducible without depending on position in a list. */
function seedOf(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

function shuffleSeeded<T>(xs: T[], seed: number): T[] {
  const a = [...xs]
  let s = seed || 1
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    const j = s % (i + 1)
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

const PROMPT = `Anda menilai apakah sebuah gambar benar-benar MEMBANTU MENJAWAB sebuah pertanyaan.

Pertanyaan:
{Q}

Di bawah ini ada {N} gambar, diberi nomor 1 sampai {N} sesuai urutan.

Aturan:
- Boleh memilih lebih dari satu gambar, atau TIDAK SATU PUN.
- Banyak pertanyaan memang tidak butuh gambar. Menjawab "tidak ada" adalah jawaban yang benar dan sering.
- Nilai gambar dari ISINYA, bukan dari keindahannya. Gambar hiasan yang tidak mengajarkan apa pun jangan dipilih.
- Jika ragu, jangan dipilih.

Jawab HANYA dengan satu baris JSON, tanpa penjelasan:
{"picked": [nomor, ...]}
Gunakan {"picked": []} bila tidak ada gambar yang membantu.`

/** Tolerant of fenced blocks and of prose the model adds despite instruction.
 *  Returns null when nothing parses — a null is dropped from the run rather
 *  than silently becoming an empty pick, which would read as a confident "no". */
export function parsePicked(reply: string, n: number): number[] | null {
  const m = reply.match(/\{[^{}]*"picked"\s*:\s*\[[^\]]*\][^{}]*\}/)
  if (!m) return null
  try {
    const o = JSON.parse(m[0]) as { picked?: unknown }
    if (!Array.isArray(o.picked)) return null
    const out = o.picked
      .map((x) => (typeof x === "number" ? x : parseInt(String(x), 10)))
      .filter((x) => Number.isInteger(x) && x >= 1 && x <= n)
      .map((x) => x - 1)
    return [...new Set(out)].sort((a, b) => a - b)
  } catch { return null }
}

function imagePart(p: string) {
  const ext = path.extname(p).toLowerCase() === ".jpg" ? "jpeg" : "png"
  return { type: "image_url", image_url: { url: `data:image/${ext};base64,${fs.readFileSync(p).toString("base64")}` } }
}

async function main() {
  const args = process.argv.slice(2)
  const dry = args.includes("--dry")
  const manifest = args.includes("--manifest")
  const li = args.indexOf("--limit")
  const limit = li >= 0 ? parseInt(args[li + 1] ?? "0", 10) : 0

  const questions = new Map<string, Q>(
    (JSON.parse(fs.readFileSync(QFILE, "utf-8")) as Q[]).map((q) => [q.id, q]),
  )
  const docs = new Map<string, { slug: string; figures?: Fig[] }>()
  for (const f of fs.readdirSync(CORPUS).filter((x) => x.endsWith(".json"))) {
    const d = JSON.parse(fs.readFileSync(path.join(CORPUS, f), "utf-8"))
    docs.set(d.slug, d)
  }

  // The universe is exactly the questions the systems were scored on. Judging
  // anything else produces labels no estimate can use.
  const scored = (JSON.parse(fs.readFileSync(SEL, "utf-8")) as { perQuestion: Array<{ questionId: string }> })
    .perQuestion.map((r) => r.questionId)

  const key = JSON.parse(fs.readFileSync(path.join(ANN, "annotation.KEY.json"), "utf-8")) as KeyRow[]
  const humanPools = new Map(key.map((k) => [k.questionId, k]))

  const figById = new Map<string, { fig: Fig; slug: string }>()
  for (const [slug, d] of docs) for (const f of d.figures ?? []) figById.set(f.id, { fig: f, slug })

  const assetOf = (fid: string): string | null => {
    const e = figById.get(fid)
    if (!e?.fig.assetFile) return null
    const p = path.join(FIG_DIR, e.slug, path.basename(e.fig.assetFile))
    return fs.existsSync(p) ? p : null
  }

  type Item = { questionId: string; question: string; shownFigureIds: string[]; images: string[]; labelled: boolean }
  const items: Item[] = []
  let skipped = 0

  for (const qid of scored) {
    const q = questions.get(qid)
    if (!q) { skipped++; continue }

    const reused = humanPools.get(qid)
    let shown: string[]
    if (reused) {
      // Verbatim. Same candidates, same order the person saw them in.
      shown = reused.shownFigureIds
    } else {
      const doc = docs.get(q.docSlug)
      const usable = (doc?.figures ?? []).filter((f) => !f.decorative)
      if (usable.length < 2) { skipped++; continue }
      const gold = new Set(q.goldFigureIds ?? [])
      const others = shuffleSeeded(usable.filter((f) => !gold.has(f.id)), seedOf(qid))
      const chosen = [...usable.filter((f) => gold.has(f.id)), ...others].slice(0, N_CAND)
      shown = shuffleSeeded(chosen, seedOf(qid) + 1000).map((f) => f.id)
    }

    const images = shown.map(assetOf)
    if (images.some((x) => !x) || images.length < 2) { skipped++; continue }
    items.push({ questionId: qid, question: q.question, shownFigureIds: shown, images: images as string[], labelled: !!reused })
  }

  const nLab = items.filter((i) => i.labelled).length
  console.log(`universe ${scored.length} scored questions -> ${items.length} judgeable (${skipped} skipped: missing question, figures or crops)`)
  console.log(`  ${nLab} carry human labels (pool reused verbatim), ${items.length - nLab} do not`)
  console.log(`  judge: ${JUDGE_MODEL}, ${N_CAND} candidates per item`)
  if (manifest) {
    // Pools and image paths only, no inference. Written so a judge that is not
    // an HTTP endpoint — a human, or an agent reading the files directly — can
    // run the identical protocol and have its verdicts scored the same way.
    fs.mkdirSync(OUT, { recursive: true })
    const f = path.join(OUT, "manifest.json")
    fs.writeFileSync(f, JSON.stringify(
      items.map((it, i) => ({
        item: i + 1, questionId: it.questionId, question: it.question,
        labelled: it.labelled, shownFigureIds: it.shownFigureIds, images: it.images,
      })), null, 2))
    console.log(`wrote ${f}`)
    return
  }
  if (dry) {
    const bytes = items.reduce((a, i) => a + i.images.reduce((b, p) => b + fs.statSync(p).size, 0), 0)
    console.log(`  dry run: would send ${items.reduce((a, i) => a + i.images.length, 0)} images, ${(bytes / 1048576).toFixed(1)} MB of source crops`)
    return
  }

  const run = limit ? items.slice(0, limit) : items
  const out: Array<{ questionId: string; labelled: boolean; shownFigureIds: string[]; picked: string[] }> = []
  let unparsed = 0, promptTok = 0, completionTok = 0
  const t0 = Date.now()

  for (const [i, it] of run.entries()) {
    const parts: unknown[] = [{ type: "text", text: PROMPT.replace("{Q}", it.question).replaceAll("{N}", String(it.images.length)) }]
    for (const p of it.images) parts.push(imagePart(p))
    let picked: number[] | null = null
    try {
      const r = await chat(JUDGE_MODEL, [{ role: "user", content: parts }], 200)
      picked = parsePicked(r.text, it.images.length)
      promptTok += r.usage?.prompt_tokens ?? 0
      completionTok += r.usage?.completion_tokens ?? 0
      if (picked === null) { unparsed++; console.warn(`  [${i + 1}] unparsed: ${r.text.slice(0, 120).replace(/\n/g, " ")}`) }
    } catch (e) {
      unparsed++
      console.warn(`  [${i + 1}] error: ${(e as Error).message.slice(0, 140)}`)
    }
    if (picked !== null) {
      out.push({ questionId: it.questionId, labelled: it.labelled, shownFigureIds: it.shownFigureIds, picked: picked.map((j) => it.shownFigureIds[j]!) })
    }
    if ((i + 1) % 10 === 0) console.log(`  ${i + 1}/${run.length} — ${((Date.now() - t0) / 1000 / (i + 1)).toFixed(1)}s/item`)
  }

  fs.mkdirSync(OUT, { recursive: true })
  const file = path.join(OUT, limit ? `judge-labels.pilot${limit}.json` : "judge-labels.json")
  fs.writeFileSync(file, JSON.stringify({ model: JUDGE_MODEL, nCandidates: N_CAND, labels: out }, null, 2))

  const pos = out.reduce((a, r) => a + r.picked.length, 0)
  console.log(`\njudged ${out.length}/${run.length} (${unparsed} dropped, unparsed or errored)`)
  console.log(`picked ${pos} figures across ${out.length} items; ${out.filter((r) => !r.picked.length).length} items got none`)
  console.log(`tokens: ${promptTok} prompt, ${completionTok} completion — check spend against your provider before the full run`)
  console.log(`wrote ${file}`)
}

if (import.meta.main) main()
