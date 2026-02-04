/**
 * Hybrid Search Service
 *
 * Combines vector similarity search with knowledge graph traversal
 * Uses Reciprocal Rank Fusion (RRF) to merge results from different sources
 *
 * Features:
 * - Vector similarity search using SurrealDB
 * - Knowledge graph traversal (following entity relations)
 * - Reciprocal Rank Fusion (RRF) for combining results
 * - Optional reranking for improved relevance
 */

import { getSurrealClient, SurrealDBClient } from "../surrealdb";
import { generateEmbedding } from "./embeddings";
import { Entity } from "../document-intelligence/types";

/**
 * Search configuration
 */
export interface HybridSearchConfig {
  /** Weight for vector similarity (0-1, default: 0.7) */
  vectorWeight?: number;
  /** Weight for entity/graph search (0-1, default: 0.3) */
  entityWeight?: number;
  /** Number of vector results to retrieve (default: 20) */
  vectorTopK?: number;
  /** Final number of results to return (default: 10) */
  finalTopK?: number;
  /** RRF constant (default: 60) */
  rrfK?: number;
  /** Enable entity-based search (default: true) */
  enableEntitySearch?: boolean;
  /** Enable graph traversal for related entities (default: true) */
  enableGraphTraversal?: boolean;
  /** Maximum graph traversal depth (default: 2) */
  graphDepth?: number;
  /** Filter by specific group IDs */
  groupIds?: string[];
  /** Filter by specific file IDs */
  fileIds?: string[];
  /** Filter by category */
  categoryFilter?: string;
  /** User ID for filtering */
  userId?: string;
}

/**
 * Chunk data from SurrealDB
 */
export interface ChunkResult {
  id: string;
  document_id: string;
  file_id?: string;
  content: string;
  chunk_index: number;
  metadata?: {
    title?: string;
    category?: string;
    section?: string;
  };
  similarity?: number;
}

/**
 * Hybrid search result
 */
export interface HybridSearchResult {
  /** Chunk ID */
  chunkId: string;
  /** Document ID */
  documentId: string;
  /** File ID */
  fileId?: string;
  /** Chunk content */
  content: string;
  /** Chunk index */
  chunkIndex: number;
  /** Document title */
  documentTitle?: string;
  /** Section name */
  section?: string;
  /** Category */
  category?: string;
  /** Vector similarity score (0-1) */
  vectorScore: number;
  /** Entity/Graph match score (0-1) */
  entityScore: number;
  /** Graph traversal score (0-1) */
  graphScore: number;
  /** Combined RRF score */
  combinedScore: number;
  /** Final ranking position */
  rank: number;
  /** Related entities found */
  relatedEntities: Entity[];
  /** Graph context (relation paths) */
  graphContext?: {
    relationType: string;
    pathLength: number;
  };
  /** Debug information */
  debug?: {
    vectorRank: number;
    entityRank: number;
    graphRank: number;
    rrfContribution: {
      vector: number;
      entity: number;
      graph: number;
    };
  };
}

/**
 * Search statistics
 */
export interface HybridSearchStats {
  /** Total processing time */
  totalTimeMs: number;
  /** Embedding generation time */
  embeddingTimeMs: number;
  /** Vector search time */
  vectorSearchTimeMs: number;
  /** Entity search time */
  entitySearchTimeMs: number;
  /** Graph search time */
  graphSearchTimeMs: number;
  /** Fusion time */
  fusionTimeMs: number;
  /** Number of vector results */
  vectorResults: number;
  /** Number of entity results */
  entityResults: number;
  /** Number of graph results */
  graphResults: number;
  /** Total combined results */
  totalResults: number;
}

const DEFAULT_CONFIG: Required<HybridSearchConfig> = {
  vectorWeight: 0.7,
  entityWeight: 0.15,
  vectorTopK: 20,
  finalTopK: 10,
  rrfK: 60,
  enableEntitySearch: true,
  enableGraphTraversal: true,
  graphDepth: 2,
  groupIds: [],
  fileIds: [],
  categoryFilter: "",
  userId: "",
};

/**
 * Hybrid Search class
 */
export class HybridSearch {
  private config: Required<HybridSearchConfig>;
  private dbClient: SurrealDBClient | null = null;

