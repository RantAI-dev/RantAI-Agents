import { searchWithThreshold, SearchResult } from "./vector-store";
import {
  HybridSearch,
  HybridSearchConfig,
  HybridSearchResult,
  HybridSearchStats,
  fetchNeighborChunks,
  fetchMatchingFigures,
} from "./hybrid-search";
import { getRagConfig } from "./config";
import { getDefaultReranker } from "./rerankers";

/**
 * RAG Retriever — retrieves relevant context for user queries.
 *
 * Supports:
 *  - basic vector search (this file's retrieveContext / smartRetrieve)
 *  - hybrid search (vector + entity/graph RRF, see hybrid-search.ts)
 *  - optional LLM-as-reranker (top-20 → top-5), enabled via KB_RERANK_ENABLED
 *
 * The 2026-04-20 SOTA audit measured qwen/qwen3-embedding-8b as multilingual-
 * native — Bahasa queries hit 0.914+ hit@1 without translation. The old
 * detect-then-translate hop has been removed accordingly.
 */

export interface HybridRetrievalResult {
  context: string;
  sources: Array<{
    documentId: string | null;
    documentTitle: string;
    section: string | null;
    assetKey?: string | null;
    page?: number | null;
    chunkType?: string | null;
  }>;
  results: HybridSearchResult[];
  stats: HybridSearchStats;
}

export interface RetrievalResult {
  context: string;
  sources: Array<{
    documentId: string | null;
    documentTitle: string;
    section: string | null;
    categories: string[];
    assetKey?: string | null;
    page?: number | null;
    chunkType?: string | null;
  }>;
  chunks: SearchResult[];
}

/**
 * Figure relevance policy — applied after rerank so only figures the model
 * actually scored as relevant to THIS query survive.
 *
 * Why: a figure chunk is embedded on its caption + the prose that happened to
 * sit near it on the page, so it can be retrieved whenever that page's text
 * loosely matches — even when the picture itself is off-topic. Text chunks are
 * always kept; figures are gated by their rerank score and capped in number.
 *
 * Tunable via env (no rebuild needed to adjust):
 *   KB_FIGURE_MIN_RERANK      absolute rerank-score floor a figure must clear
 *                             (unset = disabled; bge-reranker score scale is
 *                             logged below so the right value can be picked).
 *   KB_FIGURE_MAX_PER_ANSWER  max figures kept per retrieval (default 3).
 */
function applyFigurePolicy(
  chunks: SearchResult[],
  scoreById: Map<string, number>,
): SearchResult[] {
  const rawMin = process.env.KB_FIGURE_MIN_RERANK;
  // Default 0.2 — see fetchMatchingFigures (bge-reranker sigmoid scale).
  const figMin = rawMin !== undefined && rawMin !== "" ? Number(rawMin) : 0.2;
  const figMax = Number(process.env.KB_FIGURE_MAX_PER_ANSWER) || 3;

  let kept = 0;
  const dropped: Array<{ score: number; label: string }> = [];
  const out = chunks.filter((c) => {
    if (c.chunkType !== "figure") return true; // text always kept
    const score = scoreById.get(c.id);
    const belowFloor = !Number.isNaN(figMin) && score !== undefined && score < figMin;
    const overCap = kept >= figMax;
    if (belowFloor || overCap) {
      dropped.push({
        score: score ?? NaN,
        label: `${(c.section ?? c.content ?? "").slice(0, 40)}${overCap ? " [over-cap]" : ""}`,
      });
      return false;
    }
    kept++;
    return true;
  });

  // Log figure scores (kept + dropped) so KB_FIGURE_MIN_RERANK can be tuned to
  // the reranker's actual scale from real queries.
  const figScores = chunks
    .filter((c) => c.chunkType === "figure")
    .map((c) => `${(scoreById.get(c.id) ?? NaN).toFixed(3)}:${(c.section ?? "").slice(0, 24)}`);
  if (figScores.length) {
    console.log(
      `[RAG] figure policy: kept ${kept}/${figScores.length} (floor=${rawMin ?? "off"} cap=${figMax}) scores=[${figScores.join(" | ")}]`,
    );
  }
  return out;
}

/**
 * Retrieve relevant context for a query
 * Returns formatted context string and source information
 */
