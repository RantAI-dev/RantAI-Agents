import * as fs from "fs";
import * as path from "path";
import { chunkDocument, ChunkOptions } from "./chunker";
import { storeDocument, clearAllDocuments } from "./vector-store";
import {
  processFile,
  scanDirectory,
  detectFileType,
  isSupportedFile,
  getSupportedExtensions,
} from "./file-processor";

/**
 * Ingestion script for loading knowledge base documents into the vector store
 * Supports: Markdown (.md), PDF (.pdf), Images (.png, .jpg, .jpeg, .gif, .webp)
 */

// Document configuration - maps files to their categories
const KNOWLEDGE_BASE_CONFIG = [
  {
    filename: "life-insurance.md",
    title: "Life Insurance Products",
    category: "LIFE_INSURANCE",
    subcategory: "Products",
  },
  {
    filename: "health-insurance.md",
    title: "Health Insurance Products",
    category: "HEALTH_INSURANCE",
    subcategory: "Products",
  },
  {
    filename: "home-insurance.md",
    title: "Home Insurance Products",
    category: "HOME_INSURANCE",
    subcategory: "Products",
  },
  {
    filename: "company-info.md",
    title: "Company Information",
    category: "GENERAL",
    subcategory: "Company",
  },
  {
    filename: "faq-general.md",
    title: "Frequently Asked Questions",
    category: "FAQ",
    subcategory: "General",
  },
  {
    filename: "claim-procedures.md",
    title: "Claim Procedures",
    category: "CLAIMS",
    subcategory: "Procedures",
  },
  {
    filename: "policy-underwriting.md",
    title: "Policy & Underwriting Guide",
    category: "POLICY",
    subcategory: "Underwriting",
  },
  {
    filename: "vehicle-insurance.md",
    title: "Vehicle Insurance Products",
    category: "VEHICLE_INSURANCE",
    subcategory: "Products",
  },
];

const CHUNK_OPTIONS: ChunkOptions = {
  chunkSize: 1000,
  chunkOverlap: 200,
};

/**
 * Ingest all knowledge base documents
 */
export async function ingestKnowledgeBase(
  knowledgeBasePath: string,
  clearExisting: boolean = true,
  groupIds?: string[]
): Promise<void> {
  console.log("Starting knowledge base ingestion...");
  console.log(`Knowledge base path: ${knowledgeBasePath}`);
  if (groupIds?.length) {
    console.log(`Assigning to groups: ${groupIds.join(", ")}`);
  }

  // Optionally clear existing documents
  if (clearExisting) {
    console.log("Clearing existing documents...");
    await clearAllDocuments();
  }

  let totalChunks = 0;

  // Process each document
  for (const config of KNOWLEDGE_BASE_CONFIG) {
    const filePath = path.join(knowledgeBasePath, config.filename);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.warn(`Warning: File not found: ${filePath}`);
      continue;
    }

    console.log(`\nProcessing: ${config.filename}`);

    // Read file content
    const content = fs.readFileSync(filePath, "utf-8");

    // Chunk the document
    const chunks = chunkDocument(
      content,
      config.title,
      config.category,
      config.subcategory,
      CHUNK_OPTIONS
    );

    console.log(`  - Created ${chunks.length} chunks`);

    // Store document and chunks with embeddings
    await storeDocument(
      config.title,
      content,
      [config.category],
      config.subcategory,
      chunks,
      groupIds
    );

    totalChunks += chunks.length;
  }

  console.log(`\n✓ Ingestion complete!`);
  console.log(
    `  - Documents processed: ${KNOWLEDGE_BASE_CONFIG.length}`
  );
  console.log(`  - Total chunks created: ${totalChunks}`);
}

/**
 * Ingest a single document (legacy - markdown only)
 */
