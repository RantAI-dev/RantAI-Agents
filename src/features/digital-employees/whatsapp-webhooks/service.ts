import type { TwilioWebhookPayload } from "@/lib/twilio-whatsapp"
import type {
  EmployeeWhatsAppVerifyQueryInput,
  GlobalWhatsAppVerifyQueryInput,
  SendWhatsAppBodyInput,
  TwilioWebhookFormInput,
} from "./schema"
import * as repository from "./repository"

const WHATSAPP_SYSTEM_PROMPT = `You are a helpful insurance assistant for HorizonLife Insurance, responding via WhatsApp.

IMPORTANT GUIDELINES:
1. Keep responses concise and mobile-friendly (WhatsApp users prefer shorter messages)
2. Use simple formatting - avoid complex markdown (WhatsApp supports *bold* and _italic_)
3. Break long responses into multiple short paragraphs
4. Be conversational and friendly
5. If user wants to speak to a human agent, tell them to type "AGENT" and you will connect them

PRODUCTS:
- Life Insurance: Term Life ($15/month), Whole Life ($45/month), Universal Life
- Health Insurance: Individual ($199/month), Family ($499/month)
- Home Insurance: Basic ($75/month), Premium ($125/month)
- Auto Insurance: Starting at $89/month

When users express purchase intent or ask for quotes, encourage them to:
1. Visit our website at horizonlife.com
2. Type "AGENT" to speak with a sales representative
3. Call us at 1-800-HORIZON

Always be helpful and provide accurate information about our insurance products.`

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'

export interface ServiceError {
  status: number
  error: string
}

export interface JsonServiceResult<TBody = unknown> {
  status: number
  body: TBody
}

export interface TextServiceResult {
  status: number
  text: string
  contentType: string
}

interface AiMessage {
  role: "user" | "assistant"
  content: string
}

type ServiceDeps = typeof repository & {
  generateAiResponse: (system: string, messages: AiMessage[]) => Promise<string>
  getGlobalVerifyToken: () => string | undefined
}

async function defaultGenerateAiResponse(system: string, messages: AiMessage[]): Promise<string> {
  const { streamText } = await import("ai")
  const { createOpenRouter } = await import("@openrouter/ai-sdk-provider")

  const openrouter = createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
  })

  const result = streamText({
    model: openrouter("openai/gpt-4o-mini"),
    system,
    messages,
  })

  let fullResponse = ""
  for await (const chunk of result.textStream) {
    fullResponse += chunk
  }

  return fullResponse
}

const defaultDeps: ServiceDeps = {
  ...repository,
  generateAiResponse: defaultGenerateAiResponse,
  getGlobalVerifyToken: () => process.env.WHATSAPP_VERIFY_TOKEN,
}

function toTwimlResponse(): TextServiceResult {
  return {
    status: 200,
    text: EMPTY_TWIML,
    contentType: "text/xml",
  }
}

function cleanupWhatsAppResponse(message: string): string {
  return message
    .replace(/\*\*/g, "*")
    .replace(/#{1,3}\s/g, "*")
    .trim()
}

function getObjectValue(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) return undefined
  if (!(key in value)) return undefined
  return (value as Record<string, unknown>)[key]
}

/**
 * Handles generic employee webhook triggers and forwards them to the group container.
 */
export async function processEmployeeWebhookTrigger(
  token: string,
  payload: unknown,
  deps: ServiceDeps = defaultDeps
): Promise<JsonServiceResult<{ received: true; runId: unknown }> | ServiceError> {
  const webhook = await deps.findEmployeeWebhookByToken(token)

  if (!webhook || !webhook.enabled) {
    return { status: 404, error: "Invalid or disabled webhook" }
  }

  if (webhook.digitalEmployee.status !== "ACTIVE") {
    return { status: 409, error: "Employee not active" }
  }

  await deps.updateEmployeeWebhookStats(webhook.id)

  const employee = await deps.findEmployeeGroupMembership(webhook.digitalEmployeeId)
  if (!employee?.groupId) {
    return { status: 500, error: "Employee has no group" }
  }

  const containerUrl = await deps.resolveGroupContainerUrl(employee.groupId)
  if (!containerUrl) {
    return { status: 503, error: "Group container not running" }
  }

  const group = await deps.findEmployeeGroupGatewayToken(employee.groupId)
  const result = await deps.triggerEmployeeWebhookOnGroupContainer({
    containerUrl,
    gatewayToken: group?.gatewayToken,
    employeeId: webhook.digitalEmployeeId,
    webhookId: webhook.id,
    webhookName: webhook.name,
    payload,
  })

  return {
    status: 200,
    body: {
      received: true,
      runId: getObjectValue(result, "runId"),
    },
  }
}

