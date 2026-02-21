import { NextRequest, NextResponse } from "next/server"
import { streamText, convertToModelMessages, tool, zodSchema } from "ai"
import { z } from "zod"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { prisma } from "@/lib/prisma"
import {
  validateDomain,
  extractOrigin,
  validateApiKeyFormat,
  checkRateLimit,
} from "@/lib/embed"
import { smartRetrieve, formatContextForPrompt } from "@/lib/rag"
import { DEFAULT_MODEL_ID } from "@/lib/models"
import { executeChatflow, type ChatflowMemoryContext } from "@/lib/workflow/chatflow"
import {
  LANGUAGE_INSTRUCTION,
  CORRECTION_INSTRUCTION_WITH_TOOL,
  LIVE_CHAT_HANDOFF_INSTRUCTION,
} from "@/lib/prompts/instructions"
import { extractAndSaveFacts, stripSources } from "@/lib/workflow/chatflow-memory"
import {
  loadWorkingMemory,
  semanticRecall,
  loadUserProfile,
  buildPromptWithMemory,
  storeForSemanticRecall,
  updateUserProfile,
  updateWorkingMemory,
  getMemoryStats,
  getMastraMemory,
  MEMORY_CONFIG,
} from "@/lib/memory"

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
})

// Widget memory queue for tool calls (threadId -> queued items)
const widgetMemoryQueue = new Map<
  string,
  Array<{ facts?: unknown[]; preferences?: unknown[]; entities?: unknown[] }>
>()

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

