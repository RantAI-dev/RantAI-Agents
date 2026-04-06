export function computeGoalProgress(goal: {
  type: string
  currentValue: number
  target: number
}): { progress: number; status: "on_track" | "behind" | "completed" | "exceeded" } {
  const progress = goal.target > 0 ? (goal.currentValue / goal.target) * 100 : 0

  if (goal.type === "boolean") {
    return {
      progress: goal.currentValue >= 1 ? 100 : 0,
      status: goal.currentValue >= 1 ? "completed" : "behind",
    }
  }

  if (progress >= 100) return { progress: Math.min(progress, 150), status: progress > 100 ? "exceeded" : "completed" }
  if (progress >= 60) return { progress, status: "on_track" }
  return { progress, status: "behind" }
}

export function resetGoalsForNewPeriod(
  goals: Array<{ id: string; period: string; currentValue: number; updatedAt: Date }>
): string[] {
  const now = new Date()
  const resetIds: string[] = []

  for (const goal of goals) {
    if (goal.period === "total") continue

    const updated = new Date(goal.updatedAt)
    let shouldReset = false

    if (goal.period === "daily") {
      shouldReset = updated.toDateString() !== now.toDateString()
    } else if (goal.period === "weekly") {
      const weekStart = new Date(now)
      weekStart.setDate(now.getDate() - now.getDay())
      weekStart.setHours(0, 0, 0, 0)
      shouldReset = updated < weekStart
    } else if (goal.period === "monthly") {
      shouldReset = updated.getMonth() !== now.getMonth() || updated.getFullYear() !== now.getFullYear()
    }

    if (shouldReset && goal.currentValue > 0) {
      resetIds.push(goal.id)
    }
  }

  return resetIds
}

export const GOAL_TYPES = [
  { value: "counter", label: "Counter", description: "Track cumulative count (e.g. tickets resolved)" },
  { value: "threshold", label: "Threshold", description: "Reach a numeric target (e.g. response time < 5min)" },
  { value: "boolean", label: "Boolean", description: "Complete/not complete (e.g. daily report sent)" },
  { value: "percentage", label: "Percentage", description: "Track a rate (e.g. 95% accuracy)" },
] as const

export const GOAL_PERIODS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "total", label: "All time" },
] as const

// ── Goal-Based Triggering ──

export type GoalAction = "none" | "alert" | "increase_frequency" | "auto_schedule"

export function getGoalTriggeredAction(goal: {
  type: string
  currentValue: number
  target: number
  period: string
  status: string
}): { action: GoalAction; reason: string } {
  const { progress, status } = computeGoalProgress(goal)

  // Already completed or exceeded — no action needed
  if (status === "completed" || status === "exceeded") {
    return { action: "none", reason: "Goal met" }
  }

  // Behind with less than 25% of period remaining — alert supervisor
  if (status === "behind" && progress < 40) {
    return { action: "alert", reason: `Only ${Math.round(progress)}% progress — may miss target` }
  }

  // Behind but recoverable — increase run frequency
  if (status === "behind" && progress < 60) {
    return { action: "increase_frequency", reason: `Behind at ${Math.round(progress)}% — more runs may help` }
  }

  // On track but close to deadline with low progress — schedule extra run
  if (status === "on_track" && progress < 75) {
    return { action: "auto_schedule", reason: `On track at ${Math.round(progress)}% — scheduling run to stay ahead` }
  }

  return { action: "none", reason: "On track" }
}

// ── Performance Summary ──

export function computeGoalPerformanceSummary(goals: Array<{
  name: string
  type: string
  currentValue: number
  target: number
  period: string
  status: string
}>): {
  totalGoals: number
  completed: number
  onTrack: number
  behind: number
  completionRate: number
} {
  const total = goals.length
  let completed = 0
  let onTrack = 0
  let behind = 0

  for (const goal of goals) {
    const { status } = computeGoalProgress(goal)
    if (status === "completed" || status === "exceeded") completed++
    else if (status === "on_track") onTrack++
    else behind++
  }

  return {
    totalGoals: total,
    completed,
    onTrack,
    behind,
    completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
  }
}
