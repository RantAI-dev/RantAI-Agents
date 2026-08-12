/**
 * IKAT-Bench — select figures against the ANSWER, not the question.
 *
 * Every selector so far matches a figure to the *question*. But a question is
 * short and often names nothing concrete ("Bagaimana cara mengukurnya?"), while
 * the answer the system generates names the actual concept, the units, the
 * steps. The anchor line of this project already exploits that asymmetry for
 * PLACEMENT — a figure goes where its chunk is cited — and never once used it for
 * SELECTION.
 *
 * The gold answers in the question set cannot stand in for this: their median
 * length is 17 characters and 96 of 165 are under 40, because the v1 generator
 * produced extraction questions whose answers are single numbers. So the answer
 * has to be generated the way the system would generate it — from retrieved text
 * only, with no figure in view, which is also what keeps the comparison fair.
 *
 * Two stages, cached separately so the expensive one runs once:
 *   answers  generate an answer per question from the top-K text chunks
 *   score    rerank candidates against question / answer / both, and report all
 *            three side by side
 *
 * Usage:
 *   IKAT_PROVIDER=ugm bun tests/bench-kb/src/ikat/answer-conditioned.ts answers
 *   IKAT_PROVIDER=ugm bun tests/bench-kb/src/ikat/answer-conditioned.ts score
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { cosine } from "../lib"
import { genChat as chat, genEmbed as embed } from "./providers"
import { buildIndex, rerankTexts, figureIndexText, EMBED_MODEL, GEN_MODEL, TOP_K, FIG_K } from "./systems"

const BENCH_ROOT = path.resolve(import.meta.dirname, "../..")
const CORPUS = path.join(BENCH_ROOT, "corpus", process.env.IKAT_CORPUS ?? "ugm3-built")
const QFILE = path.join(BENCH_ROOT, "corpus", process.env.IKAT_QUESTIONS ?? "questions-sonnet-gold.json")
const DESC_DIR = path.join(BENCH_ROOT, "corpus", process.env.IKAT_DESCRIPTIONS ?? "descriptions")
const ANSWERS = path.join(BENCH_ROOT, "corpus", process.env.IKAT_ANSWERS ?? "generated-answers.json")
const MIN = Number(process.env.IKAT_RERANK_MIN ?? 0.1)
const TOPK = Number(process.env.IKAT_RERANK_TOP_K ?? 2)

interface Q { id: string; question: string; docSlug: string; goldFigureIds: string[] }

const PROMPT = `Anda adalah asisten belajar untuk siswa sekolah di Indonesia. Jawab pertanyaan HANYA berdasarkan kutipan buku di bawah.

Pertanyaan: {Q}

Kutipan:
{CTX}

Jelaskan seperti seorang guru kepada siswa dalam 3-5 kalimat bahasa Indonesia.

Jawaban:`

function loadDescriptions(): Map<string, string> {
  const m = new Map<string, string>()
  if (!fs.existsSync(DESC_DIR)) return m
  for (const f of fs.readdirSync(DESC_DIR).filter((x) => x.endsWith(".json")))
    for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(path.join(DESC_DIR, f), "utf-8")) as Record<string, string>))
      m.set(k, v)
  return m
}

async function generateAnswers() {
  const questions = JSON.parse(fs.readFileSync(QFILE, "utf-8")) as Q[]
  const out: Record<string, string> = fs.existsSync(ANSWERS) ? JSON.parse(fs.readFileSync(ANSWERS, "utf-8")) : {}
  const desc = loadDescriptions()

  for (const file of fs.readdirSync(CORPUS).filter((f) => f.endsWith(".json")).sort()) {
    const doc = JSON.parse(fs.readFileSync(path.join(CORPUS, file), "utf-8"))
    const dq = questions.filter((q) => q.docSlug === doc.slug && !out[q.id])
    if (!dq.length) continue
    const idx = await buildIndex(doc, desc)
    for (const q of dq) {
      const qVec = (await embed(EMBED_MODEL, q.question)).vectors[0]
      const chunks = doc.chunks
        .map((c: any) => ({ c, s: cosine(qVec, idx.chunkVecs.get(c.id) ?? []) }))
        .sort((a: any, b: any) => b.s - a.s)
        .slice(0, TOP_K)
        .map((x: any) => x.c)
      // Text only. A figure in the prompt would let the answer echo the figure we
      // are about to select, which is the circularity this experiment must avoid.
      const ctx = chunks.map((c: any, i: number) => `[${i + 1}] ${c.text}`).join("\n\n")
      try {
        const res = await chat(GEN_MODEL, [{ role: "user", content: PROMPT.replace("{Q}", q.question).replace("{CTX}", ctx) }], 400)
        out[q.id] = res.text.trim()
      } catch {
        out[q.id] = ""
      }
      if (Object.keys(out).length % 10 === 0) {
        fs.writeFileSync(ANSWERS, JSON.stringify(out, null, 1))
        console.log(`  ${Object.keys(out).length}/${questions.length} answered`)
      }
    }
  }
  fs.writeFileSync(ANSWERS, JSON.stringify(out, null, 1))
  const lens = Object.values(out).map((a) => a.length).filter(Boolean)
  console.log(`\n${Object.keys(out).length} answers -> ${ANSWERS}`)
  console.log(`median length ${lens.sort((a, b) => a - b)[Math.floor(lens.length / 2)]} chars`)
}

async function score() {
  const questions = JSON.parse(fs.readFileSync(QFILE, "utf-8")) as Q[]
  const answers = JSON.parse(fs.readFileSync(ANSWERS, "utf-8")) as Record<string, string>
  const desc = loadDescriptions()

  const modes = ["question", "answer", "both"] as const
  const acc: Record<string, { tp: number; fp: number; fn: number; em: number; sil: number; n: number }> = {}
  for (const m of modes) acc[m] = { tp: 0, fp: 0, fn: 0, em: 0, sil: 0, n: 0 }

  for (const [i, file] of fs.readdirSync(CORPUS).filter((f) => f.endsWith(".json")).sort().entries()) {
    const doc = JSON.parse(fs.readFileSync(path.join(CORPUS, file), "utf-8"))
    const dq = questions.filter((q) => q.docSlug === doc.slug)
    if (!dq.length) continue
    const idx = await buildIndex(doc, desc)
    for (const q of dq) {
      const qVec = (await embed(EMBED_MODEL, q.question)).vectors[0]
      const ranked = doc.chunks
        .map((c: any) => ({ c, s: cosine(qVec, idx.chunkVecs.get(c.id) ?? []) }))
        .sort((a: any, b: any) => b.s - a.s)
      const wide = new Set(ranked.slice(0, FIG_K).map((x: any) => x.c.id))
      const usable = doc.figures.filter((f: any) => !f.decorative)
      const bySim = usable
        .map((f: any) => ({ f, s: cosine(qVec, idx.figureVecs.get(f.id) ?? []) }))
        .sort((a: any, b: any) => b.s - a.s)
      const cand = new Map<string, any>()
      for (const f of usable) if (f.anchorChunkId && wide.has(f.anchorChunkId)) cand.set(f.id, f)
      for (const e of bySim.slice(0, 12)) cand.set(e.f.id, e.f)
      const list = [...cand.values()]
      if (!list.length) continue
      const texts = list.map((f: any) => figureIndexText(f, desc.get(f.id)))
      const ans = answers[q.id] ?? ""

      for (const m of modes) {
        // An empty answer would make `answer` mode score an empty query, which
        // reads as a system failure rather than the hypothesis being wrong.
        const query = m === "question" ? q.question : m === "answer" ? ans || q.question : `${q.question} ${ans}`.trim()
        const scores = await rerankTexts(query, texts)
        const picked = list
          .map((f: any, j: number) => ({ id: f.id, s: scores[j] ?? 0 }))
          .filter((x) => x.s >= MIN)
          .sort((a, b) => b.s - a.s)
          .slice(0, TOPK)
          .map((x) => x.id)
        const g = new Set(q.goldFigureIds ?? [])
        const a = acc[m]
        a.n++
        a.em += picked.length
        if (!picked.length) a.sil++
        for (const p of picked) (g.has(p) ? a.tp++ : a.fp++)
        for (const x of g) if (!picked.includes(x)) a.fn++
      }
    }
    console.log(`  [${i + 1}] ${doc.slug}`)
  }

  console.log(`\n=== rerank query: question vs generated answer — ${acc.question.n} questions ===`)
  console.log(`${"query".padEnd(10)} ${"P".padStart(6)} ${"R".padStart(6)} ${"F1".padStart(6)} ${"fig/q".padStart(7)} ${"silent".padStart(7)}`)
  for (const m of modes) {
    const a = acc[m]
    const P = a.tp + a.fp ? a.tp / (a.tp + a.fp) : 0
    const R = a.tp + a.fn ? a.tp / (a.tp + a.fn) : 0
    const F = P + R ? (2 * P * R) / (P + R) : 0
    console.log(
      `${m.padEnd(10)} ${P.toFixed(3).padStart(6)} ${R.toFixed(3).padStart(6)} ${F.toFixed(3).padStart(6)} ` +
        `${(a.em / a.n).toFixed(2).padStart(7)} ${((100 * a.sil) / a.n).toFixed(0).padStart(6)}%`,
    )
  }
}

async function main() {
  const mode = process.argv[2]
  if (mode === "answers") await generateAnswers()
  else if (mode === "score") await score()
  else {
    console.error("usage: answer-conditioned.ts answers|score")
    process.exit(1)
  }
}

if (import.meta.main) main()
