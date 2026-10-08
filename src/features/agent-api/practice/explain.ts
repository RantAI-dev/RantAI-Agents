/**
 * `materi` and `pembahasan` for each generated question.
 *
 * The practice adapter emits neither. Both are derived here from the book
 * excerpts the questions were generated from, by code: the explanation quotes a
 * sentence that is actually in the book, so it cannot contain an invention, and
 * the materi title is the heading of the excerpt the question draws on.
 */
import type { AdapterSoal } from "./generate-contract"

export interface Excerpt {
  title: string
  section: string | null
  text: string
}

const STOP = new Set(
  "yang dan di ke dari pada untuk dengan adalah itu ini atau juga akan oleh dalam sebagai tidak ada apa saja lebih karena maka jika agar serta para kita kamu saya the of a an is".split(" "),
)

export function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  )
}

function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0
  for (const w of a) if (b.has(w)) n++
  return n
}

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 25 && s.length <= 400)
}

/** A heading worth showing, or null: page labels and bare numbers are not topics. */
function usableSection(section: string | null): string | null {
  const s = section?.trim()
  if (!s || s.toLowerCase() === "none" || s.length < 4 || s.length > 90) return null
  if (/^(gambar|tabel|halaman)\b/i.test(s) || /^[\d\s.\-–]+$/.test(s)) return null
  return s
}

export function explain(
  soal: AdapterSoal,
  excerpts: Excerpt[],
  topic: string,
): { materi: string; pembahasan: string } {
  const answerText = soal.kunci.map((k) => soal.opsi[k]).join(" ")
  const want = tokens(`${soal.pertanyaan} ${answerText}`)

  let bestExcerpt: Excerpt | null = null
  let bestExcerptScore = 0
  let bestSentence = ""
  let bestSentenceScore = 0
  for (const e of excerpts) {
    const score = overlap(want, tokens(e.text))
    if (score > bestExcerptScore) {
      bestExcerptScore = score
      bestExcerpt = e
    }
    for (const s of sentences(e.text)) {
      // The sentence must speak to the answer, not just share the question's words.
      const st = tokens(s)
      const sScore = overlap(tokens(answerText), st) * 2 + overlap(want, st)
      if (sScore > bestSentenceScore) {
        bestSentenceScore = sScore
        bestSentence = s
      }
    }
  }

  const keyLabel = soal.kunci.map((k) => `${k}. ${soal.opsi[k]}`).join(" dan ")
  const lead = soal.kunci.length > 1 ? `Jawaban yang benar adalah ${keyLabel}.` : `Jawaban yang benar adalah ${keyLabel}.`
  // Quote the book only when a sentence clearly supports the answer; a weak
  // match would read as evidence it is not.
  const pembahasan = bestSentenceScore >= 4 ? `${lead} Di buku tertulis: "${bestSentence}"` : lead

  return { materi: usableSection(bestExcerpt?.section ?? null) ?? topic.trim(), pembahasan }
}
