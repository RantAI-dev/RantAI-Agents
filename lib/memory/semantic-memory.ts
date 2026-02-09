/**
 * Semantic Memory
 * Vector-based recall of relevant past messages using SurrealDB
 */

import {
  storeConversationMemory,
  searchConversationMemory,
  ConversationMemoryRecord,
} from './surreal-vector';
import { SemanticRecallResult, DEFAULT_MEMORY_CONFIG } from './types';

/**
 * Store a message pair for semantic recall
 */
export async function storeForSemanticRecall(
  userId: string,
  threadId: string,
  userMessage: string,
  assistantResponse: string
): Promise<void> {
  try {
    // Store user message
    await storeConversationMemory(userId, threadId, 'user', userMessage);

    // Store assistant response
    await storeConversationMemory(userId, threadId, 'assistant', assistantResponse);

    // console.log(`[Semantic Memory] Stored message pair for user ${userId}, thread ${threadId}`);
  } catch (error) {
    console.error('[Semantic Memory] Error storing messages:', error);
    // Don't throw - let the chat continue even if memory storage fails
  }
}

/**
 * Recall semantically relevant past messages
 */
export async function semanticRecall(
  query: string,
  userId: string,
  threadId?: string,
  topK: number = DEFAULT_MEMORY_CONFIG.semanticTopK
): Promise<SemanticRecallResult[]> {
  try {
    const results = await searchConversationMemory(query, userId, topK, threadId);

    const mappedResults: SemanticRecallResult[] = results.map((r) => ({
      threadId: r.threadId,
      messageContent: r.content,
      role: r.role,
      similarity: r.similarity || 0.8,
      createdAt: r.createdAt,
    }));

    // console.log(`[Semantic Memory] Found ${mappedResults.length} relevant messages for query: "${query.substring(0, 50)}..."`);
    return mappedResults;
  } catch (error) {
    console.error('[Semantic Memory] Error in semantic recall:', error);
    return [];
  }
}

/**
 * Format semantic recall results for prompt injection
 */
export function formatSemanticRecallForPrompt(results: SemanticRecallResult[]): string {
  if (results.length === 0) return '';

  const formatted = results
    .map((r, i) => `${i + 1}. [${r.role}]: ${r.messageContent.substring(0, 200)}${r.messageContent.length > 200 ? '...' : ''}`)
    .join('\n');

  return `--- Relevant Past Conversations ---\nThese are relevant messages from previous conversations that might help with context:\n\n${formatted}`;
}

/**
 * Clear semantic memory for a user/thread
 */
export async function clearSemanticMemory(
  userId: string,
  threadId?: string
): Promise<void> {
  const { deleteUserMemories, deleteThreadMemories } = await import('./surreal-vector');

  if (threadId) {
    await deleteThreadMemories(userId, threadId);
  } else {
    await deleteUserMemories(userId);
  }
  console.log(`[Semantic Memory] Cleared memory for user ${userId}, thread ${threadId || 'all'}`);
}
