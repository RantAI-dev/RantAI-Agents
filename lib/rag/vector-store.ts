import { prisma } from "@/lib/prisma";
import { getSurrealClient } from "@/lib/surrealdb";
import { generateEmbedding, generateEmbeddings } from "./embeddings";
import { Chunk, prepareChunkForEmbedding } from "./chunker";

/**
 * Vector store operations using SurrealDB for vector storage
 * and PostgreSQL (Prisma) for document metadata
 */

export interface SearchResult {
  id: string;
  content: string;
  documentId: string;
  documentTitle: string;
  categories: string[];
  subcategory: string | null;
  section: string | null;
  similarity: number;
}

interface SurrealChunk {
  id: string;
  document_id: string;
  content: string;
  chunk_index: number;
  metadata: Record<string, unknown> | null;
  similarity: number;
}

/**
 * Store a document and its chunks with embeddings in the database
 * - Document metadata stored in PostgreSQL (Prisma)
 * - Chunks with embeddings stored in SurrealDB
 */
export async function storeDocument(
  title: string,
  content: string,
  categories: string[],
  subcategory: string | null,
  chunks: Chunk[],
  groupIds?: string[]
): Promise<string> {
  // Create the document in PostgreSQL with optional group associations
  const document = await prisma.document.create({
    data: {
      title,
      content,
      categories,
      subcategory,
      groups:
        groupIds && groupIds.length > 0
          ? {
              create: groupIds.map((groupId) => ({
                groupId,
              })),
            }
          : undefined,
    },
  });

  // Generate embeddings for all chunks in batch
  const textsForEmbedding = chunks.map(prepareChunkForEmbedding);
  const embeddings = await generateEmbeddings(textsForEmbedding);

  // Store chunks with embeddings in SurrealDB
  const surrealClient = await getSurrealClient();

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const embedding = embeddings[i];
    const chunkId = `${document.id}_${i}`;

    await surrealClient.query(
      `CREATE document_chunk SET
        id = $id,
        document_id = $document_id,
        content = $content,
        chunk_index = $chunk_index,
        embedding = $embedding,
        metadata = $metadata,
        created_at = time::now()`,
      {
        id: chunkId,
        document_id: document.id,
        content: chunk.content,
        chunk_index: chunk.metadata.chunkIndex,
        embedding: embedding,
        metadata: chunk.metadata,
      }
    );
  }

  console.log(
    `[VectorStore] Stored document "${title}" with ${chunks.length} chunks`
  );

  return document.id;
}

/**
 * Search for similar chunks using cosine similarity in SurrealDB
 */
export async function searchSimilar(
  query: string,
  limit: number = 5,
  categoryFilter?: string,
  groupIds?: string[]
): Promise<SearchResult[]> {
  // Generate embedding for the query
  const queryEmbedding = await generateEmbedding(query);

  // Get SurrealDB client
  const surrealClient = await getSurrealClient();

  // First, get document IDs that match the filters (if any)
  let documentIds: string[] | null = null;

  if (categoryFilter || (groupIds && groupIds.length > 0)) {
    // Build Prisma query to filter documents
    const whereClause: {
      categories?: { has: string };
      groups?: { some: { groupId: { in: string[] } } };
    } = {};

    if (categoryFilter) {
      whereClause.categories = { has: categoryFilter };
    }

    if (groupIds && groupIds.length > 0) {
      whereClause.groups = {
        some: {
          groupId: { in: groupIds },
        },
      };
    }

    const filteredDocs = await prisma.document.findMany({
      where: whereClause,
      select: { id: true },
    });

    documentIds = filteredDocs.map((d) => d.id);

    // If no documents match the filter, return empty results
    if (documentIds.length === 0) {
      return [];
    }
  }

  // Build SurrealDB vector search query
  let sql: string;
  const vars: Record<string, unknown> = {
    embedding: queryEmbedding,
    limit: limit,
  };

  if (documentIds) {
    sql = `
      SELECT
        id,
        document_id,
        content,
        metadata,
        vector::similarity::cosine(embedding, $embedding) AS similarity
      FROM document_chunk
      WHERE document_id IN $document_ids
      ORDER BY similarity DESC
      LIMIT $limit
    `;
    vars.document_ids = documentIds;
  } else {
    sql = `
      SELECT
        id,
        document_id,
        content,
        metadata,
        vector::similarity::cosine(embedding, $embedding) AS similarity
      FROM document_chunk
      ORDER BY similarity DESC
      LIMIT $limit
    `;
  }

  const surrealResults = await surrealClient.query<SurrealChunk>(sql, vars);
  const chunks = surrealResults[0]?.result || [];

  if (chunks.length === 0) {
    return [];
  }

  // Get unique document IDs from results
  const resultDocIds = [...new Set(chunks.map((c) => c.document_id))];

  // Fetch document metadata from PostgreSQL
  const documents = await prisma.document.findMany({
    where: { id: { in: resultDocIds } },
    select: {
      id: true,
      title: true,
      categories: true,
      subcategory: true,
    },
  });

  // Create a map for quick lookup
  const docMap = new Map(documents.map((d) => [d.id, d]));

  // Join chunk results with document metadata
  const results: SearchResult[] = chunks.map((chunk) => {
    const doc = docMap.get(chunk.document_id);
    return {
      id: chunk.id,
      content: chunk.content,
      documentId: chunk.document_id,
      documentTitle: doc?.title || "Unknown",
      categories: doc?.categories || [],
      subcategory: doc?.subcategory || null,
      section: (chunk.metadata as { section?: string } | null)?.section || null,
      similarity: chunk.similarity,
    };
  });

  return results;
}

