/**
 * IKAT-Bench — MRAMG end-to-end: generation included, not just selection.
 *
 * Every external comparison so far placed a SELECTION result beside END-TO-END
 * systems, and said so. This closes that caveat by running the benchmark's own
 * generation protocol, with the deployed 8B generator, in two arms that differ
 * in exactly one thing:
 *
 *   armA  the benchmark's LLM-based framework verbatim: retrieved chunks with
 *         inline image placeholders, the model inserts <imgN> where it likes.
 *         (Prompt adapted from the benchmark's published one.)
 *   armB  ours: the SAME retrieved chunks stripped of placeholders, the model
 *         writes a text-only answer, and the frozen IKAT pipeline selects
 *         images by anchor context + cross-encoder + admission, placing each
 *         after the answer sentence nearest its anchor.
 *
 * Same retriever, same chunks, same generator, same questions. If the image
 * metrics differ, the cause is the mechanism, not the model.
 *
 * Protocol per the benchmark (arXiv:2502.04176): bge-m3 retrieval, chunks of
 * ~256 tokens via sentence splitting, top-10 chunks; Image P/R/F1 counted per
 * emission; ROUGE-L against the gold answer for text quality.
 *
 * Usage:
 *   bun tests/bench-kb/src/ikat/mramg-endtoend.ts index      # embed chunks once
 *   bun tests/bench-kb/src/ikat/mramg-endtoend.ts run [N]    # both arms, N questions
 *   bun tests/bench-kb/src/ikat/mramg-endtoend.ts score      # metrics from answers
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { rerankTexts } from "./systems"

const BENCH_ROOT = path.resolve(import.meta.dirname, "../..")
const DIR = process.env.MRAMG_DIR ?? path.join(BENCH_ROOT, "corpus", "mramg")
const OUT = path.join(BENCH_ROOT, "corpus", "results", "endtoend")
const SUBSET = process.env.MRAMG_SUBSET ?? "arxiv"
const EMBED = process.env.IKAT_EMBED_BASE ?? "http://10.17.254.27:8096"
// vLLM, not ollama: ollama on this arm64 Blackwell host silently loads the
// model on CPU (size_vram 0, 75 s to prefill 2.5k tokens) despite a GPU device
// reservation. The box's vLLM serves Llama-SEA-LION-v3.5-8B-R on the GPU.
const VLLM = process.env.IKAT_VLLM_BASE ?? "http://10.17.254.27:8098"
const GEN = process.env.IKAT_GEN_MODEL ?? "base"
const TOP_CHUNKS = 10
const CHUNK_CHARS = 1100 // ~256 tokens of English prose
const MIN = Number(process.env.IKAT_RERANK_MIN ?? 0.1)
const TOP_K = Number(process.env.IKAT_RERANK_TOP_K ?? 2)
const CTX = 400

interface QA { id: string; question: string; provenance: number[]; images_list: string[]; ground_truth: string }
interface Chunk { doc: number; text: string; images: string[] }

const sent = (t: string) => t.split(/(?<=[.!?])\s+(?=[A-Z(])/g).filter((s) => s.trim())

function loadDocs(): Map<number, { text: string; images: string[] }> {
  const out = new Map()
  for (const line of fs.readFileSync(path.join(DIR, `doc_${SUBSET}.jsonl`), "utf-8").trim().split("\n")) {
    const d = JSON.parse(line)
    out.set(d["0"], { text: d["1"] ?? "", images: d["2"] ?? [] })
  }
  return out
}

/** Tag each placeholder with its image id, then sentence-pack into chunks. */
function chunkDocs(docs: Map<number, { text: string; images: string[] }>): Chunk[] {
  const chunks: Chunk[] = []
  for (const [id, d] of docs) {
    let k = 0
    const tagged = d.text.replace(/<PIC>/g, () => `<PIC:${d.images[k++] ?? "?"}>`)
    let buf = ""
    const flush = () => {
      if (!buf.trim()) return
      const images = [...buf.matchAll(/<PIC:([^>]+)>/g)].map((m) => m[1]!)
      chunks.push({ doc: id, text: buf.trim(), images })
      buf = ""
    }
    for (const s of sent(tagged)) {
      if (buf.length + s.length > CHUNK_CHARS) flush()
      buf += s + " "
    }
    flush()
  }
  return chunks
}

