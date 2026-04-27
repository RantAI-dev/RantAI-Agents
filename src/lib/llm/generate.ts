import "server-only"
import { generateText } from "ai"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"

const SCRIPT_REWRITE_MODEL = "anthropic/claude-sonnet-4-6"

/**
 * Rewrites a docx-js JavaScript script using the user's edit prompt.
 *
 * The model is instructed to return ONLY the new full script — no commentary,
 * no markdown fences — so the caller can hand the result straight to the
 * sandbox validator. The system prompt also pins the required
 * `Packer.toBuffer(...).then(buf => process.stdout.write(buf.toString("base64")))`
 * tail so the rendered output reaches the renderer pipeline.
 */
export async function generateScriptRewrite(args: {
  currentScript: string
  editPrompt: string
}): Promise<string> {
  const openrouter = createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY || "",
  })
  const model = openrouter(SCRIPT_REWRITE_MODEL)

  const system = `You are rewriting a docx-js JavaScript script that produces a .docx file.
Apply the user's edit to the script. Return ONLY the new full script as JavaScript code.
No commentary, no markdown fences. The script MUST end by calling Packer.toBuffer(doc).then(buf => process.stdout.write(buf.toString("base64")))`

  const prompt = `Current script:
\`\`\`js
${args.currentScript}
\`\`\`

Edit to apply:
${args.editPrompt}

Return the new script:`

  const result = await generateText({
    model,
    system,
    prompt,
  })
  return result.text.trim()
}
