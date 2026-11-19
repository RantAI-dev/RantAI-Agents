/**
 * Turning a retrieval's source list into the sources a client should be
 * shown — and keeping the `[n]` numbers honest while doing it (UAT issues
 * 4 and 7).
 *
 * ── The `[n]` ↔ source mapping, verified by reading the formatter code ────
 *
 * The numbered `Sources:` list the model sees is produced by
 * `numberedSourceList` (src/lib/rag/retriever.ts), which renders
 * `${i + 1}. …` over the sources ARRAY IN ORDER. Every path feeds it 1:1 by
 * index:
 *
 *  - Old hybrid engine (`hybridRetrieve` → `formatHybridContextForPrompt`):
 *    `result.sources` is `Array.from(sourceMap.values())` — first-seen order
 *    of the ranked results, keyed by `sourceDedupeKey` (`asset:${assetKey}`
 *    for figures, `${title}-${section}` for text). The excerpt labels use
 *    the same map, so excerpt `[3]`, Sources line `3.` and sources[2] are
 *    the same card. `[n]` = sources[n-1].
 *  - Vector-only fallback (`retrieveContext` → `formatContextForPrompt`):
 *    the same sourceMap construction, the same numberedSourceList.
 *    `[n]` = sources[n-1].
 *  - Remote engine (`remoteHybridRetrieve` → `toHybridResult` in
 *    lib/kb-client/remote-hybrid.ts): context and sources both pass through
 *    untouched from rantai-kb's SearchResponseDto, whose server assembles
 *    its excerpt `[N]` labels with the same order its `sources` list uses
 *    (see the mapping note in that file). `[n]` = sources[n-1].
 *
 * `fitContext` (service.ts) can drop trailing excerpts when the prompt would
 * blow the token budget, but it always keeps the `Sources:` footer — so even
 * a trimmed prompt still numbers the FULL sources list, and a citation never
 * points at a card that was cut.
 *
 * Conclusion: the mapping is 1:1 by index on every path; `number` below is
 * simply the 1-based index of the source in the retrieved list. No prompt
 * change was needed, and the response keeps the numbers the model was shown
 * even after filtering, so a client's `[n]` ⇄ card lookup never drifts.
 */
import type { RagSource } from "./response"

/** A source plus what the selection needs to know about it. The two extra
 *  fields are internal — `toWireSource` strips them before the wire. */
export interface ScoredSource extends RagSource {
  /** The 1-based `[n]` the model was shown for this source. */
  number: number
  /** Best vector score among the chunks that collapsed into this source.
   *  Null when no retrieved chunk could be matched to the source — a
   *  malformed remote response, in practice — in which case the source is
   *  kept rather than dropped on missing evidence. */
  bestChunkScore: number | null
  /** False when bestChunkScore is below the grounding threshold in use. */
  passesFloor: boolean
}

/**
 * The key the old engine collapses chunks into source cards with
 * (retriever.ts `sourceDedupeKey`). Replicated, not imported: it is not
 * exported, and this module stays out of the rag import graph so the
 * response builders can keep loading cheaply in tests. If the key changes
 * there, this must change with it — the number consistency above depends
 * on chunks and sources deduping identically.
 */
function sourceDedupeKey(c: {
  assetKey?: string | null
  title?: string | null
  section?: string | null
}): string {
  const title = c.title || "Document"
  return c.assetKey ? `asset:${c.assetKey}` : `${title}-${c.section || ""}`
}

/** The chunk fields the scoring matches on (chunks carry `documentTitle`
 *  where sources carry `title`; the adapter below maps one onto the other). */
export interface ChunkLike {
  assetKey?: string | null
  documentTitle?: string | null
  section?: string | null
}

/**
 * Attach to each source the score of its best chunk and the floor verdict.
 *
 * The floor (issue 4/7) marks a source whose BEST chunk is below the
 * grounding threshold in use. Only the returned list is filtered — the
 * context sent to the model keeps its ranked chunks as today, so the model
 * may still cite a below-floor source, and `selectResponseSources` then
 * still echoes it back (cited beats the floor; it is the UNCITED low
 * scorers the floor removes). A floor of 0 keeps everything (the
 * ungrounded-keep path, which must reproduce today's behaviour exactly).
 */
