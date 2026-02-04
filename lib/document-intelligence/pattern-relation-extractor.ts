/**
 * Pattern-based Relation Extractor
 *
 * Extracts common relationships using text patterns
 * Fast and reliable for known relationship structures
 */
import type { Entity, Relation, PatternRelationConfig } from "./types";

interface RelationPattern {
  confidence: number;
  pattern: RegExp;
  relationType: string;
  sourceGroup: number;
  targetGroup: number;
}

/**
 * Pattern-based Relation Extractor
 */
export class PatternRelationExtractor {
  private config: Required<PatternRelationConfig>;
  private patterns: RelationPattern[];

  constructor(config: PatternRelationConfig = {}) {
    this.config = {
      extractFinancial: config.extractFinancial ?? true,
      extractLegal: config.extractLegal ?? true,
      extractTechnical: config.extractTechnical ?? true,
      extractUniversal: config.extractUniversal ?? true,
    };

    this.patterns = this.buildPatterns();
  }

  /**
   * Extract relations from text with known entities
   */
  async extract(
    text: string,
    entities: Entity[],
    fileId?: string,
    userId?: string
  ): Promise<Relation[]> {
    if (entities.length < 2) {
      return [];
    }

    const relations: Relation[] = [];

    // Create entity lookup map
    const entityMap = new Map<string, Entity>();
    for (const entity of entities) {
      entityMap.set(entity.name.toLowerCase(), entity);
    }

    // Apply each pattern
    for (const {
      pattern,
      relationType,
      sourceGroup,
      targetGroup,
      confidence,
    } of this.patterns) {
      for (const match of text.matchAll(pattern)) {
        const sourceName = match[sourceGroup]?.trim();
        const targetName = match[targetGroup]?.trim();

        if (!sourceName || !targetName) continue;

        // Find entities
        const sourceEntity = entityMap.get(sourceName.toLowerCase());
        const targetEntity = entityMap.get(targetName.toLowerCase());

        if (sourceEntity && targetEntity) {
          relations.push({
            confidence,
            metadata: {
              context: match[0],
              pattern: pattern.source,
              source_entity: sourceEntity.name,
              target_entity: targetEntity.name,
              file_id: fileId,
              user_id: userId,
              extraction_method: "pattern",
            },
            relation_type: relationType,
          });
        }
      }
    }

    console.log(
      `[PatternRelationExtractor] Extracted ${relations.length} relations`
    );
    return this.deduplicateRelations(relations);
  }

  /**
   * Build relation extraction patterns
   */
  private buildPatterns(): RelationPattern[] {
    const patterns: RelationPattern[] = [];

    if (this.config.extractUniversal) {
      patterns.push(...this.getUniversalPatterns());
    }

    if (this.config.extractLegal) {
      patterns.push(...this.getLegalPatterns());
    }

    if (this.config.extractFinancial) {
      patterns.push(...this.getFinancialPatterns());
    }

    if (this.config.extractTechnical) {
      patterns.push(...this.getTechnicalPatterns());
    }

    return patterns;
  }

  /**
   * Universal relation patterns
   */
  private getUniversalPatterns(): RelationPattern[] {
    return [
      // MENTIONS: "X mentions Y"
      {
        confidence: 0.7,
        pattern: /(\w+)\s+(?:mentions?|refers? to|discusses?)\s+(\w+)/gi,
        relationType: "MENTIONS",
        sourceGroup: 1,
        targetGroup: 2,
      },

      // PART_OF: "X is part of Y", "X in Y"
      {
        confidence: 0.8,
        pattern: /(\w+)\s+(?:is part of|belongs to|in)\s+(\w+)/gi,
        relationType: "PART_OF",
        sourceGroup: 1,
        targetGroup: 2,
      },

      // CITES: "X cites Y", "according to Y"
      {
        confidence: 0.85,
        pattern: /(\w+)\s+(?:cites?|references?|according to)\s+(\w+)/gi,
        relationType: "CITES",
        sourceGroup: 1,
        targetGroup: 2,
      },

      // WORKS_FOR: "X works for Y", "X at Y"
      {
        confidence: 0.8,
        pattern: /(\w+)\s+(?:works? for|employed by|at)\s+(\w+)/gi,
        relationType: "WORKS_FOR",
        sourceGroup: 1,
        targetGroup: 2,
      },

      // CREATED_BY: "X created by Y", "Y created X"
      {
        confidence: 0.8,
        pattern: /(\w+)\s+(?:created|developed|built) by\s+(\w+)/gi,
        relationType: "CREATED_BY",
        sourceGroup: 1,
        targetGroup: 2,
      },

      // LOCATED_IN: "X located in Y", "X based in Y"
      {
        confidence: 0.8,
        pattern: /(\w+)\s+(?:located in|based in|headquartered in)\s+(\w+)/gi,
        relationType: "LOCATED_IN",
        sourceGroup: 1,
        targetGroup: 2,
      },
    ];
  }

