// One-shot: re-embed every document_chunk with the current KB_EMBEDDING_MODEL
// and re-define the MTREE index at the current KB_EMBEDDING_DIM.
//
// Steps, in order:
//   1. REMOVE INDEX embedding_idx (its dimension may not match the new model).
//   2. SELECT every row; batch-embed with generateEmbeddings; UPDATE.
//   3. DEFINE INDEX embedding_idx with the new dimension.
//
// Idempotent — safe to re-run. Progress logged every batch. Aborts cleanly on error.
//
// Usage: bun run kb:migrate
//
// BEFORE RUNNING: confirm SURREAL_DB_URL points at the DB you want to mutate.

import { getSurrealClient } from "@/lib/surrealdb";
import { generateEmbeddings } from "@/lib/rag/embeddings";
import { prepareChunkForEmbedding } from "@/lib/rag/chunker";
import { getRagConfig } from "@/lib/rag/config";

const BATCH = 32;

async function main() {
  const { embeddingModel, embeddingDim } = getRagConfig();
  console.log(`[migrate] target: ${embeddingModel} (dim ${embeddingDim})`);
  console.log(`[migrate] SURREAL_DB_URL=${process.env.SURREAL_DB_URL ?? "(unset)"}`);

  const surreal = await getSurrealClient();

  console.log("[migrate] removing old embedding_idx (dimension may mismatch)...");
  try {
    await surreal.query("REMOVE INDEX embedding_idx ON document_chunk;");
  } catch (err) {
    console.warn(`[migrate] REMOVE INDEX warning: ${(err as Error).message}`);
  }

  console.log("[migrate] scanning chunks...");
  const res = await surreal.query<[Array<{ id: string; content: string; metadata: unknown }>]>(
    "SELECT id, content, metadata FROM document_chunk ORDER BY id"
  );
  const chunks = (res[0] ?? []) as Array<{ id: string; content: string; metadata: any }>;
  console.log(`[migrate] ${chunks.length} chunks to re-embed`);
  if (chunks.length === 0) {
    console.log("[migrate] nothing to do; re-defining index only");
  }

  let done = 0;
  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH);
    const inputs = batch.map((c) =>
      prepareChunkForEmbedding({
        content: c.content,
        metadata: {
          documentTitle: c.metadata?.title ?? "",
          category: c.metadata?.category ?? "",
          subcategory: c.metadata?.subcategory,
          section: c.metadata?.section,
          chunkIndex: 0,
        },
      })
    );
    const vectors = await generateEmbeddings(inputs);
    for (let j = 0; j < batch.length; j++) {
      await surreal.query(
        "UPDATE document_chunk SET embedding = $embedding WHERE id = $id",
        { id: batch[j].id, embedding: vectors[j] }
      );
    }
    done += batch.length;
    console.log(`[migrate] ${done}/${chunks.length}`);
  }

  console.log(`[migrate] defining embedding_idx with dim ${embeddingDim}...`);
  await surreal.query(
    `DEFINE INDEX embedding_idx ON document_chunk FIELDS embedding MTREE DIMENSION ${embeddingDim} DIST COSINE;`
  );

  console.log("[migrate] done");
  process.exit(0);
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
