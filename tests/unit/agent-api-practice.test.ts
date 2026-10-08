/**
 * Unit tests for practice sets on the v1 API.
 *
 * The properties that would hurt a student if they broke silently:
 *  - a wrong score (a multi-select counted right on a partial answer),
 *  - a key that no longer points at the right option after reordering,
 *  - a malformed or looping model reply passed through as a question,
 *  - an explanation that quotes something the book does not say.
 */
import { describe, it, expect } from "vitest"
import {
  adapterSchema, adapterUserMessage, parseAdapterReply, shuffleOptions, cleanQuestion, toPracticeQuestion,
  type AdapterSoal,
} from "@/features/agent-api/practice/generate-contract"
import { gradePractice, weaknessLevel } from "@/features/agent-api/practice/grade"
import { explain } from "@/features/agent-api/practice/explain"
import type { PracticeSet } from "@/features/agent-api/practice/types"

const soal = (over: Partial<AdapterSoal> = {}): AdapterSoal => ({
  pertanyaan: "Enzim yang mengubah amilum menjadi maltosa adalah ....",
  opsi: { A: "amilase", B: "pepsin", C: "lipase", D: "tripsin" },
  kunci: ["A"],
  ...over,
})
const reply = (items: unknown[]) => JSON.stringify({ soal: items })
const raw = (over: Record<string, unknown> = {}) => ({
  pertanyaan: "Enzim di mulut adalah ....", level: "ingatan",
  opsi: { A: "amilase", B: "pepsin", C: "lipase", D: "tripsin" }, kunci: ["A"], tipe: "tunggal", ...over,
})

describe("adapter contract", () => {
  it("uses the three phrasings the adapter was trained on", () => {
    expect(adapterUserMessage("tunggal", 5, "fotosintesis")).toBe("Buatkan 5 soal pilihan ganda tentang fotosintesis")
    expect(adapterUserMessage("cerita", 5, "fotosintesis")).toBe("Buatkan 5 soal cerita pilihan ganda tentang fotosintesis")
    expect(adapterUserMessage("multi", 5, "fotosintesis")).toBe("Buatkan 5 soal pilihan ganda dengan dua jawaban benar tentang fotosintesis")
  })

  it("pins the number of questions and of keys in the schema", () => {
    const one = adapterSchema("tunggal", 5).properties.soal as { minItems: number; maxItems: number; items: { properties: Record<string, { minItems?: number; maxItems?: number }>; required: string[] } }
    expect([one.minItems, one.maxItems]).toEqual([5, 5])
    expect([one.items.properties.kunci.minItems, one.items.properties.kunci.maxItems]).toEqual([1, 1])
    const multi = adapterSchema("multi", 3).properties.soal as typeof one
    expect([multi.items.properties.kunci.minItems, multi.items.properties.kunci.maxItems]).toEqual([2, 2])
    expect(one.items.required).not.toContain("skenario")
    expect((adapterSchema("cerita", 1).properties.soal as typeof one).items.required).toContain("skenario")
  })
})

describe("parseAdapterReply", () => {
  it("accepts a well-formed set", () => {
    const out = parseAdapterReply(reply([raw(), raw({ pertanyaan: "Lain ...." })]), "tunggal", 2)
    expect(out).toHaveLength(2)
    expect(out![0]).toEqual({ pertanyaan: "Enzim di mulut adalah ....", opsi: { A: "amilase", B: "pepsin", C: "lipase", D: "tripsin" }, kunci: ["A"] })
  })

  it("rejects anything that is not JSON or has too few questions", () => {
    expect(parseAdapterReply("Berikut soalnya: 1. ...", "tunggal", 1)).toBeNull()
    expect(parseAdapterReply('{"soal": [', "tunggal", 1)).toBeNull()
    expect(parseAdapterReply(reply([raw()]), "tunggal", 2)).toBeNull()
  })

  it("trims a reply that ran past the requested count", () => {
    const many = Array.from({ length: 10 }, (_, i) => raw({ pertanyaan: `Soal ${i}` }))
    expect(parseAdapterReply(reply(many), "tunggal", 5)).toHaveLength(5)
  })

  it("rejects a repeated question — a token loop is not a practice set", () => {
    expect(parseAdapterReply(reply([raw(), raw()]), "tunggal", 2)).toBeNull()
  })

  it("rejects a missing, empty or duplicated option", () => {
    expect(parseAdapterReply(reply([raw({ opsi: { A: "a", B: "b", C: "c" } })]), "tunggal", 1)).toBeNull()
    expect(parseAdapterReply(reply([raw({ opsi: { A: "a", B: "b", C: "c", D: " " } })]), "tunggal", 1)).toBeNull()
    expect(parseAdapterReply(reply([raw({ opsi: { A: "sama", B: "Sama", C: "c", D: "d" } })]), "tunggal", 1)).toBeNull()
  })

  it("requires exactly one key for single-answer and exactly two for multi", () => {
    expect(parseAdapterReply(reply([raw({ kunci: ["A", "B"] })]), "tunggal", 1)).toBeNull()
    expect(parseAdapterReply(reply([raw({ kunci: [] })]), "tunggal", 1)).toBeNull()
    expect(parseAdapterReply(reply([raw({ kunci: ["A"] })]), "multi", 1)).toBeNull()
    expect(parseAdapterReply(reply([raw({ kunci: ["A", "A"] })]), "multi", 1)).toBeNull()
    expect(parseAdapterReply(reply([raw({ kunci: ["C", "A"] })]), "multi", 1)![0].kunci).toEqual(["A", "C"])
    expect(parseAdapterReply(reply([raw({ kunci: ["E"] })]), "tunggal", 1)).toBeNull()
  })

  it("requires a scenario for story questions", () => {
    expect(parseAdapterReply(reply([raw()]), "cerita", 1)).toBeNull()
    expect(parseAdapterReply(reply([raw({ skenario: "Budi makan nasi." })]), "cerita", 1)![0].skenario).toBe("Budi makan nasi.")
  })
})