// POST /api/widget/chat - Handle widget chat messages (streaming)
export async function POST(req: NextRequest) {
  try {
    // Get API key from header
    const apiKey = req.headers.get("X-Widget-Api-Key")

    if (!apiKey) {
      return NextResponse.json(
        { error: "API key is required", code: "MISSING_KEY" },
        { status: 401 }
      )
    }

    if (!validateApiKeyFormat(apiKey)) {
      return NextResponse.json(
        { error: "Invalid API key format", code: "INVALID_KEY_FORMAT" },
        { status: 400 }
      )
    }

    // Find the API key
    const embedKey = await prisma.embedApiKey.findFirst({
      where: { key: apiKey, enabled: true },
    })

    if (!embedKey) {
      return NextResponse.json(
        { error: "API key not found or disabled", code: "INVALID_KEY" },
        { status: 401 }
      )
    }

    // Validate domain
    const origin = extractOrigin(req.headers)
    const domainValidation = validateDomain(origin, embedKey.allowedDomains)

    if (!domainValidation.valid) {
      return NextResponse.json(
        {
          error: "Domain not allowed",
          code: "DOMAIN_NOT_ALLOWED",
          domain: domainValidation.domain,
        },
        { status: 403 }
      )
    }

    // Check rate limit
    const rateLimit = checkRateLimit(embedKey.id)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          code: "RATE_LIMIT_EXCEEDED",
          retryAfter: rateLimit.resetIn,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.resetIn),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(rateLimit.resetIn),
          },
        }
      )
    }

    // Parse request body
    const body = await req.json()
    const { messages: rawMessages, visitorId, customerId } = body

    if (!rawMessages || !Array.isArray(rawMessages)) {
      return NextResponse.json(
        { error: "Messages are required", code: "MISSING_MESSAGES" },
        { status: 400 }
      )
    }

    // Fetch assistant
    const assistant = await prisma.assistant.findUnique({
      where: { id: embedKey.assistantId },
    })

    if (!assistant) {
      return NextResponse.json(
        { error: "Assistant not found", code: "ASSISTANT_NOT_FOUND" },
        { status: 404 }
      )
    }

    // Identity resolution: authenticated customer > anonymous visitor > fallback
    // - customerId: future authenticated widget users (e.g. logged-in customers via portal)
    // - visitorId: anonymous browser visitors (e.g. vis_xxx from localStorage)
    // - fallback: widget_${embedKey.id} (backward-compatible, when no identity is provided)
    const isAuthenticated = !!customerId
    const widgetUserId = customerId
      ? `cust_${customerId}`
      : visitorId || `widget_${embedKey.id}`
    const isAnonymous = !isAuthenticated

    // Parse per-assistant memory config (same as chat/route.ts)
    interface AssistantMemoryConfig {
      enabled: boolean; workingMemory: boolean;
      semanticRecall: boolean; longTermProfile: boolean;
    }
    let assistantMemoryConfig: AssistantMemoryConfig = {
      enabled: true, workingMemory: true,
      semanticRecall: true, longTermProfile: true,
    }
    if (assistant.memoryConfig && typeof assistant.memoryConfig === 'object') {
      const mc = assistant.memoryConfig as Record<string, unknown>
      assistantMemoryConfig = {
        enabled: mc.enabled !== false,
        workingMemory: mc.workingMemory !== false,
        semanticRecall: mc.semanticRecall !== false,
        longTermProfile: mc.longTermProfile !== false,
      }
    }

    // Shared variables (needed for both chatflow and normal chat paths)
    const threadId = body.threadId || `thread_${Date.now()}`
    const lastUserMsg = rawMessages.filter((m: { role: string; content?: string }) => m.role === 'user').pop()?.content || ''

    // ===== CHATFLOW CHECK =====
    // If this assistant has an active CHATFLOW workflow, execute it instead of normal chat
    try {
      const chatflowWorkflow = await prisma.workflow.findFirst({
        where: {
          assistantId: embedKey.assistantId,
          mode: "CHATFLOW",
          status: "ACTIVE",
        },
      })

      if (chatflowWorkflow) {
        console.log("[Widget Chat] Chatflow workflow found:", chatflowWorkflow.name)
        const lastMsg = [...rawMessages].reverse().find((m: { role: string; content?: string; parts?: Array<{ type: string; text?: string }> }) => m.role === "user")
        const userText = lastMsg?.content || lastMsg?.parts?.find((p: { type: string; text?: string }) => p.type === "text")?.text || ""

        // Load memory for chatflow (respect assistantMemoryConfig)
        let memoryContext: ChatflowMemoryContext | undefined
        if (assistantMemoryConfig.enabled) {
          try {
            const workingMemory = assistantMemoryConfig.workingMemory
              ? await loadWorkingMemory(threadId) : null

            let semanticResults: Awaited<ReturnType<typeof semanticRecall>> = []
            if (assistantMemoryConfig.semanticRecall && lastUserMsg) {
              if (MEMORY_CONFIG.useMastraMemory) {
                try {
                  const mastraMemory = getMastraMemory()
                  semanticResults = await mastraMemory.recall(lastUserMsg, {
                    resourceId: widgetUserId, threadId, topK: 5,
                  })
                } catch (err) {
                  if (MEMORY_CONFIG.gracefulDegradation) {
                    semanticResults = await semanticRecall(lastUserMsg, widgetUserId, threadId)
                  }
                }
              } else {
                semanticResults = await semanticRecall(lastUserMsg, widgetUserId, threadId)
              }
            }

            const userProfile = assistantMemoryConfig.longTermProfile
              ? await loadUserProfile(widgetUserId) : null
            memoryContext = { workingMemory, semanticResults, userProfile }
            console.log("[Widget Chat] Memory loaded for chatflow:", {
              workingMemory: workingMemory ? workingMemory.entities.size + " entities, " + workingMemory.facts.size + " facts" : "disabled",
              semanticResults: semanticResults.length,
              userProfile: userProfile ? "yes" : "no/disabled",
            })
          } catch (err) {
            console.error("[Widget Chat] Memory load for chatflow error:", err)
          }
        }

        const { response: chatflowResponse, fallback } = await executeChatflow(chatflowWorkflow, userText, assistant.systemPrompt, memoryContext)

        // Fallback: chatflow path didn't reach a STREAM_OUTPUT node — continue to normal agent
        if (fallback || !chatflowResponse) {
          console.log("[Widget Chat] Chatflow fallback — continuing with normal agent")
          // Fall through to normal chat processing below
        } else {
          // Stream tee: fork stream for client + background memory save
          const streamBody = chatflowResponse.body
          if (streamBody && assistantMemoryConfig.enabled) {
            const [clientStream, saveStream] = streamBody.tee()

            // Background: accumulate response text and save memory
            ;(async () => {
              try {
                const reader = saveStream.getReader()
                const decoder = new TextDecoder()
                let fullResponse = ""
                while (true) {
                  const { done, value } = await reader.read()
                  if (done) break
                  fullResponse += decoder.decode(value, { stream: true })
                }

                // Strip ---SOURCES--- delimiter before saving to memory
                const cleanResponse = stripSources(fullResponse)
                const messageId = `msg_${Date.now()}`

                // Save working memory (session) — respect config
                if (assistantMemoryConfig.workingMemory) {
                  await updateWorkingMemory(widgetUserId, threadId, lastUserMsg, cleanResponse, messageId, [], [])
                }

                // Save semantic recall (vector DB) — respect config
                if (assistantMemoryConfig.semanticRecall) {
                  await storeForSemanticRecall(widgetUserId, threadId, lastUserMsg, cleanResponse)
                }

                // Mastra dual-write (optional)
                if (MEMORY_CONFIG.dualWrite && assistantMemoryConfig.semanticRecall) {
                  const mastraMemory = getMastraMemory()
                  await mastraMemory.saveMessage(threadId, { role: 'user', content: lastUserMsg, metadata: { userId: widgetUserId, messageId, timestamp: new Date().toISOString() } })
                  await mastraMemory.saveMessage(threadId, { role: 'assistant', content: cleanResponse, metadata: { userId: widgetUserId, messageId, timestamp: new Date().toISOString() } })
                }

                // TTL for anonymous widget visitors (authenticated customers persist indefinitely)
                if (isAnonymous) {
                  await prisma.userMemory.updateMany({
                    where: { userId: widgetUserId },
                    data: { expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
                  })
                }

                // Extract facts to user profile (non-blocking LLM call) — respect config
                if (assistantMemoryConfig.longTermProfile) {
                  await extractAndSaveFacts(widgetUserId, threadId, lastUserMsg, cleanResponse)
                }

                console.log(`[Widget Chat] Chatflow memory saved for ${widgetUserId} (authenticated: ${isAuthenticated}, thread: ${threadId})`)
              } catch (err) {
                console.error("[Widget Chat] Chatflow memory save error:", err)
              }
            })()

            const response = new Response(clientStream, { headers: chatflowResponse.headers })
            response.headers.set("Access-Control-Allow-Origin", "*")
            return response
          } else {
            chatflowResponse.headers.set("Access-Control-Allow-Origin", "*")
            return chatflowResponse
          }
        }
      }
    } catch (error) {
      console.error("[Widget Chat] Chatflow check error (continuing with normal chat):", error)
    }

    // Normalize messages to UIMessage format
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uiMessages = rawMessages.map(
      (msg: { id?: string; role: string; content?: string; parts?: Array<{ type: string; text?: string }> }) => {
        if (msg.parts) {
          return msg
        }
        return {
          id: msg.id || `msg-${Date.now()}`,
          role: msg.role,
          parts: [{ type: "text", text: msg.content || "" }],
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any[]

    const messages = await convertToModelMessages(uiMessages)

    // Build system prompt
    let systemPrompt = assistant.systemPrompt

    // Store RAG sources to send with response (match dashboard behavior)
    let ragSources: Array<{ title: string; section: string | null }> = []

    // RAG retrieval if enabled
    if (assistant.useKnowledgeBase) {
      const lastUserMessage = [...messages]
        .reverse()
        .find((msg) => msg.role === "user")

      if (lastUserMessage) {
        try {
          const userQuery =
            typeof lastUserMessage.content === "string"
              ? lastUserMessage.content
              : lastUserMessage.content
                .filter(
                  (part): part is { type: "text"; text: string } =>
                    part.type === "text"
                )
                .map((part) => part.text)
                .join(" ")

          const retrievalResult = await smartRetrieve(userQuery, {
            minSimilarity: 0.35,
            maxChunks: 5,
            groupIds: assistant.knowledgeBaseGroupIds,
          })

          if (retrievalResult.context) {
            const formattedContext = formatContextForPrompt(retrievalResult)
            systemPrompt = `${systemPrompt}\n\n${formattedContext}`

            ragSources = retrievalResult.sources.map((s) => ({
              title: s.documentTitle,
              section: s.section,
            }))

            console.log(
              `[Widget RAG] Retrieved ${retrievalResult.chunks.length} chunks for query: "${userQuery.substring(0, 50)}..."`
            )
            console.log(
              `[Widget RAG] Sources: ${retrievalResult.sources.map((s) => s.documentTitle).join(", ")}`
            )
          } else {
            console.log(`[Widget RAG] No results for query: "${userQuery.substring(0, 50)}..." (groupIds: ${JSON.stringify(assistant.knowledgeBaseGroupIds)})`)
          }
        } catch (error) {
          console.error("[Widget Chat] RAG error:", error)
        }
      }
    } else {
      console.log("[Widget Chat] Knowledge base disabled for this assistant")
    }

    // Memory integration (widgetUserId, threadId, lastUserMsg declared above chatflow check)
    // Respect assistantMemoryConfig — same pattern as chat/route.ts

    if (assistantMemoryConfig.enabled) {
    try {
      // Load memory contexts (with optional Mastra path)
      const workingMemory = assistantMemoryConfig.workingMemory
        ? await loadWorkingMemory(threadId) : null;

      let semanticResults: Awaited<ReturnType<typeof semanticRecall>> = [];
      if (assistantMemoryConfig.semanticRecall && lastUserMsg) {
        if (MEMORY_CONFIG.useMastraMemory) {
          try {
            const mastraMemory = getMastraMemory();
            if (MEMORY_CONFIG.debug) {
              console.log("[Widget Memory] Using Mastra Memory for semantic recall");
            }
            semanticResults = await mastraMemory.recall(lastUserMsg, {
              resourceId: widgetUserId,
              threadId,
              topK: 5,
            });
            console.log(`[Widget Memory] Mastra recall found ${semanticResults.length} messages`);
          } catch (error) {
            if (MEMORY_CONFIG.gracefulDegradation) {
              console.error("[Widget Memory] Mastra recall error, using fallback:", error);
              semanticResults = await semanticRecall(lastUserMsg, widgetUserId, threadId);
              console.log(`[Widget Memory] Fallback recall found ${semanticResults.length} messages`);
            } else {
              throw error;
            }
          }
        } else {
          semanticResults = await semanticRecall(lastUserMsg, widgetUserId, threadId);
        }
      }

      const userProfile = assistantMemoryConfig.longTermProfile
        ? await loadUserProfile(widgetUserId) : null;

      // Build enhanced system prompt with memory
      systemPrompt = buildPromptWithMemory(
        systemPrompt,
        workingMemory,
        semanticResults,
        userProfile
      )

      // Enforce language consistency
      systemPrompt += LANGUAGE_INSTRUCTION;
      // Ensure corrections/updates are saved so "ganti X jadi Y" works
      systemPrompt += CORRECTION_INSTRUCTION_WITH_TOOL;

      // Log stats
      const memoryStats = getMemoryStats(workingMemory, semanticResults, userProfile);
      console.log(`[Widget Chat] Memory loaded for ${widgetUserId} (authenticated: ${isAuthenticated}):`, JSON.stringify(memoryStats));

    } catch (memError) {
      console.error("[Widget Chat] Memory load error:", memError)
    }
    } // end assistantMemoryConfig.enabled

    // Live Chat handoff instruction
    if (assistant.liveChatEnabled) {
      systemPrompt += LIVE_CHAT_HANDOFF_INSTRUCTION
    }

    // Update usage stats (async, non-blocking)
    prisma.embedApiKey
      .update({
        where: { id: embedKey.id },
        data: {
          requestCount: { increment: 1 },
          lastUsedAt: new Date(),
        },
      })
      .catch(console.error)

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

    // Stream response
    const result = streamText({
      model: openrouter(assistant.model || DEFAULT_MODEL_ID),
      system: systemPrompt,
      messages,
      tools: {
        saveMemory: tool({
          description: "Save important facts, preferences, and entities about the user from the conversation.",
          inputSchema: zodSchema(memorySchema),
          execute: async (
            input: z.infer<typeof memorySchema>,
            _options
          ) => {
            const { facts, preferences, entities } = input ?? {};
            if (!widgetMemoryQueue.has(threadId)) {
              widgetMemoryQueue.set(threadId, []);
            }
            widgetMemoryQueue.get(threadId)!.push({ facts, preferences, entities });
            console.log("[Widget Memory Tool] Queued memory for saving:", {
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
      },
    });

    // Handle background memory updates (respect assistantMemoryConfig)
    if (assistantMemoryConfig.enabled) {
    (async () => {
      try {
        const fullResponse = await result.text;
        const toolCalls = await result.toolCalls as any[];

        console.log(`[Widget Chat] Response finished. Text len: ${fullResponse.length}. Tool calls: ${toolCalls.length}`);

        // Retrieve and process queued memories from tool calls
        const queuedMemories = widgetMemoryQueue.get(threadId) || [];
        widgetMemoryQueue.delete(threadId);

        let extractedFacts: any[] = [];
        let extractedPreferences: any[] = [];
        let extractedEntities: any[] = [];

        if (queuedMemories.length > 0) {
          console.log(`[Widget Memory] Processing ${queuedMemories.length} queued memory items`);
          for (const mem of queuedMemories) {
            if (mem.facts) extractedFacts.push(...(mem.facts as any[]));
            if (mem.preferences) extractedPreferences.push(...(mem.preferences as any[]));
            if (mem.entities) extractedEntities.push(...(mem.entities as any[]));
          }
          console.log(`[Widget Memory] Total extracted: ${extractedFacts.length} facts, ${extractedPreferences.length} preferences, ${extractedEntities.length} entities`);
        }

        for (const call of toolCalls) {
          if (call.toolName === 'saveMemory') {
            const args = call.args as any;
            if (!args) continue;
            if (args.facts) extractedFacts.push(...args.facts);
            if (args.preferences) extractedPreferences.push(...args.preferences);
            if (args.entities) extractedEntities.push(...args.entities);
          }
        }

        // Convert to internal types
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
          attributes: {},
          confidence: 0.9,
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

        // Update Working Memory
        await updateWorkingMemory(
          widgetUserId,
          threadId,
          lastUserMsg,
          fullResponse,
          messageId,
          finalEntities,
          finalFacts
        );

        // Update User Profile (Long Term), even for widget users, but relying on TTL cleanup
        if (widgetUserId !== 'anonymous') {
          // Store Semantic
          await storeForSemanticRecall(widgetUserId, threadId, lastUserMsg, fullResponse);

          // Update Profile
          await updateUserProfile(
            widgetUserId,
            lastUserMsg,
            fullResponse,
            threadId,
            finalFacts,
            finalPreferences
          );

          // IMPLEMENT TTL: Auto-expire widget memories after 30 days
          // Check if this is a visitor ID (e.g. starts with 'vis_') or we just apply to all widget users
          // Since this API is purely for widgets, we can assume all users here are subject to TTL 
          // unless we have specific logic.
          // Visitor IDs from frontend start with 'vis_'. Legacy identifiers might be different.
          // Safety check: only apply if it looks like a generated visitor ID.
          // TTL for anonymous widget visitors (authenticated customers persist indefinitely)
          if (isAnonymous) {
            const expirationDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

            // Update all memories for this user to expire in 30 days
            const updateResult = await prisma.userMemory.updateMany({
              where: { userId: widgetUserId },
              data: { expiresAt: expirationDate }
            });

            console.log(`[Widget Memory] Refreshed TTL for visitor ${widgetUserId}. Updated ${updateResult.count} records.`);
          }
        }

      if (MEMORY_CONFIG.dualWrite && widgetUserId !== 'anonymous') {
        try {
          const mastraMemory = getMastraMemory();
          if (MEMORY_CONFIG.debug) {
            console.log('[Widget Memory] Dual-writing to Mastra Memory');
          }
          await mastraMemory.saveMessage(threadId, {
            role: 'user',
            content: lastUserMsg,
            metadata: { userId: widgetUserId, messageId, timestamp: new Date().toISOString() },
          });
          await mastraMemory.saveMessage(threadId, {
            role: 'assistant',
            content: fullResponse,
            metadata: { userId: widgetUserId, messageId, timestamp: new Date().toISOString() },
          });
          console.log('[Widget Memory] Saved to Mastra Memory (dual-write)');
        } catch (mastraError) {
          console.error('[Widget Memory] Mastra dual-write error (non-fatal):', mastraError);
        }
      }
      } catch (memError) {
        console.error("[Widget Chat] Memory update error:", memError)
      }
    })();
    } // end assistantMemoryConfig.enabled (normal chat save)

    const response = result.toTextStreamResponse()

    // Add CORS headers
    response.headers.set("Access-Control-Allow-Origin", "*")
    response.headers.set("X-RateLimit-Remaining", String(rateLimit.remaining))

    return response
  } catch (error) {
    console.error("[Widget Chat API] Error:", error)
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    )
  }
}

// Handle CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Widget-Api-Key",
    },
  })
}
