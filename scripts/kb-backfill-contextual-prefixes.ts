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

    const allEmpty = prefixes.every((p) => !p || !p.trim());
    const anyNeedPrefix = chunks.some((c) => !c.contextual_prefix || !c.contextual_prefix.trim());
    if (allEmpty && anyNeedPrefix) {
      console.warn(`[backfill] ${doc.id}: CR returned all empty — likely transient LLM failure. Will retry on next run.`);
    }

    const pairs = chunks.map((c, i) => {
      const newPrefix = (prefixes[i] || "").trim();
      const existingPrefix = (c.contextual_prefix || "").trim();
      // Prefer freshly-generated prefix; fall back to existing to avoid wiping on CR failure.
      const effectivePrefix = newPrefix || existingPrefix;
      return { id: c.id, content: c.content, prefix: effectivePrefix, metadata: c.metadata };
    });

    const needsUpdate = pairs.map((p, i) => {
      const existing = (chunks[i].contextual_prefix || "").trim();
      return p.prefix !== existing;  // only touch chunks whose prefix actually changes
    });
    const changedPairs = pairs.filter((_, i) => needsUpdate[i]);
    if (changedPairs.length === 0) {
      console.log(`[backfill] ${doc.id}: no changes (all prefixes already match)`);
      continue;
    }

    const toEmbed = changedPairs.map((p) =>
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
    for (let i = 0; i < changedPairs.length; i++) {
      const p = changedPairs[i];
      await surreal.query(
        "UPDATE document_chunk SET contextual_prefix = $prefix, embedding = $embedding WHERE id = $id",
        { id: p.id, prefix: p.prefix || null, embedding: embeddings[i] }
      );
    }
    totalChunks += changedPairs.length;
    totalEnriched += changedPairs.filter((p) => p.prefix).length;
    console.log(`[backfill] ${doc.id}: ${changedPairs.length}/${pairs.length} chunks updated, ${changedPairs.filter((p) => p.prefix).length} prefixed`);
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`[backfill] done. docs: ${docs.length}, chunks updated: ${totalChunks}, prefixed: ${totalEnriched}, skipped: ${skippedDocs}`);
  process.exit(0);
}

main().catch((err) => { console.error("[backfill] failed:", err); process.exit(1); });
