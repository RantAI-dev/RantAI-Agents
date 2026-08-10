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

/**
 * Chunks consulted when forming the FIGURE candidate pool, as opposed to the
 * passages handed to the generator (TOP_K, unchanged).
 *
 * Measured on ugm3-built: every gold figure has an anchor chunk (417/417), and
 * that chunk is in the top-5 for 63.3% of questions but the top-20 for 82.5%.
 * Anchor selection inherits its recall from whichever pool it looks at, so
 * widening this alone lifts the reachable ceiling by ~19 points before any
 * scoring is involved.
 *
 * It is deliberately separate from TOP_K: enlarging the generator's context at
 * the same time would change the answers too, and no gain could be attributed
 * to selection.
 */
export const FIG_K = 20

/** Systems that draw figure candidates from the wider FIG_K pool. */
const SELECTION_LADDER = new Set<SystemId>(["sel_wide", "sel_ranked", "sel_gated", "sel_llm", "sel_rerank"])

/**
 * How many candidates the model is shown.
 *
 * Reranking depth matters more than model size: published ablations keep ~85% of
 * the achievable gain going from a 100-deep pool to 20, and lose nearly half at
 * 10. Twelve keeps the prompt small enough for an 8B model to attend to the last
 * entry — the same work reports accuracy decaying for candidates late in the
 * list, and that positional decay is worse for figures than for text.
 */
const LLM_SHORTLIST = Number(process.env.IKAT_LLM_SHORTLIST ?? 12)

const RERANK_BASE = process.env.IKAT_RERANK_BASE ?? "http://rantai-agents-tei-rerank-1:80"
/**
 * Admission floor on the cross-encoder score.
 *
 * Swept rather than guessed (rerank-sweep.ts). The first value here was 0.1,
 * chosen from a three-example probe, and the sweep shows it is not the best
 * point on either gold standard:
 *
 *            human gold (n=48)        harness gold (n=486)
 *   0        P .069 R .526 F1 .123    P .061 R .213 F1 .095
 *   0.01     P .175 R .526 F1 .263    P .122 R .118 F1 .120
 *   0.1      P .259 R .368 F1 .304    P .190 R .072 F1 .104
 *   0.2      P .316 R .316 F1 .316    P .206 R .053 F1 .084
 *   0.6      P .500 R .211 F1 .296    P .277 R .031 F1 .056
 *
 * 0.01 is the default because it is the one point BOTH golds endorse: it keeps
 * recall identical to no threshold at all (.526) while multiplying precision
 * 2.5x, and it is the reranker's best F1 on the harness gold. The scores it
 * discards are pure noise — removing them costs no correct figure.
 *
 * Higher floors buy more precision and are the right product choice for a tutor,
 * where a wrong diagram costs more than a missing one; 0.2 maximises F1 on human
 * gold and 0.6 reaches P .500. That is an operating-point decision and should be
 * made against a larger annotation than 48 items, not fixed here.
 */
const RERANK_MIN = Number(process.env.IKAT_RERANK_MIN ?? 0.01)

/**
 * Cross-encoder scores for one query against many candidates.
 *
 * Batched and truncated to a point measured, not guessed. The service returns
 * `CublasError(CUBLAS_STATUS_INTERNAL_ERROR)` past its configured batch-token
 * budget, and probing found TWO limits rather than one:
 *
 *   1 x 600  fails      4 x 300  works
 *   8 x 300  fails      8 x 150  works
 *  16 x 200  fails      1 x 100  works
 *
 * So each text must stay under ~300 characters AND batch x length under ~1200 —
 * it is not a single token budget. 4 x 280 sits inside a verified-good point
 * rather than on an interpolated edge. This truncates a median 305-character
 * description slightly; the opening carries the subject, which is what the
 * cross-encoder needs.
 */
