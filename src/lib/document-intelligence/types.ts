/**
 * Document Intelligence Types
 *
 * Type definitions for entity extraction, knowledge graph, and document processing
 */

/**
 * Entity types supported by extraction
 */
export type EntityType =
  // Universal types
  | "Person"
  | "Organization"
  | "Location"
  | "Date"
  | "Event"
  | "Concept"
  | "Product"
  | "Number"
  // Contact types
  | "Email"
  | "URL"
  | "Phone"
  // Financial types
  | "Currency"
  | "Transaction"
  | "Account"
  // Technical types
  | "API"
  | "Function"
  | "Error"
  | "Technology"
  // Custom/domain types
  | string;

/**
 * Extracted entity
 */
export interface Entity {
  /** Unique identifier */
  id?: string;
  /** Entity name/value */
  name: string;
  /** Entity type (Person, Organization, etc.) */
  type: EntityType;
  /** Confidence score (0-1) */
  confidence: number;
  /** Document ID this entity was extracted from */
  documentId?: string;
  /** Chunk ID this entity was found in */
  chunkId?: string;
  /** Additional metadata */
  metadata?: EntityMetadata;
  /** Creation timestamp */
  createdAt?: Date;
}

/**
 * Entity metadata
 */
export interface EntityMetadata {
  /** Context where entity was found */
  context?: string;
  /** Brief description of the entity */
  description?: string;
  /** Pattern used for extraction (for pattern-based) */
  pattern?: string;
  /** Raw text matched */
  rawText?: string;
  /** Any additional properties */
  [key: string]: unknown;
}

/**
 * Entity extraction result
 */
export interface ExtractionResult {
  /** Extracted entities */
  entities: Entity[];
  /** Source document ID */
  documentId?: string;
  /** Processing time in ms */
  processingTimeMs?: number;
  /** Extraction method used */
  method: "llm" | "pattern" | "hybrid";
}

/**
 * LLM extraction configuration
 */
export interface LLMExtractionConfig {
  /** OpenRouter API key */
  apiKey?: string;
  /** API base URL */
  baseUrl?: string;
  /** Model to use for extraction */
  model?: string;
  /** Maximum tokens for response */
  maxTokens?: number;
  /** Temperature for generation */
  temperature?: number;
  /** Maximum characters per chunk for processing */
  maxChunkChars?: number;
}

/**
 * Pattern extraction configuration
 */
export interface PatternExtractionConfig {
  /** Extract universal entities (email, URL, phone, dates) */
  extractUniversal?: boolean;
  /** Extract financial entities (currency, transactions) */
  extractFinancial?: boolean;
  /** Extract technical entities (APIs, functions) */
  extractTechnical?: boolean;
}

/**
 * Hybrid extraction configuration
 */
export interface HybridExtractionConfig {
  /** Use LLM for semantic extraction */
  useLLM?: boolean;
  /** Use patterns for structured extraction */
  usePatterns?: boolean;
  /** LLM configuration */
  llmConfig?: LLMExtractionConfig;
  /** Pattern configuration */
  patternConfig?: PatternExtractionConfig;
}

/**
 * Document processing progress
 */
export interface ProcessingProgress {
  /** Current stage */
  stage:
    | "parsing"
    | "chunking"
    | "embedding"
    | "extracting"
    | "storing"
    | "complete";
  /** Progress percentage (0-100) */
  progress: number;
  /** Human-readable status message */
  message: string;
  /** Optional details */
  details?: {
    /** Total items to process */
    total?: number;
    /** Items processed so far */
    processed?: number;
    /** Current item being processed */
    current?: string;
  };
}

/**
 * Progress callback type
 */
export type ProgressCallback = (progress: ProcessingProgress) => void;

/**
 * Relation types for knowledge graph edges
 */
export type RelationType =
  // Universal relations
  | "MENTIONS"
  | "RELATED_TO"
  | "PART_OF"
  | "CONTAINS"
  | "CITES"
  | "LOCATED_IN"
  | "WORKS_FOR"
  | "CREATED_BY"
  | "OWNED_BY"
  // Legal relations
  | "REFINES"
  | "IMPLEMENTS"
  | "SUPERSEDES"
  | "APPLIES_TO"
  | "REQUIRES"
  | "PENALIZES"
  // Financial relations
  | "TRANSFERS"
  | "PAYS"
  | "RECEIVES"
  // Technical relations
  | "CALLS"
  | "RETURNS"
  | "THROWS"
  | "DEPENDS_ON"
  // Custom/domain types
  | string;