  constructor(config: HybridSearchConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize database client
   */
  private async getClient(): Promise<SurrealDBClient> {
    if (!this.dbClient) {
      this.dbClient = await getSurrealClient();
    }
    return this.dbClient;
  }

  /**
   * Perform hybrid search
   */
  async search(
    query: string,
    topK?: number
  ): Promise<{ results: HybridSearchResult[]; stats: HybridSearchStats }> {
    const startTime = Date.now();
    const finalTopK = topK || this.config.finalTopK;

    const stats: HybridSearchStats = {
      totalTimeMs: 0,
      embeddingTimeMs: 0,
      vectorSearchTimeMs: 0,
      entitySearchTimeMs: 0,
      graphSearchTimeMs: 0,
      fusionTimeMs: 0,
      vectorResults: 0,
      entityResults: 0,
      graphResults: 0,
      totalResults: 0,
    };

    // 1. Generate query embedding
    const embeddingStart = Date.now();
    const queryEmbedding = await generateEmbedding(query);
    stats.embeddingTimeMs = Date.now() - embeddingStart;

    // 2. Vector similarity search
    const vectorStart = Date.now();
    const vectorResults = await this.vectorSearch(queryEmbedding);
    stats.vectorResults = vectorResults.length;
    stats.vectorSearchTimeMs = Date.now() - vectorStart;

    // 3. Entity-based search (if enabled)
    let entityResults: Array<{ chunk: ChunkResult; score: number }> = [];
    if (this.config.enableEntitySearch && vectorResults.length > 0) {
      const entityStart = Date.now();
      entityResults = await this.entitySearch(query, vectorResults);
      stats.entityResults = entityResults.length;
      stats.entitySearchTimeMs = Date.now() - entityStart;
    }

    // 4. Knowledge Graph traversal search (if enabled)
    let graphResults: Array<{ chunk: ChunkResult; score: number; graphContext?: { relationType: string; pathLength: number } }> = [];
    if (this.config.enableGraphTraversal && vectorResults.length > 0) {
      const graphStart = Date.now();
      graphResults = await this.graphSearch(query, vectorResults);
      stats.graphResults = graphResults.length;
      stats.graphSearchTimeMs = Date.now() - graphStart;
    }

    // 5. Reciprocal Rank Fusion
    const fusionStart = Date.now();
    const fusedResults = this.reciprocalRankFusion(
      vectorResults,
      entityResults,
      graphResults,
      finalTopK
    );
    stats.fusionTimeMs = Date.now() - fusionStart;

    // 6. Enrich with related entities
    const enrichedResults = await this.enrichWithEntities(fusedResults);

    stats.totalResults = enrichedResults.length;
    stats.totalTimeMs = Date.now() - startTime;

    return { results: enrichedResults, stats };
  }

  /**
   * Vector similarity search using SurrealDB
   */
  private async vectorSearch(
    queryEmbedding: number[]
  ): Promise<Array<{ chunk: ChunkResult; score: number }>> {
    try {
      const client = await this.getClient();

      // Build WHERE conditions
      const conditions: string[] = [];
      const vars: Record<string, unknown> = {
        embedding: queryEmbedding,
        limit: this.config.vectorTopK,
      };

      if (this.config.userId) {
        conditions.push("user_id = $userId");
        vars.userId = this.config.userId;
      }

      if (this.config.fileIds.length > 0) {
        conditions.push("file_id IN $fileIds");
        vars.fileIds = this.config.fileIds;
      }

      const whereClause = conditions.length > 0 ? conditions.join(" AND ") : "true";

      const sql = `
        SELECT *, vector::similarity::cosine(embedding, $embedding) AS similarity
        FROM document_chunk
        WHERE ${whereClause}
        ORDER BY similarity DESC
        LIMIT $limit;
      `;

      const result = await client.query<ChunkResult & { similarity: number }>(
        sql,
        vars
      );

      const chunks = result[0]?.result || [];

      return chunks.map((chunk) => ({
        chunk: {
          id: chunk.id,
          document_id: chunk.document_id,
          file_id: chunk.file_id,
          content: chunk.content,
          chunk_index: chunk.chunk_index,
          metadata: chunk.metadata,
        },
        score: chunk.similarity || 0,
      }));
    } catch (error) {
      console.error("[HybridSearch] Vector search failed:", error);
      return [];
    }
  }

  /**
   * Entity-based search
   * Find chunks that share entities mentioned in the query or top vector results
   */
  private async entitySearch(
    query: string,
    vectorResults: Array<{ chunk: ChunkResult; score: number }>
  ): Promise<Array<{ chunk: ChunkResult; score: number }>> {
    try {
      const client = await this.getClient();

      // Get file IDs from top vector results
      const topFileIds = vectorResults
        .slice(0, 5)
        .map((r) => r.chunk.file_id || r.chunk.document_id)
        .filter((id, index, arr) => arr.indexOf(id) === index);

      if (topFileIds.length === 0) return [];

      // Find entities in these documents
      const entitySql = `
        SELECT *
        FROM entity
        WHERE document_id IN $fileIds OR file_id IN $fileIds
        ORDER BY confidence DESC
        LIMIT 20;
      `;

      const entityResult = await client.query<Entity & { id: string }>(
        entitySql,
        { fileIds: topFileIds }
      );

      const entities = entityResult[0]?.result || [];

      if (entities.length === 0) return [];

      // Extract entity names for matching
      const entityNames = entities.map((e) => e.name.toLowerCase());

      // Check if query mentions any of these entities
      const queryLower = query.toLowerCase();
      const matchedEntities = entityNames.filter((name) =>
        queryLower.includes(name)
      );

      if (matchedEntities.length === 0) return [];

      // Find chunks from documents that contain matched entities
      const chunkSql = `
        SELECT *
        FROM document_chunk
        WHERE document_id IN $fileIds OR file_id IN $fileIds
        LIMIT $limit;
      `;

      const chunkResult = await client.query<ChunkResult>(chunkSql, {
        fileIds: topFileIds,
        limit: this.config.vectorTopK,
      });

      const chunks = chunkResult[0]?.result || [];

      // Score based on entity matches in chunk content
      return chunks
        .map((chunk) => {
          const chunkLower = chunk.content.toLowerCase();
          const matchCount = matchedEntities.filter((name) =>
            chunkLower.includes(name)
          ).length;

          return {
            chunk,
            score: matchCount > 0 ? matchCount / matchedEntities.length : 0,
          };
        })
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score);
    } catch (error) {
      console.error("[HybridSearch] Entity search failed:", error);
      return [];
    }
  }

