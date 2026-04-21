import type { SearchProvider, SearchResponse, SearchResult } from "../types";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Perplexity Sonar via OpenRouter. Sonar-Pro returns a synthesized answer +
 * `citations` (array of URLs) in one call. We map citations back into our
 * normalized SearchResult shape for agent compatibility, and surface the
 * answer text separately so callers that understand it can skip a second
 * synthesis step.
 *
 * Model selectable via WEB_SEARCH_PERPLEXITY_MODEL env (default: perplexity/sonar-pro).
 */
export class PerplexityProvider implements SearchProvider {
  readonly name = "perplexity";

  private readonly model: string;

  constructor() {
    this.model = process.env.WEB_SEARCH_PERPLEXITY_MODEL || "perplexity/sonar-pro";
  }

  async search(query: string, maxResults: number): Promise<SearchResponse | null> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return null;

    const body = {
      model: this.model,
      messages: [
        {
          role: "user",
          content: query,
        },
      ],
      max_tokens: 1200,
      temperature: 0,
    };

    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      throw new Error(`Perplexity (${this.model}) ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      citations?: string[];
    };

    const answer = data.choices?.[0]?.message?.content ?? "";
    const citations = Array.isArray(data.citations) ? data.citations : [];

    // Map citations into SearchResult[] so agents that only read `.results` still work.
    // Title/snippet are unavailable from Sonar's response — leave them empty; the
    // synthesized `answer` field carries the content.
    const results: SearchResult[] = citations.slice(0, maxResults).map((url) => ({
      title: "",
      url,
      snippet: "",
    }));

    return {
      success: true,
      provider: this.name,
      answer,
      citations,
      results,
      resultCount: results.length,
    };
  }
}
