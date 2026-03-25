import {
  AUDIT_ACTIONS,
  classifyActionRisk,
  logAudit,
} from "@/lib/digital-employee/audit"
import {
  createRuntimeMessage,
  createRuntimeApproval,
  findRuntimeActiveRun,
  findRuntimeEmployeeById,
  findRuntimeEmployeeByIdAndOrganization,
  findRuntimeInboxMessages,
  findRuntimeMessageById,
  markRuntimeMessagesDelivered,
  updateRuntimeMessage,
} from "./repository"
import type { RuntimeReplyInput, RuntimeSendMessageInput } from "./schema"

export interface ServiceError {
  status: number
  error: string
}

const MESSAGE_TYPES = ["message", "task", "handoff", "broadcast"] as const
const MESSAGE_PRIORITIES = ["low", "normal", "high", "urgent"] as const

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

/**
 * Loads the runtime inbox for an employee and marks pending messages delivered.
 */
export async function getRuntimeInboxMessages(employeeId: string) {
  const messages = await findRuntimeInboxMessages(employeeId)
  const pendingIds = messages.filter((message) => message.status === "pending").map((message) => message.id)

  if (pendingIds.length > 0) {
    await markRuntimeMessagesDelivered(pendingIds)
  }

  return messages
}

/**
 * Sends a runtime message, including approval gating for low-autonomy task/handoff sends.
 */
export async function sendRuntimeMessage(
  input: RuntimeSendMessageInput
): Promise<
  | {
      success: true
      messageId: string
      requiresApproval?: true
      waitingForResponse?: true
    }
  | ServiceError
> {
  if (!isNonEmptyString(input.employeeId)) {
    return { status: 400, error: "employeeId required" }
  }

  if (!isNonEmptyString(input.type) || !MESSAGE_TYPES.includes(input.type as (typeof MESSAGE_TYPES)[number])) {
    return { status: 400, error: "Invalid type" }
  }

  if (!isNonEmptyString(input.subject)) {
    return { status: 400, error: "subject required" }
  }

  if (!isNonEmptyString(input.content)) {
    return { status: 400, error: "content required" }
  }

  if (!isNonEmptyString(input.toEmployeeId) && !isNonEmptyString(input.toGroup)) {
    return { status: 400, error: "toEmployeeId or toGroup required" }
  }

  const sender = await findRuntimeEmployeeById(input.employeeId)
  if (!sender) {
    return { status: 404, error: "Sender not found" }
  }

  if (isNonEmptyString(input.toEmployeeId)) {
    const recipient = await findRuntimeEmployeeByIdAndOrganization(
      input.toEmployeeId,
      sender.organizationId
    )
    if (!recipient) {
      return { status: 404, error: "Recipient not found in organization" }
    }
  }

  const requiresApproval =
    (sender.autonomyLevel === "L1" || sender.autonomyLevel === "L2") &&
    (input.type === "task" || input.type === "handoff")

  if (requiresApproval) {
    const message = await createRuntimeMessage({
      organizationId: sender.organizationId,
      fromEmployeeId: input.employeeId,
      toEmployeeId: isNonEmptyString(input.toEmployeeId) ? input.toEmployeeId : null,
      toGroup: isNonEmptyString(input.toGroup) ? input.toGroup : null,
      type: input.type,
      subject: input.subject,
      content: input.content,
      priority:
        typeof input.priority === "string" && MESSAGE_PRIORITIES.includes(input.priority as (typeof MESSAGE_PRIORITIES)[number])
          ? input.priority
          : "normal",
      attachments: input.attachments || [],
      status: "pending_approval",
      metadata: input.waitForResponse ? { waitForResponse: true } : {},
    })

    const activeRun = await findRuntimeActiveRun(input.employeeId)
    if (activeRun) {
      await createRuntimeApproval({
        digitalEmployeeId: input.employeeId,
        employeeRunId: activeRun.id,
        requestType: "message_send",
        title: `Send ${input.type} to ${isNonEmptyString(input.toEmployeeId) ? "employee" : input.toGroup || "group"}`,
        description: input.subject,
        content: {
          messageId: message.id,
          type: input.type,
          subject: input.subject,
          content: input.content,
          toEmployeeId: isNonEmptyString(input.toEmployeeId) ? input.toEmployeeId : undefined,
          toGroup: isNonEmptyString(input.toGroup) ? input.toGroup : undefined,
        },
        options: [
          { label: "Approve", value: "approved" },
          { label: "Reject", value: "rejected" },
        ],
      })
    }

    logAudit({
      organizationId: sender.organizationId,
      employeeId: input.employeeId,
      action: AUDIT_ACTIONS.MESSAGE_SEND,
      resource: `message:${message.id}`,
      detail: {
        type: input.type,
        toEmployeeId: input.toEmployeeId,
        toGroup: input.toGroup,
        subject: input.subject,
        requiresApproval: true,
      },
      riskLevel: classifyActionRisk(AUDIT_ACTIONS.MESSAGE_SEND),
    }).catch(() => {})

    return { success: true, messageId: message.id, requiresApproval: true }
  }

  const message = await createRuntimeMessage({
    organizationId: sender.organizationId,
    fromEmployeeId: input.employeeId,
    toEmployeeId: isNonEmptyString(input.toEmployeeId) ? input.toEmployeeId : null,
    toGroup: isNonEmptyString(input.toGroup) ? input.toGroup : null,
    type: input.type,
    subject: input.subject,
    content: input.content,
    priority:
      typeof input.priority === "string" && MESSAGE_PRIORITIES.includes(input.priority as (typeof MESSAGE_PRIORITIES)[number])
        ? input.priority
        : "normal",
    attachments: input.attachments || [],
    metadata: input.waitForResponse ? { waitForResponse: true } : {},
  })

  logAudit({
    organizationId: sender.organizationId,
    employeeId: input.employeeId,
    action: AUDIT_ACTIONS.MESSAGE_SEND,
    resource: `message:${message.id}`,
    detail: {
      type: input.type,
      toEmployeeId: input.toEmployeeId,
      toGroup: input.toGroup,
      subject: input.subject,
    },
    riskLevel: classifyActionRisk(AUDIT_ACTIONS.MESSAGE_SEND),
  }).catch(() => {})

  if (input.type === "task" && input.waitForResponse) {
    return { success: true, messageId: message.id, waitingForResponse: true }
  }

  return { success: true, messageId: message.id }
}

