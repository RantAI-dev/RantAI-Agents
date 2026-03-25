import { prisma } from "@/lib/prisma"
import { decryptCredential } from "@/lib/workflow/credentials"
import { twilioWhatsApp, type TwilioWebhookPayload } from "@/lib/twilio-whatsapp"
import { whatsapp } from "@/lib/whatsapp"

export async function findEmployeeWebhookByToken(token: string) {
  return prisma.employeeWebhook.findUnique({
    where: { token },
    include: { digitalEmployee: { select: { id: true, status: true } } },
  })
}

export async function updateEmployeeWebhookStats(webhookId: string) {
  await prisma.employeeWebhook.update({
    where: { id: webhookId },
    data: {
      lastTriggeredAt: new Date(),
      triggerCount: { increment: 1 },
    },
  })
}

export async function findEmployeeGroupMembership(employeeId: string) {
  return prisma.digitalEmployee.findUnique({
    where: { id: employeeId },
    select: { id: true, groupId: true },
  })
}

export async function findEmployeeGroupGatewayToken(groupId: string) {
  return prisma.employeeGroup.findUnique({
    where: { id: groupId },
    select: { gatewayToken: true },
  })
}

export async function resolveGroupContainerUrl(groupId: string) {
  const { orchestrator } = await import("@/lib/digital-employee")
  return orchestrator.getGroupContainerUrl(groupId)
}

export async function triggerEmployeeWebhookOnGroupContainer(input: {
  containerUrl: string
  gatewayToken?: string | null
  employeeId: string
  webhookId: string
  webhookName: string
  payload: unknown
}) {
  const response = await fetch(`${input.containerUrl}/trigger`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(input.gatewayToken ? { Authorization: `Bearer ${input.gatewayToken}` } : {}),
    },
    body: JSON.stringify({
      employeeId: input.employeeId,
      trigger: {
        type: "webhook",
        input: {
          webhookId: input.webhookId,
          webhookName: input.webhookName,
          payload: input.payload,
        },
      },
    }),
    signal: AbortSignal.timeout(30_000),
  })

  const result = await response.json().catch(() => ({}))
  return result
}

export async function findConnectedWhatsAppIntegrationForEmployee(employeeId: string) {
  return prisma.employeeIntegration.findFirst({
    where: {
      digitalEmployeeId: employeeId,
      integrationId: "whatsapp",
      status: "connected",
    },
  })
}

export function decryptIntegrationCredential(encryptedData: string) {
  return decryptCredential(encryptedData)
}

export async function findEmployeeStatusAndGroup(employeeId: string) {
  return prisma.digitalEmployee.findUnique({
    where: { id: employeeId },
    select: { id: true, status: true, groupId: true },
  })
}

export async function findEmployeeGroupProxyConfig(groupId: string) {
  return prisma.employeeGroup.findUnique({
    where: { id: groupId },
    select: { containerPort: true, containerId: true, gatewayToken: true },
  })
}

export async function proxyWhatsAppWebhookToContainer(input: {
  gatewayUrl: string
  gatewayToken?: string | null
  signature?: string | null
  body: string
}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }

  if (input.gatewayToken) {
    headers.Authorization = `Bearer ${input.gatewayToken}`
  }

  if (input.signature) {
    headers["X-Hub-Signature-256"] = input.signature
  }

  const response = await fetch(`${input.gatewayUrl}/whatsapp`, {
    method: "POST",
    headers,
    body: input.body,
    signal: AbortSignal.timeout(30_000),
  })

  return {
    status: response.status,
    contentType: response.headers.get("Content-Type") || "application/json",
    body: await response.text(),
  }
}

export async function findConversationForWhatsAppSend(conversationId: string) {
  return prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      channel: true,
      customerPhone: true,
    },
  })
}

export async function sendWhatsAppMessageViaMeta(input: { to: string; message: string }) {
  return whatsapp.sendMessage(input)
}

export async function createAgentConversationMessage(input: {
  conversationId: string
  content: string
  sentBy: string
  whatsappMessageId?: string
}) {
  return prisma.message.create({
    data: {
      conversationId: input.conversationId,
      role: "AGENT",
      content: input.content,
      metadata: JSON.stringify({
        whatsappMessageId: input.whatsappMessageId,
        sentBy: input.sentBy,
      }),
    },
  })
}

export function parseTwilioIncomingPayload(payload: TwilioWebhookPayload) {
  return twilioWhatsApp.parseWebhookPayload(payload)
}

export async function getOrCreateTwilioConversation(phoneNumber: string, customerName: string) {
  return twilioWhatsApp.getOrCreateConversation(phoneNumber, customerName)
}

export async function saveTwilioConversationMessage(
  conversationId: string,
  role: "USER" | "ASSISTANT" | "AGENT" | "SYSTEM",
  content: string,
  metadata?: object
) {
  return twilioWhatsApp.saveMessage(conversationId, role, content, metadata)
}

export async function markConversationWaitingForAgent(conversationId: string) {
  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      status: "WAITING_FOR_AGENT",
      handoffAt: new Date(),
    },
  })
}

export async function sendTwilioWhatsAppMessage(input: { to: string; message: string }) {
  return twilioWhatsApp.sendMessage(input)
}

export async function findRecentConversationMessages(conversationId: string, take: number) {
  return prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take,
  })
}
