/**
 * Model Comparison Test Script
 *
 * Tests different LLM models for chat quality and embedding models for retrieval
 *
 * Usage: npx tsx scripts/test-models.ts
 */

import * as dotenv from "dotenv";
dotenv.config();

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";

// Initialize OpenRouter
const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// Test queries for insurance chatbot
const TEST_QUERIES = [
  {
    query: "What's the difference between Term Life Premium and Whole Life Elite?",
    category: "Product Comparison",
  },
  {
    query: "I have a family of 4 and want health insurance. What's the monthly cost for Gold plan?",
    category: "Pricing",
  },
  {
    query: "Does your home insurance cover floods and earthquakes?",
    category: "Coverage Details",
  },
  {
    query: "What happens if I miss a premium payment?",
    category: "Policy Management",
  },
];

// Sample context that would come from RAG
const SAMPLE_CONTEXT = `
## Relevant Product Information

[Life Insurance Products - Term Life Premium]
**Monthly Premium:** Starting at $45/month
**Coverage Amounts:** $500,000 - $5,000,000
**Term Lengths:** 10, 15, 20, 25, or 30 years

Features:
- All Term Life Plus features, plus:
- Complimentary annual health screening
- Identity theft protection
- Will preparation service
- Estate planning consultation

[Life Insurance Products - Whole Life Elite]
**Monthly Premium:** Starting at $150/month
**Coverage Amounts:** $100,000 - $2,000,000

Features:
- All Whole Life Classic features, plus:
- Enhanced dividend potential
- Paid-up additions rider included
- Premium flexibility (use dividends to pay premiums)
- Higher guaranteed cash value growth (4% minimum)

[Health Insurance Products - Family Gold]
**Monthly Premium:** Starting at $899/month (family of 4)
**Annual Deductible:** $3,000 family
**Out-of-Pocket Maximum:** $10,000 family

Coverage Details:
- Same benefits as Gold Preferred
- Maternity care: 10% coinsurance after deductible
- Fertility treatment: 50% coverage up to $15,000 lifetime max
- Pediatric therapy (speech, occupational): $25 copay
`;

const SYSTEM_PROMPT = `You are a friendly and knowledgeable insurance assistant for HorizonLife, a trusted insurance company.

Guidelines:
- Be helpful, friendly, and professional
- Use the provided context to give accurate, detailed information
- Keep responses concise but informative
- Use bullet points for clarity when listing features

${SAMPLE_CONTEXT}`;

// Models to test for chat
const CHAT_MODELS = [
  { id: "openai/gpt-4o-mini", name: "GPT-4o-mini (Current)" },
  { id: "minimax/minimax-m2.1", name: "MiniMax M2.1" },
  { id: "xiaomi/mimo-v2-flash", name: "Xiaomi MiMo-V2-Flash" },
];

async function testChatModel(
  modelId: string,
  modelName: string,
  query: string
): Promise<{ response: string; latency: number; error?: string }> {
  const startTime = Date.now();

  try {
    const result = await generateText({
      model: openrouter(modelId),
      system: SYSTEM_PROMPT,
      prompt: query,
      maxTokens: 500,
    });

    const latency = Date.now() - startTime;
    return { response: result.text, latency };
  } catch (error: any) {
    const latency = Date.now() - startTime;
    return {
      response: "",
      latency,
      error: error.message || "Unknown error",
    };
  }
}