export async function retrieveContext(
  query: string,
  options?: {
    minSimilarity?: number;
    maxChunks?: number;
    categoryFilter?: string;
    groupIds?: string[];
  }
): Promise<RetrievalResult> {
  const cfg = getRagConfig();
  const {
    minSimilarity = 0.30,
    maxChunks = cfg.defaultMaxChunks,
    categoryFilter,
    groupIds,
  } = options || {};

  const reranker = getDefaultReranker();
  const fetchLimit = reranker ? Math.max(cfg.rerankInitialK, maxChunks) : maxChunks;

  // Phase 7b: query expansion (optional). Fires an extra LLM call to get paraphrases;
  // expandQuery returns [original] when disabled or on any failure (never throws).
  const { expandQuery } = await import("./query-expansion");
  const expanded = await expandQuery(query);

  // Phase 7: run vector and BM25 IN PARALLEL — max, not sum, of the two latencies.
  const { bm25Search } = await import("./bm25-search");
  const { reciprocalRankFusion } = await import("./hybrid-merge");

  const [vectorChunks, bm25Chunks] = await Promise.all([
    expanded.length > 1
      ? (async () => {
          const { searchSimilarBatch } = await import("./vector-store");
          const lists = await searchSimilarBatch(expanded, fetchLimit, categoryFilter, groupIds);
          const union = new Map<string, SearchResult>();
          for (const list of lists) {
            for (const r of list) {
              if (r.similarity < minSimilarity) continue;
              const prev = union.get(r.id);
              if (!prev || r.similarity > prev.similarity) union.set(r.id, r);
            }
          }
          return Array.from(union.values())
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, fetchLimit);
        })()
      : searchWithThreshold(query, minSimilarity, fetchLimit, categoryFilter, groupIds),
    cfg.hybridBm25Enabled ? bm25Search(query, fetchLimit).catch(() => [] as any[]) : Promise.resolve([] as any[]),
  ]);

  // Build a single chunk pool keyed by chunk.id; vector wins metadata ties.
  const pool = new Map<string, SearchResult>();
  for (const v of vectorChunks) pool.set(v.id, v);
  for (const b of bm25Chunks) {
    if (pool.has(b.id)) continue;
    pool.set(b.id, {
      id: b.id,
      documentId: b.documentId,
      documentTitle: "", // not returned by bm25 query; could be enriched in future
      content: b.content,
      categories: [],
      subcategory: null,
      section: null,
      similarity: 0,
      contextualPrefix: null,
    });
  }

  // Fuse ranks via RRF across the two arms.
  const fused = cfg.hybridBm25Enabled && bm25Chunks.length > 0
    ? reciprocalRankFusion(
        [
          vectorChunks.map((v) => ({ id: v.id })),
          bm25Chunks.map((b) => ({ id: b.id })),
        ],
        { limit: fetchLimit }
      )
    : vectorChunks.map((v) => ({ id: v.id, rrfScore: v.similarity, sources: [0], first: { id: v.id } }));

  let chunks: SearchResult[] = fused
    .map((f) => pool.get(f.id))
    .filter((c): c is SearchResult => c !== undefined);

  // Existing reranker block — unchanged logic, applies to the fused set.
  if (reranker && chunks.length > maxChunks) {
    const candidates = chunks.map((c, i) => ({
      id: c.id,
      text: c.content,
      originalRank: i,
      originalScore: c.similarity,
    }));
    try {
      const ranked = await reranker.rerank(query, candidates, maxChunks);
      const byId = new Map(chunks.map((c) => [c.id, c]));
      const scoreById = new Map(ranked.map((r) => [r.id, r.score]));
      chunks = ranked
        .map((r) => byId.get(r.id))
        .filter((c): c is SearchResult => c !== undefined);
      chunks = applyFigurePolicy(chunks, scoreById); // gate + cap figures by relevance
    } catch (err) {
      console.warn(
        `[RAG] rerank (${reranker.name}) failed, falling back to fused order: ${(err as Error).message.slice(0, 120)}`
      );
      chunks = chunks.slice(0, maxChunks);
    }
  } else {
    chunks = chunks.slice(0, maxChunks);
  }

  if (chunks.length === 0) {
    return {
      context: "",
      sources: [],
      chunks: [],
    };
  }

  // Coverage analytics: fire-and-forget bump retrievalCount + lastRetrievedAt
  // on every doc that surfaced. Async, never blocks the chat path.
  void import("@/features/knowledge/documents/repository").then(({ recordRetrievalHits }) => {
    recordRetrievalHits(chunks.map((c) => c.documentId));
  }).catch(() => {});

  // Format context for LLM. When a contextual_prefix was generated at ingest
  // (KB_CONTEXTUAL_RETRIEVAL_ENABLED=true; ~1 sentence per chunk locating it
  // in the document), prepend it before the chunk body so the model sees the
  // chunk's position in the source. Drops cleanly when the prefix is null.
  // Assign each unique source a stable number (first-seen order) so the excerpt
  // labels, the Sources list, and the UI source cards ALL share the same [N] —
  // otherwise the model cites excerpt positions the deduped card list lacks.
  const sourceMap = new Map<
    string,
    { documentId: string | null; documentTitle: string; section: string | null; categories: string[]; assetKey?: string | null; page?: number | null; chunkType?: string | null }
  >();
  for (const chunk of chunks) {
    const key = sourceDedupeKey(chunk);
    if (!sourceMap.has(key)) {
      sourceMap.set(key, {
        documentId: chunk.documentId ?? null,
        documentTitle: chunk.documentTitle,
        section: chunk.section,
        categories: chunk.categories,
        assetKey: chunk.assetKey ?? null,
        page: chunk.page ?? null,
        chunkType: chunk.chunkType ?? null,
      });
    }
  }
  const keyToNumber = new Map(Array.from(sourceMap.keys()).map((k, i) => [k, i + 1]));

  const contextParts: string[] = [];
  for (const chunk of chunks) {
    const n = keyToNumber.get(sourceDedupeKey(chunk));
    const label = chunk.section
      ? `[${n}] ${chunk.documentTitle} — ${chunk.section}`
      : `[${n}] ${chunk.documentTitle}`;
    const prefix = chunk.contextualPrefix ? `${chunk.contextualPrefix}\n\n` : "";
    contextParts.push(`${label}\n${prefix}${chunk.content}`);
  }

  const context = contextParts.join("\n\n---\n\n");

  return {
    context,
    sources: Array.from(sourceMap.values()),
    chunks,
  };
}

