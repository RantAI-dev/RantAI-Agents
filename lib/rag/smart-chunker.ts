/**
 * Smart Document Chunker
 *
 * Intelligently chunks documents with awareness of:
 * - Universal structure (headers, sections, lists, tables)
 * - Code blocks preservation
 * - Semantic boundaries (paragraphs, sentences)
 * - Hierarchy tracking for context
 *
 * Ported from komdigi-chat document-intelligence module
 */

import { Chunk } from "./chunker";

export interface SmartChunkMetadata {
  chunkType: "text" | "table" | "list" | "code" | "heading";
  documentSection?: string;
  headingLevel?: number;
  hierarchyPath?: string[];
  pageNumber?: number;
  section?: string;
}

export interface SmartChunk {
  chunkIndex: number;
  metadata: SmartChunkMetadata;
  text: string;
}

export type ChunkingStrategy =
  | "smart"
  | "semantic"
  | "fixed-size"
  | "structure-aware";

export interface SmartChunkingOptions {
  /** Maximum characters per chunk (default: 800) */
  maxChunkSize?: number;
  /** Overlap between chunks (default: 200) */
  overlapSize?: number;
  /** Keep code blocks intact (default: true) */
  preserveCodeBlocks?: boolean;
  /** Don't split across headings (default: true) */
  respectHeadingBoundaries?: boolean;
  /** Don't split across sections (default: true) */
  respectSectionBoundaries?: boolean;
  /** Chunking strategy (default: 'smart') */
  strategy?: ChunkingStrategy;
}

const DEFAULT_OPTIONS: Required<SmartChunkingOptions> = {
  maxChunkSize: 800,
  overlapSize: 200,
  preserveCodeBlocks: true,
  respectHeadingBoundaries: true,
  respectSectionBoundaries: true,
  strategy: "smart",
};

/**
 * Smart Document Chunker for any document type
 */
export class SmartChunker {
  private options: Required<SmartChunkingOptions>;

