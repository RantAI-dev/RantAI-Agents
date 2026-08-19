import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync, statSync } from "fs"
import path from "path"
import { KB_ENV_NAMES, KB_ENV_SURFACE } from "@/lib/rag/config-surface"

/**
 * Keeps the declared configuration surface honest.
 *
 * A KB service in its own repo has to accept exactly the variables the engine
 * reads. A plain docs table drifts the first time someone adds a flag; this
 * test fails instead.
 */

const ENGINE_DIRS = [
  "src/lib/rag",
  "src/lib/ingest",
  "src/lib/document-intelligence",
  "src/lib/files",
]

// Read by the engine but owned elsewhere (build/runtime plumbing, not KB config).
const NOT_KB_CONFIG = new Set(["NODE_ENV", "NEXT_RUNTIME", "VITEST"])

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.tsx?$/.test(entry) && !full.includes("config-surface")) out.push(full)
  }
  return out
}

describe("KB configuration surface", () => {
  it("declares every environment variable the engine reads", () => {
    const found = new Map<string, string>()
    for (const dir of ENGINE_DIRS) {
      for (const file of walk(dir)) {
        const text = readFileSync(file, "utf-8")
        for (const m of text.matchAll(/process\.env\.([A-Z_0-9]+)/g)) {
          if (!NOT_KB_CONFIG.has(m[1])) found.set(m[1], file)
        }
      }
    }

    const undeclared = [...found.entries()]
      .filter(([name]) => !KB_ENV_NAMES.has(name))
      .map(([name, file]) => `${name} (read in ${file})`)

    expect(
      undeclared,
      "Add these to src/lib/rag/config-surface.ts — a standalone KB service must know to accept them"
    ).toEqual([])
  })

  it("declares no variable the engine has stopped reading", () => {
    const text = ENGINE_DIRS.flatMap((d) => walk(d))
      .map((f) => readFileSync(f, "utf-8"))
      .join("\n")
    const stale = KB_ENV_SURFACE.map((v) => v.name).filter((name) => !text.includes(name))
    expect(stale, "Remove these from config-surface.ts — nothing reads them any more").toEqual([])
  })

  it("gives every entry a purpose and a default", () => {
    for (const v of KB_ENV_SURFACE) {
      expect(v.purpose.length, `${v.name} needs a purpose`).toBeGreaterThan(0)
      expect(v.default.length, `${v.name} needs a documented default`).toBeGreaterThan(0)
    }
  })
})
