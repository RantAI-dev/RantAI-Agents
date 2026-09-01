import { describe, expect, it } from "vitest"
import { preprocessCode } from "@/features/conversations/components/chat/artifacts/renderers/react-renderer"

/**
 * Artifact code is authored as ES modules, then rewritten into destructuring of
 * iframe globals before Babel sees it. Anything this rewrite emits has to be
 * valid JS on its own — a single bad token takes down the entire artifact with
 * "Unexpected token", which the user only ever sees as "Something went wrong".
 *
 * These cases sweep the import shapes models actually emit.
 */

/** The preamble is plain JS (no JSX), so the parser itself is the oracle. */
function preambleOf(code: string): string {
  const { processedCode } = preprocessCode(code)
  return processedCode.split("\n").filter((l) => l.trim().startsWith("const ")).join("\n")
}

function assertParses(js: string) {
  expect(() => new Function(`${js}\n;0`)).not.toThrow()
}

describe("preprocessCode import rewriting", () => {
  it("handles the lucide alias shape that broke the pizza artifact", () => {
    const preamble = preambleOf(
      `import { Pizza, Menu as MenuIcon, X, Phone } from 'lucide-react'\nfunction App(){return null}`
    )
    expect(preamble).toContain("Menu: MenuIcon")
    expect(preamble).not.toContain(" as ")
    assertParses(preamble.replace(/= (LucideReact|Recharts|React);/g, "= {};"))
  })

  it("handles a default + named mix with an alias", () => {
    const preamble = preambleOf(
      `import Recharts, { LineChart, Tooltip as ChartTooltip } from 'recharts'\nfunction App(){return null}`
    )
    expect(preamble).toContain("Tooltip: ChartTooltip")
    assertParses(preamble.replace(/= (LucideReact|Recharts|React);/g, "= {};"))
  })

  it("handles multi-line imports with a trailing comma", () => {
    const preamble = preambleOf(
      `import {\n  Truck,\n  ChefHat as Chef,\n} from 'lucide-react'\nfunction App(){return null}`
    )
    expect(preamble).toContain("ChefHat: Chef")
    assertParses(preamble.replace(/= (LucideReact|Recharts|React);/g, "= {};"))
  })

  it("wires a react alias to the aliased binding, not the original", () => {
    const preamble = preambleOf(
      `import { useState as useLocalState } from 'react'\nfunction App(){return null}`
    )
    expect(preamble).toContain("useState: useLocalState")
    assertParses(preamble.replace(/= React;/g, "= {};"))
  })

  it("emits nothing unparseable for a namespace import", () => {
    const preamble = preambleOf(`import * as Icons from 'lucide-react'\nfunction App(){return null}`)
    expect(preamble).toContain("const Icons = LucideReact;")
    assertParses(preamble.replace(/= LucideReact;/g, "= {};"))
  })
})
