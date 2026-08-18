/**
 * IKAT-Bench — dump raw cross-encoder scores for every candidate of every
 * question, on both external benchmarks, exactly once.
 *
 * Why this exists. The admission rule (score >= 0.1, a global constant) is the
 * single largest identified loss: removing it took the MMDocRAG News domain
 * from 11.31 to 74.03, which means the constant does not transfer across
 * corpora whose description style shifts the score distribution. Studying
 * admission rules by re-running the model once per rule would cost hours per
 * data point and invite exactly the tuning-on-test failure the frozen-config
 * discipline forbids. So: one inference pass, scores persisted, and every rule
 * afterwards is arithmetic over this file — cheap enough to publish a full
 * sensitivity surface instead of a chosen point.
 *
 * Output: JSONL, one line per question:
 *   { bench, subset, qid, gold: [...], cands: [{ id, score }] }
 *
 * Usage:
 *   bun tests/bench-kb/src/ikat/dump-scores.ts            # both benchmarks
 *   bun tests/bench-kb/src/ikat/dump-scores.ts mramg      # one of them
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { rerankTexts } from "./systems"

const BENCH_ROOT = path.resolve(import.meta.dirname, "../..")
const OUT = path.join(BENCH_ROOT, "corpus", "results", "score-dump.jsonl")
const MRAMG = process.env.MRAMG_DIR ?? "/ikat/mramg"
const MMDOC = process.env.MMDOCRAG_DIR ?? path.join(BENCH_ROOT, "corpus", "mmdocrag")
const CTX = Number(process.env.MRAMG_CTX ?? 400)
/** Questions in flight. 3 saturates the CPU TEI; a GPU backend takes more. */
const CONC = Number(process.env.DUMP_CONC ?? 3)

const stream = fs.createWriteStream(OUT, { flags: "a" })
// Resumable: a crash mid-MRAMG should not force re-scoring what finished.
const done = new Set<string>(
  fs.existsSync(OUT)
    ? fs.readFileSync(OUT, "utf-8").trim().split("\n").filter(Boolean)
        .map((l) => { const r = JSON.parse(l); return `${r.bench}/${r.subset}/${r.qid}` })
    : [],
)

function emit(row: object) { stream.write(JSON.stringify(row) + "\n") }

/** Same construction as mramg-eval.ts: prose before the placeholder. */
function imageContexts(text: string, images: string[]): Map<string, string> {
  const parts = text.split("<PIC>")
  const out = new Map<string, string>()
  images.forEach((id, i) => {
    const before = (parts[i] ?? "").trim()
    const after = (parts[i + 1] ?? "").trim().slice(0, Math.floor(CTX / 3))
    out.set(id, `${before.slice(-CTX)} ${after}`.trim())
  })
  return out
}

async function dumpMramg() {
  for (const subset of ["arxiv", "wit", "wiki", "web", "recipe", "manual"]) {
    const docs = new Map<number, { text: string; images: string[] }>()
    for (const line of fs.readFileSync(path.join(MRAMG, `doc_${subset}.jsonl`), "utf-8").trim().split("\n")) {
      const d = JSON.parse(line) as Record<string, unknown>
      docs.set(d["0"] as number, { text: (d["1"] as string) ?? "", images: (d["2"] as string[]) ?? [] })
    }
    const qa = fs.readFileSync(path.join(MRAMG, `${subset}_mqa.jsonl`), "utf-8").trim().split("\n")
      .map((l) => JSON.parse(l) as { id: string; question: string; provenance: number[]; images_list: string[] })
    // The CPU reranker sits at ~50% utilisation under one request at a time, so
    // a few questions in flight nearly doubles throughput. Each emit writes one
    // complete line in a single stream.write call, so lines cannot interleave.
    let n = 0
    const work = async (q: (typeof qa)[number]) => {
      if (done.has(`mramg/${subset}/${q.id}`)) return
      const cands: Array<{ id: string; text: string }> = []
      for (const p of q.provenance ?? []) {
        const d = docs.get(p)
        if (!d) continue
        const ctx = imageContexts(d.text, d.images)
        for (const id of d.images) cands.push({ id, text: ctx.get(id) ?? "" })
      }
      if (!cands.length) return
      const scores = await rerankTexts(q.question, cands.map((c) => c.text))
      emit({ bench: "mramg", subset, qid: q.id, gold: q.images_list ?? [],
        cands: cands.map((c, i) => ({ id: c.id, score: scores[i] ?? 0 })) })
    }
    for (let i = 0; i < qa.length; i += CONC) {
      await Promise.all(qa.slice(i, i + CONC).map(work))
      n = i + CONC
      if (n % 99 === 0 || n % 100 < 3) console.log(`  mramg/${subset} ${Math.min(n, qa.length)}/${qa.length}`)
    }
    console.log(`mramg/${subset}: ${qa.length} questions done`)
  }
}

async function dumpMmdocrag() {
  const rows = fs.readFileSync(path.join(MMDOC, "dev_15.jsonl"), "utf-8").trim().split("\n")
    .map((l) => JSON.parse(l) as {
      q_id: number; domain: string; question: string
      img_quotes?: Array<{ quote_id: string; img_description?: string }>
      gold_quotes?: string[]
    })
  const work = async (r: (typeof rows)[number]) => {
    if (done.has(`mmdocrag/${r.domain}/${r.q_id}`)) return
    const cands = (r.img_quotes ?? []).filter((q) => (q.img_description ?? "").trim())
    if (!cands.length) return
    const scores = await rerankTexts(r.question, cands.map((c) => c.img_description!))
    emit({ bench: "mmdocrag", subset: r.domain, qid: r.q_id,
      gold: (r.gold_quotes ?? []).filter((g) => g.startsWith("image")),
      cands: cands.map((c, i) => ({ id: c.quote_id, score: scores[i] ?? 0 })) })
  }
  for (let i = 0; i < rows.length; i += CONC) {
    await Promise.all(rows.slice(i, i + CONC).map(work))
    if ((i + CONC) % 99 < CONC) console.log(`  mmdocrag ${Math.min(i + CONC, rows.length)}/${rows.length}`)
  }
  console.log(`mmdocrag: ${rows.length} questions done`)
}

const which = process.argv[2] ?? "both"
if (which === "mramg" || which === "both") await dumpMramg()
if (which === "mmdocrag" || which === "both") await dumpMmdocrag()
stream.end()
console.log(`wrote ${OUT}`)
