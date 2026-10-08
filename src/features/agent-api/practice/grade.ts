/**
 * Scoring for a practice set. Computed, never generated: a multiple-choice
 * answer is right or wrong, and a model in the loop could only add mistakes.
 */
import type { PracticeSet } from "./types"

export type WeaknessLevel = "low" | "medium" | "high"

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
  return {
    score: { correct, total: questions.length, percentage: pct(correct, questions.length) },
    questions,
    materi: [...byMateri].map(([materi, m]) => {
      const mastery = pct(m.correct, m.total)
      return {
        materi,
        total_questions: m.total,
        correct_answers: m.correct,
        mastery_percentage: mastery,
        weakness_level: weaknessLevel(mastery),
      }
    }),
  }
}