async function embed(texts: string[]): Promise<number[][]> {
  const out: number[][] = []
  for (let i = 0; i < texts.length; i += 24) {
    const res = await fetch(`${EMBED}/embed`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputs: texts.slice(i, i + 24).map((t) => t.slice(0, 4000)), truncate: true }),
    })
    if (!res.ok) throw new Error(`embed ${res.status}: ${await res.text()}`)
    out.push(...(await res.json() as number[][]))
  }
  return out
}

const cos = (a: number[], b: number[]) => {
  let s = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { s += a[i]! * b[i]!; na += a[i]! * a[i]!; nb += b[i]! * b[i]! }
  return s / (Math.sqrt(na) * Math.sqrt(nb))
}

async function generate(prompt: string): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(`${VLLM}/v1/chat/completions`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: GEN, messages: [{ role: "user", content: prompt }],
          max_tokens: 700, temperature: 0,
          chat_template_kwargs: { thinking_mode: "off" },
        }),
        signal: AbortSignal.timeout(240_000),
      })
      if (!res.ok) throw new Error(`generate ${res.status}: ${await res.text()}`)
      const j = (await res.json()) as { choices: Array<{ message: { content: string } }> }
      return j.choices[0]?.message?.content ?? ""
    } catch (e) {
      // The path to the box crosses a VPN, and the box's LLMOps platform
      // recycles the vLLM container while we run — a restart plus fp8 model
      // reload takes minutes. Resets are weather, not signal; give up only
      // after the outage looks real.
      if (attempt >= 8) throw e
      console.log(`  generate retry ${attempt + 1} after: ${e}`)
      await new Promise((r) => setTimeout(r, 10_000 * (attempt + 1)))
    }
  }
}

/** The benchmark's own anchor construction, reused for arm B selection. */
function anchorCtx(text: string, images: string[]): Map<string, string> {
  const parts = text.split("<PIC>")
  const out = new Map<string, string>()
  images.forEach((id, i) => {
    const before = (parts[i] ?? "").trim()
    const after = (parts[i + 1] ?? "").trim().slice(0, Math.floor(CTX / 3))
    out.set(id, `${before.slice(-CTX)} ${after}`.trim())
  })
  return out
}

async function index() {
  const docs = loadDocs()
  const chunks = chunkDocs(docs)
  console.log(`${SUBSET}: ${docs.size} docs -> ${chunks.length} chunks; embedding…`)
  const vecs = await embed(chunks.map((c) => c.text.replace(/<PIC:[^>]+>/g, " ")))
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(path.join(OUT, `index-${SUBSET}.json`), JSON.stringify({ chunks, vecs }))
  console.log(`wrote index (${chunks.length} chunks)`)
}

const promptA = (q: string, ctx: string, caps: string) =>
  `You are an expert in handling multimodal input queries and producing coherent text-image responses.
You will receive:
1. Query: the user query to be answered.
2. Context containing multiple images represented as placeholders like <img1>. Each placeholder stands for an image at that position in the source text.
3. Image captions, one per placeholder, in order.

Answer the query based solely on the content of the context. You may include images from the context when they genuinely support the answer: insert the corresponding placeholder (for example <img2>) at the most appropriate point in your answer, embedded naturally so it enhances understanding. Do not invent placeholders that were not in the context. Do not add information beyond the context. Answer in 2-6 sentences of plain prose.

Query: ${q}
Context: ${ctx}
Image captions: ${caps}

Answer:`

const promptB = (q: string, ctx: string) =>
  `Answer the query based solely on the content of the context. Do not add information beyond the context. Answer in 2-6 sentences of plain prose.

Query: ${q}
Context: ${ctx}

Answer:`

