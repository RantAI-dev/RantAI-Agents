/**
 * Building a verified practice set from per-topic book passages.
 *
 * The flow of the reference mockup (src/lib/latihanCampur.ts, latihanV10.ts):
 *  1. Plan one slot per question (topic × type), group the slots, run all
 *     groups in parallel.
 *  2. Within a group, spread its questions over different passages, at most
 *     three per call, one passage per call; refill near-duplicates from other
 *     passages.
 *  3. Verify each question: the free word checks first, then the AI checker on
 *     what survives, all in parallel. Drop duplicates across the whole set.
 *  4. A rejected question leaves the set; short groups are generated again, up
 *     to 3 rounds in total. A set still short after that is delivered short.
 *
 * Model calls are injected (`deps`) so the flow is testable without a model.
 */
import {
  checkAmbiguous, checkFormat, checkKeySupported, checkTwinKeys, ensurePickTwo, isDuplicate, varyNames,
} from "./checks"
import { cleanQuestion, shuffleOptions, type AdapterSoal, type AdapterTipe } from "./generate-contract"
import { groupSlots, planSlots, shuffle, splitCalls } from "./plan"
import type { PracticeType, RejectionReason } from "./types"

export interface Passage {
  title: string
  section: string | null
  text: string
}

export interface TopicMaterial {
  topic: string
  passages: Passage[]
}

/** Marks an adapter call that did not come back with a usable reply. */
export interface AdapterCallFailure {
  failure: "timeout" | "error"
}

const isFailure = (r: unknown): r is AdapterCallFailure =>
  typeof r === "object" && r !== null && "failure" in (r as Record<string, unknown>)

export interface EngineDeps {
  /**
   * One adapter call: `n` questions of `tipe` from one passage. null = unusable
   * reply; `{ failure }` = the call itself failed (timeout or error). The
   * `signal` (present when the route wired the request's) aborts the call on
   * a client disconnect and is safe to ignore.
   */
  generate: (
    tipe: AdapterTipe,
    n: number,
    passage: string,
    signal?: AbortSignal,
  ) => Promise<AdapterSoal[] | null | AdapterCallFailure>
  /** The AI checker, or null to skip it (not configured). */
  check: ((s: AdapterSoal, passage: string) => Promise<{ ok: boolean; answer: string[] | null }>) | null
  rng?: () => number
}

/** Progress within generation: what is running and how much is already in. */
export interface EngineProgress {
  stage: "generating" | "checking"
  delivered: number
  adapter_calls: number
}

export interface AcceptedQuestion extends AdapterSoal {
  tipe: AdapterTipe
  topic: string
  passage: Passage
}

export interface RejectedExample {
  question: string
  key: string
  reason: RejectionReason
  detail: string
}

export interface EngineResult {
  questions: AcceptedQuestion[]
  adapterCalls: number
  /** Adapter calls that ended in a timeout (no reply at all). */
  adapterTimeouts: number
  /** Adapter calls that ended in an HTTP/network error. */
  adapterErrors: number
  checksRun: number
  rejected: Record<RejectionReason, number>
  rejectedExamples: RejectedExample[]
  /** True when the caller's AbortSignal fired and generation stopped early. */
  aborted: boolean
}

/** Rounds in total: the first plus at most two replacement rounds. */
export const MAX_ROUNDS = 3

type Group = { topic: TopicMaterial; tipe: AdapterTipe; n: number; used: Map<Passage, number> }
type Candidate = AdapterSoal & { passage: Passage }

