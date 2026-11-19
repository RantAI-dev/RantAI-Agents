/**
 * The contract the fine-tuned practice adapter (practice v10e, 8B) was trained
 * on, and its mapping to the product's practice-set shape.
 *
 * One call = one book passage and at most three questions of one type, with a
 * plain teacher system prompt (not the assistant persona). The training data
 * never had more than three questions per prompt; five from one passage came out
 * near-identical. The prompt is "prompt v2" of the reference mockup
 * (IdhamTryCode/Agents-Mockup, src/lib/promptLatihanV2.ts), quoted verbatim: it
 * halved wrong keys against v1 in blind judging.
 *
 * The schema is sent as `response_format: json_schema` (the older `guided_json`
 * is accepted and silently ignored by this vLLM build). Three details matter:
 *  - `skenario` comes FIRST: guided decoding emits keys in property order, and
 *    with the story last every story call degenerated until timeout.
 *  - `kunci` is an array pinned to exactly 1 key (2 for multi).
 *  - the question array is pinned with minItems = maxItems; a merely bounded
 *    array overflowed to its maximum.
 */
import type { PracticeQuestion } from "./types"

export type AdapterTipe = "tunggal" | "cerita" | "multi"

/** At most this many questions per adapter call, as in its training data. */
export const MAX_PER_CALL = 3

/** The grade number for the system prompt: "Kelas 8" -> "8". */
export function gradeNumber(kelas: string | number | null | undefined): string {
  return (String(kelas ?? "").match(/[0-9]+/) ?? ["8"])[0]
}

export function adapterSystem(kelas: string | number | null | undefined): string {
  return (
    `Kamu guru yang menyusun soal latihan untuk siswa SMP kelas ${gradeNumber(kelas)} di Indonesia. ` +
    "Soal, pilihan, dan kunci jawaban HANYA boleh berdasarkan bacaan yang diberikan. " +
    "Jangan mengarang fakta di luar bacaan. " +
    "Setiap soal harus punya jawaban yang pasti: guru yang membaca bacaan itu harus setuju bahwa kunci benar dan semua pilihan lain salah."
  )
}

export const REQUEST_V2: Record<AdapterTipe, string> = {
  tunggal:
    "Buat {n} soal pilihan ganda dengan tepat SATU jawaban benar. Tanyakan hal yang jawabannya hanya satu menurut bacaan.",
  cerita:
    "Buat {n} soal cerita pilihan ganda. Setiap soal diawali 'skenario': cerita singkat tentang situasi sehari-hari yang " +
    "menerapkan isi bacaan, tanpa menyebutkan jawabannya. 'pertanyaan' menanyakan hal tentang skenario itu dan hanya punya " +
    "SATU jawaban benar. Hal yang ditanyakan harus benar-benar muncul di skenario, dan skenario tidak boleh memuat fakta " +
    "ilmiah atau aturan yang tidak ada di bacaan. Pakai nama tokoh yang beragam.",
  multi:
    "Buat {n} soal pilihan ganda dengan tepat DUA jawaban benar. Ambil soal dari bagian bacaan yang menyebut paling sedikit " +
    "dua hal yang berbeda. Dua kunci harus dua hal BERBEDA yang sama-sama disebut bacaan, bukan dua kalimat yang maknanya " +
    "sama. Dua pilihan lainnya harus salah menurut bacaan; jangan memakai anggota lain dari daftar yang sama dengan kunci " +
    "sebagai pilihan salah. Setiap pertanyaan diakhiri '(pilih dua)'.",
}

export const RULES_V2 =
  "Aturan untuk setiap soal:\n" +
  "- Empat pilihan (A, B, C, D) harus berbeda satu sama lain, baik kata maupun maknanya. Jangan membuat pilihan salah yang " +
  "hanya mengubah sedikit kata dari kunci atau bersinonim dengan kunci.\n" +
  "- Kunci harus disebut jelas di bacaan. Jangan menambahkan keterangan, contoh, angka, atau alasan yang tidak ada di bacaan ke dalam kunci.\n" +
  "- Pilihan yang salah harus masuk akal, tetapi jelas salah menurut bacaan. Pilihan salah tidak boleh berisi hal yang juga benar menurut bacaan.\n" +
  "- Jika bacaan menyebut daftar yang diakhiri 'dan lain-lain', 'dan sebagainya', atau 'dan jenis lainnya', jangan memakai " +
  "anggota lain dari kelompok itu sebagai pilihan salah.\n" +
  "- Jangan menukar isi antarkategori (misalnya nilai satu sila dengan sila lain, atau fungsi satu alat dengan alat lain), " +
  "kecuali bacaan menyatakannya dengan jelas.\n" +
  "- Siswa TIDAK melihat bacaan ini, jadi soal harus bisa dipahami tanpa bacaan. Jangan menulis 'menurut bacaan' atau 'menurut teks'.\n" +
  "- Tulis kalimat biasa di setiap kolom. Jangan menulis tanda kurung kurawal atau potongan soal lain di dalam teks.\n" +
  "- 'kunci' diisi huruf pilihan yang benar."

