import { z } from "zod"
import type { ToolDefinition } from "../types"

const PISTON_URL = process.env.PISTON_URL || "http://localhost:2000"

interface PistonRunResult {
  stdout: string
  stderr: string
  output: string
  code: number
  signal: string | null
}

interface PistonResponse {
  language: string
  version: string
  run: PistonRunResult
  compile?: PistonRunResult
}

/**
 * Map an input language to the ordered list of Piston runtime identifiers
 * to try. `*` tells Piston to pick the installed version of that runtime,
 * avoiding breakage when a sandbox is rebuilt without the exact version
 * our map hardcoded. Aliases are tried as fallbacks for runtimes that ship
 * under multiple names on different Piston images.
 */
const LANGUAGE_CANDIDATES: Record<string, string[]> = {
  python: ["python"],
  javascript: ["javascript", "node", "node-javascript"],
  typescript: ["typescript", "typescript-node", "typesnode"],
}

/** Body keys other than "language" and "files" that are constant across attempts. */
const EXECUTE_BODY_CONST = {
  run_timeout: 15000,
  run_memory_limit: 256_000_000,
  run_env_vars: { MPLBACKEND: "Agg" },
} as const

/**
 * Piston returns a 400 with body text like
 * `{"message":"Runtime 'javascript:18.15.0' is unknown"}` when the runtime
 * is not present on the sandbox. Anything else (auth, bad request body, internal
 * error) is a hard failure that retrying won't fix.
 *
 * Match broadly: any 400 body that mentions "runtime" plus a missing/unknown
 * signal is treated as a runtime problem worth retrying with the next alias.
 */
function isRuntimeUnknown(errText: string): boolean {
  const text = errText.toLowerCase()
  if (!text) return false
  if (!text.includes("runtime")) return false
  return /unknown|not (found|installed|available)|unsupported|no matching/i.test(text)
}

function capitalize(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export const codeInterpreterTool: ToolDefinition = {
  name: "code_interpreter",
  displayName: "Code Interpreter",
  description:
    "Execute code in a sandboxed environment and return the output. Use for calculations, data analysis, algorithms, or any task requiring code execution. Supports Python, TypeScript, and JavaScript. Print results to stdout. Available Python packages: numpy, scipy, pandas, matplotlib. To output a matplotlib plot: `import io,base64; buf=io.BytesIO(); plt.savefig(buf,format='png',bbox_inches='tight',dpi=100); buf.seek(0); print('data:image/png;base64,'+base64.b64encode(buf.read()).decode())`. MATPLOTLIB RULES: (1) Only use standard colormaps: viridis, plasma, inferno, magma, hot, coolwarm, Blues, Reds, RdYlBu, jet, turbo, rainbow — do NOT invent colormap names. (2) Never use emoji in plot titles/labels — the sandbox font has no emoji support and will cause errors. (3) Use dpi=80 to dpi=120 to keep output size small. (4) Always call matplotlib.use('Agg') before importing pyplot.",
  category: "builtin",
  parameters: z.object({
    language: z
      .enum(["python", "typescript", "javascript"])
      .describe("Programming language to execute"),
    code: z
      .string()
      .describe("The code to execute. Print results to stdout."),
  }),
  execute: async (params) => {
    const language = params.language as string
    const code = params.code as string
    const candidates = LANGUAGE_CANDIDATES[language]

    if (!candidates) {
      return { success: false, language, error: `Unsupported language: ${language}` }
    }

    for (const runtimeLanguage of candidates) {
      try {
        const res = await fetch(`${PISTON_URL}/api/v2/execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            language: runtimeLanguage,
            version: "*",
            files: [{ content: code }],
            ...EXECUTE_BODY_CONST,
          }),
        })

        if (!res.ok) {
          const errText = await res.text().catch(() => "Unknown error")
          // Piston answers with HTTP 400 + a body mentioning the missing
          // runtime; that's our retry signal. Network / 5xx errors are NOT
          // retried — they'd just delay the same failure.
          if (res.status !== 400 || !isRuntimeUnknown(errText)) {
            return { success: false, language, error: `Piston error: HTTP ${res.status} - ${errText}` }
          }
          continue
        }

        const data = (await res.json()) as PistonResponse

        // Check compile errors (TypeScript)
        if (data.compile && data.compile.code !== 0) {
          return {
            success: false,
            language,
            runtimeLanguage,
            output: data.compile.stderr || data.compile.output,
            error: "Compilation failed",
            exitCode: data.compile.code,
          }
        }

        return {
          success: data.run.code === 0,
          language,
          runtimeLanguage,
          output: data.run.stdout || data.run.output,
          stderr: data.run.stderr || undefined,
          exitCode: data.run.code,
        }
      } catch (err) {
        return {
          success: false,
          language,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    }

    return {
      success: false,
      language,
      error: `${capitalize(language)} execution is not available on this code sandbox (no matching runtime). Try Python instead.`,
    }
  },
}
