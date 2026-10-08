/**
 * The contract the fine-tuned practice adapter was trained on, and its mapping
 * to the product's practice-set shape.
 *
 * The adapter emits `{ soal: [{ pertanyaan, level, opsi, kunci, tipe, skenario? }] }`
 * and was trained on three request phrasings. The schema below is sent as
 * `response_format: json_schema`, which the serving stack enforces (the older
 * `guided_json` is silently ignored). Array lengths are pinned with
 * minItems = maxItems because a merely bounded array was measured to overflow
 * to its maximum.
 */
import type { PracticeQuestion, PracticeType } from "./types"

export type AdapterTipe = "tunggal" | "cerita" | "multi"

export const TIPE_FOR: Record<PracticeType, AdapterTipe> = {
  mcq_normal: "tunggal",
  mcq_multiple_correct: "multi",
  mcq_story: "cerita",
}

/** The exact phrases in the adapter's training data. */
const LABEL: Record<AdapterTipe, string> = {
  tunggal: "pilihan ganda",
  cerita: "cerita pilihan ganda",
  multi: "pilihan ganda dengan dua jawaban benar",
}

export function adapterUserMessage(tipe: AdapterTipe, jumlah: number, topic: string): string {
  return `Buatkan ${jumlah} soal ${LABEL[tipe]} tentang ${topic}`
}

export function adapterSchema(tipe: AdapterTipe, jumlah: number) {
  const props: Record<string, unknown> = {
    pertanyaan: { type: "string" },
    level: { type: "string", enum: ["ingatan", "aplikasi"] },
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
    tipe: { type: "string", enum: [tipe] },
  }
  const required = ["pertanyaan", "level", "opsi", "kunci", "tipe"]
  if (tipe === "cerita") {
    props.skenario = { type: "string" }
    required.push("skenario")
  }
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
 * Parse and check the adapter's reply. Returns null for anything that is not a
 * usable set — the caller retries rather than passing a half-formed question to
 * a student. A schema-enforcing server makes most of these impossible, but the
 * same code must survive a server that does not enforce it.
 */
export function parseAdapterReply(raw: string, tipe: AdapterTipe, jumlah: number): AdapterSoal[] | null {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  const soal = (data as { soal?: unknown })?.soal
  if (!Array.isArray(soal) || soal.length < jumlah) return null
  const out: AdapterSoal[] = []
  const seen = new Set<string>()
  for (const s of soal.slice(0, jumlah) as Array<Record<string, unknown>>) {
    const pertanyaan = typeof s?.pertanyaan === "string" ? s.pertanyaan.trim() : ""
    const opsi = s?.opsi as Record<string, unknown> | undefined
    const kunci = Array.isArray(s?.kunci) ? (s.kunci as unknown[]).filter((k): k is string => typeof k === "string") : []
    if (!pertanyaan || !opsi) return null
    const options: Record<string, string> = {}
    for (const l of LETTERS) {
      const v = opsi[l]
      if (typeof v !== "string" || !v.trim()) return null
      options[l] = v.trim()
    }
    // Two options with the same text make the key ambiguous.
    if (new Set(Object.values(options).map((v) => v.toLowerCase())).size !== LETTERS.length) return null
    const keys = [...new Set(kunci)].filter((k) => LETTERS.includes(k)).sort()
    if (keys.length !== (tipe === "multi" ? 2 : 1)) return null
    // The same question twice is a token loop, not a practice set.
    const fingerprint = pertanyaan.toLowerCase()
    if (seen.has(fingerprint)) return null
    seen.add(fingerprint)
    const skenario = typeof s?.skenario === "string" ? s.skenario.trim() : undefined
    if (tipe === "cerita" && !skenario) return null
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
    /\b(semua|kedua(nya)?|jawaban)\b.*\b(benar|salah|di atas)\b|\b[A-D]\s+dan\s+[A-D]\b/i.test(v),
  )
}

/**
 * Reorder the options and move the key with them.
 *
 * The adapter favours one position for the correct answer; a student who
 * notices can score without reading. `rng` is injected so tests are exact.
 */
export function shuffleOptions(soal: AdapterSoal, rng: () => number = Math.random): AdapterSoal {
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
 * Remove retrieval framing from a question. A student sees only the question,
 * so "Menurut bacaan di atas, ..." points at something that is not on screen.
 * Plain string operations on a fixed phrase list, longest first.
 */
const SOURCES = ["kutipan di atas", "bacaan di atas", "teks di atas", "materi di atas", "kutipan", "bacaan"]
const LEADS = ["menurut", "berdasarkan", "sesuai dengan", "mengacu pada"]
const FRAMING = LEADS.flatMap((l) => SOURCES.map((s) => `${l} ${s}`)).sort((a, b) => b.length - a.length)

export function cleanQuestion(text: string): string {
  let s = text.trim()
  for (let round = 0; round < 3; round++) {
    const low = s.toLowerCase()
    const hit = FRAMING.map((f) => ({ f, i: low.indexOf(f) })).filter((x) => x.i >= 0).sort((a, b) => a.i - b.i)[0]
    if (!hit) break
    s = (s.slice(0, hit.i) + s.slice(hit.i + hit.f.length)).replace(/\s+,/g, ",").replace(/\s{2,}/g, " ").trim()
    s = s.replace(/^[,\s]+/, "")
    if (s) s = s[0].toUpperCase() + s.slice(1)
  }
  return s
}

export function toPracticeQuestion(
  soal: AdapterSoal,
  index: number,
  multi: boolean,
  extra: { materi: string; pembahasan: string },
): PracticeQuestion {
  return {
    question_id: `q${index + 1}`,
    type: multi ? "mcq_multi" : "mcq_single",
    materi: extra.materi,
    question: cleanQuestion(soal.pertanyaan),
    options: soal.opsi,
    answer_key: multi ? soal.kunci : soal.kunci[0],
    pembahasan: extra.pembahasan,
  }
}
