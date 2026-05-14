import { getRagConfig } from "./config";
import { LruCache } from "./lru-cache";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// 5-min LRU keyed by (latestQuery + abbreviated prior history hash). Hits the
// same way query-expansion.ts and the query-embedding cache hit: repeat
// retries of identical follow-ups (eval re-runs, user reloads, double-fire
// from UI) skip the LLM round-trip. Bounded so memory stays cheap.
const REWRITE_CACHE = new LruCache<string, string>({ maxSize: 512, ttlMs: 5 * 60 * 1000 });

type ContentPart = { type: "text"; text: string } | { type: string; [key: string]: unknown };
type Msg = { role: string; content: string | ContentPart[] | unknown };

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((p): p is { type: "text"; text: string } =>
        typeof p === "object" && p !== null && (p as { type?: unknown }).type === "text" &&
        typeof (p as { text?: unknown }).text === "string"
      )
      .map((p) => p.text)
      .join(" ");
  }
  return "";
}

/**
 * Rewrite a multi-turn conversation's latest user message into a single
 * self-contained query for KB retrieval. "tell me more about exclusions"
 * becomes "exclusions for policy X" (using context from prior turns).
 *
 * Returns the original latest user message unchanged when:
 *   - KB_STANDALONE_QUERY_ENABLED != "true"
 *   - there's only one user turn (nothing to disambiguate against)
 *   - the latest message is already >= 60 chars (likely self-contained)
 *   - OPENROUTER_API_KEY is unset
 *   - the LLM call fails or returns empty
 *
 * Never throws — graceful degradation always returns SOME query.
 */
export async function rewriteStandaloneQuery(messages: Msg[]): Promise<string> {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const latestQuery = extractText(lastUser?.content).trim();
  if (!latestQuery) return "";

  if (process.env.KB_STANDALONE_QUERY_ENABLED !== "true") return latestQuery;

  // No prior turns to anchor against → nothing to rewrite.
  const priorTurns = messages.filter((m) => m.role === "user" || m.role === "assistant").length;
  if (priorTurns <= 1) return latestQuery;

  // Self-contained heuristic: long messages rarely need disambiguation, and
  // skipping saves a round-trip on the common case.
  if (latestQuery.length >= 60) return latestQuery;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return latestQuery;

  // Take the last 6 turns (excluding the latest user message, which is given
  // separately to the model). Truncate each turn to avoid context blowup.
  const recent = messages.slice(-7, -1).slice(-6);
  const history = recent
    .map((m) => {
      const txt = extractText(m.content).slice(0, 400).replace(/\s+/g, " ").trim();
      return `${m.role}: ${txt}`;
    })
    .filter((line) => line.length > line.indexOf(":") + 2)
    .join("\n");

  if (!history) return latestQuery;

  // Cache key: latest query + a short fingerprint of the conversation context
  // (history truncated to ~500 chars). Different conversations producing the
  // same followup get different rewrites, but the same conversation re-played
  // hits cache. We don't hash — direct string concat is fine at LRU size 512.
  const cacheKey = `${latestQuery}::${history.slice(0, 500)}`;
  const cached = REWRITE_CACHE.get(cacheKey);
  if (cached) return cached;

  const cfg = getRagConfig();
  const prompt = `You rewrite multi-turn chat questions into self-contained search queries for a knowledge base.

Rewrite the user's LATEST question so it can be searched on its own, using context from the conversation. Rules:
- Preserve the user's intent exactly. Do not add facts the user did not say.
- Keep the rewrite concise (one sentence, ideally under 25 words).
- If the latest question is already self-contained, return it unchanged.
- Output ONLY the rewritten query. No quotes, no prose, no labels.

Conversation:
${history}

Latest question: ${latestQuery}

Rewritten query:`;

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: cfg.queryExpansionModel,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 120,
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`standalone-query ${res.status}`);
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = (data.choices?.[0]?.message?.content ?? "").trim();
    // Strip optional surrounding quotes the model may add.
    const cleaned = raw.replace(/^["'`]+|["'`]+$/g, "").trim();
    if (!cleaned) return latestQuery;
    REWRITE_CACHE.set(cacheKey, cleaned);
    return cleaned;
  } catch (err) {
    console.warn(
      `[standalone-query] failed (${(err as Error).message.slice(0, 100)}); using original query`
    );
    return latestQuery;
  }
}
