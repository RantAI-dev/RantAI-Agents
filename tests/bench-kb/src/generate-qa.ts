// Use Gemini 3.1 Pro as Q/A generator. Reads corpus-unpdf.json; samples chunks;
// generates (question, answer, chunk-ids) triples. Stores to qa.json.
import { chat, readJson, writeJson, sleep } from "./lib";

type Chunk = { id: string; doc: string; idx: number; text: string; section: string | null; type: string };
type DocCorpus = { doc: string; lang: string; note: string; chunks: Chunk[] };

const PLAN: Record<string, number> = {
  attention: 8,      // transformer paper
  apple10k: 5,       // financial (short excerpt)
  "mdn-fetch": 6,    // MDN docs
  "w3c-webauthn": 8, // spec
  "rds-proposal": 8, // Bahasa proposal
};

const QA_PROMPT = `You are generating evaluation questions for a RAG benchmark.
You are given chunks from a single document. Generate {N} diverse questions that a real user would ask, spanning:
- specific factual lookups (names, numbers, definitions)
- synthesis across 2+ chunks
- technical "how does X work"
- one "what does the document NOT contain" question only if natural

For each question output JSON:
{
  "q": "the question",
  "expected_chunk_ids": ["chunk_id_1", "chunk_id_2"],   // the chunk(s) that contain the answer; use the id field verbatim
  "gold_answer": "a short (1-3 sentence) gold answer that grading can verify against",
  "difficulty": "easy|medium|hard"
}

Return ONLY a JSON array. No prose, no markdown fences.

Document id: {DOC_ID}
Document note: {NOTE}
Language: {LANG}

CHUNKS (id|section|text):
{CHUNKS_BLOCK}`;

async function run() {
  const corpus: DocCorpus[] = readJson("./results/corpus-unpdf.json");
  const allQA: any[] = [];

  for (const doc of corpus) {
    const n = PLAN[doc.doc] ?? 5;
    // For large docs, sample chunks evenly instead of using all
    const maxChunks = 60;
    let sample = doc.chunks;
    if (doc.chunks.length > maxChunks) {
      const step = Math.floor(doc.chunks.length / maxChunks);
      sample = doc.chunks.filter((_, i) => i % step === 0).slice(0, maxChunks);
    }

    const chunksBlock = sample.map(c => `[${c.id}|${c.section ?? ""}] ${c.text.slice(0, 400).replace(/\n/g, " ")}`).join("\n\n");
    const prompt = QA_PROMPT
      .replace("{N}", String(n))
      .replace("{DOC_ID}", doc.doc)
      .replace("{NOTE}", doc.note)
      .replace("{LANG}", doc.lang)
      .replace("{CHUNKS_BLOCK}", chunksBlock);

    console.log(`generating Q/A for ${doc.doc}... (${sample.length} chunks as context)`);
    const out = await chat("google/gemini-3.1-pro-preview", [{ role: "user", content: prompt }], 6000);
    let parsed: any[] = [];
    try {
      let t = out.text.trim();
      t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      parsed = JSON.parse(t);
    } catch (e) {
      console.warn(`  parse failed, retrying once`);
      await sleep(1000);
      const retry = await chat("google/gemini-3.1-pro-preview", [{ role: "user", content: prompt + "\n\nOutput strictly valid JSON array, nothing else." }], 6000);
      try { parsed = JSON.parse(retry.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")); } catch {
        console.error(`  retry also failed, skipping ${doc.doc}`);
        continue;
      }
    }
    for (const q of parsed) {
      allQA.push({ ...q, doc: doc.doc, lang: doc.lang });
    }
    console.log(`  → ${parsed.length} Q/A added`);
    await sleep(500);
  }
  writeJson("./results/qa.json", allQA);
  console.log(`\nTotal Q/A: ${allQA.length}`);
}
run().catch(e => { console.error(e); process.exit(1); });
