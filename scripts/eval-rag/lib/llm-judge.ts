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
  const prompt = `Score whether the ANSWER is faithfully grounded in the CONTEXT excerpts below.

Score 1.0 = every substantive claim in the answer is directly supported by the context.
Score 0.5 = some claims supported, others appear to be inferences or general knowledge.
Score 0.0 = the answer contradicts the context, fabricates facts, or is unrelated.

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
