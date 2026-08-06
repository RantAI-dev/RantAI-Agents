/**
 * IKAT-Bench step 3 — build the question set.
 *
 * Two design decisions that exist to keep the benchmark honest:
 *
 * 1. THE GENERATOR IS NOT THE JUDGE. Questions are written by a different vendor
 *    from the judge (see judge.ts `assertJudgeIndependence`). A judge grading
 *    answers to questions it wrote itself would favour its own phrasing and
 *    framing; keeping the two apart costs nothing and removes the objection.
 *
 * 2. FIGURE-DEPENDENT QUESTIONS ARE ADVERSARIALLY FILTERED. A question only
 *    enters the figure-dependent class if a strong text-only model, shown the
 *    full surrounding prose WITHOUT the figure, cannot answer it. Without this
 *    filter the class silently fills with questions answerable from text, the
 *    text-only baseline looks artificially strong, and claim C1 becomes
 *    untestable. The filter is the instrument, not a nicety.
 *
 * Usage:
 *   bun tests/bench-kb/src/ikat/generate-questions.ts [--per-doc N] [--docs slug,slug]
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { loadEnv } from "./env"
import { chat } from "../lib"
import { parseJsonLoose } from "../judge"
import type { BuiltDoc, FigureRecord } from "./build-corpus"

loadEnv()

const BENCH_ROOT = path.resolve(import.meta.dirname, "../..")
const BUILT_DIR = path.join(BENCH_ROOT, "corpus", "built")
const FIG_DIR = path.join(BENCH_ROOT, "corpus", "figures")
const OUT = path.join(BENCH_ROOT, "corpus", "questions.json")

/** Deliberately not the judge's vendor. */
const QGEN_MODEL = process.env.IKAT_QGEN_MODEL ?? "google/gemini-3-flash-preview"
/** The adversary for the figure-dependence filter: strong, text-only prompt. */
const ADVERSARY_MODEL = process.env.IKAT_ADVERSARY_MODEL ?? "google/gemini-3-flash-preview"

export type QuestionType = "factual" | "figure_dependent" | "explanatory" | "comparison"

export interface BenchQuestion {
  id: string
  docSlug: string
  type: QuestionType
  question: string
  goldAnswer: string
  /** Chunk ids constituting the gold evidence span. */
  goldChunkIds: string[]
  /** Figures whose anchor lies in the gold span — the gold figure set F*(q). */
  goldFigureIds: string[]
  /** For figure_dependent: the text-only adversary's attempt, kept for audit. */
  adversaryAnswer?: string
}

function dataUrl(assetFile: string): string | null {
  const p = path.join(FIG_DIR, assetFile)
  if (!fs.existsSync(p)) return null
  return `data:image/png;base64,${fs.readFileSync(p).toString("base64")}`
}

// ── Prompts ────────────────────────────────────────────────────────────────

const TEXT_Q_PROMPT = `Anda menyusun soal evaluasi untuk asisten belajar berbasis buku pelajaran Indonesia.

Berikut kutipan dari buku:
---
{CTX}
---

Buat {N} pertanyaan yang JAWABANNYA ADA di kutipan tersebut. Variasikan:
- "factual": jawabannya dinyatakan langsung
- "explanatory": menanyakan mengapa/bagaimana, butuh penjelasan
- "comparison": membandingkan dua hal dalam kutipan

Pertanyaan harus mandiri (bisa dipahami tanpa melihat kutipan) dan dalam bahasa Indonesia.

Balas HANYA JSON:
{"items":[{"type":"factual|explanatory|comparison","question":"...","answer":"..."}]}`

const FIG_Q_PROMPT = `Anda menyusun soal evaluasi untuk asisten belajar berbasis buku pelajaran Indonesia.

Gambar berikut diambil dari buku. Teks di sekitarnya:
---
{CTX}
---

Buat SATU pertanyaan yang HANYA bisa dijawab dengan MELIHAT GAMBAR — yaitu informasi yang ada di gambar
tetapi TIDAK tertulis di teks di atas (misalnya: apa yang ditunjukkan, berapa banyak objek, bagaimana
bentuk/urutannya, apa label pada bagiannya).

Jika gambar tidak memuat informasi yang bisa ditanyakan (hiasan, garis, logo, halaman kosong),
balas {"skip": true}.

Pertanyaan harus mandiri dan dalam bahasa Indonesia.

Balas HANYA JSON:
{"question":"...","answer":"...","skip":false}`

const ADVERSARY_PROMPT = `Jawab pertanyaan berikut HANYA berdasarkan teks yang diberikan.

Teks:
---
{CTX}
---

Pertanyaan: {Q}

Jika teks tidak memuat informasi yang cukup untuk menjawab, balas persis: TIDAK ADA DI TEKS

Jawaban singkat:`

// ── Generation ─────────────────────────────────────────────────────────────

/**
 * Gold figures for a span: those whose anchor falls inside the chunk range.
 *
 * Page furniture is excluded from the gold set. Leaving it in would demand that
 * a system surface a chapter-header ornament to score full recall, penalising
 * every system for correct behaviour.
 */
function figuresInSpan(doc: BuiltDoc, fromBlock: number, toBlock: number): FigureRecord[] {
  return doc.figures.filter(
    (f) => !f.decorative && f.anchorIndex >= fromBlock && f.anchorIndex <= toBlock,
  )
}

