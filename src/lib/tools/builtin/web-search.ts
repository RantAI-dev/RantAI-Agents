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

interface SearchResult {
  title: string
  url: string
  snippet: string
}

/** Primary: Serper.dev Google Search API */
async function searchWithSerper(query: string, maxResults: number): Promise<SearchResult[] | null> {
  const apiKey = process.env.SERPER_API_KEY
  if (!apiKey) return null

  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, num: maxResults }),
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`Serper API returned ${res.status}`)
  const data = await res.json()
  return (data.organic || [])
    .slice(0, maxResults)
    .map((r: { title?: string; link?: string; snippet?: string }) => ({
      title: r.title || "",
      url: r.link || "",
      snippet: r.snippet || "",
    }))
}

/** Secondary: SearXNG-compatible API */
async function searchWithSearXNG(query: string, maxResults: number): Promise<SearchResult[] | null> {
  const searchApiUrl = process.env.SEARCH_API_URL
  if (!searchApiUrl) return null

  const url = new URL(searchApiUrl)
  url.searchParams.set("q", query)
  url.searchParams.set("format", "json")
  url.searchParams.set("number_of_results", String(maxResults))
  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`Search API returned ${res.status}`)
  const data = await res.json()
  return (data.results || [])
    .slice(0, maxResults)
    .map((r: { title?: string; url?: string; content?: string }) => ({
      title: r.title || "",
      url: r.url || "",
      snippet: r.content || "",
    }))
}

/** Fallback: DuckDuckGo HTML scraping */
async function searchWithDuckDuckGo(query: string, maxResults: number): Promise<SearchResult[]> {
  const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
  const res = await fetch(ddgUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; RantAI-Agent/1.0)" },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`DuckDuckGo returned ${res.status}`)
  const html = await res.text()

  const results: SearchResult[] = []
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
  return results
}

/** Block SSRF: reject internal/private IP ranges and localhost */
function isPrivateHost(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "[::1]") return true
  // IPv4 private ranges
  const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number)
    if (a === 10) return true                          // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true   // 172.16.0.0/12
    if (a === 192 && b === 168) return true             // 192.168.0.0/16
    if (a === 127) return true                          // 127.0.0.0/8
    if (a === 169 && b === 254) return true             // 169.254.0.0/16 (link-local)
    if (a === 0) return true                            // 0.0.0.0/8
  }
  // Block common internal hostnames
  if (hostname.endsWith(".internal") || hostname.endsWith(".local")) return true
  return false
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

    // If it looks like a URL, fetch it directly (with SSRF protection)
    if (query.startsWith("http://") || query.startsWith("https://")) {
      try {
        const urlObj = new URL(query)
        if (isPrivateHost(urlObj.hostname)) {
          return { success: false, error: "Access to internal/private addresses is not allowed" }
        }
        const res = await fetch(query, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; RantAI-Agent/1.0)" },
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

    // Search with priority: Serper → SearXNG → DuckDuckGo
    try {
      // Try Serper first
      const serperResults = await searchWithSerper(query, maxResults)
      if (serperResults) {
        return { success: true, resultCount: serperResults.length, results: serperResults }
      }

      // Try SearXNG
      const searxResults = await searchWithSearXNG(query, maxResults)
      if (searxResults) {
        return { success: true, resultCount: searxResults.length, results: searxResults }
      }

      // Fallback to DuckDuckGo
      const ddgResults = await searchWithDuckDuckGo(query, maxResults)
      return { success: true, resultCount: ddgResults.length, results: ddgResults }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Search failed",
        results: [],
      }
    }
  },
}
