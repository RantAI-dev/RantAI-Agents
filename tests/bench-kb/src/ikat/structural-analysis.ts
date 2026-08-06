/**
 * IKAT-Bench — corpus analyses that require no model at all.
 *
 * These exist because the paper's motivating claim can be established from the
 * corpus itself, independently of any system run, any API, and any judge. They
 * are the strongest kind of evidence available here: fully deterministic,
 * reproducible offline from the cached extraction, and impossible to tune.
 *
 * Three questions are answered:
 *
 *   A1  How much signal does a caption-based mechanism actually have?
 *   A2  How often is a figure lexically INDISTINGUISHABLE from another figure in
 *       the same book — i.e. a case caption matching cannot solve even in
 *       principle, regardless of how good the matcher is?
 *   A3  How much placement resolution does page-level provenance lose compared
 *       with reading-order provenance?
 *
 * A2 and A3 are upper bounds on competing mechanisms, not measurements of our
 * own; they cannot flatter us by construction, which is exactly why they are
 * worth reporting.
 *
 * Usage: bun tests/bench-kb/src/ikat/structural-analysis.ts
 */
import * as fs from "node:fs"
import * as path from "node:path"
import type { BuiltDoc, FigureRecord } from "./build-corpus"

const BENCH_ROOT = path.resolve(import.meta.dirname, "../..")
// Which corpus to analyse. The two extraction paths produce materially
// different figure sets and must never be pooled — see the manuscript, 4.1.
const CORPUS = process.env.IKAT_CORPUS ?? "built"
const BUILT_DIR = path.join(BENCH_ROOT, "corpus", CORPUS)
const OUT = path.join(BENCH_ROOT, "corpus", `structural-analysis-${CORPUS}.json`)

/** Same index text a caption-based system would build for the figure. */
function indexText(f: FigureRecord): string {
  if (f.caption) return f.caption
  return `Gambar halaman ${f.page + 1}: ${f.ctx.slice(0, 400)}`
}

const STOP = new Set(
  "yang dan atau dengan untuk pada dari ke di itu ini adalah akan tidak juga dalam sebagai oleh karena agar bisa dapat ada satu dua gambar tabel halaman".split(
    " ",
  ),
)

function keywords(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 4 && !STOP.has(w)),
  )
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 1
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return inter / (a.size + b.size - inter)
}

interface DocAnalysis {
  slug: string
  usableFigures: number
  captioned: number
  /** Figures whose index text has no distinguishing content words at all. */
  noKeywords: number
  /**
   * Figures that share an index text with at least one OTHER figure in the same
   * book at Jaccard >= 0.9 — lexically indistinguishable, so a caption/keyword
   * mechanism cannot pick the right one even with a perfect matcher.
   */
  indistinguishable: number
  /** Figures sharing a page with at least one other usable figure. */
  sharingPage: number
  /** Mean usable figures per page that has any. */
  figuresPerPage: number
  /** Distinct anchor positions vs distinct pages — the resolution gained. */
  distinctAnchors: number
  distinctPages: number
}

function analyseDoc(doc: BuiltDoc): DocAnalysis {
  const figs = doc.figures.filter((f) => !f.decorative)
  const texts = figs.map(indexText)
  const kws = texts.map(keywords)

  let noKeywords = 0
  for (const k of kws) if (k.size === 0) noKeywords++

  // Pairwise within the document. Corpus is small enough that O(n^2) per book is
  // fine and exactness beats an approximation here.
  const dup = new Array(figs.length).fill(false)
  for (let i = 0; i < figs.length; i++) {
    for (let j = i + 1; j < figs.length; j++) {
      if (jaccard(kws[i], kws[j]) >= 0.9) {
        dup[i] = true
        dup[j] = true
      }
    }
  }

  const byPage = new Map<number, number>()
  for (const f of figs) byPage.set(f.page, (byPage.get(f.page) ?? 0) + 1)
  const sharingPage = figs.filter((f) => (byPage.get(f.page) ?? 0) > 1).length
  const pagesWithFigures = byPage.size

  return {
    slug: doc.slug,
    usableFigures: figs.length,
    captioned: figs.filter((f) => f.caption).length,
    noKeywords,
    indistinguishable: dup.filter(Boolean).length,
    sharingPage,
    figuresPerPage: pagesWithFigures ? figs.length / pagesWithFigures : 0,
    distinctAnchors: new Set(figs.map((f) => f.anchorIndex)).size,
    distinctPages: pagesWithFigures,
  }
}

