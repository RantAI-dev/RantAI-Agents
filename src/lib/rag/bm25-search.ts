import { getSurrealClient } from "../surrealdb";

export interface Bm25Result {
  id: string;
  documentId: string;
  content: string;
  score: number;
}

type Row = { id: string; document_id: string; content: string; score: number };

/**
 * BM25 full-text search over document_chunk.content via SurrealDB SEARCH index.
 * Relies on the `content_search_idx` index + `kb_en` analyzer defined in
 * src/lib/surrealdb/schema.surql (Phase 7 additions).
 */
export async function bm25Search(query: string, limit: number): Promise<Bm25Result[]> {
  if (!query.trim()) return [];
  const surreal = await getSurrealClient();
  // `limit` is interpolated (not $-bound) after number-sanitization — SurrealDB's
  // LIMIT clause binds inconsistently across versions, and Math.max/floor prevents
  // anything non-numeric from reaching the query string.
  const safeLimit = Math.max(1, Math.floor(limit));
  const sql = `
    SELECT id, document_id, content, search::score(0) AS score
    FROM document_chunk
    WHERE content @@ $q
    ORDER BY score DESC, id ASC
    LIMIT ${safeLimit};
  `;
  let res;
  try {
    res = await surreal.query<Row>(sql, { q: query });
  } catch (err) {
    throw new Error(`[bm25Search] SurrealDB query failed: ${(err as Error).message}`);
  }
  const rows = res?.[0]?.result ?? [];
  return rows.slice(0, safeLimit).map((r) => ({
    id: r.id,
    documentId: r.document_id,
    content: r.content,
    score: r.score,
  }));
}
