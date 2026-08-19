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
  // The engine may use lib/kb-runtime/{ports,runtime} but never the app-facing
  // barrel or the adapters — those pull infra back in transitively.
  "@/lib/kb-runtime/adapters",
]

/** Bare "@/lib/kb-runtime" (the app-facing barrel) is forbidden too. */
const DENY_EXACT = ["@/lib/kb-runtime"]

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
      if (DENY.some((d) => spec === d || spec.startsWith(d)) || DENY_EXACT.includes(spec)) {
        violations.push(`${file}:${i + 1} → ${spec}`)
        return
      }

      // Relative imports that climb out of the engine are the same violation
      // wearing a disguise (`../surrealdb` hurts exactly as much as
      // `@/lib/surrealdb` once the engine lives in another repo).
      if (spec.startsWith(".")) {
        const resolved = path.normalize(path.join(path.dirname(file), spec))
        const insideEngine = ENGINE_DIRS.some(
          (d) => resolved === d || resolved.startsWith(d + path.sep)
        )
        const allowedOutside =
          resolved.startsWith(path.join("src", "lib", "kb-runtime", "ports")) ||
          resolved.startsWith(path.join("src", "lib", "kb-runtime", "runtime"))
        if (!insideEngine && !allowedOutside) {
          violations.push(`${file}:${i + 1} → ${spec}  (escapes the engine)`)
        }
      }
    })
  }
}

// ─── The composition root must stay cheap to import ─────────────────────────
//
// apps/cloud/server.ts imports lib/kb-runtime to bind the ports before the
// ingest worker starts, so anything statically imported by adapters.ts lands
// in the server's entry graph, unbundled. `@/lib/llm/provider-registry` pulls
// in `server-only`, which only resolves through Next's bundler — that
// crash-looped staging at boot while the deploy still reported success.
// Infrastructure belongs behind `await import(...)` inside the methods.
const ADAPTERS = "src/lib/kb-runtime/adapters.ts"
const ADAPTER_STATIC_ALLOW = ["@/lib/prisma", "./ports"]

try {
  readFileSync(ADAPTERS, "utf-8")
    .split("\n")
    .forEach((line, i) => {
      const m = line.match(/^\s*import\s+(?!type\b)[^"']*["']([^"']+)["']/)
      if (!m) return
      const spec = m[1]
      if (spec.startsWith("@/") && !ADAPTER_STATIC_ALLOW.includes(spec)) {
        violations.push(
          `${ADAPTERS}:${i + 1} → ${spec}  (composition root must import infrastructure lazily)`
        )
      }
    })
} catch {
  /* adapters.ts is optional — the service repo has its own */
}

if (violations.length > 0) {
  console.error(`\n✗ KB boundary: ${violations.length} forbidden import(s)\n`)
  for (const v of violations) console.error("  " + v)
  console.error("\nThe engine must go through lib/kb-runtime/ports instead.\n")
  process.exit(1)
}

console.log("✓ KB boundary clean")
