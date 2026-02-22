import { streamText, convertToModelMessages, tool, zodSchema, stepCountIs } from "ai";
import { z } from "zod";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { smartRetrieve, formatContextForPrompt, RetrievalResult } from "@/lib/rag";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_MODEL_ID, isValidModel, getModelById } from "@/lib/models";
import { resolveToolsForAssistant } from "@/lib/tools";
import {
  LANGUAGE_INSTRUCTION,
  LIVE_CHAT_HANDOFF_INSTRUCTION,
  CORRECTION_INSTRUCTION_WITH_TOOL,
  buildToolInstruction,
} from "@/lib/prompts/instructions";
import { resolveSkillsForAssistant } from "@/lib/skills/resolver";
import { executeChatflow, type ChatflowMemoryContext } from "@/lib/workflow/chatflow";
import { extractAndSaveFacts, stripSources } from "@/lib/workflow/chatflow-memory";
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

// Debug logging — only active in development
const debug = process.env.NODE_ENV !== "production"
  ? (...args: unknown[]) => console.log("[Chat API]", ...args)
  : () => {};

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

/** Generic fallback prompt — used when no assistant is selected */
const BASE_SYSTEM_PROMPT = `You are a helpful AI assistant. Answer questions accurately, concisely, and helpfully. Be friendly and professional.`;

