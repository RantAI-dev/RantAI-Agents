/**
 * Test script to verify RAG functionality
 *
 * Usage: pnpm tsx scripts/test-rag.ts
 */

import { smartRetrieve, formatContextForPrompt, listDocuments } from "../lib/rag";

const TEST_QUERIES = [
  "What is Term Life Premium and how much does it cost?",
  "What's the deductible for the Gold health insurance plan?",
  "Does home insurance cover floods?",
  "What's your claims approval rate?",
  "How do I file a claim?",
];

async function main() {
  console.log("=".repeat(60));
  console.log("RAG Test Script");
  console.log("=".repeat(60));

  // Check environment
  if (!process.env.OPENAI_API_KEY) {
    console.error("Error: OPENAI_API_KEY is not set");
    process.exit(1);
  }

  // List documents
  console.log("\n📚 Documents in knowledge base:");
  try {
    const docs = await listDocuments();
    if (docs.length === 0) {
      console.log("   No documents found! Run 'pnpm rag:ingest' first.");
      process.exit(1);
    }
    for (const doc of docs) {
      console.log(`   - ${doc.title} (${doc.categories.join(", ")}) - ${doc._count.chunks} chunks`);
    }
  } catch (error) {
    console.error("Error listing documents:", error);
    console.log("\n⚠️  Make sure PostgreSQL is running and schema is set up.");
    console.log("   Run: pnpm setup && pnpm rag:ingest");
    process.exit(1);
  }

  // Test queries
  console.log("\n🔍 Testing retrieval queries:\n");

  for (const query of TEST_QUERIES) {
    console.log("-".repeat(60));
    console.log(`Query: "${query}"`);
    console.log("-".repeat(60));

    try {
      const result = await smartRetrieve(query, {
        minSimilarity: 0.35,
        maxChunks: 3,
      });

      if (result.chunks.length === 0) {
        console.log("   No relevant chunks found.\n");
        continue;
      }

      console.log(`   Found ${result.chunks.length} relevant chunks:`);
      for (const chunk of result.chunks) {
        console.log(`   - [${chunk.documentTitle}] similarity: ${(chunk.similarity * 100).toFixed(1)}%`);
        console.log(`     "${chunk.content.substring(0, 100)}..."\n`);
      }

      console.log("   Formatted context preview:");
      const formatted = formatContextForPrompt(result);
      console.log(`   ${formatted.substring(0, 200)}...\n`);
    } catch (error) {
      console.error(`   Error: ${error}`);
    }
  }

  console.log("=".repeat(60));
  console.log("Test complete!");
  console.log("=".repeat(60));
}

main().catch(console.error);
