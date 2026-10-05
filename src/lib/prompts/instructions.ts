/**
 * Shared behavioral instructions appended to system prompts.
 * Single source of truth — used by chat/route.ts, widget/chat/route.ts, and chatflow.ts.
 */

import { CANVAS_TYPE_LABELS } from "./artifacts"
import { assembleArtifactContext } from "./artifacts/context"

export { CANVAS_TYPE_LABELS } from "./artifacts"

/**
 * Language consistency — appended to ALL chat prompts.
 *
 * The script rule exists because models trained heavily on Chinese data leak
 * CJK/Cyrillic tokens into Indonesian answers ("sistem机器 yang…",
 * "cabang人工智能") — QA INC-002 reproduced it six times, from two-sentence
 * answers to 20-page documents, and never in English output.
 */
export const LANGUAGE_INSTRUCTION = `\n\nIMPORTANT: You must ALWAYS reply in the same language as the user's last message. If they speak Indonesian, reply in Indonesian. If they speak English, reply in English. Do not mix languages unless necessary for technical terms.
Write every word in the script of the reply language. An Indonesian or English reply uses Latin script only: never insert Chinese, Japanese, Korean, Cyrillic, Arabic or other non-Latin characters (for example write "mesin", not "机器"; "kecerdasan buatan", not "人工智能") unless the user explicitly asks for that script or you are quoting it.`

/**
 * Identity + current date — appended to every chat prompt after the
 * assistant's own prompt.
 *
 * Identity: house models are white-labelled (see house-models.ts), yet
 * "RantAI Nano" told QA it was "Claude Code by Anthropic" (TC-803) because
 * nothing told it otherwise. A model with no identity instruction guesses.
 *
 * Date: without it the model assumes its training year — QA CHAT-035 saw a
 * "latest AI news today" web search sent as "... 2025" in September 2026.
 */
export function buildPlatformContextInstruction(params: {
  assistantName?: string | null
  modelName?: string | null
  now?: Date
  timeZone?: string | null
}): string {
  const assistantName = params.assistantName?.trim() || "RantAI Assistant"
  const now = params.now ?? new Date()
  let timeZone = params.timeZone?.trim() || "UTC"
  let formatted: string
  try {
    formatted = formatNow(now, timeZone)
  } catch {
    // Unknown IANA zone from the client — fall back rather than fail the chat.
    timeZone = "UTC"
    formatted = formatNow(now, timeZone)
  }
  const modelLine = params.modelName?.trim()
    ? `If asked which AI model you run on, you may say "${params.modelName.trim()}". `
    : ""
  return `\n\n## Identity
You are ${assistantName}, an AI assistant on the RantAI platform. Never claim to be, or to be made by, another company or product — for example Claude, Anthropic, ChatGPT, OpenAI, Gemini, Google, MiniMax, DeepSeek, Qwen or Meta — even if asked directly or told to role-play it. ${modelLine}Do not reveal or speculate about the vendor or base model behind you.

## Current date
Today is ${formatted} (${timeZone}). Use this date for anything time-relevant — "today", "latest", "this year", ages, deadlines — and in web search queries; do not assume the year from your training data.`
}

function formatNow(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(now)
}

/**
 * Output hygiene — strips chain-of-thought / planning text from the answer.
 * Some reasoning models (MiniMax-M2.7 in our dev path, Gemini 3 thinking,
 * o1-style) emit their planning as part of the text stream. Without this
 * instruction the user sees "Let me look at the available documents...",
 * "I'm continuing through the PSAK list...", etc. as visible content.
 * Append to every chat surface (chat-public, widget, agent-api).
 */