/**
 * Verifies employee-scoped Meta webhook subscriptions.
 */
export async function verifyEmployeeWhatsAppWebhook(
  employeeId: string,
  query: EmployeeWhatsAppVerifyQueryInput,
  deps: ServiceDeps = defaultDeps
): Promise<TextServiceResult> {
  if (query.mode !== "subscribe" || !query.token || !query.challenge) {
    return {
      status: 400,
      text: "Bad request",
      contentType: "text/plain",
    }
  }

  const integration = await deps.findConnectedWhatsAppIntegrationForEmployee(employeeId)
  if (!integration?.encryptedData) {
    return {
      status: 404,
      text: "Not found",
      contentType: "text/plain",
    }
  }

  const creds = deps.decryptIntegrationCredential(integration.encryptedData)
  if (query.token !== creds.verifyToken) {
    return {
      status: 403,
      text: "Forbidden",
      contentType: "text/plain",
    }
  }

  return {
    status: 200,
    text: query.challenge,
    contentType: "text/plain",
  }
}

/**
 * Proxies incoming Meta WhatsApp payloads to the employee's runtime container.
 */
export async function proxyEmployeeWhatsAppWebhook(
  input: { employeeId: string; body: string; signature?: string | null },
  deps: ServiceDeps = defaultDeps
): Promise<{ type: "json"; status: number; body: unknown } | { type: "text"; status: number; text: string; contentType: string }> {
  try {
    const employee = await deps.findEmployeeStatusAndGroup(input.employeeId)

    if (!employee || employee.status !== "ACTIVE") {
      return {
        type: "json",
        status: 409,
        body: { error: "Employee not active" },
      }
    }

    const group = await deps.findEmployeeGroupProxyConfig(employee.groupId)
    if (!group?.containerId || !group.containerPort) {
      return {
        type: "json",
        status: 503,
        body: { error: "Container not running" },
      }
    }

    const proxied = await deps.proxyWhatsAppWebhookToContainer({
      gatewayUrl: `http://localhost:${group.containerPort}`,
      gatewayToken: group.gatewayToken,
      signature: input.signature,
      body: input.body,
    })

    return {
      type: "text",
      status: proxied.status,
      text: proxied.body,
      contentType: proxied.contentType,
    }
  } catch (error) {
    console.error("[WhatsApp Webhook] Proxy failed:", error)
    return {
      type: "json",
      status: 200,
      body: { received: true, proxied: false },
    }
  }
}

/**
 * Sends agent-authored outbound WhatsApp messages and stores the transcript message.
 */
export async function sendWhatsAppConversationMessage(
  input: SendWhatsAppBodyInput & { senderEmail: string },
  deps: ServiceDeps = defaultDeps
): Promise<
  | JsonServiceResult<{ success: true; messageId: string; whatsappMessageId: unknown }>
  | ServiceError
> {
  const conversation = await deps.findConversationForWhatsAppSend(input.conversationId)

  if (!conversation) {
    return { status: 404, error: "Conversation not found" }
  }

  if (conversation.channel !== "WHATSAPP") {
    return { status: 400, error: "Not a WhatsApp conversation" }
  }

  if (!conversation.customerPhone) {
    return { status: 400, error: "Customer phone number not found" }
  }

  const sendResult = await deps.sendWhatsAppMessageViaMeta({
    to: conversation.customerPhone,
    message: input.message,
  })

  const whatsappMessageId = getObjectValue(
    Array.isArray(getObjectValue(sendResult, "messages"))
      ? (getObjectValue(sendResult, "messages") as unknown[])[0]
      : undefined,
    "id"
  )

  const savedMessage = await deps.createAgentConversationMessage({
    conversationId: input.conversationId,
    content: input.message,
    sentBy: input.senderEmail,
    whatsappMessageId: typeof whatsappMessageId === "string" ? whatsappMessageId : undefined,
  })

  return {
    status: 200,
    body: {
      success: true,
      messageId: savedMessage.id,
      whatsappMessageId,
    },
  }
}

