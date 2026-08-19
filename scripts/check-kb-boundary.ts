#!/usr/bin/env bun
/**
 * Fails if the KB engine imports app infrastructure.
 *
 * The engine must depend only on its ports (lib/kb-runtime/ports) so it can
 * move to its own repo/service without dragging the app with it. Adapters that
 * bind those ports to prisma/s3/socket/surreal live in lib/kb-runtime/adapters,
 * which is the one file allowed to know about the app.
 *
 * See docs/superpowers/specs/2026-08-19-kb-extraction-phase0-design.md
 */
import { readdirSync, readFileSync, statSync } from "fs"
import path from "path"

const ENGINE_DIRS = [
  "src/lib/rag",
  "src/lib/ingest",
  "src/lib/ocr",
  "src/lib/document-intelligence",
  "src/lib/files",
]

const DENY = [
  "@/lib/prisma",
  "@prisma/client",
  "@/lib/s3",
  "@/lib/socket",
  "@/lib/surrealdb",
  "@/lib/workflow",
  "@/lib/llm",
  "@/lib/quota",
  "@/lib/audit",
  "@/lib/organization",
  "@/lib/auth",
  "@/hooks/",
  "@/components/",
  "@/features/",
]

function walk(dir: string): string[] {
  const out: string[] = []
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

const violations: string[] = []
for (const dir of ENGINE_DIRS) {
  for (const file of walk(dir)) {
    const lines = readFileSync(file, "utf-8").split("\n")
    lines.forEach((line, i) => {
      // Matches both `from "x"` and `import("x")` (static + lazy).
      const m = line.match(/(?:from\s+|import\(\s*)["']([^"']+)["']/)
      if (!m) return
      const spec = m[1]
      if (DENY.some((d) => spec === d || spec.startsWith(d))) {
        violations.push(`${file}:${i + 1} → ${spec}`)
      }
    })
  }
}

if (violations.length > 0) {
  console.error(`\n✗ KB boundary: ${violations.length} forbidden import(s)\n`)
  for (const v of violations) console.error("  " + v)
  console.error("\nThe engine must go through lib/kb-runtime/ports instead.\n")
  process.exit(1)
}

console.log("✓ KB boundary clean")
