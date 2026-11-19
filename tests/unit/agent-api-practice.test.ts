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
  adapterMaxTokens, adapterSchema, adapterSystem, adapterUserMessage, parseAdapterReply, shuffleOptions, cleanQuestion, toPracticeQuestion,
  type AdapterSoal,
} from "@/features/agent-api/practice/generate-contract"
import { gradePractice, weaknessLevel } from "@/features/agent-api/practice/grade"
import { explain } from "@/features/agent-api/practice/explain"
import type { PracticeSet } from "@/features/agent-api/practice/types"
import { labelPrompt, parseMateriLabels } from "@/features/agent-api/practice/materi-labels"

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

describe("adapter contract (practice v10, prompt v2)", () => {
  it("sends one passage and the v2 request + rules, verbatim", () => {
    const msg = adapterUserMessage("multi", 2, "Enzim amilase memecah amilum.")
    expect(msg.startsWith("Bacaan:\n[1] Enzim amilase memecah amilum.\n\nBuat 2 soal pilihan ganda dengan tepat DUA jawaban benar.")).toBe(true)
    expect(msg).toContain("Setiap pertanyaan diakhiri '(pilih dua)'.")
    expect(msg.endsWith("- 'kunci' diisi huruf pilihan yang benar.")).toBe(true)
  })

  it("puts the grade number into the teacher system prompt, default 8", () => {
    expect(adapterSystem("Kelas 9")).toContain("siswa SMP kelas 9 di Indonesia")
    expect(adapterSystem(7)).toContain("kelas 7 ")
    expect(adapterSystem(null)).toContain("kelas 8 ")
  })

  it("pins the number of questions and of keys in the schema", () => {
    const one = adapterSchema("tunggal", 3).properties.soal as { minItems: number; maxItems: number; items: { properties: Record<string, { minItems?: number; maxItems?: number }>; required: string[] } }
    expect([one.minItems, one.maxItems]).toEqual([3, 3])
    expect([one.items.properties.kunci.minItems, one.items.properties.kunci.maxItems]).toEqual([1, 1])
    const multi = adapterSchema("multi", 2).properties.soal as typeof one
    expect([multi.items.properties.kunci.minItems, multi.items.properties.kunci.maxItems]).toEqual([2, 2])
    expect(one.items.required).not.toContain("skenario")
  })

  it("puts skenario FIRST for story questions — guided decoding follows property order", () => {
    const story = adapterSchema("cerita", 1).properties.soal as { items: { properties: Record<string, unknown>; required: string[] } }
    expect(Object.keys(story.items.properties)[0]).toBe("skenario")
    expect(story.items.required[0]).toBe("skenario")
  })

  it("drops level and tipe — the v10 adapter was trained without them", () => {
    const props = (adapterSchema("tunggal", 1).properties.soal as { items: { properties: Record<string, unknown> } }).items.properties
    expect(Object.keys(props)).toEqual(["pertanyaan", "opsi", "kunci"])
  })

  it("scales the token budget to the questions in the call", () => {
    expect(adapterMaxTokens(1)).toBe(740)
    expect(adapterMaxTokens(3)).toBe(1420)
  })
})

