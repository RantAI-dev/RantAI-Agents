/**
 * IKAT-Bench — a VLM judge for figure relevance, VALIDATED before it is trusted.
 *
 * Human annotation is not affordable at the scale this project needs, and the
 * obvious substitute is an LLM judge. This project has already been burned by
 * exactly that: the harness gold was model-generated and agrees with human
 * judgement at chance on 80% of its links (07-human-gold-audit.md). So the judge
 * is not introduced as a replacement for people — it is introduced as an
 * instrument that must first be checked against the people we have.
 *
 * The 48 annotated items are too few to serve as gold (14 usable positive links)
 * but they are 384 binary decisions, which is ample to CALIBRATE a judge. That
 * inverts the usual order and is the whole point:
 *
 *   1. judge the same 48 items the human judged
 *   2. report Cohen's kappa against the human, with the 2x2 cells
 *   3. only if agreement is acceptable, scale to hundreds of unjudged questions
 *   4. carry the kappa alongside every number the scaled gold produces
 *
 * DESIGN DECISIONS THAT DECIDE WHETHER THIS WORKS
 *
 * - The judge sees the IMAGE, not a description. The human looked at pictures; a
 *   judge reading our VLM descriptions would be scoring a different task, and
 *   would inherit whatever those descriptions got wrong.
 * - Each (question, figure) pair is judged INDEPENDENTLY, not as a ranked list.
 *   A list invites the model to pick a winner even when nothing fits, which is
 *   the failure that produced 261 figures on questions with no correct answer.
 * - "Tidak" is the easy answer and is stated as commonly correct: the human said
 *   no on 30 of 48 items, and a judge that cannot decline is useless here.
 * - Self-consistency over an odd number of repeats, majority vote, with the
 *   agreement rate reported — a judge that flips between calls is noise no
 *   matter how well it agrees on average.
 *
 * Usage:
 *   validate: bun tests/bench-kb/src/ikat/judge-figures.ts validate [repeats]
 *   scale:    bun tests/bench-kb/src/ikat/judge-figures.ts scale <questions.json> [limit]
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { genChat as chat } from "./providers"
import { cohensKappa } from "../judge"

const BENCH_ROOT = path.resolve(import.meta.dirname, "../..")
const ANN_DIR = path.join(BENCH_ROOT, "corpus", "annotation")
const FIG_DIR = path.join(BENCH_ROOT, "corpus", process.env.IKAT_FIGURES ?? "ugm3-figures")
const CORPUS = path.join(BENCH_ROOT, "corpus", process.env.IKAT_CORPUS ?? "ugm3-built")
const JUDGE_MODEL = process.env.IKAT_JUDGE_MODEL ?? process.env.IKAT_GEN_MODEL ?? ""
/** Calls that failed twice. Reported, because a judge that silently defaults to
 *  NO on errors would look conservative when it is simply broken. */
let failures = 0

/**
 * Two calibrations of the same judgement.
 *
 * `loose` scored kappa 0.358 against the human — four times better than our
 * model-generated harness gold (0.092), but short of the 0.6-0.8 that people
 * reach with each other. The 2x2 cells say precisely why, and it is not
 * comprehension: it found 15 of the human's 19 positives, and then said yes 40
 * more times. It agrees about what a helpful figure looks like and disagrees
 * about how rare one is.
 *
 * `strict` therefore does not re-explain the task. It attacks permissiveness
 * directly: the figure must be NECESSARY rather than merely related, the
 * decorative case is named explicitly, and the base rate is stated as a number
 * the judge can calibrate against.
 */
const PROMPT_LOOSE = `Kamu menilai apakah sebuah gambar dari buku pelajaran benar-benar membantu menjawab pertanyaan siswa.

Pertanyaan siswa: {Q}

Lihat gambar di atas.

Jawab "YA" hanya jika gambar ini benar-benar membantu siswa memahami jawaban pertanyaan tersebut.
Jawab "TIDAK" jika gambar tidak berhubungan, hanya hiasan, atau membahas hal lain.

Kebanyakan gambar dalam buku TIDAK membantu menjawab pertanyaan tertentu — "TIDAK" adalah jawaban
yang sering benar. Jika ragu, jawab TIDAK.

Jawab HANYA satu kata: YA atau TIDAK.`

const PROMPT_STRICT = `Kamu menilai apakah sebuah gambar dari buku pelajaran WAJIB ditampilkan untuk menjawab pertanyaan siswa.

Pertanyaan siswa: {Q}

Lihat gambar di atas.

Jawab "YA" HANYA jika gambar ini memuat informasi yang DIBUTUHKAN untuk menjawab pertanyaan itu —
misalnya angka, bentuk, langkah, atau bagian berlabel yang tidak bisa dijelaskan dengan kata-kata saja.

Jawab "TIDAK" untuk semua kasus lain, termasuk:
- gambar yang topiknya berhubungan tetapi tidak dibutuhkan untuk menjawab
- foto orang, suasana, atau kegiatan sebagai hiasan
- gambar pembuka bab atau latar halaman
- gambar yang hanya "cocok temanya"

Patokan penting: dari setiap 20 gambar dalam buku, biasanya HANYA 1 yang benar-benar dibutuhkan
untuk sebuah pertanyaan tertentu. Kalau kamu menjawab YA lebih sering dari itu, kamu terlalu longgar.

Kalau ragu sedikit pun, jawab TIDAK.

Jawab HANYA satu kata: YA atau TIDAK.`

