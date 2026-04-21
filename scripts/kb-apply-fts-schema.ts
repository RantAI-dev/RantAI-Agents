// Applies the Phase 7 schema additions: FTS analyzer, SEARCH index, contextual_prefix field.
// Idempotent — uses IF NOT EXISTS. Safe to re-run.
//
// Usage: bun run kb:apply-fts-schema
import { getSurrealClient } from "@/lib/surrealdb";

const STATEMENTS = [
  `DEFINE ANALYZER IF NOT EXISTS kb_en TOKENIZERS class FILTERS lowercase, snowball(english);`,
  `DEFINE INDEX IF NOT EXISTS content_search_idx ON document_chunk FIELDS content SEARCH ANALYZER kb_en BM25(1.2, 0.75) HIGHLIGHTS;`,
  `DEFINE FIELD IF NOT EXISTS contextual_prefix ON document_chunk TYPE option<string>;`,
];

async function main() {
  const surreal = await getSurrealClient();
  for (const sql of STATEMENTS) {
    console.log(`[fts-schema] ${sql.slice(0, 80)}...`);
    await surreal.query(sql);
  }
  console.log("[fts-schema] done");
  process.exit(0);
}

main().catch((err) => {
  console.error("[fts-schema] failed:", err);
  process.exit(1);
});