export function scoreSources<T extends ChunkLike>(
  sources: RagSource[],
  chunks: T[],
  chunkScore: (chunk: T) => number,
  floor: number,
): ScoredSource[] {
  const bestByKey = new Map<string, number>()
  for (const chunk of chunks) {
    const key = sourceDedupeKey({
      assetKey: chunk.assetKey,
      title: chunk.documentTitle,
      section: chunk.section,
    })
    const score = chunkScore(chunk)
    if (!Number.isFinite(score)) continue
    const prev = bestByKey.get(key)
    if (prev === undefined || score > prev) bestByKey.set(key, score)
  }

  return sources.map((source, i) => {
    const best = bestByKey.get(
      sourceDedupeKey({ assetKey: source.assetKey, title: source.title, section: source.section }),
    )
    return {
      ...source,
      number: i + 1,
      bestChunkScore: best ?? null,
      // No matched chunk ⇒ keep: dropping on missing evidence would hide a
      // real card, which is exactly the failure the UAT reported.
      passesFloor: best === undefined ? true : best >= floor,
    }
  })
}

/**
 * `[n]` (and chained `[n][m]`) citations in a finished answer, in
 * first-appearance order without repeats. `[figure:N]` counts too: N is the
 * same 1-based position in the source list (inline-figures.ts, retriever.ts
 * "N = that [FIGURE] source's number"), and an answer that embeds a figure is
 * using that source — dropping its card would leave the picture with no
 * verifiable reference. Numbers that do not exist in the source list are
 * harmlessly ignored by the selection, so a stray `[0]` or an array index
 * like `a[12]` cannot invent a reference.
 */
export function citedSourceNumbers(text: string): number[] {
  const seen = new Set<number>()
  for (const m of text.matchAll(/\[(?:figure:\s*)?(\d+)\]/g)) seen.add(Number(m[1]))
  return [...seen]
}

/** What the response should do with the source list once the answer text
 *  exists. Built by the chat service; consumed by the response builders. */
export interface SourceSelection {
  /** Request field `sources`. */
  mode: "cited" | "all"
  /** grounding.grounded for this answer (false when retrieval did not run). */
  grounded: boolean
  /**
   * True when the request was ungrounded but
   * AGENT_API_UNGROUNDED_CONTEXT=keep restored today's behaviour. Every
   * retrieved source is then returned — floor and cited-only default both
   * skipped — because the flag exists so an operator can roll the whole
   * filtering back without a second knob.
   */
  ungroundedKeep: boolean
}

/** One source in its wire shape: today's fields plus the UAT trio. The
 *  internal score fields never ride the response. */
function toWireSource(s: ScoredSource, cited: boolean): RagSource {
  const { bestChunkScore: _score, passesFloor: _floor, ...wire } = s
  return { ...wire, cited }
}

/**
 * The sources a response should carry, given the finished answer text.
 *
 *  - A source the answer actually CITES is shown even below the relevance
 *    floor: the model saw the full list, so a `[n]` it used must resolve to
 *    a card — the live case was an answer citing `[2]` whose best chunk
 *    scored just under the floor and whose `sources` came back empty. The
 *    floor still removes UNCITED low scorers, so `sources:"all"` keeps its
 *    meaning (everything worth showing, each flagged with whether the text
 *    cited it).
 *  - default (`"cited"`): only cited sources — floor or not — ordered by
 *    number; the numbers stay the ones the model saw (issue 7's "only show
 *    references actually used and cited").
 *  - nothing cited: []. An answer that cites nothing used no source, and the
 *    live case that motivated this ("the book does not define …" scored
 *    grounded at 0.50) showed that offering the best-scoring source anyway is
 *    exactly UAT issue 7's irrelevant reference. `sources:"all"` still
 *    returns every above-floor source with its `cited` flag for clients that
 *    want them.
 *  - anything else (ungrounded refuse, empty retrieval): [].
 */
export function selectResponseSources(
  sources: ScoredSource[],
  answerText: string,
  selection: SourceSelection,
): RagSource[] {
  const citedSet = new Set(citedSourceNumbers(answerText))
  // Cited beats the floor; uncited must pass it. Numbering is untouched —
  // `number` stays the position the model was shown.
  const visible = sources.filter((s) => s.passesFloor || citedSet.has(s.number))

  if (selection.mode === "all" || selection.ungroundedKeep) {
    return visible.map((s) => toWireSource(s, citedSet.has(s.number)))
  }

  const cited = visible
    .filter((s) => citedSet.has(s.number))
    .sort((a, b) => a.number - b.number)
  return cited.map((s) => toWireSource(s, true))
}
