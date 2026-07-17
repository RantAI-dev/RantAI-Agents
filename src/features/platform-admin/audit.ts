import { prisma } from "@/lib/prisma"

export interface AdminActor {
  id: string
  email: string
}

/** Append an admin-action audit row. Best-effort: audit failure never blocks the action. */
export async function writeAdminAudit(params: {
  actor: AdminActor
  action: string // e.g. "user.suspend", "provider.update", "kb.update"
  targetType: "user" | "provider" | "model" | "setting"
  targetId: string
  targetLabel?: string
  reason?: string
  metadata?: Record<string, unknown>
}): Promise<void> {
  try {
    await prisma.adminAuditLog.create({
      data: {
        actorId: params.actor.id,
        actorEmail: params.actor.email,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId,
        targetLabel: params.targetLabel ?? null,
        reason: params.reason ?? "",
        metadata: params.metadata ? JSON.parse(JSON.stringify(params.metadata)) : undefined,
      },
    })
  } catch (err) {
    console.warn(`[admin-audit] write failed: ${err instanceof Error ? err.message : err}`)
  }
}