export async function buildPracticeSet(
  args: {
    topics: TopicMaterial[]
    count: number
    type: PracticeType
    verify: boolean
    /** Aborts further adapter calls when the client disconnects. */
    signal?: AbortSignal
    /** Optional; changes nothing when absent. */
    onProgress?: (info: EngineProgress) => void
  },
  deps: EngineDeps,
): Promise<EngineResult> {
  const rng = deps.rng ?? Math.random
  const topics = args.topics.filter((t) => t.passages.length > 0)
  const groups = groupSlots(planSlots(topics, args.count, args.type, rng), (t) => t.topic)

  // Each topic's passages are shuffled once and handed out in order, so
  // different types of the same topic use different passages.
  const queue = new Map(topics.map((t) => [t.topic, shuffle(t.passages, rng)]))
  const position = new Map<string, number>()
  const takePassages = (t: TopicMaterial, n: number): Passage[] => {
    const list = queue.get(t.topic)!
    const start = position.get(t.topic) ?? 0
    const taken = Array.from({ length: Math.min(n, list.length) }, (_, i) => list[(start + i) % list.length])
    position.set(t.topic, start + taken.length)
    return taken
  }

  const rejected: Record<RejectionReason, number> = {
    format: 0, key_unsupported: 0, twin_keys: 0, ambiguous: 0, ai_checker: 0, duplicate: 0,
  }
  const rejectedExamples: RejectedExample[] = []
  const reject = (s: AdapterSoal, reason: RejectionReason, detail: string) => {
    rejected[reason]++
    if (rejectedExamples.length < 10) {
      rejectedExamples.push({
        question: s.pertanyaan,
        key: s.kunci.map((k) => `${k}. ${s.opsi[k]}`).join(" | "),
        reason,
        detail,
      })
    }
  }

  let adapterCalls = 0
  let adapterTimeouts = 0
  let adapterErrors = 0
  let checksRun = 0
  const accepted: AcceptedQuestion[] = []
  const usedNames = new Set<string>()

  // Progress: one event per stage change, plus one whenever the accepted
  // count moves. Absent callback = no work at all.
  let stage: EngineProgress["stage"] | null = null
  let lastDelivered = -1
  const emit = (s: EngineProgress["stage"]) => {
    if (!args.onProgress) return
    const delivered = accepted.length
    if (s === stage && delivered === lastDelivered) return
    stage = s
    lastDelivered = delivered
    args.onProgress({ stage: s, delivered, adapter_calls: adapterCalls })
  }

  /** One group's questions, spread over passages, near-duplicates refilled. */
  async function generateGroup(g: Group): Promise<Candidate[]> {
    const passages = takePassages(g.topic, g.n)
    const out: Candidate[] = []
    // A passage counts as "used" for this group from the moment a call is
    // made on it; the number counts its questions accepted for the group, so
    // a refill that must reuse one can pick the least productive.
    const markCall = (p: Passage) => {
      if (!g.used.has(p)) g.used.set(p, 0)
    }
    const take = (list: AdapterSoal[] | null, passage: Passage) => {
      for (const s of list ?? []) {
        if (out.some((x) => isDuplicate(x, s))) continue
        out.push({ ...s, passage })
      }
    }
    const call = async (passage: Passage, n: number): Promise<AdapterSoal[] | null> => {
      if (args.signal?.aborted) return null
      markCall(passage)
      adapterCalls++
      // One retry: a broken or empty reply is usually gone on the second draw.
      const first = await deps.generate(g.tipe, n, passage.text, args.signal)
      if (isFailure(first)) first.failure === "timeout" ? adapterTimeouts++ : adapterErrors++
      if (args.signal?.aborted) return null
      if (Array.isArray(first) && first.length) return first
      const second = await deps.generate(g.tipe, n, passage.text, args.signal)
      if (isFailure(second)) second.failure === "timeout" ? adapterTimeouts++ : adapterErrors++
      return isFailure(second) ? null : second
    }
    const calls = splitCalls(g.n, passages.length)
    const firstRound = await Promise.all(calls.map((c) => call(passages[c.passage], c.n)))
    firstRound.forEach((list, i) => take(list, passages[calls[i].passage]))
    const all = queue.get(g.topic.topic)!
    /** Refill passages: ones this group has not used yet, fewest-accepted otherwise. */
    const pickExtra = (): Passage => {
      const unused = all.filter((p) => !g.used.has(p))
      if (unused.length > 0) {
        const p = unused[0]
        markCall(p)
        return p
      }
      return [...all].sort((a, b) => (g.used.get(a) ?? 0) - (g.used.get(b) ?? 0))[0]
    }
    for (let round = 0; round < 2 && out.length < g.n && !args.signal?.aborted; round++) {
      const missing = g.n - out.length
      const extra = Array.from({ length: Math.min(missing, all.length * 2) }, () => pickExtra())
      const more = await Promise.all(extra.map((p) => call(p, 1)))
      more.forEach((list, i) => take(list, extra[i]))
    }
    return out.slice(0, g.n).map((s) => {
      let q: Candidate = { ...s, pertanyaan: cleanQuestion(s.pertanyaan) }
      if (q.skenario) q = { ...q, skenario: cleanQuestion(q.skenario) }
      return g.tipe === "multi" ? ensurePickTwo(q) : q
    })
  }

  /** One round: generate for every short group, verify, keep what passes. */
  async function runRound(short: Group[]): Promise<Map<Group, number>> {
    emit("generating")
    const generated = await Promise.all(short.map(async (g) => ({ g, list: await generateGroup(g) })))
    const candidates: Array<{ g: Group; s: Candidate }> = []
    for (const { g, list } of generated) {
      for (const s of list) {
        if (!args.verify) {
          candidates.push({ g, s })
          continue
        }
        if (!checkFormat(s)) {
          reject(s, "format", "question text holds JSON fragments")
          continue
        }
        const key = checkKeySupported(s, s.passage.text)
        if (!key.ok) {
          reject(s, "key_unsupported", `${Math.round(key.lowest * 100)}% of the key's words are in the passage`)
          continue
        }
        if (!checkTwinKeys(s)) {
          reject(s, "twin_keys", "the two keys differ only by a charge sign")
          continue
        }
        const amb = checkAmbiguous(s, s.passage.text)
        if (!amb.ok) {
          reject(s, "ambiguous", `another option is also true: ${amb.option}`)
          continue
        }
        candidates.push({ g, s })
      }
    }

    const check = args.verify ? deps.check : null
    if (check) emit("checking")
    const verdicts = check
      ? await Promise.all(candidates.map(({ s }) => check(s, s.passage.text)))
      : candidates.map(() => ({ ok: true, answer: null as string[] | null }))
    if (check) checksRun += candidates.length

    const got = new Map<Group, number>()
    candidates.forEach(({ g, s }, i) => {
      const v = verdicts[i]
      if (!v.ok) {
        const key = [...s.kunci].sort().join(", ")
        reject(s, "ai_checker", v.answer?.length
          ? `checker answered ${v.answer.join(", ")}, key ${key}`
          : `checker found no correct option in the passage (key ${key})`)
        return
      }
      if (accepted.some((x) => isDuplicate(x, s))) {
        reject(s, "duplicate", "same question as one already in the set")
        return
      }
      const shown = varyNames(shuffleOptions(s, rng), usedNames, rng)
      accepted.push({ ...shown, tipe: g.tipe, topic: g.topic.topic, passage: s.passage })
      // Credit the passage so a later refill for this group avoids it first.
      g.used.set(s.passage, (g.used.get(s.passage) ?? 0) + 1)
      got.set(g, (got.get(g) ?? 0) + 1)
      emit(stage ?? "generating")
    })
    return got
  }

  const want: Group[] = groups.map((g) => ({ topic: g.topic, tipe: g.tipe, n: g.n, used: new Map<Passage, number>() }))
  const have = new Map<Group, number>()
  // Each round asks only for what is still missing; `origin` credits a round's
  // short group back to the group it came from. The spread keeps a regen
  // group on its origin's `used` map, so it avoids passages that already
  // produced accepted questions for this group.
  let short: Array<{ group: Group; origin: Group }> = want.map((g) => ({ group: g, origin: g }))
  for (let round = 0; round < MAX_ROUNDS && short.length && !args.signal?.aborted; round++) {
    const got = await runRound(short.map((s) => s.group))
    for (const { group, origin } of short) have.set(origin, (have.get(origin) ?? 0) + (got.get(group) ?? 0))
    short = want
      .map((g) => ({ g, n: g.n - (have.get(g) ?? 0) }))
      .filter(({ n }) => n > 0)
      .map(({ g, n }) => ({ group: { ...g, n }, origin: g }))
  }

  return {
    questions: shuffle(accepted, rng).slice(0, args.count),
    adapterCalls,
    adapterTimeouts,
    adapterErrors,
    checksRun,
    rejected,
    rejectedExamples,
    aborted: args.signal?.aborted ?? false,
  }
}
