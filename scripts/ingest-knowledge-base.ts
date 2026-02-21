/**
 * Script to ingest knowledge base documents into the vector store
 *
 * Usage:
 *   pnpm rag:ingest              # Ingest predefined markdown files
 *   pnpm rag:ingest --all        # Auto-detect and ingest all supported files
 *
 * Supported file types:
 *   - Markdown (.md, .markdown)
 *   - PDF (.pdf)
 *   - Images (.png, .jpg, .jpeg, .gif, .webp)
 *
 * This script:
 * 1. Reads files from the knowledge-base directory
 * 2. Extracts text (PDFs) or descriptions (images via vision AI)
 * 3. Chunks them into smaller pieces
 * 4. Generates embeddings using OpenRouter (OpenAI model)
 * 5. Stores everything in PostgreSQL with pgvector
 */

import * as dotenv from "dotenv";
dotenv.config();

import * as path from "path";
import { ingestKnowledgeBase, ingestDirectory } from "../lib/rag/ingest";
import { getSupportedExtensions } from "../lib/rag/file-processor";

async function main() {
  console.log("=".repeat(60));
  console.log("HorizonLife Knowledge Base Ingestion");
  console.log("=".repeat(60));

  // Check for required environment variables
  if (!process.env.OPENROUTER_API_KEY) {
    console.error("Error: OPENROUTER_API_KEY environment variable is not set");
    console.error("Please set your OpenRouter API key in the .env file");
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error("Error: DATABASE_URL environment variable is not set");
    process.exit(1);
  }

  // Get knowledge base path
  const knowledgeBasePath = path.join(process.cwd(), "knowledge-base");

  // Check for --all flag to auto-detect all files
  const useAutoDetect = process.argv.includes("--all");

  try {
    if (useAutoDetect) {
      console.log("\nMode: Auto-detect all supported files");
      console.log(`Supported formats: ${getSupportedExtensions().join(", ")}`);
      console.log("");

      const result = await ingestDirectory(knowledgeBasePath, {
        clearExisting: true,
        defaultCategory: "GENERAL",
        defaultSubcategory: "Documents",
      });

      console.log("\n" + "=".repeat(60));
      console.log("Knowledge base successfully ingested!");
      console.log(`Files: ${result.filesProcessed} | Chunks: ${result.totalChunks}`);
      console.log("By type:", result.byType);
      console.log("=".repeat(60));
    } else {
      console.log("\nMode: Predefined markdown files only");
      console.log("Tip: Use --all flag to auto-detect PDFs and images\n");

      await ingestKnowledgeBase(knowledgeBasePath, true);

      console.log("\n" + "=".repeat(60));
      console.log("Knowledge base successfully ingested!");
      console.log("=".repeat(60));
    }
  } catch (error) {
    console.error("Error during ingestion:", error);
    process.exit(1);
  }
}

main().then(() => process.exit(0));
