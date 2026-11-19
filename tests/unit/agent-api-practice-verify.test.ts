/**
 * Unit tests for practice generation v2: verification checks, set planning,
 * passage cleaning and the generate → verify → refill engine.
 *
 * Every rejection test is paired with a question that must pass, so a check
 * that rejects everything cannot go green.
 */
import { describe, it, expect } from "vitest"
import {
  checkAmbiguous, checkFormat, checkKeySupported, checkTwinKeys, ensurePickTwo, isDuplicate, varyNames,
} from "@/features/agent-api/practice/checks"
import { judgeChecker, checkerUserMessage } from "@/features/agent-api/practice/checker"
import { buildPracticeSet, type TopicMaterial } from "@/features/agent-api/practice/engine"
import type { AdapterSoal, AdapterTipe } from "@/features/agent-api/practice/generate-contract"
import { passagesForPractice, splitSentences, stripExercises, stripFigureCaption } from "@/features/agent-api/practice/passages"
import { planSlots, splitByWeight, splitCalls } from "@/features/agent-api/practice/plan"
import { checkerModel, gradeFromGroupNames, practiceModel } from "@/features/agent-api/practice/service"
import { PracticeGenerateSchema, requestedTopics } from "@/features/agent-api/practice/types"

const PASSAGE =
  "Fotosintesis adalah proses tumbuhan membuat makanan sendiri. Proses ini memerlukan cahaya matahari, " +
  "air, dan karbon dioksida. Hasil fotosintesis berupa glukosa dan oksigen. Klorofil menyerap cahaya matahari " +
  "di dalam kloroplas."

const q = (over: Partial<AdapterSoal> = {}): AdapterSoal => ({
  pertanyaan: "Zat hijau daun yang menyerap cahaya matahari adalah ....",
  opsi: { A: "klorofil", B: "stomata", C: "xilem", D: "floem" },
  kunci: ["A"],
  ...over,
})

/** Deterministic rng for exact tests. */
function seeded(seed = 7) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
}

describe("checkFormat", () => {
  it("rejects JSON fragments written into a field", () => {
    expect(checkFormat(q({ pertanyaan: "Apa itu klorofil? 'opsi': {" }))).toBe(false)
    expect(checkFormat(q({ opsi: { A: "klorofil ]}", B: "b", C: "c", D: "d" } }))).toBe(false)
  })
  it("passes ordinary text", () => {
    expect(checkFormat(q())).toBe(true)
  })
})

describe("checkKeySupported", () => {
  it("rejects a key whose words are not in the passage", () => {
    const r = checkKeySupported(q({ opsi: { A: "mitokondria sel hewan", B: "b", C: "c", D: "d" } }), PASSAGE)
    expect(r.ok).toBe(false)
    expect(r.lowest).toBeLessThan(0.5)
  })
  it("passes a key the passage states", () => {
    expect(checkKeySupported(q(), PASSAGE).ok).toBe(true)
  })
  it("tolerates affixes through a 5-letter prefix", () => {
    expect(checkKeySupported(q({ opsi: { A: "menyerapkan cahaya", B: "b", C: "c", D: "d" } }), PASSAGE).ok).toBe(true)
  })
  it("exempts number-only keys (a computed answer)", () => {
    expect(checkKeySupported(q({ opsi: { A: "11", B: "12", C: "13", D: "14" } }), PASSAGE).ok).toBe(true)
  })
  it("counts the story as reference for story questions", () => {
    const s = q({ skenario: "Dina menanam bayam di halaman.", opsi: { A: "bayam halaman", B: "b", C: "c", D: "d" } })
    expect(checkKeySupported(s, PASSAGE).ok).toBe(true)
    expect(checkKeySupported({ ...s, skenario: undefined }, PASSAGE).ok).toBe(false)
  })
})

