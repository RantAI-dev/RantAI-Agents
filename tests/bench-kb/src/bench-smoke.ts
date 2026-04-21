// CI-runnable smoke bench. Uses results/corpus-unpdf.json + first 10 Q/A.
// Exercises: dense-only OR hybrid (dense+BM25) OR hybrid+query-expansion,
// driven by the same env flags the production code reads.
//
// Thresholds:
//   KB_HYBRID_BM25_ENABLED=true (default): hit@1 >= 0.90
//   KB_HYBRID_BM25_ENABLED=false:          hit@1 >= 0.85
//   recall@5 >= 0.95 in both cases
//
// Runtime: ~30-90s + <$0.10 per run.
//
// Note: the in-process BM25 here is a faithful BM25 (IDF + length norm +
// stopword filter) — NOT the full SurrealDB analyzer which also does
// snowball stemming. Numbers will closely match production on this corpus
// but are not identical.
import { embed, cosine, readJson } from "./lib";

const SUBSET_SIZE = 10;

// Minimal English stopword set — matches what the production `kb_en` analyzer
// will effectively drop via snowball stemming + low IDF.
const STOPWORDS = new Set([
  "a","an","the","and","or","but","of","in","on","at","to","for","with","by","from",
  "is","are","was","were","be","been","being","have","has","had","do","does","did",
  "this","that","these","those","it","its","as","if","so","no","not","what","which",
  "who","whom","whose","where","when","why","how","can","could","should","would","may",
  "might","will","shall","about","into","through","during","before","after","above",
  "below","between","s","t",
]);

function tokenize(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9]{2,}/g) || []).filter((t) => !STOPWORDS.has(t));
}

async function run() {
  const corpus = readJson<any[]>("./results/corpus-unpdf.json");
  const qa = readJson<any[]>("./results/qa.json").slice(0, SUBSET_SIZE);
  const allChunks = corpus.flatMap((d) => d.chunks);

  // Subsample as before — audit methodology.
  const MAX_TOTAL = 400;
  const expectedSet = new Set(qa.flatMap((q: any) => q.expected_chunk_ids as string[]));
  let finalChunks = allChunks;
  if (allChunks.length > MAX_TOTAL) {
    const required = allChunks.filter((c: any) => expectedSet.has(c.id));
    const others = allChunks.filter((c: any) => !expectedSet.has(c.id));
    const step = Math.max(1, Math.ceil(others.length / (MAX_TOTAL - required.length)));
    finalChunks = [
      ...required,
      ...others.filter((_, i) => i % step === 0).slice(0, MAX_TOTAL - required.length),
    ];
    finalChunks.sort((a: any, b: any) => a.id.localeCompare(b.id));
  }

  const bm25Enabled = process.env.KB_HYBRID_BM25_ENABLED !== "false";
  const threshold = bm25Enabled ? 0.90 : 0.85;

  const idxMap: Record<string, number> = {};
  finalChunks.forEach((c: any, i: number) => { idxMap[c.id] = i; });

  const model = process.env.KB_EMBEDDING_MODEL ?? "qwen/qwen3-embedding-8b";
  const chunkTexts = finalChunks.map(
    (c: any) => (c.section ? `Section: ${c.section}\n\n` : "") + c.text.slice(0, 3000)
  );
  console.log(`smoke: model=${model}, bm25=${bm25Enabled}, chunks=${finalChunks.length}/${allChunks.length}, queries=${qa.length}`);

  const chunkRes = await embed(model, chunkTexts);
  const queryRes = await embed(model, qa.map((q) => q.q));

  // Precompute BM25 statistics once per run.
  const N = finalChunks.length;
  const chunkTokens: string[][] = finalChunks.map((c: any) => tokenize(c.text));
  const chunkLens = chunkTokens.map((ts) => ts.length);
  const avgLen = chunkLens.reduce((a, b) => a + b, 0) / Math.max(1, N);
  const df = new Map<string, number>();
  for (const ts of chunkTokens) {
    const uniq = new Set(ts);
    for (const t of uniq) df.set(t, (df.get(t) || 0) + 1);
  }
  // Per-chunk term-frequency maps (lazily on demand).
  const chunkTf: Array<Map<string, number>> = chunkTokens.map((ts) => {
    const m = new Map<string, number>();
    for (const t of ts) m.set(t, (m.get(t) || 0) + 1);
    return m;
  });

  const k1 = 1.2;
  const b = 0.75;

  function bm25Score(queryTokens: string[], i: number): number {
    const tf = chunkTf[i];
    const dl = chunkLens[i];
    let score = 0;
    for (const q of queryTokens) {
      const termTf = tf.get(q);
      if (!termTf) continue;
      const dfQ = df.get(q) ?? 0;
      const idf = Math.log((N - dfQ + 0.5) / (dfQ + 0.5) + 1);
      const num = termTf * (k1 + 1);
      const denom = termTf + k1 * (1 - b + b * (dl / Math.max(1, avgLen)));
      score += idf * (num / denom);
    }
    return score;
  }

  let h1 = 0, r5 = 0;
  for (let i = 0; i < qa.length; i++) {
    const q = qa[i];
    const expected = q.expected_chunk_ids
      .map((id: string) => idxMap[id])
      .filter((x: number | undefined) => x !== undefined);

    const denseRanked = chunkRes.vectors
      .map((v, idx) => ({ idx, s: cosine(queryRes.vectors[i], v) }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.idx);

    let finalOrder: number[];
    if (bm25Enabled) {
      const qTokens = tokenize(q.q);
      const bm25Ranked = finalChunks
        .map((_: any, idx: number) => ({ idx, s: bm25Score(qTokens, idx) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .map((x) => x.idx);

      // RRF merge of dense + BM25, top 20 from each arm
      const k = 60;
      const rrf = new Map<number, number>();
      denseRanked.slice(0, 20).forEach((idx, rank) => rrf.set(idx, (rrf.get(idx) || 0) + 1 / (k + rank + 1)));
      bm25Ranked.slice(0, 20).forEach((idx, rank) => rrf.set(idx, (rrf.get(idx) || 0) + 1 / (k + rank + 1)));
      finalOrder = Array.from(rrf.entries()).sort((a, b) => b[1] - a[1]).map(([idx]) => idx);
    } else {
      finalOrder = denseRanked;
    }

    const top = finalOrder.slice(0, 5);
    if (expected.includes(top[0])) h1++;
    if (expected.some((e: number) => top.includes(e))) r5++;
  }

  const hit_at_1 = h1 / qa.length;
  const recall_at_5 = r5 / qa.length;
  console.log(`hit@1=${hit_at_1.toFixed(3)} r@5=${recall_at_5.toFixed(3)}`);

  let failed = false;
  if (hit_at_1 < threshold) { console.error(`FAIL: hit@1 ${hit_at_1} < ${threshold}`); failed = true; }
  if (recall_at_5 < 0.95)   { console.error(`FAIL: recall@5 ${recall_at_5} < 0.95`); failed = true; }
  if (failed) process.exit(1);
  console.log("smoke bench PASS");
}

run().catch((err) => { console.error(err); process.exit(1); });
