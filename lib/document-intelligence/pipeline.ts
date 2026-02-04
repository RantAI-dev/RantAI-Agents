/**
 * Document Processing Pipeline
 *
 * Orchestrates the complete document intelligence workflow:
 * 1. Parse document (PDF, images, text files)
 * 2. Chunk into semantic pieces (smart chunking)
 * 3. Generate embeddings
 * 4. Extract entities (pattern + LLM)
 * 5. Store in SurrealDB (chunks, embeddings, entities)
 */

import { getSurrealClient, SurrealDBClient } from "../surrealdb";
import { SmartChunker, SmartChunkingOptions } from "../rag/smart-chunker";
import { generateEmbeddings } from "../rag/embeddings";
import { processFile, ProcessedFile } from "../rag/file-processor";
import { extractEntities } from "./index";
import {
  Entity,
  ProcessingProgress,
  ProgressCallback,
  HybridExtractionConfig,
} from "./types";

/**
 * Pipeline configuration
 */
export interface PipelineConfig {
  /** Maximum chunk size (default: 800) */
  maxChunkSize?: number;
  /** Chunk overlap (default: 200) */
  chunkOverlap?: number;
  /** Preserve code blocks in chunks (default: true) */
  preserveCodeBlocks?: boolean;
  /** Respect heading boundaries (default: true) */
  respectHeadingBoundaries?: boolean;
  /** Enable entity extraction (default: true) */
  extractEntities?: boolean;
  /** Use LLM for entity extraction (default: true) */
  useLLMExtraction?: boolean;
  /** Use pattern-based entity extraction (default: true) */
  usePatternExtraction?: boolean;
  /** Skip embedding generation (for testing) */
  skipEmbeddings?: boolean;
  /** Skip storage (for testing) */
  skipStorage?: boolean;
}

/**
 * Processing result
 */
export interface ProcessingResult {
  /** Processing status */
  status: "completed" | "failed";
  /** Document ID */
  documentId: string;
  /** File name */
  filename: string;
  /** File type */
  fileType: string;
  /** Total chunks created */
  totalChunks: number;
  /** Total entities extracted */
  totalEntities: number;
  /** Processing time in milliseconds */
  processingTimeMs: number;
  /** Chunk IDs in SurrealDB */
  chunkIds: string[];
  /** Entity IDs in SurrealDB */
  entityIds: string[];
  /** Error message (if failed) */
  error?: string;
}

/**
 * Processing stage
 */
export type ProcessingStage =
  | "parsing"
  | "chunking"
  | "embedding"
  | "extracting"
  | "storing"
  | "complete";

const DEFAULT_CONFIG: Required<PipelineConfig> = {
  maxChunkSize: 800,
  chunkOverlap: 200,
  preserveCodeBlocks: true,
  respectHeadingBoundaries: true,
  extractEntities: true,
  useLLMExtraction: true,
  usePatternExtraction: true,
  skipEmbeddings: false,
  skipStorage: false,
};

/**
 * Document Processing Pipeline
 */
export class DocumentPipeline {
  private config: Required<PipelineConfig>;
  private dbClient: SurrealDBClient | null = null;

