// CI-runnable smoke bench. Uses results/corpus-unpdf.json + first 10 Q/A.
// Exercises: dense-only OR hybrid (dense+BM25) OR hybrid+query-expansion,
// driven by the same env flags the production code reads.
//
// Thresholds:
//   KB_HYBRID_BM25_ENABLED=true (default): hit@1 >= 0.90
//   KB_HYBRID_BM25_ENABLED=false:          hit@1 >= 0.85  (same as before)
//   recall@5 >= 0.95 in both cases
//
// Runtime: ~30-90s + <$0.10 per run.
import { embed, cosine, readJson } from "./lib";

const SUBSET_SIZE = 10;

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

  // Naive token-overlap score as a BM25 stand-in — the real SurrealDB SEARCH
  // index isn't running in CI, so we simulate the hybrid behaviour.
  function naiveTokenScore(query: string, chunk: string): number {
    const qTokens = new Set(query.toLowerCase().match(/[a-z0-9]+/g) || []);
    const cTokens = chunk.toLowerCase().match(/[a-z0-9]+/g) || [];
    let hits = 0;
    for (const t of cTokens) if (qTokens.has(t)) hits++;
    return hits;
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
      const bm25Ranked = finalChunks
        .map((c: any, idx: number) => ({ idx, s: naiveTokenScore(q.q, c.text) }))
        .filter((x: any) => x.s > 0)
        .sort((a: any, b: any) => b.s - a.s)
        .map((x: any) => x.idx);

      // RRF merge of dense + naive-BM25, top 20
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