describe("checkTwinKeys", () => {
  it("rejects two keys that differ only by a charge sign", () => {
    expect(checkTwinKeys(q({ opsi: { A: "ion Na+", B: "ion Na-", C: "c", D: "d" }, kunci: ["A", "B"] }))).toBe(false)
  })
  it("keeps α-1,4 vs β-1,4 glikosida (both correct)", () => {
    expect(checkTwinKeys(q({ opsi: { A: "α-1,4 glikosida", B: "β-1,4 glikosida", C: "c", D: "d" }, kunci: ["A", "B"] }))).toBe(true)
  })
  it("ignores single-key questions", () => {
    expect(checkTwinKeys(q({ opsi: { A: "ion Na+", B: "ion Na-", C: "c", D: "d" } }))).toBe(true)
  })
})

describe("checkAmbiguous", () => {
  const multi = (opsi: Record<string, string>, kunci: string[]) => q({ opsi, kunci })
  it("rejects when a non-key option is also stated in the keys' sentence", () => {
    const r = checkAmbiguous(multi({ A: "cahaya matahari", B: "air", C: "karbon dioksida", D: "nitrogen" }, ["A", "B"]), PASSAGE)
    expect(r.ok).toBe(false)
    expect(r.option).toBe("C. karbon dioksida")
  })
  it("passes when the other options are false by the passage", () => {
    expect(checkAmbiguous(multi({ A: "glukosa", B: "oksigen", C: "nitrogen", D: "protein" }, ["A", "B"]), PASSAGE).ok).toBe(true)
  })
  it("is not applied to single-key questions", () => {
    expect(checkAmbiguous(multi({ A: "cahaya matahari", B: "air", C: "karbon dioksida", D: "nitrogen" }, ["A"]), PASSAGE).ok).toBe(true)
  })
})

describe("isDuplicate", () => {
  it("catches identical text and heavy overlap", () => {
    expect(isDuplicate(q(), q({ opsi: { A: "x", B: "y", C: "z", D: "w" } }))).toBe(true)
    expect(isDuplicate(q(), q({ pertanyaan: "Zat hijau daun yang menyerap cahaya matahari disebut ...." }))).toBe(true)
  })
  it("keeps genuinely different questions", () => {
    expect(isDuplicate(q(), q({ pertanyaan: "Hasil fotosintesis selain glukosa adalah ....", opsi: { A: "oksigen", B: "nitrogen", C: "air", D: "garam" } }))).toBe(false)
  })
})

describe("presentation steps", () => {
  it("appends (pilih dua) only when missing", () => {
    expect(ensurePickTwo(q({ pertanyaan: "Sebut dua hasil." })).pertanyaan).toBe("Sebut dua hasil. (pilih dua)")
    expect(ensurePickTwo(q({ pertanyaan: "Sebut dua hasil (pilih dua)" })).pertanyaan).toBe("Sebut dua hasil (pilih dua)")
  })
  it("swaps common names for unused same-gender names across a set", () => {
    const used = new Set<string>()
    const rng = seeded(3)
    const a = varyNames(q({ skenario: "Rina dan Budi menanam bayam.", pertanyaan: "Apa yang ditanam Rina?" }), used, rng)
    expect(a.skenario).not.toContain("Rina")
    expect(a.skenario).not.toContain("Budi")
    // The name in the question follows the story.
    const newFemale = [...used].find((n) => a.skenario!.startsWith(n))!
    expect(a.pertanyaan).toBe(`Apa yang ditanam ${newFemale}?`)
    const b = varyNames(q({ skenario: "Rina menyiram tanaman." }), used, rng)
    expect(b.skenario!.split(" ")[0]).not.toBe(newFemale)
  })
  it("leaves non-story questions alone", () => {
    const s = q({ pertanyaan: "Rina bertanya ...." })
    expect(varyNames(s, new Set())).toBe(s)
  })
})

