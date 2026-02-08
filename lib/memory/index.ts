/**
 * Memory System
 * Unified exports and helpers for the memory system
 */

// Type exports
export * from './types';

// Storage (LibSQL for working memory, SurrealDB for semantic)

// Working Memory
export {
  loadWorkingMemory,
  updateWorkingMemory,
  formatWorkingMemoryForPrompt,
  clearWorkingMemory,
  cleanupExpiredWorkingMemories,
} from './working-memory';

// Semantic Memory (SurrealDB)
export {
  storeForSemanticRecall,
  semanticRecall,
  formatSemanticRecallForPrompt,
  clearSemanticMemory,
} from './semantic-memory';

// Long-term Memory
export {
  loadUserProfile,
  updateUserProfile,
  formatUserProfileForPrompt,
  clearUserProfile,
} from './long-term-memory';

import { WorkingMemory, SemanticRecallResult, UserProfile } from './types';
import { formatWorkingMemoryForPrompt } from './working-memory';
import { formatSemanticRecallForPrompt } from './semantic-memory';
import { formatUserProfileForPrompt } from './long-term-memory';

/**
 * Build enhanced system prompt with all memory contexts
 */
export function buildPromptWithMemory(
  basePrompt: string,
  workingMemory: WorkingMemory | null,
  semanticResults: SemanticRecallResult[],
  userProfile: UserProfile | null
): string {
  const parts: string[] = [basePrompt];

  // Add long-term memory (most stable context)
  if (userProfile) {
    const profileContext = formatUserProfileForPrompt(userProfile);
    if (profileContext) {
      parts.push(profileContext);
    }
  }

  // Add semantic recall (relevant past conversations)
  if (semanticResults.length > 0) {
    const semanticContext = formatSemanticRecallForPrompt(semanticResults);
    if (semanticContext) {
      parts.push(semanticContext);
    }
  }

  // Add working memory (current session context) - most recent/relevant
  if (workingMemory) {
    const workingContext = formatWorkingMemoryForPrompt(workingMemory);
    if (workingContext) {
      parts.push(workingContext);
    }
  }

  return parts.join('\n\n');
}

/**
 * Memory statistics for debugging/monitoring
 */
export interface MemoryStats {
  workingMemory: {
    hasContext: boolean;
    entityCount: number;
    factCount: number;
  };
  semanticRecall: {
    resultsCount: number;
  };
  userProfile: {
    exists: boolean;
    factCount: number;
    preferenceCount: number;
    conversationCount: number;
  };
}

export function getMemoryStats(
  workingMemory: WorkingMemory | null,
  semanticResults: SemanticRecallResult[],
  userProfile: UserProfile | null
): MemoryStats {
  return {
    workingMemory: {
      hasContext: workingMemory !== null,
      entityCount: workingMemory?.entities.size ?? 0,
      factCount: workingMemory?.facts.size ?? 0,
    },
    semanticRecall: {
      resultsCount: semanticResults.length,
    },
    userProfile: {
      exists: userProfile !== null,
      factCount: userProfile?.facts.length ?? 0,
      preferenceCount: userProfile?.preferences.length ?? 0,
      conversationCount: userProfile?.totalConversations ?? 0,
    },
  };
}