/**
 * Smart retrieval that auto-detects category
 */
export async function smartRetrieve(
  query: string,
  options?: {
    minSimilarity?: number;
    maxChunks?: number;
    groupIds?: string[];
  }
): Promise<RetrievalResult> {
  return retrieveContext(query, {
    ...options,
    groupIds: options?.groupIds,
  });
}

/**
 * Format retrieved context for inclusion in LLM prompt.
 *
 * The instruction block is deliberate: a generic "you are helpful" system
 * prompt biases models toward terseness, so for RAG turns we restate the rules
 * locally — be thorough, cite, and refuse cleanly when the context falls short.
 */
/**
 * Shared answer/citation instructions for both the vector and hybrid RAG
 * prompt formatters. Citations are bracketed NUMBERS keyed to the numbered
 * Sources list (rendered as clickable chips in the UI), NOT inline document
 * titles — the old `[Document Title — Section]` style cluttered the prose with
 * repeated full titles when the Sources card already carries provenance.
 */
const RAG_ANSWER_INSTRUCTIONS = `When answering:
- Treat the excerpts as the source of truth for specific facts. Every concrete claim (definitions, paragraph numbers, effective dates, scope rules, exclusions, numerical thresholds) MUST come from the excerpts and be cited.
- You MAY add brief background context (1-2 sentences) to frame an answer when essential for understanding — but mark it as framing, not fact. Never substitute general knowledge for an absent specific detail.
- Cite each factual claim inline with a bracketed NUMBER matching the numbered Sources list below — e.g. \`[1]\`. Use only the numbers shown; never write the document title or section inline. If several sources support one claim, chain them like \`[1][3]\`.
- Be thorough within the excerpts. Cover every aspect the excerpts support; do not invent aspects they do not mention.
- If a specific detail the user asked for is not in the excerpts, say so explicitly ("not specified in the available excerpts") rather than guessing.
- Sources tagged [FIGURE] are images/charts. When one directly illustrates a point you're making, embed it inline by writing \`[figure:N]\` on its OWN line right after the sentence it supports (N = that [FIGURE] source's number). Only embed a figure that's genuinely relevant; never write a raw image path.`;

/** Number a source list 1..N so inline `[n]` citations line up with the UI chips.
 *  Figure sources are tagged [FIGURE] so the model can embed them via [figure:N]. */
