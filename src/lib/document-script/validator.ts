import "server-only"
import * as ts from "typescript"
import { runScriptInSandbox } from "./sandbox-runner"
import type { ScriptValidationResult } from "./types"

const DOCX_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04])
const DRY_RUN_TIMEOUT_MS = 5_000

function quickSyntaxCheck(src: string): string | null {
  // Use the TypeScript compiler API for a parse-only check. `new Function(src)`
  // would parse as a classic script and reject all `import`/`export`
  // statements (which valid docx scripts always contain), so we cannot use it.
  const sourceFile = ts.createSourceFile(
    "user-script.mjs",
    src,
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ false,
    ts.ScriptKind.JS,
  )
  const diagnostics =
    (sourceFile as unknown as { parseDiagnostics?: ts.DiagnosticWithLocation[] }).parseDiagnostics ?? []
  if (diagnostics.length === 0) return null
  return diagnostics
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"))
    .join("; ")
}

export async function validateScriptArtifact(content: string): Promise<ScriptValidationResult> {
  const syntaxError = quickSyntaxCheck(content)
  if (syntaxError) {
    return { ok: false, errors: [`syntax error: ${syntaxError}`] }
  }
  const r = await runScriptInSandbox(content, { timeoutMs: DRY_RUN_TIMEOUT_MS })
  if (!r.ok || !r.buf) {
    return { ok: false, errors: [`sandbox: ${r.error ?? "unknown"}`] }
  }
  if (!r.buf.subarray(0, 4).equals(DOCX_MAGIC)) {
    return { ok: false, errors: ["script output is not a valid .docx (missing PK magic bytes)"] }
  }
  return { ok: true, errors: [] }
}
