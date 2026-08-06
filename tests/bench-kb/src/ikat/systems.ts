/**
 * IKAT-Bench step 4 — the systems under comparison.
 *
 * Every system shares the SAME corpus, chunker, embedder, generator, and top-k.
 * Only the figure mechanism differs. That is the entire point: any difference in
 * the results has exactly one cause, and no baseline can be accused of losing
 * because it was given a worse retriever.
 *
 *   S0 text_only     no figures at all — the floor, and the instrument for C1
 *   S1 caption_match our current production mechanism: caption keyword overlap
 *   S2 co_embed      figure embedded on its own text, competing in one index
 *   S4 anchor        ours: figure rides its anchor chunk, placed at that chunk's
 *                    citation
 *   S5 anchor_vlm    S4 plus a VLM description written once at ingest
 *   S6 anchor_hybrid ours: anchor for precision, description-similarity for
 *                    recall — built because S4 lost 3x to S2 on the questions
 *                    only a figure can answer, and the cause was structural
 *                    (anchoring inherits its recall from TEXT retrieval)
 *
 * S3 (VLM-over-page) and S6 (fine-tuned VLM) are not implemented here: both need
 * either per-query page images or a fine-tune, and are scoped separately. Their
 * absence is stated in the paper rather than papered over.
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { cosine, sleep } from "../lib"
import { genChat as chat, genEmbed as embed } from "./providers"
import { splitSentences } from "../placement-metrics"
import type { BuiltDoc, Chunk, FigureRecord } from "./build-corpus"

const BENCH_ROOT = path.resolve(import.meta.dirname, "../..")
// Which corpus's crops to read. The two extraction paths keep separate figure
// sets and must not be crossed — a figure id from one does not exist in the other.
const FIG_DIR = path.join(BENCH_ROOT, "corpus", process.env.IKAT_FIGURES ?? "figures")

export const EMBED_MODEL = process.env.IKAT_EMBED_MODEL ?? "qwen/qwen3-embedding-8b"
/** Not the judge's vendor — enforced by assertJudgeIndependence at run time. */
export const GEN_MODEL = process.env.IKAT_GEN_MODEL ?? "google/gemini-3-flash-preview"
export const TOP_K = 5

export type SystemId =
  | "text_only"
  | "caption_match"
  | "co_embed"
  | "anchor"
  | "anchor_vlm"
  | "anchor_hybrid"
  // published baselines, implemented so the comparison is against methods that
  // exist rather than against strawmen
  | "mramg_match"
  | "vinqa_cite"
  // Placement-only variants: OUR anchor selection, THEIR placement rule. These
  // isolate the placement question by holding selection fixed, which neither the
  // published baselines nor our own systems do on their own.
  | "anchor_mramg_place"
  | "anchor_vinqa_place"

/** One figure as the system chose to emit it. */
export interface EmittedFigure {
  figureId: string
  /** Insertion slot in the answer: 0 = before sentence 1, j = after sentence j. */
  slot: number
}

export interface SystemOutput {
  answer: string
  sentences: string[]
  figures: EmittedFigure[]
  retrievedChunkIds: string[]
  ms: number
  genTokens: number
  /** Vision-model calls made while serving this query. Zero for S0/S1/S2/S4. */
  vlmCalls: number
}

// ── Shared index ───────────────────────────────────────────────────────────

export interface DocIndex {
  doc: BuiltDoc
  chunkVecs: Map<string, number[]>
  /** Text embedded per figure for the co-embedding system (S2). */
  figureVecs: Map<string, number[]>
  /** VLM description per figure, for S5. Empty unless descriptions were built. */
  descriptions: Map<string, string>
}

/**
 * Batch-embed with a pacing delay.
 *
 * The delay is deliberately generous: indexing 1,675 chunks in one burst tripped
 * a provider per-minute quota mid-run. Retry/backoff in the provider handles the
 * spikes, but pacing avoids provoking them, which matters more for an unattended
 * sweep than the few minutes it costs. Tunable via IKAT_EMBED_DELAY_MS.
 */
async function embedAll(texts: string[], batch = 16): Promise<number[][]> {
  const delay = Number(process.env.IKAT_EMBED_DELAY_MS ?? 350)
  const out: number[][] = []
  for (let i = 0; i < texts.length; i += batch) {
    const r = await embed(EMBED_MODEL, texts.slice(i, i + batch))
    out.push(...r.vectors)
    await sleep(delay)
  }
  return out
}