export async function POST(req: Request) {
  try {
    // Auth guard — prevent unauthenticated LLM usage
    const session = await auth();
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

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
        debug("Failed to decode system prompt from header");
      }
    }

    const body = await req.json();
    const { messages: rawMessages } = body;

    // Extract threadId for memory tracking (generate one if not provided)
    const threadId = body.threadId || body.sessionId || `thread_${Date.now()}`;

    debug("===== REQUEST DEBUG =====");
    debug("Body keys:", Object.keys(body));
    debug("Body assistantId:", body.assistantId);
    debug("Body systemPrompt:", body.systemPrompt ? body.systemPrompt.substring(0, 40) + "..." : "null");
    debug("Body useKnowledgeBase:", body.useKnowledgeBase);
    debug("Header assistantId:", headerAssistantId);
    if (MEMORY_CONFIG.debug) {
      debug("Memory config:", getMemoryConfigSummary());
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
    // Priority: database assistant > custom prompt from request > fallback generic
    let systemPrompt: string;
    let useKnowledgeBase: boolean;
    let modelId: string = DEFAULT_MODEL_ID;
    let assistantModelConfig: Record<string, unknown> | null = null;
    let assistantGuardRails: Record<string, unknown> | null = null;

    if (assistantId) {
      // Look up assistant from database (all assistants including built-in are seeded there)
      try {
        const dbAssistant = await prisma.assistant.findUnique({
          where: { id: assistantId },
          select: {
            systemPrompt: true,
            model: true,
            useKnowledgeBase: true,
            knowledgeBaseGroupIds: true,
            memoryConfig: true,
            modelConfig: true,
            guardRails: true,
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
            systemPrompt += LIVE_CHAT_HANDOFF_INSTRUCTION;
          }
          // Read per-assistant model config (temperature, topP, etc.)
          if (dbAssistant.modelConfig && typeof dbAssistant.modelConfig === 'object') {
            assistantModelConfig = dbAssistant.modelConfig as Record<string, unknown>;
          }
          // Read per-assistant guard rails
          if (dbAssistant.guardRails && typeof dbAssistant.guardRails === 'object') {
            assistantGuardRails = dbAssistant.guardRails as Record<string, unknown>;
          }
          debug("Using database assistant:", dbAssistant.name, "with model:", modelId);
        } else if (customSystemPrompt) {
          systemPrompt = customSystemPrompt;
          useKnowledgeBase = useKnowledgeBaseParam ?? false;
          debug("Using custom system prompt");
        } else {
          systemPrompt = BASE_SYSTEM_PROMPT;
          systemPrompt += LANGUAGE_INSTRUCTION;
          useKnowledgeBase = true;
          debug("Assistant not found in DB, fallback to generic prompt");
        }
      } catch (error) {
        console.error("[Chat API] Error fetching assistant from database:", error);
        systemPrompt = customSystemPrompt || BASE_SYSTEM_PROMPT;
        systemPrompt += LANGUAGE_INSTRUCTION;
        useKnowledgeBase = useKnowledgeBaseParam ?? true;
      }
    } else if (customSystemPrompt) {
      // Custom system prompt from request
      systemPrompt = customSystemPrompt;
      useKnowledgeBase = useKnowledgeBaseParam ?? false;
      debug("Using custom/user-created assistant prompt");
    } else {
      // Fallback to generic prompt
      systemPrompt = BASE_SYSTEM_PROMPT;
      systemPrompt += LANGUAGE_INSTRUCTION;
      useKnowledgeBase = true;
      debug("Fallback to generic prompt");
    }

    // Validate model ID
    if (!isValidModel(modelId)) {
      console.warn(`[Chat API] Invalid model ID "${modelId}", falling back to default`);
      modelId = DEFAULT_MODEL_ID;
    }

    debug("System prompt preview:", systemPrompt.substring(0, 60) + "...");
    debug("useKnowledgeBase:", useKnowledgeBase);

    // Use session from auth guard at the top
    const userId = session.user.id;

    // ===== CHATFLOW CHECK =====
    // If this assistant has an active CHATFLOW workflow, execute it instead of normal chat.
    // If chatflow returns fallback (no STREAM_OUTPUT reached), continues to normal agent below.
    if (assistantId) {
      try {
        const chatflowWorkflow = await prisma.workflow.findFirst({
          where: {
            assistantId,
            mode: "CHATFLOW",
            status: "ACTIVE",
          },
        });

        if (chatflowWorkflow) {
          debug("Chatflow workflow found:", chatflowWorkflow.name);
          // Extract the last user message
          const lastMsg = [...rawMessages].reverse().find((m: { role: string }) => m.role === "user");
          const userText = lastMsg?.content || lastMsg?.parts?.find((p: { type: string; text?: string }) => p.type === "text")?.text || "";

          // Load memory (respect per-assistant memory config — same as normal chat)
          let memoryContext: ChatflowMemoryContext | undefined
          if (assistantMemoryConfig.enabled) {
            try {
              const wm = assistantMemoryConfig.workingMemory
                ? await loadWorkingMemory(threadId) : null

              let sr: SemanticRecallResult[] = []
              if (assistantMemoryConfig.semanticRecall && userId !== 'anonymous' && userText) {
                if (MEMORY_CONFIG.useMastraMemory) {
                  try {
                    const mastraMemory = getMastraMemory()
                    sr = await mastraMemory.recall(userText, { resourceId: userId, threadId, topK: 5 })
                  } catch (err) {
                    if (MEMORY_CONFIG.gracefulDegradation) {
                      sr = await semanticRecall(userText, userId, threadId)
                    }
                  }
                } else {
                  sr = await semanticRecall(userText, userId, threadId)
                }
              }

              const up = (assistantMemoryConfig.longTermProfile && userId !== 'anonymous')
                ? await loadUserProfile(userId) : null

              memoryContext = { workingMemory: wm, semanticResults: sr, userProfile: up }
              debug("Memory loaded for chatflow:", {
                workingMemory: wm ? wm.entities.size + " entities, " + wm.facts.size + " facts" : "disabled",
                semanticResults: sr.length,
                userProfile: up ? "yes" : "no",
              })
            } catch (err) {
              console.error("[Chat API] Memory load for chatflow error:", err)
            }
          }

          // Execute chatflow with memory
          const { response: chatflowResponse, fallback } = await executeChatflow(chatflowWorkflow, userText, systemPrompt, memoryContext)

          // Fallback: chatflow path didn't reach a STREAM_OUTPUT node (e.g. Switch default)
          // Continue to normal agent processing below
          if (fallback || !chatflowResponse) {
            debug("Chatflow fallback — continuing with normal agent")
            // Fall through to normal chat processing below
          } else {
            // Stream tee: fork stream for client + background memory save
            const chatBody = chatflowResponse.body
            if (chatBody && assistantMemoryConfig.enabled) {
              const [clientStream, saveStream] = chatBody.tee()
              const effectiveUserId = userId === 'anonymous' ? 'anon_' + threadId : userId

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

                  // Working memory (session)
                  if (assistantMemoryConfig.workingMemory) {
                    await updateWorkingMemory(effectiveUserId, threadId, userText, cleanResponse, messageId, [], [])
                  }

                  // Semantic recall (vector DB)
                  if (assistantMemoryConfig.semanticRecall && userId !== 'anonymous') {
                    await storeForSemanticRecall(userId, threadId, userText, cleanResponse)
                  }

                  // Mastra dual-write
                  if (MEMORY_CONFIG.dualWrite && userId !== 'anonymous') {
                    const mastraMemory = getMastraMemory()
                    await mastraMemory.saveMessage(threadId, { role: 'user', content: userText, metadata: { userId, messageId, timestamp: new Date().toISOString() } })
                    await mastraMemory.saveMessage(threadId, { role: 'assistant', content: cleanResponse, metadata: { userId, messageId, timestamp: new Date().toISOString() } })
                  }

                  // Extract facts to user profile (non-blocking LLM call)
                  if (userId !== 'anonymous') {
                    await extractAndSaveFacts(effectiveUserId, threadId, userText, cleanResponse)
                  }

                  console.log(`[Chat API] Chatflow memory saved for ${effectiveUserId} (thread: ${threadId})`)
                } catch (err) {
                  console.error("[Chat API] Chatflow memory save error:", err)
                }
              })()

              return new Response(clientStream, { headers: chatflowResponse.headers })
            } else {
              return chatflowResponse
            }
          }
        }
      } catch (error) {
        console.error("[Chat API] Chatflow check error (continuing with normal chat):", error);
      }
    }

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
            minSimilarity: 0.30,
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

            console.log(
              `[RAG] Retrieved ${retrievalResult.chunks.length} chunks for query: "${userQuery.substring(0, 50)}..."`
            );
            console.log(
              `[RAG] Sources: ${retrievalResult.sources.map((s) => s.documentTitle).join(", ")}`
            );
          } else {
            console.log(`[RAG] No results for query: "${userQuery.substring(0, 50)}..." (groupIds: ${JSON.stringify(knowledgeBaseGroupIds)})`);
          }
        } catch (error) {
          // Log error but continue without RAG context
          console.error("[RAG] Error during retrieval:", error);
        }
      }
    }

    // ===== SKILL RESOLUTION =====
    if (assistantId) {
      try {
        const skillPrompt = await resolveSkillsForAssistant(assistantId);
        if (skillPrompt) {
          systemPrompt += "\n\n" + skillPrompt;
          debug("Skills appended to prompt:", skillPrompt.substring(0, 80) + "...");
        }
      } catch (error) {
        console.error("[Chat API] Skill resolution error:", error);
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
        systemPrompt += CORRECTION_INSTRUCTION_WITH_TOOL;
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

    debug("Using model:", modelId);

    // ===== TOOL RESOLUTION =====
    // Resolve assistant-configured tools (builtin, custom, MCP)
    const { tools: resolvedTools, toolNames } = assistantId
      ? await resolveToolsForAssistant(assistantId, modelId, {
          userId: session?.user?.id,
          assistantId,
          sessionId: body.sessionId || undefined,
          organizationId: body.organizationId || undefined,
        })
      : { tools: {}, toolNames: [] as string[] };

    // ===== TOOLBAR OVERRIDES =====
    // Honor per-message enableTools toggle — strip all assistant tools when disabled
    if (body.enableTools === false) {
      for (const key of Object.keys(resolvedTools)) {
        delete resolvedTools[key];
      }
      toolNames.length = 0;
      debug("All tools disabled by user toggle");
    }

    // Honor per-message enableWebSearch toggle from the toolbar
    const enableWebSearch = body.enableWebSearch;
    if (enableWebSearch === false && resolvedTools.web_search) {
      delete resolvedTools.web_search;
      const idx = toolNames.indexOf("web_search");
      if (idx !== -1) toolNames.splice(idx, 1);
      debug("Web search disabled by user toggle");
    } else if (enableWebSearch === true && !resolvedTools.web_search) {
      // Dynamically add web search tool even if not bound to assistant
      const { BUILTIN_TOOLS } = await import("@/lib/tools/builtin");
      const wsTool = BUILTIN_TOOLS.web_search;
      if (wsTool) {
        resolvedTools.web_search = tool({
          description: wsTool.description,
          inputSchema: zodSchema(wsTool.parameters),
          execute: async (params) => wsTool.execute(params as Record<string, unknown>, {
            userId: session?.user?.id,
            assistantId,
            sessionId: body.sessionId || undefined,
          }),
        });
        toolNames.push("web_search");
        debug("Web search enabled by user toggle");
      }
    }

    // ===== AUTO ARTIFACT TOOLS =====
    // Always inject artifact tools for models that support function calling (auto mode)
    // Canvas mode controls prompt behavior (forced vs auto), not tool availability
    const modelInfo = getModelById(modelId);
    if (modelInfo?.capabilities.functionCalling && !resolvedTools.create_artifact) {
      const { BUILTIN_TOOLS } = await import("@/lib/tools/builtin");
      const createTool = BUILTIN_TOOLS.create_artifact;
      const updateTool = BUILTIN_TOOLS.update_artifact;
      if (createTool) {
        resolvedTools.create_artifact = tool({
          description: createTool.description,
          inputSchema: zodSchema(createTool.parameters),
          execute: async (params) => createTool.execute(params as Record<string, unknown>, {
            userId: session?.user?.id,
            assistantId,
            organizationId: body.organizationId || undefined,
            sessionId: body.sessionId || undefined,
          }),
        });
        toolNames.push("create_artifact");
      }
      if (updateTool) {
        resolvedTools.update_artifact = tool({
          description: updateTool.description,
          inputSchema: zodSchema(updateTool.parameters),
          execute: async (params) => updateTool.execute(params as Record<string, unknown>, {
            userId: session?.user?.id,
            assistantId,
            organizationId: body.organizationId || undefined,
            sessionId: body.sessionId || undefined,
          }),
        });
        toolNames.push("update_artifact");
      }
      debug("Artifact tools auto-injected for capable model");
    }

    const hasAssistantTools = Object.keys(resolvedTools).length > 0;
    if (hasAssistantTools) {
      debug("Tools enabled:", toolNames.join(", "));
      // Instruct the model to use its tools instead of hallucinating
      systemPrompt += buildToolInstruction(toolNames, {
        targetArtifactId: body.targetArtifactId,
        canvasMode: body.canvasMode,
      });
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

    // Resolve prompt variables ({{user_name}}, {{date}}, etc.)
    {
      const { resolvePromptVariables } = await import("@/lib/prompts/variables");
      systemPrompt = resolvePromptVariables(systemPrompt, {
        userName: session.user.name || undefined,
        assistantName: undefined, // Already in the prompt context
      });
    }

    // Append guard rails instructions if configured
    if (assistantGuardRails) {
      const { buildGuardRailsPrompt } = await import("@/lib/prompts/guard-rails");
      const guardRailsPrompt = buildGuardRailsPrompt(assistantGuardRails as any);
      if (guardRailsPrompt) systemPrompt += guardRailsPrompt;
    }

    // Append response format instruction if configured
    if (assistantModelConfig?.responseFormat && assistantModelConfig.responseFormat !== "default") {
      const { getResponseFormatInstruction } = await import("@/lib/prompts/response-format");
      const formatInstruction = getResponseFormatInstruction(assistantModelConfig.responseFormat as string);
      if (formatInstruction) systemPrompt += formatInstruction;
    }

    const result = streamText({
      model: openrouter(modelId),
      system: systemPrompt,
      messages,
      tools: allTools,
      stopWhen: hasAssistantTools ? stepCountIs(5) : stepCountIs(2),
      // Per-assistant model parameters
      ...(assistantModelConfig?.temperature != null && { temperature: Number(assistantModelConfig.temperature) }),
      ...(assistantModelConfig?.topP != null && { topP: Number(assistantModelConfig.topP) }),
      ...(assistantModelConfig?.maxTokens != null && { maxTokens: Number(assistantModelConfig.maxTokens) }),
      ...(assistantModelConfig?.presencePenalty != null && { presencePenalty: Number(assistantModelConfig.presencePenalty) }),
      ...(assistantModelConfig?.frequencyPenalty != null && { frequencyPenalty: Number(assistantModelConfig.frequencyPenalty) }),
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
    return new Response(JSON.stringify({ error: "An internal error occurred. Please try again." }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
