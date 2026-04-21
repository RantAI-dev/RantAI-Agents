import type { SearchProvider, SearchResponse } from "../types";

/** Google Search via Serper.dev API. */
export class SerperProvider implements SearchProvider {
  readonly name = "serper";

  async search(query: string, maxResults: number): Promise<SearchResponse | null> {
    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) return null;

    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: query, num: maxResults }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      throw new Error(`Serper ${res.status}`);
    }
    const data = await res.json();
    const results = (data.organic || [])
      .slice(0, maxResults)
      .map((r: { title?: string; link?: string; snippet?: string }) => ({
        title: r.title || "",
        url: r.link || "",
        snippet: r.snippet || "",
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