  /**
   * Knowledge Graph traversal search
   * Find chunks connected through entity relations
   */
  private async graphSearch(
    query: string,
    vectorResults: Array<{ chunk: ChunkResult; score: number }>
  ): Promise<Array<{ chunk: ChunkResult; score: number; graphContext?: { relationType: string; pathLength: number } }>> {
    try {
      const client = await this.getClient();

      // Get file IDs from top vector results
      const topFileIds = vectorResults
        .slice(0, 5)
        .map((r) => r.chunk.file_id || r.chunk.document_id)
        .filter((id, index, arr) => arr.indexOf(id) === index);

      if (topFileIds.length === 0) return [];

      // Find entities in these files
      const entitySql = `
        SELECT *
        FROM entity
        WHERE document_id IN $fileIds OR file_id IN $fileIds
        ORDER BY confidence DESC
        LIMIT 20;
      `;

      const entityResult = await client.query<Entity & { id: string }>(entitySql, {
        fileIds: topFileIds,
      });

      const entities = entityResult[0]?.result || [];

      if (entities.length === 0) return [];

      // Traverse graph to find related entities (up to graphDepth hops)
      const relatedEntityIds = new Set<string>();
      const relationContexts = new Map<string, { relationType: string; pathLength: number }>();

      for (const entity of entities) {
        if (!entity.id) continue;

        // Outgoing relations
        const outgoingSql = `
          SELECT ->*->entity AS related, relation_type
          FROM ${entity.id}
          LIMIT ${this.config.graphDepth * 10};
        `;

        try {
          const outResult = await client.query<{ related: unknown[]; relation_type: string }>(outgoingSql);
          const outRelations = outResult[0]?.result || [];

          for (const rel of outRelations) {
            if (rel.related) {
              const relatedArray = Array.isArray(rel.related) ? rel.related : [rel.related];
              for (const r of relatedArray) {
                const relatedEntity = r as { id?: string; file_id?: string };
                if (relatedEntity.id) {
                  relatedEntityIds.add(relatedEntity.id);
                  relationContexts.set(relatedEntity.id, {
                    relationType: rel.relation_type || "RELATED_TO",
                    pathLength: 1,
                  });
                }
              }
            }
          }
        } catch {
          // Graph traversal may fail if relations don't exist yet
        }

        // Incoming relations
        const incomingSql = `
          SELECT <-*<-entity AS related, relation_type
          FROM ${entity.id}
          LIMIT ${this.config.graphDepth * 10};
        `;

        try {
          const inResult = await client.query<{ related: unknown[]; relation_type: string }>(incomingSql);
          const inRelations = inResult[0]?.result || [];

          for (const rel of inRelations) {
            if (rel.related) {
              const relatedArray = Array.isArray(rel.related) ? rel.related : [rel.related];
              for (const r of relatedArray) {
                const relatedEntity = r as { id?: string; file_id?: string };
                if (relatedEntity.id && !relatedEntityIds.has(relatedEntity.id)) {
                  relatedEntityIds.add(relatedEntity.id);
                  relationContexts.set(relatedEntity.id, {
                    relationType: rel.relation_type || "RELATED_TO",
                    pathLength: 1,
                  });
                }
              }
            }
          }
        } catch {
          // Graph traversal may fail if relations don't exist yet
        }
      }

      if (relatedEntityIds.size === 0) return [];

      // Find chunks associated with related entities
      const entityIdsArray = Array.from(relatedEntityIds);
      const chunkSql = `
        SELECT DISTINCT document_chunk.*
        FROM document_chunk, entity
        WHERE entity.id IN $entityIds
          AND (document_chunk.file_id = entity.file_id OR document_chunk.document_id = entity.document_id)
        LIMIT ${this.config.vectorTopK};
      `;

      const chunkResult = await client.query<ChunkResult>(chunkSql, {
        entityIds: entityIdsArray,
      });

      const chunks = chunkResult[0]?.result || [];

      // Score based on entity confidence and graph distance
      return chunks.map((chunk, index) => {
        // Find the relation context for this chunk (simplified)
        const context = relationContexts.values().next().value;

        return {
          chunk,
          score: 1 / (index + 1), // Inverse rank scoring
          graphContext: context,
        };
      });
    } catch (error) {
      console.error("[HybridSearch] Graph search failed:", error);
      return [];
    }
  }