describe("AI checker verdict", () => {
  it("passes only an exact match with the key", () => {
    expect(judgeChecker('{"benar":["A"]}', ["A"]).ok).toBe(true)
    expect(judgeChecker('{"benar":["C","A","A"]}', ["A", "C"]).ok).toBe(true)
    expect(judgeChecker('{"benar":["B"]}', ["A"]).ok).toBe(false)
    expect(judgeChecker('{"benar":["A","B"]}', ["A"]).ok).toBe(false)
    expect(judgeChecker('{"benar":[]}', ["A"]).ok).toBe(false)
  })
  it("keeps the question when the checker call failed — it must not stop practice", () => {
    expect(judgeChecker(null, ["A"])).toEqual({ ok: true, answer: null })
    expect(judgeChecker("not json", ["A"]).ok).toBe(true)
  })
  it("shows the checker the question without the key", () => {
    const msg = checkerUserMessage(q({ skenario: "Dina menanam." }), PASSAGE)
    expect(msg).toContain("Skenario: Dina menanam.\nPertanyaan: ")
    expect(msg).toContain("A. klorofil\nB. stomata")
    expect(msg).not.toMatch(/kunci/i)
  })
})

describe("passages", () => {
  it("cuts at an end-of-chapter exercise block", () => {
    const t = `${PASSAGE} Uji Kompetensi 1. Apa itu fotosintesis? 2. Sebutkan hasilnya.`
    expect(stripExercises(t)).not.toContain("Uji Kompetensi")
    expect(stripExercises(t)).toContain("Klorofil menyerap cahaya matahari")
  })
  it("drops exercise-like sentences but keeps prose", () => {
    const t = "Air mendidih pada suhu 100 derajat Celsius. Jelaskan proses penguapan. Apa yang terjadi pada es? Es mencair menjadi air."
    expect(stripExercises(t)).toBe("Air mendidih pada suhu 100 derajat Celsius. Es mencair menjadi air.")
  })
  it("keeps only the prose context of a figure chunk", () => {
    expect(stripFigureCaption("[Gambar] Gambar 4.27 Pengangkutan nutrisi. — Konteks: Air diangkut xilem.")).toBe("Air diangkut xilem.")
    expect(stripFigureCaption("[Gambar] Gambar 4.27 Pengangkutan nutrisi.")).toBe("")
    expect(stripFigureCaption("Air diangkut xilem. [Gambar] bukan di awal")).toBe("Air diangkut xilem. [Gambar] bukan di awal")
  })

  it("splits a numbered item off the previous sentence", () => {
    expect(splitSentences("Ini kalimat pertama. 5. Pada sebuah rapat RT, warga berdebat.")).toEqual([
      "Ini kalimat pertama.", "5. Pada sebuah rapat RT, warga berdebat.",
    ])
  })
  it("keeps passages with enough prose, and never returns nothing when there was text", () => {
    const long = { text: PASSAGE + " " + PASSAGE }
    const short = { text: "Jelaskan fotosintesis! Apa hasilnya?" }
    expect(passagesForPractice([long, short])).toHaveLength(1)
    expect(passagesForPractice([short])).toEqual([short])
  })
})

describe("planning", () => {
  it("splits by weight and keeps the total exact", () => {
    const m = splitByWeight(7, [["tunggal", 0.4], ["multi", 0.3], ["cerita", 0.3]])
    expect([...m.values()].reduce((a, b) => a + b, 0)).toBe(7)
    expect(m.get("tunggal")).toBe(3)
  })
  it("plans a 40/30/30 mixed set across topics", () => {
    const slots = planSlots(["a", "b"], 10, "mcq_mixed", seeded())
    expect(slots).toHaveLength(10)
    const count = (t: AdapterTipe) => slots.filter((s) => s.tipe === t).length
    expect([count("tunggal"), count("multi"), count("cerita")]).toEqual([4, 3, 3])
    expect(slots.filter((s) => s.topic === "a")).toHaveLength(5)
    // Each topic gets a mix, not one type.
    expect(new Set(slots.filter((s) => s.topic === "a").map((s) => s.tipe)).size).toBeGreaterThan(1)
  })
  it("picks topics at random when there are more topics than questions", () => {
    const slots = planSlots(["a", "b", "c", "d", "e"], 2, "mcq_normal", seeded())
    expect(slots).toHaveLength(2)
    expect(new Set(slots.map((s) => s.topic)).size).toBe(2)
  })
  it("spreads calls over passages, at most 3 questions and one passage per call", () => {
    expect(splitCalls(5, 5)).toEqual([0, 1, 2, 3, 4].map((p) => ({ passage: p, n: 1 })))
    expect(splitCalls(7, 1)).toEqual([{ passage: 0, n: 3 }, { passage: 0, n: 3 }, { passage: 0, n: 1 }])
    expect(splitCalls(4, 2)).toEqual([{ passage: 0, n: 2 }, { passage: 1, n: 2 }])
  })
})

