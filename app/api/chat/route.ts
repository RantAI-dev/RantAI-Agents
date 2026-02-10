import { streamText, convertToModelMessages, tool, zodSchema, stepCountIs } from "ai";
import { z } from "zod";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { smartRetrieve, formatContextForPrompt, RetrievalResult } from "@/lib/rag";
import { DEFAULT_ASSISTANTS } from "@/lib/assistants/defaults";
import { auth } from "@/lib/auth";
import { getCustomerContext, formatCustomerContextForPrompt } from "@/lib/customer-context";
import { prisma } from "@/lib/prisma";
import { DEFAULT_MODEL_ID, isValidModel } from "@/lib/models";
import { resolveToolsForAssistant } from "@/lib/tools";
import {
  loadWorkingMemory,
  updateWorkingMemory,
  loadUserProfile,
  updateUserProfile,
  semanticRecall,
  storeForSemanticRecall,
  buildPromptWithMemory,
  getMemoryStats,
  getMastraMemory,
  MEMORY_CONFIG,
  getMemoryConfigSummary,
  WorkingMemory,
  SemanticRecallResult,
  UserProfile,
} from "@/lib/memory";

// Delimiter for sending sources metadata after stream
const SOURCES_DELIMITER = "\n\n---SOURCES---\n";

// Tool argument interfaces
interface MemoryToolArgs {
  facts?: Array<{
    category: string;
    label: string;
    value: string;
    confidence: number;
  }>;
  preferences?: Array<{
    category: string;
    preference: string;
    value: string;
  }>;
  entities?: Array<{
    name: string;
    type: string;
  }>;
}

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// Memory queue for tool calls (threadId -> queued items)
const memoryQueue = new Map<
  string,
  Array<{ facts?: unknown[]; preferences?: unknown[]; entities?: unknown[] }>
>();

