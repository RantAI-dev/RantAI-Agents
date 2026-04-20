// End-to-end bench. Uses qwen3-embedding-8b. Runs 2 rerank configs × 4 gen models = 8 sweeps.
// I (Claude) grade answers manually by reading the dump.
import { embed, rerank, chat, cosine, readJson, writeJson, sleep } from "./lib";
import * as fs from "node:fs";

type Chunk = { id: string; doc: string; idx: number; text: string; section: string | null; type: string };
type DocCorpus = { doc: string; chunks: Chunk[] };
type QA = { q: string; expected_chunk_ids: string[]; gold_answer: string; difficulty: string; doc: string; lang: string };

const RETRIEVER = "qwen/qwen3-embedding-8b";
const K_INITIAL = 20;
const K_FINAL = 5;

const GEN_MODELS = [
  "google/gemini-2.5-flash-lite",     // cheap baseline
  "google/gemini-3-flash-preview",    // best cheap/fast candidate
  "anthropic/claude-haiku-4.5",       // balanced
  "anthropic/claude-sonnet-4.6",      // premium
];

const RERANK_CONFIGS = [
  { key: "none" },
  { key: "llm-gemini3flash", model: "google/gemini-3-flash-preview" },
];

async function embedBatch(model: string, texts: string[], size = 16) {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += size) {
    const r = await embed(model, texts.slice(i, i + size));
    out.push(...r.vectors);
    await sleep(80);
  }
  return out;
}

function topK(q: number[], vs: number[][], k: number): number[] {
  return vs.map((v, i) => ({ i, s: cosine(q, v) })).sort((a, b) => b.s - a.s).slice(0, k).map(x => x.i);
}

const ANSWER_PROMPT = `You are a knowledge-base assistant. Use ONLY the provided passages to answer the question. Be precise. If the passages don't contain the answer, say exactly: "Not in the provided passages."

Question: {Q}

Passages:
{CTX}

Answer:`;

async function run() {
  const corpus: DocCorpus[] = readJson("./results/corpus-unpdf.json");
  const qa: QA[] = readJson("./results/qa.json");
  const allChunks: Chunk[] = corpus.flatMap(d => d.chunks);
  const expectedSet = new Set(qa.flatMap(q => q.expected_chunk_ids));
  const MAX_TOTAL = 400;
  let finalChunks = allChunks;
  if (allChunks.length > MAX_TOTAL) {
    const req = allChunks.filter(c => expectedSet.has(c.id));
    const oth = allChunks.filter(c => !expectedSet.has(c.id));
    const step = Math.ceil(oth.length / (MAX_TOTAL - req.length));
    finalChunks = [...req, ...oth.filter((_, i) => i % step === 0).slice(0, MAX_TOTAL - req.length)];
    finalChunks.sort((a, b) => a.id.localeCompare(b.id));
  }
  const idxMap: Record<string, number> = {};
  finalChunks.forEach((c, i) => { idxMap[c.id] = i; });
  const chunkTexts = finalChunks.map(c => (c.section ? `Section: ${c.section}\n\n` : "") + c.text.slice(0, 3000));

  console.log(`retriever=${RETRIEVER}, chunks=${finalChunks.length}, queries=${qa.length}`);
  console.log("embedding chunks + queries...");
  const chunkVecs = await embedBatch(RETRIEVER, chunkTexts);
  const qVecs = await embedBatch(RETRIEVER, qa.map(q => q.q));

  for (const rrCfg of RERANK_CONFIGS) {
    console.log(`\n╔═══ rerank: ${rrCfg.key} ═══╗`);
    const perQTopIds: number[][] = [];
    for (let i = 0; i < qa.length; i++) {
      const initial = topK(qVecs[i], chunkVecs, K_INITIAL);
      let final: number[];
      if (rrCfg.key === "none") {
        final = initial.slice(0, K_FINAL);
      } else if (rrCfg.key === "llm-gemini3flash") {
        try {
          const cands = initial.map(idx => finalChunks[idx]);
          const numbered = cands.map((c, k) => `[${k}] ${c.text.slice(0, 400).replace(/\n/g, " ")}`).join("\n\n");
          const prompt = `You are a retrieval reranker. Given a query and candidate passages, output the indices of the top ${K_FINAL} most relevant passages in descending order of relevance, as a JSON array of integers. Only output the JSON array.\n\nQuery: ${qa[i].q}\n\nPassages:\n${numbered}\n\nTop ${K_FINAL} indices:`;
          const r = await chat(rrCfg.model!, [{ role: "user", content: prompt }], 200);
          const m = r.text.match(/\[[\d,\s]+\]/);
          if (!m) throw new Error("no array");
          const idxs: number[] = JSON.parse(m[0]);
          final = idxs.slice(0, K_FINAL).map(k => initial[k]).filter(x => x !== undefined);
          if (final.length < K_FINAL) final = [...final, ...initial.filter(x => !final.includes(x))].slice(0, K_FINAL);
        } catch {
          final = initial.slice(0, K_FINAL);
        }
        await sleep(50);
      } else final = initial.slice(0, K_FINAL);
      perQTopIds.push(final);
    }

    for (const gen of GEN_MODELS) {
      const fp = `./results/e2e/${rrCfg.key}_${gen.replace(/\//g, "_")}.json`;
      if (fs.existsSync(fp)) {
        console.log(`  ${gen}: cached`);
        continue;
      }
      console.log(`  === ${gen} ===`);
      const answers: any[] = [];
      for (let i = 0; i < qa.length; i++) {
        const q = qa[i];
        const ctxChunks = perQTopIds[i].map(id => finalChunks[id]);
        const ctx = ctxChunks.map((c, k) => `[passage ${k + 1} | id=${c.id}]\n${c.text.slice(0, 1200)}`).join("\n\n");
        const prompt = ANSWER_PROMPT.replace("{Q}", q.q).replace("{CTX}", ctx);
        try {
          const r = await chat(gen, [{ role: "user", content: prompt }], 600);
          answers.push({ q: q.q, doc: q.doc, lang: q.lang, difficulty: q.difficulty, gold: q.gold_answer, answer: r.text, ctx_ids: perQTopIds[i].map(id => finalChunks[id].id), ms: r.ms, usage: r.usage });
        } catch (e: any) {
          answers.push({ q: q.q, err: e.message.slice(0, 150) });
        }
        await sleep(80);
      }
      writeJson(fp, answers);
      console.log(`    wrote ${answers.length} answers`);
    }
  }
  console.log("\n=== e2e bench done — ready for grading ===");
}
run().catch(e => { console.error(e); process.exit(1); });
