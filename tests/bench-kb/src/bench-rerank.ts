// Rerank benchmark. Fixes the embedder to the best one from embedding bench (we'll parameterize).
// Tests: no-rerank baseline vs cohere/rerank-v3.5 vs LLM-as-reranker (Claude Haiku 4.5, Gemini 2.5 Flash, Gemini 3 Flash Preview).
import { embed, rerank, chat, cosine, readJson, writeJson, sleep } from "./lib";

type Chunk = { id: string; doc: string; idx: number; text: string; section: string | null; type: string };
type DocCorpus = { doc: string; chunks: Chunk[] };
type QA = { q: string; expected_chunk_ids: string[]; gold_answer: string; difficulty: string; doc: string; lang: string };

const RETRIEVER_MODEL = process.env.BENCH_EMB || "qwen/qwen3-embedding-8b";
const RETRIEVE_K = 20; // initial recall pool
const FINAL_K = 5;

async function embedBatch(model: string, texts: string[], batchSize = 16) {
  const out: number[][] = [];
  let ms = 0;
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const r = await embed(model, batch);
    out.push(...r.vectors);
    ms += r.ms;
    await sleep(100);
  }
  return { vectors: out, ms };
}

function topK(queryVec: number[], chunkVecs: number[][], k: number): number[] {
  const scores = chunkVecs.map((v, i) => ({ i, s: cosine(queryVec, v) }));
  scores.sort((a, b) => b.s - a.s);
  return scores.slice(0, k).map(x => x.i);
}

async function llmRerank(model: string, query: string, chunks: Chunk[]): Promise<Array<{ i: number; score: number }>> {
  const numbered = chunks.map((c, i) => `[${i}] ${c.text.slice(0, 400).replace(/\n/g, " ")}`).join("\n\n");
  const prompt = `You are a retrieval reranker. Given a query and a numbered list of candidate passages, output the indices of the top ${FINAL_K} most relevant passages in descending order of relevance, as a JSON array of integers. Only output the JSON array.

Query: ${query}

Passages:
${numbered}

Top ${FINAL_K} indices as JSON array:`;
  const r = await chat(model, [{ role: "user", content: prompt }], 200);
  const m = r.text.match(/\[[\d,\s]+\]/);
  if (!m) throw new Error(`no array in llm rerank output: ${r.text.slice(0, 100)}`);
  const idxs: number[] = JSON.parse(m[0]);
  return idxs.map((i, rank) => ({ i, score: FINAL_K - rank }));
}

function metrics(top: number[], expected: number[]) {
  const firstRank = expected.map(e => top.indexOf(e)).filter(r => r >= 0).reduce((a, b) => Math.min(a, b), top.length);
  return {
    hit1: top[0] !== undefined && expected.includes(top[0]) ? 1 : 0,
    r5: expected.some(e => top.slice(0, 5).includes(e)) ? 1 : 0,
    r10: expected.some(e => top.slice(0, 10).includes(e)) ? 1 : 0,
    mrr: firstRank < top.length ? 1 / (firstRank + 1) : 0,
  };
}

