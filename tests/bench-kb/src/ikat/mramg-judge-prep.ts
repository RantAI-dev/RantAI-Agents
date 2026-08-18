/**
 * IKAT-Bench — prepare the LLM-judged half of the MRAMG end-to-end comparison.
 *
 * The statistical half (docs/15) scored WHICH images each arm emitted. The
 * benchmark's remaining metrics — image relevance, effectiveness, position,
 * comprehensive — are LLM-judged and text-only: the judge reads the query, the
 * answer with <imgN> markers in place, and each image's context and caption.
 * That is exactly what arm A produces natively; arm B selects images but does
 * not place them, so this script adds the placement our pipeline uses: each
 * emitted figure lands after the answer sentence that matches its anchor
 * context best (cross-encoder score, CPU is plenty at this size).
 *
 * Arm B is judged in its PRE-REGISTERED admission variant (rel a=0.2 K=3,
 * fixed by the admission study before the end-to-end experiment existed),
 * because that is the configuration docs/15 puts forward.
 *
 * Blinding: the manifest interleaves both arms under neutral shuffled keys, so
 * a judge cannot systematically favour a system it cannot identify. The
 * key->arm mapping is written to a separate file consulted only at scoring.
 *
 * Output:
 *   corpus/results/endtoend/judge-manifest.jsonl   (shuffled, blind)
 *   corpus/results/endtoend/judge-key.json         (key -> {arm, qid})
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { rerankTexts } from "./systems"

const BENCH_ROOT = path.resolve(import.meta.dirname, "../..")
const DIR = process.env.MRAMG_DIR ?? path.join(BENCH_ROOT, "corpus", "mramg")
const OUT = path.join(BENCH_ROOT, "corpus", "results", "endtoend")
const SUBSET = process.env.MRAMG_SUBSET ?? "arxiv"
const CTX = 400

const sent = (t: string) => t.split(/(?<=[.!?])\s+(?=[A-Z(])/g).filter((s) => s.trim())

function loadDocs(): Map<number, { text: string; images: string[] }> {
  const out = new Map()
  for (const line of fs.readFileSync(path.join(DIR, `doc_${SUBSET}.jsonl`), "utf-8").trim().split("\n")) {
    const d = JSON.parse(line)
    out.set(d["0"], { text: d["1"] ?? "", images: d["2"] ?? [] })
  }
  return out
}

function anchorCtx(text: string, images: string[]): Map<string, string> {
  const parts = text.split("<PIC>")
  const out = new Map<string, string>()
  images.forEach((id, i) => {
    const before = (parts[i] ?? "").trim()
    const after = (parts[i + 1] ?? "").trim().slice(0, Math.floor(CTX / 3))
    out.set(id, `${before.slice(-CTX)} ${after}`.trim())
  })
  return out
}

/** Deterministic shuffle — no Math.random in this harness, and the order must
 *  reproduce so the key file always matches the manifest. */
function shuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr]
  let s = seed
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648
    const j = s % (i + 1)
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

const docs = loadDocs()
const ctxOf = (id: string): string => {
  for (const d of docs.values()) if (d.images.includes(id)) return anchorCtx(d.text, d.images).get(id) ?? ""
  return ""
}

const rows = fs.readFileSync(path.join(OUT, `answers-${SUBSET}.jsonl`), "utf-8").trim().split("\n").map((l) => JSON.parse(l))
const items: Array<{ key: string; arm: string; qid: string; query: string; answer: string; images: Array<{ tag: string; context: string; caption: string }> }> = []

for (const r of rows) {
  // Arm A: the generator already placed its markers; renumber to imgN order of appearance.
  items.push({
    key: "", arm: "A", qid: r.id, query: r.question, answer: r.ansA,
    images: (r.emittedA as string[]).map((id: string, k: number) => ({
      tag: `<img${k + 1}>`, context: ctxOf(id), caption: ctxOf(id).slice(-160),
    })),
  })

  // Arm B: pre-registered admission over the same candidates, then placement.
  const candIds: string[] = r.retrievedImages
  const scores = candIds.length ? await rerankTexts(r.question, candIds.map(ctxOf)) : []
  const ranked = candIds.map((id, k) => ({ id, s: scores[k] ?? 0 })).sort((a, b) => b.s - a.s)
  const m = ranked[0]?.s ?? 0
  const emitted = ranked.filter((x) => x.s >= 0.2 * m).slice(0, 3).map((x) => x.id)

  const sentences = sent(String(r.ansB))
  const insertAt = new Map<number, string[]>() // sentence idx -> tags
  const imgs: Array<{ tag: string; context: string; caption: string }> = []
  for (const [k, id] of emitted.entries()) {
    const ctx = ctxOf(id)
    const sScores = sentences.length ? await rerankTexts(ctx.slice(0, 200), sentences) : []
    let best = 0
    sScores.forEach((v, j) => { if ((v ?? 0) > (sScores[best] ?? 0)) best = j })
    const tag = `<img${k + 1}>`
    insertAt.set(best, [...(insertAt.get(best) ?? []), tag])
    imgs.push({ tag, context: ctx, caption: ctx.slice(-160) })
  }
  const placed = sentences.map((s, j) => s + (insertAt.get(j) ?? []).join("")).join(" ")
  items.push({ key: "", arm: "B", qid: r.id, query: r.question, answer: placed, images: imgs })
}

const shuffled = shuffle(items, 20260818)
shuffled.forEach((it, i) => { it.key = `J${String(i).padStart(3, "0")}` })
fs.writeFileSync(path.join(OUT, "judge-manifest.jsonl"),
  shuffled.map(({ arm, qid, ...pub }) => JSON.stringify(pub)).join("\n") + "\n")
fs.writeFileSync(path.join(OUT, "judge-key.json"),
  JSON.stringify(Object.fromEntries(shuffled.map((it) => [it.key, { arm: it.arm, qid: it.qid }])), null, 1))
const withImgs = shuffled.filter((i) => i.images.length).length
console.log(`${shuffled.length} items (${withImgs} carry images), blind keys J000..J${String(shuffled.length - 1).padStart(3, "0")}`)
console.log(`wrote judge-manifest.jsonl + judge-key.json`)