/**
 * A4 — deterministic selection under ORACLE retrieval.
 *
 * For every chunk that has at least one figure anchored in it, treat that chunk
 * as the retrieved passage (perfect retrieval) and ask which figures each
 * mechanism would select. Gold = the figures actually anchored there.
 *
 * This needs no model: keyword overlap is deterministic, and the gold chunk
 * stands in for retrieval. It therefore runs over the WHOLE corpus rather than a
 * question sample.
 *
 * Read it honestly: the anchor mechanism scores 1.0 here BY CONSTRUCTION, since
 * "figures anchored in the retrieved chunk" is the definition of both the
 * mechanism and the gold set. That number is not evidence and is reported only
 * to make the tautology explicit. The informative number is the caption
 * mechanism's, measured under retrieval conditions as favourable as they get.
 */
function oracleSelection(doc: BuiltDoc): { chunks: number; precision: number; recall: number; f1: number } {
  const figs = doc.figures.filter((f) => !f.decorative);
  const byChunk = new Map<string, FigureRecord[]>();
  for (const f of figs) {
    if (!f.anchorChunkId) continue;
    const arr = byChunk.get(f.anchorChunkId) ?? [];
    arr.push(f);
    byChunk.set(f.anchorChunkId, arr);
  }

  const kwOf = new Map<string, Set<string>>();
  for (const f of figs) kwOf.set(f.id, keywords(indexText(f)));

  let n = 0;
  let sp = 0;
  let sr = 0;
  let sf = 0;
  for (const [chunkId, gold] of byChunk) {
    const chunk = doc.chunks.find((c) => c.id === chunkId);
    if (!chunk) continue;
    const body = chunk.text.toLowerCase();
    // Caption mechanism, in its most charitable form: score every figure in the
    // book by how many of its index keywords appear in the retrieved passage,
    // then take the top 3.
    //
    // Ranking by overlap COUNT matters. Taking the first three matches in
    // document order — as a naive implementation does — is close to random when
    // hundreds of figures share one common word, and would understate the
    // baseline. A baseline must lose on its merits, not on our shortcuts.
    const picked = figs
      .map((f) => {
        const k = kwOf.get(f.id);
        let hits = 0;
        if (k) for (const w of k) if (body.includes(w)) hits++;
        return { f, hits };
      })
      .filter((x) => x.hits > 0)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 3)
      .map((x) => x.f);

    const goldIds = new Set(gold.map((f) => f.id));
    const tp = picked.filter((f) => goldIds.has(f.id)).length;
    const p = picked.length ? tp / picked.length : 0;
    const r = goldIds.size ? tp / goldIds.size : 0;
    sp += p;
    sr += r;
    sf += p + r ? (2 * p * r) / (p + r) : 0;
    n++;
  }
  return { chunks: n, precision: n ? sp / n : 0, recall: n ? sr / n : 0, f1: n ? sf / n : 0 };
}


/**
 * A5 — placement under an ORACLE ANSWER, with no model of any kind.
 *
 * Generation is what forces the benchmark to call an LLM. But placement can be
 * isolated from generation entirely: take the figure's own anchor chunk as the
 * "answer", and the true insertion slot is then known EXACTLY from the block
 * sequence — it is where the book put the figure. No embedding, no similarity,
 * no judge.
 *
 * This measures each mechanism's placement error under conditions as favourable
 * as they can possibly be: perfect retrieval, perfect answer, and prose that is
 * literally the source text. Whatever error remains here is intrinsic to the
 * mechanism rather than inherited from a weak generator — which is exactly what
 * claim C2 needs to separate placement failure from retrieval failure.
 *
 * The anchor mechanism is 0 by construction and is excluded from the comparison
 * rather than reported as a win.
 */