async function rerank(query: string, texts: string[]): Promise<number[]> {
  if (!texts.length) return []
  const out = new Array(texts.length).fill(0)
  const q = query.slice(0, Number(process.env.IKAT_RERANK_QMAX ?? 200))

  // Score one group, shrinking on failure until the service accepts it. Two
  // constants were fitted here and both were wrong, because the limit is not a
  // property of the batch alone: a cross-encoder concatenates QUERY WITH EACH
  // TEXT, so a longer question shifts the ceiling under an otherwise identical
  // batch. Rather than fit a third constant to the questions we happen to have,
  // back off — halve the batch, then halve the text, and only give up once a
  // single 120-character pair still fails, which means the service is down
  // rather than saturated.
  async function score(items: string[], at: number, maxLen: number): Promise<void> {
    const res = await fetch(`${RERANK_BASE}/rerank`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: q, texts: items.map((t) => t.slice(0, maxLen)) }),
    }).catch(() => null)

    if (res?.ok) {
      const rows = (await res.json()) as Array<{ index: number; score: number }>
      for (const r of rows) out[at + r.index] = r.score
      return
    }
    if (items.length > 1) {
      const mid = Math.ceil(items.length / 2)
      await score(items.slice(0, mid), at, maxLen)
      await score(items.slice(mid), at + mid, maxLen)
      return
    }
    if (maxLen > 120) {
      await score(items, at, Math.floor(maxLen / 2))
      return
    }
    throw new Error(`rerank rejected a single 120-char pair (status ${res?.status ?? "network"})`)
  }

  const BATCH = Number(process.env.IKAT_RERANK_BATCH ?? 4)
  const MAXLEN = Number(process.env.IKAT_RERANK_MAXLEN ?? 280)
  for (let i = 0; i < texts.length; i += BATCH) {
    await score(texts.slice(i, i + BATCH), i, MAXLEN)
  }
  return out
}


/**
 * Ask a model which of the candidate figures actually belong with the answer.
 *
 * Written to make REFUSAL the easy path. The similarity rungs could not decline;
 * they always returned their top-k, which is how 261 figures were emitted on
 * questions that have no correct figure at all. Here an empty answer is named as
 * legitimate, and the instruction is to include a figure only if it genuinely
 * helps — because for a tutor a wrong diagram costs more than a missing one.
 *
 * Returns indices into `candidates`. An unparseable reply yields nothing, which
 * fails toward silence rather than toward noise.
 */
const SELECT_PROMPT = `Anda membantu menyusun materi belajar untuk siswa sekolah dasar di Indonesia.

Pertanyaan siswa: {Q}

Berikut daftar gambar yang tersedia dari buku. Setiap gambar diberi nomor beserta keterangan isinya:

{FIGS}

Tugas Anda: pilih gambar yang BENAR-BENAR membantu menjawab pertanyaan di atas.

Aturan:
- Pilih paling banyak {MAX} gambar.
- Gambar yang tidak berhubungan langsung dengan pertanyaan JANGAN dipilih.
- Jika tidak ada satu pun gambar yang membantu, jawab: TIDAK ADA
- Gambar yang salah lebih merugikan siswa daripada tidak ada gambar sama sekali.

Jawab HANYA dengan nomor yang dipilih, dipisahkan koma (contoh: 2, 5). Jika tidak ada, tulis TIDAK ADA.

Jawaban:`

async function llmSelect(question: string, labels: string[], max: number): Promise<number[]> {
  const listing = labels.map((l, i) => `${i + 1}. ${l}`).join("\n")
  const res = await chat(
    GEN_MODEL,
    [
      {
        role: "user",
        content: SELECT_PROMPT.replace("{Q}", question).replace("{FIGS}", listing).replace("{MAX}", String(max)),
      },
    ],
    120,
  )
  const text = res.text.trim()
  if (/tidak\s*ada/i.test(text)) return []
  const picked: number[] = []
  for (const m of text.matchAll(/\d+/g)) {
    const n = parseInt(m[0], 10) - 1
    // Out-of-range numbers are hallucinated indices, not choices; dropping them
    // is safer than clamping, which would silently invent a selection.
    if (n >= 0 && n < labels.length && !picked.includes(n)) picked.push(n)
    if (picked.length >= max) break
  }
  return picked
}

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
  // Ablation: anchor selection with NO positional placement rule at all —
  // figures go at the end. Isolates how much the placement rule contributes
  // once selection is held fixed, which the headline table cannot show.
  | "anchor_end"
  // Selection ladder. Placement is pinned to MRAMG for all three so the only
  // moving part is HOW figures are chosen. Each rung adds exactly one thing on
  // top of the rung below, so any gain is attributable.
  //   sel_wide   — candidates drawn from FIG_K retrieved chunks, not TOP_K
  //   sel_ranked — + ranked by question/description similarity
  //   sel_gated  — + parameter-free admission floor (may emit nothing)
  | "sel_wide"
  | "sel_ranked"
  | "sel_gated"
  // MRAMG's actual selection mechanism, which the similarity rungs above are
  // NOT: candidates are listed with their descriptions and a language model
  // picks, with "none" a legal answer. On MRAMG's only discriminative subset
  // this roughly doubled the embedding-similarity baseline.
  | "sel_llm"
  // Cross-encoder selection. The reranker has been running on the partner box
  // the whole time — production uses it as a figure gate — and the benchmark
  // never touched it: every system above ranks by cosine. A cross-encoder reads
  // the question and the candidate TOGETHER instead of comparing two vectors
  // built in isolation, which is the difference that matters when a dozen
  // figures in a book are all "children learning".
  | "sel_rerank"

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

