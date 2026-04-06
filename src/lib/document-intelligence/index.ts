/**
 * Document Intelligence Module
 *
 * Advanced document processing features including:
 * - Entity extraction (LLM and pattern-based)
 * - Relation extraction (LLM and pattern-based)
 * - Combined extraction (single-pass for 98.5% fewer API calls)
 * - Knowledge graph building
 * - Semantic analysis
 */

// Types
export type {
  Entity,
  EntityType,
  EntityMetadata,
  ExtractionResult,
  LLMExtractionConfig,
  PatternExtractionConfig,
  HybridExtractionConfig,
  ProcessingProgress,
  ProgressCallback,
  // Relation types
  Relation,
  RelationType,
  RelationMetadata,
  RelationExtractionConfig,
  PatternRelationConfig,
  CombinedExtractionConfig,
  CombinedExtractionResult,
  RelationExtractionResult,
  // Search types
  VectorSearchResult,
  HybridSearchResult,
} from "./types";

// LLM Entity Extractor
export {
  LLMEntityExtractor,
  createLLMExtractor,
  extractEntitiesWithLLM,
} from "./entity-extractor";

// Pattern Entity Extractor
export {
  PatternEntityExtractor,
  extractEntitiesWithPatterns,
} from "./pattern-extractor";

// LLM Relation Extractor
export {
  LLMRelationExtractor,
  createLLMRelationExtractor,
} from "./relation-extractor";

// Pattern Relation Extractor
export {
  PatternRelationExtractor,
  extractRelationsWithPatterns,
  createPatternRelationExtractor,
} from "./pattern-relation-extractor";

// Combined Extractor (entities + relations in single pass)
export {
  CombinedExtractor,
  createCombinedExtractor,
} from "./combined-extractor";

// Document Processing Pipeline
export {
  DocumentPipeline,
  createDocumentPipeline,
  processDocument,
} from "./pipeline";
export type {
  PipelineConfig,
  ProcessingResult,
  ProcessingStage,
} from "./pipeline";

import { Entity, Relation, CombinedExtractionResult } from "./types";

/**
 * Extract entities using hybrid approach (patterns first, then LLM)
 * Pattern extraction is free and fast, LLM adds semantic understanding
 */
export async function extractEntities(
  text: string,
  documentId?: string,
  chunkId?: string,
  options: {
    useLLM?: boolean;
    usePatterns?: boolean;
  } = {}
): Promise<Entity[]> {
  const { useLLM = true, usePatterns = true } = options;

  const allEntities: Entity[] = [];

  // Pattern extraction (free, fast)
  if (usePatterns) {
    const { extractEntitiesWithPatterns } = await import("./pattern-extractor");
    const patternEntities = await extractEntitiesWithPatterns(
      text,
      documentId,
      chunkId
    );
    allEntities.push(...patternEntities);
  }

  // LLM extraction (costs API calls, but more semantic)
  if (useLLM) {
    const { extractEntitiesWithLLM } = await import("./entity-extractor");
    const llmEntities = await extractEntitiesWithLLM(
      text,
      documentId,
      chunkId
    );
    allEntities.push(...llmEntities);
  }

  // Deduplicate by name+type, keeping higher confidence
  const seen = new Map<string, Entity>();
  for (const entity of allEntities) {
    const key = `${entity.type}:${entity.name.toLowerCase()}`;
    const existing = seen.get(key);
    if (!existing || entity.confidence > existing.confidence) {
      seen.set(key, entity);
    }
  }

  return Array.from(seen.values());
}

/**
 * Extract relations using hybrid approach (patterns first, then LLM)
 * Requires entities to be extracted first
 */
export async function extractRelations(
  text: string,
  entities: Entity[],
  fileId?: string,
  userId?: string,
  options: {
    useLLM?: boolean;
    usePatterns?: boolean;
  } = {}
): Promise<Relation[]> {
  const { useLLM = true, usePatterns = true } = options;

  const allRelations: Relation[] = [];

  // Pattern extraction (free, fast)
  if (usePatterns) {
    const { extractRelationsWithPatterns } = await import("./pattern-relation-extractor");
    const patternRelations = await extractRelationsWithPatterns(
      text,
      entities,
      fileId,
      userId
    );
    allRelations.push(...patternRelations);
  }

  // LLM extraction (costs API calls, but more semantic)
  if (useLLM) {
    const { LLMRelationExtractor } = await import("./relation-extractor");
    const extractor = new LLMRelationExtractor();
    const llmRelations = await extractor.extract(text, entities, fileId, userId);
    allRelations.push(...llmRelations);
  }

  // Deduplicate by source+type+target, keeping higher confidence
  const seen = new Map<string, Relation>();
  for (const relation of allRelations) {
    const key = `${relation.metadata?.source_entity}:${relation.relation_type}:${relation.metadata?.target_entity}`;
    const existing = seen.get(key);
    if (!existing || relation.confidence > existing.confidence) {
      seen.set(key, relation);
    }
  }

  return Array.from(seen.values());
}

/**
 * Extract entities AND relations in a single pass
 *
 * This is the most efficient approach:
 * - Old approach: N chunks for entities + N×M batches for relations = many API calls
 * - Combined: N chunks = N API calls (98.5% fewer!)
 *
 * Use this for new documents. Use separate extractors for re-processing.
 */
export async function extractEntitiesAndRelations(
  text: string,
  fileId?: string,
  userId?: string
): Promise<CombinedExtractionResult> {
  const { CombinedExtractor } = await import("./combined-extractor");
  const extractor = new CombinedExtractor();
  return extractor.extract(text, fileId, userId);
}
