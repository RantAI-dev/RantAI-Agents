/**
 * Regenerate `src/lib/tools/builtin/_react-allowlists.ts` from the currently
 * installed `lucide-react` and `recharts` packages.
 *
 * Run from repo root:
 *   bun scripts/generate-react-allowlists.ts
 *
 * Re-run whenever those packages bump major versions. The validator uses the
 * generated allowlists to reject `application/react` artifacts that destructure
 * names not actually exported by the runtime UMD bundles (most common LLM
 * hallucinations: `MagnifyingGlass` for Lucide, `SankeyChart` for Recharts).
 */

import { writeFileSync } from "node:fs"
import { resolve } from "node:path"
import * as Lucide from "lucide-react"
import * as Recharts from "recharts"

const lucideNames = Object.keys(Lucide)
  .filter(
    (n) =>
      /^[A-Z]/.test(n) &&
      (typeof (Lucide as Record<string, unknown>)[n] === "object" ||
        typeof (Lucide as Record<string, unknown>)[n] === "function"),
  )
  .sort()

const rechartsNames = Object.keys(Recharts)
  .filter((k) => /^[A-Z]/.test(k))
  .sort()

const lines: string[] = []
lines.push("/**")
lines.push(" * React-artifact identifier allowlists for `validateReact`.")
lines.push(" *")
lines.push(" * Generated from the installed package versions:")
lines.push(
  ` *   - lucide-react (${lucideNames.length} names — both canonical \`Foo\` and \`FooIcon\` aliases)`,
)
lines.push(` *   - recharts (${rechartsNames.length} components)`)
lines.push(" *")
lines.push(" * Regenerate by running, from repo root:")
lines.push(" *   bun scripts/generate-react-allowlists.ts")
lines.push(" *")
lines.push(
  " * The validator uses these to flag LLM-emitted JSX that destructures or",
)
lines.push(
  " * member-accesses names that don't exist on `LucideReact` / `Recharts` at",
)
lines.push(
  ' * runtime — turning a runtime "X is not defined" / "Element type is',
)
lines.push(
  ' * invalid" crash into a create-time validation error that the LLM tool-call',
)
lines.push(" * loop self-corrects.")
lines.push(" */")
lines.push("")
lines.push("export const LUCIDE_NAMES: ReadonlySet<string> = new Set([")
for (const n of lucideNames) lines.push(`  "${n}",`)
lines.push("])")
lines.push("")
lines.push("export const RECHARTS_NAMES: ReadonlySet<string> = new Set([")
for (const n of rechartsNames) lines.push(`  "${n}",`)
lines.push("])")
lines.push("")

const outPath = resolve(
  import.meta.dir,
  "..",
  "src/lib/tools/builtin/_react-allowlists.ts",
)
writeFileSync(outPath, lines.join("\n"))
console.log(
  `wrote ${lines.length} lines (${lucideNames.length} lucide + ${rechartsNames.length} recharts) to ${outPath}`,
)
