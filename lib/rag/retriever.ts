import { searchWithThreshold, SearchResult } from "./vector-store";
import {
  HybridSearch,
  HybridSearchConfig,
  HybridSearchResult,
  HybridSearchStats,
} from "./hybrid-search";

/**
 * RAG Retriever - retrieves relevant context for user queries
 * Supports both basic vector search and hybrid search (vector + entity)
 */

// Simple heuristic: common non-ASCII or Indonesian/Malay stop words
const NON_ENGLISH_INDICATORS = [
  "apa", "ada", "yang", "dan", "untuk", "dari", "ini", "itu", "saya",
  "bisa", "mau", "bagaimana", "berapa", "dimana", "kapan", "siapa",
  "apakah", "tolong", "halo", "selamat", "terima", "kasih", "dengan",
  "tidak", "juga", "sudah", "belum", "produk", "asuransi", "klaim",
  "premi", "polis", "pertanggungan", "manfaat", "biaya",
];

/**
 * Detect if a query is likely non-English
 */
function isLikelyNonEnglish(query: string): boolean {
  // Strip punctuation before checking
  const words = query.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(Boolean);
  const matches = words.filter((w) => NON_ENGLISH_INDICATORS.includes(w));
  // If 30%+ of words match non-English indicators, treat as non-English
  return matches.length >= Math.max(1, Math.ceil(words.length * 0.3));
}

/**
 * Translate a non-English query to English for better embedding match.
 * Uses a fast/cheap model via OpenRouter.
 */
async function translateQueryForSearch(query: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.log("[RAG] No OPENROUTER_API_KEY, skipping translation");
    return query;
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "xiaomi/mimo-v2-flash",
        messages: [
          {
            role: "system",
            content: "Translate the following user question to English for semantic search over an insurance knowledge base. Keep the searchable intent precise — omit greetings like 'halo/hi/hello'. For broad questions (e.g. 'what products do you have?'), expand to include insurance context (e.g. 'What insurance products and plans are available?'). If already in English, output it as-is. Output ONLY the translated search query, nothing else.",
          },
          { role: "user", content: query },
        ],
        max_tokens: 200,
        temperature: 0,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`[RAG] Translation API error: ${response.status} - ${errorText.slice(0, 200)}`);
      return query;
    }

    const data = await response.json();
    const translated = data.choices?.[0]?.message?.content?.trim();
    if (translated && translated.length > 0) {
      console.log(`[RAG] Translated query: "${query}" → "${translated}"`);
      return translated;
    }
    console.warn("[RAG] Translation returned empty response");
  } catch (error) {
    console.warn("[RAG] Translation failed:", (error as Error).message);
  }

  return query;
}

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
    minSimilarity = 0.30, // Lower threshold to capture broad/overview queries
    maxChunks = 5,
    categoryFilter,
    groupIds,
  } = options || {};

  // Translate non-English queries for better embedding match
  const searchQuery = isLikelyNonEnglish(query)
    ? await translateQueryForSearch(query)
    : query;

  // Search for similar chunks
  const chunks = await searchWithThreshold(
    searchQuery,
    minSimilarity,
    maxChunks,
    categoryFilter,
    groupIds
  );

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

  // Translate non-English queries for better embedding match
  const searchQuery = isLikelyNonEnglish(query)
    ? await translateQueryForSearch(query)
    : query;

  const searchConfig: HybridSearchConfig = {
    vectorWeight,
    entityWeight,
    enableEntitySearch,
    finalTopK: maxResults,
    groupIds,
    categoryFilter,
  };

  const hybridSearch = new HybridSearch(searchConfig);
  const { results, stats } = await hybridSearch.search(searchQuery, maxResults);

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