function oraclePlacement(doc: BuiltDoc): {
  figures: number
  captionMeanAbsPD: number
  captionExact: number
  endMeanAbsPD: number
  endExact: number
} {
  const figs = doc.figures.filter((f) => !f.decorative && f.anchorChunkId)
  const byIndex = new Map(doc.blocks.map((b) => [b.index, b]))

  let n = 0
  let capPD = 0
  let capExact = 0
  let endPD = 0
  let endExact = 0

  for (const f of figs) {
    const chunk = doc.chunks.find((c) => c.id === f.anchorChunkId)
    if (!chunk) continue
    // The "answer" is the chunk's own text blocks, in order.
    const sentences: string[] = []
    let ideal = -1
    for (let i = chunk.fromBlock; i <= chunk.toBlock; i++) {
      if (i === f.anchorIndex) {
        // Slot j = after sentence j, so the figure belongs after however many
        // text blocks precede it.
        ideal = sentences.length
        continue
      }
      const b = byIndex.get(i)
      if (b?.kind === "text" && b.text) sentences.push(b.text)
    }
    if (ideal < 0 || sentences.length < 2) continue

    // Caption mechanism: place next to the sentence sharing most vocabulary
    // with the figure's index text.
    const kws = keywords(indexText(f))
    let best = sentences.length
    let bestHits = 0
    sentences.forEach((sent, i) => {
      const low = sent.toLowerCase()
      let hits = 0
      for (const w of kws) if (low.includes(w)) hits++
      if (hits > bestHits) {
        bestHits = hits
        best = i + 1
      }
    })
    const capSlot = bestHits > 0 ? best : sentences.length

    // Co-embedding mechanism carries no positional signal: always the end.
    const endSlot = sentences.length

    capPD += Math.abs(capSlot - ideal)
    if (capSlot === ideal) capExact++
    endPD += Math.abs(endSlot - ideal)
    if (endSlot === ideal) endExact++
    n++
  }

  return {
    figures: n,
    captionMeanAbsPD: n ? capPD / n : 0,
    captionExact: n ? capExact / n : 0,
    endMeanAbsPD: n ? endPD / n : 0,
    endExact: n ? endExact / n : 0,
  }
}

