import { z } from "zod"
import type { ToolDefinition } from "../types"

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

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
    const query = params.query as string
    const maxResults = (params.maxResults as number) || 5

    // If it looks like a URL, fetch it directly
    if (query.startsWith("http://") || query.startsWith("https://")) {
      try {
        const res = await fetch(query, {
          headers: { "User-Agent": "RantAI-Agent/1.0" },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) {
          return { success: false, error: `HTTP ${res.status}: ${res.statusText}` }
        }
        const html = await res.text()
        const text = stripHtml(html).slice(0, 5000)
        return {
          success: true,
          url: query,
          content: text,
        }
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Failed to fetch URL",
        }
      }
    }

    // Use configured search API or DuckDuckGo HTML
    const searchApiUrl = process.env.SEARCH_API_URL
    try {
      if (searchApiUrl) {
        // SearXNG-compatible API
        const url = new URL(searchApiUrl)
        url.searchParams.set("q", query)
        url.searchParams.set("format", "json")
        url.searchParams.set("number_of_results", String(maxResults))
        const res = await fetch(url.toString(), {
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) throw new Error(`Search API returned ${res.status}`)
        const data = await res.json()
        const results = (data.results || [])
          .slice(0, maxResults)
          .map((r: { title?: string; url?: string; content?: string }) => ({
            title: r.title || "",
            url: r.url || "",
            snippet: r.content || "",
          }))
        return { success: true, resultCount: results.length, results }
      }

      // Fallback: DuckDuckGo HTML search
      const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
      const res = await fetch(ddgUrl, {
        headers: { "User-Agent": "RantAI-Agent/1.0" },
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) throw new Error(`DuckDuckGo returned ${res.status}`)
      const html = await res.text()

      // Parse results from HTML
      const results: Array<{ title: string; url: string; snippet: string }> = []
      const resultPattern =
        /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi
      let match
      while (
        (match = resultPattern.exec(html)) !== null &&
        results.length < maxResults
      ) {
        results.push({
          title: stripHtml(match[2]),
          url: match[1],
          snippet: stripHtml(match[3]),
        })
      }

      return { success: true, resultCount: results.length, results }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Search failed",
        results: [],
      }
    }
  },
}
