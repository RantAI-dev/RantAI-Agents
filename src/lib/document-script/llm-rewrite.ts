import "server-only"
import { generateScriptRewrite } from "@/lib/llm/generate"
import { validateScriptArtifact } from "./validator"
import { recordLlmRewrite } from "./metrics"

const MAX_RETRIES = 2

export interface RewriteResult {
  ok: boolean
  script?: string
  error?: string
  attempts: number
}

/**
 * Calls the LLM to rewrite a docx-js script, then runs the same sandbox
 * validator the create path uses. On validation failure, the previous
 * validator error is fed back into the next prompt so the model can
 * self-correct. Gives up after `1 + MAX_RETRIES` total attempts and
 * surfaces the last error.
 */
export async function llmRewriteWithRetry(args: {
  currentScript: string
  editPrompt: string
}): Promise<RewriteResult> {
  let lastError: string | null = null
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const promptSuffix = lastError
      ? `\n\nYour previous attempt failed validation with: "${lastError}". Fix it and return the corrected script.`
      : ""
    const newScript = await generateScriptRewrite({
      currentScript: args.currentScript,
      editPrompt: args.editPrompt + promptSuffix,
    })
    const v = await validateScriptArtifact(newScript)
    if (v.ok) {
      recordLlmRewrite({ ok: true, attempts: attempt + 1 })
      return { ok: true, script: newScript, attempts: attempt + 1 }
    }
    lastError = v.errors.join("; ")
  }
  recordLlmRewrite({ ok: false, attempts: MAX_RETRIES + 1 })
  return {
    ok: false,
    error: `validation failed after ${MAX_RETRIES + 1} attempts: ${lastError}`,
    attempts: MAX_RETRIES + 1,
  }
}
