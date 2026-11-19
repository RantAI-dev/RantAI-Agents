/**
 * Scoring for a practice set. Computed, never generated: a multiple-choice
 * answer is right or wrong, and a model in the loop could only add mistakes.
 */
import type { PracticeSet } from "./types"

export type WeaknessLevel = "low" | "medium" | "high"

/** What to study next, derived from the per-materi results — never generated. */
export interface Recommendation {
  materi: string
  weakness_level: "medium" | "high"
  mastery_percentage: number
  message: string
}

export interface GradeResult {
  score: { correct: number; total: number; percentage: number }
  questions: Array<{
    question_id: string
    materi: string
    correct: boolean
    answered: boolean
    your_answer: string[]
    answer_key: string[]
    pembahasan: string
  }>
  materi: Array<{
    materi: string
    total_questions: number
    correct_answers: number
    mastery_percentage: number
    weakness_level: WeaknessLevel
  }>
  recommendations: Recommendation[]
}

/** Mastery at or above 80% is a strength; below 50% is where to study next. */
export function weaknessLevel(masteryPercentage: number): WeaknessLevel {
  if (masteryPercentage >= 80) return "low"
  if (masteryPercentage >= 50) return "medium"
  return "high"
}

function letters(v: string | string[] | undefined): string[] {
  const list = v === undefined ? [] : Array.isArray(v) ? v : [v]
  return [...new Set(list.map((x) => x.trim().toUpperCase()).filter(Boolean))].sort()
}

const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 100))

export function gradePractice(set: PracticeSet, answers: Record<string, string | string[]>): GradeResult {
  const questions = set.questions.map((q) => {
    const key = letters(q.answer_key)
    const given = letters(answers[q.question_id])
    // Exact match: for a multi-select, a subset or a superset of the key scores
    // nothing, as the spec requires.
    const correct = given.length === key.length && given.every((l, i) => l === key[i])
    return {
      question_id: q.question_id,
      materi: q.materi,
      correct,
      answered: given.length > 0,
      your_answer: given,
      answer_key: key,
      pembahasan: q.pembahasan,
    }
  })

  const byMateri = new Map<string, { total: number; correct: number }>()
  for (const q of questions) {
    const m = byMateri.get(q.materi) ?? { total: 0, correct: 0 }
    m.total++
    if (q.correct) m.correct++
    byMateri.set(q.materi, m)
  }

  const correct = questions.filter((q) => q.correct).length
  const materi = [...byMateri].map(([materiName, m]) => {
    const mastery = pct(m.correct, m.total)
    return {
      materi: materiName,
      total_questions: m.total,
      correct_answers: m.correct,
      mastery_percentage: mastery,
      weakness_level: weaknessLevel(mastery),
    }
  })

  // Weakest first: the material a student should open next is the one they
  // scored worst on. Ties break by name so two runs of the same answers tell
  // the student the same thing in the same order.
  const weaknessOrder: Record<"high" | "medium", number> = { high: 0, medium: 1 }
  const recommendations: Recommendation[] = materi
    .filter((m): m is (typeof materi)[number] & { weakness_level: "high" | "medium" } =>
      m.weakness_level === "high" || m.weakness_level === "medium",
    )
    .sort(
      (a, b) =>
        weaknessOrder[a.weakness_level] - weaknessOrder[b.weakness_level] ||
        a.mastery_percentage - b.mastery_percentage ||
        a.materi.localeCompare(b.materi, "id"),
    )
    .map((m) => ({
      materi: m.materi,
      weakness_level: m.weakness_level,
      mastery_percentage: m.mastery_percentage,
      message:
        m.weakness_level === "high"
          ? `Pelajari lagi materi "${m.materi}": benar ${m.correct_answers} dari ${m.total_questions} soal.`
          : `Ulangi sebagian materi "${m.materi}": benar ${m.correct_answers} dari ${m.total_questions} soal.`,
    }))

  return {
    score: { correct, total: questions.length, percentage: pct(correct, questions.length) },
    questions,
    materi,
    recommendations,
  }
}