// Base system prompt with company information and guidelines
const BASE_SYSTEM_PROMPT = `You are a friendly and knowledgeable insurance assistant for HorizonLife, a trusted insurance company. Your role is to help visitors understand our insurance products and guide them toward the right coverage.

CORE INSTRUCTIONS - MEMORY & CONTEXT:
1. You have access to "memory" about the user (Working Memory, Long-term Profile, and Past Conversations).
2. CHECK this memory context before answering.
3. If you know the user's name, ALWAYS use it to greet them.
4. If the user asks "do you know me?" or "what is my name?", USE the memory/profile to answer.
5. Tailor your responses based on the user's known profile (age, family size, preferences).


About HorizonLife:
- Founded in 2010, serving over 500,000 customers
- 98% claims approval rate
- 24/7 customer support
- A+ Financial Strength Rating from AM Best
- Operating in 48 states plus Washington D.C.

Our Products:
1. Life Insurance (Starting from $15/month):
   - Term Life: Basic, Plus, Premium tiers
   - Whole Life: Classic and Elite options
   - Universal Life: Flexible and Indexed (IUL) options

2. Health Insurance (Starting from $99/month):
   - Bronze, Silver, Gold, Platinum tiers
   - Individual and Family plans
   - 10,000+ in-network hospitals
   - 500,000+ in-network physicians

3. Home Insurance (Starting from $25/month):
   - Essential, Plus, Premium, Elite tiers
   - Flood and Earthquake add-ons
   - Umbrella liability policies

CRITICAL - LANGUAGE RULE (HIGHEST PRIORITY):
You MUST ALWAYS respond in the SAME LANGUAGE the user writes in.
- If user writes in Indonesian → respond ENTIRELY in Indonesian
- If user writes in English → respond ENTIRELY in English
- If user writes in any other language → respond in that language
- NEVER mix languages. NEVER respond in English when user writes in Indonesian.
Examples:
- User: "berikan aku quote" → Respond in Indonesian: "Dengan senang hati saya akan menghubungkan Anda dengan spesialis kami untuk mendapatkan penawaran yang dipersonalisasi! [AGENT_HANDOFF]"
- User: "give me a quote" → Respond in English: "I'd be happy to connect you with our specialist for a personalized quote! [AGENT_HANDOFF]"

Guidelines for responses:
- Be helpful, friendly, and professional
- When answering questions about products, USE THE RETRIEVED CONTEXT provided below to give accurate, detailed information
- If the retrieved context contains specific details (pricing, coverage limits, features), use those exact details
- Keep responses concise but informative - you can use bullet points for clarity
- For complex claims or policy questions beyond the provided context, suggest speaking with an advisor
- Don't make up specific policy details - if information isn't in the context, say you can connect them with an agent for specifics
- Encourage users to get a free quote or schedule a call for personalized pricing

IMPORTANT - Using Retrieved Context:
Below this prompt, you may see "Relevant Product Information" with details retrieved from our knowledge base.
- ALWAYS prioritize information from the retrieved context over your general knowledge
- Quote specific numbers, features, and details from the context when available
- If the context answers the user's question, use it directly
- If the context is not relevant to the question, you may use your general knowledge about HorizonLife

IMPORTANT - Purchase Intent & Quote Request Detection:
When the user expresses ANY of the following intents, you MUST use the request_agent_handoff tool to connect them with an agent:

1. Purchase intent:
   - "I want to buy..."
   - "I'm ready to sign up"
   - "How do I purchase this?"
   - "I want to get this policy"
   - "Sign me up"

2. Quote requests:
   - "Get me a quote"
   - "I want a personalized quote"
   - "How much would it cost for me?"
   - "Can I get pricing?"
   - "What's my rate?"

3. Agent requests (in any language):
   - "I'd like to speak to a human/agent/person"
   - "Can I talk to someone?"
   - "Connect me to an agent"
   - "Hubungkan dengan spesialis" (Indonesian for "connect to specialist")
   - Any request to speak with a human or specialist

When you detect ANY of these intents, you MUST ALWAYS:
1. Include the EXACT text [AGENT_HANDOFF] at the END of your response - this is MANDATORY and triggers the handoff UI
2. Respond with a friendly message offering to connect them with a specialist

MANDATORY: You MUST end your response with [AGENT_HANDOFF] when handoff is needed. Never skip this marker.

Example responses:
- English: "I'd be happy to connect you with one of our sales specialists! [AGENT_HANDOFF]"
- Indonesian: "Saya dengan senang hati akan menghubungkan Anda dengan spesialis kami! [AGENT_HANDOFF]"

CRITICAL:
- Do NOT ask for personal information yourself
- Do NOT try to collect quote information
- ALWAYS include [AGENT_HANDOFF] at the end when connecting to an agent
- The marker [AGENT_HANDOFF] is REQUIRED - without it the system cannot trigger the handoff`;

