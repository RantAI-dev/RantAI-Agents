import { getSurrealClient } from "../surrealdb";

export interface Bm25Result {
  id: string;
  documentId: string;
  content: string;
  score: number;
}

/**
 * BM25 full-text search over document_chunk.content via SurrealDB SEARCH index.
 * Relies on the `content_search_idx` index + `kb_en` analyzer defined in
 * src/lib/surrealdb/schema.surql (Phase 7 additions).
 */
export async function bm25Search(query: string, limit: number): Promise<Bm25Result[]> {
  if (!query.trim()) return [];
  const surreal = await getSurrealClient();
  const sql = `
    SELECT id, document_id, content, search::score(0) AS score
    FROM document_chunk
    WHERE content @@ $q
    ORDER BY score DESC
    LIMIT ${Math.max(1, Math.floor(limit))};
  `;
  const res = await surreal.query<[Array<{ id: string; document_id: string; content: string; score: number }>]>(
    sql,
    { q: query }
  );
  const rows = res?.[0] ?? [];
  return rows.slice(0, limit).map((r) => ({
    id: r.id,
    documentId: r.document_id,
    content: r.content,
    score: r.score,
  }));
}
