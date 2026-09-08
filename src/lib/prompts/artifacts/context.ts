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
): string {
  if (mode === "summary") {
    const lines = Object.entries(ARTIFACT_TYPE_SUMMARIES)
      .map(([key, summary]) => `- \`${key}\` — ${summary}`)
      .join("\n")
    return `Choose the right artifact type:\n${lines}`
  }
  if (!type) return ""
  const parts: string[] = [DELIVERY_CONTRACT]
  const rules = ARTIFACT_TYPE_INSTRUCTIONS[type]
  if (rules) parts.push(rules)
  // Design tokens (palette, typography, spacing) only matter for visual
  // artifact types — injecting them into Python/code/markdown/sheet/latex
  // wastes tokens and confuses the LLM about what it's generating.
  if (VISUAL_ARTIFACT_TYPES.has(type)) {
    const designTokens = getDesignSystemContext(type)
    if (designTokens) parts.push(designTokens)
  }
  const examples = getExamples(type, 2)
  if (examples) parts.push(examples)
  return parts.join("\n\n---\n\n")
}

/**
 * Prepended to every full-mode artifact spec. The per-type rules below talk
 * about "the content" in strict terms ("raw JSON, no fences, nothing else")
 * and weaker models used to obey that in their *reply* — dumping a deck as a
 * ```json block and never calling the tool. Say up front who the rules are
 * for.
 */
export const DELIVERY_CONTRACT = `## Delivery Contract — read first

Everything below describes the **\`content\` argument of the \`create_artifact\` tool** (or \`update_artifact\`). It is NOT a description of your chat reply.

- Deliver the artifact by CALLING \`create_artifact\` with \`type\`, \`title\` and the full \`content\`. That single tool call is the deliverable.
- Your chat reply is a short human note (one to three sentences: what you made, anything the user should know). It must NEVER contain the artifact source — no JSON object, no HTML/JSX/SVG, no code fence holding the artifact.
- "Raw JSON only", "no markdown fences", "nothing else" in the rules below apply to the \`content\` string you pass to the tool, not to what you say to the user.
- If you notice yourself writing the artifact body into the reply, stop and move it into a \`create_artifact\` call instead.`

const VISUAL_ARTIFACT_TYPES = new Set([
  "text/html",
  "application/react",
  "image/svg+xml",
  "application/slides",
  "application/3d",
])