/**
 * Text used to represent a figure in a retrieval index.
 *
 * This is deliberately the SAME function for S1 and S2 so the two differ only in
 * how that text is used (keyword overlap vs. vector competition), not in what
 * they know about the figure. Mirrors production: printed caption when the book
 * has one, otherwise the page's prose stands in for it.
 */
export function figureIndexText(f: FigureRecord, description?: string): string {
  if (description) return `[Gambar] ${description}`
  if (f.caption) return `[Gambar] ${f.caption}`
  return `[Gambar] Gambar halaman ${f.page + 1}: ${f.ctx.slice(0, 400)}`
}

export async function buildIndex(doc: BuiltDoc, descriptions?: Map<string, string>): Promise<DocIndex> {
  const chunks = doc.chunks
  const chunkVecs = new Map<string, number[]>()
  const vecs = await embedAll(chunks.map((c) => c.text))
  chunks.forEach((c, i) => chunkVecs.set(c.id, vecs[i]))

  const figs = doc.figures.filter((f) => !f.decorative)
  const figureVecs = new Map<string, number[]>()
  if (figs.length) {
    const fv = await embedAll(figs.map((f) => figureIndexText(f, descriptions?.get(f.id))))
    figs.forEach((f, i) => figureVecs.set(f.id, fv[i]))
  }

  return { doc, chunkVecs, figureVecs, descriptions: descriptions ?? new Map() }
}

// ── Retrieval + generation ─────────────────────────────────────────────────

/**
 * The answer prompt is identical for every system. What differs is WHICH figure
 * evidence gets appended to the passage list — that, and nothing else, is the
 * independent variable.
 *
 * It asks for a 3-6 sentence explanation rather than a terse answer, for a reason
 * independent of any result: the first scored run's generator produced answers
 * with a MEDIAN OF ONE SENTENCE. A one-sentence answer offers two insertion
 * slots, so |PD| cannot exceed 1 and PA@1 is ~1.0 for every system by
 * construction — the placement dimension becomes unmeasurable while the numbers
 * look like success. A one-sentence reply is also not the artifact this work is
 * about: a tutor explains.
 */
const ANSWER_PROMPT = `Anda adalah asisten belajar untuk siswa sekolah di Indonesia. Jawab pertanyaan HANYA berdasarkan kutipan buku di bawah.

Setiap kutipan diberi nomor. Ketika Anda memakai isi sebuah kutipan, tuliskan penanda [n] di akhir kalimat tersebut.

Jika kutipan tidak memuat jawabannya, katakan: "Tidak ada di buku."

Pertanyaan: {Q}

Kutipan:
{CTX}

Jelaskan seperti seorang guru kepada siswa: mulai dari jawabannya, lalu uraikan alasannya atau
langkah-langkahnya dalam beberapa kalimat. Tulis 3-6 kalimat dalam bahasa Indonesia.

Jawaban:`

function retrieveChunks(idx: DocIndex, qVec: number[], k: number): Chunk[] {
  return idx.doc.chunks
    .map((c) => ({ c, s: cosine(qVec, idx.chunkVecs.get(c.id) ?? []) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, k)
    .map((x) => x.c)
}

async function generate(
  question: string,
  chunks: Chunk[],
  figureLines: string[],
): Promise<{ text: string; ms: number; tokens: number }> {
  const passages = chunks.map((c, i) => `[${i + 1}] ${c.text}`)
  // Figure evidence continues the same numbering so the model can cite it.
  figureLines.forEach((l, i) => passages.push(`[${chunks.length + i + 1}] ${l}`))
  const res = await chat(
    GEN_MODEL,
    [{ role: "user", content: ANSWER_PROMPT.replace("{Q}", question).replace("{CTX}", passages.join("\n\n")) }],
    900,
  )
  return { text: res.text.trim(), ms: res.ms, tokens: res.usage?.completion_tokens ?? 0 }
}

/**
 * Index of the sentence carrying citation [n], or -1.
 *
 * This is the mechanism S4/S5 use for placement: the figure goes where its
 * anchor chunk is actually cited, so placement is decided by the same evidence
 * trail the reader can already see.
 */
export function sentenceCiting(sentences: string[], citationNo: number): number {
  const re = new RegExp(`\\[${citationNo}\\]`)
  for (let i = 0; i < sentences.length; i++) if (re.test(sentences[i])) return i
  return -1
}

// ── Figure selection per system ────────────────────────────────────────────

const STOP = new Set(
  "yang dan atau dengan untuk pada dari ke di itu ini adalah akan tidak juga dalam sebagai oleh karena agar bisa dapat ada satu dua gambar tabel halaman".split(
    " ",
  ),
)

function keywords(s: string): string[] {
  return Array.from(
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 4 && !STOP.has(w)),
    ),
  )
}

