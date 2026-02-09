/**
 * SurrealDB Vector Store for Semantic Memory
 * Implements vector storage compatible with Mastra Memory
 */

import { SurrealDBClient, getSurrealDBConfigFromEnv } from '../surrealdb';
import { generateEmbedding } from '../rag/embeddings';

const TABLE_NAME = 'conversation_memory';

// Lazy client initialization
let surrealClient: SurrealDBClient | null = null;

async function getClient(): Promise<SurrealDBClient> {
  if (!surrealClient) {
    surrealClient = await SurrealDBClient.getInstance(getSurrealDBConfigFromEnv());
  }
  return surrealClient;
}

export interface ConversationMemoryRecord {
  id: string;
  userId: string;
  threadId: string;
  role: 'user' | 'assistant';
  content: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
  createdAt: Date;
  similarity?: number;
}

/**
 * Store a message with embedding for semantic recall
 */
export async function storeConversationMemory(
  userId: string,
  threadId: string,
  role: 'user' | 'assistant',
  content: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const client = await getClient();

  try {
    const embedding = await generateEmbedding(content);
    const id = `${userId}_${threadId}_${Date.now()}_${role}`;

    // console.log(`[SurrealDB Vector] Storing memory: ${id}, content: ${content.substring(0, 50)}...`);

    await client.query(
      `CREATE ${TABLE_NAME} CONTENT {
        id: $id,
        userId: $userId,
        threadId: $threadId,
        role: $role,
        content: $content,
        embedding: $embedding,
        metadata: $metadata,
        createdAt: time::now()
      }`,
      { id, userId, threadId, role, content, embedding, metadata: metadata || {} }
    );

    // console.log(`[SurrealDB Vector] ✅ Memory stored successfully: ${id}`);
  } catch (error) {
    console.error('[SurrealDB Vector] Error storing memory:', error);
    throw error;
  }
}

/**
 * Search for semantically similar messages
 */
export async function searchConversationMemory(
  query: string,
  userId: string,
  topK: number = 5,
  threadId?: string
): Promise<ConversationMemoryRecord[]> {
  const client = await getClient();

  try {
    const queryEmbedding = await generateEmbedding(query);

    const whereClause = threadId
      ? 'userId = $userId AND threadId = $threadId'
      : 'userId = $userId';

    // console.log(`[SurrealDB Vector] Searching: userId=${userId}, query=${query.substring(0, 30)}...`);

    const results = await client.query<ConversationMemoryRecord>(
      `SELECT *, vector::similarity::cosine(embedding, $embedding) AS similarity
       FROM ${TABLE_NAME}
       WHERE ${whereClause}
       ORDER BY similarity DESC
       LIMIT $topK`,
      { embedding: queryEmbedding, userId, threadId, topK }
    );

    // console.log(`[SurrealDB Vector] Raw results type:`, Array.isArray(results) ? 'array' : typeof results);

    // Handle different result formats from SurrealDB client
    let data: ConversationMemoryRecord[] = [];

    if (Array.isArray(results) && results.length > 0) {
      const firstResult = results[0];

      // Case 1: Result is directly an array of records (sometimes happens with raw query)
      if (Array.isArray(firstResult)) {
        data = firstResult as ConversationMemoryRecord[];
      }
      // Case 2: Result is SurrealQueryResult object with .result property
      else if (firstResult && typeof firstResult === 'object' && 'result' in firstResult) {
        // Safe cast to access result property
        const queryResult = firstResult as { result: ConversationMemoryRecord[] };
        if (queryResult.result && Array.isArray(queryResult.result)) {
          data = queryResult.result;
        }
      }
    }

    // console.log(`[SurrealDB Vector] ✅ Found ${data.length} results`);

    return data;
  } catch (error) {
    console.error('[SurrealDB Vector] Error searching memory:', error);
    return [];
  }
}

/**
 * List conversation messages by thread (for Mastra adapter listMessages)
 */
export async function listConversationMemoryByThread(
  userId: string,
  threadId: string,
  options: { limit?: number; offset?: number; order?: 'ASC' | 'DESC' } = {}
): Promise<ConversationMemoryRecord[]> {
  const client = await getClient();
  const { limit = 40, offset = 0, order = 'ASC' } = options;

  try {
    const orderClause = order === 'DESC' ? 'ORDER BY createdAt DESC' : 'ORDER BY createdAt ASC';
    const results = await client.query<ConversationMemoryRecord>(
      `SELECT * FROM ${TABLE_NAME}
       WHERE userId = $userId AND threadId = $threadId
       ${orderClause}
       LIMIT $limit START $offset`,
      { userId, threadId, limit, offset }
    );

    let data: ConversationMemoryRecord[] = [];
    if (Array.isArray(results) && results.length > 0) {
      const first = results[0];
      if (Array.isArray(first)) {
        data = first as ConversationMemoryRecord[];
      } else if (first && typeof first === 'object' && 'result' in first) {
        const q = first as { result: ConversationMemoryRecord[] };
        if (Array.isArray(q?.result)) data = q.result;
      }
    }
    return data;
  } catch (error) {
    console.error('[SurrealDB Vector] Error listing memory by thread:', error);
    return [];
  }
}

/**
 * Delete all memories for a user
 */
export async function deleteUserMemories(userId: string): Promise<void> {
  const client = await getClient();
  await client.query(`DELETE ${TABLE_NAME} WHERE userId = $userId`, { userId });
}

/**
 * Delete memories for a specific thread
 */
export async function deleteThreadMemories(userId: string, threadId: string): Promise<void> {
  const client = await getClient();
  await client.query(
    `DELETE ${TABLE_NAME} WHERE userId = $userId AND threadId = $threadId`,
    { userId, threadId }
  );
}
