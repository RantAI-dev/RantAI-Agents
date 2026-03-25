import {
  findExpiredApprovals,
  findRunById,
  markApprovalExpired,
  markRunFailed,
} from "./repository"

export interface CronApprovalsResult {
  processed: number
  total: number
}

/**
 * Expires pending approvals and applies timeout behavior for paused runs.
 */
export async function processExpiredApprovals(now: Date = new Date()): Promise<CronApprovalsResult> {
  const expiredApprovals = await findExpiredApprovals(now)

  let processed = 0

  for (const approval of expiredApprovals) {
    await markApprovalExpired(approval.id, now)

    if (approval.timeoutAction === "approve") {
      const run = await findRunById(approval.employeeRunId)
      if (run && run.status === "PAUSED") {
        await markRunFailed(run.id, "Approval expired", now)
      }
    } else if (approval.timeoutAction === "reject") {
      const run = await findRunById(approval.employeeRunId)
      if (run && run.status === "PAUSED") {
        await markRunFailed(run.id, "Approval expired (rejected)", now)
      }
    }

    processed += 1
  }

  return { processed, total: expiredApprovals.length }
}
