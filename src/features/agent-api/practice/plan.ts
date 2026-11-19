/**
 * Planning a practice set: which topic and which question type each slot gets,
 * and how a group's questions are spread over passages and adapter calls.
 * Ported from the reference mockup (src/lib/latihanCampur.ts, latihanV10.ts).
 */
import { MAX_PER_CALL, type AdapterTipe } from "./generate-contract"
import type { PracticeType } from "./types"

/**
 * The automatic mix for mcq_mixed. Story questions were the weakest type in
 * blind tests (25/40 passed against 38/40 for single-answer), so their share is
 * deliberately not larger.
 */
export const MIX: Array<[AdapterTipe, number]> = [["tunggal", 0.4], ["multi", 0.3], ["cerita", 0.3]]

export const TIPE_FOR: Record<Exclude<PracticeType, "mcq_mixed">, AdapterTipe> = {
  mcq_normal: "tunggal",
  mcq_multiple_correct: "multi",
  mcq_story: "cerita",
}

export function shuffle<T>(xs: T[], rng: () => number = Math.random): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Split n by weight; the remainder goes by largest fraction so the total stays exactly n. */
export function splitByWeight<K>(n: number, weights: Array<[K, number]>): Map<K, number> {
  const raw = weights.map(([k, w]) => ({ k, x: n * w }))
  const out = new Map(raw.map(({ k, x }) => [k, Math.floor(x)] as [K, number]))
  let left = n - [...out.values()].reduce((a, b) => a + b, 0)
  for (const { k } of [...raw].sort((a, b) => (b.x % 1) - (a.x % 1))) {
    if (left-- <= 0) break
    out.set(k, out.get(k)! + 1)
  }
  return out
}

export interface Slot<T> {
  topic: T
  tipe: AdapterTipe
}

/**
 * One slot per question. Topics beyond the question count are picked at
 * random; counts are split evenly across topics and by the 40/30/30 mix, and
 * types are dealt round-robin so each topic gets a mix rather than one topic
 * getting all the story questions.
 */
export function planSlots<T>(
  topics: T[],
  count: number,
  type: PracticeType,
  rng: () => number = Math.random,
): Array<Slot<T>> {
  if (!topics.length || count < 1) return []
  const used = shuffle(topics, rng).slice(0, count)
  const perTopic = splitByWeight(count, used.map((t) => [t, 1 / used.length] as [T, number]))
  const left = new Map(perTopic)
  const topicOrder: T[] = []
  while (topicOrder.length < count) {
    for (const t of used) {
      if ((left.get(t) ?? 0) > 0) {
        topicOrder.push(t)
        left.set(t, left.get(t)! - 1)
      }
    }
  }
  const typeOrder: AdapterTipe[] = []
  if (type === "mcq_mixed") {
    for (const [tipe, n] of splitByWeight(count, MIX)) for (let i = 0; i < n; i++) typeOrder.push(tipe)
  } else {
    for (let i = 0; i < count; i++) typeOrder.push(TIPE_FOR[type])
  }
  return topicOrder.map((topic, i) => ({ topic, tipe: typeOrder[i] }))
}

/** Group slots by (topic, type). */
export function groupSlots<T>(slots: Array<Slot<T>>, key: (t: T) => string): Array<{ topic: T; tipe: AdapterTipe; n: number }> {
  const groups = new Map<string, { topic: T; tipe: AdapterTipe; n: number }>()
  for (const s of slots) {
    const k = `${key(s.topic)}|${s.tipe}`
    const g = groups.get(k) ?? { topic: s.topic, tipe: s.tipe, n: 0 }
    g.n++
    groups.set(k, g)
  }
  return [...groups.values()]
}

/**
 * Spread `count` questions over as many of `passages` passages as possible, at
 * most MAX_PER_CALL per call, one passage per call. Returns one entry per call.
 */
export function splitCalls(count: number, passages: number): Array<{ passage: number; n: number }> {
  const p = Math.max(1, Math.min(passages, count))
  const base = Math.floor(count / p)
  const extra = count % p
  const out: Array<{ passage: number; n: number }> = []
  for (let i = 0; i < p; i++) {
    const n = base + (i < extra ? 1 : 0)
    for (let left = n; left > 0; left -= MAX_PER_CALL) out.push({ passage: i, n: Math.min(MAX_PER_CALL, left) })
  }
  return out
}
