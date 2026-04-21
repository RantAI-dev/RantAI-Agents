import { getRagConfig } from "./config";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const PROMPT_HEADER = `You are helping index a knowledge base. Given the full document below (cached) and a list of chunks from it, generate a short 1-sentence context for each chunk. The context should describe what the chunk is about *in relation to the full document* — what section it belongs to, what it continues from, or what key entity it describes. This helps downstream retrieval resolve ambiguous chunks.

Output EXACTLY a JSON array of strings — one string per chunk, same order as input. No prose, no markdown fences.`;

/**
 * Batched Contextual Retrieval (Anthropic 2024). One LLM call per document,
 * producing N context prefixes for N chunks. Uses prompt caching via the
 * `cache_control: {type:"ephemeral"}` content-block annotation — the full-doc
 * block is cached, so chunks 2..N pay only for the small "chunks" suffix.
 *
 * Returns an array of the same length as `chunks`. Empty strings indicate
 * "no context for this chunk" (either disabled, failed, or mismatch) — the
 * caller should treat empty prefixes as a no-op.
 */
export async function generateContextualPrefixes(
  fullDocument: string,
  chunks: string[]
): Promise<string[]> {
  const empty = () => chunks.map(() => "");

  const cfg = getRagConfig();
  if (!cfg.contextualRetrievalEnabled) return empty();
  if (chunks.length === 0) return [];

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return empty();

  const chunkBlock = chunks
    .map((c, i) => `[${i}] ${c.slice(0, 800).replace(/\n/g, " ")}`)
    .join("\n\n");

  const body = {
    model: cfg.contextualRetrievalModel,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `FULL DOCUMENT:\n${fullDocument}`,
            cache_control: { type: "ephemeral" },
          },
          {
            type: "text",
            text: `${PROMPT_HEADER}\n\nCHUNKS:\n${chunkBlock}\n\nRespond with a JSON array of ${chunks.length} strings:`,
          },
        ],
      },
    ],
    max_tokens: 1500,
    temperature: 0,
  };

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`CR ${res.status}`);
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = data.choices?.[0]?.message?.content ?? "";
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return empty();
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed) || parsed.length !== chunks.length) return empty();
    return parsed.map((s) => (typeof s === "string" ? s.trim() : ""));
  } catch (err) {
    console.warn(`[contextual-retrieval] failed (${(err as Error).message.slice(0, 100)}); chunks indexed without context`);
    return empty();
  }
}