export async function ingestSingleDocument(
  filePath: string,
  title: string,
  category: string,
  subcategory?: string
): Promise<void> {
  console.log(`Ingesting document: ${filePath}`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, "utf-8");

  const chunks = chunkDocument(
    content,
    title,
    category,
    subcategory,
    CHUNK_OPTIONS
  );

  await storeDocument(title, content, [category], subcategory ?? null, chunks);

  console.log(`✓ Document ingested with ${chunks.length} chunks`);
}

/**
 * Ingest a single file with auto-detection of file type
 * Supports: Markdown, PDF, Images
 */
export async function ingestFile(
  filePath: string,
  title: string,
  category: string,
  subcategory?: string,
  groupIds?: string[]
): Promise<{ chunks: number; fileType: string }> {
  console.log(`Ingesting file: ${filePath}`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const fileType = detectFileType(filePath);
  if (!fileType) {
    throw new Error(
      `Unsupported file type: ${filePath}. Supported: ${getSupportedExtensions().join(", ")}`
    );
  }

  // Process file to extract content
  const processed = await processFile(filePath);
  const content = processed.content;

  // Chunk the content
  const chunks = chunkDocument(
    content,
    title,
    category,
    subcategory,
    CHUNK_OPTIONS
  );

  // Store document and chunks
  await storeDocument(
    title,
    content,
    [category],
    subcategory ?? null,
    chunks,
    groupIds
  );

  console.log(`✓ ${fileType.toUpperCase()} ingested with ${chunks.length} chunks`);

  return { chunks: chunks.length, fileType };
}

/**
 * Auto-ingest all supported files from a directory
 * Files are categorized based on their parent folder name or defaults to GENERAL
 */
export async function ingestDirectory(
  dirPath: string,
  options: {
    clearExisting?: boolean;
    defaultCategory?: string;
    defaultSubcategory?: string;
    groupIds?: string[];
  } = {}
): Promise<{
  filesProcessed: number;
  totalChunks: number;
  byType: Record<string, number>;
}> {
  const {
    clearExisting = false,
    defaultCategory = "GENERAL",
    defaultSubcategory = "Documents",
    groupIds,
  } = options;

  console.log("Scanning directory for supported files...");
  console.log(`Supported formats: ${getSupportedExtensions().join(", ")}`);

  if (clearExisting) {
    console.log("Clearing existing documents...");
    await clearAllDocuments();
  }

  const files = scanDirectory(dirPath);
  console.log(`Found ${files.length} supported files`);

  let totalChunks = 0;
  let filesProcessed = 0;
  const byType: Record<string, number> = {};

  for (const filePath of files) {
    try {
      const fileName = path.basename(filePath, path.extname(filePath));
      const title = fileName
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

      // Try to infer category from parent folder
      const parentFolder = path.basename(path.dirname(filePath));
      const category = inferCategory(parentFolder) || defaultCategory;

      const result = await ingestFile(
        filePath,
        title,
        category,
        defaultSubcategory,
        groupIds
      );

      totalChunks += result.chunks;
      filesProcessed++;
      byType[result.fileType] = (byType[result.fileType] || 0) + 1;
    } catch (error) {
      console.error(`Failed to process ${filePath}:`, error);
    }
  }

  console.log(`\n✓ Directory ingestion complete!`);
  console.log(`  - Files processed: ${filesProcessed}`);
  console.log(`  - Total chunks: ${totalChunks}`);
  console.log(`  - By type:`, byType);

  return { filesProcessed, totalChunks, byType };
}

/**
 * Infer category from folder name
 */
function inferCategory(folderName: string): string | null {
  const lower = folderName.toLowerCase();

  if (lower.includes("life")) return "LIFE_INSURANCE";
  if (lower.includes("health")) return "HEALTH_INSURANCE";
  if (lower.includes("home") || lower.includes("property")) return "HOME_INSURANCE";
  if (lower.includes("faq")) return "FAQ";
  if (lower.includes("company") || lower.includes("about")) return "GENERAL";

  return null;
}
