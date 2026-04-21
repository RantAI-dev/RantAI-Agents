import type { SearchProvider, SearchResponse } from "../types";

/** SearXNG-compatible API, self-hosted or third-party instance. */
export class SearXNGProvider implements SearchProvider {
  readonly name = "searxng";

  async search(query: string, maxResults: number): Promise<SearchResponse | null> {
    const searchApiUrl = process.env.SEARCH_API_URL;
    if (!searchApiUrl) return null;

    const url = new URL(searchApiUrl);
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("number_of_results", String(maxResults));
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      throw new Error(`SearXNG ${res.status}`);
    }
    const data = await res.json();
    const results = (data.results || [])
      .slice(0, maxResults)
      .map((r: { title?: string; url?: string; content?: string }) => ({
        title: r.title || "",
        url: r.url || "",
        snippet: r.content || "",
      }));
    return {
      success: true,
      provider: this.name,
      results,
      citations: results.map((r: { url: string }) => r.url),
      resultCount: results.length,
    };
  }
}
