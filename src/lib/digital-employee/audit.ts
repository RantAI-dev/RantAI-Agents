import { prisma } from "@/lib/prisma"

export interface AuditEntry {
  organizationId: string
  employeeId?: string
  userId?: string
  action: string
  resource: string
  detail?: Record<string, unknown>
  ipAddress?: string
  riskLevel?: "low" | "medium" | "high" | "critical"
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  // Fire-and-forget — don't block the request
  await prisma.auditLog.create({
    data: {
      organizationId: entry.organizationId,
      employeeId: entry.employeeId || null,
      userId: entry.userId || null,
      action: entry.action,
      resource: entry.resource,
      detail: (entry.detail || {}) as object,
      ipAddress: entry.ipAddress || null,
      riskLevel: entry.riskLevel || "low",
    },
  })
}

export function classifyActionRisk(action: string): "low" | "medium" | "high" | "critical" {
  if (action.startsWith("credential.")) return "critical"
  if (action === "employee.delete" || action === "employee.archive") return "high"
  if (action.startsWith("approval.") || action.startsWith("message.")) return "medium"
  return "low"
}

export const AUDIT_ACTIONS = {
  TOOL_EXECUTE: "tool.execute",
  APPROVAL_RESPOND: "approval.respond",
  CREDENTIAL_ACCESS: "credential.access",
  CREDENTIAL_STORE: "credential.store",
  MESSAGE_SEND: "message.send",
  MESSAGE_REPLY: "message.reply",
  EMPLOYEE_CREATE: "employee.create",
  EMPLOYEE_UPDATE: "employee.update",
  EMPLOYEE_DELETE: "employee.delete",
  EMPLOYEE_DEPLOY: "employee.deploy",
  EMPLOYEE_PROMOTE: "employee.promote",
  EMPLOYEE_DEMOTE: "employee.demote",
  RUN_START: "run.start",
  RUN_COMPLETE: "run.complete",
  RUN_FAIL: "run.fail",
  INTEGRATION_CONNECT: "integration.connect",
  INTEGRATION_DISCONNECT: "integration.disconnect",
} as const
