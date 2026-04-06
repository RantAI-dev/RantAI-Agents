/**
 * Memory System Type Definitions
 * Types for working memory, semantic recall, and long-term memory
 */

// Entity types for working memory
export interface Entity {
  id: string;
  type: 'person' | 'product' | 'date' | 'location' | 'organization' | 'other';
  name: string;
  attributes: Record<string, string | number | boolean>;
  confidence: number;
  source: string; // messageId where entity was extracted
  createdAt: Date;
}

// Facts extracted from conversation
export interface Fact {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  source: string; // messageId where fact was extracted
  createdAt: Date;
}

// Current conversation context
export interface ConversationContext {
  currentTopic: string | null;
  intent: string | null;
  sentiment: 'positive' | 'neutral' | 'negative' | null;
  language: 'en' | 'id' | string;
  lastUpdated: Date;
}

// Working memory for current session
export interface WorkingMemory {
  threadId: string;
  entities: Map<string, Entity>;
  facts: Map<string, Fact>;
  context: ConversationContext;
  createdAt: Date;
  updatedAt: Date;
}

// Serializable version of WorkingMemory for storage
export interface WorkingMemoryData {
  threadId: string;
  entities: Entity[];
  facts: Fact[];
  context: ConversationContext;
  createdAt: string;
  updatedAt: string;
}

// User profile for long-term memory
export interface UserProfile {
  id: string;
  userId: string;
  facts: Fact[];
  preferences: Preference[];
  interactionSummary: string;
  totalConversations: number;
  lastInteractionAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// User preference
export interface Preference {
  id: string;
  category: string; // communication_style, topic_interest, etc.
  key: string;
  value: string;
  confidence: number;
  source: string;
}

// Semantic recall result
export interface SemanticRecallResult {
  threadId: string;
  messageContent: string;
  role: 'user' | 'assistant';
  similarity: number;
  createdAt: Date;
  context?: {
    before: Array<{ role: string; content: string }>;
    after: Array<{ role: string; content: string }>;
  };
}

// Memory configuration
export interface MemoryConfig {
  // Working memory settings
  workingMemoryTTL: number; // TTL in milliseconds
  maxEntities: number;
  maxFacts: number;

  // Semantic recall settings
  semanticTopK: number; // Number of similar messages to retrieve
  semanticMessageRange: {
    before: number;
    after: number;
  };

  // Long-term memory settings
  maxProfileFacts: number;
  profileUpdateThreshold: number; // Minimum confidence to add fact
}

// Default configuration
export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  workingMemoryTTL: 30 * 60 * 1000, // 30 minutes
  maxEntities: 50,
  maxFacts: 100,
  semanticTopK: 5,
  semanticMessageRange: {
    before: 3,
    after: 1,
  },
  maxProfileFacts: 50,
  profileUpdateThreshold: 0.7,
};

// Type for memory key in database
export type MemoryKey =
  | 'working_memory'
  | 'user_profile'
  | `entity:${string}`
  | `fact:${string}`
  | `preference:${string}`;