function numberedSourceList(
  sources: Array<{ documentTitle: string; section: string | null; chunkType?: string | null }>
): string {
  return sources
    .map((s, i) => {
      const tag = s.chunkType === "figure" ? "[FIGURE] " : ""
      return `${i + 1}. ${tag}${s.documentTitle}${s.section ? ` — ${s.section}` : ""}`
    })
    .join("\n");
}

/**
 * Dedupe key for a retrieved item → one source card. Figures are distinct by
 * asset; text chunks collapse by title+section. Shared by both context builders
 * so excerpt labels and the Sources list number identically.
 */
function sourceDedupeKey(c: {
  assetKey?: string | null
  documentTitle?: string | null
  section?: string | null
}): string {
  const title = c.documentTitle || "Document"
  return c.assetKey ? `asset:${c.assetKey}` : `${title}-${c.section || ""}`
}

export function formatContextForPrompt(result: RetrievalResult): string {
  if (!result.context) {
    return "";
  }

  return `
## Knowledge Base Context

The excerpts below are your primary source for this question.

${RAG_ANSWER_INSTRUCTIONS}

Excerpts:
${result.context}

Sources:
${numberedSourceList(result.sources)}
`.trim();
}

/**
 * Hybrid retrieval using vector + entity search
 * Provides better results by combining semantic similarity with knowledge graph traversal
 */
