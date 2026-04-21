// scripts/kb-backfill-contextual-prefixes.ts
// One-shot: for every document in Postgres, group its SurrealDB chunks,
// call generateContextualPrefixes (one batched LLM call per doc), and
// UPDATE each chunk's contextual_prefix + re-embed it with the new prefix.
//
// Idempotent — skips docs whose chunks already have contextual_prefix set.
// Safe to re-run after incremental ingests.
//
// Usage: KB_CONTEXTUAL_RETRIEVAL_ENABLED=true bun run kb:backfill-contextual

import { prisma } from "@/lib/prisma";
import { getSurrealClient } from "@/lib/surrealdb";
import { generateContextualPrefixes } from "@/lib/rag/contextual-retrieval";
import { generateEmbeddings } from "@/lib/rag/embeddings";
import { prepareChunkForEmbedding } from "@/lib/rag/chunker";
import { getRagConfig } from "@/lib/rag/config";

async function main() {
  const cfg = getRagConfig();
  if (!cfg.contextualRetrievalEnabled) {
    console.error("[backfill] KB_CONTEXTUAL_RETRIEVAL_ENABLED must be 'true' to run this script");
    process.exit(1);
  }

  const surreal = await getSurrealClient();

  const docs = await prisma.document.findMany({
    select: { id: true, title: true, content: true, categories: true, subcategory: true },
    orderBy: { createdAt: "asc" },
  });
  console.log(`[backfill] ${docs.length} documents in PG`);

  let totalChunks = 0, totalEnriched = 0, skippedDocs = 0;

  for (const doc of docs) {
    const chunkRes = await surreal.query<{ id: string; content: string; contextual_prefix: string | null; metadata: any }>(
      "SELECT id, content, contextual_prefix, metadata FROM document_chunk WHERE document_id = $doc_id ORDER BY chunk_index",
      { doc_id: doc.id }
    );
    const chunks = chunkRes[0]?.result ?? [];
    if (chunks.length === 0) continue;

    const alreadyDone = chunks.every((c) => c.contextual_prefix && c.contextual_prefix.trim());
    if (alreadyDone) { skippedDocs++; continue; }

    const prefixes = await generateContextualPrefixes(doc.content, chunks.map((c) => c.content));
    const pairs = chunks.map((c, i) => ({ id: c.id, content: c.content, prefix: prefixes[i] || "", metadata: c.metadata }));
    const toEmbed = pairs.map((p) =>
      prepareChunkForEmbedding({
        content: p.content,
        metadata: {
          documentTitle: doc.title,
          category: doc.categories[0] ?? "GENERAL",
          subcategory: doc.subcategory ?? undefined,
          section: p.metadata?.section,
          chunkIndex: p.metadata?.chunkIndex ?? 0,
          contextualPrefix: p.prefix || undefined,
        },
      })
    );
    const embeddings = await generateEmbeddings(toEmbed);
    for (let i = 0; i < pairs.length; i++) {
      const p = pairs[i];
      await surreal.query(
        "UPDATE document_chunk SET contextual_prefix = $prefix, embedding = $embedding WHERE id = $id",
        { id: p.id, prefix: p.prefix || null, embedding: embeddings[i] }
      );
    }
    totalChunks += pairs.length;
    totalEnriched += pairs.filter((p) => p.prefix).length;
    console.log(`[backfill] ${doc.id}: ${pairs.length} chunks, ${pairs.filter((p) => p.prefix).length} prefixed`);
  }

  console.log(`[backfill] done. docs: ${docs.length}, chunks updated: ${totalChunks}, prefixed: ${totalEnriched}, skipped: ${skippedDocs}`);
  process.exit(0);
}

main().catch((err) => { console.error("[backfill] failed:", err); process.exit(1); });