describe("request schema", () => {
  it("accepts topic alone (v1 callers), topics, or both, de-duplicated", () => {
    const one = PracticeGenerateSchema.parse({ topic: "Fotosintesis", practice_type: "mcq_normal" })
    expect(requestedTopics(one)).toEqual(["Fotosintesis"])
    expect(one.verify).toBe(true)
    const both = PracticeGenerateSchema.parse({ topic: "fotosintesis", topics: ["Fotosintesis", "Magnet"], practice_type: "mcq_mixed", total_questions: 20 })
    expect(requestedTopics(both)).toEqual(["Fotosintesis", "Magnet"])
  })
  it("requires a topic and caps the set at 20", () => {
    expect(PracticeGenerateSchema.safeParse({ practice_type: "mcq_normal" }).success).toBe(false)
    expect(PracticeGenerateSchema.safeParse({ topic: "x", practice_type: "mcq_normal", total_questions: 21 }).success).toBe(false)
  })
})

describe("service settings", () => {
  it("reads the practice and checker models, checker default base, 'off' disables", () => {
    expect(practiceModel({})).toBe("practice")
    expect(checkerModel({})).toBe("base")
    expect(checkerModel({ AGENT_API_PRACTICE_CHECKER_MODEL: "off" })).toBeNull()
    expect(checkerModel({ AGENT_API_PRACTICE_CHECKER_MODEL: "base2" })).toBe("base2")
  })
  it("infers the grade only when the knowledge bases agree on one", () => {
    expect(gradeFromGroupNames(["SMP Kelas 8", "IPA — Kelas 8"])).toBe(8)
    expect(gradeFromGroupNames(["SMP Kelas 8", "SMP Kelas 9"])).toBeNull()
    expect(gradeFromGroupNames(["Arsip — Buku Guru"])).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Engine: a fake adapter whose keys are wrong on demand, a fake checker.
// ---------------------------------------------------------------------------

const TOPICS: TopicMaterial[] = [
  { topic: "Fotosintesis", passages: [1, 2, 3, 4].map((i) => ({ title: "IPA", section: `Bab ${i}`, text: `${PASSAGE} Bagian ${i}.` })) },
]

/** A fake adapter: unique questions per call; `badEvery` makes every k-th key unsupported by the passage. */
function fakeAdapter(opts: { badEvery?: number } = {}) {
  let n = 0
  const calls: Array<{ tipe: AdapterTipe; n: number }> = []
  const generate = async (tipe: AdapterTipe, count: number) => {
    calls.push({ tipe, n: count })
    return Array.from({ length: count }, () => {
      n++
      const bad = opts.badEvery ? n % opts.badEvery === 0 : false
      const words = ["klorofil", "glukosa", "oksigen", "kloroplas", "cahaya", "karbon"]
      const key = bad ? `mitokondria${n} ribosom${n}` : words[n % words.length]
      return {
        ...(tipe === "cerita" ? { skenario: `Rina mengamati daun nomor ${n}.` } : {}),
        pertanyaan: `Soal unik nomor ${n} zat${n} proses${n} bagian${n}?`,
        opsi: { A: key, B: `pengecoh${n}a`, C: `pengecoh${n}b`, D: `pengecoh${n}c` },
        kunci: tipe === "multi" ? ["A", "B"] : ["A"],
      }
    })
  }
  return { generate, calls }
}

describe("buildPracticeSet", () => {
  it("delivers exactly the requested count with no rejections on clean input", async () => {
    const a = fakeAdapter()
    const r = await buildPracticeSet({ topics: TOPICS, count: 5, type: "mcq_normal", verify: true }, { generate: a.generate, check: null, rng: seeded() })
    expect(r.questions).toHaveLength(5)
    expect(Object.values(r.rejected).every((v) => v === 0)).toBe(true)
    expect(a.calls.every((c) => c.n <= 3)).toBe(true)
  })

  it("rejects unsupported keys and refills them from other passages", async () => {
    const a = fakeAdapter({ badEvery: 3 })
    const r = await buildPracticeSet({ topics: TOPICS, count: 6, type: "mcq_normal", verify: true }, { generate: a.generate, check: null, rng: seeded() })
    expect(r.rejected.key_unsupported).toBeGreaterThan(0)
    expect(r.questions).toHaveLength(6)
    expect(r.questions.every((s) => !s.opsi[s.kunci[0]].startsWith("mitokondria"))).toBe(true)
  })

  it("positive control: with verify off the same bad keys get through", async () => {
    const a = fakeAdapter({ badEvery: 3 })
    const r = await buildPracticeSet({ topics: TOPICS, count: 6, type: "mcq_normal", verify: false }, { generate: a.generate, check: null, rng: seeded() })
    expect(r.questions.some((s) => s.opsi[s.kunci[0]].startsWith("mitokondria"))).toBe(true)
    expect(r.checksRun).toBe(0)
  })

  it("drops what the AI checker disagrees with, and keeps what it confirms", async () => {
    const a = fakeAdapter()
    let i = 0
    const check = async (s: AdapterSoal) => {
      const ok = ++i % 2 === 0
      return { ok, answer: ok ? s.kunci : ["D"] }
    }
    const r = await buildPracticeSet({ topics: TOPICS, count: 4, type: "mcq_normal", verify: true }, { generate: a.generate, check, rng: seeded() })
    expect(r.rejected.ai_checker).toBeGreaterThan(0)
    expect(r.checksRun).toBeGreaterThanOrEqual(r.questions.length + r.rejected.ai_checker)
  })

  it("delivers short, not forever, when every round is rejected (3 rounds max)", async () => {
    const a = fakeAdapter()
    const r = await buildPracticeSet(
      { topics: TOPICS, count: 3, type: "mcq_normal", verify: true },
      { generate: a.generate, check: async () => ({ ok: false, answer: ["D"] }), rng: seeded() },
    )
    expect(r.questions).toHaveLength(0)
    // 3 rounds; each round's first pass asks for the shortfall.
    expect(r.rejected.ai_checker).toBeGreaterThanOrEqual(3)
    expect(r.adapterCalls).toBeLessThan(40)
  })

  it("builds a mixed set with story scenarios and (pilih dua) on multi", async () => {
    const a = fakeAdapter()
    const two: TopicMaterial[] = [...TOPICS, { topic: "Magnet", passages: TOPICS[0].passages.map((p) => ({ ...p, section: "Magnet" })) }]
    const r = await buildPracticeSet({ topics: two, count: 10, type: "mcq_mixed", verify: false }, { generate: a.generate, check: null, rng: seeded() })
    expect(r.questions).toHaveLength(10)
    const by = (t: AdapterTipe) => r.questions.filter((s) => s.tipe === t)
    expect([by("tunggal").length, by("multi").length, by("cerita").length]).toEqual([4, 3, 3])
    expect(by("cerita").every((s) => typeof s.skenario === "string" && !s.skenario.startsWith("Rina"))).toBe(true)
    expect(by("multi").every((s) => s.pertanyaan.includes("(pilih dua)"))).toBe(true)
    expect(new Set(r.questions.map((s) => s.topic))).toEqual(new Set(["Fotosintesis", "Magnet"]))
  })

  it("retries an empty adapter reply once per call", async () => {
    let calls = 0
    const generate = async (tipe: AdapterTipe, n: number) => {
      calls++
      return calls === 1 ? null : fakeAdapter().generate(tipe, n)
    }
    const r = await buildPracticeSet({ topics: TOPICS, count: 1, type: "mcq_normal", verify: false }, { generate, check: null, rng: seeded() })
    expect(r.questions).toHaveLength(1)
    expect(calls).toBe(2)
  })
})