export async function hybridRetrieve(
  query: string,
  options?: {
    maxResults?: number;
    enableEntitySearch?: boolean;
    vectorWeight?: number;
    entityWeight?: number;
    groupIds?: string[];
    categoryFilter?: string;
  }
): Promise<HybridRetrievalResult> {
  const {
    maxResults = getRagConfig().defaultMaxChunks,
    // Entity/graph arm defaults on, but can be turned off per-deployment via
    // KB_ENTITY_SEARCH_ENABLED=false. On corpora with no populated entity graph
    // it returns 0 results yet can add tens of seconds (measured up to +28s on
    // the demo KB), so disabling it is a large, quality-neutral latency win.
    // An explicit `options.enableEntitySearch` still overrides this default.
    enableEntitySearch = process.env.KB_ENTITY_SEARCH_ENABLED !== "false",
    vectorWeight = 0.7,
    entityWeight = 0.3,
    groupIds,
    categoryFilter,
  } = options || {};

  const searchConfig: HybridSearchConfig = {
    vectorWeight,
    entityWeight,
    enableEntitySearch,
    finalTopK: maxResults,
    groupIds,
    categoryFilter,
  };

  const hybridSearch = new HybridSearch(searchConfig);
  const searchOutput = await hybridSearch.search(query, maxResults);
  let results = searchOutput.results;
  const stats = searchOutput.stats;

  if (results.length === 0) {
    return {
      context: "",
      sources: [],
      results: [],
      stats,
    };
  }

  // Neighbor-window expansion (auto-merge): pull ±N adjacent chunks around each
  // ranked hit so a retrieved table/figure travels with its explanation (and an
  // explanation pulls in its table). Neighbors are woven into reading order
  // right next to their anchor, keeping the anchor's rank priority; they share
  // the anchor's Source card, so no new citation numbers appear.
  const neighborWindow = getRagConfig().neighborWindow;
  if (neighborWindow > 0) {
    const neighbors = await fetchNeighborChunks(
      results
        .filter((r) => r.documentId && Number.isInteger(r.chunkIndex))
        .map((r) => ({ documentId: r.documentId, chunkIndex: r.chunkIndex, chunkId: r.chunkId })),
      neighborWindow,
    ).catch((err) => {
      console.warn(`[RAG] neighbor-window expansion failed (non-fatal): ${(err as Error).message?.slice(0, 120)}`);
      return [] as HybridSearchResult[];
    });
    if (neighbors.length > 0) {
      const emitted = new Set<string>();
      const ordered: HybridSearchResult[] = [];
      const push = (c: HybridSearchResult) => {
        const cid = String(c.chunkId);
        if (!emitted.has(cid)) {
          emitted.add(cid);
          ordered.push(c);
        }
      };
      for (const anchor of results) {
        const group = [
          anchor,
          ...neighbors.filter(
            (n) => n.documentId === anchor.documentId && Math.abs(n.chunkIndex - anchor.chunkIndex) <= neighborWindow,
          ),
        ].sort((a, b) => a.chunkIndex - b.chunkIndex);
        for (const g of group) push(g);
      }
      results = ordered;
    }
  }

  // Figure co-retrieval (multimodal linking): pull in figures whose printed
  // caption matches the query or the retrieved text but which lost the ranking
  // race (figure chunks are thin captions appended at the end of the doc, so a
  // specific query surfaces the topic's text but never its figure). This lets a
  // figure travel with its subject — ask about "Raja Mulawarman" and its
  // portrait surfaces alongside the text about him.
  try {
    const figDocIds = [...new Set(results.map((r) => r.documentId).filter(Boolean))];
    const present = new Set(results.map((r) => String(r.chunkId)));
    const retrievedText = results.map((r) => r.content).join("\n");
    const matchedFigs = await fetchMatchingFigures(figDocIds, query, retrievedText, present, 3);
    if (matchedFigs.length > 0) results = [...results, ...matchedFigs];
  } catch (err) {
    console.warn(`[RAG] figure co-retrieval failed (non-fatal): ${(err as Error).message?.slice(0, 120)}`);
  }

  // Coverage analytics: fire-and-forget bump on every doc surfaced.
  void import("@/features/knowledge/documents/repository").then(({ recordRetrievalHits }) => {
    recordRetrievalHits(results.map((r) => r.documentId));
  }).catch(() => {});

  // Number sources first (first-seen order), then label each excerpt with its
  // source's [N] — keeps excerpt / Sources-list / UI-card numbering in lockstep
  // so the model's inline [N] citations always resolve to a real source card.
  const sourceMap = new Map<
    string,
    { documentId: string | null; documentTitle: string; section: string | null; assetKey?: string | null; page?: number | null; chunkType?: string | null }
  >();
  for (const result of results) {
    const key = sourceDedupeKey({
      assetKey: result.assetKey,
      documentTitle: result.documentTitle || "Document",
      section: result.section || null,
    });
    if (!sourceMap.has(key)) {
      sourceMap.set(key, {
        documentId: result.documentId ?? null,
        documentTitle: result.documentTitle || "Document",
        section: result.section || null,
        assetKey: result.assetKey ?? null,
        page: result.page ?? null,
        chunkType: result.chunkType ?? null,
      });
    }
  }
  const keyToNumber = new Map(Array.from(sourceMap.keys()).map((k, i) => [k, i + 1]));

  const contextParts: string[] = [];
  for (const result of results) {
    const title = result.documentTitle || "Document";
    const n = keyToNumber.get(
      sourceDedupeKey({ assetKey: result.assetKey, documentTitle: title, section: result.section || null }),
    );
    const label = result.section ? `[${n}] ${title} — ${result.section}` : `[${n}] ${title}`;
    const prefix = result.contextualPrefix ? `${result.contextualPrefix}\n\n` : "";
    contextParts.push(`${label}\n${prefix}${result.content}`);
  }

  const context = contextParts.join("\n\n---\n\n");

  return {
    context,
    sources: Array.from(sourceMap.values()),
    results,
    stats,
  };
}

/**
 * Smart hybrid retrieval with auto-detected category
 */
export async function smartHybridRetrieve(
  query: string,
  options?: {
    maxResults?: number;
    enableEntitySearch?: boolean;
    groupIds?: string[];
  }
): Promise<HybridRetrievalResult> {
  return hybridRetrieve(query, {
    ...options,
  });
}

/**
 * Format hybrid retrieval result for inclusion in LLM prompt.
 * See formatContextForPrompt for the rationale behind the instruction block.
 */
export function formatHybridContextForPrompt(
  result: HybridRetrievalResult
): string {
  if (!result.context) {
    return "";
  }

  // Include entity information if available
  const entities = result.results
    .flatMap((r) => r.relatedEntities)
    .filter((e, i, arr) => arr.findIndex((x) => x.name === e.name) === i)
    .slice(0, 10);

  const entityInfo =
    entities.length > 0
      ? `\nRelated entities: ${entities.map((e) => `${e.name} (${e.type})`).join(", ")}`
      : "";

  return `
## Knowledge Base Context

The excerpts below are your primary source for this question.

${RAG_ANSWER_INSTRUCTIONS}

Excerpts:
${result.context}

Sources:
${numberedSourceList(result.sources)}${entityInfo}
`.trim();
}
