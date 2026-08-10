/**
 * IKAT-Bench — generate ingest-time figure descriptions, standalone.
 *
 * Separated from run-bench so a description framing can be tried without a full
 * scored run. Descriptions are the expensive half of the ingest cost and the
 * cheap half of the experiment: regenerate once, then evaluate selection over
 * them with select-eval.ts in minutes.
 *
 * Writes to a directory chosen by the caller, so an existing description set is
 * never overwritten by an experiment. Comparing two framings requires keeping
 * both.
 *
 * Usage:
 *   IKAT_PROVIDER=ugm IKAT_CORPUS=ugm3-built \
 *   IKAT_DESCRIBE_MODE=purpose IKAT_DESCRIPTIONS=descriptions-purpose \
 *   IKAT_GEN_MODEL=... bun tests/bench-kb/src/ikat/build-descriptions.ts
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { buildDescriptions } from "./systems"

const BENCH_ROOT = path.resolve(import.meta.dirname, "../..")
const CORPUS = path.join(BENCH_ROOT, "corpus", process.env.IKAT_CORPUS ?? "ugm3-built")
const OUT_DIR = path.join(BENCH_ROOT, "corpus", process.env.IKAT_DESCRIPTIONS ?? "descriptions")
const MODEL = process.env.IKAT_DESCRIBE_MODEL ?? process.env.IKAT_GEN_MODEL ?? "google/gemini-3-flash-preview"

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const files = fs.readdirSync(CORPUS).filter((f) => f.endsWith(".json"))
  console.log(`corpus=${path.basename(CORPUS)} docs=${files.length}`)
  console.log(`mode=${process.env.IKAT_DESCRIBE_MODE ?? "content"} model=${MODEL}`)
  console.log(`out=${OUT_DIR}\n`)

  let total = 0
  for (const [n, file] of files.entries()) {
    const doc = JSON.parse(fs.readFileSync(path.join(CORPUS, file), "utf-8"))
    const t0 = Date.now()
    // buildDescriptions caches per file and skips ids already present, so an
    // interrupted run resumes instead of paying for the whole book again.
    const m = await buildDescriptions(doc, MODEL, path.join(OUT_DIR, `${doc.slug}.json`))
    total += m.size
    console.log(
      `[${n + 1}/${files.length}] ${doc.slug} — ${m.size} descriptions in ${((Date.now() - t0) / 1000).toFixed(0)}s`,
    )
  }
  console.log(`\ndone: ${total} descriptions in ${OUT_DIR}`)
}

if (import.meta.main) main()