  constructor(options: SmartChunkingOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Chunk markdown text with smart structure awareness
   */
  async chunk(markdown: string): Promise<SmartChunk[]> {
    const chunks: SmartChunk[] = [];
    let chunkIndex = 0;

    // Split by paragraphs/blocks first
    let blocks = this.splitIntoBlocks(markdown);

    // If we got very few blocks but lots of text, the content likely lacks paragraph breaks
    // (common with PDF extraction). Fall back to sentence-based splitting.
    const totalLength = markdown.length;
    const avgBlockSize = blocks.length > 0 ? totalLength / blocks.length : totalLength;

    if (avgBlockSize > this.options.maxChunkSize * 2 && totalLength > this.options.maxChunkSize) {
      console.log(`[SmartChunker] Detected large blocks (avg ${Math.round(avgBlockSize)} chars), using sentence-based splitting`);
      blocks = this.splitBySentences(markdown);
    }

    let currentChunk = "";
    let currentMetadata: SmartChunkMetadata = { chunkType: "text" };
    let currentHierarchy: string[] = [];

    for (const block of blocks) {
      // Detect structure
      const structure = this.detectStructure(block);

      // Update hierarchy if heading detected
      if (structure.chunkType === "heading" && structure.headingLevel) {
        currentHierarchy = this.updateHierarchy(
          currentHierarchy,
          block,
          structure.headingLevel
        );
        structure.hierarchyPath = [...currentHierarchy];
      }

      // Check if new heading/section detected and we respect boundaries
      const shouldFlush =
        (this.options.respectHeadingBoundaries &&
          structure.chunkType === "heading" &&
          currentChunk.length > 0) ||
        (this.options.respectSectionBoundaries &&
          structure.section &&
          structure.section !== currentMetadata.section &&
          currentChunk.length > 0);

      if (shouldFlush) {
        // Flush current chunk
        chunks.push({
          chunkIndex: chunkIndex++,
          metadata: { ...currentMetadata },
          text: currentChunk.trim(),
        });
        currentChunk = "";
      }

      // Check if adding this block exceeds max size
      if (
        currentChunk.length + block.length > this.options.maxChunkSize &&
        currentChunk.length > 0
      ) {
        // Flush current chunk
        chunks.push({
          chunkIndex: chunkIndex++,
          metadata: { ...currentMetadata },
          text: currentChunk.trim(),
        });

        // Start new chunk with overlap
        const overlapText = this.getOverlap(
          currentChunk,
          this.options.overlapSize
        );
        currentChunk = overlapText;
      }

      // Add block to current chunk
      currentChunk += (currentChunk ? "\n\n" : "") + block;
      currentMetadata = {
        ...structure,
        hierarchyPath: structure.hierarchyPath || currentHierarchy,
      };
    }

    // Flush final chunk
    if (currentChunk.trim().length > 0) {
      chunks.push({
        chunkIndex: chunkIndex++,
        metadata: currentMetadata,
        text: currentChunk.trim(),
      });
    }

    return chunks;
  }

  /**
   * Split text by sentences for content without proper paragraph breaks
   * Groups sentences to approach target chunk size
   */
  private splitBySentences(text: string): string[] {
    // Split by sentence-ending punctuation followed by space or newline
    const sentenceRegex = /(?<=[.!?])\s+(?=[A-Z0-9])/g;
    const sentences = text.split(sentenceRegex).filter(s => s.trim().length > 0);

    if (sentences.length <= 1) {
      // No sentence boundaries found, fall back to fixed-size chunks
      return this.splitByFixedSize(text);
    }

    // Group sentences into blocks targeting maxChunkSize
    const blocks: string[] = [];
    let currentBlock = "";
    const targetSize = this.options.maxChunkSize;

    for (const sentence of sentences) {
      if (currentBlock.length + sentence.length > targetSize && currentBlock.length > 0) {
        blocks.push(currentBlock.trim());
        currentBlock = sentence;
      } else {
        currentBlock += (currentBlock ? " " : "") + sentence;
      }
    }

    if (currentBlock.trim()) {
      blocks.push(currentBlock.trim());
    }

    return blocks;
  }

  /**
   * Split text into fixed-size chunks as last resort
   */
  private splitByFixedSize(text: string): string[] {
    const blocks: string[] = [];
    const chunkSize = this.options.maxChunkSize;

    for (let i = 0; i < text.length; i += chunkSize) {
      let end = Math.min(i + chunkSize, text.length);

      // Try to break at word boundary
      if (end < text.length) {
        const lastSpace = text.lastIndexOf(" ", end);
        if (lastSpace > i + chunkSize / 2) {
          end = lastSpace;
        }
      }

      blocks.push(text.slice(i, end).trim());
      // Adjust i to account for word boundary break
      if (end !== i + chunkSize) {
        i = end - chunkSize; // Will be incremented by chunkSize in loop
      }
    }

    return blocks.filter(b => b.length > 0);
  }

  /**
   * Split text into blocks (paragraphs, code blocks, tables, etc.)
   */
  private splitIntoBlocks(text: string): string[] {
    const blocks: string[] = [];
    const lines = text.split("\n");
    let currentBlock = "";
    let inCodeBlock = false;
    let inTable = false;

    for (const line of lines) {
      // Detect code block
      if (line.trim().startsWith("```")) {
        inCodeBlock = !inCodeBlock;
        currentBlock += line + "\n";
        if (!inCodeBlock && this.options.preserveCodeBlocks) {
          blocks.push(currentBlock.trim());
          currentBlock = "";
        }
        continue;
      }

      // Detect table
      if (line.includes("|") && line.includes("---")) {
        inTable = true;
      }

      // In special block, accumulate lines
      if (inCodeBlock || inTable) {
        currentBlock += line + "\n";
        if (inTable && !line.includes("|")) {
          inTable = false;
          blocks.push(currentBlock.trim());
          currentBlock = "";
        }
        continue;
      }

      // Regular paragraph handling
      if (line.trim() === "") {
        if (currentBlock.trim()) {
          blocks.push(currentBlock.trim());
          currentBlock = "";
        }
      } else {
        currentBlock += line + "\n";
      }
    }

    // Flush remaining block
    if (currentBlock.trim()) {
      blocks.push(currentBlock.trim());
    }

    return blocks.filter((b) => b.length > 0);
  }

  /**
   * Detect structure in block
   */
  private detectStructure(block: string): SmartChunkMetadata {
    const metadata: SmartChunkMetadata = {
      chunkType: "text",
    };

    // Detect heading
    const headingMatch = block.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      metadata.chunkType = "heading";
      metadata.headingLevel = headingMatch[1].length;
      metadata.section = headingMatch[2].trim();
      metadata.documentSection = headingMatch[2].trim();
      return metadata;
    }

    // Detect table
    if (block.includes("|") && block.includes("---")) {
      metadata.chunkType = "table";
      return metadata;
    }

    // Detect code block
    if (block.startsWith("```") && block.endsWith("```")) {
      metadata.chunkType = "code";
      return metadata;
    }

    // Detect list
    if (/^[\d*+.-]\s+/.test(block)) {
      metadata.chunkType = "list";
      return metadata;
    }

    return metadata;
  }