async function textQuestions(doc: BuiltDoc, n: number): Promise<BenchQuestion[]> {
  // Prefer substantial chunks: very short ones yield trivia, not questions.
  const candidates = doc.chunks.filter((c) => c.text.length > 600)
  if (!candidates.length) return []
  const step = Math.max(1, Math.floor(candidates.length / Math.max(1, n)))
  const picked = candidates.filter((_, i) => i % step === 0).slice(0, n)

  const out: BenchQuestion[] = []
  for (const c of picked) {
    try {
      const res = await chat(
        QGEN_MODEL,
        [{ role: "user", content: TEXT_Q_PROMPT.replace("{CTX}", c.text).replace("{N}", "2") }],
        1200,
      )
      const parsed = parseJsonLoose<{ items?: Array<{ type: string; question: string; answer: string }> }>(res.text)
      for (const it of parsed?.items ?? []) {
        if (!it.question || !it.answer) continue
        const type: QuestionType =
          it.type === "explanatory" ? "explanatory" : it.type === "comparison" ? "comparison" : "factual"
        out.push({
          id: `${doc.slug}::q${out.length}::${type}`,
          docSlug: doc.slug,
          type,
          question: it.question.trim(),
          goldAnswer: it.answer.trim(),
          goldChunkIds: [c.id],
          goldFigureIds: figuresInSpan(doc, c.fromBlock, c.toBlock).map((f) => f.id),
        })
      }
    } catch (err) {
      console.warn(`[ikat] qgen failed on ${c.id}: ${err instanceof Error ? err.message : err}`)
    }
  }
  return out
}

async function figureQuestions(doc: BuiltDoc, n: number): Promise<BenchQuestion[]> {
  // Drop page furniture (chapter-header art, icons, full-bleed backgrounds) and
  // figures with no usable surrounding prose. Without the furniture filter the
  // class fills with questions like "what colour is the circle around the
  // chapter number" — literally figure-dependent, useless as a tutoring measure.
  const candidates = doc.figures.filter((f) => !f.decorative && f.ctx.length > 200 && f.anchorChunkId)
  if (!candidates.length) return []
  const step = Math.max(1, Math.floor(candidates.length / Math.max(1, n)))
  const picked = candidates.filter((_, i) => i % step === 0).slice(0, n)

  const out: BenchQuestion[] = []
  let skipped = 0
  let leaked = 0
  for (const f of picked) {
    const url = dataUrl(f.assetFile)
    if (!url) continue
    try {
      const res = await chat(
        QGEN_MODEL,
        [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url } },
              { type: "text", text: FIG_Q_PROMPT.replace("{CTX}", f.ctx) },
            ],
          },
        ],
        800,
      )
      const p = parseJsonLoose<{ question?: string; answer?: string; skip?: boolean }>(res.text)
      if (!p || p.skip || !p.question || !p.answer) {
        skipped++
        continue
      }

      // ── Adversarial filter: can text alone answer it? ──
      const adv = await chat(
        ADVERSARY_MODEL,
        [{ role: "user", content: ADVERSARY_PROMPT.replace("{CTX}", f.ctx).replace("{Q}", p.question) }],
        300,
      )
      const advText = adv.text.trim()
      if (!/TIDAK ADA DI TEKS/i.test(advText)) {
        // The prose answers it, so it is not figure-dependent. Dropping it keeps
        // the class clean; counting these tells us how leaky naive generation is.
        leaked++
        continue
      }

      out.push({
        id: `${doc.slug}::fq${out.length}`,
        docSlug: doc.slug,
        type: "figure_dependent",
        question: p.question.trim(),
        goldAnswer: p.answer.trim(),
        goldChunkIds: f.anchorChunkId ? [f.anchorChunkId] : [],
        goldFigureIds: [f.id],
        adversaryAnswer: advText.slice(0, 300),
      })
    } catch (err) {
      console.warn(`[ikat] figure qgen failed on ${f.id}: ${err instanceof Error ? err.message : err}`)
    }
  }
  console.log(
    `[ikat]   ${doc.slug}: figure-dependent kept ${out.length}, unusable figure ${skipped}, ` +
      `rejected as text-answerable ${leaked}`,
  )
  return out
}

async function main() {
  const args = process.argv.slice(2)
  const perDocArg = args.indexOf("--per-doc")
  const docsArg = args.indexOf("--docs")
  const perDoc = perDocArg >= 0 ? parseInt(args[perDocArg + 1], 10) : 10
  const only = docsArg >= 0 ? new Set(args[docsArg + 1].split(",")) : null

  const files = fs.readdirSync(BUILT_DIR).filter((f) => f.endsWith(".json")).sort()
  const all: BenchQuestion[] = []

  for (const file of files) {
    const doc = JSON.parse(fs.readFileSync(path.join(BUILT_DIR, file), "utf-8")) as BuiltDoc
    if (only && !only.has(doc.slug)) continue
    console.log(`[ikat] generating for ${doc.slug}…`)
    const [tq, fq] = [await textQuestions(doc, perDoc), await figureQuestions(doc, perDoc)]
    all.push(...tq, ...fq)
  }

  fs.writeFileSync(OUT, JSON.stringify(all, null, 2))
  const byType = all.reduce<Record<string, number>>((a, q) => ({ ...a, [q.type]: (a[q.type] ?? 0) + 1 }), {})
  console.log(`[ikat] wrote ${all.length} questions -> ${OUT}`)
  console.log(`[ikat] by type:`, byType)
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