/**
 * Knowledge graph relation (edge between entities)
 */
export interface Relation {
  /** Unique identifier */
  id?: string;
  /** Relation type (WORKS_FOR, PART_OF, etc.) */
  relation_type: RelationType;
  /** Confidence score (0-1) */
  confidence: number;
  /** Source entity ID (SurrealDB: 'in' field for RELATE) */
  in?: string;
  /** Target entity ID (SurrealDB: 'out' field for RELATE) */
  out?: string;
  /** Additional metadata */
  metadata: RelationMetadata;
  /** Creation timestamp */
  createdAt?: Date;
}

/**
 * Relation metadata
 */
export interface RelationMetadata {
  /** Context where relation was found */
  context?: string;
  /** Brief description of the relation */
  description?: string;
  /** Source entity name (for reference before ID assignment) */
  source_entity?: string;
  /** Target entity name (for reference before ID assignment) */
  target_entity?: string;
  /** Pattern used for extraction (for pattern-based) */
  pattern?: string;
  /** Document ID this relation was extracted from */
  file_id?: string;
  /** User ID */
  user_id?: string;
  /** Extraction method used */
  extraction_method?: "llm" | "pattern" | "combined-llm";
  /** Any additional properties */
  [key: string]: unknown;
}

/**
 * Relation extraction configuration
 */
export interface RelationExtractionConfig {
  /** OpenRouter API key */
  apiKey?: string;
  /** API base URL */
  baseUrl?: string;
  /** Model to use for extraction */
  model?: string;
  /** Maximum tokens for response */
  maxTokens?: number;
  /** Temperature for generation */
  temperature?: number;
  /** Maximum characters per text chunk (default: 4000) */
  maxChunkChars?: number;
  /** Maximum entities per batch (default: 15) */
  maxEntitiesPerBatch?: number;
}

/**
 * Pattern relation extraction configuration
 */
export interface PatternRelationConfig {
  /** Extract universal relations */
  extractUniversal?: boolean;
  /** Extract legal relations */
  extractLegal?: boolean;
  /** Extract financial relations */
  extractFinancial?: boolean;
  /** Extract technical relations */
  extractTechnical?: boolean;
}

/**
 * Combined extraction configuration (entities + relations in one pass)
 */
export interface CombinedExtractionConfig {
  /** OpenRouter API key */
  apiKey?: string;
  /** API base URL */
  baseUrl?: string;
  /** Model to use for extraction */
  model?: string;
  /** Maximum tokens for response */
  maxTokens?: number;
  /** Temperature for generation */
  temperature?: number;
  /** Maximum characters per chunk (default: 5000) */
  maxChunkChars?: number;
  /** Concurrency limit for parallel requests (default: 10) */
  concurrencyLimit?: number;
  /** Maximum retry attempts for failed requests (default: 3) */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff (default: 1000) */
  retryDelayMs?: number;
  /** Delay in ms between batches (default: 500) */
  batchDelayMs?: number;
}

/**
 * Combined extraction result
 */
export interface CombinedExtractionResult {
  /** Extracted entities */
  entities: Entity[];
  /** Extracted relations */
  relations: Relation[];
}

/**
 * Relation extraction result
 */
export interface RelationExtractionResult {
  /** Extracted relations */
  relations: Relation[];
  /** Source document ID */
  documentId?: string;
  /** Processing time in ms */
  processingTimeMs?: number;
  /** Extraction method used */
  method: "llm" | "pattern" | "hybrid";
}

/**
 * Vector search result
 */
export interface VectorSearchResult {
  /** Document chunk */
  chunk: {
    id?: string;
    text: string;
    file_id: string;
    chunk_index: number;
    embedding: number[];
    metadata: Record<string, unknown>;
  };
  /** Distance from query vector */
  distance: number;
  /** Similarity score */
  score: number;
}

/**
 * Hybrid search result (vector + graph)
 */
export interface HybridSearchResult {
  /** Document chunk */
  chunk: VectorSearchResult["chunk"];
  /** Combined final score */
  combined_score: number;
  /** Vector similarity score */
  vector_score: number;
  /** Graph traversal score */
  graph_score: number;
  /** Related entities found via graph */
  related_entities: Entity[];
  /** Graph context info */
  graph_context?: {
    relation_type: string;
    path_length: number;
  };
}
