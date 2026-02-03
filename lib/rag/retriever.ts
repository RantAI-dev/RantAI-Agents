import { searchWithThreshold, SearchResult } from "./vector-store";

/**
 * RAG Retriever - retrieves relevant context for user queries
 */

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
    minSimilarity = 0.35, // Lower threshold to capture more relevant results
    maxChunks = 5,
    categoryFilter,
    groupIds,
  } = options || {};

  // Search for similar chunks
  const chunks = await searchWithThreshold(
    query,
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

  // Life insurance keywords
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
  ];

  // Health insurance keywords
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
  ];

  // Home insurance keywords
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
  ];

  // Check for matches
  const lifeScore = lifeKeywords.filter((kw) => queryLower.includes(kw)).length;
  const healthScore = healthKeywords.filter((kw) =>
    queryLower.includes(kw)
  ).length;
  const homeScore = homeKeywords.filter((kw) => queryLower.includes(kw)).length;

  // Return category with highest score (if any)
  const maxScore = Math.max(lifeScore, healthScore, homeScore);

  if (maxScore === 0) {
    return undefined; // Search all categories
  }

  if (lifeScore === maxScore) return "LIFE_INSURANCE";
  if (healthScore === maxScore) return "HEALTH_INSURANCE";
  if (homeScore === maxScore) return "HOME_INSURANCE";

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