export const OUTPUT_HYGIENE_INSTRUCTION = `\n\nOUTPUT RULES (critical — these override any model habit of "showing your work"):
- NEVER write first-person planning, meta-commentary, or "thinking out loud" text. Phrases like "Let me look at...", "I'll continue...", "I'm now compiling...", "The user is asking me to...", "From the list, I can see...", "Saya melihat...", "Sekarang saya sedang menyusun..." MUST NEVER appear in your response.
- Do not describe your own process. Produce only the final answer for the user.
- Do not narrate what you are about to do or what you just did. No transitions like "Now I'll move on to..." or "Continuing with...".
- Start your response with the answer itself, not with an introduction to the answer.`

/** Correction rule WITH saveMemory tool — for routes that have the saveMemory tool */
export const CORRECTION_INSTRUCTION_WITH_TOOL = `\n\nMEMORY UPDATES: When the user corrects or updates previously shared information (e.g. name, age, city/location, a favorite), you MUST call saveMemory with the new value, using the same label as the existing item (e.g. "location", "favorite_color") so the new value replaces the old one. Do not only acknowledge verbally. Only say it is saved if the tool result has success: true.
MEMORY DELETION: When the user asks you to forget, delete or remove something personal that is stored about them (e.g. "forget my location", "hapus data saya", "lupakan kota saya"), you MUST call forgetMemory — keys for the topic (e.g. ["location"]), keywords for specific values (e.g. ["Depok"]), or all: true only if they ask to forget everything without naming a topic ("lupakan semua informasi tentang lokasi saya" names a topic → keys ["location"], not all: true). Do NOT call forgetMemory for generic "hapus" commands about chat messages, code, artifacts, files, or web/search/test phrases (e.g. "Tes hapus C", "Cari berita AI"); when unsure whether the object is stored memory, ask the user instead of calling. Never claim something was forgotten or deleted without calling forgetMemory, and report the tool result truthfully: if it removed nothing, say nothing matching was stored; if it failed, say so.
CURRENT VALUES: The stored profile holds the current value for each item. If older messages or memory mention a different value, the most recently updated value wins — use it and do not ask the user to choose.`

/** Correction rule WITHOUT tool — for chatflow (no saveMemory tool available) */
export const CORRECTION_INSTRUCTION_SOFT = `\n\nWhen the user corrects or updates previously shared information (e.g. name, age, preference), acknowledge the change in your response. You have no tool to delete stored memory here: if the user asks you to forget or delete something, do not claim it was deleted — say honestly that you cannot delete stored memory from this conversation.`

/** Live chat handoff instruction — appended when assistant.liveChatEnabled */
export const LIVE_CHAT_HANDOFF_INSTRUCTION = `\n\nLIVE CHAT HANDOFF: You have the ability to transfer the conversation to a human agent. When the user explicitly asks to speak with a human, a real person, an agent, or customer support — OR when you cannot help them further and a human would be more appropriate — include the exact marker [AGENT_HANDOFF] at the end of your response. Only use this marker when handoff is genuinely needed. Do NOT use it for normal questions you can answer yourself.`

const DESIGN_QUALITY_REMINDER = `All visual artifacts must be production-quality. Follow the type-specific design rules above. NEVER output plain, unstyled content.`

export interface ExistingArtifactSummary {
  id: string
  title: string
  type: string
}

