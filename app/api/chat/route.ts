import { streamText, convertToModelMessages } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { smartRetrieve, formatContextForPrompt, RetrievalResult } from "@/lib/rag";
import { DEFAULT_ASSISTANTS } from "@/lib/assistants/defaults";
import { auth } from "@/lib/auth";
import { getCustomerContext, formatCustomerContextForPrompt } from "@/lib/customer-context";
import { prisma } from "@/lib/prisma";
import { DEFAULT_MODEL_ID, isValidModel } from "@/lib/models";

// Delimiter for sending sources metadata after stream
const SOURCES_DELIMITER = "\n\n---SOURCES---\n";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// Base system prompt with company information and guidelines
const BASE_SYSTEM_PROMPT = `You are a friendly and knowledgeable insurance assistant for HorizonLife, a trusted insurance company. Your role is to help visitors understand our insurance products and guide them toward the right coverage.

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

  console.log("[Chat API] ===== REQUEST DEBUG =====");
  console.log("[Chat API] Body keys:", Object.keys(body));
  console.log("[Chat API] Body assistantId:", body.assistantId);
  console.log("[Chat API] Body systemPrompt:", body.systemPrompt ? body.systemPrompt.substring(0, 40) + "..." : "null");
  console.log("[Chat API] Body useKnowledgeBase:", body.useKnowledgeBase);
  console.log("[Chat API] Header assistantId:", headerAssistantId);

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
          name: true,
        },
      });

      if (dbAssistant) {
        systemPrompt = dbAssistant.systemPrompt;
        useKnowledgeBase = dbAssistant.useKnowledgeBase;
        modelId = dbAssistant.model || DEFAULT_MODEL_ID;
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

  console.log("[Chat API] Using model:", modelId);

  const result = streamText({
    model: openrouter(modelId),
    system: systemPrompt,
    messages,
  });

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