async function run(limit: number) {
  const { chunks, vecs } = JSON.parse(fs.readFileSync(path.join(OUT, `index-${SUBSET}.json`), "utf-8")) as { chunks: Chunk[]; vecs: number[][] }
  const docs = loadDocs()
  const qa = fs.readFileSync(path.join(DIR, `${SUBSET}_mqa.jsonl`), "utf-8").trim().split("\n")
    .map((l) => JSON.parse(l) as QA).slice(0, limit)
  const outFile = path.join(OUT, `answers-${SUBSET}.jsonl`)
  const done = new Set(
    fs.existsSync(outFile)
      ? fs.readFileSync(outFile, "utf-8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l).id)
      : [],
  )
  const stream = fs.createWriteStream(outFile, { flags: "a" })

  for (const [i, q] of qa.entries()) {
    if (done.has(q.id)) continue
    const qv = (await embed([q.question]))[0]!
    const top = vecs.map((v, j) => ({ j, s: cos(qv, v) })).sort((a, b) => b.s - a.s).slice(0, TOP_CHUNKS)
    const picked = top.map((t) => chunks[t.j]!)

    // Arm A: placeholders inline, captions = the anchor tail (the benchmark's
    // caption field is not present in these dumps; the text before the
    // placeholder is what its own placeholder-based baseline reads).
    const imgIds: string[] = []
    // The GPU generator's window is 4096 including the answer. 10 chunks of
    // ~256 tokens plus captions sits at the edge; trim whole chunks from the
    // bottom of the ranking rather than truncating text mid-sentence.
    const fit = (build: (n: number) => string): string => {
      for (let n = picked.length; n > 2; n--) {
        const p = build(n)
        if (p.length / 3.4 + 720 < 4060) return p
      }
      return build(2)
    }
    const ansA = await generate(fit((n) => {
      imgIds.length = 0
      const ctx = picked.slice(0, n).map((c) =>
        c.text.replace(/<PIC:([^>]+)>/g, (_, id: string) => {
          imgIds.push(id)
          return ` <img${imgIds.length}> `
        }),
      ).join("\n---\n")
      const cp = imgIds.map((id, k) => {
        const d = [...docs.values()].find((dd) => dd.images.includes(id))
        const cap = d ? (anchorCtx(d.text, d.images).get(id) ?? "") : ""
        return `<img${k + 1}>: ${cap.slice(-160)}`
      }).join("\n")
      return promptA(q.question, ctx, cp)
    }))
    const emittedA = [...ansA.matchAll(/<img(\d+)>/g)]
      .map((m) => imgIds[Number(m[1]) - 1])
      .filter((x): x is string => !!x)

    // Arm B: same chunks, no placeholders; frozen IKAT selection over the
    // images those chunks contain, represented by their anchor context.
    const ansB = await generate(fit((n) =>
      promptB(q.question, picked.slice(0, n).map((c) => c.text.replace(/<PIC:[^>]+>/g, " ")).join("\n---\n")),
    ))
    const candIds = [...new Set(picked.flatMap((c) => c.images))]
    const candCtx = candIds.map((id) => {
      const d = [...docs.values()].find((dd) => dd.images.includes(id))
      return d ? (anchorCtx(d.text, d.images).get(id) ?? "") : ""
    })
    const scores = candIds.length ? await rerankTexts(q.question, candCtx) : []
    const emittedB = candIds
      .map((id, k) => ({ id, s: scores[k] ?? 0 }))
      .filter((x) => x.s >= MIN)
      .sort((a, b) => b.s - a.s)
      .slice(0, TOP_K)
      .map((x) => x.id)

    stream.write(JSON.stringify({
      id: q.id, question: q.question, gold: q.images_list, ground_truth: q.ground_truth,
      retrievedImages: candIds, ansA, emittedA, ansB, emittedB,
    }) + "\n")
    if ((i + 1) % 10 === 0) console.log(`  ${i + 1}/${qa.length}`)
  }
  stream.end()
  console.log(`wrote ${outFile}`)
}

/** ROUGE-L F1 on word sequences. */
function rougeL(cand: string, ref: string): number {
  const a = cand.toLowerCase().match(/[a-z0-9]+/g) ?? []
  const b = ref.toLowerCase().match(/[a-z0-9]+/g) ?? []
  if (!a.length || !b.length) return 0
  const dp = new Array(b.length + 1).fill(0)
  for (let i = 1; i <= a.length; i++) {
    let prev = 0
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]
      dp[j] = a[i - 1] === b[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1])
      prev = tmp
    }
  }
  const lcs = dp[b.length]
  const p = lcs / a.length, r = lcs / b.length
  return p + r ? (2 * p * r) / (p + r) : 0
}

