import type { SearchProvider, SearchResponse, SearchResult } from "../types";
import { stripHtml } from "../util";

/**
 * DuckDuckGo HTML scrape. Final fallback — keyless but fragile:
 * depends on DDG's HTML structure, which can change without notice.
 */
export class DuckDuckGoProvider implements SearchProvider {
  readonly name = "duckduckgo";

  async search(query: string, maxResults: number): Promise<SearchResponse> {
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(ddgUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RantAI-Agent/1.0)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      throw new Error(`DuckDuckGo ${res.status}`);
    }
    const html = await res.text();

    const results: SearchResult[] = [];
    const resultPattern =
      /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = resultPattern.exec(html)) !== null && results.length < maxResults) {
      results.push({
        title: stripHtml(match[2]),
        url: match[1],
        snippet: stripHtml(match[3]),
      });
    }

    return {
      success: true,
      provider: this.name,
      results,
      citations: results.map((r) => r.url),
      resultCount: results.length,
    };
  }
}