  /**
   * Legal relation patterns
   */
  private getLegalPatterns(): RelationPattern[] {
    return [
      // IMPLEMENTS: "PP implements UU"
      {
        confidence: 0.9,
        pattern: /(pp\s+\S+)\s+(?:implements?|melaksanakan)\s+(uu\s+\S+)/gi,
        relationType: "IMPLEMENTS",
        sourceGroup: 1,
        targetGroup: 2,
      },

      // REFINES: "PP refines UU"
      {
        confidence: 0.9,
        pattern: /(pp\s+\S+)\s+(?:refines?|clarifies?|memperjelas)\s+(uu\s+\S+)/gi,
        relationType: "REFINES",
        sourceGroup: 1,
        targetGroup: 2,
      },

      // SUPERSEDES: "UU X supersedes UU Y", "replaces"
      {
        confidence: 0.9,
        pattern:
          /(uu\s+\S+|pp\s+\S+)\s+(?:supersedes?|replaces?|menggantikan)\s+(uu\s+\S+|pp\s+\S+)/gi,
        relationType: "SUPERSEDES",
        sourceGroup: 1,
        targetGroup: 2,
      },

      // APPLIES_TO: "UU applies to company"
      {
        confidence: 0.8,
        pattern: /(uu\s+\S+|pp\s+\S+)\s+(?:applies to|berlaku untuk)\s+([a-z][\s\w]+)/gi,
        relationType: "APPLIES_TO",
        sourceGroup: 1,
        targetGroup: 2,
      },

      // PART_OF: "Pasal X is part of UU Y"
      {
        confidence: 0.95,
        pattern: /(pasal\s+\d+)\s+(?:of|dalam|from)\s+(uu\s+\S+|pp\s+\S+)/gi,
        relationType: "PART_OF",
        sourceGroup: 1,
        targetGroup: 2,
      },

      // REQUIRES: "X requires Y"
      {
        confidence: 0.85,
        pattern:
          /(uu\s+\S+|pp\s+\S+)\s+(?:requires?|mewajibkan|mengharuskan)\s+([a-z][\s\w]+)/gi,
        relationType: "REQUIRES",
        sourceGroup: 1,
        targetGroup: 2,
      },
    ];
  }

  /**
   * Financial relation patterns
   */
  private getFinancialPatterns(): RelationPattern[] {
    return [
      // PAYS: "X pays Y"
      {
        confidence: 0.85,
        pattern: /(\w+)\s+(?:pays?|transfers?)\s+[\d\s$,.prp£€]+ to\s+(\w+)/gi,
        relationType: "PAYS",
        sourceGroup: 1,
        targetGroup: 2,
      },

      // OWNS: "X owns Y"
      {
        confidence: 0.8,
        pattern: /(\w+)\s+(?:owns?|possesses?)\s+(\w+)/gi,
        relationType: "OWNED_BY",
        sourceGroup: 2,
        targetGroup: 1,
      },

      // TRANSFERS: "X transfers to Y"
      {
        confidence: 0.8,
        pattern: /(\w+)\s+(?:transfers?|sends?)\s+(?:to|ke)\s+(\w+)/gi,
        relationType: "TRANSFERS",
        sourceGroup: 1,
        targetGroup: 2,
      },
    ];
  }

  /**
   * Technical relation patterns
   */
  private getTechnicalPatterns(): RelationPattern[] {
    return [
      // CALLS: "function X calls Y"
      {
        confidence: 0.9,
        pattern: /(\w+\(\))\s+calls?\s+(\w+\(\))/gi,
        relationType: "CALLS",
        sourceGroup: 1,
        targetGroup: 2,
      },

      // THROWS: "X throws Error"
      {
        confidence: 0.9,
        pattern: /(\w+\(\))\s+throws?\s+(\w+(?:error|exception))/gi,
        relationType: "THROWS",
        sourceGroup: 1,
        targetGroup: 2,
      },

      // DEPENDS_ON: "X depends on Y"
      {
        confidence: 0.8,
        pattern: /(\w+)\s+(?:depends on|requires?)\s+(\w+)/gi,
        relationType: "DEPENDS_ON",
        sourceGroup: 1,
        targetGroup: 2,
      },

      // RETURNS: "X returns Y"
      {
        confidence: 0.85,
        pattern: /(\w+\(\))\s+returns?\s+(\w+)/gi,
        relationType: "RETURNS",
        sourceGroup: 1,
        targetGroup: 2,
      },
    ];
  }

  /**
   * Deduplicate relations
   */
  private deduplicateRelations(relations: Relation[]): Relation[] {
    const seen = new Map<string, Relation>();

    for (const relation of relations) {
      const key = `${relation.metadata?.source_entity}:${relation.relation_type}:${relation.metadata?.target_entity}`;
      if (!seen.has(key)) {
        seen.set(key, relation);
      } else {
        // Keep higher confidence
        const existing = seen.get(key)!;
        if (relation.confidence > existing.confidence) {
          seen.set(key, relation);
        }
      }
    }

    return Array.from(seen.values());
  }
}

/**
 * Helper to extract relations with patterns
 */
export async function extractRelationsWithPatterns(
  text: string,
  entities: Entity[],
  fileId?: string,
  userId?: string,
  config?: PatternRelationConfig
): Promise<Relation[]> {
  const extractor = new PatternRelationExtractor(config);
  return extractor.extract(text, entities, fileId, userId);
}

/**
 * Create pattern relation extractor
 */
export function createPatternRelationExtractor(
  config?: PatternRelationConfig
): PatternRelationExtractor {
  return new PatternRelationExtractor(config);
}
