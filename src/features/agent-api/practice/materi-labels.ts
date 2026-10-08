/**
 * Materi titles for a practice set, from an optional labelling model.
 *
 * Mastery is reported per materi title, so a set whose questions all carry the
 * same title tells a student nothing about where they are weak. The book chunks
 * the questions come from usually have no section heading to borrow, so when a
 * deployment names a model in AGENT_API_PRACTICE_LABEL_MODEL the questions are
 * grouped by it in one short call. The questions and keys are already fixed at
 * that point: the model only names what each question is about.
 *
 * Unset, slow, or wrong-shaped output all fall back to the code-derived title.
 */

export function labelPrompt(questions: string[], topic: string): string {
  const list = questions.map((q, i) => `${i + 1}. ${q}`).join("\n")
  const shape = questions.map(() => '"..."').join(", ")
  // Kept deliberately plain. An earlier wording that also asked for "as few
  // distinct titles as possible, at most 3" sent a reasoning model into 2000
  // tokens of deliberation with nothing left for the answer; this one was
  // answered in 300–650 reasoning tokens on the same questions.
  return (
    `Soal latihan tentang "${topic}":\n${list}\n\n` +
    `Beri setiap soal satu judul materi singkat (2 sampai 4 kata) sesuai pokok bahasannya. ` +
    `Soal dengan pokok bahasan yang sama memakai judul yang sama persis. ` +
    `Ini tugas sederhana: jangan menimbang panjang, langsung tulis jawabannya.\n` +
    `Balas HANYA JSON: {"materi": [${shape}]} — tepat ${questions.length} judul, urut sesuai nomor soal.`
  )
}

/**
 * Read the labeller's reply. Returns null unless it is exactly `n` usable
 * titles — a partial list would silently mislabel the questions after it.
 */
export function parseMateriLabels(raw: string, n: number): string[] | null {
  const text = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<think>[\s\S]*$/i, "")
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start < 0 || end <= start) return null
  let data: unknown
  try {
    data = JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
  const list = (data as { materi?: unknown })?.materi
  if (!Array.isArray(list) || list.length !== n) return null
  const out: string[] = []
  for (const item of list) {
    if (typeof item !== "string") return null
    const title = item.replace(/\s+/g, " ").trim().replace(/[.:;,]+$/, "")
    if (title.length < 3 || title.length > 60) return null
    out.push(title)
  }
  // Titles differing only in case are one materi, not two.
  const canonical = new Map<string, string>()
  return out.map((t) => {
    const k = t.toLowerCase()
    if (!canonical.has(k)) canonical.set(k, t)
    return canonical.get(k)!
  })
}
