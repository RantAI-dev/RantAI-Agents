export type AutonomyLevelCode = "L1" | "L2" | "L3" | "L4"

export interface AutonomyLevelDef {
  code: AutonomyLevelCode
  label: string
  description: string
  minTrustScore: number
  autoApproveRisk: string[] // risk levels that auto-approve at this level
}

export const AUTONOMY_LEVELS: AutonomyLevelDef[] = [
  {
    code: "L1",
    label: "Observer",
    description: "All actions require approval. Employee observes and learns.",
    minTrustScore: 0,
    autoApproveRisk: [],
  },
  {
    code: "L2",
    label: "Assistant",
    description: "Low-risk actions auto-approved. Medium/high-risk requires approval.",
    minTrustScore: 30,
    autoApproveRisk: ["low"],
  },
  {
    code: "L3",
    label: "Collaborator",
    description: "Low and medium-risk actions auto-approved. High-risk requires approval.",
    minTrustScore: 60,
    autoApproveRisk: ["low", "medium"],
  },
  {
    code: "L4",
    label: "Autonomous",
    description: "All actions auto-approved. Only critical exceptions escalated.",
    minTrustScore: 85,
    autoApproveRisk: ["low", "medium", "high"],
  },
]

export const TOOL_RISK_CLASSIFICATIONS: Record<string, string> = {
  // Low risk - read-only / informational
  knowledge_search: "low",
  search_memory: "low",
  list_my_skills: "low",
  list_my_tools: "low",
  web_search: "low",
  calculator: "low",
  date_time: "low",

  // Medium risk - state-changing but reversible
  update_memory: "medium",
  write_note: "medium",
  create_artifact: "medium",
  update_artifact: "medium",
  text_utilities: "medium",
  json_transform: "medium",
  install_skill: "medium",
  search_skills: "medium",
  update_goal: "medium",

  // High risk - external actions or irreversible
  channel_dispatch: "high",
  file_operations: "high",
  document_analysis: "high",
  customer_lookup: "high",
  create_tool: "high",
  request_credentials: "high",
  test_integration: "high",
}

export function getToolRiskLevel(toolName: string): string {
  return TOOL_RISK_CLASSIFICATIONS[toolName] || "medium"
}

export function shouldAutoApprove(autonomyLevel: string, toolRisk: string): boolean {
  const level = AUTONOMY_LEVELS.find((l) => l.code === autonomyLevel)
  if (!level) return false
  return level.autoApproveRisk.includes(toolRisk)
}

export function getAutonomyLevel(code: string): AutonomyLevelDef | undefined {
  return AUTONOMY_LEVELS.find((l) => l.code === code)
}

export interface TrustEventWeights {
  approval_accepted: number
  approval_rejected: number
  run_success: number
  run_failure: number
  promotion: number
  demotion: number
}

const EVENT_WEIGHTS: TrustEventWeights = {
  approval_accepted: 2,
  approval_rejected: -3,
  run_success: 1,
  run_failure: -2,
  promotion: 5,
  demotion: -10,
}

export function computeTrustScore(
  events: Array<{ eventType: string; weight: number; createdAt: Date }>
): number {
  const BASE_SCORE = 50
  const now = Date.now()

  let adjustedScore = BASE_SCORE
  for (const event of events) {
    const baseWeight = EVENT_WEIGHTS[event.eventType as keyof TrustEventWeights] || 0
    const eventWeight = event.weight * baseWeight

    // Time decay: events lose 50% weight after 30 days
    const ageMs = now - new Date(event.createdAt).getTime()
    const ageDays = ageMs / (1000 * 60 * 60 * 24)
    const decay = Math.exp(-0.023 * ageDays) // half-life ~30 days

    adjustedScore += eventWeight * decay
  }

  return Math.max(0, Math.min(100, Math.round(adjustedScore * 10) / 10))
}

export function suggestPromotion(currentLevel: string, trustScore: number): AutonomyLevelCode | null {
  const currentIdx = AUTONOMY_LEVELS.findIndex((l) => l.code === currentLevel)
  if (currentIdx < 0 || currentIdx >= AUTONOMY_LEVELS.length - 1) return null

  const nextLevel = AUTONOMY_LEVELS[currentIdx + 1]
  if (trustScore >= nextLevel.minTrustScore) return nextLevel.code
  return null
}

export function shouldDemote(currentLevel: string, trustScore: number): AutonomyLevelCode | null {
  const currentIdx = AUTONOMY_LEVELS.findIndex((l) => l.code === currentLevel)
  if (currentIdx <= 0) return null

  const currentLevelDef = AUTONOMY_LEVELS[currentIdx]
  if (trustScore < currentLevelDef.minTrustScore - 10) {
    return AUTONOMY_LEVELS[currentIdx - 1].code
  }
  return null
}

// Backward compat: map old values to L codes
export function mapLegacyAutonomy(level: string): AutonomyLevelCode {
  if (level === "supervised") return "L1"
  if (level === "autonomous") return "L4"
  if (AUTONOMY_LEVELS.some((l) => l.code === level)) return level as AutonomyLevelCode
  return "L1"
}

// Map L codes back to legacy values for API compat
export function mapToLegacyAutonomy(level: AutonomyLevelCode): string {
  return level // just store L1-L4 directly now
}
