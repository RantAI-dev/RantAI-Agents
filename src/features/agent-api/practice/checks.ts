/**
 * Checks on a generated question that cost no model call, plus the
 * presentation steps run on every accepted question.
 *
 * The practice adapter is reliable in structure but not in facts: its keys are
 * right mainly when the passage states the answer word for word. These checks,
 * with the AI checker (checker.ts), raised blind-judged accuracy of generated
 * sets from 78% to 89% and cut wrong keys from 14 to 4 in the reference mockup
 * (src/lib/rapikanSoal.ts, src/lib/latihanV10.ts). Thresholds and word rules
 * are kept exactly as calibrated there on 928 blind-judged questions — the
 * ASCII-only word split included — so the calibration still applies.
 */
import type { AdapterSoal } from "./generate-contract"

const LETTERS = ["A", "B", "C", "D"]

const STOP = new Set(
  (
    "dan yang di ke dari untuk dengan pada adalah ini itu atau seperti dalam oleh sebagai antara lain " +
    "akan dapat bisa juga lebih tidak ada karena agar saat secara tersebut hal para setiap suatu sebuah " +
    "harus sangat telah sudah masih hanya bahwa jika maka namun tetapi serta"
  ).split(" "),
)

/** Content words: lowercase ASCII runs longer than two letters, or any number. */
export function contentWords(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => (w.length > 2 || /^\d+$/.test(w)) && !STOP.has(w))
}

/**
 * Share of `text`'s content words found in the reference. Affixes are tolerated
 * through a 5-letter prefix ("deteksi" matches "mendeteksi").
 */
function coverage(text: string, ref: Set<string>, refStr: string): number {
  const words = contentWords(text)
  if (!words.length) return 1
  let found = 0
  for (const w of words) {
    if (ref.has(w)) {
      found++
      continue
    }
    if (w.length >= 5 && refStr.includes(w.slice(0, 5))) {
      for (const b of ref) {
        if (b.startsWith(w.slice(0, 5)) || b.includes(w)) {
          found++
          break
        }
      }
    }
  }
  return found / words.length
}

function coverageOf(text: string, refText: string): number {
  const ref = new Set(contentWords(refText))
  return coverage(text, ref, [...ref].join(" "))
}

/**
 * Format: a question, story or option holding JSON fragments ('pertanyaan':,
 * ]}) — the model wrote another question into one field. The schema only
 * guarantees the outer shape.
 */
export function checkFormat(s: AdapterSoal): boolean {
  const text = [s.skenario ?? "", s.pertanyaan, ...Object.values(s.opsi)].join("\n")
  return !/['"](pertanyaan|opsi|kunci|skenario|soal)['"]\s*:|\}\s*\]|\]\s*\}|\{\s*['"][A-D]['"]\s*:/.test(text)
}

/** Minimum share of a key's content words that must appear in the passage. */
export const KEY_SUPPORT_MIN = 0.5

/**
 * Key supported: every key option must be backed by the passage's words (plus
 * the story, for story questions). Below 50% the key was probably invented.
 * Keys that are only numbers are exempt: a computed answer (binary 1011 = 11)
 * is legitimately absent from the text. Drops 3% of good questions, 20% of bad.
 */
export function checkKeySupported(s: AdapterSoal, passage: string): { ok: boolean; lowest: number } {
  const ref = new Set(contentWords(passage + (s.skenario ? " " + s.skenario : "")))
  const refStr = [...ref].join(" ")
  const scores = s.kunci.map((k) => {
    const words = contentWords(s.opsi[k] ?? "")
    return words.length && words.every((w) => /^\d+$/.test(w)) ? 1 : coverage(s.opsi[k] ?? "", ref, refStr)
  })
  const lowest = scores.length ? Math.min(...scores) : 0
  return { ok: lowest >= KEY_SUPPORT_MIN, lowest: Math.round(lowest * 100) / 100 }
}

/**
 * Twin keys (2-key questions): the two keys are identical once only charge
 * signs (+ - − ±) are removed ("ion Na+" and "ion Na-"), so at least one is
 * wrong. Only the signs are removed: an earlier version compared normalised
 * words and wrongly rejected "α-1,4" and "β-1,4 glikosida", both correct.
 */
export function checkTwinKeys(s: AdapterSoal): boolean {
  if (s.kunci.length < 2) return true
  const raw = s.kunci.map((k) => (s.opsi[k] ?? "").trim().toLowerCase().replace(/\s+/g, " "))
  const unsigned = raw.map((t) => t.replace(/[+\-−±]/g, "").replace(/\s+/g, " ").trim())
  return !(unsigned[0] && unsigned[0] === unsigned[1] && raw[0] !== raw[1])
}

function passageSentences(t: string): string[] {
  return t.split(/(?<=[.!?:;])\s+|\n+/).filter((k) => k.trim())
}

/**
 * Other option also true (2-key questions only): a non-key option has all its
 * content words in the passage sentence that best supports one of the keys
 * ("partikel subatom: neutron, proton, dan elektron" with only two keyed).
 * Multi: drops 4% of good, 24% of bad. Not used for 1-key types, where good
 * distractors legitimately reuse passage sentences.
 */
export function checkAmbiguous(s: AdapterSoal, passage: string): { ok: boolean; option?: string } {
  if (s.kunci.length < 2) return { ok: true }
  const sentences = passageSentences(passage)
  if (!sentences.length) return { ok: true }
  const evidence = s.kunci.map((k) =>
    sentences.reduce((a, b) => (coverageOf(s.opsi[k] ?? "", b) > coverageOf(s.opsi[k] ?? "", a) ? b : a)),
  )
  for (const l of LETTERS) {
    if (s.kunci.includes(l)) continue
    const o = s.opsi[l] ?? ""
    if (contentWords(o).length && evidence.some((e) => coverageOf(o, e) >= 1)) return { ok: false, option: `${l}. ${o}` }
  }
  return { ok: true }
}

/** Word overlap (Jaccard) above which two questions count as the same question. */
export const DUPLICATE_OVERLAP = 0.7

function words(s: string): Set<string> {
  return new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2))
}

