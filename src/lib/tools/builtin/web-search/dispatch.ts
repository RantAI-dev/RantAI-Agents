import type { SearchResponse, WebSearchMode } from "./types";
import { PerplexityProvider } from "./providers/perplexity";
import { SerperProvider } from "./providers/serper";
import { SearXNGProvider } from "./providers/searxng";
import { DuckDuckGoProvider } from "./providers/duckduckgo";

/**
 * Resolve the effective web-search mode from env.
 *
 * - `perplexity` (default): try `perplexity/sonar-pro` via OpenRouter first; fall back to the local chain on error or when OPENROUTER_API_KEY is unset.
 * - `local`: skip Perplexity entirely; use Serper → SearXNG → DuckDuckGo only.
 *
 * Set `WEB_SEARCH_MODE=local` to force the legacy keyword-search behavior for
 * privacy-sensitive deployments or when Perplexity quality isn't wanted.
 */
export function resolveMode(): WebSearchMode {
  const raw = (process.env.WEB_SEARCH_MODE || "perplexity").toLowerCase();
  return raw === "local" ? "local" : "perplexity";
}

/**
 * Try the provider chain in order; return the first successful response.
 * A provider returning `null` is treated as "not configured, skip" — not an error.
 * A provider throwing is logged and treated as "fell over, try next."
 */
export async function searchWithFallback(
  query: string,
  maxResults: number
): Promise<SearchResponse> {
  const mode = resolveMode();
  const perplexity = new PerplexityProvider();
  const serper = new SerperProvider();
  const searxng = new SearXNGProvider();
  const ddg = new DuckDuckGoProvider();

  const chain =
    mode === "perplexity"
      ? [perplexity, serper, searxng, ddg]
      : [serper, searxng, ddg];

  let lastError: Error | undefined;
  for (const provider of chain) {
    try {
      const out = await provider.search(query, maxResults);
      if (out) return out;
    } catch (err) {
      lastError = err as Error;
      console.warn(
        `[web_search] ${provider.name} failed (${lastError.message.slice(0, 120)}), trying next provider`
      );
    }
  }

  return {
    success: false,
    provider: "none",
    results: [],
    resultCount: 0,
    error: lastError?.message ?? "no web-search provider returned results",
  };
}
