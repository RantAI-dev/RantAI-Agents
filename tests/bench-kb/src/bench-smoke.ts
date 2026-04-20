// CI-runnable smoke bench. Uses the existing corpus-unpdf.json + first 10 Q/A.
// Enforces hit@1 >= 0.85 and recall@5 >= 0.95 using the currently-configured
// KB_EMBEDDING_MODEL. Exits non-zero on regression.
//
// Runtime: ~30-90s + ~$0.05 per run (dominated by the single batched embed call).
import { embed, cosine, readJson } from "./lib";

const THRESHOLDS = {
  hit_at_1: 0.85,
  recall_at_5: 0.95,
};
const SUBSET_SIZE = 10;

async function run() {
  const corpus = readJson<any[]>("./results/corpus-unpdf.json");
  const qa = readJson<any[]>("./results/qa.json").slice(0, SUBSET_SIZE);
  const allChunks = corpus.flatMap((d) => d.chunks);
  const idxMap: Record<string, number> = {};
  allChunks.forEach((c, i) => {
    idxMap[c.id] = i;
  });

  const model = process.env.KB_EMBEDDING_MODEL ?? "qwen/qwen3-embedding-8b";
  const chunkTexts = allChunks.map(
    (c: any) =>
      (c.section ? `Section: ${c.section}\n\n` : "") + c.text.slice(0, 3000)
  );
  console.log(`smoke: model=${model}, chunks=${allChunks.length}, queries=${qa.length}`);

  // Embed in one batched call each (chunks then queries) for speed + cost.
  const chunkRes = await embed(model, chunkTexts);
  const queryRes = await embed(model, qa.map((q) => q.q));

  let h1 = 0,
    r5 = 0;
  for (let i = 0; i < qa.length; i++) {
    const q = qa[i];
    const expected = q.expected_chunk_ids
      .map((id: string) => idxMap[id])
      .filter((x: number | undefined) => x !== undefined);
    const scored = chunkRes.vectors.map((v, idx) => ({
      idx,
      s: cosine(queryRes.vectors[i], v),
    }));
    scored.sort((a, b) => b.s - a.s);
    const top = scored.slice(0, 5).map((x) => x.idx);
    if (expected.includes(top[0])) h1++;
    if (expected.some((e: number) => top.includes(e))) r5++;
  }

  const hit_at_1 = h1 / qa.length;
  const recall_at_5 = r5 / qa.length;
  console.log(`hit@1=${hit_at_1.toFixed(3)} r@5=${recall_at_5.toFixed(3)}`);

  let failed = false;
  if (hit_at_1 < THRESHOLDS.hit_at_1) {
    console.error(`FAIL: hit@1 ${hit_at_1} < threshold ${THRESHOLDS.hit_at_1}`);
    failed = true;
  }
  if (recall_at_5 < THRESHOLDS.recall_at_5) {
    console.error(`FAIL: recall@5 ${recall_at_5} < threshold ${THRESHOLDS.recall_at_5}`);
    failed = true;
  }
  if (failed) {
    process.exit(1);
  }
  console.log("smoke bench PASS");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
