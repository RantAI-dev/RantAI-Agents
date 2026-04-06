/**
 * Mastra Memory Storage Adapter for PostgreSQL + SurrealDB
 *
 * Implements a Mastra-style storage interface delegating to existing
 * RantAI backends: PostgreSQL (threads, working metadata) and
 * SurrealDB (conversation_memory for semantic messages).
 */

import { prisma } from '@/lib/prisma';
import {
  storeConversationMemory,
  searchConversationMemory,
  listConversationMemoryByThread,
  deleteThreadMemories,
  type ConversationMemoryRecord,
} from './surreal-vector';

const THREAD_KEY_PREFIX = 'thread:';

export interface AdapterMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
  threadId: string;
  metadata?: Record<string, unknown>;
  similarity?: number;
}

export interface AdapterThread {
  threadId: string;
  metadata: Record<string, unknown>;
  updatedAt: Date;
}

/**
 * PostgreSQL + SurrealDB adapter (Mastra-style API)
 */
export class PostgreSQLSurrealAdapter {
  async saveThread(threadId: string, metadata: Record<string, unknown> & { userId?: string }): Promise<void> {
    const userId = metadata.userId ?? 'anonymous';
    const key = THREAD_KEY_PREFIX + threadId;
    const existing = await prisma.userMemory.findFirst({
      where: { key, type: 'WORKING' },
    });
    const value = { ...metadata, threadId, updatedAt: new Date().toISOString() };
    if (existing) {
      await prisma.userMemory.update({
        where: { id: existing.id },
        data: { value, updatedAt: new Date() },
      });
    } else {
      await prisma.userMemory.create({
        data: {
          userId,
          type: 'WORKING',
          key,
          value,
        },
      });
    }
  }

  async getThread(threadId: string): Promise<AdapterThread | null> {
    const key = THREAD_KEY_PREFIX + threadId;
    const record = await prisma.userMemory.findFirst({
      where: { key, type: 'WORKING' },
    });
    if (!record || !record.value || typeof record.value !== 'object') return null;
    const value = record.value as Record<string, unknown>;
    return {
      threadId,
      metadata: value,
      updatedAt: record.updatedAt,
    };
  }

  async saveMessage(
    threadId: string,
    message: { role: string; content: string; metadata?: Record<string, unknown> }
  ): Promise<void> {
    const userId = (message.metadata?.userId as string) ?? 'anonymous';
    const role = message.role === 'user' || message.role === 'assistant' ? message.role : 'user';
    await storeConversationMemory(userId, threadId, role, message.content, message.metadata);
  }

  async getMessages(
    threadId: string,
    options?: { userId?: string; limit?: number; before?: string }
  ): Promise<AdapterMessage[]> {
    const userId = options?.userId ?? 'anonymous';
    const limit = options?.limit ?? 10;
    const records = await listConversationMemoryByThread(userId, threadId, {
      limit,
      offset: 0,
      order: 'ASC',
    });
    return records.map((r) => toAdapterMessage(r));
  }

  async searchMessages(
    query: string,
    options: { userId: string; threadId?: string; topK?: number }
  ): Promise<AdapterMessage[]> {
    const { userId, threadId, topK = 5 } = options;
    const results = await searchConversationMemory(query, userId, topK, threadId);
    return results.map((r) => toAdapterMessage(r));
  }

  async deleteThread(threadId: string, userId: string): Promise<void> {
    const key = THREAD_KEY_PREFIX + threadId;
    await prisma.userMemory.deleteMany({ where: { key, type: 'WORKING' } });
    await deleteThreadMemories(userId, threadId);
  }

  async listThreads(userId: string, options?: { limit?: number }): Promise<AdapterThread[]> {
    const limit = options?.limit ?? 10;
    const records = await prisma.userMemory.findMany({
      where: {
        userId,
        type: 'WORKING',
        key: { startsWith: THREAD_KEY_PREFIX },
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
    return records
      .filter((r) => r.value && typeof r.value === 'object')
      .map((r) => {
        const value = r.value as Record<string, unknown>;
        const threadId = (value.threadId as string) ?? (r.key as string).replace(THREAD_KEY_PREFIX, '');
        return {
          threadId,
          metadata: value,
          updatedAt: r.updatedAt,
        };
      });
  }
}

function toAdapterMessage(r: ConversationMemoryRecord): AdapterMessage {
  return {
    id: r.id,
    role: r.role,
    content: r.content,
    createdAt: r.createdAt,
    threadId: r.threadId,
    metadata: r.metadata,
    similarity: r.similarity,
  };
}
