import { classifyActionRisk, AUDIT_ACTIONS } from "@/lib/digital-employee/audit"
import {
  AUTONOMY_LEVELS,
  computeTrustScore,
  mapLegacyAutonomy,
  shouldDemote,
  suggestPromotion,
} from "@/lib/digital-employee/trust"
import type { Prisma } from "@prisma/client"
import {
  createDigitalEmployeeAuditLog,
  createDigitalEmployeeTrustEvent,
  findDigitalEmployeeTrustContextById,
  findDigitalEmployeeTrustEventsById,
  updateDigitalEmployeeAutonomyLevelById,
} from "./repository"

export interface ServiceError {
  status: number
  error: string
}

export interface DigitalEmployeeTrustSummary {
  trustScore: number
  currentLevel: string
  levels: typeof AUTONOMY_LEVELS
  promotionSuggestion: string | null
  demotionSuggestion: string | null
  recentEvents: Array<{
    id: string
    eventType: string
    weight: number
    metadata: Prisma.JsonValue | null
    createdAt: Date
  }>
}

function toRecentEvent(event: {
  id: string
  eventType: string
  weight: number
  metadata: Prisma.JsonValue | null
  createdAt: Date
}) {
  return {
    id: event.id,
    eventType: event.eventType,
    weight: event.weight,
    metadata: event.metadata,
    createdAt: event.createdAt,
  }
}

/**
 * Builds a trust summary from recent events and the employee's current autonomy level.
 */
export async function getDigitalEmployeeTrustSummary(params: {
  digitalEmployeeId: string
  organizationId: string | null
}): Promise<DigitalEmployeeTrustSummary | ServiceError> {
  const employee = await findDigitalEmployeeTrustContextById({
    digitalEmployeeId: params.digitalEmployeeId,
    organizationId: params.organizationId,
  })

  if (!employee) {
    return { status: 404, error: "Not found" }
  }

  const events = await findDigitalEmployeeTrustEventsById(params.digitalEmployeeId)
  const trustScore = computeTrustScore(events)
  const currentLevel = mapLegacyAutonomy(employee.autonomyLevel)

  return {
    trustScore,
    currentLevel,
    levels: AUTONOMY_LEVELS,
    promotionSuggestion: suggestPromotion(currentLevel, trustScore),
    demotionSuggestion: shouldDemote(currentLevel, trustScore),
    recentEvents: events.slice(0, 20).map(toRecentEvent),
  }
}

/**
 * Promotes a digital employee to the next autonomy level and records the trust event.
 */
export async function promoteDigitalEmployeeTrustLevel(params: {
  digitalEmployeeId: string
  organizationId: string | null
  actorUserId: string
}): Promise<{ level: string; label: string } | ServiceError> {
  const employee = await findDigitalEmployeeTrustContextById({
    digitalEmployeeId: params.digitalEmployeeId,
    organizationId: params.organizationId,
  })

  if (!employee) {
    return { status: 404, error: "Not found" }
  }

  const currentLevel = mapLegacyAutonomy(employee.autonomyLevel)
  const currentIdx = AUTONOMY_LEVELS.findIndex((level) => level.code === currentLevel)
  if (currentIdx >= AUTONOMY_LEVELS.length - 1) {
    return { status: 400, error: "Already at maximum level" }
  }

  const newLevel = AUTONOMY_LEVELS[currentIdx + 1]

  await updateDigitalEmployeeAutonomyLevelById(params.digitalEmployeeId, newLevel.code)
  await createDigitalEmployeeTrustEvent({
    digitalEmployeeId: params.digitalEmployeeId,
    eventType: "promotion",
    weight: 1,
    metadata: {
      from: currentLevel,
      to: newLevel.code,
      by: params.actorUserId,
    },
  })

  void createDigitalEmployeeAuditLog({
    organizationId: employee.organizationId,
    employeeId: params.digitalEmployeeId,
    userId: params.actorUserId,
    action: AUDIT_ACTIONS.EMPLOYEE_PROMOTE,
    resource: `employee:${params.digitalEmployeeId}`,
    detail: {
      fromLevel: currentLevel,
      toLevel: newLevel.code,
    },
    riskLevel: classifyActionRisk(AUDIT_ACTIONS.EMPLOYEE_PROMOTE),
  }).catch(() => {})

  return { level: newLevel.code, label: newLevel.label }
}

/**
 * Demotes a digital employee to the previous autonomy level and records the trust event.
 */
export async function demoteDigitalEmployeeTrustLevel(params: {
  digitalEmployeeId: string
  organizationId: string | null
  actorUserId: string
}): Promise<{ level: string; label: string } | ServiceError> {
  const employee = await findDigitalEmployeeTrustContextById({
    digitalEmployeeId: params.digitalEmployeeId,
    organizationId: params.organizationId,
  })

  if (!employee) {
    return { status: 404, error: "Not found" }
  }

  const currentLevel = mapLegacyAutonomy(employee.autonomyLevel)
  const currentIdx = AUTONOMY_LEVELS.findIndex((level) => level.code === currentLevel)
  if (currentIdx <= 0) {
    return { status: 400, error: "Already at minimum level" }
  }

  const newLevel = AUTONOMY_LEVELS[currentIdx - 1]

  await updateDigitalEmployeeAutonomyLevelById(params.digitalEmployeeId, newLevel.code)
  await createDigitalEmployeeTrustEvent({
    digitalEmployeeId: params.digitalEmployeeId,
    eventType: "demotion",
    weight: 1,
    metadata: {
      from: currentLevel,
      to: newLevel.code,
      by: params.actorUserId,
    },
  })

  void createDigitalEmployeeAuditLog({
    organizationId: employee.organizationId,
    employeeId: params.digitalEmployeeId,
    userId: params.actorUserId,
    action: AUDIT_ACTIONS.EMPLOYEE_DEMOTE,
    resource: `employee:${params.digitalEmployeeId}`,
    detail: {
      fromLevel: currentLevel,
      toLevel: newLevel.code,
    },
    riskLevel: classifyActionRisk(AUDIT_ACTIONS.EMPLOYEE_DEMOTE),
  }).catch(() => {})

  return { level: newLevel.code, label: newLevel.label }
}
