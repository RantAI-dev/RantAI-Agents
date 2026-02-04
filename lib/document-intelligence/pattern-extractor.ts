/**
 * Pattern-based Entity Extractor
 *
 * Fast regex-based extraction for common entity types.
 * Used as a fallback when LLM is unavailable or for performance.
 * Zero API cost - runs entirely locally.
 */

import { Entity, PatternExtractionConfig } from "./types";

const DEFAULT_CONFIG: Required<PatternExtractionConfig> = {
  extractUniversal: true,
  extractFinancial: true,
  extractTechnical: true,
};

/**
 * Helper to get all matches from a regex pattern
 */
function getAllMatches(text: string, pattern: RegExp): RegExpExecArray[] {
  const matches: RegExpExecArray[] = [];
  let match: RegExpExecArray | null;
  // Reset lastIndex for global patterns
  pattern.lastIndex = 0;
  while ((match = pattern.exec(text)) !== null) {
    matches.push(match);
    // Prevent infinite loop for zero-length matches
    if (match.index === pattern.lastIndex) {
      pattern.lastIndex++;
    }
  }
  return matches;
}

/**
 * Pattern-based Entity Extractor
 */
export class PatternEntityExtractor {
  private config: Required<PatternExtractionConfig>;

  constructor(config: PatternExtractionConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Extract entities using regex patterns
   */
  async extract(
    text: string,
    documentId?: string,
    chunkId?: string
  ): Promise<Entity[]> {
    const entities: Entity[] = [];

    if (this.config.extractUniversal) {
      entities.push(...this.extractUniversalEntities(text, documentId, chunkId));
    }

    if (this.config.extractFinancial) {
      entities.push(
        ...this.extractFinancialEntities(text, documentId, chunkId)
      );
    }

    if (this.config.extractTechnical) {
      entities.push(
        ...this.extractTechnicalEntities(text, documentId, chunkId)
      );
    }

    return this.deduplicateEntities(entities);
  }

  /**
   * Extract universal entities (email, URL, phone, dates, etc.)
   */
  private extractUniversalEntities(
    text: string,
    documentId?: string,
    chunkId?: string
  ): Entity[] {
    const entities: Entity[] = [];

    // Email addresses
    const emailPattern = /\b[\w%+.-]+@[\d.A-Za-z-]+\.[A-Za-z]{2,}\b/g;
    for (const match of getAllMatches(text, emailPattern)) {
      entities.push({
        name: match[0],
        type: "Email",
        confidence: 0.95,
        documentId,
        chunkId,
        metadata: { pattern: "email", rawText: match[0] },
      });
    }

    // URLs
    const urlPattern =
      /https?:\/\/(?:www\.)?[\w#%+.:=@~-]{1,256}\.[\d()A-Za-z]{1,6}\b(?:[\w#%&()+./:=?@~-]*)/g;
    for (const match of getAllMatches(text, urlPattern)) {
      entities.push({
        name: match[0],
        type: "URL",
        confidence: 0.95,
        documentId,
        chunkId,
        metadata: { pattern: "url", rawText: match[0] },
      });
    }

    // Phone numbers (various formats)
    const phonePatterns = [
      /(?:\+?(\d{1,3}))?[ (.-]*(\d{3})[ ).-]*(\d{3})[ .-]*(\d{4})/g,
      /\+?\d{1,3}[-.\s]?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g,
    ];
    for (const pattern of phonePatterns) {
      for (const match of getAllMatches(text, pattern)) {
        // Avoid duplicates from multiple patterns
        if (!entities.some((e) => e.name === match[0] && e.type === "Phone")) {
          entities.push({
            name: match[0],
            type: "Phone",
            confidence: 0.7,
            documentId,
            chunkId,
            metadata: { pattern: "phone", rawText: match[0] },
          });
        }
      }
    }

    // Dates (multiple formats)
    const datePatterns = [
      /(?:\d{1,2}[/-]){2}\d{2,4}/g, // 12/31/2023, 31-12-2023
      /\d{4}(?:[/-]\d{1,2}){2}/g, // 2023-12-31
      /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi,
      /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}\b/gi,
    ];

    for (const pattern of datePatterns) {
      for (const match of getAllMatches(text, pattern)) {
        if (!entities.some((e) => e.name === match[0] && e.type === "Date")) {
          entities.push({
            name: match[0],
            type: "Date",
            confidence: 0.85,
            documentId,
            chunkId,
            metadata: { pattern: "date", rawText: match[0] },
          });
        }
      }
    }

    return entities;
  }

  /**
   * Extract financial entities (currency, amounts)
   */
  private extractFinancialEntities(
    text: string,
    documentId?: string,
    chunkId?: string
  ): Entity[] {
    const entities: Entity[] = [];

    // Currency amounts (various formats)
    const currencyPatterns = [
      /\$\s*[\d,]+(?:\.\d{2})?/g, // $1,234.56
      /USD\s*[\d,]+(?:\.\d{2})?/gi, // USD 1,234.56
      /€\s*[\d,]+(?:\.\d{2})?/g, // €1,234.56
      /EUR\s*[\d,]+(?:\.\d{2})?/gi, // EUR 1,234.56
      /£\s*[\d,]+(?:\.\d{2})?/g, // £1,234.56
      /GBP\s*[\d,]+(?:\.\d{2})?/gi, // GBP 1,234.56
      /Rp\.?\s*[\d,.]+/gi, // Rp 1.234.567 (Indonesian Rupiah)
      /IDR\s*[\d,.]+/gi, // IDR 1,234,567
    ];

    for (const pattern of currencyPatterns) {
      for (const match of getAllMatches(text, pattern)) {
        entities.push({
          name: match[0],
          type: "Currency",
          confidence: 0.9,
          documentId,
          chunkId,
          metadata: { pattern: "currency", rawText: match[0] },
        });
      }
    }

    // Percentages
    const percentPattern = /\b\d+(?:\.\d+)?%/g;
    for (const match of getAllMatches(text, percentPattern)) {
      entities.push({
        name: match[0],
        type: "Number",
        confidence: 0.9,
        documentId,
        chunkId,
        metadata: { pattern: "percentage", rawText: match[0] },
      });
    }

    return entities;
  }

  /**
   * Extract technical entities (APIs, functions, etc.)
   */
  private extractTechnicalEntities(
    text: string,
    documentId?: string,
    chunkId?: string
  ): Entity[] {
    const entities: Entity[] = [];

    // API endpoints
    const apiPattern = /\/api\/[\w/-]+/g;
    for (const match of getAllMatches(text, apiPattern)) {
      entities.push({
        name: match[0],
        type: "API",
        confidence: 0.85,
        documentId,
        chunkId,
        metadata: { pattern: "api_endpoint", rawText: match[0] },
      });
    }

    // Function calls (e.g., functionName())
    const functionPattern = /\b[A-Z_a-z]\w*\s*\(\)/g;
    for (const match of getAllMatches(text, functionPattern)) {
      // Skip common words that look like functions
      const skipWords = ["if()", "for()", "while()", "switch()", "catch()"];
      if (!skipWords.includes(match[0].toLowerCase())) {
        entities.push({
          name: match[0],
          type: "Function",
          confidence: 0.7,
          documentId,
          chunkId,
          metadata: { pattern: "function_call", rawText: match[0] },
        });
      }
    }

    // Environment variables
    const envPattern = /\b[A-Z][A-Z0-9_]{2,}\b(?=\s*[=:]|\s+is|\s+set)/g;
    for (const match of getAllMatches(text, envPattern)) {
      entities.push({
        name: match[0],
        type: "Technology",
        confidence: 0.6,
        documentId,
        chunkId,
        metadata: { pattern: "env_variable", rawText: match[0] },
      });
    }

    // Error codes (common patterns)
    const errorPattern = /\b(?:ERR|ERROR|E)[-_]?\d{3,5}\b/gi;
    for (const match of getAllMatches(text, errorPattern)) {
      entities.push({
        name: match[0],
        type: "Error",
        confidence: 0.8,
        documentId,
        chunkId,
        metadata: { pattern: "error_code", rawText: match[0] },
      });
    }

    return entities;
  }

  /**
   * Deduplicate entities by name and type
   */
  private deduplicateEntities(entities: Entity[]): Entity[] {
    const seen = new Set<string>();
    const unique: Entity[] = [];

    for (const entity of entities) {
      const key = `${entity.type}:${entity.name}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(entity);
      }
    }

    return unique;
  }
}

/**
 * Helper function to extract entities with patterns
 */
export async function extractEntitiesWithPatterns(
  text: string,
  documentId?: string,
  chunkId?: string,
  config?: PatternExtractionConfig
): Promise<Entity[]> {
  const extractor = new PatternEntityExtractor(config);
  return extractor.extract(text, documentId, chunkId);
}