async function testEmbeddingModel(
  modelId: string,
  texts: string[]
): Promise<{ embeddings: number[][]; latency: number; dimensions: number; error?: string }> {
  const startTime = Date.now();

  try {
    const response = await fetch("https://openrouter.ai/api/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelId,
        input: texts,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const latency = Date.now() - startTime;
    const embeddings = data.data.map((d: any) => d.embedding);
    const dimensions = embeddings[0]?.length || 0;

    return { embeddings, latency, dimensions };
  } catch (error: any) {
    const latency = Date.now() - startTime;
    return {
      embeddings: [],
      latency,
      dimensions: 0,
      error: error.message || "Unknown error",
    };
  }
}

// Calculate cosine similarity
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function main() {
  console.log("=".repeat(70));
  console.log("MODEL COMPARISON TEST");
  console.log("=".repeat(70));

  if (!process.env.OPENROUTER_API_KEY) {
    console.error("Error: OPENROUTER_API_KEY is not set");
    process.exit(1);
  }

  // ============================================
  // PART 1: Chat Model Comparison
  // ============================================
  console.log("\n" + "=".repeat(70));
  console.log("PART 1: CHAT MODEL COMPARISON");
  console.log("=".repeat(70));

  for (const testCase of TEST_QUERIES) {
    console.log(`\n${"─".repeat(70)}`);
    console.log(`📝 Query [${testCase.category}]: "${testCase.query}"`);
    console.log("─".repeat(70));

    for (const model of CHAT_MODELS) {
      console.log(`\n🤖 ${model.name} (${model.id}):`);

      const result = await testChatModel(model.id, model.name, testCase.query);

      if (result.error) {
        console.log(`   ❌ Error: ${result.error}`);
      } else {
        console.log(`   ⏱️  Latency: ${result.latency}ms`);
        console.log(`   📄 Response:`);
        // Print response with indentation
        const lines = result.response.split("\n");
        for (const line of lines.slice(0, 10)) {
          console.log(`      ${line}`);
        }
        if (lines.length > 10) {
          console.log(`      ... (${lines.length - 10} more lines)`);
        }
      }
    }
  }

  // ============================================
  // PART 2: Embedding Model Comparison
  // ============================================
  console.log("\n\n" + "=".repeat(70));
  console.log("PART 2: EMBEDDING MODEL COMPARISON");
  console.log("=".repeat(70));

  const EMBEDDING_MODELS = [
    { id: "openai/text-embedding-3-small", name: "OpenAI Embedding 3 Small (Current)" },
    { id: "openai/text-embedding-3-large", name: "OpenAI Embedding 3 Large" },
    { id: "qwen/qwen3-embedding-8b", name: "Qwen3 Embedding 8B" },
    { id: "google/gemini-embedding-001", name: "Gemini Embedding 001" },
  ];

  // Test texts - query and relevant/irrelevant documents
  const embeddingTestCases = [
    {
      query: "What is the monthly cost for term life insurance?",
      relevant: "Term Life Basic costs $15/month. Term Life Plus starts at $25/month. Term Life Premium begins at $45/month for coverage up to $5 million.",
      irrelevant: "Our company was founded in 2010 in Austin, Texas. We have over 500,000 customers and a 98% claims approval rate.",
    },
    {
      query: "Does health insurance cover mental health therapy?",
      relevant: "Mental health services are covered with copays: Bronze $40, Silver $30, Gold $20, Platinum $10 per session. Unlimited sessions available on Platinum plan.",
      irrelevant: "Home insurance plans start at $25/month. We offer coverage for dwelling, personal property, and liability protection.",
    },
  ];

  for (const model of EMBEDDING_MODELS) {
    console.log(`\n${"─".repeat(70)}`);
    console.log(`🔢 ${model.name} (${model.id})`);
    console.log("─".repeat(70));

    for (const testCase of embeddingTestCases) {
      const texts = [testCase.query, testCase.relevant, testCase.irrelevant];
      const result = await testEmbeddingModel(model.id, texts);

      if (result.error) {
        console.log(`   ❌ Error: ${result.error}`);
        continue;
      }

      console.log(`\n   Query: "${testCase.query.substring(0, 50)}..."`);
      console.log(`   ⏱️  Latency: ${result.latency}ms`);
      console.log(`   📐 Dimensions: ${result.dimensions}`);

      if (result.embeddings.length === 3) {
        const simRelevant = cosineSimilarity(result.embeddings[0], result.embeddings[1]);
        const simIrrelevant = cosineSimilarity(result.embeddings[0], result.embeddings[2]);

        console.log(`   📊 Similarity to RELEVANT doc:   ${(simRelevant * 100).toFixed(2)}%`);
        console.log(`   📊 Similarity to IRRELEVANT doc: ${(simIrrelevant * 100).toFixed(2)}%`);
        console.log(`   📈 Discrimination (diff):        ${((simRelevant - simIrrelevant) * 100).toFixed(2)}%`);

        if (simRelevant > simIrrelevant) {
          console.log(`   ✅ Correctly ranked relevant doc higher`);
        } else {
          console.log(`   ⚠️  Failed to rank relevant doc higher`);
        }
      }
    }
  }

  // ============================================
  // Summary
  // ============================================
  console.log("\n\n" + "=".repeat(70));
  console.log("TEST COMPLETE - Review results above to compare models");
  console.log("=".repeat(70));
  console.log(`
Key metrics to consider:
- Chat: Response quality, accuracy, formatting, latency
- Embeddings: Discrimination (higher = better at distinguishing relevant from irrelevant)

Note: Xiaomi MiMo model may not be available - check error messages above.
`);
}

main().catch(console.error);
