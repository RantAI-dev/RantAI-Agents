/**
 * Text chunking utilities for RAG
 * Splits documents into smaller chunks suitable for embedding and retrieval
 */

export interface Chunk {
  content: string;
  metadata: {
    documentTitle: string;
    category: string;
    subcategory?: string;
    section?: string;
    chunkIndex: number;
  };
}

export interface ChunkOptions {
  chunkSize?: number; // Target size in characters
  chunkOverlap?: number; // Overlap between chunks
  separators?: string[]; // Separators to split on (in order of priority)
}

const DEFAULT_OPTIONS: Required<ChunkOptions> = {
  chunkSize: 1000,
  chunkOverlap: 200,
  separators: ["\n## ", "\n### ", "\n#### ", "\n\n", "\n", ". ", " "],
};

/**
 * Split text recursively using multiple separators
 * Tries to keep semantic units together (sections, paragraphs, sentences)
 */
function recursiveSplit(
  text: string,
  separators: string[],
  chunkSize: number
): string[] {
  if (text.length <= chunkSize || separators.length === 0) {
    return [text];
  }

  const separator = separators[0];
  const remainingSeparators = separators.slice(1);

  const splits = text.split(separator);
  const chunks: string[] = [];
  let currentChunk = "";

  for (const split of splits) {
    const potentialChunk = currentChunk
      ? currentChunk + separator + split
      : split;

    if (potentialChunk.length <= chunkSize) {
      currentChunk = potentialChunk;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
      }

      // If the split itself is too large, recursively split it
      if (split.length > chunkSize) {
        const subChunks = recursiveSplit(split, remainingSeparators, chunkSize);
        chunks.push(...subChunks);
        currentChunk = "";
      } else {
        currentChunk = split;
      }
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

/**
 * Add overlap to chunks for better context continuity
 */
function addOverlap(chunks: string[], overlap: number): string[] {
  if (overlap <= 0 || chunks.length <= 1) {
    return chunks;
  }

  const result: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    let chunk = chunks[i];

    // Add overlap from previous chunk
    if (i > 0) {
      const prevChunk = chunks[i - 1];
      const overlapText = prevChunk.slice(-overlap);
      chunk = overlapText + chunk;
    }

    result.push(chunk);
  }

  return result;
}

/**
 * Extract section header from markdown content
 */
function extractSectionHeader(text: string): string | undefined {
  const headerMatch = text.match(/^#+\s+(.+)$/m);
  return headerMatch ? headerMatch[1] : undefined;
}

/**
 * Chunk a document into smaller pieces suitable for embedding
 */
export function chunkDocument(
  content: string,
  documentTitle: string,
  category: string,
  subcategory?: string,
  options?: ChunkOptions
): Chunk[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // First, split the content
  const rawChunks = recursiveSplit(content, opts.separators, opts.chunkSize);

  // Add overlap
  const overlappedChunks = addOverlap(rawChunks, opts.chunkOverlap);

  // Create chunk objects with metadata
  const chunks: Chunk[] = overlappedChunks.map((content, index) => {
    const section = extractSectionHeader(content);

    return {
      content: content.trim(),
      metadata: {
        documentTitle,
        category,
        subcategory,
        section,
        chunkIndex: index,
      },
    };
  });

  // Filter out empty chunks
  return chunks.filter((chunk) => chunk.content.length > 0);
}

/**
 * Chunk multiple documents
 */
export function chunkDocuments(
  documents: Array<{
    content: string;
    title: string;
    category: string;
    subcategory?: string;
  }>,
  options?: ChunkOptions
): Chunk[] {
  const allChunks: Chunk[] = [];

  for (const doc of documents) {
    const chunks = chunkDocument(
      doc.content,
      doc.title,
      doc.category,
      doc.subcategory,
      options
    );
    allChunks.push(...chunks);
  }

  return allChunks;
}

/**
 * Prepare chunk content for embedding
 * Adds metadata context to improve retrieval quality
 */
export function prepareChunkForEmbedding(chunk: Chunk): string {
  const parts: string[] = [];

  parts.push(`Category: ${chunk.metadata.category}`);

  if (chunk.metadata.subcategory) {
    parts.push(`Topic: ${chunk.metadata.subcategory}`);
  }

  if (chunk.metadata.section) {
    parts.push(`Section: ${chunk.metadata.section}`);
  }

  parts.push("");
  parts.push(chunk.content);

  return parts.join("\n");
}
