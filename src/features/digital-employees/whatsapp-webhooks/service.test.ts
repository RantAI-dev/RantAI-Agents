import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  handleTwilioWhatsAppWebhook,
  processEmployeeWebhookTrigger,
  sendWhatsAppConversationMessage,
  verifyEmployeeWhatsAppWebhook,
} from "./service"
import * as repository from "./repository"

vi.mock("./repository", () => ({
  createAgentConversationMessage: vi.fn(),
  decryptIntegrationCredential: vi.fn(),
  findConnectedWhatsAppIntegrationForEmployee: vi.fn(),
  findConversationForWhatsAppSend: vi.fn(),
  findEmployeeGroupGatewayToken: vi.fn(),
  findEmployeeGroupMembership: vi.fn(),
  findEmployeeGroupProxyConfig: vi.fn(),
  findEmployeeStatusAndGroup: vi.fn(),
  findEmployeeWebhookByToken: vi.fn(),
  findRecentConversationMessages: vi.fn(),
  getOrCreateTwilioConversation: vi.fn(),
  markConversationWaitingForAgent: vi.fn(),
  parseTwilioIncomingPayload: vi.fn(),
  proxyWhatsAppWebhookToContainer: vi.fn(),
  resolveGroupContainerUrl: vi.fn(),
  saveTwilioConversationMessage: vi.fn(),
  sendTwilioWhatsAppMessage: vi.fn(),
  sendWhatsAppMessageViaMeta: vi.fn(),
  triggerEmployeeWebhookOnGroupContainer: vi.fn(),
  updateEmployeeWebhookStats: vi.fn(),
}))

function createDeps() {
  return {
    ...repository,
    generateAiResponse: vi.fn(async () => "AI response"),
    getGlobalVerifyToken: () => "verify-token",
  } as never
}

describe("whatsapp-webhooks service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 404 when employee webhook token is invalid", async () => {
    vi.mocked(repository.findEmployeeWebhookByToken).mockResolvedValue(null)

    const result = await processEmployeeWebhookTrigger("bad-token", { hello: "world" }, createDeps())

    expect(result).toEqual({ status: 404, error: "Invalid or disabled webhook" })
  })

  it("rejects employee whatsapp verification when verify token mismatches", async () => {
    vi.mocked(repository.findConnectedWhatsAppIntegrationForEmployee).mockResolvedValue({
      encryptedData: "cipher",
    } as never)
    vi.mocked(repository.decryptIntegrationCredential).mockReturnValue({ verifyToken: "expected-token" })

    const result = await verifyEmployeeWhatsAppWebhook(
      "employee_1",
      {
        mode: "subscribe",
        token: "wrong-token",
        challenge: "challenge",
      },
      createDeps()
    )

    expect(result).toEqual({
      status: 403,
      text: "Forbidden",
      contentType: "text/plain",
    })
  })

  it("sends message and stores outbound agent message metadata", async () => {
    vi.mocked(repository.findConversationForWhatsAppSend).mockResolvedValue({
      id: "conv_1",
      channel: "WHATSAPP",
      customerPhone: "+15551234567",
    } as never)
    vi.mocked(repository.sendWhatsAppMessageViaMeta).mockResolvedValue({
      messages: [{ id: "wa_msg_1" }],
    } as never)
    vi.mocked(repository.createAgentConversationMessage).mockResolvedValue({
      id: "db_msg_1",
    } as never)

    const result = await sendWhatsAppConversationMessage(
      {
        conversationId: "conv_1",
        message: "Hello!",
        senderEmail: "agent@example.com",
      },
      createDeps()
    )

    expect(result).toEqual({
      status: 200,
      body: {
        success: true,
        messageId: "db_msg_1",
        whatsappMessageId: "wa_msg_1",
      },
    })
    expect(repository.createAgentConversationMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        sentBy: "agent@example.com",
        whatsappMessageId: "wa_msg_1",
      })
    )
  })

  it("handles AGENT keyword on twilio webhooks with handoff response", async () => {
    vi.mocked(repository.parseTwilioIncomingPayload).mockReturnValue({
      from: "+15550001111",
      fromName: "Alex",
      messageId: "SM123",
      content: "agent",
    } as never)
    vi.mocked(repository.getOrCreateTwilioConversation).mockResolvedValue({
      id: "conv_1",
      status: "AI_ACTIVE",
    } as never)

    const result = await handleTwilioWhatsAppWebhook(
      {
        MessageSid: "SM123",
        AccountSid: "AC123",
        From: "whatsapp:+15550001111",
        To: "whatsapp:+15559999999",
        Body: "agent",
        NumMedia: "0",
      },
      createDeps()
    )

    expect(result.status).toBe(200)
    expect(result.contentType).toBe("text/xml")
    expect(result.text).toContain("<Response></Response>")
    expect(repository.markConversationWaitingForAgent).toHaveBeenCalledWith("conv_1")
    expect(repository.sendTwilioWhatsAppMessage).toHaveBeenCalled()
  })
})
