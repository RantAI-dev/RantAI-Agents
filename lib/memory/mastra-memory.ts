/**
 * Mastra Memory Integration
 *
 * Provides a Mastra-style memory API backed by existing PostgreSQL + SurrealDB
 * via PostgreSQLSurrealAdapter. When MASTRA_MEMORY_ENABLED=true, chat routes
 * use this for semantic recall and optional dual-write.
 */

import { semanticRecall } from './semantic-memory';
import { PostgreSQLSurrealAdapter } from './mastra-adapter';
import type { SemanticRecallResult } from './types';

export interface MastraRecallOptions {
  resourceId: string;
  threadId?: string;
  topK?: number;
}

export interface MastraRecallResult {
  threadId: string;
  messageContent: string;
  role: 'user' | 'assistant';
  similarity: number;
  createdAt: Date;
}

export interface MastraSaveMessageInput {
  role: 'user' | 'assistant';
  content: string;
  metadata?: Record<string, unknown>;
}

export interface MastraGetMessagesOptions {
  userId?: string;
  limit?: number;
  before?: string;
}

/**
 * Mastra-style memory interface (bridge + adapter)
 */
export interface MastraMemoryBridge {
  recall(
    query: string,
    options: MastraRecallOptions
  ): Promise<SemanticRecallResult[]>;
  saveMessage(
    threadId: string,
    message: MastraSaveMessageInput
  ): Promise<void>;
  getMessages(
    threadId: string,
    options?: MastraGetMessagesOptions
  ): Promise<Array<{ id: string; role: string; content: string; createdAt: Date; threadId?: string; metadata?: Record<string, unknown> }>>;
}

let adapterInstance: PostgreSQLSurrealAdapter | null = null;

function getAdapter(): PostgreSQLSurrealAdapter {
  if (!adapterInstance) {
    adapterInstance = new PostgreSQLSurrealAdapter();
  }
  return adapterInstance;
}

/**
 * Create Mastra memory bridge using adapter (SurrealDB + PostgreSQL)
 */
function createMastraMemoryBridge(): MastraMemoryBridge {
  const adapter = getAdapter();
  return {
    async recall(
      query: string,
      options: MastraRecallOptions
    ): Promise<SemanticRecallResult[]> {
      const { resourceId, threadId, topK = 5 } = options;
      return semanticRecall(query, resourceId, threadId, topK);
    },
    async saveMessage(
      threadId: string,
      message: MastraSaveMessageInput
    ): Promise<void> {
      await adapter.saveMessage(threadId, {
        role: message.role,
        content: message.content,
        metadata: message.metadata,
      });
    },
    async getMessages(threadId: string, options?: MastraGetMessagesOptions) {
      const list = await adapter.getMessages(threadId, {
        userId: options?.userId,
        limit: options?.limit,
        before: options?.before,
      });
      return list.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
        threadId: m.threadId,
        metadata: m.metadata,
      }));
    },
  };
}

let mastraMemoryInstance: MastraMemoryBridge | null = null;

/**
 * Get or create Mastra memory bridge singleton
 */
export function getMastraMemory(): MastraMemoryBridge {
  if (!mastraMemoryInstance) {
    mastraMemoryInstance = createMastraMemoryBridge();
  }
  return mastraMemoryInstance;
}

/**
 * Reset Mastra memory instance (useful for testing)
 */
export function resetMastraMemory(): void {
  mastraMemoryInstance = null;
  adapterInstance = null;
}
