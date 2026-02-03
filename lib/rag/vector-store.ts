import { prisma } from "@/lib/prisma";
import { generateEmbedding, generateEmbeddings } from "./embeddings";
import { Chunk, prepareChunkForEmbedding } from "./chunker";

/**
 * Vector store operations using PostgreSQL with pgvector
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

/**
 * Store a document and its chunks with embeddings in the database
 */
export async function storeDocument(
  title: string,
  content: string,
  categories: string[],
  subcategory: string | null,
  chunks: Chunk[],
  groupIds?: string[]
): Promise<string> {
  // Create the document with optional group associations
  const document = await prisma.document.create({
    data: {
      title,
      content,
      categories,
      subcategory,
      groups: groupIds && groupIds.length > 0 ? {
        create: groupIds.map((groupId) => ({
          groupId,
        })),
      } : undefined,
    },
  });

  // Generate embeddings for all chunks in batch
  const textsForEmbedding = chunks.map(prepareChunkForEmbedding);
  const embeddings = await generateEmbeddings(textsForEmbedding);

  // Store chunks with embeddings using raw SQL (Prisma doesn't fully support vector type)
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const embedding = embeddings[i];

    // Format embedding as PostgreSQL vector literal
    const embeddingStr = `[${embedding.join(",")}]`;

    await prisma.$executeRawUnsafe(
      `INSERT INTO "DocumentChunk" (id, "documentId", content, "chunkIndex", embedding, metadata, "createdAt")
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4::vector, $5::jsonb, NOW())`,
      document.id,
      chunk.content,
      chunk.metadata.chunkIndex,
      embeddingStr,
      JSON.stringify(chunk.metadata)
    );
  }

  console.log(
    `Stored document "${title}" with ${chunks.length} chunks and embeddings`
  );

  return document.id;
}

/**
 * Search for similar chunks using cosine similarity
 */
export async function searchSimilar(
  query: string,
  limit: number = 5,
  categoryFilter?: string,
  groupIds?: string[]
): Promise<SearchResult[]> {
  // Generate embedding for the query
  const queryEmbedding = await generateEmbedding(query);
  const embeddingStr = `[${queryEmbedding.join(",")}]`;

  // Build the SQL query with optional category and group filters
  let sql = `
    SELECT DISTINCT ON (dc.id)
      dc.id,
      dc.content,
      dc."documentId",
      d.title as "documentTitle",
      d.categories,
      d.subcategory,
      dc.metadata->>'section' as section,
      1 - (dc.embedding <=> $1::vector) as similarity,
      dc.embedding <=> $1::vector as distance
    FROM "DocumentChunk" dc
    JOIN "Document" d ON dc."documentId" = d.id
  `;

  const params: any[] = [embeddingStr];
  let paramIndex = 2;

  // Join with DocumentGroup if filtering by groups
  if (groupIds && groupIds.length > 0) {
    sql += `
    JOIN "DocumentGroup" dg ON d.id = dg."documentId"
    `;
  }

  sql += `
    WHERE dc.embedding IS NOT NULL
  `;

  // Filter by category (check if category is in the categories array)
  if (categoryFilter) {
    sql += ` AND $${paramIndex} = ANY(d.categories)`;
    params.push(categoryFilter);
    paramIndex++;
  }

  // Filter by group IDs if provided
  if (groupIds && groupIds.length > 0) {
    const placeholders = groupIds.map((_, i) => `$${paramIndex + i}`).join(", ");
    sql += ` AND dg."groupId" IN (${placeholders})`;
    params.push(...groupIds);
    paramIndex += groupIds.length;
  }

  sql += `
    ORDER BY dc.id, distance
    LIMIT $${paramIndex}
  `;
  params.push(limit);

  // Wrap in a subquery to order by similarity
  const wrappedSql = `
    SELECT id, content, "documentId", "documentTitle", categories, subcategory, section, similarity
    FROM (${sql}) sub
    ORDER BY similarity DESC
  `;

  const results = await prisma.$queryRawUnsafe<SearchResult[]>(wrappedSql, ...params);

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
 */
export async function deleteDocument(documentId: string): Promise<void> {
  await prisma.document.delete({
    where: { id: documentId },
  });
}

/**
 * Get all documents (without embeddings)
 */
export async function listDocuments() {
  return prisma.document.findMany({
    select: {
      id: true,
      title: true,
      categories: true,
      subcategory: true,
      createdAt: true,
      _count: {
        select: { chunks: true },
      },
    },
  });
}

/**
 * Clear all documents and chunks (useful for re-ingestion)
 */
export async function clearAllDocuments(): Promise<void> {
  await prisma.documentChunk.deleteMany();
  await prisma.document.deleteMany();
  console.log("Cleared all documents and chunks from the database");
}