describe("parseAdapterReply", () => {
  it("accepts a well-formed set", () => {
    const out = parseAdapterReply(reply([raw(), raw({ pertanyaan: "Lain ...." })]), "tunggal")
    expect(out).toHaveLength(2)
    expect(out![0]).toEqual({ pertanyaan: "Enzim di mulut adalah ....", opsi: { A: "amilase", B: "pepsin", C: "lipase", D: "tripsin" }, kunci: ["A"] })
  })

  it("returns null for anything that is not JSON or holds no question", () => {
    expect(parseAdapterReply("Berikut soalnya: 1. ...", "tunggal")).toBeNull()
    expect(parseAdapterReply('{"soal": [', "tunggal")).toBeNull()
    expect(parseAdapterReply(reply([]), "tunggal")).toBeNull()
  })

  it("keeps the good questions and drops only the malformed ones", () => {
    const out = parseAdapterReply(reply([raw({ opsi: { A: "a", B: "b", C: "c" } }), raw({ pertanyaan: "Baik ...." })]), "tunggal")
    expect(out!.map((s) => s.pertanyaan)).toEqual(["Baik ...."])
  })

  it("drops a missing, empty or duplicated option", () => {
    expect(parseAdapterReply(reply([raw({ opsi: { A: "a", B: "b", C: "c" } })]), "tunggal")).toEqual([])
    expect(parseAdapterReply(reply([raw({ opsi: { A: "a", B: "b", C: "c", D: " " } })]), "tunggal")).toEqual([])
    expect(parseAdapterReply(reply([raw({ opsi: { A: "sama", B: "Sama", C: "c", D: "d" } })]), "tunggal")).toEqual([])
  })

  it("requires exactly one key for single-answer and exactly two for multi", () => {
    expect(parseAdapterReply(reply([raw({ kunci: ["A", "B"] })]), "tunggal")).toEqual([])
    expect(parseAdapterReply(reply([raw({ kunci: [] })]), "tunggal")).toEqual([])
    expect(parseAdapterReply(reply([raw({ kunci: ["A"] })]), "multi")).toEqual([])
    expect(parseAdapterReply(reply([raw({ kunci: ["A", "A"] })]), "multi")).toEqual([])
    expect(parseAdapterReply(reply([raw({ kunci: ["C", "A"] })]), "multi")![0].kunci).toEqual(["A", "C"])
    expect(parseAdapterReply(reply([raw({ kunci: ["E"] })]), "tunggal")).toEqual([])
  })

  it("requires a scenario for story questions", () => {
    expect(parseAdapterReply(reply([raw()]), "cerita")).toEqual([])
    expect(parseAdapterReply(reply([raw({ skenario: "Budi makan nasi." })]), "cerita")![0].skenario).toBe("Budi makan nasi.")
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

  it("removes the longer framings too, and recapitalises", () => {
    expect(cleanQuestion("Apa fungsi enzim yang disebutkan dalam bacaan? jawab singkat.")).toBe("Apa fungsi enzim? Jawab singkat.")
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

  it("carries a story question's own scenario and its topic", () => {
    const q = toPracticeQuestion(soal({ skenario: "Rina makan nasi." }), 0, false, { materi: "Enzim", pembahasan: "p", topic: "Pencernaan" })
    expect(q).toMatchObject({ type: "mcq_single", scenario: "Rina makan nasi.", topic: "Pencernaan" })
    expect(toPracticeQuestion(soal(), 0, false, { materi: "m", pembahasan: "p" })).not.toHaveProperty("scenario")
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

  it("recommends the weakest materi first, and only the weak ones", () => {
    const set: PracticeSet = {
      practice_type: "mcq_normal", topic: "Pencernaan", total_questions: 6, materi_titles: ["Enzim", "Lambung", "Usus"],
      questions: [
        { question_id: "a1", type: "mcq_single", materi: "Enzim", question: "?", options: { A: "a" }, answer_key: "A", pembahasan: "p" },
        { question_id: "a2", type: "mcq_single", materi: "Enzim", question: "?", options: { A: "a" }, answer_key: "A", pembahasan: "p" },
        { question_id: "b1", type: "mcq_single", materi: "Lambung", question: "?", options: { A: "a" }, answer_key: "A", pembahasan: "p" },
        { question_id: "b2", type: "mcq_single", materi: "Lambung", question: "?", options: { A: "a" }, answer_key: "A", pembahasan: "p" },
        { question_id: "c1", type: "mcq_single", materi: "Usus", question: "?", options: { A: "a" }, answer_key: "A", pembahasan: "p" },
        { question_id: "c2", type: "mcq_single", materi: "Usus", question: "?", options: { A: "a" }, answer_key: "A", pembahasan: "p" },
      ],
    }
    const r = gradePractice(set, { b1: "A", c1: "A", c2: "A" })
    expect(r.recommendations).toEqual([
      { materi: "Enzim", weakness_level: "high", mastery_percentage: 0, message: 'Pelajari lagi materi "Enzim": benar 0 dari 2 soal.' },
      { materi: "Lambung", weakness_level: "medium", mastery_percentage: 50, message: 'Ulangi sebagian materi "Lambung": benar 1 dari 2 soal.' },
    ])
  })

  it("has nothing to recommend when every materi is mastered", () => {
    expect(gradePractice(SET, { q1: "A", q2: "B", q3: ["A", "C"], q4: ["B", "D"] }).recommendations).toEqual([])
  })

  it("orders equal weakness by mastery, then by name", () => {
    const q = (id: string, materi: string) => ({
      question_id: id, type: "mcq_single" as const, materi, question: "?",
      options: { A: "a" }, answer_key: "A", pembahasan: "p",
    })
    const set: PracticeSet = {
      practice_type: "mcq_normal", topic: "Pencernaan", total_questions: 8, materi_titles: [],
      questions: [
        // Zeta and Alfa both 0/2 (high, 0%) — the tie the name decides.
        q("z1", "Zeta"), q("z2", "Zeta"), q("f1", "Alfa"), q("f2", "Alfa"),
        // Beta 1/4 (high, 25%) sits between Alfa and the medium.
        q("b1", "Beta"), q("b2", "Beta"), q("b3", "Beta"), q("b4", "Beta"),
        q("g1", "Gamma"), q("g2", "Gamma"),
      ],
    }
    const r = gradePractice(set, { b1: "A", g1: "A" })
    expect(r.recommendations.map((x) => [x.materi, x.weakness_level, x.mastery_percentage])).toEqual([
      ["Alfa", "high", 0],
      ["Zeta", "high", 0],
      ["Beta", "high", 25],
      ["Gamma", "medium", 50],
    ])
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


describe("parseMateriLabels", () => {
  it("reads one title per question", () => {
    expect(parseMateriLabels('{"materi": ["Enzim Pencernaan", "Organ Pencernaan"]}', 2)).toEqual(["Enzim Pencernaan", "Organ Pencernaan"])
  })

  it("ignores thinking and prose around the JSON", () => {
    const raw = '<think>two topics here</think>\nBerikut hasilnya:\n```json\n{"materi": ["Enzim", "Lambung"]}\n```'
    expect(parseMateriLabels(raw, 2)).toEqual(["Enzim", "Lambung"])
  })

  it("rejects a list of the wrong length rather than mislabelling the rest", () => {
    expect(parseMateriLabels('{"materi": ["Enzim"]}', 2)).toBeNull()
    expect(parseMateriLabels('{"materi": ["Enzim", "Lambung", "Usus"]}', 2)).toBeNull()
  })

  it("rejects non-strings, empty and overlong titles, and non-JSON", () => {
    expect(parseMateriLabels('{"materi": ["Enzim", 2]}', 2)).toBeNull()
    expect(parseMateriLabels('{"materi": ["Enzim", " "]}', 2)).toBeNull()
    expect(parseMateriLabels(`{"materi": ["Enzim", "${"x".repeat(61)}"]}`, 2)).toBeNull()
    expect(parseMateriLabels("Enzim, Lambung", 2)).toBeNull()
    expect(parseMateriLabels("<think>never finished", 2)).toBeNull()
  })

  it("treats titles that differ only in case or trailing punctuation as one materi", () => {
    expect(parseMateriLabels('{"materi": ["Enzim Pencernaan.", "enzim pencernaan", "Lambung"]}', 3)).toEqual(["Enzim Pencernaan", "Enzim Pencernaan", "Lambung"])
  })
})

describe("labelPrompt", () => {
  it("numbers the questions and states the exact count expected back", () => {
    const p = labelPrompt(["Apa itu enzim?", "Apa fungsi lambung?"], "pencernaan")
    expect(p).toContain("1. Apa itu enzim?")
    expect(p).toContain("2. Apa fungsi lambung?")
    expect(p).toContain("tepat 2 judul")
  })
})