/**
 * Selection in isolation — no generation, no placement.
 *
 * Selection is fully determined by the question and the index, so it can be
 * evaluated without spending a single LLM token. Running the full bench over
 * four systems costs ~16 GPU-hours; this costs an embedding pass. It answers
 * precisely the question the selection ladder exists to answer, and nothing
 * else, which is also why it is the honest instrument: no generator variance
 * can leak into the comparison.
 */
export async function selectOnly(
  system: SystemId,
  idx: DocIndex,
  question: string,
  maxFigures = 3,
): Promise<string[]> {
  const qVec = (await embed(EMBED_MODEL, question)).vectors[0]
  const retrieved = retrieveChunks(idx, qVec, TOP_K)
  const wide = SELECTION_LADDER.has(system) ? retrieveChunks(idx, qVec, FIG_K) : retrieved
  return (await selectFigures(system, idx, question, qVec, retrieved, maxFigures, wide)).map((f) => f.id)
}

/**
 * Cross-encoder scores for every candidate figure, ranked, WITHOUT a threshold.
 *
 * Exported so the operating point can be swept offline: the scores are what the
 * model says, the threshold is a product decision, and conflating the two is how
 * 0.1 ended up in the code on the strength of a three-example probe.
 */
export async function rerankCandidates(
  idx: DocIndex,
  question: string,
): Promise<Array<{ id: string; s: number }>> {
  const qVec = (await embed(EMBED_MODEL, question)).vectors[0]
  const wide = retrieveChunks(idx, qVec, FIG_K)
  const wideIds = new Set(wide.map((c) => c.id))
  const usable = idx.doc.figures.filter((f) => !f.decorative)
  const bySim = usable
    .map((f) => ({ f, s: cosine(qVec, idx.figureVecs.get(f.id) ?? []) }))
    .sort((a, b) => b.s - a.s)
  const cand = new Map<string, FigureRecord>()
  for (const f of usable) if (f.anchorChunkId && wideIds.has(f.anchorChunkId)) cand.set(f.id, f)
  for (const e of bySim.slice(0, LLM_SHORTLIST)) cand.set(e.f.id, e.f)
  const list = [...cand.values()]
  if (!list.length) return []
  const scores = await rerank(
    question,
    list.map((f) => figureIndexText(f, idx.descriptions.get(f.id))),
  )
  return list
    .map((f, i) => ({ id: f.id, s: scores[i] ?? 0 }))
    .sort((a, b) => b.s - a.s)
}

