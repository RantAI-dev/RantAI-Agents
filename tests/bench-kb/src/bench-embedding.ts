// Embedding benchmark. For each embedder: embed all chunks + all queries, compute cosine top-k,
// measure recall@5, recall@10, MRR, hit@1 against expected_chunk_ids.
import { embed, cosine, readJson, writeJson, sleep } from "./lib";

type Chunk = { id: string; doc: string; idx: number; text: string; section: string | null; type: string };
type DocCorpus = { doc: string; chunks: Chunk[] };
type QA = { q: string; expected_chunk_ids: string[]; gold_answer: string; difficulty: string; doc: string; lang: string };

const EMBED_MODELS: Array<{ id: string; max?: number }> = [
  { id: "openai/text-embedding-3-small", max: 8000 },
  { id: "openai/text-embedding-3-large", max: 8000 },
  { id: "openai/text-embedding-ada-002", max: 8000 },
  { id: "qwen/qwen3-embedding-4b" },
  { id: "qwen/qwen3-embedding-8b" },
  { id: "baai/bge-large-en-v1.5" },
];

function prepForEmbedding(c: Chunk, sectionPrefix: boolean): string {
  if (!sectionPrefix) return c.text;
  const prefix = c.section ? `Section: ${c.section}\n\n` : "";
  return prefix + c.text;
}

async function embedBatch(model: string, texts: string[], batchSize = 16): Promise<{ vectors: number[][]; totalMs: number; totalTokens?: number }> {
  const out: number[][] = [];
  let totalMs = 0, totalTokens = 0;
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    let attempts = 0;
    while (true) {
      try {
        const r = await embed(model, batch);
        out.push(...r.vectors);
        totalMs += r.ms;
        if (r.usage?.prompt_tokens) totalTokens += r.usage.prompt_tokens;
        break;
      } catch (e: any) {
        attempts++;
        if (attempts >= 3) throw e;
        console.log(`    retry ${attempts} for batch ${i}: ${e.message.slice(0, 100)}`);
        await sleep(1000 * attempts);
      }
    }
    await sleep(100);
  }
  return { vectors: out, totalMs, totalTokens };
}

function topK(queryVec: number[], chunkVecs: number[][], k: number): number[] {
  const scores = chunkVecs.map((v, i) => ({ i, s: cosine(queryVec, v) }));
  scores.sort((a, b) => b.s - a.s);
  return scores.slice(0, k).map(x => x.i);
}

function truncate(t: string, chars: number): string {
  return t.length > chars ? t.slice(0, chars) : t;
}

async function run() {
  const corpus: DocCorpus[] = readJson("./results/corpus-unpdf.json");
  const qa: QA[] = readJson("./results/qa.json");
  const allChunks: Chunk[] = corpus.flatMap(d => d.chunks);
  const chunkIdToIdx: Record<string, number> = {};
  allChunks.forEach((c, i) => { chunkIdToIdx[c.id] = i; });

  // For giant docs (w3c), subsample chunks to keep costs reasonable. Keep all expected-answer chunks.
  const expectedSet = new Set(qa.flatMap(q => q.expected_chunk_ids));
  const MAX_TOTAL = 400;
  let finalChunks = allChunks;
  if (allChunks.length > MAX_TOTAL) {
    // Keep all expected + sample rest evenly
    const required = allChunks.filter(c => expectedSet.has(c.id));
    const others = allChunks.filter(c => !expectedSet.has(c.id));
    const step = Math.ceil(others.length / (MAX_TOTAL - required.length));
    const sampled = others.filter((_, i) => i % step === 0).slice(0, MAX_TOTAL - required.length);
    finalChunks = [...required, ...sampled];
    finalChunks.sort((a, b) => a.id.localeCompare(b.id));
    console.log(`chunk subsample: ${allChunks.length} → ${finalChunks.length} (${required.length} required)`);
  }
  const idxMap: Record<string, number> = {};
  finalChunks.forEach((c, i) => { idxMap[c.id] = i; });

  // Truncate long chunks (some models have token limits)
  const MAX_CHUNK_CHARS = 3000;
  const chunkTexts = finalChunks.map(c => truncate(prepForEmbedding(c, true), MAX_CHUNK_CHARS));
  console.log(`chunks: ${finalChunks.length}, queries: ${qa.length}`);

  const summary: any[] = [];

  for (const em of EMBED_MODELS) {
    console.log(`\n=== ${em.id} ===`);
    try {
      console.log(`  embedding ${chunkTexts.length} chunks...`);
      const { vectors: chunkVecs, totalMs: cMs, totalTokens: cTok } = await embedBatch(em.id, chunkTexts, 16);
      console.log(`  → ${cMs}ms total, dim=${chunkVecs[0]?.length}, tokens=${cTok}`);

      console.log(`  embedding ${qa.length} queries...`);
      const { vectors: qVecs, totalMs: qMs, totalTokens: qTok } = await embedBatch(em.id, qa.map(q => q.q), 16);
      console.log(`  → ${qMs}ms, qtokens=${qTok}`);

      const per: any[] = [];
      let hit1 = 0, recall5 = 0, recall10 = 0, mrrSum = 0;
      for (let i = 0; i < qa.length; i++) {
        const q = qa[i];
        const expected = q.expected_chunk_ids.map(id => idxMap[id]).filter(x => x !== undefined);
        if (expected.length === 0) { per.push({ q: q.q, skip: "no expected in subsample" }); continue; }
        const topIdx = topK(qVecs[i], chunkVecs, 10);
        const foundAt = expected.map(e => topIdx.indexOf(e)).filter(r => r >= 0);
        const firstRank = foundAt.length ? Math.min(...foundAt) : -1;
        if (firstRank === 0) hit1++;
        if (firstRank >= 0 && firstRank < 5) recall5++;
        if (firstRank >= 0) recall10++;
        if (firstRank >= 0) mrrSum += 1 / (firstRank + 1);
        per.push({
          q: q.q,
          doc: q.doc,
          difficulty: q.difficulty,
          expected: q.expected_chunk_ids,
          top10: topIdx.map(i => finalChunks[i].id),
          firstRank,
        });
      }
      const n = qa.length;
      const row = {
        model: em.id,
        dim: chunkVecs[0]?.length,
        chunk_ms: cMs,
        query_ms: qMs,
        chunk_tokens: cTok,
        query_tokens: qTok,
        hit_at_1: hit1 / n,
        recall_at_5: recall5 / n,
        recall_at_10: recall10 / n,
        mrr_at_10: mrrSum / n,
        n,
      };
      console.log(`  hit@1=${row.hit_at_1.toFixed(3)} r@5=${row.recall_at_5.toFixed(3)} r@10=${row.recall_at_10.toFixed(3)} mrr=${row.mrr_at_10.toFixed(3)}`);
      summary.push(row);
      writeJson(`./results/embedding/${em.id.replace(/\//g, "_")}.json`, { summary: row, per });
    } catch (e: any) {
      console.error(`  FAIL: ${e.message.slice(0, 300)}`);
      summary.push({ model: em.id, err: e.message.slice(0, 300) });
    }
  }

  writeJson("./results/embedding/summary.json", summary);
  console.log("\n=== embedding bench done ===");
  console.log(JSON.stringify(summary.map(s => ({ m: s.model, h1: s.hit_at_1, r5: s.recall_at_5, r10: s.recall_at_10, mrr: s.mrr_at_10 })), null, 2));
}
run().catch(e => { console.error(e); process.exit(1); });
