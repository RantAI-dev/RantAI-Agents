import { prisma } from "@/lib/prisma"

export interface RetentionPolicy {
  runsRetentionDays: number      // default: 90
  messagesRetentionDays: number  // default: 90
  auditRetentionDays: number     // default: 365
  autoArchive: boolean
}

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  runsRetentionDays: 90,
  messagesRetentionDays: 90,
  auditRetentionDays: 365,
  autoArchive: false,
}

export async function applyRetentionPolicy(
  organizationId: string,
  policy: RetentionPolicy
): Promise<{ deletedRuns: number; deletedMessages: number; deletedAuditLogs: number }> {
  const now = new Date()
  const runsThreshold = new Date(now.getTime() - policy.runsRetentionDays * 86400000)
  const messagesThreshold = new Date(now.getTime() - policy.messagesRetentionDays * 86400000)
  const auditThreshold = new Date(now.getTime() - policy.auditRetentionDays * 86400000)

  const [deletedRuns, deletedMessages, deletedAuditLogs] = await Promise.all([
    prisma.employeeRun.deleteMany({
      where: {
        digitalEmployee: { organizationId },
        startedAt: { lt: runsThreshold },
        status: { in: ["COMPLETED", "FAILED"] },
      },
    }),
    prisma.employeeMessage.deleteMany({
      where: {
        organizationId,
        createdAt: { lt: messagesThreshold },
      },
    }),
    prisma.auditLog.deleteMany({
      where: {
        organizationId,
        createdAt: { lt: auditThreshold },
      },
    }),
  ])

  return {
    deletedRuns: deletedRuns.count,
    deletedMessages: deletedMessages.count,
    deletedAuditLogs: deletedAuditLogs.count,
  }
}

export async function exportEmployeeData(employeeId: string): Promise<Record<string, unknown>> {
  const employee = await prisma.digitalEmployee.findUnique({
    where: { id: employeeId },
    include: {
      assistant: { select: { id: true, name: true, model: true } },
      runs: {
        orderBy: { startedAt: "desc" },
        take: 500,
      },
      approvals: {
        orderBy: { createdAt: "desc" },
        take: 500,
      },
      files: true,
      customTools: true,
      installedSkills: true,
      goals: true,
      integrations: {
        select: {
          id: true,
          integrationId: true,
          status: true,
          connectedAt: true,
          // Exclude encryptedData for security
        },
      },
      sentMessages: {
        orderBy: { createdAt: "desc" },
        take: 500,
      },
      receivedMessages: {
        orderBy: { createdAt: "desc" },
        take: 500,
      },
      trustEvents: {
        orderBy: { createdAt: "desc" },
        take: 200,
      },
    },
  })

  if (!employee) throw new Error("Employee not found")

  // Serialize BigInt fields
  return JSON.parse(JSON.stringify(employee, (_, value) =>
    typeof value === "bigint" ? value.toString() : value
  ))
}

export async function purgeEmployeeData(employeeId: string): Promise<void> {
  // Cascading delete handles most relations, but let's be explicit
  await prisma.digitalEmployee.delete({
    where: { id: employeeId },
  })
}

export async function getExpiringCredentials(
  organizationId: string,
  withinDays: number = 7
): Promise<Array<{ employeeId: string; employeeName: string; integrationId: string; expiresAt: Date }>> {
  const threshold = new Date(Date.now() + withinDays * 86400000)

  const expiring = await prisma.employeeIntegration.findMany({
    where: {
      digitalEmployee: { organizationId },
      expiresAt: { lt: threshold, not: null },
      status: "connected",
    },
    include: {
      digitalEmployee: { select: { id: true, name: true } },
    },
  })

  return expiring.map((i) => ({
    employeeId: i.digitalEmployee.id,
    employeeName: i.digitalEmployee.name,
    integrationId: i.integrationId,
    expiresAt: i.expiresAt!,
  }))
}
