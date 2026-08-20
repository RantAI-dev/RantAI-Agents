/**
 * IKAT-Bench — how few images does the VLM actually need to see?
 *
 * The two-stage pipeline is the best selector measured (P .542 F1 .605 on the
 * human gold) and the reason it cannot sit in a chat reply path is latency: the
 * VLM is asked about every candidate, ~6 calls a question. Shrinking the model
 * does not fix that — the 4B saves 3.7 s and loses half its recall (experiment
 * D) — because the cost is visual prefill, which scales with IMAGES, not calls.
 *
 * So cut images instead. The cross-encoder already scores every candidate for
 * free (< 1 s for the whole set), and it is the more precise of the two methods.
 * Let it discard the obvious losers before the VLM opens its eyes:
 *
 *   cross-encoder ranks all candidates  ->  VLM judges only the top N
 *                                       ->  cross-encoder ranks survivors -> top-1
 *
 * The risk is stated up front and is the thing being measured: the cross-encoder
 * reads descriptions, so a figure whose description omits what the question asks
 * is invisible to it. Every such figure cut here is one the VLM would have
 * rescued — that is exactly the recall the pipeline was built to recover. If
 * recall collapses at N=3, the prefilter is not viable at any speed.
 *
 * COST ACCOUNTING. Each pair is judged ONCE, its wall-clock recorded, and the
 * N-curve is then computed over subsets of those judgements. Latency for N < all
 * is therefore PROJECTED as N x (measured mean pair cost) + measured rerank
 * cost, not observed end-to-end. Stated because a projection is weaker evidence
 * than a stopwatch, and the projection is only sound because pairs are judged
 * independently — which is a property of the design, not an assumption.
 *
 * Usage:
 *   IKAT_PROVIDER=ugm IKAT_GOLD=questions-human-gold.json \
 *     IKAT_JUDGE_MODEL=... bun tests/bench-kb/src/ikat/prefilter-pipeline.ts
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { genChat as chat } from "./providers"
import { rerankTexts } from "./systems"

const BENCH_ROOT = path.resolve(import.meta.dirname, "../..")
const ANN_DIR = path.join(BENCH_ROOT, "corpus", process.env.IKAT_ANNDIR ?? "annotation")
const FIG_DIR = path.join(BENCH_ROOT, "corpus", process.env.IKAT_FIGURES ?? "ugm3-figures")
const DESC_DIR = path.join(BENCH_ROOT, "corpus", process.env.IKAT_DESCRIPTIONS ?? "descriptions")
const JUDGE_MODEL = process.env.IKAT_JUDGE_MODEL ?? process.env.IKAT_GEN_MODEL ?? ""
const NS = (process.env.IKAT_PREFILTER_NS ?? "1,2,3,4,99").split(",").map(Number)

const PROMPT_LOOSE = `Kamu menilai apakah sebuah gambar dari buku pelajaran benar-benar membantu menjawab pertanyaan siswa.

Pertanyaan siswa: {Q}

Lihat gambar di atas.

Jawab "YA" hanya jika gambar ini benar-benar membantu siswa memahami jawaban pertanyaan tersebut.
Jawab "TIDAK" jika gambar tidak berhubungan, hanya hiasan, atau membahas hal lain.

Kebanyakan gambar dalam buku TIDAK membantu menjawab pertanyaan tertentu — "TIDAK" adalah jawaban
yang sering benar. Jika ragu, jawab TIDAK.

Jawab HANYA satu kata: YA atau TIDAK.`

const PROMPT_STRICT = `Kamu menilai apakah sebuah gambar dari buku pelajaran WAJIB ditampilkan untuk menjawab pertanyaan siswa.

Pertanyaan siswa: {Q}

Lihat gambar di atas.

Jawab "YA" HANYA jika gambar ini memuat informasi yang DIBUTUHKAN untuk menjawab pertanyaan itu —
misalnya angka, bentuk, langkah, atau bagian berlabel yang tidak bisa dijelaskan dengan kata-kata saja.

Jawab "TIDAK" untuk semua kasus lain, termasuk:
- gambar yang topiknya berhubungan tetapi tidak dibutuhkan untuk menjawab
- foto orang, suasana, atau kegiatan sebagai hiasan
- gambar pembuka bab atau latar halaman
- gambar yang hanya "cocok temanya"

Patokan penting: dari setiap 20 gambar dalam buku, biasanya HANYA 1 yang benar-benar dibutuhkan
untuk sebuah pertanyaan tertentu. Kalau kamu menjawab YA lebih sering dari itu, kamu terlalu longgar.

Kalau ragu sedikit pun, jawab TIDAK.

Jawab HANYA satu kata: YA atau TIDAK.`

const PROMPT = (process.env.IKAT_JUDGE_PROMPT ?? "loose") === "strict" ? PROMPT_STRICT : PROMPT_LOOSE

function figurePath(docSlug: string, figureId: string): string | null {
  const p = path.join(FIG_DIR, docSlug, `${figureId.split("::").pop()}.png`)
  return fs.existsSync(p) ? p : null
}

let failures = 0

/** One judgement. Returns the verdict and what it cost in wall-clock. */
async function judgePair(question: string, imagePath: string): Promise<{ yes: boolean; ms: number }> {
  const url = `data:image/png;base64,${fs.readFileSync(imagePath).toString("base64")}`
  const t0 = Date.now()
  let t = ""
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await chat(
        JUDGE_MODEL,
        [{ role: "user", content: [{ type: "image_url", image_url: { url } }, { type: "text", text: PROMPT.replace("{Q}", question) }] }],
        8,
      )
      t = res.text.trim().toUpperCase()
      break
    } catch {
      if (attempt === 1) failures++
    }
  }
  return { yes: /\bYA\b/.test(t) && !/\bTIDAK\b/.test(t), ms: Date.now() - t0 }
}