  /**
   * Reciprocal Rank Fusion (RRF)
   * Combines multiple ranked lists into a single ranking
   * Formula: score(d) = sum(weight * 1 / (k + rank(d)))
   */
  private reciprocalRankFusion(
    vectorResults: Array<{ chunk: ChunkResult; score: number }>,
    entityResults: Array<{ chunk: ChunkResult; score: number }>,
    graphResults: Array<{ chunk: ChunkResult; score: number; graphContext?: { relationType: string; pathLength: number } }>,
    topK: number
  ): HybridSearchResult[] {
    const k = this.config.rrfK;
    const graphWeight = 1 - this.config.vectorWeight - this.config.entityWeight;

    const scoreMap = new Map<
      string,
      {
        chunk: ChunkResult;
        vectorRank: number;
        vectorScore: number;
        entityRank: number;
        entityScore: number;
        graphRank: number;
        graphScore: number;
        graphContext?: { relationType: string; pathLength: number };
      }
    >();

    // Add vector results
    for (let i = 0; i < vectorResults.length; i++) {
      const result = vectorResults[i];
      const chunkId = result.chunk.id;

      scoreMap.set(chunkId, {
        chunk: result.chunk,
        vectorRank: i + 1,
        vectorScore: result.score,
        entityRank: 0,
        entityScore: 0,
        graphRank: 0,
        graphScore: 0,
      });
    }

    // Add entity results
    for (let i = 0; i < entityResults.length; i++) {
      const result = entityResults[i];
      const chunkId = result.chunk.id;

      if (scoreMap.has(chunkId)) {
        const existing = scoreMap.get(chunkId)!;
        existing.entityRank = i + 1;
        existing.entityScore = result.score;
      } else {
        scoreMap.set(chunkId, {
          chunk: result.chunk,
          vectorRank: 0,
          vectorScore: 0,
          entityRank: i + 1,
          entityScore: result.score,
          graphRank: 0,
          graphScore: 0,
        });
      }
    }

    // Add graph results
    for (let i = 0; i < graphResults.length; i++) {
      const result = graphResults[i];
      const chunkId = result.chunk.id;

      if (scoreMap.has(chunkId)) {
        const existing = scoreMap.get(chunkId)!;
        existing.graphRank = i + 1;
        existing.graphScore = result.score;
        existing.graphContext = result.graphContext;
      } else {
        scoreMap.set(chunkId, {
          chunk: result.chunk,
          vectorRank: 0,
          vectorScore: 0,
          entityRank: 0,
          entityScore: 0,
          graphRank: i + 1,
          graphScore: result.score,
          graphContext: result.graphContext,
        });
      }
    }

    // Calculate RRF scores
    const results: HybridSearchResult[] = [];

    for (const data of Array.from(scoreMap.values())) {
      const vectorRRF = data.vectorRank > 0 ? 1 / (k + data.vectorRank) : 0;
      const entityRRF = data.entityRank > 0 ? 1 / (k + data.entityRank) : 0;
      const graphRRF = data.graphRank > 0 ? 1 / (k + data.graphRank) : 0;

      const combinedScore =
        this.config.vectorWeight * vectorRRF +
        this.config.entityWeight * entityRRF +
        graphWeight * graphRRF;

      results.push({
        chunkId: data.chunk.id,
        documentId: data.chunk.document_id,
        fileId: data.chunk.file_id,
        content: data.chunk.content,
        chunkIndex: data.chunk.chunk_index,
        documentTitle: data.chunk.metadata?.title,
        section: data.chunk.metadata?.section,
        category: data.chunk.metadata?.category,
        vectorScore: data.vectorScore,
        entityScore: data.entityScore,
        graphScore: data.graphScore,
        combinedScore,
        rank: 0, // Will be set after sorting
        relatedEntities: [], // Will be enriched later
        graphContext: data.graphContext,
        debug: {
          vectorRank: data.vectorRank,
          entityRank: data.entityRank,
          graphRank: data.graphRank,
          rrfContribution: {
            vector: vectorRRF,
            entity: entityRRF,
            graph: graphRRF,
          },
        },
      });
    }

    // Sort by combined score and assign ranks
    results.sort((a, b) => b.combinedScore - a.combinedScore);

    for (let i = 0; i < results.length; i++) {
      results[i].rank = i + 1;
    }

    return results.slice(0, topK);
  }