/**
 * Verifies the global WhatsApp webhook endpoint challenge-response.
 */
export function verifyGlobalWhatsAppWebhook(
  query: GlobalWhatsAppVerifyQueryInput,
  deps: ServiceDeps = defaultDeps
): TextServiceResult {
  const verifyToken = deps.getGlobalVerifyToken()

  console.log("[WhatsApp Webhook] Verification attempt:", {
    mode: query.mode,
    token: query.token,
    challenge: query.challenge,
  })

  if (query.mode === "subscribe" && query.token === verifyToken) {
    console.log("[WhatsApp Webhook] Verification successful")
    return {
      status: 200,
      text: query.challenge ?? "",
      contentType: "text/plain",
    }
  }

  console.log("[WhatsApp Webhook] Verification failed")
  return {
    status: 403,
    text: "Forbidden",
    contentType: "text/plain",
  }
}

/**
 * Handles incoming Twilio WhatsApp webhooks and optionally generates AI replies.
 */
export async function handleTwilioWhatsAppWebhook(
  input: TwilioWebhookFormInput,
  deps: ServiceDeps = defaultDeps
): Promise<TextServiceResult> {
  try {
    const payload: TwilioWebhookPayload = {
      MessageSid: input.MessageSid || "",
      AccountSid: input.AccountSid || "",
      From: input.From || "",
      To: input.To || "",
      Body: input.Body || "",
      NumMedia: input.NumMedia || "",
      ProfileName: input.ProfileName,
      WaId: input.WaId,
    }

    if (!payload.From || !payload.Body) {
      return {
        status: 400,
        text: "Bad Request",
        contentType: "text/plain",
      }
    }

    const msg = deps.parseTwilioIncomingPayload(payload)
    console.log(`[WhatsApp] Message from ${msg.fromName} (${msg.from}): ${msg.content}`)

    const conversation = await deps.getOrCreateTwilioConversation(msg.from, msg.fromName)

    await deps.saveTwilioConversationMessage(conversation.id, "USER", msg.content, {
      twilioMessageSid: msg.messageId,
    })

    if (msg.content.toLowerCase().trim() === "agent") {
      await deps.markConversationWaitingForAgent(conversation.id)

      await deps.sendTwilioWhatsAppMessage({
        to: msg.from,
        message:
          "I'm connecting you with a live agent now. Please wait a moment while I find someone to assist you. An agent will respond to you shortly.\n\nIn the meantime, feel free to share any additional details about your inquiry.",
      })

      await deps.saveTwilioConversationMessage(
        conversation.id,
        "SYSTEM",
        "Customer requested to speak with an agent"
      )

      console.log(`[WhatsApp] Agent requested by ${msg.from}`)
      return toTwimlResponse()
    }

    if (conversation.status === "AGENT_CONNECTED" || conversation.status === "WAITING_FOR_AGENT") {
      return toTwimlResponse()
    }

    try {
      const recentMessages = await deps.findRecentConversationMessages(conversation.id, 10)
      const aiMessages: AiMessage[] = recentMessages.reverse().map((message) => ({
        role: message.role === "USER" ? "user" : "assistant",
        content: message.content,
      }))

      const aiResponse = await deps.generateAiResponse(WHATSAPP_SYSTEM_PROMPT, aiMessages)
      const cleanedResponse = cleanupWhatsAppResponse(aiResponse)

      await deps.sendTwilioWhatsAppMessage({ to: msg.from, message: cleanedResponse })
      await deps.saveTwilioConversationMessage(conversation.id, "ASSISTANT", cleanedResponse)

      console.log(`[WhatsApp] Sent AI response to ${msg.from}`)
    } catch (aiError) {
      console.error("[WhatsApp] Error generating AI response:", aiError)
      await deps.sendTwilioWhatsAppMessage({
        to: msg.from,
        message:
          "I apologize, but I'm having trouble processing your request right now. Please try again in a moment or type AGENT to speak with a human representative.",
      })
    }

    return toTwimlResponse()
  } catch (error) {
    console.error("[WhatsApp Webhook] Error:", error)
    return toTwimlResponse()
  }
}
