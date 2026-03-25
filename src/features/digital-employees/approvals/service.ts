import { orchestrator } from "@/lib/digital-employee"
import type { Prisma } from "@prisma/client"
import {
  findDashboardApprovalById,
  findDashboardEmployeeGroupById,
  findDashboardEmployeeRunById,
  updateDashboardApprovalById,
  updateDashboardEmployeeMessageStatus,
} from "./repository"
import type { RespondApprovalInput } from "./schema"

export interface ServiceError {
  status: number
  error: string
}

const APPROVAL_STATUS_MAP = {
  approved: "APPROVED",
  rejected: "REJECTED",
  edited: "EDITED",
} as const

type ApprovalResponseStatus = keyof typeof APPROVAL_STATUS_MAP

function isApprovalResponseStatus(value: string): value is ApprovalResponseStatus {
  return value in APPROVAL_STATUS_MAP
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Responds to a dashboard approval and triggers any related run/message updates.
 */
export async function respondToDashboardApproval(params: {
  id: string
  userId: string
  input: RespondApprovalInput
}): Promise<{ success: true } | ServiceError> {
  if (!isApprovalResponseStatus(params.input.status)) {
    return { status: 400, error: "Invalid status" }
  }

  const approval = await findDashboardApprovalById(params.id)
  if (!approval) {
    return { status: 404, error: "Approval not found" }
  }

  if (approval.status !== "PENDING" && approval.status !== "DELIVERED") {
    return { status: 400, error: "Approval already responded" }
  }

  await updateDashboardApprovalById(params.id, {
    status: APPROVAL_STATUS_MAP[params.input.status],
    respondedBy: params.userId,
    response: params.input.response as string | null | undefined,
    responseData:
      params.input.responseData === undefined ? undefined : (params.input.responseData as Prisma.InputJsonValue),
    respondedAt: new Date(),
  })

  if (approval.employeeRunId) {
    const run = await findDashboardEmployeeRunById(approval.employeeRunId)
    if (run && run.status === "PAUSED" && run.digitalEmployee?.groupId) {
      const groupId = run.digitalEmployee.groupId
      const containerUrl = await orchestrator.getGroupContainerUrl(groupId)
      if (containerUrl) {
        const group = await findDashboardEmployeeGroupById(groupId)
        try {
          await fetch(`${containerUrl}/resume`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(group?.gatewayToken ? { Authorization: `Bearer ${group.gatewayToken}` } : {}),
            },
            body: JSON.stringify({
              runId: run.id,
              approval: {
                status: params.input.status,
                response: params.input.response,
                responseData: params.input.responseData,
                respondedBy: params.userId,
              },
            }),
            signal: AbortSignal.timeout(30_000),
          })
        } catch (error) {
          console.error("Failed to resume run:", error)
        }
      }
    }
  }

  if (
    approval.requestType === "message_send" &&
    isRecord(approval.content) &&
    typeof approval.content.messageId === "string"
  ) {
    const nextStatus = APPROVAL_STATUS_MAP[params.input.status] === "APPROVED" ? "pending" : "cancelled"
    await updateDashboardEmployeeMessageStatus(approval.content.messageId, nextStatus)
  }

  return { success: true }
}