describe("shuffleOptions", () => {
  it("moves the key with its option", () => {
    // rng = 0 at every step: a fixed, known permutation.
    const out = shuffleOptions(soal(), () => 0)
    expect(Object.values(out.opsi).sort()).toEqual(["amilase", "lipase", "pepsin", "tripsin"])
    expect(out.opsi[out.kunci[0]]).toBe("amilase")
    expect(out.opsi).not.toEqual(soal().opsi)
  })

  it("keeps both keys correct for a multi-select, across many orders", () => {
    let seed = 7
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < 50; i++) {
      const out = shuffleOptions(soal({ kunci: ["A", "C"] }), rng)
      expect(out.kunci.map((k) => out.opsi[k]).sort()).toEqual(["amilase", "lipase"])
      expect(out.kunci).toEqual([...out.kunci].sort())
    }
  })

  it("leaves options alone when they refer to each other by position", () => {
    const pos = soal({ opsi: { A: "amilase", B: "pepsin", C: "A dan B benar", D: "semua jawaban di atas benar" }, kunci: ["C"] })
    expect(shuffleOptions(pos, () => 0)).toEqual(pos)
  })
})

describe("cleanQuestion", () => {
  it("removes retrieval framing the student cannot see", () => {
    expect(cleanQuestion("Menurut bacaan di atas, enzim di mulut adalah ....")).toBe("Enzim di mulut adalah ....")
    expect(cleanQuestion("Berdasarkan kutipan, apa fungsi lambung?")).toBe("Apa fungsi lambung?")
  })

  it("does not touch a question that has none", () => {
    const q = "Diimitasi berdasarkan sumber bunyi, alat musik ini termasuk ...."
    expect(cleanQuestion(q)).toBe(q)
  })
})

describe("toPracticeQuestion", () => {
  it("emits a single letter for single-answer and a list for multi", () => {
    const extra = { materi: "Enzim", pembahasan: "p" }
    expect(toPracticeQuestion(soal(), 0, false, extra)).toMatchObject({ question_id: "q1", type: "mcq_single", answer_key: "A", materi: "Enzim" })
    expect(toPracticeQuestion(soal({ kunci: ["A", "C"] }), 2, true, extra)).toMatchObject({ question_id: "q3", type: "mcq_multi", answer_key: ["A", "C"] })
  })
})

const SET: PracticeSet = {
  practice_type: "mcq_multiple_correct", topic: "Pencernaan", total_questions: 4, materi_titles: ["Enzim", "Lambung"],
  questions: [
    { question_id: "q1", type: "mcq_single", materi: "Enzim", question: "?", options: { A: "a", B: "b", C: "c", D: "d" }, answer_key: "A", pembahasan: "p1" },
    { question_id: "q2", type: "mcq_single", materi: "Enzim", question: "?", options: { A: "a", B: "b", C: "c", D: "d" }, answer_key: "B", pembahasan: "p2" },
    { question_id: "q3", type: "mcq_multi", materi: "Lambung", question: "?", options: { A: "a", B: "b", C: "c", D: "d" }, answer_key: ["A", "C"], pembahasan: "p3" },
    { question_id: "q4", type: "mcq_multi", materi: "Lambung", question: "?", options: { A: "a", B: "b", C: "c", D: "d" }, answer_key: ["B", "D"], pembahasan: "p4" },
  ],
}

