import { getRagConfig } from "../../../src/lib/rag/config"

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

/**
 * Cheap fast model for both answer generation and the LLM-as-judge step.
 * Override via KB_EVAL_JUDGE_MODEL when running cross-model comparisons.
 */
function judgeModel(): string {
  return process.env.KB_EVAL_JUDGE_MODEL || getRagConfig().queryExpansionModel || "openai/gpt-4.1-nano"
}

async function callOpenRouter(prompt: string, maxTokens: number): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set")
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: judgeModel(),
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      temperature: 0,
    }),
    signal: AbortSignal.timeout(60000),
  })
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
  return data.choices?.[0]?.message?.content ?? ""
}

/**
 * Generate an answer for a query using the retrieved chunks as context. This
 * is a simplified version of the production RAG prompt — for eval purposes we
 * want a clean, reproducible answer based purely on the chunks we measured.
 */
export async function generateEvalAnswer(
  query: string,
  contextChunks: Array<{ documentTitle: string; content: string }>
): Promise<string> {
  const sources = contextChunks
    .map((c) => `[${c.documentTitle}]\n${c.content}`)
    .join("\n\n---\n\n")
  const prompt = `You are answering a user's question using ONLY the excerpts below. Cite each substantive claim inline as [Document Title]. If the excerpts don't contain enough information to answer, say so explicitly.

Excerpts:
${sources}

Question: ${query}

Answer:`
  return callOpenRouter(prompt, 1500)
}

/**
 * LLM-as-judge faithfulness scorer. Asks a judge model whether the answer's
 * claims are supported by the provided context. Returns a 0..1 score + a
 * short reasoning. Strict JSON output requested; falls back to 0 + raw text
 * on parse failure.
 */
export async function judgeFaithfulness(
  query: string,
  answer: string,
  contextChunks: Array<{ documentTitle: string; content: string }>
): Promise<{ score: number; reason: string }> {
  if (!answer.trim()) return { score: 0, reason: "empty answer" }
  const sources = contextChunks
    .map((c) => `[${c.documentTitle}]\n${c.content}`)
    .join("\n\n---\n\n")
  const prompt = `Score whether the ANSWER appropriately uses the CONTEXT.

Score 1.0 when EITHER:
  (a) every substantive claim in the answer is supported by the context, OR
  (b) the answer correctly refuses / states the information is not in the context, AND the context genuinely does not contain the requested information (out-of-scope queries, or in-scope queries where the specific detail asked is absent).

Score 0.7 when most claims are supported but the answer adds brief background context (definitions, general framing) that goes slightly beyond the literal excerpts. This is acceptable composition; reserve 0.5 / 0.0 for cases where the addition matters factually.

Score 0.5 when some claims are supported but others are clear inferences or general knowledge that materially extend the answer beyond what the context says.

Score 0.0 when the answer:
  - contradicts the context, OR
  - fabricates specific facts not in the context, OR
  - refuses to answer even though the context DID contain the requested information (under-answers).

IMPORTANT: a refusal answer like "the information is not available in the excerpts" is FAITHFUL (1.0) when the context truly lacks it, and a FAILURE (0.0) when the context did contain it. Do not penalize correct refusals.

Output ONLY a JSON object: {"score": <0-1 float>, "reason": "<one short sentence>"}

CONTEXT:
${sources}

QUESTION: ${query}

ANSWER: ${answer}

JSON:`
  const raw = await callOpenRouter(prompt, 200)
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return { score: 0, reason: `parse fail: ${raw.slice(0, 100)}` }
  try {
    const parsed = JSON.parse(match[0]) as { score?: unknown; reason?: unknown }
    const score = typeof parsed.score === "number"
      ? Math.max(0, Math.min(1, parsed.score))
      : 0
    const reason = typeof parsed.reason === "string" ? parsed.reason : ""
    return { score, reason }
  } catch {
    return { score: 0, reason: `parse fail: ${raw.slice(0, 100)}` }
  }
}