/**
 * Search with a minimum similarity threshold
 */
export async function searchWithThreshold(
  query: string,
  minSimilarity: number = 0.5,
  limit: number = 10,
  categoryFilter?: string,
  groupIds?: string[]
): Promise<SearchResult[]> {
  const results = await searchSimilar(query, limit, categoryFilter, groupIds);

  // Filter by minimum similarity
  return results.filter((result) => result.similarity >= minSimilarity);
}

/**
 * Delete a document and all its chunks
 * - Deletes document from PostgreSQL (cascades to DocumentGroup)
 * - Deletes chunks from SurrealDB
 */
export async function deleteDocument(documentId: string): Promise<void> {
  // Delete chunks from SurrealDB
  const surrealClient = await getSurrealClient();
  await surrealClient.query(
    `DELETE document_chunk WHERE document_id = $document_id`,
    { document_id: documentId }
  );

  // Delete document from PostgreSQL (cascades to groups)
  await prisma.document.delete({
    where: { id: documentId },
  });

  console.log(`[VectorStore] Deleted document ${documentId} and its chunks`);
}

/**
 * Get all documents (without embeddings)
 */
export async function listDocuments() {
  // Get documents from PostgreSQL
  const documents = await prisma.document.findMany({
    select: {
      id: true,
      title: true,
      categories: true,
      subcategory: true,
      createdAt: true,
    },
  });

  // Get chunk counts from SurrealDB
  const surrealClient = await getSurrealClient();

  const docsWithCounts = await Promise.all(
    documents.map(async (doc) => {
      const countResult = await surrealClient.query<{ count: number }>(
        `SELECT count() as count FROM document_chunk WHERE document_id = $document_id GROUP ALL`,
        { document_id: doc.id }
      );
      const count = countResult[0]?.result?.[0]?.count || 0;

      return {
        ...doc,
        _count: {
          chunks: count,
        },
      };
    })
  );

  return docsWithCounts;
}

/**
 * Clear all documents and chunks (useful for re-ingestion)
 */
export async function clearAllDocuments(): Promise<void> {
  // Clear chunks from SurrealDB
  const surrealClient = await getSurrealClient();
  await surrealClient.query(`DELETE document_chunk`);

  // Clear documents from PostgreSQL (cascades to groups)
  await prisma.document.deleteMany();

  console.log("[VectorStore] Cleared all documents and chunks");
}

/**
 * Get chunk count for a specific document
 */
export async function getDocumentChunkCount(documentId: string): Promise<number> {
  const surrealClient = await getSurrealClient();
  const result = await surrealClient.query<{ count: number }>(
    `SELECT count() as count FROM document_chunk WHERE document_id = $document_id GROUP ALL`,
    { document_id: documentId }
  );
  return result[0]?.result?.[0]?.count || 0;
}

/**
 * Store chunks for an existing document (used by knowledge API)
 */
export async function storeChunks(
  documentId: string,
  chunks: Chunk[],
  embeddings: number[][]
): Promise<void> {
  const surrealClient = await getSurrealClient();

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const embedding = embeddings[i];
    const chunkId = `${documentId}_${i}`;

    await surrealClient.query(
      `CREATE document_chunk SET
        id = $id,
        document_id = $document_id,
        content = $content,
        chunk_index = $chunk_index,
        embedding = $embedding,
        metadata = $metadata,
        created_at = time::now()`,
      {
        id: chunkId,
        document_id: documentId,
        content: chunk.content,
        chunk_index: chunk.metadata.chunkIndex,
        embedding: embedding,
        metadata: chunk.metadata,
      }
    );
  }

  console.log(
    `[VectorStore] Stored ${chunks.length} chunks for document ${documentId}`
  );
}