const PROMPT = (process.env.IKAT_JUDGE_PROMPT ?? "loose") === "strict" ? PROMPT_STRICT : PROMPT_LOOSE

/** One judgement, majority over repeats. Returns the vote and its agreement. */
async function judgePair(
  question: string,
  imagePath: string,
  repeats: number,
): Promise<{ yes: boolean; agreement: number }> {
  const url = `data:image/png;base64,${fs.readFileSync(imagePath).toString("base64")}`
  const votes: boolean[] = []
  for (let i = 0; i < repeats; i++) {
    // One bad call must not end a run that has already spent an hour. The first
    // attempt at this crashed at pair 88 of 384 on a single ollama error, losing
    // everything before it. Retry once, then record a NO — a failed judgement is
    // not a positive label.
    let t = ""
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await chat(
          JUDGE_MODEL,
          [
            {
              role: "user",
              content: [
                { type: "image_url", image_url: { url } },
                { type: "text", text: PROMPT.replace("{Q}", question) },
              ],
            },
          ],
          8,
        )
        t = res.text.trim().toUpperCase()
        break
      } catch (err) {
        if (attempt === 1) {
          failures++
          t = ""
        } else {
          await new Promise((r) => setTimeout(r, 2000))
        }
      }
    }
    // Default to NO on an unparseable or failed reply. Failing toward silence is
    // the asymmetry the product needs and stops garbage becoming a positive label.
    votes.push(/\bYA\b/.test(t) && !/\bTIDAK\b/.test(t))
  }
  const yes = votes.filter(Boolean).length
  return { yes: yes * 2 > repeats, agreement: Math.max(yes, repeats - yes) / repeats }
}

function figurePath(docSlug: string, figureId: string): string | null {
  const p = path.join(FIG_DIR, docSlug, `${figureId.split("::").pop()}.png`)
  return fs.existsSync(p) ? p : null
}

async function validate(repeats: number) {
  const key = JSON.parse(fs.readFileSync(path.join(ANN_DIR, "annotation.KEY.json"), "utf-8")) as Array<{
    item: number
    questionId: string
    docSlug: string
    type: string
    shownFigureIds: string[]
  }>
  const humanGold = JSON.parse(fs.readFileSync(path.join(ANN_DIR, "human-gold.json"), "utf-8")) as Array<{
    questionId: string
    humanGold: string[]
  }>
  const humanBy = new Map(humanGold.map((h) => [h.questionId, new Set(h.humanGold)]))
  const questions = new Map<string, string>()
  const qs = JSON.parse(
    fs.readFileSync(path.join(BENCH_ROOT, "corpus", "questions-ugm-large.json"), "utf-8"),
  ) as Array<{ id: string; question: string }>
  for (const q of qs) questions.set(q.id, q.question)

  const judged: number[] = []
  const human: number[] = []
  const agreements: number[] = []
  let missing = 0

  for (const [n, k] of key.entries()) {
    const q = questions.get(k.questionId)
    const hg = humanBy.get(k.questionId)
    if (!q || !hg) continue
    for (const fid of k.shownFigureIds) {
      const p = figurePath(k.docSlug, fid)
      if (!p) {
        missing++
        continue
      }
      const r = await judgePair(q, p, repeats)
      judged.push(r.yes ? 1 : 0)
      human.push(hg.has(fid) ? 1 : 0)
      agreements.push(r.agreement)
    }
    console.log(`  item ${n + 1}/${key.length} — ${judged.length} pairs judged`)
  }

  const k = cohensKappa(human, judged)
  const meanAgr = agreements.reduce((a, b) => a + b, 0) / (agreements.length || 1)
  console.log(`\n=== judge vs human, ${judged.length} pairs (${missing} images missing) ===`)
  console.log(`model: ${JUDGE_MODEL}   repeats: ${repeats}`)
  console.log(`self-consistency (mean agreement across repeats): ${meanAgr.toFixed(3)}`)
  if (failures) console.log(`[warn] ${failures} judge calls failed twice and were recorded as NO`)
  console.log(
    `Cohen's kappa: ${k.kappa === null ? "n/a" : k.kappa.toFixed(3)}` +
      `   cells  both-yes=${k.n11}  judge-only=${k.n01}  human-only=${k.n10}  both-no=${k.n00}`,
  )
  console.log(`human says yes ${k.n11 + k.n10}x; judge says yes ${k.n11 + k.n01}x`)
  console.log(`\nreference points: human-human agreement on tasks like this is typically 0.6-0.8.`)
  console.log(`Our HARNESS gold scored kappa 0.092 against the same human — that is the bar to clear.`)
  fs.writeFileSync(
    path.join(ANN_DIR, "judge-validation.json"),
    JSON.stringify({ model: JUDGE_MODEL, repeats, pairs: judged.length, kappa: k, meanAgreement: meanAgr }, null, 2),
  )
}

async function main() {
  const mode = process.argv[2]
  if (!JUDGE_MODEL) {
    console.error("set IKAT_JUDGE_MODEL")
    process.exit(1)
  }
  if (mode === "validate") await validate(parseInt(process.argv[3] ?? "1", 10))
  else {
    console.error("usage: judge-figures.ts validate [repeats]")
    process.exit(1)
  }
}

if (import.meta.main) main()