  /**
   * Update hierarchy path when new heading is found
   */
  private updateHierarchy(
    current: string[],
    heading: string,
    level: number
  ): string[] {
    const cleanHeading = heading.replace(/^#{1,6}\s+/, "").trim();

    // Trim hierarchy to current level
    const newHierarchy = current.slice(0, level - 1);

    // Add new heading
    newHierarchy.push(cleanHeading);

    return newHierarchy;
  }

  /**
   * Get overlap text from end of chunk
   */
  private getOverlap(text: string, size: number): string {
    if (text.length <= size) return text;

    // Try to get complete sentences
    const overlap = text.slice(-size);
    const sentenceStart = overlap.lastIndexOf(". ");

    if (sentenceStart !== -1) {
      return overlap.slice(sentenceStart + 2);
    }

    return overlap;
  }
}

/**
 * Convert SmartChunk to the standard Chunk interface for compatibility
 */
function smartChunkToChunk(
  smartChunk: SmartChunk,
  documentTitle: string,
  category: string,
  subcategory?: string
): Chunk {
  return {
    content: smartChunk.text,
    metadata: {
      documentTitle,
      category,
      subcategory,
      section:
        smartChunk.metadata.section ||
        smartChunk.metadata.hierarchyPath?.join(" > "),
      chunkIndex: smartChunk.chunkIndex,
    },
  };
}

/**
 * Chunk a document using smart chunking and return standard Chunk interface
 */
export async function smartChunkDocument(
  content: string,
  documentTitle: string,
  category: string,
  subcategory?: string,
  options?: SmartChunkingOptions
): Promise<Chunk[]> {
  const chunker = new SmartChunker(options);
  const smartChunks = await chunker.chunk(content);

  return smartChunks
    .map((sc) => smartChunkToChunk(sc, documentTitle, category, subcategory))
    .filter((chunk) => chunk.content.length > 0);
}

/**
 * Chunk multiple documents using smart chunking
 */
export async function smartChunkDocuments(
  documents: Array<{
    content: string;
    title: string;
    category: string;
    subcategory?: string;
  }>,
  options?: SmartChunkingOptions
): Promise<Chunk[]> {
  const allChunks: Chunk[] = [];

  for (const doc of documents) {
    const chunks = await smartChunkDocument(
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
 * Quick helper to chunk document with default options
 */
export async function chunkWithSmartChunker(
  markdown: string,
  options?: SmartChunkingOptions
): Promise<SmartChunk[]> {
  const chunker = new SmartChunker(options);
  return chunker.chunk(markdown);
}