function main() {
  const files = fs.readdirSync(BUILT_DIR).filter((f) => f.endsWith(".json")).sort()
  const docs: DocAnalysis[] = []
  const oracle: Array<{ slug: string } & ReturnType<typeof oracleSelection>> = []
  const placement: Array<{ slug: string } & ReturnType<typeof oraclePlacement>> = []
  for (const f of files) {
    const doc = JSON.parse(fs.readFileSync(path.join(BUILT_DIR, f), "utf-8")) as BuiltDoc
    docs.push(analyseDoc(doc))
    oracle.push({ slug: doc.slug, ...oracleSelection(doc) })
    placement.push({ slug: doc.slug, ...oraclePlacement(doc) })
  }
  const oChunks = oracle.reduce((a, o) => a + o.chunks, 0)
  const wavg = (k: "precision" | "recall" | "f1") =>
    oChunks ? oracle.reduce((a, o) => a + o[k] * o.chunks, 0) / oChunks : 0

  const sum = (k: keyof DocAnalysis) => docs.reduce((a, d) => a + (d[k] as number), 0)
  const total = sum("usableFigures")
  const pct = (n: number) => (total ? (100 * n) / total : 0)

  const summary = {
    generatedAt: new Date().toISOString(),
    books: docs.length,
    usableFigures: total,
    // A1 — signal available to a caption-based mechanism
    captioned: sum("captioned"),
    captionedPct: pct(sum("captioned")),
    // A2 — cases caption matching cannot solve even in principle
    indistinguishable: sum("indistinguishable"),
    indistinguishablePct: pct(sum("indistinguishable")),
    noKeywords: sum("noKeywords"),
    noKeywordsPct: pct(sum("noKeywords")),
    // A3 — resolution lost by page-level provenance
    sharingPage: sum("sharingPage"),
    sharingPagePct: pct(sum("sharingPage")),
    distinctAnchors: sum("distinctAnchors"),
    distinctPages: sum("distinctPages"),
    anchorResolutionGain: sum("distinctPages") ? sum("distinctAnchors") / sum("distinctPages") : 0,
    // A4 — deterministic selection under oracle retrieval
    oracleSelection: {
      chunksEvaluated: oChunks,
      captionMatch: { precision: wavg("precision"), recall: wavg("recall"), f1: wavg("f1") },
      anchorNote:
        "The anchor mechanism scores 1.0 here by construction (its selection rule and the gold set " +
        "are the same predicate). Reported to make the tautology explicit, not as evidence.",
      perBook: oracle,
    },
    // A5 — placement error under an oracle answer, no model involved
    oraclePlacement: (() => {
      const nf = placement.reduce((a, x) => a + x.figures, 0)
      const w = (k: "captionMeanAbsPD" | "captionExact" | "endMeanAbsPD" | "endExact") =>
        nf ? placement.reduce((a, x) => a + x[k] * x.figures, 0) / nf : 0
      return {
        figuresEvaluated: nf,
        captionMechanism: { meanAbsPD: w("captionMeanAbsPD"), exact: w("captionExact") },
        endOfAnswerMechanism: { meanAbsPD: w("endMeanAbsPD"), exact: w("endExact") },
        anchorNote: "0 by construction; excluded from the comparison rather than reported as a win.",
        perBook: placement,
      }
    })(),
    perBook: docs,
  }

  fs.writeFileSync(OUT, JSON.stringify(summary, null, 2))

  const f1 = (n: number) => n.toFixed(1)
  console.log(`\n=== IKAT-Bench structural analysis — corpus "${CORPUS}" (no model involved) ===`)
  console.log(`books ${summary.books}   usable figures ${total}\n`)
  console.log(`A1  printed caption available      ${summary.captioned} (${f1(summary.captionedPct)}%)`)
  console.log(`A2  lexically indistinguishable    ${summary.indistinguishable} (${f1(summary.indistinguishablePct)}%)`)
  console.log(`    no distinguishing keywords     ${summary.noKeywords} (${f1(summary.noKeywordsPct)}%)`)
  console.log(`A3  shares a page with another fig ${summary.sharingPage} (${f1(summary.sharingPagePct)}%)`)
  console.log(
    `    distinct anchors / distinct pages ${summary.distinctAnchors} / ${summary.distinctPages} ` +
      `= ${summary.anchorResolutionGain.toFixed(2)}x resolution`,
  )
  console.log(
    `A4  oracle-retrieval selection (caption mechanism, ${oChunks} chunks): ` +
      `P=${wavg("precision").toFixed(3)} R=${wavg("recall").toFixed(3)} F1=${wavg("f1").toFixed(3)}`,
  )
  console.log(`    (anchor mechanism = 1.000 by construction — tautological, not evidence)`)
  const op = summary.oraclePlacement
  console.log(
    `A5  oracle-answer placement (${op.figuresEvaluated} figures, no model): ` +
      `caption |PD|=${op.captionMechanism.meanAbsPD.toFixed(2)} exact=${op.captionMechanism.exact.toFixed(3)} | ` +
      `end-of-answer |PD|=${op.endOfAnswerMechanism.meanAbsPD.toFixed(2)} exact=${op.endOfAnswerMechanism.exact.toFixed(3)}`,
  )
  console.log(`    (anchor = 0.00 by construction — excluded, not a win)`)
  console.log(`\nwrote ${OUT}`)
}

if (import.meta.main) main()