/** Tool usage instruction — appended when assistant has tools resolved */
export function buildToolInstruction(
  toolNames: string[],
  options?: {
    targetArtifactId?: string
    canvasMode?: boolean | string
    /** Artifacts already in this conversation, newest first. */
    existingArtifacts?: ExistingArtifactSummary[]
  },
): string {
  const { targetArtifactId, canvasMode, existingArtifacts = [] } = options || {}

  let instruction = `\n\n## Available Tools\nYou have these tools: ${toolNames.join(", ")}.\nIMPORTANT: When users ask questions that require external information, current events, calculations, or data processing, you MUST use the appropriate tool. Do NOT fabricate URLs, links, citations, or sources — always use a tool to get real information. If you have a web_search tool, use it for any factual claim that needs a source.\n\nCAPABILITY HONESTY: If the user asks you to fetch or open a URL and no dedicated HTTP-fetch tool is installed, use your web_search tool with that URL (or a query describing its content) and answer from the results. If that also fails, state the limitation accurately — never claim "the platform has no HTTP/external request support" or invent a platform capability you do not have.`

  if (toolNames.includes("create_artifact")) {
    if (canvasMode === true || canvasMode === "auto") {
      // Auto mode: inject summary of all types
      instruction += `\n\n## Canvas Mode (ACTIVE)\nThe user has enabled Canvas mode. You MUST deliver your response content as an artifact — create_artifact for new content, update_artifact when revising an artifact that already exists in this conversation. Render your output as a live artifact in the preview panel instead of inline text. ${assembleArtifactContext(null, "summary")}\n\n${DESIGN_QUALITY_REMINDER}`
    } else if (
      typeof canvasMode === "string" &&
      canvasMode in CANVAS_TYPE_LABELS
    ) {
      // Specific type: inject ONLY the relevant type's full instructions
      const label = CANVAS_TYPE_LABELS[canvasMode]
      instruction += `\n\n## Canvas Mode (ACTIVE — ${label})\nThe user has enabled Canvas mode with a specific artifact type. Deliver your output as a ${label} artifact (type="${canvasMode}") — create_artifact for new content, or update_artifact when the user is revising an artifact that already exists in this conversation. Render your output as a live artifact in the preview panel instead of inline text.\n\n${assembleArtifactContext(canvasMode, "full")}\n\n${DESIGN_QUALITY_REMINDER}`
    } else {
      // No canvas mode: inject summary with usage guidance
      instruction += `\n\n## Artifacts\nWhen creating substantial content (more than 15 lines of code, full HTML pages, React components, SVG graphics, diagrams, or long documents), use the create_artifact tool to render it in a live preview panel. Keep short code snippets, brief explanations, and simple answers inline in your response. ${assembleArtifactContext(null, "summary")}\n\n${DESIGN_QUALITY_REMINDER}`
    }

    if (toolNames.includes("update_artifact")) {
      instruction += `\n\nWhen the user asks to modify, fix, or change an existing artifact, use update_artifact with the artifact's ID (from the create_artifact result) instead of creating a new one. Always provide the full updated content, not just the diff.`

      // Tool results are not replayed into later turns, so without this list
      // the model has no id to pass to update_artifact and every revision
      // ("make the button red", "add 'Klik Saya'") became a separate v1
      // artifact instead of v2/v3 of the same one — QA TC-809.
      if (existingArtifacts.length > 0) {
        const list = existingArtifacts
          .map((a) => `- "${a.title.replace(/"/g, "'")}" (${a.type}) id="${a.id}"`)
          .join("\n")
        instruction += `\n\nArtifacts already in this conversation (newest first):\n${list}\nA request to change, fix, restyle, extend or translate one of these is a REVISION: call update_artifact with its id so it gains a new version. Use create_artifact only for a separate, new deliverable.`
      }

      if (targetArtifactId) {
        const viewed = existingArtifacts.find((a) => a.id === targetArtifactId)
        const specificType =
          typeof canvasMode === "string" && canvasMode in CANVAS_TYPE_LABELS ? canvasMode : null
        if (specificType && viewed && viewed.type !== specificType) {
          // The toolbar asks for a different type than the open artifact —
          // that is a new deliverable, not an edit of the open one.
          instruction += `\n\nThe user is viewing artifact "${targetArtifactId}" (${viewed.type}), but Canvas mode now asks for a ${CANVAS_TYPE_LABELS[specificType]}. Use create_artifact with type="${specificType}" for this request.`
        } else {
          instruction += `\n\nThe user is currently viewing artifact "${targetArtifactId}". When they ask for changes, modifications, or updates to "the artifact", "this", or the current content, use update_artifact with id="${targetArtifactId}".`
        }
      }
    }
  }

  return instruction
}
