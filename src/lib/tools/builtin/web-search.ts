import { z } from "zod";
import type { ToolDefinition } from "../types";
import { searchWithFallback } from "./web-search/dispatch";
import { stripHtml, isPrivateHost } from "./web-search/util";

/**
 * Unified web_search tool.
 *
 * Two modes, picked via WEB_SEARCH_MODE env:
 *   - "perplexity" (default): query goes to perplexity/sonar-pro via OpenRouter,
 *     returning a synthesized answer + citations. Falls back to the local chain
 *     (Serper → SearXNG → DuckDuckGo) on Perplexity error or missing OPENROUTER_API_KEY.
 *   - "local": uses the Serper → SearXNG → DuckDuckGo chain only.
 *
 * The `answer` field is surfaced to the agent when Perplexity produced one;
 * callers that only read `results` still work because citations are mapped
 * into normalized SearchResult entries.
 *
 * Still supports direct URL fetch when the query starts with http(s):// —
 * SSRF-guarded against private/internal addresses.
 */
export const webSearchTool: ToolDefinition = {
  name: "web_search",
  displayName: "Web Search",
  description:
    "Search the web for information or fetch content from a URL. Use this when the user asks about current events, external information, or needs data from the internet.",
  category: "builtin",
  parameters: z.object({
    query: z.string().describe("Search query or URL to fetch"),
    maxResults: z
      .number()
      .optional()
      .default(5)
      .describe("Maximum number of results to return"),
  }),
  execute: async (params) => {
    const query = params.query as string;
    const maxResults = (params.maxResults as number) || 5;

    // Direct URL fetch path — same contract as the legacy tool.
    if (query.startsWith("http://") || query.startsWith("https://")) {
      try {
        const urlObj = new URL(query);
        if (isPrivateHost(urlObj.hostname)) {
          return {
            success: false,
            error: "Access to internal/private addresses is not allowed",
          };
        }
        const res = await fetch(query, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; RantAI-Agent/1.0)" },
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) {
          return { success: false, error: `HTTP ${res.status}: ${res.statusText}` };
        }
        const html = await res.text();
        const text = stripHtml(html).slice(0, 5000);
        return { success: true, url: query, content: text };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Failed to fetch URL",
        };
      }
    }

    // Search path — dispatch picks Perplexity primary or local chain based on env.
    return await searchWithFallback(query, maxResults);
  },
};
