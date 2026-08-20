/**
 * IKAT-Bench — question generation, rebuilt around what a pupil actually asks.
 *
 * The v1 generator produced questions like "Berapa banyak angka yang tertera
 * pada dial timbangan duduk tersebut?". Nobody asks that. The cause was in the
 * prompt itself: it showed a model ONE figure and demanded something answerable
 * *only* by looking at it, offering "berapa banyak objek" and "apa label pada
 * bagiannya" as examples. That procedure manufactures name-what-is-visible
 * questions — and those flatter description-matching for the trivial reason that
 * both describe picture content.
 *
 * Two changes follow from that diagnosis:
 *
 *   1. NO FIGURE IS IN VIEW. Questions are written from the lesson text alone,
 *      as a pupil studying the chapter would ask. Which figure belongs is a
 *      separate decision, made later and by a person — never baked into the
 *      question's origin, which is exactly how the old gold standard came to
 *      agree with human judgement at chance (docs/paper/07-human-gold-audit.md).
 *
 *   2. THE FAILURE MODE IS NAMED IN THE PROMPT. Real rejected questions from v1
 *      are shown as anti-examples. Telling a model what good looks like is much
 *      weaker than showing it the specific mistake to avoid.
 *
 * Usage:
 *   IKAT_PROVIDER=ugm IKAT_CORPUS=ugm3-built \
 *     bun tests/bench-kb/src/ikat/generate-questions-v2.ts [perDoc] [docs]
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { genChat as chat } from "./providers"
import { GEN_MODEL } from "./systems"

const BENCH_ROOT = path.resolve(import.meta.dirname, "../..")
const CORPUS = path.join(BENCH_ROOT, "corpus", process.env.IKAT_CORPUS ?? "ugm3-built")
const OUT = path.join(BENCH_ROOT, "corpus", process.env.IKAT_QOUT ?? "questions-v2.json")

export const STUDENT_Q_PROMPT = `Kamu adalah siswa kelas 3 SD di Indonesia. Kamu baru saja membaca bagian buku pelajaran di bawah ini, dan ada hal yang belum kamu mengerti.

Bagian buku:
---
{CTX}
---

Tulis {N} pertanyaan yang benar-benar akan kamu tanyakan kepada guru atau asisten belajar.

Pertanyaan yang BAIK terdengar seperti ini:
- "Apa itu gaya gesek?"
- "Bagaimana cara mengukur berat badan dengan timbangan?"
- "Kenapa air bisa berubah jadi es?"
- "Bagaimana Yesus memberi makan lima ribu orang?"
- "Apa bedanya persegi dan persegi panjang?"

Pertanyaan yang BURUK — JANGAN tulis seperti ini:
- "Berapa banyak angka yang tertera pada dial timbangan duduk tersebut?"  (menanyakan detail yang hanya terlihat di gambar)
- "Apa yang ditunjukkan pada bagian yang diberi label B?"  (mengacu ke gambar)
- "Menurut teks di atas, apa yang dimaksud dengan..."  (mengacu ke teks)
- "Sebutkan tiga hal yang disebutkan pada halaman ini."  (seperti soal ujian, bukan pertanyaan murid)

Aturan:
- Tanyakan tentang KONSEP atau CARA, bukan tentang apa yang terlihat di suatu gambar.
- JANGAN pernah menyebut "gambar", "teks di atas", "halaman", "tabel", atau "bagian ini".
- Pertanyaan harus bisa dimengerti sendiri, tanpa perlu membaca bagian buku di atas.
- Pakai bahasa sehari-hari anak SD, bukan bahasa buku.
- Setiap pertanyaan harus berbeda topik.
- Tanyakan tentang ISI PELAJARAN yang dibahas, BUKAN tentang mata pelajarannya secara umum.
  BURUK: "Apa itu pendidikan agama Hindu?" / "Kenapa kita perlu belajar matematika?"
  BAIK:  "Kenapa umat Hindu sembahyang tiga kali sehari?" / "Kenapa hasil 4 x 5 sama dengan 5 x 4?"
- Kalau bagian buku ini cuma daftar isi, kata pengantar, atau keterangan penerbit,
  balas {"questions":[]} dan jangan mengarang pertanyaan.

Balas HANYA JSON:
{"questions":[{"question":"...","answer":"..."}]}`

function parseJson<T>(s: string): T | null {
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fence ? fence[1] : s
  const i = body.indexOf("{")
  const j = body.lastIndexOf("}")
  if (i < 0 || j < 0) return null
  try {
    return JSON.parse(body.slice(i, j + 1)) as T
  } catch {
    return null
  }
}

/** Cheap structural rejects, so obviously broken output never reaches judging. */
export function violations(q: string): string[] {
  const bad: string[] = []
  if (/\bgambar\b|\bfoto\b|\bilustrasi\b|\btabel\b|\bdiagram\b|\bgrafik\b/i.test(q)) bad.push("refers to a figure")
  if (/teks di atas|bacaan di atas|paragraf|halaman ini|bagian ini|berdasarkan teks/i.test(q)) bad.push("refers to the passage")
  if (/^sebutkan|^tuliskan|^jelaskan secara rinci|^uraikan/i.test(q.trim())) bad.push("exam-paper phrasing")
  if (q.length > 140) bad.push("too long for a pupil")
  if (!q.trim().endsWith("?")) bad.push("not a question")
  return bad
}

