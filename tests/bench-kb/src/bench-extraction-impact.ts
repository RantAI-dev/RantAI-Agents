// Pivotal ablation: re-chunk apple10k using the best gemini-extraction (instead of unpdf),
// then re-embed and re-retrieve. Measure delta in hit@1 / r@5 to quantify extraction impact on retrieval.
import { embed, cosine, readJson, writeJson, sleep } from "./lib";
import { SmartChunker } from "./smart-chunker";
import * as fs from "node:fs";

const EM = "openai/text-embedding-3-large";
const DOC_ID = "apple10k";
const EXTRACTOR = "google_gemini-2.5-flash-lite"; // best structural fidelity

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

async function run() {
  // Load both extractions of apple10k
  const extracted = readJson<{ text: string }>(`./results/extraction/apple10k/${EXTRACTOR}.json`).text;
  const unpdf = readJson<{ text: string }>(`./results/extraction/apple10k/unpdf.json`).text;

  // Chunk both with same chunker
  const chunker = new SmartChunker({ maxChunkSize: 800, overlapSize: 200 });
  const geminiChunks = (await chunker.chunk(extracted)).map((c, i) => ({
    id: `apple10k_g${c.chunkIndex}`, text: c.text, section: c.metadata.section ?? null,
  }));
  const unpdfChunks = (await chunker.chunk(unpdf)).map((c, i) => ({
    id: `apple10k_u${c.chunkIndex}`, text: c.text, section: c.metadata.section ?? null,
  }));

  console.log(`unpdf chunks: ${unpdfChunks.length}, gemini-flash-lite chunks: ${geminiChunks.length}`);

  // Q/A for apple10k from original qa set
  const qa: any[] = readJson("./results/qa.json");
  const appleQ = qa.filter(q => q.doc === "apple10k");
  console.log(`apple10k queries: ${appleQ.length}`);

  const results: any = { extractor: EXTRACTOR, emb: EM };

  for (const [label, chunks] of [["unpdf", unpdfChunks], ["gemini-lite", geminiChunks]] as const) {
    console.log(`\n--- ${label} (${chunks.length} chunks) ---`);
    const texts = chunks.map((c: any) => (c.section ? `Section: ${c.section}\n\n` : "") + c.text.slice(0, 3000));
    const chunkVecs = await embedBatch(EM, texts);
    const qVecs = await embedBatch(EM, appleQ.map(q => q.q));

    // For each query we grade: did top-K include a chunk whose content matches the gold answer?
    // Since chunks are different per extraction, use keyword overlap with gold_answer as proxy.
    const scored: any[] = [];
    for (let i = 0; i < appleQ.length; i++) {
      const q = appleQ[i];
      const top = topK(qVecs[i], chunkVecs, 5);
      const goldTokens = new Set(q.gold_answer.toLowerCase().match(/[a-z0-9.$]+/g) || []);
      const containsAnswer = top.map(idx => {
        const t = chunks[idx].text.toLowerCase();
        let hits = 0;
        for (const tok of goldTokens) if (tok.length > 2 && t.includes(tok)) hits++;
        return hits / goldTokens.size;
      });
      const bestOverlap = Math.max(...containsAnswer);
      scored.push({
        q: q.q.slice(0, 80),
        gold: q.gold_answer.slice(0, 80),
        topIds: top.map(i => chunks[i].id),
        best_token_overlap_at_5: bestOverlap,
      });
    }
    const avgOverlap = scored.reduce((a, c) => a + c.best_token_overlap_at_5, 0) / scored.length;
    console.log(`  avg token-overlap@5: ${avgOverlap.toFixed(3)}`);
    results[label] = { avgOverlap, scored };
  }

  writeJson("./results/extraction-impact.json", results);
  console.log("\nDone. Written to ./results/extraction-impact.json");
}
run().catch(e => { console.error(e); process.exit(1); });