async function main() {
  if (!JUDGE_MODEL) {
    console.error("set IKAT_JUDGE_MODEL")
    process.exit(1)
  }
  const man = JSON.parse(fs.readFileSync(path.join(ANN_DIR, "judge-manifest.json"), "utf-8")) as Array<{
    item: number
    question: string
  }>
  const key = new Map(
    (JSON.parse(fs.readFileSync(path.join(ANN_DIR, "annotation.KEY.json"), "utf-8")) as Array<{
      item: number
      questionId: string
      docSlug: string
      shownFigureIds: string[]
    }>).map((k) => [k.item, k]),
  )
  const gold = new Map(
    (JSON.parse(
      fs.readFileSync(path.join(BENCH_ROOT, "corpus", process.env.IKAT_GOLD ?? "questions-sonnet-gold.json"), "utf-8"),
    ) as Array<{ id: string; goldFigureIds: string[] }>).map((q) => [q.id, new Set(q.goldFigureIds)]),
  )
  const desc = new Map<string, string>()
  if (fs.existsSync(DESC_DIR))
    for (const f of fs.readdirSync(DESC_DIR).filter((x) => x.endsWith(".json")))
      for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(path.join(DESC_DIR, f), "utf-8")) as Record<string, string>))
        desc.set(k, v)

  // One pass: rank every candidate, judge every candidate, remember both.
  type Row = { gold: Set<string>; ranked: Array<{ fid: string; s: number; yes: boolean }> }
  const rows: Row[] = []
  let pairMs = 0, pairs = 0, rerankMs = 0, reranks = 0

  for (const [i, m] of man.entries()) {
    const k = key.get(m.item)
    const g = k ? gold.get(k.questionId) : undefined
    if (!k || !g) continue

    const fids = k.shownFigureIds.filter((fid) => figurePath(k.docSlug, fid))
    if (!fids.length) continue

    const t0 = Date.now()
    const scores = await rerankTexts(m.question, fids.map((fid) => `[Gambar] ${desc.get(fid) ?? ""}`.trim()))
    rerankMs += Date.now() - t0
    reranks++

    const ranked = fids
      .map((fid, j) => ({ fid, s: scores[j] ?? 0, yes: false }))
      .sort((a, b) => b.s - a.s)

    for (const c of ranked) {
      const r = await judgePair(m.question, figurePath(k.docSlug, c.fid)!)
      c.yes = r.yes
      pairMs += r.ms
      pairs++
    }
    rows.push({ gold: g, ranked })
    if ((i + 1) % 20 === 0) console.log(`  ${i + 1}/${man.length}…`)
  }

  const meanPair = pairMs / pairs
  const meanRerank = rerankMs / reranks
  const meanCand = rows.reduce((a, r) => a + r.ranked.length, 0) / rows.length

  console.log(`\n=== CROSS-ENCODER PREFILTER -> VLM -> RANK -> top-1 — ${rows.length} questions ===`)
  console.log(`gold: ${process.env.IKAT_GOLD ?? "questions-sonnet-gold.json"}   model: ${JUDGE_MODEL}`)
  console.log(`measured: ${(meanPair / 1000).toFixed(2)}s per VLM pair, ${(meanRerank / 1000).toFixed(2)}s per rerank, ${meanCand.toFixed(1)} candidates/q`)
  console.log(`\n${"N seen".padEnd(8)} ${"P".padStart(6)} ${"R".padStart(6)} ${"F1".padStart(6)} ${"fig/q".padStart(7)} ${"silent".padStart(7)} ${"VLM/q".padStart(7)} ${"~lat".padStart(7)}`)

  for (const N of NS) {
    let tp = 0, fp = 0, fn = 0, emitted = 0, silent = 0, calls = 0
    for (const r of rows) {
      const seen = r.ranked.slice(0, N)
      calls += seen.length
      // Survivors keep the cross-encoder's order, so top-1 is its best.
      const picked = seen.filter((c) => c.yes).slice(0, 1).map((c) => c.fid)
      emitted += picked.length
      if (!picked.length) silent++
      for (const p of picked) (r.gold.has(p) ? tp++ : fp++)
      for (const x of r.gold) if (!picked.includes(x)) fn++
    }
    const P = tp + fp ? tp / (tp + fp) : 0
    const R = tp + fn ? tp / (tp + fn) : 0
    const F = P + R ? (2 * P * R) / (P + R) : 0
    const perQ = calls / rows.length
    const lat = (perQ * meanPair + meanRerank) / 1000
    console.log(
      `${(N >= 99 ? "all" : String(N)).padEnd(8)} ${P.toFixed(3).padStart(6)} ${R.toFixed(3).padStart(6)} ${F.toFixed(3).padStart(6)} ` +
        `${(emitted / rows.length).toFixed(2).padStart(7)} ${((100 * silent) / rows.length).toFixed(0).padStart(6)}% ${perQ.toFixed(2).padStart(7)} ${(lat.toFixed(1) + "s").padStart(7)}`,
    )
  }

  // The prefilter's own ceiling: how often the correct figure is still in the
  // top N at all. Below this no amount of VLM quality can help, so it separates
  // "the VLM missed it" from "it was never shown".
  console.log(`\nprefilter ceiling — correct figure still present after the cut:`)
  for (const N of NS) {
    let have = 0, want = 0
    for (const r of rows) {
      const seen = new Set(r.ranked.slice(0, N).map((c) => c.fid))
      for (const x of r.gold) {
        want++
        if (seen.has(x)) have++
      }
    }
    console.log(`  N=${N >= 99 ? "all" : N}  ${(have / want).toFixed(3)}  (${have}/${want})`)
  }
  if (failures) console.log(`\n[warn] ${failures} judge calls failed twice, recorded as NO`)
}

if (import.meta.main) main()