describe("gradePractice", () => {
  it("scores one point per exactly correct answer", () => {
    const r = gradePractice(SET, { q1: "A", q2: "B", q3: ["A", "C"], q4: ["B", "D"] })
    expect(r.score).toEqual({ correct: 4, total: 4, percentage: 100 })
  })

  it("gives a multi-select nothing for a subset or a superset of the key", () => {
    const r = gradePractice(SET, { q3: ["A"], q4: ["B", "D", "A"] })
    expect(r.questions.find((q) => q.question_id === "q3")!.correct).toBe(false)
    expect(r.questions.find((q) => q.question_id === "q4")!.correct).toBe(false)
  })

  it("ignores order, case and repeats in what the student sent", () => {
    const r = gradePractice(SET, { q1: " a ", q3: ["c", "A", "a"] })
    expect(r.questions.find((q) => q.question_id === "q1")!.correct).toBe(true)
    expect(r.questions.find((q) => q.question_id === "q3")!.correct).toBe(true)
  })

  it("counts an unanswered question as wrong and says it was unanswered", () => {
    const r = gradePractice(SET, { q1: "A" })
    expect(r.score).toEqual({ correct: 1, total: 4, percentage: 25 })
    expect(r.questions.find((q) => q.question_id === "q2")).toMatchObject({ correct: false, answered: false, your_answer: [] })
  })

  it("returns the key and explanation for every question", () => {
    const r = gradePractice(SET, {})
    expect(r.questions.map((q) => [q.answer_key, q.pembahasan])).toEqual([[["A"], "p1"], [["B"], "p2"], [["A", "C"], "p3"], [["B", "D"], "p4"]])
  })

  it("reports mastery and weakness per materi title", () => {
    const r = gradePractice(SET, { q1: "A", q2: "B", q3: ["A", "C"], q4: ["A"] })
    expect(r.materi).toEqual([
      { materi: "Enzim", total_questions: 2, correct_answers: 2, mastery_percentage: 100, weakness_level: "low" },
      { materi: "Lambung", total_questions: 2, correct_answers: 1, mastery_percentage: 50, weakness_level: "medium" },
    ])
  })

  it("ignores answers for questions that are not in the set", () => {
    expect(gradePractice(SET, { q99: "A" }).score.correct).toBe(0)
  })
})

describe("weaknessLevel", () => {
  it("draws the lines at 80 and 50", () => {
    expect([100, 80].map(weaknessLevel)).toEqual(["low", "low"])
    expect([79, 50].map(weaknessLevel)).toEqual(["medium", "medium"])
    expect([49, 0].map(weaknessLevel)).toEqual(["high", "high"])
  })
})

describe("explain", () => {
  const excerpts = [
    { title: "IPA Kelas VIII", section: "Sistem Pencernaan Manusia", text: "Di mulut, makanan dicerna secara kimiawi oleh enzim amilase yang mengubah amilum menjadi maltosa. Lambung menghasilkan asam klorida." },
    { title: "IPA Kelas VIII", section: "Sistem Peredaran Darah", text: "Jantung memompa darah ke seluruh tubuh melalui pembuluh arteri dan kembali melalui vena." },
  ]

  it("names the correct option and quotes a sentence that is in the book", () => {
    const r = explain(soal(), excerpts, "pencernaan")
    expect(r.pembahasan).toContain("A. amilase")
    const quoted = r.pembahasan.match(/"(.+)"/)![1]
    expect(excerpts.some((e) => e.text.includes(quoted))).toBe(true)
  })

  it("takes the materi title from the excerpt the question draws on", () => {
    expect(explain(soal(), excerpts, "pencernaan").materi).toBe("Sistem Pencernaan Manusia")
    const blood = soal({ pertanyaan: "Pembuluh yang membawa darah kembali ke jantung adalah ....", opsi: { A: "vena", B: "arteri", C: "kapiler", D: "aorta" } })
    expect(explain(blood, excerpts, "peredaran darah").materi).toBe("Sistem Peredaran Darah")
  })

  it("falls back to the topic when the excerpt has no usable heading", () => {
    for (const section of [null, "None", "Gambar 1.5 Proses Fotosintesis", "12"]) {
      expect(explain(soal(), [{ ...excerpts[0], section }], "Sistem Pencernaan").materi).toBe("Sistem Pencernaan")
    }
  })

  it("does not quote the book when nothing in it supports the answer", () => {
    const off = soal({ pertanyaan: "Planet terbesar adalah ....", opsi: { A: "Jupiter", B: "Mars", C: "Venus", D: "Bumi" } })
    const r = explain(off, excerpts, "tata surya")
    expect(r.pembahasan).toBe("Jawaban yang benar adalah A. Jupiter.")
  })

  it("names both options for a multi-select", () => {
    const r = explain(soal({ kunci: ["A", "C"] }), [], "enzim")
    expect(r.pembahasan).toContain("A. amilase dan C. lipase")
  })
})