/** Identical question text, or more than 70% word overlap across story, question and options. */
export function isDuplicate(a: AdapterSoal, b: AdapterSoal): boolean {
  if (a.pertanyaan.trim().toLowerCase() === b.pertanyaan.trim().toLowerCase()) return true
  const A = words([a.skenario ?? "", a.pertanyaan, ...Object.values(a.opsi)].join(" "))
  const B = words([b.skenario ?? "", b.pertanyaan, ...Object.values(b.opsi)].join(" "))
  let same = 0
  for (const w of A) if (B.has(w)) same++
  return same / Math.max(1, A.size + B.size - same) > DUPLICATE_OVERLAP
}

/** For multi-answer questions: make sure the stem says how many to pick. */
export function ensurePickTwo<T extends AdapterSoal>(s: T): T {
  return s.pertanyaan.toLowerCase().includes("pilih dua") ? s : { ...s, pertanyaan: `${s.pertanyaan} (pilih dua)` }
}

const FEMALE = ["Rina", "Siti", "Ani", "Dina", "Sari", "Dewi", "Lina", "Maya", "Nadia", "Putri", "Ayu", "Intan", "Wulan", "Laras", "Nur"]
const MALE = ["Budi", "Andi", "Rudi", "Agus", "Dodi", "Joko", "Tono", "Bayu", "Dimas", "Fajar", "Rizki", "Arif", "Galih", "Yoga", "Hasan"]

/**
 * Story questions: replace the common character names the model reuses almost
 * every time (Rina, Budi, Siti, ...) with a random same-gender name not yet used
 * in the set. `used` is shared across the set's questions.
 */
export function varyNames<T extends AdapterSoal>(s: T, used: Set<string>, rng: () => number = Math.random): T {
  if (typeof s.skenario !== "string") return s
  const found = [...FEMALE, ...MALE].filter((n) => new RegExp(`\\b${n}\\b`).test(s.skenario as string))
  if (!found.length) return s
  const swap = (t: string, from: string, to: string) => t.replace(new RegExp(`\\b${from}\\b`, "g"), to)
  let out: T = { ...s, opsi: { ...s.opsi } }
  for (const n of found) {
    const pool = FEMALE.includes(n) ? FEMALE : MALE
    const fresh = pool.filter((x) => !used.has(x) && !found.includes(x))
    const choices = fresh.length ? fresh : pool.filter((x) => !found.includes(x))
    const next = choices[Math.floor(rng() * choices.length)] ?? n
    used.add(next)
    out = {
      ...out,
      skenario: swap(out.skenario as string, n, next),
      pertanyaan: swap(out.pertanyaan, n, next),
      opsi: Object.fromEntries(Object.entries(out.opsi).map(([l, t]) => [l, swap(t, n, next)])),
    }
  }
  return out
}
