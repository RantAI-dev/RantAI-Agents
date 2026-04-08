/**
 * Shared behavioral instructions appended to system prompts.
 * Single source of truth — used by chat/route.ts, widget/chat/route.ts, and chatflow.ts.
 */

import { CANVAS_TYPE_LABELS } from "./artifacts"
import { assembleArtifactContext } from "./artifacts/context"

export { CANVAS_TYPE_LABELS } from "./artifacts"

/** Language consistency — appended to ALL chat prompts */
export const LANGUAGE_INSTRUCTION = `\n\nIMPORTANT: You must ALWAYS reply in the same language as the user's last message. If they speak Indonesian, reply in Indonesian. If they speak English, reply in English. Do not mix languages unless necessary for technical terms.`

/** Correction rule WITH saveMemory tool — for routes that have the saveMemory tool */
export const CORRECTION_INSTRUCTION_WITH_TOOL = `\n\nWhen the user corrects or updates previously shared information (e.g. name, age, preference), you MUST call saveMemory with the new value so the stored profile is updated. Do not only acknowledge verbally—always call the tool with the updated fact or preference.`

/** Correction rule WITHOUT tool — for chatflow (no saveMemory tool available) */
export const CORRECTION_INSTRUCTION_SOFT = `\n\nWhen the user corrects or updates previously shared information (e.g. name, age, preference), acknowledge the change in your response.`

/** Live chat handoff instruction — appended when assistant.liveChatEnabled */
export const LIVE_CHAT_HANDOFF_INSTRUCTION = `\n\nLIVE CHAT HANDOFF: You have the ability to transfer the conversation to a human agent. When the user explicitly asks to speak with a human, a real person, an agent, or customer support — OR when you cannot help them further and a human would be more appropriate — include the exact marker [AGENT_HANDOFF] at the end of your response. Only use this marker when handoff is genuinely needed. Do NOT use it for normal questions you can answer yourself.`

const DESIGN_QUALITY_REMINDER = `All visual artifacts must be production-quality. Follow the type-specific design rules above. NEVER output plain, unstyled content.`

/** Tool usage instruction — appended when assistant has tools resolved */
export function buildToolInstruction(
  toolNames: string[],
  options?: { targetArtifactId?: string; canvasMode?: boolean | string },
): string {
  const { targetArtifactId, canvasMode } = options || {}

  let instruction = `\n\n## Available Tools\nYou have these tools: ${toolNames.join(", ")}.\nIMPORTANT: When users ask questions that require external information, current events, calculations, or data processing, you MUST use the appropriate tool. Do NOT fabricate URLs, links, citations, or sources — always use a tool to get real information. If you have a web_search tool, use it for any factual claim that needs a source.`

  if (toolNames.includes("create_artifact")) {
    if (canvasMode === true || canvasMode === "auto") {
      // Auto mode: inject summary of all types
      instruction += `\n\n## Canvas Mode (ACTIVE)\nThe user has enabled Canvas mode. You MUST use the create_artifact tool for your response content. Render your output as a live artifact in the preview panel instead of inline text. ${assembleArtifactContext(null, "summary")}\n\n${DESIGN_QUALITY_REMINDER}`
    } else if (
      typeof canvasMode === "string" &&
      canvasMode in CANVAS_TYPE_LABELS
    ) {
      // Specific type: inject ONLY the relevant type's full instructions
      const label = CANVAS_TYPE_LABELS[canvasMode]
      instruction += `\n\n## Canvas Mode (ACTIVE — ${label})\nThe user has enabled Canvas mode with a specific artifact type. You MUST use the create_artifact tool with type="${canvasMode}". The user wants a ${label} artifact. Render your output as a live artifact in the preview panel instead of inline text.\n\n${assembleArtifactContext(canvasMode, "full")}\n\n${DESIGN_QUALITY_REMINDER}`
    } else {
      // No canvas mode: inject summary with usage guidance
      instruction += `\n\n## Artifacts\nWhen creating substantial content (more than 15 lines of code, full HTML pages, React components, SVG graphics, diagrams, or long documents), use the create_artifact tool to render it in a live preview panel. Keep short code snippets, brief explanations, and simple answers inline in your response. ${assembleArtifactContext(null, "summary")}\n\n${DESIGN_QUALITY_REMINDER}`
    }

    if (toolNames.includes("update_artifact")) {
      instruction += `\n\nWhen the user asks to modify, fix, or change an existing artifact, use update_artifact with the artifact's ID (from the create_artifact result) instead of creating a new one. Always provide the full updated content, not just the diff.`

      if (targetArtifactId) {
        if (
          typeof canvasMode === "string" &&
          canvasMode in CANVAS_TYPE_LABELS
        ) {
          // Canvas mode requests a specific type — don't suggest updating the old artifact
          instruction += `\n\nThe user was viewing a different artifact ("${targetArtifactId}"), but they have now requested a new ${CANVAS_TYPE_LABELS[canvasMode]} artifact. Use create_artifact with type="${canvasMode}" to create a NEW artifact. Do NOT update the previous artifact.`
        } else {
          instruction += `\n\nThe user is currently viewing artifact "${targetArtifactId}". When they ask for changes, modifications, or updates to "the artifact", "this", or the current content, use update_artifact with id="${targetArtifactId}".`
        }
      }
    }
  }

  return instruction
}