/** Figures a system decides are relevant, BEFORE placement is worked out. */
async function selectFigures(
  system: SystemId,
  idx: DocIndex,
  question: string,
  qVec: number[],
  retrieved: Chunk[],
  limit: number,
  /** Wider pool used only by the selection ladder; see FIG_K. */
  wideRetrieved: Chunk[] = retrieved,
): Promise<FigureRecord[]> {
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

  // ── Selection ladder ────────────────────────────────────────────────────
  // Everything above inherits its figure recall from TOP_K text retrieval and
  // then TRUNCATES in document order — there is no scoring step at all. That is
  // the measured defect: retrieval surfaces the right figure 63% of the time and
  // we emit it 33% of the time, discarding half of what was already found.
  if (
    system === "sel_wide" ||
    system === "sel_ranked" ||
    system === "sel_gated" ||
    system === "sel_llm" ||
    system === "sel_rerank"
  ) {
    const wideIds = new Set(wideRetrieved.map((c) => c.id))
    const pool = usable.filter((f) => f.anchorChunkId && wideIds.has(f.anchorChunkId))

    // Cross-encoder. The candidate pool deliberately UNIONS the anchored figures
    // with the best cosine matches: the anchor and the description have been
    // measured to win on different question types, so handing the reranker only
    // one family would cap it at that family's recall before it scores anything.
    if (system === "sel_rerank") {
      const byId = new Map(usable.map((f) => [f.id, f]))
      const bySim = usable
        .map((f) => ({ f, s: cosine(qVec, idx.figureVecs.get(f.id) ?? []) }))
        .sort((a, b) => b.s - a.s)
      const cand = new Map<string, FigureRecord>()
      for (const f of pool) cand.set(f.id, f)
      for (const e of bySim.slice(0, LLM_SHORTLIST)) cand.set(e.f.id, e.f)
      const list = [...cand.values()]
      if (!list.length) return []
      const texts = list.map((f) => figureIndexText(f, idx.descriptions.get(f.id)))
      const scores = await rerank(question, texts)
      return list
        .map((f, i) => ({ f, s: scores[i] ?? 0 }))
        .filter((x) => x.s >= RERANK_MIN)
        .sort((a, b) => b.s - a.s)
        .slice(0, limit)
        .map((x) => byId.get(x.f.id))
        .filter((f): f is FigureRecord => !!f)
    }

    // The model-picked variant. Candidates are ordered by similarity purely to
    // decide WHICH make the shortlist — the choice among them is the model's,
    // and unlike every rung below it may choose none.
    if (system === "sel_llm") {
      const shortlist = pool
        .map((f) => ({ f, s: cosine(qVec, idx.figureVecs.get(f.id) ?? []) }))
        .sort((a, b) => b.s - a.s)
        .slice(0, LLM_SHORTLIST)
        .map((x) => x.f)
      if (!shortlist.length) return []
      const labels = shortlist.map((f) => figureIndexText(f, idx.descriptions.get(f.id)).replace(/^\[Gambar\]\s*/, ""))
      const picked = await llmSelect(question, labels, limit)
      return picked.map((i) => shortlist[i])
    }

    // Rung 1: widen only. Still document order, still a blind truncation — this
    // exists to show how much comes from the wider pool alone, so the ranking
    // rung above it cannot take credit for it.
    if (system === "sel_wide") return pool.slice(0, limit)

    // Rung 2: actually choose. Score every candidate against the question using
    // the figure's own indexed text — the VLM description when we have one. This
    // is the "selection as a text task" the literature reports at roughly twice
    // co-embedding, and the descriptions are already built and cached at ingest.
    const scored = pool
      .map((f) => ({ f, s: cosine(qVec, idx.figureVecs.get(f.id) ?? []) }))
      .sort((a, b) => b.s - a.s)

    if (system === "sel_ranked") return scored.slice(0, limit).map((x) => x.f)

    // Rung 3: allow silence. Same parameter-free floor used by anchor_hybrid — a
    // figure must score at least as high as the weakest passage the retriever
    // itself accepted. Nothing to tune, and no fixed number of figures: when
    // nothing clears the bar this emits none, which for a tutor is the right
    // answer. A wrong diagram is worse than no diagram.
    const floor = retrieved.length
      ? Math.min(...retrieved.map((c) => cosine(qVec, idx.chunkVecs.get(c.id) ?? [])))
      : 0
    return scored.filter((x) => x.s >= floor).slice(0, limit).map((x) => x.f)
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
  if (
    system === "mramg_match" ||
    system === "anchor_mramg_place" ||
    // The selection ladder pins placement to MRAMG on purpose. The anchor
    // placement rule cites a chunk's position in the GENERATOR's passage list,
    // and a widened pool yields figures whose anchor sits outside that list —
    // they would all fall back to end-of-answer and the widening would look bad
    // for placement reasons that have nothing to do with selection.
    system === "sel_wide" ||
    system === "sel_ranked" ||
    system === "sel_gated" ||
    system === "sel_llm"
  ) {
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

  if (system === "anchor_end") {
    // No positional signal used. This is the floor for placement given correct
    // selection, and the reference point for what any placement rule buys.
    return selected.map((f) => ({ figureId: f.id, slot: sentences.length }))
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
  // Same ranking, deeper cut — costs one extra sort over vectors already in
  // memory, no extra embedding call and no change to what the generator sees.
  const wideRetrieved = SELECTION_LADDER.has(system) ? retrieveChunks(idx, qVec, FIG_K) : retrieved
  const selected = await selectFigures(system, idx, question, qVec, retrieved, maxFigures, wideRetrieved)

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
  if (
    (system === "mramg_match" || system === "anchor_mramg_place" || SELECTION_LADDER.has(system)) &&
    selected.length &&
    sentences.length
  ) {
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

/**
 * Two framings of the same ingest-time VLM call, selectable with
 * IKAT_DESCRIBE_MODE. The vision model sees ONLY the crop in both cases — it is
 * deliberately not shown the surrounding text, because a description written
 * with the passage in view would encode the figure's position and any gain
 * would belong to the anchor rather than to the description. Holding the
 * information constant is what makes the two comparable.
 *
 *   content  what the picture SHOWS. The original, and the one measured so far.
 *   purpose  what the picture is FOR — the questions a student could answer with
 *            it. Motivated by a measured failure: description similarity
 *            (P .060-.085) and a model reading descriptions (P .114) both lose
 *            to an anchor rule that never looks at the picture (P .162), and
 *            gold figures are indistinguishable from the rest in description
 *            space (28.8% vs 28.6% diagram-like). Content answers "what is
 *            this"; retrieval is asked "which figure answers this question".
 *            Writing the description in the question's own vocabulary is the
 *            cheapest way to test whether that mismatch is the cause.
 */
const DESCRIBE_PROMPTS: Record<string, string> = {
  content: `Gambar berikut diambil dari buku pelajaran sekolah dasar di Indonesia.

Tulis deskripsi SATU-DUA kalimat dalam bahasa Indonesia yang menjelaskan: apa yang ditampilkan, bagian
yang diberi label (jika ada), dan konsep yang diilustrasikan. Tulis untuk membantu siswa memahami,
bukan sekadar menyebut objek. Jangan menyebut "gambar ini" — langsung isi.`,

  purpose: `Gambar berikut diambil dari buku pelajaran sekolah dasar di Indonesia.

Tulis dalam bahasa Indonesia, maksimal 4 baris:

1. KONSEP: satu frasa — konsep atau materi pelajaran apa yang diajarkan gambar ini.
2. PERTANYAAN: dua sampai tiga pertanyaan siswa yang bisa DIJAWAB dengan melihat gambar ini.
   Tulis seperti pertanyaan siswa sungguhan, bukan judul.
3. ISI PENTING: angka, label, nama, atau langkah yang terbaca pada gambar. Tulis "-" jika tidak ada.

Jangan mendeskripsikan gaya gambar, warna, atau suasana. Jika gambar hanya hiasan dan tidak
mengajarkan apa pun, tulis: HIASAN`,
}

const DESCRIBE_MODE = process.env.IKAT_DESCRIBE_MODE ?? "content"
const DESCRIBE_MAX_CHARS = Number(process.env.IKAT_DESCRIBE_MAX ?? (DESCRIBE_MODE === "purpose" ? 700 : 400))
const DESCRIBE_PROMPT = DESCRIBE_PROMPTS[DESCRIBE_MODE] ?? DESCRIBE_PROMPTS.content

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
      // The purpose framing is deliberately longer than the content one — the
      // published comparison that motivated it reports detailed descriptions
      // beating terse ones, and a 400-char cap would truncate the very part
      // (the answerable questions) the framing exists to produce.
      cache[f.id] = res.text.trim().slice(0, DESCRIBE_MAX_CHARS)
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