/** Figures a system decides are relevant, BEFORE placement is worked out. */
function selectFigures(
  system: SystemId,
  idx: DocIndex,
  question: string,
  qVec: number[],
  retrieved: Chunk[],
  limit: number,
): FigureRecord[] {
  const usable = idx.doc.figures.filter((f) => !f.decorative)

  if (system === "text_only") return []

  if (system === "caption_match") {
    // Today's production behaviour: vocabulary overlap with the query (strong)
    // or with the retrieved passages (weak).
    const q = question.toLowerCase()
    const body = retrieved.map((c) => c.text.toLowerCase()).join(" ")
    const scored: Array<{ f: FigureRecord; score: number }> = []
    for (const f of usable) {
      const kws = keywords(figureIndexText(f, idx.descriptions.get(f.id)))
      if (!kws.length) continue
      const score = kws.some((k) => q.includes(k)) ? 2 : kws.some((k) => body.includes(k)) ? 1 : 0
      if (score > 0) scored.push({ f, score })
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.f)
  }

  // co_embed and the two published baselines all select by similarity over the
  // figure's own text. Only their PLACEMENT differs, which is the point: it lets
  // the placement rules be compared without selection confounding them.
  if (system === "co_embed" || system === "mramg_match" || system === "vinqa_cite") {
    const byId = new Map(usable.map((f) => [f.id, f]))
    return Array.from(idx.figureVecs.entries())
      .map(([id, v]) => ({ id, s: cosine(qVec, v) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, limit)
      .map((x) => byId.get(x.id))
      .filter((f): f is FigureRecord => !!f)
  }

  // anchor / anchor_vlm: a figure is relevant exactly when the chunk it is
  // anchored in was retrieved. No similarity, no keywords, no model.
  const ids = new Set(retrieved.map((c) => c.id))
  const anchored = usable.filter((f) => f.anchorChunkId && ids.has(f.anchorChunkId))

  if (system !== "anchor_hybrid") return anchored.slice(0, limit)

  // anchor_hybrid: anchoring is precise but its RECALL is inherited from text
  // retrieval — a question answerable only from the picture may never surface the
  // chunk that holds it. Fill the remaining slots from description similarity,
  // which has no such dependency. Anchored figures keep priority, so precision is
  // preserved and similarity only reaches for what anchoring could not see.
  const out = anchored.slice(0, limit)
  if (out.length >= limit) return out
  const taken = new Set(out.map((f) => f.id))
  const byId = new Map(usable.map((f) => [f.id, f]))

  // Admission rule, deliberately PARAMETER-FREE: a figure may be pulled in by
  // description similarity only if it scores at least as high as the weakest
  // TEXT chunk we already accepted into the context. If a passage that similar
  // was good enough to retrieve, a figure that similar is good enough to show;
  // if not, reaching for it is a guess.
  //
  // The first version of this system had no gate and always filled the empty
  // slots. It doubled figure-dependent performance and LOST overall accuracy,
  // because on questions with few anchored figures it spent every spare slot on
  // whatever ranked highest, however weakly. A tuned threshold would have fixed
  // the number while fitting the test set; this rule is fixed by the retriever's
  // own decisions and has nothing to tune.
  const floor = retrieved.length
    ? Math.min(...retrieved.map((c) => cosine(qVec, idx.chunkVecs.get(c.id) ?? [])))
    : 0

  const extra = Array.from(idx.figureVecs.entries())
    .filter(([id]) => !taken.has(id))
    .map(([id, v]) => ({ id, s: cosine(qVec, v) }))
    .filter((x) => x.s >= floor)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit - out.length)
    .map((x) => byId.get(x.id))
    .filter((f): f is FigureRecord => !!f)
  return [...out, ...extra]
}

/** Where each selected figure is emitted in the finished answer. */
/**
 * Max-weight bipartite matching, sentences x figures, at most one figure per
 * sentence — the placement rule published with MRAMG-Bench (SIGIR 2025).
 *
 * Sizes here are tiny (<=3 figures, a handful of sentences), so this enumerates
 * assignments exactly rather than running Hungarian/Blossom. Exactness matters
 * more than asymptotics at this scale, and a greedy approximation would make the
 * baseline lose for the wrong reason.
 */
export function bipartiteAssign(weights: number[][], nSentences: number): number[] {
  const nFig = weights.length
  if (!nFig || !nSentences) return new Array<number>(nFig).fill(nSentences)
  const best = { score: -Infinity, assign: new Array<number>(nFig).fill(nSentences) }
  const used = new Set<number>()
  const assign = new Array<number>(nFig).fill(nSentences)

  const rec = (i: number, score: number) => {
    if (i === nFig) {
      if (score > best.score) {
        best.score = score
        best.assign = assign.slice()
      }
      return
    }
    for (let sIdx = 0; sIdx < nSentences; sIdx++) {
      if (used.has(sIdx)) continue
      used.add(sIdx)
      assign[i] = sIdx
      rec(i + 1, score + weights[i][sIdx])
      used.delete(sIdx)
    }
    // Leaving a figure unplaced must be a legal move, not a dead end. With more
    // figures than sentences the one-per-sentence constraint makes a complete
    // matching impossible, and a recursion that only ever assigns would explore
    // no valid branch at all and park EVERY figure — losing the placements it
    // could have made. Unplaced contributes zero weight and renders at the end.
    assign[i] = nSentences
    rec(i + 1, score)
  }
  rec(0, 0)
  return best.assign
}

function placeFigures(
  system: SystemId,
  idx: DocIndex,
  selected: FigureRecord[],
  retrieved: Chunk[],
  sentences: string[],
  /** figure x sentence similarity, supplied only for the matching baseline */
  weights?: number[][],
): EmittedFigure[] {
  if (system === "mramg_match" || system === "anchor_mramg_place") {
    // MRAMG-Bench's rule: max-weight assignment, at most one figure per
    // sentence. Placement is "after" the assigned sentence, matching how every
    // other system here reports a slot.
    const assign = bipartiteAssign(weights ?? [], sentences.length)
    return selected.map((f, i) => ({
      figureId: f.id,
      slot: (assign[i] ?? sentences.length) + 1 > sentences.length ? sentences.length : assign[i] + 1,
    }))
  }

  if (system === "vinqa_cite" || system === "anchor_vinqa_place") {
    // VinQA's rule: the figure goes where the answer cites its identifier, and
    // document position is deliberately NOT used. This is the control that
    // isolates what the reading-order anchor contributes over citation alone.
    return selected.map((f, i) => {
      const at = sentenceCiting(sentences, retrieved.length + i + 1)
      return { figureId: f.id, slot: at >= 0 ? at + 1 : sentences.length }
    })
  }

  if (system === "co_embed") {
    // This design carries no positional signal at all, so figures land at the
    // end — precisely the placement weakness the benchmark exists to expose.
    return selected.map((f) => ({ figureId: f.id, slot: sentences.length }))
  }

  if (system === "caption_match") {
    return selected.map((f) => {
      const kws = keywords(figureIndexText(f, idx.descriptions.get(f.id)))
      let best = sentences.length
      let bestHits = 0
      sentences.forEach((s, i) => {
        const low = s.toLowerCase()
        const hits = kws.filter((k) => low.includes(k)).length
        if (hits > bestHits) {
          bestHits = hits
          best = i + 1
        }
      })
      return { figureId: f.id, slot: best }
    })
  }

  // anchor / anchor_vlm / anchor_hybrid: emit at the sentence citing the figure's
  // anchor chunk.
  //
  // NOTE ON CIRCULARITY: placement deliberately does NOT use similarity between
  // the answer's sentences and the figure's source context. That similarity is
  // the definition of ideal() in the metric, so a system using it would score
  // |PD| = 0 by construction and the number would mean nothing. Placement here
  // uses only the citation trail, which is independent of the metric.
  const citationOf = new Map(retrieved.map((c, i) => [c.id, i + 1]))
  return selected.map((f, i) => {
    const n = f.anchorChunkId ? citationOf.get(f.anchorChunkId) : undefined
    let at = n ? sentenceCiting(sentences, n) : -1

    // Hybrid only: a figure pulled in by description similarity has no retrieved
    // chunk to cite, but it IS handed to the generator as its own numbered
    // passage — so look for a citation of that passage instead.
    if (at < 0 && system === "anchor_hybrid") {
      at = sentenceCiting(sentences, retrieved.length + i + 1)
    }

    // Nothing cited: the generator did not visibly use it, so there is no anchor
    // in the answer. Falling back to the end is honest, and the placement metric
    // counts it against us exactly like any other misplacement.
    return { figureId: f.id, slot: at >= 0 ? at + 1 : sentences.length }
  })
}

// ── Runner ─────────────────────────────────────────────────────────────────

export async function runSystem(
  system: SystemId,
  idx: DocIndex,
  question: string,
  maxFigures = 3,
): Promise<SystemOutput> {
  const t0 = Date.now()
  const qVec = (await embed(EMBED_MODEL, question)).vectors[0]
  const retrieved = retrieveChunks(idx, qVec, TOP_K)
  const selected = selectFigures(system, idx, question, qVec, retrieved, maxFigures)

  // Figure evidence handed to the generator. This is what makes C1 testable:
  // only a system that actually tells the model what is IN the figure can answer
  // a figure-dependent question. Caption/anchor systems can pass only the thin
  // text the book gives them; S5 passes a real description.
  const figureLines = selected.map((f) => figureIndexText(f, idx.descriptions.get(f.id)))

  const gen = await generate(question, retrieved, figureLines)
  const sentences = splitSentences(gen.text)

  // The matching baseline needs figure x sentence similarity. It is computed
  // from the figure's OWN text (description/caption), never from its source
  // context — ctx is what defines ideal() in the metric, so using it would make
  // the baseline score |PD| = 0 by construction and mean nothing.
  let weights: number[][] | undefined
  if ((system === "mramg_match" || system === "anchor_mramg_place") && selected.length && sentences.length) {
    const sentVecs = (await embed(EMBED_MODEL, sentences)).vectors
    const figVecs = (await embed(EMBED_MODEL, figureLines)).vectors
    weights = figVecs.map((fv) => sentVecs.map((sv) => cosine(fv, sv)))
  }

  const figures = placeFigures(system, idx, selected, retrieved, sentences, weights)

  return {
    answer: gen.text,
    sentences,
    figures,
    retrievedChunkIds: retrieved.map((c) => c.id),
    ms: Date.now() - t0,
    genTokens: gen.tokens,
    // Every implemented system serves without a vision model. S5's VLM cost is
    // paid once at ingest, not per query — that is the deployment claim.
    vlmCalls: 0,
  }
}

// ── S5 ingest-time descriptions ────────────────────────────────────────────

const DESCRIBE_PROMPT = `Gambar berikut diambil dari buku pelajaran sekolah dasar di Indonesia.

Tulis deskripsi SATU-DUA kalimat dalam bahasa Indonesia yang menjelaskan: apa yang ditampilkan, bagian
yang diberi label (jika ada), dan konsep yang diilustrasikan. Tulis untuk membantu siswa memahami,
bukan sekadar menyebut objek. Jangan menyebut "gambar ini" — langsung isi.`

/**
 * Build the S5 descriptions once, cached to disk. This is the "pay at ingest,
 * not per query" half of the cost argument, so it must be measured separately
 * from serving and reported as such.
 */
export async function buildDescriptions(
  doc: BuiltDoc,
  model: string,
  cacheFile: string,
): Promise<Map<string, string>> {
  const cache: Record<string, string> = fs.existsSync(cacheFile)
    ? JSON.parse(fs.readFileSync(cacheFile, "utf-8"))
    : {}
  const figs = doc.figures.filter((f) => !f.decorative)

  let made = 0
  for (const f of figs) {
    if (cache[f.id]) continue
    const p = path.join(FIG_DIR, f.assetFile)
    if (!fs.existsSync(p)) continue
    try {
      const url = `data:image/png;base64,${fs.readFileSync(p).toString("base64")}`
      const res = await chat(
        model,
        [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url } },
              { type: "text", text: DESCRIBE_PROMPT },
            ],
          },
        ],
        300,
      )
      cache[f.id] = res.text.trim().slice(0, 400)
      made++
      if (made % 20 === 0) fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2))
    } catch (err) {
      console.warn(`[ikat] describe failed ${f.id}: ${err instanceof Error ? err.message : err}`)
    }
  }
  fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2))
  console.log(`[ikat] descriptions: ${Object.keys(cache).length} cached (${made} new) for ${doc.slug}`)
  return new Map(Object.entries(cache))
}
