/**
 * The AI checker: the base 8B model (no adapter) answers each new question
 * itself — passage plus question, WITHOUT the key — naming every option that is
 * correct according to the passage. The question passes only if that set equals
 * the key exactly. It catches what the word checks cannot: a key that does not
 * follow from the passage, and another option that is also true.
 *
 * Calibrated in the reference mockup (src/lib/pemeriksaAI.ts) on 928
 * blind-judged questions: drops 3% of good questions and 54% of bad ones
 * (single 2% vs 56%, story 7% vs 27%, multi 0% vs 78%). Prompt quoted verbatim.
 *
 * A failed checker call KEEPS the question: a broken checker must not stop a
 * practice session.
 */
import type { ChatMessage } from "./client"
import type { AdapterSoal } from "./generate-contract"

export const CHECKER_SYSTEM =
  "Kamu pemeriksa soal pilihan ganda untuk siswa SMP. Nilailah HANYA berdasarkan bacaan yang diberikan, " +
  "bukan pengetahuan umummu."

export const CHECKER_SCHEMA = {
  type: "object",
  properties: { benar: { type: "array", items: { type: "string", enum: ["A", "B", "C", "D"] }, minItems: 0, maxItems: 4 } },
  required: ["benar"],
  additionalProperties: false,
}

export function checkerUserMessage(s: AdapterSoal, passage: string): string {
  const soal =
    (s.skenario ? `Skenario: ${s.skenario}\n` : "") +
    `Pertanyaan: ${s.pertanyaan}\n` +
    ["A", "B", "C", "D"].map((l) => `${l}. ${s.opsi[l]}`).join("\n")
  return (
    `Bacaan:\n${passage}\n\nSoal:\n${soal}\n\nSebutkan SEMUA huruf pilihan yang benar menurut bacaan. Bisa satu, bisa lebih ` +
    "dari satu. Jika tidak ada pilihan yang benar menurut bacaan, kosongkan."
  )
}

/** Compare the checker's reply with the key. null reply (call failed or unparsable) passes. */
export function judgeChecker(reply: string | null, key: string[]): { ok: boolean; answer: string[] | null } {
  if (reply === null) return { ok: true, answer: null }
  let answer: string[]
  try {
    const benar = (JSON.parse(reply) as { benar?: unknown }).benar
    if (!Array.isArray(benar)) return { ok: true, answer: null }
    answer = [...new Set(benar.filter((x): x is string => typeof x === "string"))].sort()
  } catch {
    return { ok: true, answer: null }
  }
  const sorted = [...key].sort()
  return { ok: answer.length === sorted.length && answer.every((l, i) => l === sorted[i]), answer }
}

/** Call settings for the checker: deterministic, and the reply is a handful of letters. */
export const CHECKER_CALL = { temperature: 0, maxTokens: 60, schemaName: "periksa", schema: CHECKER_SCHEMA, timeoutMs: 60_000 }

export function checkerMessages(s: AdapterSoal, passage: string): ChatMessage[] {
  return [{ role: "system", content: CHECKER_SYSTEM }, { role: "user", content: checkerUserMessage(s, passage) }]
}

/**
 * Run the checker through `call` (one structured chat call returning the reply
 * text, or null on failure) and judge the reply against the key.
 */
export async function aiCheck(
  call: (messages: ChatMessage[], opts: typeof CHECKER_CALL) => Promise<string | null>,
  s: AdapterSoal,
  passage: string,
): Promise<{ ok: boolean; answer: string[] | null }> {
  return judgeChecker(await call(checkerMessages(s, passage), CHECKER_CALL), s.kunci)
}