export function adapterUserMessage(tipe: AdapterTipe, jumlah: number, passage: string): string {
  return `Bacaan:\n[1] ${passage}\n\n${REQUEST_V2[tipe].replace("{n}", String(jumlah))}\n${RULES_V2}`
}

/** Token budget per call, scaled to the questions requested. */
export function adapterMaxTokens(jumlah: number): number {
  return 400 + 340 * jumlah
}

export function adapterSchema(tipe: AdapterTipe, jumlah: number) {
  const props: Record<string, unknown> = {
    ...(tipe === "cerita" ? { skenario: { type: "string" } } : {}),
    pertanyaan: { type: "string" },
    opsi: {
      type: "object",
      properties: { A: { type: "string" }, B: { type: "string" }, C: { type: "string" }, D: { type: "string" } },
      required: ["A", "B", "C", "D"],
      additionalProperties: false,
    },
    kunci: {
      type: "array",
      items: { type: "string", enum: ["A", "B", "C", "D"] },
      minItems: tipe === "multi" ? 2 : 1,
      maxItems: tipe === "multi" ? 2 : 1,
    },
  }
  const required = tipe === "cerita" ? ["skenario", "pertanyaan", "opsi", "kunci"] : ["pertanyaan", "opsi", "kunci"]
  return {
    type: "object",
    properties: {
      soal: {
        type: "array",
        minItems: jumlah,
        maxItems: jumlah,
        items: { type: "object", properties: props, required, additionalProperties: false },
      },
    },
    required: ["soal"],
    additionalProperties: false,
  }
}

export interface AdapterSoal {
  pertanyaan: string
  opsi: Record<string, string>
  kunci: string[]
  skenario?: string
}

const LETTERS = ["A", "B", "C", "D"]

/**
 * Parse the adapter's reply into usable questions.
 *
 * Returns null only when the reply is not JSON or holds no question at all —
 * the caller retries that once. A reply with some malformed questions keeps the
 * good ones: each dropped question is refilled later from another passage, which
 * is cheaper than throwing the whole call away. Questions whose four options are
 * not all different are dropped here (the key would be ambiguous).
 */
export function parseAdapterReply(raw: string, tipe: AdapterTipe): AdapterSoal[] | null {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  const soal = (data as { soal?: unknown })?.soal
  if (!Array.isArray(soal) || soal.length === 0) return null
  const out: AdapterSoal[] = []
  for (const s of soal as Array<Record<string, unknown>>) {
    const pertanyaan = typeof s?.pertanyaan === "string" ? s.pertanyaan.trim() : ""
    const opsi = s?.opsi as Record<string, unknown> | undefined
    if (!pertanyaan || !opsi || typeof opsi !== "object") continue
    const options: Record<string, string> = {}
    for (const l of LETTERS) {
      const v = opsi[l]
      if (typeof v === "string" && v.trim()) options[l] = v.trim()
    }
    if (Object.keys(options).length !== LETTERS.length) continue
    if (new Set(Object.values(options).map((v) => v.toLowerCase())).size !== LETTERS.length) continue
    const kunci = Array.isArray(s?.kunci) ? (s.kunci as unknown[]).filter((k): k is string => typeof k === "string") : []
    const keys = [...new Set(kunci)].filter((k) => LETTERS.includes(k)).sort()
    if (keys.length !== (tipe === "multi" ? 2 : 1)) continue
    const skenario = typeof s?.skenario === "string" ? s.skenario.trim() : undefined
    if (tipe === "cerita" && !skenario) continue
    out.push({ pertanyaan, opsi: options, kunci: keys, ...(skenario ? { skenario } : {}) })
  }
  return out
}

/**
 * Options that refer to each other by position ("A dan B benar", "semua
 * jawaban di atas") stop making sense once reordered.
 */
