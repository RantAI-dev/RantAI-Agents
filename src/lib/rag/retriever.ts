import { searchWithThreshold, SearchResult } from "./vector-store";
import {
  HybridSearch,
  HybridSearchConfig,
  HybridSearchResult,
  HybridSearchStats,
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
    documentTitle: string;
    section: string | null;
  }>;
  results: HybridSearchResult[];
  stats: HybridSearchStats;
}

export interface RetrievalResult {
  context: string;
  sources: Array<{
    documentTitle: string;
    section: string | null;
    categories: string[];
  }>;
  chunks: SearchResult[];
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
  const {
    minSimilarity = 0.30,
    maxChunks = 5,
    categoryFilter,
    groupIds,
  } = options || {};

  const cfg = getRagConfig();
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
      chunks = ranked
        .map((r) => byId.get(r.id))
        .filter((c): c is SearchResult => c !== undefined);
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

  // Format context for LLM
  const contextParts: string[] = [];

  for (const chunk of chunks) {
    const source = chunk.section
      ? `[${chunk.documentTitle} - ${chunk.section}]`
      : `[${chunk.documentTitle}]`;

    contextParts.push(`${source}\n${chunk.content}`);
  }

  const context = contextParts.join("\n\n---\n\n");

  // Extract unique sources
  const sourceMap = new Map<
    string,
    { documentTitle: string; section: string | null; categories: string[] }
  >();

  for (const chunk of chunks) {
    const key = `${chunk.documentTitle}-${chunk.section || ""}`;
    if (!sourceMap.has(key)) {
      sourceMap.set(key, {
        documentTitle: chunk.documentTitle,
        section: chunk.section,
        categories: chunk.categories,
      });
    }
  }

  return {
    context,
    sources: Array.from(sourceMap.values()),
    chunks,
  };
}

/**
 * Detect the likely category based on query keywords
 * Returns undefined if no clear category is detected (searches all)
 */
export function detectQueryCategory(
  query: string
): string | undefined {
  const queryLower = query.toLowerCase();

  // Life insurance keywords (EN + ID)
  const lifeKeywords = [
    "life insurance",
    "term life",
    "whole life",
    "universal life",
    "death benefit",
    "beneficiary",
    "cash value",
    "life coverage",
    "life policy",
    "iul",
    "indexed universal",
    "asuransi jiwa",
    "jiwa",
    "santunan kematian",
  ];

  // Health insurance keywords (EN + ID)
  const healthKeywords = [
    "health insurance",
    "medical",
    "doctor",
    "hospital",
    "prescription",
    "copay",
    "deductible",
    "health coverage",
    "health plan",
    "telehealth",
    "mental health",
    "preventive",
    "bronze",
    "silver",
    "gold",
    "platinum",
    "out-of-pocket",
    "in-network",
    "asuransi kesehatan",
    "kesehatan",
    "dokter",
    "rumah sakit",
    "resep",
    "rawat inap",
    "rawat jalan",
  ];

  // Home insurance keywords (EN + ID)
  const homeKeywords = [
    "home insurance",
    "homeowner",
    "house",
    "dwelling",
    "property",
    "liability",
    "flood",
    "earthquake",
    "home coverage",
    "renters",
    "condo",
    "umbrella",
    "personal property",
    "asuransi rumah",
    "rumah",
    "properti",
    "banjir",
    "gempa",
  ];

  // Vehicle/Auto insurance keywords (EN + ID)
  const vehicleKeywords = [
    "auto insurance",
    "car insurance",
    "vehicle insurance",
    "auto coverage",
    "vehicle coverage",
    "roadside assistance",
    "collision",
    "comprehensive",
    "liability only",
    "accident forgiveness",
    "asuransi kendaraan",
    "asuransi mobil",
    "asuransi motor",
    "kendaraan",
    "mobil",
    "motor",
  ];

  // Check for matches
  const lifeScore = lifeKeywords.filter((kw) => queryLower.includes(kw)).length;
  const healthScore = healthKeywords.filter((kw) =>
    queryLower.includes(kw)
  ).length;
  const homeScore = homeKeywords.filter((kw) => queryLower.includes(kw)).length;
  const vehicleScore = vehicleKeywords.filter((kw) => queryLower.includes(kw)).length;

  // Return category with highest score (if any)
  const maxScore = Math.max(lifeScore, healthScore, homeScore, vehicleScore);

  if (maxScore === 0) {
    return undefined; // Search all categories
  }

  if (lifeScore === maxScore) return "LIFE_INSURANCE";
  if (healthScore === maxScore) return "HEALTH_INSURANCE";
  if (homeScore === maxScore) return "HOME_INSURANCE";
  if (vehicleScore === maxScore) return "VEHICLE_INSURANCE";

  return undefined;
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
  const category = detectQueryCategory(query);

  return retrieveContext(query, {
    ...options,
    categoryFilter: category,
    groupIds: options?.groupIds,
  });
}

/**
 * Format retrieved context for inclusion in LLM prompt
 */
export function formatContextForPrompt(result: RetrievalResult): string {
  if (!result.context) {
    return "";
  }

  const sourceList = result.sources
    .map((s) => `- ${s.documentTitle}${s.section ? `: ${s.section}` : ""}`)
    .join("\n");

  return `
## Relevant Product Information

The following information was retrieved from our knowledge base to help answer this question:

${result.context}

---
Sources:
${sourceList}
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
    maxResults = 5,
    enableEntitySearch = true,
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
  const { results, stats } = await hybridSearch.search(query, maxResults);

  if (results.length === 0) {
    return {
      context: "",
      sources: [],
      results: [],
      stats,
    };
  }

  // Format context for LLM
  const contextParts: string[] = [];

  for (const result of results) {
    const source = result.section
      ? `[${result.documentTitle || "Document"} - ${result.section}]`
      : `[${result.documentTitle || "Document"}]`;

    contextParts.push(`${source}\n${result.content}`);
  }

  const context = contextParts.join("\n\n---\n\n");

  // Extract unique sources
  const sourceMap = new Map<
    string,
    { documentTitle: string; section: string | null }
  >();

  for (const result of results) {
    const title = result.documentTitle || "Document";
    const key = `${title}-${result.section || ""}`;
    if (!sourceMap.has(key)) {
      sourceMap.set(key, {
        documentTitle: title,
        section: result.section || null,
      });
    }
  }

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
  const category = detectQueryCategory(query);

  return hybridRetrieve(query, {
    ...options,
    categoryFilter: category,
  });
}

/**
 * Format hybrid retrieval result for inclusion in LLM prompt
 */
export function formatHybridContextForPrompt(
  result: HybridRetrievalResult
): string {
  if (!result.context) {
    return "";
  }

  const sourceList = result.sources
    .map((s) => `- ${s.documentTitle}${s.section ? `: ${s.section}` : ""}`)
    .join("\n");

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
## Relevant Product Information

The following information was retrieved from our knowledge base to help answer this question:

${result.context}

---
Sources:
${sourceList}${entityInfo}
`.trim();
}
