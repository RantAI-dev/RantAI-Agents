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

/** Map language names to Piston runtime identifiers */
const LANGUAGE_MAP: Record<string, { language: string; version: string }> = {
  python: { language: "python", version: "3.10.0" },
  javascript: { language: "javascript", version: "18.15.0" },
  typescript: { language: "typescript", version: "5.0.3" },
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
    const runtime = LANGUAGE_MAP[language]

    if (!runtime) {
      return { success: false, language, error: `Unsupported language: ${language}` }
    }

    try {
      const res = await fetch(`${PISTON_URL}/api/v2/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: runtime.language,
          version: runtime.version,
          files: [{ content: code }],
          run_timeout: 15000, // 15s max
          run_memory_limit: 256_000_000, // 256MB max memory
          run_env_vars: { MPLBACKEND: "Agg" }, // headless matplotlib
        }),
      })

      if (!res.ok) {
        const errText = await res.text().catch(() => "Unknown error")
        return { success: false, language, error: `Piston error: HTTP ${res.status} - ${errText}` }
      }

      const data = (await res.json()) as PistonResponse

      // Check compile errors (TypeScript)
      if (data.compile && data.compile.code !== 0) {
        return {
          success: false,
          language,
          output: data.compile.stderr || data.compile.output,
          error: "Compilation failed",
          exitCode: data.compile.code,
        }
      }

      return {
        success: data.run.code === 0,
        language,
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
  },
}
