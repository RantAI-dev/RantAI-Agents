import { kb } from "@/lib/kb-runtime/runtime";
import { extractIdentifierTokens } from "./identifier-extraction";

export interface Bm25Result {
  id: string;
  documentId: string;
  content: string;
  score: number;
  metadata?: unknown;
  chunkIndex?: number | null;
  matchedIdentifiers?: string[];
}

export interface Bm25SearchOptions {
  exactPhrases?: string[];
  exactMatchBoost?: number;
}

interface SurrealBm25Row {
  id: string;
  document_id: string;
  content: string;
  score?: number;
  metadata?: unknown;
  chunk_index?: number | null;
}

/**
 * Perform BM25 full-text keyword search across chunk contents in SurrealDB.
 * When identifier-like codes are present in the query (e.g. ING-P20-6120),
 * searches them as exact phrases and merges them with an exact-match boost (TC-994).
 *
 * Scoped strictly to the provided documentIds to prevent cross-tenant document leaks.
 * If documentIds is empty, returns [] immediately without querying SurrealDB.
 */
export async function bm25Search(
  query: string,
  limit: number,
  documentIds: string[],
  options?: Bm25SearchOptions
): Promise<Bm25Result[]> {
  if (!query.trim() || !documentIds || documentIds.length === 0) return [];

  const surreal = kb("vectors");
  const safeLimit = Math.max(1, Math.floor(limit));
  const boost = options?.exactMatchBoost ?? 10.0;

  // Determine exact phrases to search.
  // If not explicitly provided, extract identifier tokens from the query.
  // If the query is just a single identifier code, the primary BM25 search
  // targets it directly, so secondary contains is skipped.
  const trimmedLower = query.trim().toLowerCase();
  const extracted = extractIdentifierTokens(query);
  const exactPhrases = options?.exactPhrases ?? (
    extracted.length === 1 && extracted[0].toLowerCase() === trimmedLower
      ? []
      : extracted
  );

  const mainSql = `
    SELECT id, document_id, content, metadata, chunk_index, search::score(0) AS score
    FROM document_chunk
    WHERE content @@ $q
      AND document_id IN $document_ids
    ORDER BY score DESC, id ASC
    LIMIT ${safeLimit};
  `;

  try {
    const mainPromise = surreal.query<SurrealBm25Row>(mainSql, {
      q: query,
      document_ids: documentIds,
    });

    // Run exact phrase contains queries for each identifier code in parallel
    const exactPromises = exactPhrases.map((phrase) => {
      const exactSql = `
        SELECT id, document_id, content, metadata, chunk_index
        FROM document_chunk
        WHERE string::contains(string::lowercase(content), $exact)
          AND document_id IN $document_ids
        LIMIT ${safeLimit};
      `;
      return surreal
        .query<SurrealBm25Row>(exactSql, {
          exact: phrase.toLowerCase(),
          document_ids: documentIds,
        })
        .then((res) => ({ phrase, rows: res[0]?.result || [] }))
        .catch(() => ({ phrase, rows: [] as SurrealBm25Row[] }));
    });

    const [mainRaw, exactResults] = await Promise.all([
      mainPromise,
      Promise.all(exactPromises),
    ]);

    const mainRows = mainRaw[0]?.result || [];
    const resultMap = new Map<string, Bm25Result>();

    // 1. Ingest main BM25 rows
    for (const r of mainRows) {
      resultMap.set(r.id, {
        id: r.id,
        documentId: r.document_id,
        content: r.content,
        score: r.score ?? 0,
        metadata: r.metadata,
        chunkIndex: r.chunk_index ?? null,
      });
    }

    // 2. Ingest / boost exact phrase matches
    for (const { phrase, rows } of exactResults) {
      for (const r of rows) {
        const existing = resultMap.get(r.id);
        if (existing) {
          existing.score += boost;
          if (!existing.matchedIdentifiers) {
            existing.matchedIdentifiers = [];
          }
          if (!existing.matchedIdentifiers.includes(phrase)) {
            existing.matchedIdentifiers.push(phrase);
          }
        } else {
          resultMap.set(r.id, {
            id: r.id,
            documentId: r.document_id,
            content: r.content,
            score: boost,
            metadata: r.metadata,
            chunkIndex: r.chunk_index ?? null,
            matchedIdentifiers: [phrase],
          });
        }
      }
    }

    // Sort by score DESC, then id ASC
    const sorted = Array.from(resultMap.values()).sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.id.localeCompare(b.id);
    });

    return sorted.slice(0, safeLimit).map((item) => {
      const res: Bm25Result = {
        id: item.id,
        documentId: item.documentId,
        content: item.content,
        score: item.score,
      };
      if (item.metadata !== undefined) res.metadata = item.metadata;
      if (item.chunkIndex !== undefined && item.chunkIndex !== null) res.chunkIndex = item.chunkIndex;
      if (item.matchedIdentifiers && item.matchedIdentifiers.length > 0) {
        res.matchedIdentifiers = item.matchedIdentifiers;
      }
      return res;
    });
  } catch (err) {
    throw new Error(`[bm25Search] SurrealDB query failed: ${(err as Error).message}`);
  }
}
