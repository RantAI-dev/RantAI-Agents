/**
 * IKAT-Bench — evaluate our figure selection on MRAMG-Bench.
 *
 * Every number this project has produced was measured on a private corpus with a
 * gold standard we built ourselves and then found to be partly broken (80% of it
 * agrees with human judgement at chance — docs/paper/07-human-gold-audit.md).
 * That makes the results uncomparable to anything published, however carefully
 * they are tested internally.
 *
 * MRAMG-Bench (arXiv:2502.04176) fixes that: public data, published per-subset
 * numbers, and gold image lists we did not author. The Recipe subset is the one
 * that discriminates — its documents carry ~5 images each, so selection is a
 * real choice rather than a formality (on their Web subset the average document
 * has 1.0 images and every method scores near-identically).
 *
 * PROTOCOL, kept as close to theirs as our task allows:
 *   - Candidates are the images of the question's provenance document, which is
 *     what their LLM-based baseline sees.
 *   - Each image's text is the document prose IMMEDIATELY BEFORE its <PIC>
 *     placeholder. The document stores images inline in reading order, so this
 *     is the same anchor our own pipeline uses, and the same information their
 *     placeholder-based baseline has.
 *   - Image Precision, as defined in the paper: "the percentage of correct
 *     images in the multimodal answer relative to the total number of inserted
 *     images". Recall and F1 are reported alongside because precision alone can
 *     be bought with silence.
 *
 * What is NOT the same: their systems generate an answer and insert images while
 * we only select. Precision is computed over the same quantity — images emitted
 * versus images correct — so the comparison is meaningful, but it is a selection
 * result placed next to end-to-end systems, and that is stated rather than
 * glossed.
 *
 * Usage:
 *   IKAT_PROVIDER=ugm bun tests/bench-kb/src/ikat/mramg-eval.ts [limit]
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { rerankTexts } from "./systems"

const DIR = process.env.MRAMG_DIR ?? "/ikat/mramg"
const SUBSET = process.env.MRAMG_SUBSET ?? "recipe"
const TOP_K = Number(process.env.IKAT_RERANK_TOP_K ?? 2)
const MIN = Number(process.env.IKAT_RERANK_MIN ?? 0.1)
/** Characters of preceding prose used to represent an image. */
const CTX = Number(process.env.MRAMG_CTX ?? 400)

interface QA { id: string; question: string; provenance: number[]; images_list: string[] }

function loadDocs(): Map<number, { text: string; images: string[] }> {
  const out = new Map<number, { text: string; images: string[] }>()
  for (const line of fs.readFileSync(path.join(DIR, `doc_${SUBSET}.jsonl`), "utf-8").trim().split("\n")) {
    const d = JSON.parse(line) as Record<string, unknown>
    out.set(d["0"] as number, { text: (d["1"] as string) ?? "", images: (d["2"] as string[]) ?? [] })
  }
  return out
}

/** Text standing in for each image: the prose that precedes its placeholder. */
function imageContexts(text: string, images: string[]): Map<string, string> {
  const parts = text.split("<PIC>")
  const out = new Map<string, string>()
  images.forEach((id, i) => {
    // parts[i] is everything before placeholder i. Take its tail — the sentences
    // nearest the image, not the top of the document.
    const before = (parts[i] ?? "").trim()
    const after = (parts[i + 1] ?? "").trim().slice(0, Math.floor(CTX / 3))
    out.set(id, `${before.slice(-CTX)} ${after}`.trim())
  })
  return out
}

