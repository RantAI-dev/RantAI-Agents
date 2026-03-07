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
