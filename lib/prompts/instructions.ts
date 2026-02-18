/**
 * Shared behavioral instructions appended to system prompts.
 * Single source of truth — used by chat/route.ts, widget/chat/route.ts, and chatflow.ts.
 */

/** Language consistency — appended to ALL chat prompts */
export const LANGUAGE_INSTRUCTION = `\n\nIMPORTANT: You must ALWAYS reply in the same language as the user's last message. If they speak Indonesian, reply in Indonesian. If they speak English, reply in English. Do not mix languages unless necessary for technical terms.`

/** Correction rule WITH saveMemory tool — for routes that have the saveMemory tool */
export const CORRECTION_INSTRUCTION_WITH_TOOL = `\n\nWhen the user corrects or updates previously shared information (e.g. name, age, preference), you MUST call saveMemory with the new value so the stored profile is updated. Do not only acknowledge verbally—always call the tool with the updated fact or preference.`

/** Correction rule WITHOUT tool — for chatflow (no saveMemory tool available) */
export const CORRECTION_INSTRUCTION_SOFT = `\n\nWhen the user corrects or updates previously shared information (e.g. name, age, preference), acknowledge the change in your response.`

/** Live chat handoff instruction — appended when assistant.liveChatEnabled */
export const LIVE_CHAT_HANDOFF_INSTRUCTION = `\n\nLIVE CHAT HANDOFF: You have the ability to transfer the conversation to a human agent. When the user explicitly asks to speak with a human, a real person, an agent, or customer support — OR when you cannot help them further and a human would be more appropriate — include the exact marker [AGENT_HANDOFF] at the end of your response. Only use this marker when handoff is genuinely needed. Do NOT use it for normal questions you can answer yourself.`

/** Tool usage instruction — appended when assistant has tools resolved */
const CANVAS_TYPE_LABELS: Record<string, string> = {
  "text/html": "HTML Page",
  "application/react": "React Component",
  "image/svg+xml": "SVG Graphic",
  "application/mermaid": "Mermaid Diagram",
  "text/markdown": "Document",
  "application/code": "Code",
  "application/sheet": "Spreadsheet",
  "text/latex": "LaTeX / Math",
  "application/slides": "Slides",
  "application/python": "Python Script",
}

