/**
 * Book passages fit to write practice questions from: explanatory prose only.
 *
 * Questions built from a book's own exercises have no answer in the book
 * (end-of-chapter questions ship without keys), and hand review found sets built
 * that way: "warga Y memaksakan pendapat di rapat RT -> sila ...." was an essay
 * exercise, and a distractor of exercise no. 4 became a key. So exercise blocks
 * and exercise-like sentences are removed before a passage reaches the adapter,
 * and the same cleaned text is what the checks verify against.
 *
 * Ported from the reference mockup (src/lib/bacaan.ts). Plain string
 * operations, no regular expressions, as there: every rule comes from a defect
 * found in hand testing.
 */

/** Collapse all whitespace, line breaks included: PDF extraction breaks lines mid-phrase. */
export function flatten(text: string): string {
  let out = ""
  for (const ch of text) {
    const code = ch.charCodeAt(0)
    out += code <= 32 || code === 160 ? " " : ch
  }
  return out.split(" ").filter((w) => w.length > 0).join(" ")
}

/**
 * Split book text into sentences: a boundary is . ? ! then a space then a
 * capital, so "6.1", "Gambar 6.9b" and "Swt. dan" are not cut. A number before a
 * full stop ("... itu! 5. Pada sebuah rapat") starts a new item rather than
 * ending the previous sentence.
 */
export function splitSentences(text: string): string[] {
  const t = flatten(text)
  const out: string[] = []
  let buf = ""
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    buf += ch
    if ((ch === "." || ch === "?" || ch === "!") && t[i + 1] === " ") {
      const c = t[i + 2] ?? ""
      if (c === c.toLowerCase()) continue
      if (ch === ".") {
        let j = buf.length - 2
        let digits = 0
        while (j >= 0 && buf[j] >= "0" && buf[j] <= "9") {
          j--
          digits++
        }
        if (digits >= 1 && digits <= 3 && (j < 0 || buf[j] === " ")) {
          const head = buf.slice(0, j + 1).trim()
          if (head) out.push(head)
          buf = buf.slice(j + 1)
          continue
        }
      }
      out.push(buf.trim())
      buf = ""
    }
  }
  if (buf.trim()) out.push(buf.trim())
  return out
}

/** How often "digit + full stop + space" appears: list markers merged into one sentence. */
function listMarkers(k: string): number {
  let n = 0
  for (let i = 0; i + 2 < k.length; i++) {
    if (k[i] >= "0" && k[i] <= "9" && k[i + 1] === "." && k[i + 2] === " ") n++
  }
  return n
}

/** A sentence that starts with an item number ("5. Pada sebuah rapat RT, ..."). */
function startsWithNumber(k: string): boolean {
  let i = 0
  while (i < k.length && k[i] >= "0" && k[i] <= "9") i++
  return i > 0 && i <= 3 && k[i] === "." && k[i + 1] === " "
}

/** Imperatives that open an exercise or activity, with or without "!". */
const EXERCISE_VERBS = [
  "Jelaskan", "Sebutkan", "Tuliskan", "Buatlah", "Carilah", "Ceritakanlah", "Diskusikan",
  "Perhatikan", "Amatilah", "Isilah", "Pilihlah", "Jawablah", "Lengkapilah", "Bandingkan", "Coba ",
]

/** A sentence that is NOT explanatory text. */
export function notExplanation(k: string): boolean {
  if (EXERCISE_VERBS.some((p) => k.startsWith(p))) return true
  if (k.includes("....") || k.includes("…")) return true // fill-in-the-blank
  if (k.includes("A.") && k.includes("B.")) return true // multiple-choice options
  if (k.includes("?")) return true // a question, also one merged mid-chunk
  if (k.endsWith("!") || k.includes("! ")) return true // activity instruction
  if (listMarkers(k) >= 2) return true // merged list of tools or steps
  if (startsWithNumber(k)) return true // numbered exercise item
  if (k.includes("(1)") && k.includes("(2)")) return true // statements for a multiple-choice item
  if (k.includes("Apa yang kamu perlukan") || k.includes("Apa yang harus kamu lakukan")) return true
  if (k.includes("Sumber: Dok") || k.includes("Ayo, Kita") || k.includes("Kemdikbud")) return true
  if (k.includes("##")) return true // a markdown heading merged into a sentence
  return false
}

/**
 * Markers that really open an end-of-chapter exercise block, chosen from corpus
 * counts. "Aktivitas", "Tugas" and "Refleksi" are too common to cut at; other
 * exercise blocks are caught sentence by sentence.
 */
const EXERCISE_BLOCKS = [
  "Uji Kompetensi", "Rajin Berlatih", "Pilihlah salah satu jawaban",
  "Lembar Kerja Peserta Didik", "Soal Latihan", "Penilaian Akhir",
]

/** Remove exercise sections from a passage, keeping the explanatory prose. */
export function stripExercises(text: string): string {
  let t = flatten(text).split("## ").join("").split("##").join("")
  let cut = t.length
  for (const marker of EXERCISE_BLOCKS) {
    const i = t.indexOf(marker)
    if (i >= 0 && i < cut) cut = i
  }
  t = t.slice(0, cut)
  return splitSentences(t).filter((k) => !notExplanation(k)).join(" ")
}

/**
 * Figure chunks arrive as "[Gambar] <caption> — Konteks: <surrounding prose>".
 * The caption describes an image the student never sees; the context is
 * ordinary book prose. Keep only the context (nothing if there is none). On the
 * UGM corpus these are ~4% of chunks, and their chunk type is not set, so they
 * cannot be filtered out by type.
 */
export function stripFigureCaption(text: string): string {
  const t = text.trimStart()
  if (!t.startsWith("[Gambar]")) return text
  const i = t.indexOf("Konteks:")
  return i >= 0 ? t.slice(i + "Konteks:".length).trim() : ""
}

/** Shortest cleaned passage worth a question: the mockup's calibrated floor. */
export const MIN_PASSAGE_CHARS = 350

/**
 * Clean every passage and keep those with enough prose left. Never returns an
 * empty list when the input had text: if cleaning leaves nothing long enough,
 * the longest cleaned passages are used, and failing that the originals —
 * questions from slightly noisy text beat no questions at all.
 */
export function passagesForPractice<T extends { text: string }>(list: T[], min = MIN_PASSAGE_CHARS): T[] {
  const cleaned = list.map((p) => ({ ...p, text: stripExercises(stripFigureCaption(p.text)) }))
  const enough = cleaned.filter((p) => p.text.length >= min)
  if (enough.length) return enough
  const some = cleaned.filter((p) => p.text.length > 0).sort((a, b) => b.text.length - a.text.length)
  return some.length ? some : list
}
