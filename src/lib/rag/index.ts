/**
 * RAG (Retrieval Augmented Generation) Module
 *
 * This module provides semantic search capabilities for RantAI Agents.
 * It uses OpenAI embeddings and SurrealDB for efficient vector similarity search.
 */

// Embeddings
export { generateEmbedding, generateEmbeddings } from "./embeddings";

// Text chunking
export { chunkDocument, chunkDocuments, prepareChunkForEmbedding } from "./chunker";
export type { Chunk, ChunkOptions } from "./chunker";

// Smart chunking (semantic-aware)
export {
  SmartChunker,
  smartChunkDocument,
  smartChunkDocuments,
  chunkWithSmartChunker,
} from "./smart-chunker";
export type {
  SmartChunk,
  SmartChunkMetadata,
  SmartChunkingOptions,
  ChunkingStrategy,
} from "./smart-chunker";

// Vector store operations
export {
  storeDocument,
  storeChunks,
  searchSimilar,
  searchWithThreshold,
  deleteDocument,
  listDocuments,
  clearAllDocuments,
  getDocumentChunkCount,
} from "./vector-store";
export type { SearchResult } from "./vector-store";

// Retrieval
export {
  retrieveContext,
  smartRetrieve,
  formatContextForPrompt,
  detectQueryCategory,
  hybridRetrieve,
  smartHybridRetrieve,
  formatHybridContextForPrompt,
} from "./retriever";
export type { RetrievalResult, HybridRetrievalResult } from "./retriever";

// Hybrid Search
export {
  HybridSearch,
  createHybridSearch,
  hybridSearch,
} from "./hybrid-search";
export type {
  HybridSearchConfig,
  HybridSearchResult,
  HybridSearchStats,
  ChunkResult,
} from "./hybrid-search";

// Re-ranking
export {
  Reranker,
  createReranker,
  rerank,
  rerankResults,
} from "./reranker";
export type {
  RerankerConfig,
  RerankResult,
  RerankResponse,
} from "./reranker";

// Ingestion
export {
  ingestKnowledgeBase,
  ingestSingleDocument,
  ingestFile,
  ingestDirectory,
} from "./ingest";

// File processing
export {
  processFile,
  processFiles,
  scanDirectory,
  detectFileType,
  isSupportedFile,
  getSupportedExtensions,
} from "./file-processor";
export type { ProcessedFile, SupportedFileType } from "./file-processor";