export function buildToolInstruction(toolNames: string[], options?: { targetArtifactId?: string; canvasMode?: boolean | string }): string {
  const { targetArtifactId, canvasMode } = options || {}

  let instruction = `\n\n## Available Tools\nYou have these tools: ${toolNames.join(", ")}.\nIMPORTANT: When users ask questions that require external information, current events, calculations, or data processing, you MUST use the appropriate tool. Do NOT fabricate URLs, links, citations, or sources — always use a tool to get real information. If you have a web_search tool, use it for any factual claim that needs a source.`

  if (toolNames.includes("create_artifact")) {
    const artifactTypes = `Choose the right type:\n- text/html: Interactive HTML pages, landing pages, forms, dashboards, games. Tailwind CSS is automatically available via CDN — use Tailwind utility classes for ALL styling (do NOT write verbose custom CSS). You can use <script> tags for full interactivity. Google Fonts Inter is pre-loaded. Write complete, self-contained HTML documents. DESIGN: Use modern Tailwind styling — rounded-lg/xl, shadow-sm/md, proper spacing (p-4/6, gap-4), muted backgrounds (bg-gray-50, bg-slate-50), smooth transitions, hover effects, gradient hero sections. Never output plain unstyled HTML.\n- application/react: Interactive React components. Available imports: react (all hooks), recharts (charts/graphs), lucide-react (icons). Tailwind CSS is automatically available — use Tailwind utility classes for ALL styling. Components MUST have export default. Do NOT import CSS files or external packages beyond react, recharts, lucide-react. Write modern, polished UI with proper spacing, rounded corners, shadows, hover effects, and transitions. Use Inter font via font-sans class.\n- image/svg+xml: SVG graphics, icons, illustrations\n- application/mermaid: Flowcharts, sequence diagrams, entity diagrams (Mermaid syntax)\n- application/code: Code files that should be displayed with syntax highlighting\n- text/markdown: Long documents, reports, README files\n- application/sheet: Tabular data and CSV datasets. Output as CSV with a header row. Use for data tables, comparisons, or structured data.\n- text/latex: Mathematical documents, equations, proofs. Output raw LaTeX. Use for math formulas, equations, or formal mathematical content.\n- application/slides: Presentations and slide decks. Output a JSON object: {"theme":{"primaryColor":"#hex","secondaryColor":"#hex","fontFamily":"Inter, sans-serif"},"slides":[...]}. Each slide object has: layout ("title"|"content"|"two-column"|"section"|"quote"|"closing"), title, subtitle, bullets (string[]), content, leftColumn/rightColumn (string[]), quote, attribution, note. DESIGN RULES: Theme MUST use dark professional colors (navy #0F172A, charcoal #1E293B, deep slate #0C1222, dark teal #042F2E — NEVER bright/saturated like #4F46E5). secondaryColor is the accent (blue #3B82F6, cyan #06B6D4, emerald #10B981, amber #F59E0B). Title slide MUST have subtitle. Use 7-12 slides. First slide layout "title", last "closing". Use at least 3 different layouts. Max 6 bullets per slide, each bullet one concise insight (max 10 words). No filler text. NEVER use markdown syntax (**, ##, *, backticks, etc.) in slide text — all text must be plain text only, the JSON structure handles formatting.\n- application/python: Python scripts to execute in the browser. Output valid Python code. Runtime supports numpy, matplotlib, and standard library. Use for data analysis, plots, or computations.\n\nDESIGN QUALITY: ALL visual artifacts (HTML, React, SVG) must be polished and modern. Use Tailwind CSS. Apply: rounded corners (rounded-lg/xl/2xl), subtle shadows (shadow-sm/md/lg), generous spacing (p-6, gap-4/6), muted backgrounds (bg-gray-50/slate-50/white), smooth transitions (transition-all duration-200), hover effects (hover:shadow-md, hover:scale-105), and consistent color palettes. Use gradient backgrounds for hero sections (bg-gradient-to-br). Prefer cards with borders (border border-gray-200 rounded-xl p-6). NEVER output plain, unstyled content.`

    if (canvasMode === true || canvasMode === "auto") {
      instruction += `\n\n## Canvas Mode (ACTIVE)\nThe user has enabled Canvas mode. You MUST use the create_artifact tool for your response content. Render your output as a live artifact in the preview panel instead of inline text. ${artifactTypes}`
    } else if (typeof canvasMode === "string" && canvasMode in CANVAS_TYPE_LABELS) {
      const label = CANVAS_TYPE_LABELS[canvasMode]
      instruction += `\n\n## Canvas Mode (ACTIVE — ${label})\nThe user has enabled Canvas mode with a specific artifact type. You MUST use the create_artifact tool with type="${canvasMode}". The user wants a ${label} artifact. Render your output as a live artifact in the preview panel instead of inline text.`
    } else {
      instruction += `\n\n## Artifacts\nWhen creating substantial content (more than 15 lines of code, full HTML pages, React components, SVG graphics, diagrams, or long documents), use the create_artifact tool to render it in a live preview panel. Keep short code snippets, brief explanations, and simple answers inline in your response. ${artifactTypes}`
    }

    if (toolNames.includes("update_artifact")) {
      instruction += `\n\nWhen the user asks to modify, fix, or change an existing artifact, use update_artifact with the artifact's ID (from the create_artifact result) instead of creating a new one. Always provide the full updated content, not just the diff.`

      if (targetArtifactId) {
        instruction += `\n\nThe user is currently viewing artifact "${targetArtifactId}". When they ask for changes, modifications, or updates to "the artifact", "this", or the current content, use update_artifact with id="${targetArtifactId}".`
      }
    }
  }

  return instruction
}
