/**
 * RAG (Retrieval Augmented Generation) Module
 *
 * This module provides semantic search capabilities for the HorizonLife insurance chatbot.
 * It uses OpenAI embeddings and PostgreSQL pgvector for efficient vector similarity search.
 */

// Embeddings
export { generateEmbedding, generateEmbeddings } from "./embeddings";

// Text chunking
export { chunkDocument, chunkDocuments, prepareChunkForEmbedding } from "./chunker";
export type { Chunk, ChunkOptions } from "./chunker";

// Vector store operations
export {
  storeDocument,
  searchSimilar,
  searchWithThreshold,
  deleteDocument,
  listDocuments,
  clearAllDocuments,
} from "./vector-store";
export type { SearchResult } from "./vector-store";

// Retrieval
export {
  retrieveContext,
  smartRetrieve,
  formatContextForPrompt,
  detectQueryCategory,
} from "./retriever";
export type { RetrievalResult } from "./retriever";

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
