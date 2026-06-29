import {
  ALL_ARTIFACTS,
  ARTIFACT_TYPE_INSTRUCTIONS,
  ARTIFACT_TYPE_SUMMARIES,
} from "./index"
import { getDesignSystemContext } from "../design-system"

function getExamples(type: string, count = 1): string {
  const artifact = ALL_ARTIFACTS.find((a) => a.type === type)
  if (!artifact?.examples?.length) return ""
  const selected = artifact.examples.slice(0, count)
  const formatted = selected
    .map(
      (ex, i) =>
        `### Example ${i + 1} — ${ex.label}\n\`\`\`\n${ex.code}\n\`\`\``,
    )
    .join("\n\n")
  return `## Few-Shot Examples\n${formatted}`
}

export function assembleArtifactContext(
  type: string | null,
  mode: "summary" | "full",
  designSystemId?: string,
): string {
  if (mode === "summary") {
    const lines = Object.entries(ARTIFACT_TYPE_SUMMARIES)
      .map(([key, summary]) => `- \`${key}\` — ${summary}`)
      .join("\n")
    return `Choose the right artifact type:\n${lines}`
  }
  if (!type) return ""
  const parts: string[] = []
  const rules = ARTIFACT_TYPE_INSTRUCTIONS[type]
  if (rules) parts.push(rules)
  const examples = getExamples(type, 2)
  if (examples) parts.push(examples)
  // Design system goes LAST so its authoritative palette/typography is the most
  // recent guidance the model sees, overriding any off-brand colors shown in the
  // per-type rules or few-shot examples above. getDesignSystemContext returns ""
  // for types it doesn't steer (only HTML/React today), so this is a no-op there.
  if (VISUAL_ARTIFACT_TYPES.has(type)) {
    const designTokens = getDesignSystemContext(type, designSystemId)
    if (designTokens) parts.push(designTokens)
  }
  return parts.join("\n\n---\n\n")
}

const VISUAL_ARTIFACT_TYPES = new Set([
  "text/html",
  "application/react",
  "image/svg+xml",
  "application/slides",
  "application/3d",
])
