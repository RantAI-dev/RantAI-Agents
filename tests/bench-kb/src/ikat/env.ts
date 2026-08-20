/**
 * Minimal .env loader for the IKAT-Bench scripts.
 *
 * The bench runs as a standalone bun script outside the Next.js runtime, so it
 * does not inherit the app's env loading. Reads the repo's env files in
 * precedence order and fills in only what is MISSING, so an explicitly exported
 * variable always wins over a file (the deploy shell must be able to override).
 */
import * as fs from "node:fs"
import * as path from "node:path"

/**
 * Outer repo root (agents-cloud), six levels up from
 * packages/rantai-agents/tests/bench-kb/src/ikat. Note this deliberately climbs
 * OUT of the rantai-agents submodule: the env files and the PDF corpus live in
 * the outer repo, not in the package.
 */
const REPO_ROOT = path.resolve(import.meta.dirname, "../../../../../..")

const ENV_FILES = ["apps/cloud/.env.local", ".env"]

let loaded = false

export function loadEnv(): void {
  if (loaded) return
  loaded = true
  for (const rel of ENV_FILES) {
    const p = path.join(REPO_ROOT, rel)
    if (!fs.existsSync(p)) continue
    for (const line of fs.readFileSync(p, "utf-8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
      if (!m) continue
      const key = m[1]
      if (process.env[key] !== undefined) continue // never clobber an explicit export
      let val = m[2].trim()
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
      else if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1)
      process.env[key] = val
    }
  }
}

export function requireEnv(name: string): string {
  loadEnv()
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not set (checked env and ${ENV_FILES.join(", ")})`)
  return v
}

export { REPO_ROOT }