  constructor(config: PipelineConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize database client
   */
  private async getClient(): Promise<SurrealDBClient> {
    if (!this.dbClient) {
      this.dbClient = await getSurrealClient();
    }
    return this.dbClient;
  }

  /**
   * Process a document file end-to-end
   */
  async processFile(
    filePath: string,
    documentId: string,
    options?: {
      title?: string;
      category?: string;
      subcategory?: string;
    },
    onProgress?: ProgressCallback
  ): Promise<ProcessingResult> {
    const startTime = Date.now();

    try {
      // 1. Parse document
      this.reportProgress(onProgress, "parsing", 0, "Parsing document...");
      const parsed = await processFile(filePath);

      if (!parsed.content || parsed.content.trim().length === 0) {
        throw new Error("No content extracted from document");
      }

      // Continue with the parsed content
      return this.processContent(
        parsed.content,
        documentId,
        {
          ...options,
          filename: parsed.originalPath.split("/").pop() || "document",
          fileType: parsed.fileType,
        },
        onProgress,
        startTime
      );
    } catch (error) {
      return {
        status: "failed",
        documentId,
        filename: filePath.split("/").pop() || "unknown",
        fileType: "unknown",
        totalChunks: 0,
        totalEntities: 0,
        processingTimeMs: Date.now() - startTime,
        chunkIds: [],
        entityIds: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Process pre-extracted text content
   */
  async processContent(
    content: string,
    documentId: string,
    options?: {
      title?: string;
      category?: string;
      subcategory?: string;
      filename?: string;
      fileType?: string;
    },
    onProgress?: ProgressCallback,
    startTime?: number
  ): Promise<ProcessingResult> {
    const start = startTime || Date.now();
    const filename = options?.filename || "document";
    const fileType = options?.fileType || "text";

    try {
      if (!content || content.trim().length === 0) {
        throw new Error("No content provided for processing");
      }

      // 2. Chunk document
      this.reportProgress(onProgress, "chunking", 20, "Chunking document...");
      const chunker = new SmartChunker({
        maxChunkSize: this.config.maxChunkSize,
        overlapSize: this.config.chunkOverlap,
        preserveCodeBlocks: this.config.preserveCodeBlocks,
        respectHeadingBoundaries: this.config.respectHeadingBoundaries,
      });

      const chunks = await chunker.chunk(content);

      if (chunks.length === 0) {
        throw new Error("No chunks generated from document");
      }

      // 3. Generate embeddings
      this.reportProgress(
        onProgress,
        "embedding",
        40,
        `Generating embeddings for ${chunks.length} chunks...`
      );
      let embeddings: number[][] = [];

      if (!this.config.skipEmbeddings) {
        const texts = chunks.map((c) => c.text);
        embeddings = await generateEmbeddings(texts);
      } else {
        // Create dummy embeddings for testing (1536 dimensions for OpenAI)
        embeddings = chunks.map(() => Array(1536).fill(0));
      }

      // 4. Extract entities
      this.reportProgress(
        onProgress,
        "extracting",
        60,
        "Extracting entities..."
      );
      let entities: Entity[] = [];

      if (this.config.extractEntities) {
        entities = await extractEntities(content, documentId, undefined, {
          useLLM: this.config.useLLMExtraction,
          usePatterns: this.config.usePatternExtraction,
        });
      }

      // 5. Store in database
      this.reportProgress(
        onProgress,
        "storing",
        80,
        "Storing chunks and entities..."
      );
      let chunkIds: string[] = [];
      let entityIds: string[] = [];

      if (!this.config.skipStorage) {
        const client = await this.getClient();
        const storageResult = await this.storeResults(
          client,
          documentId,
          chunks,
          embeddings,
          entities,
          options
        );
        chunkIds = storageResult.chunkIds;
        entityIds = storageResult.entityIds;
      }

      // Done!
      this.reportProgress(onProgress, "complete", 100, "Processing complete!");

      return {
        status: "completed",
        documentId,
        filename,
        fileType,
        totalChunks: chunks.length,
        totalEntities: entities.length,
        processingTimeMs: Date.now() - start,
        chunkIds,
        entityIds,
      };
    } catch (error) {
      return {
        status: "failed",
        documentId,
        filename,
        fileType,
        totalChunks: 0,
        totalEntities: 0,
        processingTimeMs: Date.now() - start,
        chunkIds: [],
        entityIds: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Store results in SurrealDB
   */
  private async storeResults(
    client: SurrealDBClient,
    documentId: string,
    chunks: Array<{ text: string; chunkIndex: number; metadata: unknown }>,
    embeddings: number[][],
    entities: Entity[],
    options?: {
      title?: string;
      category?: string;
      subcategory?: string;
    }
  ): Promise<{ chunkIds: string[]; entityIds: string[] }> {
    const chunkIds: string[] = [];
    const entityIds: string[] = [];

    // Store chunks with embeddings
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = embeddings[i];

      try {
        const result = await client.query(
          `CREATE document_chunk SET
            id = $id,
            document_id = $document_id,
            content = $content,
            chunk_index = $chunk_index,
            embedding = $embedding,
            metadata = $metadata,
            created_at = time::now()`,
          {
            id: `${documentId}_${i}`,
            document_id: documentId,
            content: chunk.text,
            chunk_index: chunk.chunkIndex,
            embedding,
            metadata: {
              ...(typeof chunk.metadata === "object" && chunk.metadata !== null
                ? chunk.metadata
                : {}),
              title: options?.title,
              category: options?.category,
              section: options?.subcategory,
            },
          }
        );

        chunkIds.push(`${documentId}_${i}`);
      } catch (error) {
        console.error(`[Pipeline] Failed to store chunk ${i}:`, error);
      }
    }

    // Store entities
    for (const entity of entities) {
      try {
        const entityId = `${documentId}_entity_${entity.name
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "_")}`;

        await client.query(
          `CREATE entity SET
            id = $id,
            name = $name,
            type = $type,
            confidence = $confidence,
            document_id = $document_id,
            metadata = $metadata,
            created_at = time::now()`,
          {
            id: entityId,
            name: entity.name,
            type: entity.type,
            confidence: entity.confidence,
            document_id: documentId,
            metadata: entity.metadata,
          }
        );

        entityIds.push(entityId);
      } catch (error) {
        console.error(
          `[Pipeline] Failed to store entity "${entity.name}":`,
          error
        );
      }
    }

    console.log(
      `[Pipeline] Stored ${chunkIds.length} chunks and ${entityIds.length} entities`
    );

    return { chunkIds, entityIds };
  }

  /**
   * Report progress via callback
   */
  private reportProgress(
    callback: ProgressCallback | undefined,
    stage: ProcessingStage,
    progress: number,
    message: string
  ): void {
    if (callback) {
      callback({
        stage,
        progress,
        message,
      });
    }
  }

  /**
   * Health check for pipeline components
   */
  async healthCheck(): Promise<{
    chunker: boolean;
    embedder: boolean;
    entityExtractor: boolean;
    database: boolean;
  }> {
    const checks = {
      chunker: true, // Always available (no external deps)
      embedder: false,
      entityExtractor: false,
      database: false,
    };

    try {
      // Check embedder (requires API key)
      if (!this.config.skipEmbeddings) {
        const testEmb = await generateEmbeddings(["test"]);
        checks.embedder = testEmb.length > 0 && testEmb[0].length > 0;
      } else {
        checks.embedder = true;
      }

      // Check entity extractor
      if (this.config.extractEntities) {
        const testEntities = await extractEntities("John works at Acme Corp.");
        checks.entityExtractor = testEntities.length > 0;
      } else {
        checks.entityExtractor = true;
      }

      // Check database
      if (!this.config.skipStorage) {
        const client = await this.getClient();
        checks.database = await client.healthCheck();
      } else {
        checks.database = true;
      }
    } catch (error) {
      console.error("[Pipeline] Health check failed:", error);
    }

    return checks;
  }
}

/**
 * Create document pipeline with defaults
 */
export function createDocumentPipeline(
  config?: PipelineConfig
): DocumentPipeline {
  return new DocumentPipeline(config);
}

/**
 * Quick process function for single documents
 */
export async function processDocument(
  content: string,
  documentId: string,
  options?: {
    title?: string;
    category?: string;
    subcategory?: string;
    onProgress?: ProgressCallback;
    config?: PipelineConfig;
  }
): Promise<ProcessingResult> {
  const pipeline = new DocumentPipeline(options?.config);
  return pipeline.processContent(
    content,
    documentId,
    {
      title: options?.title,
      category: options?.category,
      subcategory: options?.subcategory,
    },
    options?.onProgress
  );
}
