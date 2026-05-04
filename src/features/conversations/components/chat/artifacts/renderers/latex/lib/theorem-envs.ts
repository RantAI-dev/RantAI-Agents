export type TheoremKind =
  | "theorem"
  | "lemma"
  | "corollary"
  | "proposition"
  | "definition"
  | "example"
  | "remark"
  | "proof"

export const THEOREM_KINDS: ReadonlySet<TheoremKind> = new Set([
  "theorem",
  "lemma",
  "corollary",
  "proposition",
  "definition",
  "example",
  "remark",
  "proof",
])

const KIND_COLOR: Record<TheoremKind, string> = {
  theorem: "blue",
  lemma: "indigo",
  corollary: "teal",
  proposition: "sky",
  definition: "purple",
  example: "amber",
  remark: "gray",
  proof: "gray",
}

const KIND_LABEL: Record<TheoremKind, string> = {
  theorem: "Theorem",
  lemma: "Lemma",
  corollary: "Corollary",
  proposition: "Proposition",
  definition: "Definition",
  example: "Example",
  remark: "Remark",
  proof: "Proof",
}

const BEGIN_RE = /^\s*\\begin\{([a-z]+)\}(?:\[([^\]]+)\])?\s*$/

export function isTheoremBegin(
  line: string,
): { kind: TheoremKind; optionalName?: string } | null {
  const m = line.match(BEGIN_RE)
  if (!m) return null
  const kind = m[1] as TheoremKind
  if (!THEOREM_KINDS.has(kind)) return null
  const optionalName = m[2]
  return optionalName ? { kind, optionalName } : { kind }
}

export function renderTheoremBlock(
  kind: TheoremKind,
  number: string | null,
  optionalName: string | undefined,
  innerHtml: string,
  anchorId: string | null,
): string {
  const color = KIND_COLOR[kind]
  const label = KIND_LABEL[kind]
  const headerNumber = number ? ` ${number}` : ""
  const headerName = optionalName ? ` (${optionalName})` : ""
  const idAttr = anchorId ? ` id="${anchorId}"` : ""
  const qed =
    kind === "proof"
      ? '<span class="latex-qed">∎</span>'
      : ""

  return (
    `<aside${idAttr} class="latex-theorem latex-theorem-${color}">` +
      `<header class="latex-theorem-header">${label}${headerNumber}${headerName}.</header>` +
      `<div class="latex-theorem-body">${innerHtml}${qed}</div>` +
    `</aside>`
  )
}