async function run() {
  const corpus: DocCorpus[] = readJson("./results/corpus-unpdf.json");
  const qa: QA[] = readJson("./results/qa.json");
  const allChunks: Chunk[] = corpus.flatMap(d => d.chunks);
  const expectedSet = new Set(qa.flatMap(q => q.expected_chunk_ids));
  const MAX_TOTAL = 400;
  let finalChunks = allChunks;
  if (allChunks.length > MAX_TOTAL) {
    const required = allChunks.filter(c => expectedSet.has(c.id));
    const others = allChunks.filter(c => !expectedSet.has(c.id));
    const step = Math.ceil(others.length / (MAX_TOTAL - required.length));
    finalChunks = [...required, ...others.filter((_, i) => i % step === 0).slice(0, MAX_TOTAL - required.length)];
    finalChunks.sort((a, b) => a.id.localeCompare(b.id));
  }
  const idxMap: Record<string, number> = {};
  finalChunks.forEach((c, i) => { idxMap[c.id] = i; });

  console.log(`Retrieval: ${RETRIEVER_MODEL}, chunks=${finalChunks.length}, queries=${qa.length}`);
  console.log(`embedding chunks...`);
  const chunkTexts = finalChunks.map(c => (c.section ? `Section: ${c.section}\n\n` : "") + c.text.slice(0, 3000));
  const { vectors: chunkVecs } = await embedBatch(RETRIEVER_MODEL, chunkTexts, 16);
  console.log(`embedding queries...`);
  const { vectors: qVecs } = await embedBatch(RETRIEVER_MODEL, qa.map(q => q.q), 16);

  // Per-query: get top-RETRIEVE_K via cosine, then rerank each way.
  const configs = [
    { name: "no-rerank", topK: FINAL_K },
    { name: "cohere/rerank-v3.5", topK: FINAL_K },
    { name: "llm:google/gemini-2.5-flash", topK: FINAL_K },
    { name: "llm:google/gemini-3-flash-preview", topK: FINAL_K },
    { name: "llm:anthropic/claude-haiku-4.5", topK: FINAL_K },
  ];
  const summary: any[] = [];

  for (const cfg of configs) {
    console.log(`\n=== ${cfg.name} ===`);
    const agg = { hit1: 0, r5: 0, r10: 0, mrr: 0, totalMs: 0, costUnits: 0 };
    const per: any[] = [];
    for (let i = 0; i < qa.length; i++) {
      const q = qa[i];
      const expected = q.expected_chunk_ids.map(id => idxMap[id]).filter(x => x !== undefined);
      if (expected.length === 0) continue;
      const initial = topK(qVecs[i], chunkVecs, RETRIEVE_K);
      let final: number[];
      const t0 = Date.now();
      if (cfg.name === "no-rerank") {
        final = initial.slice(0, FINAL_K);
      } else if (cfg.name === "cohere/rerank-v3.5") {
        const docs = initial.map(idx => chunkTexts[idx]);
        try {
          const res = await rerank("cohere/rerank-v3.5", q.q, docs);
          final = res.ranked.slice(0, FINAL_K).map(r => initial[r.index]);
          agg.costUnits++;
        } catch (e: any) {
          console.log(`  cohere fail q${i}: ${e.message.slice(0, 100)}`);
          final = initial.slice(0, FINAL_K);
        }
      } else if (cfg.name.startsWith("llm:")) {
        const llm = cfg.name.slice(4);
        try {
          const cands = initial.map(idx => finalChunks[idx]);
          const ranked = await llmRerank(llm, q.q, cands);
          final = ranked.slice(0, FINAL_K).map(r => initial[r.i]).filter(x => x !== undefined);
          if (final.length < FINAL_K) final = [...final, ...initial.filter(x => !final.includes(x))].slice(0, FINAL_K);
        } catch (e: any) {
          console.log(`  llm fail q${i}: ${e.message.slice(0, 100)}`);
          final = initial.slice(0, FINAL_K);
        }
      } else {
        final = initial.slice(0, FINAL_K);
      }
      agg.totalMs += Date.now() - t0;
      const m = metrics(final, expected);
      agg.hit1 += m.hit1; agg.r5 += m.r5; agg.r10 += m.r10; agg.mrr += m.mrr;
      per.push({ q: q.q, doc: q.doc, expected: q.expected_chunk_ids, top: final.map(i => finalChunks[i].id), ...m });
      await sleep(50);
    }
    const n = qa.length;
    const row = {
      reranker: cfg.name,
      hit_at_1: agg.hit1 / n,
      recall_at_5: agg.r5 / n,
      mrr: agg.mrr / n,
      avg_ms_per_query: agg.totalMs / n,
      cohere_cost_units: agg.costUnits,
      n,
    };
    console.log(`  hit@1=${row.hit_at_1.toFixed(3)} r@5=${row.recall_at_5.toFixed(3)} mrr=${row.mrr.toFixed(3)} avgMs=${row.avg_ms_per_query.toFixed(0)}`);
    summary.push(row);
    writeJson(`./results/rerank/${cfg.name.replace(/[:\/]/g, "_")}.json`, { summary: row, per });
  }

  writeJson("./results/rerank/summary.json", summary);
  console.log("\n=== rerank bench done ===");
}

run().catch(e => { console.error(e); process.exit(1); });