async function main() {
  const perDoc = parseInt(process.argv[2] ?? "6", 10)
  const nDocs = parseInt(process.argv[3] ?? "13", 10)
  const files = fs.readdirSync(CORPUS).filter((f) => f.endsWith(".json")).sort().slice(0, nDocs)

  const out: any[] = []
  const seen = new Set<string>()
  let rejected = 0
  for (const [n, file] of files.entries()) {
    const doc = JSON.parse(fs.readFileSync(path.join(CORPUS, file), "utf-8"))
    // Front matter is the single biggest source of junk: the first pilot returned
    // "Apa itu Kementerian Pendidikan?" and "Kenapa buku ini disusun oleh banyak
    // orang?" — both from the copyright page. Skip the opening and closing
    // fractions of the book outright, then drop anything that still looks like
    // apparatus rather than a lesson.
    const APPARATUS = /hak cipta|isbn|daftar isi|kata pengantar|penerbit|katalog dalam terbitan|penulis\s*:|penelaah|glosarium|daftar pustaka|indeks|kementerian pendidikan/i
    // Seven of the thirteen books are TEACHER GUIDES (`buku-panduan-guru-*`), and
    // much of their bulk is lesson planning, assessment rubrics and time
    // allocation — addressed to the teacher, never asked about by a pupil. The
    // second pilot surfaced exactly that: "Kenapa penilaian penting untuk tahu
    // kemajuan belajar kita?" and "Apa yang harus kita tulis di rubrik Siap-Siap
    // Belajar?". Their subject narrative is still good material, so the pedagogy
    // is filtered rather than the book discarded.
    const PEDAGOGY = /asesmen|penilaian|rubrik|capaian pembelajaran|tujuan pembelajaran|kegiatan pembelajaran|alokasi waktu|media pembelajaran|refleksi guru|langkah-langkah pembelajaran|interaksi guru|pengayaan|remedial|profil pelajar|skenario pembelajaran|lembar kerja/i
    const all = (doc.chunks ?? []) as any[]
    const lo = Math.floor(all.length * 0.12)
    const hi = Math.floor(all.length * 0.95)
    const chunks = all
      .slice(lo, hi)
      .filter((c: any) => {
        const t = c.text ?? ""
        if (t.length <= 600) return false
        if (APPARATUS.test(t.slice(0, 400))) return false
        // Reject on DENSITY, not on a single mention: a lesson narrative can name
        // an activity in passing without being planning material.
        const hits = (t.match(new RegExp(PEDAGOGY.source, "gi")) ?? []).length
        return hits < 3
      })
    if (!chunks.length) continue
    const step = Math.max(1, Math.floor(chunks.length / perDoc))
    let made = 0
    for (let i = 0; i < chunks.length && made < perDoc; i += step) {
      const c = chunks[i]
      const res = await chat(
        GEN_MODEL,
        [{ role: "user", content: STUDENT_Q_PROMPT.replace("{CTX}", c.text.slice(0, 2500)).replace("{N}", "2") }],
        500,
      )
      const parsed = parseJson<{ questions: Array<{ question: string; answer: string }> }>(res.text)
      for (const q of parsed?.questions ?? []) {
        const v = violations(q.question ?? "")
        if (v.length) {
          rejected++
          continue
        }
        // Near-duplicates are a real failure here, not a nuisance: the pilot
        // produced "Bagaimana cara kita bisa jadi anak yang budi pekerti baik?"
        // in two different books. A benchmark carrying the same question twice
        // measures the same thing twice and calls it coverage.
        const norm = q.question.toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim()
        if (seen.has(norm)) {
          rejected++
          continue
        }
        seen.add(norm)
        out.push({
          id: `${doc.slug}::v2q${out.length}`,
          question: q.question.trim(),
          goldAnswer: (q.answer ?? "").trim(),
          docSlug: doc.slug,
          sourceChunkId: c.id,
          type: "student",
          bookType: /panduan-guru/.test(doc.slug) ? "teacher-guide" : "student-book",
          goldFigureIds: [],
        })
        made++
        if (made >= perDoc) break
      }
    }
    console.log(`[${n + 1}/${files.length}] ${doc.slug} — ${made} kept`)
  }

  fs.writeFileSync(OUT, JSON.stringify(out, null, 1))
  console.log(`\n${out.length} questions kept, ${rejected} rejected by structural filter -> ${OUT}`)
  console.log(`\nSAMPLE:`)
  for (const q of out.slice(0, 12)) console.log(`  - ${q.question}`)
}

if (import.meta.main) main()