function score() {
  const rows = fs.readFileSync(path.join(OUT, `answers-${SUBSET}.jsonl`), "utf-8").trim().split("\n").map((l) => JSON.parse(l))
  const arms = { A: [0, 0, 0, 0, 0], B: [0, 0, 0, 0, 0] } as Record<string, number[]> // tp fp fn rouge silent
  // Reachability ceiling: recall is bounded by what retrieval surfaced at all.
  let reachable = 0, goldTotal = 0
  for (const r of rows) {
    const gold = new Set<string>(r.gold)
    goldTotal += gold.size
    reachable += r.retrievedImages.filter((i: string) => gold.has(i)).length
    for (const [arm, emitted, ans] of [["A", r.emittedA, r.ansA], ["B", r.emittedB, r.ansB]] as const) {
      const acc = arms[arm]!
      for (const e of emitted) (gold.has(e) ? acc[0]++ : acc[1]++)
      for (const g of gold) if (!emitted.includes(g)) acc[2]++
      acc[3] += rougeL(String(ans).replace(/<img\d+>/g, " "), r.ground_truth)
      if (!emitted.length) acc[4]++
    }
  }
  console.log(`${rows.length} questions; gold images reachable after retrieval: ${(100 * reachable / goldTotal).toFixed(1)}%\n`)
  console.log(`arm                          IP      IR      IF1   ROUGE-L  silent%`)
  for (const [arm, [tp, fp, fn, rouge, silent]] of Object.entries(arms)) {
    const P = tp! + fp! ? tp! / (tp! + fp!) : 0
    const R = tp! + fn! ? tp! / (tp! + fn!) : 0
    const F = P + R ? (2 * P * R) / (P + R) : 0
    const name = arm === "A" ? "A: LLM inserts (their protocol)" : "B: IKAT selects (ours)"
    console.log(`${name.padEnd(31)} ${(100 * P).toFixed(2).padStart(5)}  ${(100 * R).toFixed(2).padStart(6)}  ${(100 * F).toFixed(2).padStart(6)}  ${(rouge! / rows.length).toFixed(3).padStart(6)}  ${(100 * silent! / rows.length).toFixed(0).padStart(5)}`)
  }
  fs.writeFileSync(path.join(OUT, `score-${SUBSET}.json`), JSON.stringify({ n: rows.length, arms, reachablePct: 100 * reachable / goldTotal }, null, 2))
}

/**
 * Re-derive arm B's emissions under the admission rule the admission study
 * selected on independent data (docs/14), BEFORE this experiment ran. The
 * generation and retrieval are untouched; only the admission arithmetic over
 * the same candidates changes, so this is the pre-registered variant, not a
 * post-hoc tune.
 */
async function rescore() {
  const docs = loadDocs()
  const file = path.join(OUT, `answers-${SUBSET}.jsonl`)
  const rows = fs.readFileSync(file, "utf-8").trim().split("\n").map((l) => JSON.parse(l))
  const arms: Record<string, number[]> = { frozen: [0, 0, 0, 0], topk2: [0, 0, 0, 0], rel: [0, 0, 0, 0] }
  for (const r of rows) {
    const gold = new Set<string>(r.gold)
    const candIds: string[] = r.retrievedImages
    const candCtx = candIds.map((id) => {
      const d = [...docs.values()].find((dd) => dd.images.includes(id))
      return d ? (anchorCtx(d.text, d.images).get(id) ?? "") : ""
    })
    const scores = candIds.length ? await rerankTexts(r.question, candCtx) : []
    const ranked = candIds.map((id, k) => ({ id, s: scores[k] ?? 0 })).sort((a, b) => b.s - a.s)
    const m = ranked[0]?.s ?? 0
    const pick: Record<string, string[]> = {
      frozen: ranked.filter((x) => x.s >= 0.1).slice(0, 2).map((x) => x.id),
      topk2: ranked.slice(0, 2).map((x) => x.id),
      rel: ranked.filter((x) => x.s >= 0.2 * m).slice(0, 3).map((x) => x.id),
    }
    for (const [arm, emitted] of Object.entries(pick)) {
      const a = arms[arm]!
      for (const e of emitted) (gold.has(e) ? a[0]++ : a[1]++)
      for (const g of gold) if (!emitted.includes(g)) a[2]++
      if (!emitted.length) a[3]++
    }
  }
  console.log(`arm B admission variants, same answers, same candidates (${rows.length} q)\n`)
  console.log(`rule                       IP      IR      IF1   silent%`)
  for (const [arm, [tp, fp, fn, silent]] of Object.entries(arms)) {
    const P = tp! + fp! ? tp! / (tp! + fp!) : 0
    const R = tp! + fn! ? tp! / (tp! + fn!) : 0
    const F = P + R ? (2 * P * R) / (P + R) : 0
    console.log(`${arm.padEnd(24)} ${(100 * P).toFixed(2).padStart(6)}  ${(100 * R).toFixed(2).padStart(6)}  ${(100 * F).toFixed(2).padStart(6)}  ${(100 * silent! / rows.length).toFixed(0).padStart(5)}`)
  }
  fs.writeFileSync(path.join(OUT, `rescore-${SUBSET}.json`), JSON.stringify(arms, null, 1))
}

const cmd = process.argv[2] ?? "run"
if (cmd === "index") await index()
else if (cmd === "run") await run(Number(process.argv[3] ?? 200))
else if (cmd === "score") score()
else if (cmd === "rescore") await rescore()