function positional(options: Record<string, string>): boolean {
  return Object.values(options).some((v) =>
    /\b(semua|kedua(nya)?|jawaban)\b.*\b(benar|salah|di atas)\b|\b[A-D]\s+dan\s+[A-D]\b|\bsemua (jawaban|pilihan)\b/i.test(v),
  )
}

/**
 * Reorder the options and move the key with them.
 *
 * The adapter favours one position for the correct answer; a student who
 * notices can score without reading. `rng` is injected so tests are exact.
 */
export function shuffleOptions<T extends AdapterSoal>(soal: T, rng: () => number = Math.random): T {
  if (positional(soal.opsi)) return soal
  const order = [...LETTERS]
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  const opsi: Record<string, string> = {}
  const moved: Record<string, string> = {}
  LETTERS.forEach((to, i) => {
    opsi[to] = soal.opsi[order[i]]
    moved[order[i]] = to
  })
  return { ...soal, opsi, kunci: soal.kunci.map((k) => moved[k]).sort() }
}

/**
 * Remove retrieval framing from a question or story. A student sees only the
 * question, so "Menurut bacaan di atas, ..." points at something that is not on
 * screen. Plain string operations on a fixed phrase list, longest first, ported
 * from the mockup (src/lib/soal.ts): measured on 758 training questions it
 * handled 93% of the framed ones and changed none of the 577 clean ones.
 *
 * "sumber" and "teks" are deliberately absent: "berdasarkan sumber bunyi" is a
 * legitimate phrase in music questions.
 */
const SOURCES = ["kutipan di atas", "bacaan di atas", "teks di atas", "materi di atas", "kutipan", "bacaan"]
const LEADS = ["menurut", "berdasarkan", "sesuai dengan", "sesuai", "mengacu pada"]
const FRAMING: string[] = [
  ...LEADS.flatMap((l) => SOURCES.map((s) => `${l} ${s}`)),
  ...SOURCES.flatMap((s) => [
    `yang ada pada ${s}`, `yang ada di ${s}`, `yang disebutkan dalam ${s}`, `yang disebutkan pada ${s}`,
    `yang tertulis pada ${s}`, `pada ${s}`, `dalam ${s}`, `di ${s}`,
  ]),
].sort((a, b) => b.length - a.length)

// " ." is tidied separately below: the mockup's plain " ." -> "." rule also ate
// the space before a fill-in blank ("adalah ...." -> "adalah....").
const TIDY: Array<[string, string]> = [
  ["  ", " "], [" ,", ","], [",,", ","], [" ?", "?"], [" !", "!"], [", ,", ","], ["( ", "("], [" )", ")"],
]

export function cleanQuestion(text: string): string {
  let s = text.trim()
  for (let round = 0; round < 4; round++) {
    const low = s.toLowerCase()
    let pos = -1
    let hit = ""
    for (const f of FRAMING) {
      const i = low.indexOf(f)
      if (i >= 0 && (pos < 0 || i < pos)) {
        pos = i
        hit = f
      }
    }
    if (pos < 0) break
    s = s.slice(0, pos) + s.slice(pos + hit.length)
    for (const [a, b] of TIDY) while (s.includes(a)) s = s.split(a).join(b)
    s = s.replace(/ \.(?!\.)/g, ".").trim()
    while (s.startsWith(",")) s = s.slice(1).trim()
    if (s) s = s[0].toUpperCase() + s.slice(1)
    // Capitalise the first letter of every following sentence.
    let out = ""
    for (let i = 0; i < s.length; i++) {
      out += s[i]
      if ((s[i] === "." || s[i] === "?" || s[i] === "!") && i + 2 < s.length && s[i + 1] === " ") {
        out += " " + s[i + 2].toUpperCase()
        i += 2
      }
    }
    s = out
  }
  return s.trim()
}

export function toPracticeQuestion(
  soal: AdapterSoal,
  index: number,
  multi: boolean,
  extra: { materi: string; pembahasan: string; topic?: string },
): PracticeQuestion {
  return {
    question_id: `q${index + 1}`,
    type: multi ? "mcq_multi" : "mcq_single",
    materi: extra.materi,
    question: soal.pertanyaan,
    ...(soal.skenario ? { scenario: soal.skenario } : {}),
    options: soal.opsi,
    answer_key: multi ? soal.kunci : soal.kunci[0],
    pembahasan: extra.pembahasan,
    ...(extra.topic ? { topic: extra.topic } : {}),
  }
}
