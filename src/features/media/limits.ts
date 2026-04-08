import { prisma } from "@/lib/prisma"

const ONE_DAY_MS = 24 * 60 * 60 * 1000

export type EnforceLimitResult =
  | { allowed: true }
  | {
      allowed: false
      limitCents: number
      usedCents: number
      requestedCents: number
      reason: "over_limit" | "user_not_found"
    }

export interface EnforceLimitInput {
  userId: string
  estimatedCostCents: number
}

/**
 * Returns total media cost (in cents) consumed by a user in the last 24h.
 * Counts SUCCEEDED jobs by their finalized costCents, and RUNNING jobs by
 * their estimatedCostCents (since costCents is NULL until finalization).
 */
export async function getUsageTodayCents(userId: string): Promise<number> {
  const since = new Date(Date.now() - ONE_DAY_MS)
  const [succeeded, running] = await Promise.all([
    prisma.mediaJob.aggregate({
      where: {
        userId,
        createdAt: { gte: since },
        status: "SUCCEEDED",
      },
      _sum: { costCents: true },
    }),
    prisma.mediaJob.aggregate({
      where: {
        userId,
        createdAt: { gte: since },
        status: "RUNNING",
      },
      _sum: { estimatedCostCents: true },
    }),
  ])
  return (succeeded._sum.costCents ?? 0) + (running._sum.estimatedCostCents ?? 0)
}

export async function enforceMediaLimit(
  input: EnforceLimitInput
): Promise<EnforceLimitResult> {
  const { userId, estimatedCostCents } = input

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { mediaLimitCentsPerDay: true },
  })

  if (!user) {
    return {
      allowed: false,
      limitCents: 0,
      usedCents: 0,
      requestedCents: estimatedCostCents,
      reason: "user_not_found",
    }
  }

  if (user.mediaLimitCentsPerDay == null) {
    return { allowed: true }
  }

  const usedCents = await getUsageTodayCents(userId)
  if (usedCents + estimatedCostCents > user.mediaLimitCentsPerDay) {
    return {
      allowed: false,
      limitCents: user.mediaLimitCentsPerDay,
      usedCents,
      requestedCents: estimatedCostCents,
      reason: "over_limit",
    }
  }

  return { allowed: true }
}