async function main() {
  const limit = Number(process.argv[2] ?? process.env.MRAMG_LIMIT ?? 300)
  const docs = loadDocs()
  const qa = fs
    .readFileSync(path.join(DIR, `${SUBSET}_mqa.jsonl`), "utf-8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as QA)
    .slice(0, limit)

  console.log(`MRAMG-${SUBSET}: ${qa.length} questions, ${docs.size} documents`)
  console.log(`selection: top-${TOP_K} @ ${MIN}, image text = ${CTX} chars before its placeholder\n`)

  let tp = 0
  let fp = 0
  let fn = 0
  let emitted = 0
  let silent = 0
  let candTotal = 0
  let skipped = 0

  for (const [n, q] of qa.entries()) {
    const cands: Array<{ id: string; text: string }> = []
    for (const p of q.provenance ?? []) {
      const d = docs.get(p)
      if (!d) continue
      const ctx = imageContexts(d.text, d.images)
      for (const id of d.images) cands.push({ id, text: ctx.get(id) ?? "" })
    }
    if (!cands.length) {
      skipped++
      continue
    }
    candTotal += cands.length

    const scores = await rerankTexts(q.question, cands.map((c) => c.text))
    const picked = cands
      .map((c, i) => ({ id: c.id, s: scores[i] ?? 0 }))
      .filter((x) => x.s >= MIN)
      .sort((a, b) => b.s - a.s)
      .slice(0, TOP_K)
      .map((x) => x.id)

    const gold = new Set(q.images_list ?? [])
    emitted += picked.length
    if (!picked.length) silent++
    for (const p of picked) (gold.has(p) ? tp++ : fp++)
    for (const g of gold) if (!picked.includes(g)) fn++

    if ((n + 1) % 50 === 0) console.log(`  ${n + 1}/${qa.length}…`)
  }

  const P = tp + fp ? tp / (tp + fp) : 0
  const R = tp + fn ? tp / (tp + fn) : 0
  const F = P + R ? (2 * P * R) / (P + R) : 0
  const n = qa.length - skipped

  console.log(`\nscored ${n} questions (${skipped} skipped: provenance doc missing)`)
  console.log(`mean candidates per question: ${(candTotal / (n || 1)).toFixed(1)}`)
  console.log(`emitted ${emitted} images, silent on ${((100 * silent) / (n || 1)).toFixed(0)}% of questions\n`)
  console.log(`Image Precision  ${(100 * P).toFixed(2)}`)
  console.log(`Image Recall     ${(100 * R).toFixed(2)}`)
  console.log(`Image F1         ${(100 * F).toFixed(2)}`)

  // Published Image Precision, Table 4 of arXiv:2502.04176.
  //
  // The table reports by DOMAIN, not by subset — a distinction that nearly
  // produced a wrong comparison here. Academic = arxiv alone; Lifestyle pools
  // recipe AND manual, so neither of those may be compared to it on its own.
  const PUBLISHED: Record<string, { domain: string; rows: string[] }> = {
    arxiv: {
      domain: "Academic Data (= arxiv alone)",
      rows: [
        "LLM-based   GPT-4o 65.28 | Claude-3.5-Sonnet 62.17 | Gemini-1.5-Pro 59.85",
        "            DeepSeek-V3 46.57 | Llama-3.3-70B 38.78 | Llama-3.1-8B 1.50",
        "MLLM-based  GPT-4o 60.39 | Gemini-1.5-Pro 58.13 | Claude-3.5-Sonnet 47.12",
        "            InternVL-2.5-78B 36.62 | Qwen2-VL-72B 31.99 | Qwen2-VL-7B 1.63",
        "Rule-based  DeepSeek-V3 56.12 | GPT-4o 55.42 | Claude-3.5-Sonnet 55.17",
        "            Llama-3.3-70B 53.00 | InternVL-2.5-78B 52.21 | Qwen2-VL-7B 49.17",
      ],
    },
    recipe: { domain: "Lifestyle Data (= recipe + manual POOLED — not comparable to one alone)", rows: [] },
    manual: { domain: "Lifestyle Data (= recipe + manual POOLED — not comparable to one alone)", rows: [] },
  }
  const pub = PUBLISHED[SUBSET]
  if (pub) {
    console.log(`\npublished Image Precision — ${pub.domain}:`)
    if (pub.rows.length) for (const r of pub.rows) console.log(`  ${r}`)
    else
      console.log(
        `  Lifestyle: Gemini-1.5-Pro 62.23 | Claude-3.5-Sonnet 59.83 | GPT-4o 47.48 |\n` +
          `             DeepSeek-V3 45.71 | Llama-3.3-70B 35.29 | Llama-3.1-8B 11.71\n` +
          `  Pool this subset WITH the other before comparing.`,
      )
  }
}

if (import.meta.main) main()
