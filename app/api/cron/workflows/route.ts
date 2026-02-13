import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { workflowEngine } from "@/lib/workflow"

/**
 * GET /api/cron/workflows — Scheduled workflow execution handler.
 *
 * Called by an external cron service (e.g. Vercel Cron, crontab) every minute.
 * Iterates all active workflows with schedule triggers, checks if they're
 * due to run, and executes them.
 *
 * Security: Protected by CRON_SECRET header to prevent unauthorized invocation.
 */
export async function GET(req: Request) {
  try {
    // Verify cron secret (skip check if not configured — dev mode)
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret) {
      const authHeader = req.headers.get("authorization")
      if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
    }

    // Find all active workflows with schedule triggers
    const workflows = await prisma.workflow.findMany({
      where: { status: "ACTIVE" },
    })

    const scheduledWorkflows = workflows.filter((w) => {
      const trigger = w.trigger as { type?: string; schedule?: string }
      return trigger?.type === "schedule" && trigger?.schedule
    })

    if (scheduledWorkflows.length === 0) {
      return NextResponse.json({ executed: 0, message: "No scheduled workflows" })
    }

    const now = new Date()
    const results: Array<{ workflowId: string; name: string; runId?: string; error?: string }> = []

    for (const workflow of scheduledWorkflows) {
      const trigger = workflow.trigger as { schedule: string }

      if (!matchesCron(trigger.schedule, now)) {
        continue
      }

      try {
        const runId = await workflowEngine.execute(workflow.id, {
          _trigger: "schedule",
          _schedule: trigger.schedule,
          _triggeredAt: now.toISOString(),
        })
        results.push({ workflowId: workflow.id, name: workflow.name, runId })
      } catch (error) {
        results.push({
          workflowId: workflow.id,
          name: workflow.name,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    return NextResponse.json({
      executed: results.length,
      results,
      checkedAt: now.toISOString(),
    })
  } catch (error) {
    console.error("[Cron] Workflow execution error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Cron execution failed" },
      { status: 500 }
    )
  }
}

/**
 * Simple cron expression matcher.
 * Supports: * (any), numbers, comma-separated values, ranges (1-5), step values (*\/5).
 * Format: minute hour dayOfMonth month dayOfWeek
 */
function matchesCron(expression: string, date: Date): boolean {
  const parts = expression.trim().split(/\s+/)
  if (parts.length !== 5) return false

  const fields = [
    date.getMinutes(),    // 0-59
    date.getHours(),      // 0-23
    date.getDate(),       // 1-31
    date.getMonth() + 1,  // 1-12
    date.getDay(),        // 0-6 (Sunday=0)
  ]

  return parts.every((part, i) => matchesCronField(part, fields[i]))
}

function matchesCronField(field: string, value: number): boolean {
  // Wildcard
  if (field === "*") return true

  // Step values: */5
  if (field.startsWith("*/")) {
    const step = parseInt(field.slice(2), 10)
    return !isNaN(step) && step > 0 && value % step === 0
  }

  // Comma-separated: 1,5,10
  if (field.includes(",")) {
    return field.split(",").some((part) => matchesCronField(part.trim(), value))
  }

  // Range: 1-5
  if (field.includes("-")) {
    const [min, max] = field.split("-").map(Number)
    return !isNaN(min) && !isNaN(max) && value >= min && value <= max
  }

  // Exact match
  return parseInt(field, 10) === value
}
