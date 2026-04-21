import { getRagConfig } from "./config";
import { LruCache } from "./lru-cache";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const CACHE = new LruCache<string, string[]>({ maxSize: 1024, ttlMs: 60 * 60 * 1000 }); // 1h

/**
 * Expand a user query into [original, ...paraphrases]. Returns [original] when:
 *   - KB_QUERY_EXPANSION_ENABLED != "true", OR
 *   - OPENROUTER_API_KEY is unset, OR
 *   - the LLM call fails, OR
 *   - the model returns unparseable output.
 *
 * Never throws — failure degrades gracefully to baseline retrieval.
 * Memoized per-process via a 1h LRU on the trimmed query string.
 */
export async function expandQuery(query: string): Promise<string[]> {
  const q = query.trim();
  if (!q) return [];

  const cfg = getRagConfig();
  if (!cfg.queryExpansionEnabled) return [q];

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return [q];

  const cached = CACHE.get(q);
  if (cached) return cached;

  const prompt = `Generate exactly ${cfg.queryExpansionParaphrases} alternative phrasings of the following user question, optimized for semantic search over a knowledge base. Each paraphrase MUST preserve the original intent but vary wording, synonyms, or perspective. Output ONLY a JSON array of ${cfg.queryExpansionParaphrases} strings. No prose, no markdown fences.

Question: ${q}`;

  let paraphrases: string[] = [];
  let success = false;
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: cfg.queryExpansionModel,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 300,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`expansion ${res.status}`);
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = data.choices?.[0]?.message?.content ?? "";
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) { paraphrases = JSON.parse(match[0]); success = true; }
  } catch (err) {
    console.warn(`[query-expansion] failed (${(err as Error).message.slice(0, 100)}); using original query only`);
  }

  // Dedupe against original + normalize to strings.
  // Normalize for comparison (case- and whitespace-insensitive), keep original casing in output.
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ");
  const seen = new Set<string>([norm(q)]);
  const cleaned = [q];
  for (const p of paraphrases) {
    if (typeof p !== "string") continue;
    const trimmed = p.trim();
    if (trimmed && !seen.has(norm(trimmed))) {
      cleaned.push(trimmed);
      seen.add(norm(trimmed));
    }
  }

  // Only cache successful expansions — failed ones retry on the next call.
  if (success) CACHE.set(q, cleaned);
  return cleaned;
}