export async function POST(req: Request) {
  try {
    // Get assistant config from headers (most reliable method)
    const headerAssistantId = req.headers.get('X-Assistant-Id');
    const headerSystemPromptB64 = req.headers.get('X-System-Prompt');
    const headerUseKnowledgeBase = req.headers.get('X-Use-Knowledge-Base');

    // Decode base64 system prompt from header
    let headerSystemPrompt: string | null = null;
    if (headerSystemPromptB64) {
      try {
        headerSystemPrompt = Buffer.from(headerSystemPromptB64, 'base64').toString('utf-8');
      } catch {
        console.log("[Chat API] Failed to decode system prompt from header");
      }
    }

    const body = await req.json();
    const { messages: rawMessages } = body;

    // Extract threadId for memory tracking (generate one if not provided)
    const threadId = body.threadId || body.sessionId || `thread_${Date.now()}`;

    console.log("[Chat API] ===== REQUEST DEBUG =====");
    console.log("[Chat API] Body keys:", Object.keys(body));
    console.log("[Chat API] Body assistantId:", body.assistantId);
    console.log("[Chat API] Body systemPrompt:", body.systemPrompt ? body.systemPrompt.substring(0, 40) + "..." : "null");
    console.log("[Chat API] Body useKnowledgeBase:", body.useKnowledgeBase);
    console.log("[Chat API] Header assistantId:", headerAssistantId);
    if (MEMORY_CONFIG.debug) {
      console.log("[Chat API] Memory config:", getMemoryConfigSummary());
    }

    // Normalize messages to UIMessage format (with parts array)
    // Our manual fetch sends { id, role, content } but convertToModelMessages expects { id, role, parts }
    const uiMessages = rawMessages.map((msg: { id: string; role: string; content?: string; parts?: Array<{ type: string; text?: string }> }) => {
      if (msg.parts) {
        // Already in UIMessage format
        return msg;
      }
      // Convert simple format to UIMessage format
      return {
        id: msg.id,
        role: msg.role,
        parts: [{ type: 'text', text: msg.content || '' }],
      };
    });

    // Use body first, then headers as fallback
    const assistantId = body.assistantId || headerAssistantId;
    const customSystemPrompt = body.systemPrompt || headerSystemPrompt;
    const useKnowledgeBaseParam = body.useKnowledgeBase !== undefined
      ? body.useKnowledgeBase
      : (headerUseKnowledgeBase !== null ? headerUseKnowledgeBase === 'true' : undefined);
    const knowledgeBaseGroupIds: string[] | undefined = body.knowledgeBaseGroupIds;

    // Look up assistant by ID - first check defaults, then database
    const defaultAssistant = DEFAULT_ASSISTANTS.find(a => a.id === assistantId);

    // Per-assistant memory configuration (null = all enabled for backward compatibility)
    interface AssistantMemoryConfig {
      enabled: boolean;
      workingMemory: boolean;
      semanticRecall: boolean;
      longTermProfile: boolean;
      memoryInstructions?: string;
    }
    let assistantMemoryConfig: AssistantMemoryConfig = {
      enabled: true,
      workingMemory: true,
      semanticRecall: true,
      longTermProfile: true,
    };

    // Determine system prompt, model, and knowledge base setting
    // Priority: database assistant > default assistant > custom prompt from request > fallback to HorizonLife
    let systemPrompt: string;
    let useKnowledgeBase: boolean;
    let modelId: string = DEFAULT_MODEL_ID;

    if (assistantId && !defaultAssistant) {
      // Try to fetch from database (user-created assistant)
      try {
        const dbAssistant = await prisma.assistant.findUnique({
          where: { id: assistantId },
          select: {
            systemPrompt: true,
            model: true,
            useKnowledgeBase: true,
            knowledgeBaseGroupIds: true,
            memoryConfig: true,
            name: true,
            liveChatEnabled: true,
          },
        });

        if (dbAssistant) {
          systemPrompt = dbAssistant.systemPrompt;
          useKnowledgeBase = dbAssistant.useKnowledgeBase;
          modelId = dbAssistant.model || DEFAULT_MODEL_ID;
          // Read per-assistant memory config (null = all enabled)
          if (dbAssistant.memoryConfig && typeof dbAssistant.memoryConfig === 'object') {
            const mc = dbAssistant.memoryConfig as Record<string, unknown>;
            assistantMemoryConfig = {
              enabled: mc.enabled !== false,
              workingMemory: mc.workingMemory !== false,
              semanticRecall: mc.semanticRecall !== false,
              longTermProfile: mc.longTermProfile !== false,
              memoryInstructions: typeof mc.memoryInstructions === 'string' ? mc.memoryInstructions : undefined,
            };
          }
          // Append live chat handoff instruction if enabled for this assistant
          if (dbAssistant.liveChatEnabled) {
            systemPrompt += `\n\nLIVE CHAT HANDOFF: You have the ability to transfer the conversation to a human agent. When the user explicitly asks to speak with a human, a real person, an agent, or customer support — OR when you cannot help them further and a human would be more appropriate — include the exact marker [AGENT_HANDOFF] at the end of your response. Only use this marker when handoff is genuinely needed. Do NOT use it for normal questions you can answer yourself.`;
          }
          console.log("[Chat API] Using database assistant:", dbAssistant.name, "with model:", modelId);
        } else if (customSystemPrompt) {
          systemPrompt = customSystemPrompt;
          useKnowledgeBase = useKnowledgeBaseParam ?? false;
          console.log("[Chat API] Using custom system prompt");
        } else {
          systemPrompt = BASE_SYSTEM_PROMPT;
          useKnowledgeBase = true;
          console.log("[Chat API] Fallback to default HorizonLife prompt");
        }
      } catch (error) {
        console.error("[Chat API] Error fetching assistant from database:", error);
        systemPrompt = customSystemPrompt || BASE_SYSTEM_PROMPT;
        useKnowledgeBase = useKnowledgeBaseParam ?? true;
      }
    } else if (defaultAssistant) {
      // Found in default assistants (built-in)
      systemPrompt = defaultAssistant.systemPrompt;
      useKnowledgeBase = defaultAssistant.useKnowledgeBase;
      // Default assistants use the default model unless we add model to defaults later
      console.log("[Chat API] Using default assistant:", defaultAssistant.name);
    } else if (customSystemPrompt) {
      // Custom assistant or explicit system prompt
      systemPrompt = customSystemPrompt;
      useKnowledgeBase = useKnowledgeBaseParam ?? false;
      console.log("[Chat API] Using custom/user-created assistant prompt");
    } else {
      // Fallback to HorizonLife
      systemPrompt = BASE_SYSTEM_PROMPT;
      useKnowledgeBase = true;
      console.log("[Chat API] Fallback to default HorizonLife prompt");
    }

    // Validate model ID
    if (!isValidModel(modelId)) {
      console.warn(`[Chat API] Invalid model ID "${modelId}", falling back to default`);
      modelId = DEFAULT_MODEL_ID;
    }

    console.log("[Chat API] System prompt preview:", systemPrompt.substring(0, 60) + "...");
    console.log("[Chat API] useKnowledgeBase:", useKnowledgeBase);

    // Convert UIMessage format (with parts array) to ModelMessage format (with content string)
    const messages = await convertToModelMessages(uiMessages);

    // Store RAG sources to send with response
    let ragSources: Array<{ title: string; section: string | null }> = [];

    // Only perform RAG retrieval if knowledge base is enabled
    if (useKnowledgeBase) {
      // Get the latest user message for RAG retrieval
      const lastUserMessage = [...messages]
        .reverse()
        .find((msg) => msg.role === "user");

      if (lastUserMessage) {
        try {
          // Extract text content from the user message
          const userQuery =
            typeof lastUserMessage.content === "string"
              ? lastUserMessage.content
              : lastUserMessage.content
                .filter((part): part is { type: "text"; text: string } => part.type === "text")
                .map((part) => part.text)
                .join(" ");

          // Retrieve relevant context from the knowledge base
          const retrievalResult = await smartRetrieve(userQuery, {
            minSimilarity: 0.35,
            maxChunks: 5,
            groupIds: knowledgeBaseGroupIds,
          });

          // If we found relevant context, add it to the system prompt
          if (retrievalResult.context) {
            const formattedContext = formatContextForPrompt(retrievalResult);
            systemPrompt = `${systemPrompt}\n\n${formattedContext}`;

            // Store sources to send with response
            ragSources = retrievalResult.sources.map((s) => ({
              title: s.documentTitle,
              section: s.section,
            }));

            // Log retrieval for debugging (remove in production)
            console.log(
              `[RAG] Retrieved ${retrievalResult.chunks.length} chunks for query: "${userQuery.substring(0, 50)}..."`
            );
            console.log(
              `[RAG] Sources: ${retrievalResult.sources.map((s) => s.documentTitle).join(", ")}`
            );
          }
        } catch (error) {
          // Log error but continue without RAG context
          console.error("[RAG] Error during retrieval:", error);
        }
      }
    }

    // Check if the user is a logged-in customer and inject their context
    const session = await auth();
    const userId = session?.user?.id || 'anonymous';

    if (session?.user?.userType === "customer") {
      try {
        const customerContext = await getCustomerContext(session.user.id);
        if (customerContext) {
          const customerPrompt = formatCustomerContextForPrompt(customerContext);
          systemPrompt = `${systemPrompt}\n\n${customerPrompt}`;
          console.log(`[Chat API] Customer context injected for: ${customerContext.firstName}`);
        }
      } catch (error) {
        console.error("[Chat API] Error fetching customer context:", error);
      }
    }

    // ===== MEMORY SYSTEM INTEGRATION =====
    let workingMemory: WorkingMemory | null = null;
    let semanticResults: SemanticRecallResult[] = [];
    let userProfile: UserProfile | null = null;

    // Get the latest user message for memory operations
    const lastUserMessage = [...messages].reverse().find((msg) => msg.role === "user");
    const userQuery = lastUserMessage
      ? typeof lastUserMessage.content === "string"
        ? lastUserMessage.content
        : lastUserMessage.content
          .filter((part): part is { type: "text"; text: string } => part.type === "text")
          .map((part) => part.text)
          .join(" ")
      : "";

    try {
      if (!assistantMemoryConfig.enabled) {
        console.log("[Memory] Memory disabled for this assistant, skipping all memory operations");
      }

      // 1. Load working memory for current session
      if (assistantMemoryConfig.enabled) {
      workingMemory = await loadWorkingMemory(threadId);
      console.log(`[Memory] Loaded working memory for thread ${threadId}: ${workingMemory.entities.size} entities, ${workingMemory.facts.size} facts`);
      }

      // 2. Semantic recall of relevant past messages (only for logged-in users)
      if (assistantMemoryConfig.enabled && assistantMemoryConfig.semanticRecall && userId !== 'anonymous' && userQuery) {
        if (MEMORY_CONFIG.useMastraMemory) {
          try {
            const mastraMemory = getMastraMemory();
            if (MEMORY_CONFIG.debug) {
              console.log("[Memory] Using Mastra Memory for semantic recall");
            }
            semanticResults = await mastraMemory.recall(userQuery, {
              resourceId: userId,
              threadId,
              topK: 5,
            });
            console.log(`[Memory] Mastra recall found ${semanticResults.length} relevant messages`);
          } catch (error) {
            if (MEMORY_CONFIG.gracefulDegradation) {
              console.error("[Memory] Mastra recall error, using fallback:", error);
              semanticResults = await semanticRecall(userQuery, userId, threadId);
              console.log(`[Memory] Fallback recall found ${semanticResults.length} messages`);
            } else {
              throw error;
            }
          }
        } else {
          semanticResults = await semanticRecall(userQuery, userId, threadId);
          console.log(`[Memory] Semantic recall found ${semanticResults.length} relevant messages`);
        }
      }

      // 3. Load long-term user profile (only for logged-in users)
      if (assistantMemoryConfig.enabled && assistantMemoryConfig.longTermProfile && userId !== 'anonymous') {
        userProfile = await loadUserProfile(userId);
        if (userProfile) {
          console.log(`[Memory] Loaded user profile: ${userProfile.facts.length} facts, ${userProfile.preferences.length} preferences`);
        }
      }

      // 4. Inject memory context into system prompt
      if (assistantMemoryConfig.enabled) {
        systemPrompt = buildPromptWithMemory(systemPrompt, workingMemory, semanticResults, userProfile);
        // Ensure corrections/updates are saved so "ganti X jadi Y" works
        systemPrompt += "\n\nWhen the user corrects or updates previously shared information (e.g. name, age, preference), you MUST call saveMemory with the new value so the stored profile is updated. Do not only acknowledge verbally—always call the tool with the updated fact or preference.";
        // Append per-assistant memory instructions if set
        if (assistantMemoryConfig.memoryInstructions) {
          systemPrompt += `\n\nMemory Instructions:\n${assistantMemoryConfig.memoryInstructions}`;
        }
      }

      // Log memory stats
      const memoryStats = getMemoryStats(workingMemory, semanticResults, userProfile);
      console.log("[Memory] Stats:", JSON.stringify(memoryStats));
    } catch (error) {
      console.error("[Memory] Error loading memories:", error);
      // Continue without memory - graceful degradation
    }

    console.log("[Chat API] Using model:", modelId);

    // ===== TOOL RESOLUTION =====
    // Resolve assistant-configured tools (builtin, custom, MCP)
    const { tools: resolvedTools, toolNames } = assistantId
      ? await resolveToolsForAssistant(assistantId, modelId, {
          userId: session?.user?.id,
          assistantId,
        })
      : { tools: {}, toolNames: [] as string[] };

    const hasAssistantTools = Object.keys(resolvedTools).length > 0;
    if (hasAssistantTools) {
      console.log("[Chat API] Tools enabled:", toolNames.join(", "));
      // Instruct the model to use its tools instead of hallucinating
      systemPrompt += `\n\n## Available Tools\nYou have these tools: ${toolNames.join(", ")}.\nIMPORTANT: When users ask questions that require external information, current events, calculations, or data processing, you MUST use the appropriate tool. Do NOT fabricate URLs, links, citations, or sources — always use a tool to get real information. If you have a web_search tool, use it for any factual claim that needs a source.`;
    }

    // Define schema for memory tool
    const memorySchema = z.object({
      facts: z.array(z.object({
        category: z.string().describe("Category of fact (e.g. 'bio', 'work', 'family')"),
        label: z.string().describe("Label/Predicate (e.g. 'age', 'occupation')"),
        value: z.string().describe("Value/Object (e.g. '30', 'Engineer')"),
        confidence: z.number().min(0).max(1).default(0.9),
      })).optional(),
      preferences: z.array(z.object({
        category: z.string().describe("Category (e.g. 'communication', 'product')"),
        preference: z.string().describe("Key (e.g. 'channel', 'insurance_type')"),
        value: z.string().describe("Value (e.g. 'email', 'life')"),
      })).optional(),
      entities: z.array(z.object({
        name: z.string().describe("Name of entity (person, organization, etc.)"),
        type: z.string().describe("Type of entity (Person, Organization, Date, Location)"),
      })).optional(),
    });

    // Combine all tools: assistant tools + memory saveMemory tool
    const allTools = {
      ...resolvedTools,
      saveMemory: tool({
        description: "Save important facts, preferences, and entities about the user from the conversation.",
        inputSchema: zodSchema(memorySchema),
        execute: async (
          input: z.infer<typeof memorySchema>,
          _options
        ) => {
          const { facts, preferences, entities } = input ?? {};
          if (!memoryQueue.has(threadId)) {
            memoryQueue.set(threadId, []);
          }
          memoryQueue.get(threadId)!.push({ facts, preferences, entities });
          console.log("[Memory Tool] Queued memory for saving:", {
            facts: facts?.length || 0,
            preferences: preferences?.length || 0,
            entities: entities?.length || 0,
          });
          return {
            success: true,
            queued: true,
            items: {
              facts: facts?.length || 0,
              preferences: preferences?.length || 0,
              entities: entities?.length || 0,
            },
          };
        },
      }),
    };

    const result = streamText({
      model: openrouter(modelId),
      system: systemPrompt,
      messages,
      tools: allTools,
      stopWhen: hasAssistantTools ? stepCountIs(5) : stepCountIs(2),
    });

    // If userId is 'anonymous', we still want working memory (session based) but maybe not long-term
    const effectiveUserId = userId === 'anonymous' ? 'anon_' + threadId : userId;

    // Use a self-executing async function to handle background memory updates
    if (assistantMemoryConfig.enabled) {
    (async () => {
      try {
        console.log(`[Memory] Waiting for response to finish for thread ${threadId}...`);

        // Wait for generation to complete
        const fullResponse = await result.text;
        const toolCalls = await result.toolCalls as any[];

        console.log(`[Memory] Response finished. Text len: ${fullResponse.length}. Tool calls: ${toolCalls.length}`);

        // Retrieve and process queued memories from tool calls
        const queuedMemories = memoryQueue.get(threadId) || [];
        memoryQueue.delete(threadId);

        let extractedFacts: any[] = [];
        let extractedPreferences: any[] = [];
        let extractedEntities: any[] = [];

        if (queuedMemories.length > 0) {
          console.log(`[Memory] Processing ${queuedMemories.length} queued memory items`);
          for (const mem of queuedMemories) {
            if (mem.facts) extractedFacts.push(...(mem.facts as any[]));
            if (mem.preferences) extractedPreferences.push(...(mem.preferences as any[]));
            if (mem.entities) extractedEntities.push(...(mem.entities as any[]));
          }
          console.log(`[Memory] Total extracted: ${extractedFacts.length} facts, ${extractedPreferences.length} preferences, ${extractedEntities.length} entities`);
        }

        // Also extract from tool call args (backward compatibility)
        for (const call of toolCalls) {
          if (call.toolName === 'saveMemory') {
            const args = call.args as any;
            if (args?.facts) extractedFacts.push(...args.facts);
            if (args?.preferences) extractedPreferences.push(...args.preferences);
            if (args?.entities) extractedEntities.push(...args.entities);
          }
        }

        // Conversion utilities
        // We need robust type conversion here to match internal interfaces

        // Fact conversion
        const finalFacts = extractedFacts.map(f => ({
          id: `fact_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          subject: 'user',
          predicate: f.label || 'unknown',
          object: f.value || 'unknown',
          confidence: typeof f.confidence === 'number' ? f.confidence : 0.9,
          source: threadId,
          createdAt: new Date(),
        }));

        // Entity conversion
        const finalEntities = extractedEntities.map(e => ({
          id: `ent_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          name: e.name || 'unknown',
          type: e.type || 'unknown',
          source: threadId,
          createdAt: new Date(),
          attributes: {}, // Required by Entity interface
          confidence: 0.9, // Required by Entity interface
        }));

        // Preference conversion
        const finalPreferences = extractedPreferences.map(p => ({
          id: `pref_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          category: p.category || 'general',
          key: p.preference || 'unknown',
          value: p.value || 'unknown',
          confidence: 0.9,
          source: threadId,
        }));

        const messageId = `msg_${Date.now()}`;

        // 1. Update working memory (Session based)
        // Pass extracted data directly to avoid redundant regex extraction
        await updateWorkingMemory(
          effectiveUserId,
          threadId,
          userQuery,
          fullResponse,
          messageId,
          finalEntities,
          finalFacts
        );

        // 2. Update Long-term & Semantic (Only for logged in users)
        if (userId !== 'anonymous' && (assistantMemoryConfig.semanticRecall || assistantMemoryConfig.longTermProfile)) {
          console.log(`[Memory] Updating long-term memory for user ${userId}`);

          // Store for semantic recall (vector db)
          if (assistantMemoryConfig.semanticRecall) {
            await storeForSemanticRecall(userId, threadId, userQuery, fullResponse);
          }

          // Update user profile (Postgres) with extracted facts/prefs
          if (assistantMemoryConfig.longTermProfile) {
            await updateUserProfile(
              userId,
              userQuery,
              fullResponse,
              threadId,
              finalFacts,
              finalPreferences
            );
          }
        } else {
          console.log(`[Memory] Skipping long-term memory for anonymous user`);
        }

        // Optional: dual-write to Mastra Memory (same storage, for migration verification)
        if (MEMORY_CONFIG.dualWrite && userId !== 'anonymous') {
          try {
            const mastraMemory = getMastraMemory();
            if (MEMORY_CONFIG.debug) {
              console.log('[Memory] Dual-writing to Mastra Memory');
            }
            await mastraMemory.saveMessage(threadId, {
              role: 'user',
              content: userQuery,
              metadata: { userId, messageId, timestamp: new Date().toISOString() },
            });
            await mastraMemory.saveMessage(threadId, {
              role: 'assistant',
              content: fullResponse,
              metadata: { userId, messageId, timestamp: new Date().toISOString() },
            });
            console.log('[Memory] Saved to Mastra Memory (dual-write)');
          } catch (mastraError) {
            console.error('[Memory] Mastra save error (non-fatal):', mastraError);
          }
        }
      } catch (err) {
        console.error('[Memory] Error in background memory update:', err);
      }
    })();
    } // end assistantMemoryConfig.enabled

    // When assistant-configured tools are active, use UI message stream (shows tool usage in UI)
    if (hasAssistantTools) {
      return result.toUIMessageStreamResponse();
    }

    // If we have RAG sources, create a custom stream that appends them after the text
    if (ragSources.length > 0) {
      const textStream = result.toTextStreamResponse();
      const originalBody = textStream.body;

      if (originalBody) {
        const reader = originalBody.getReader();
        const encoder = new TextEncoder();

        const customStream = new ReadableStream({
          async start(controller) {
            // Stream the original text content
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(value);
            }

            // Append sources delimiter and JSON
            const sourcesData = SOURCES_DELIMITER + JSON.stringify(ragSources);
            controller.enqueue(encoder.encode(sourcesData));
            controller.close();
          },
        });

        return new Response(customStream, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
          },
        });
      }
    }

    return result.toTextStreamResponse();
  } catch (error) {
    console.error("[Chat API] Error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
