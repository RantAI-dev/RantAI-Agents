import type { LabelEntry, LabelRegistry } from "./transpiler"

const THEOREM_FAMILY = new Set(["theorem", "lemma", "corollary", "proposition"])
const EQUATION_FAMILY = new Set(["equation", "align", "gather", "multline"])  // numbered envs only

const BEGIN_RE = /\\begin\{([a-z]+)(\*?)\}/g

export function scanLabels(source: string): LabelRegistry {
  const registry: LabelRegistry = new Map()
  let theoremCounter = 0
  let definitionCounter = 0
  let exampleCounter = 0
  let equationCounter = 0

  // Walk via matchAll to find every \begin{...}, then read the block until \end{...}
  const beginMatches = [...source.matchAll(BEGIN_RE)]
  for (const m of beginMatches) {
    const envName = m[1]
    const isStarred = m[2] === "*"
    if (isStarred) continue   // starred envs don't number

    const isTheoremFamily = THEOREM_FAMILY.has(envName)
    const isDefinition = envName === "definition"
    const isExample = envName === "example"
    const isEquationFamily = EQUATION_FAMILY.has(envName)

    if (!isTheoremFamily && !isDefinition && !isExample && !isEquationFamily) continue

    let kind: LabelEntry["kind"]
    let number: number
    if (isTheoremFamily) {
      theoremCounter++
      kind = envName as LabelEntry["kind"]   // theorem | lemma | corollary | proposition
      number = theoremCounter
    } else if (isDefinition) {
      definitionCounter++
      kind = "definition"
      number = definitionCounter
    } else if (isExample) {
      exampleCounter++
      kind = "example"
      number = exampleCounter
    } else {
      // equation family — all bucketed as "equation" for label kind
      equationCounter++
      kind = "equation"
      number = equationCounter
    }

    // Find the matching \end{<envName>} and scan the block for \label{...}
    const endTag = `\\end{${envName}}`
    const blockStart = m.index! + m[0].length
    const blockEnd = source.indexOf(endTag, blockStart)
    if (blockEnd === -1) continue   // malformed; skip
    const block = source.slice(blockStart, blockEnd)

    // Restrict the label search to the prefix BEFORE any nested \begin{} so a
    // labeled equation inside a theorem body does not bleed up to the theorem.
    // Outer envs that intentionally label after a nested env are uncommon
    // enough to accept as a known limitation.
    const firstNestedBegin = block.indexOf("\\begin{")
    const searchScope = firstNestedBegin === -1 ? block : block.slice(0, firstNestedBegin)
    const labelMatch = searchScope.match(/\\label\{([^}]+)\}/)
    if (!labelMatch) continue

    const key = labelMatch[1]
    const anchorId = slugify(key)
    const displayLabel =
      kind === "equation"
        ? `Equation (${number})`
        : `${capitalize(kind)} ${number}`

    registry.set(key, {
      kind,
      number: String(number),
      displayLabel,
      anchorId,
    })
  }

  return registry
}

export function resolveRef(
  registry: LabelRegistry,
  key: string,
  variant: "ref" | "eqref",
): { displayText: string; anchorId: string } | null {
  const entry = registry.get(key)
  if (!entry) return null
  const displayText = variant === "eqref" ? `(${entry.number})` : entry.number
  return { displayText, anchorId: entry.anchorId }
}

function slugify(s: string): string {
  // Replace : / and other unsafe id chars with -
  return s.replace(/[^a-zA-Z0-9_-]/g, "-")
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