  /**
   * Enrich results with related entities
   */
  private async enrichWithEntities(
    results: HybridSearchResult[]
  ): Promise<HybridSearchResult[]> {
    try {
      const client = await this.getClient();

      for (const result of results) {
        const sql = `
          SELECT *
          FROM entity
          WHERE document_id = $docId OR file_id = $fileId
          ORDER BY confidence DESC
          LIMIT 5;
        `;

        const entityResult = await client.query<Entity>(sql, {
          docId: result.documentId,
          fileId: result.fileId || result.documentId,
        });

        const entities = entityResult[0]?.result || [];
        result.relatedEntities = entities;
      }
    } catch (error) {
      console.error("[HybridSearch] Failed to enrich with entities:", error);
    }

    return results;
  }

  /**
   * Update search configuration
   */
  updateConfig(config: Partial<HybridSearchConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Create hybrid search instance
 */
export function createHybridSearch(
  config?: HybridSearchConfig
): HybridSearch {
  return new HybridSearch(config);
}

/**
 * Quick hybrid search function
 */
export async function hybridSearch(
  query: string,
  options?: HybridSearchConfig & { topK?: number }
): Promise<{ results: HybridSearchResult[]; stats: HybridSearchStats }> {
  const { topK, ...config } = options || {};
  const search = new HybridSearch(config);
  return search.search(query, topK);
}