/**
 * Creates a reply to an existing runtime message and marks the original completed.
 */
export async function replyToRuntimeMessage(
  messageId: string,
  input: RuntimeReplyInput
): Promise<{ success: true } | ServiceError> {
  if (!isNonEmptyString(input.employeeId)) {
    return { status: 400, error: "employeeId required" }
  }

  if (!isNonEmptyString(input.content)) {
    return { status: 400, error: "content required" }
  }

  const originalMessage = await findRuntimeMessageById(messageId)
  if (!originalMessage) {
    return { status: 404, error: "Message not found" }
  }

  if (originalMessage.toEmployeeId !== input.employeeId) {
    return { status: 403, error: "Not the recipient of this message" }
  }

  await createRuntimeMessage({
    organizationId: originalMessage.organizationId,
    fromEmployeeId: input.employeeId,
    toEmployeeId: originalMessage.fromEmployeeId,
    toGroup: null,
    type: originalMessage.type,
    subject: `Re: ${originalMessage.subject}`,
    content: input.content,
    parentMessageId: originalMessage.id,
    metadata: input.data ? { responseData: input.data } : {},
  })

  await updateRuntimeMessage(originalMessage.id, {
    status: "completed",
    responseContent: input.content,
    responseData: input.data || undefined,
    respondedAt: new Date(),
  })

  return { success: true }
}

/**
 * Loads the sender-facing status for a previously sent runtime message.
 */
export async function getRuntimeMessageStatus(
  messageId: string,
  employeeId: string
): Promise<
  | {
      status: string
      responseContent: string | null
      responseData: unknown
      respondedAt: Date | null
    }
  | ServiceError
> {
  if (!isNonEmptyString(employeeId)) {
    return { status: 400, error: "employeeId query param required" }
  }

  const message = await findRuntimeMessageById(messageId)
  if (!message) {
    return { status: 404, error: "Message not found" }
  }

  if (message.fromEmployeeId !== employeeId) {
    return { status: 403, error: "Not authorized to view this message" }
  }

  return {
    status: message.status,
    responseContent: message.responseContent,
    responseData: message.responseData,
    respondedAt: message.respondedAt,
  }
}
