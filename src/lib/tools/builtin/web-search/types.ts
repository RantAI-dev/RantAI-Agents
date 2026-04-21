export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchResponse {
  success: boolean;
  /** Provider that produced this response — "perplexity" | "serper" | "searxng" | "duckduckgo" */
  provider: string;
  /** Perplexity-style synthesized answer. Omitted by raw-result providers. */
  answer?: string;
  /** Citations extracted from the provider response. For raw providers, derived from `results`. */
  citations?: string[];
  /** Normalized result list. Present on all providers. */
  results: SearchResult[];
  resultCount?: number;
  error?: string;
}

export type WebSearchMode = "perplexity" | "local";

export interface SearchProvider {
  readonly name: string;
  search(query: string, maxResults: number): Promise<SearchResponse | null>;
}
