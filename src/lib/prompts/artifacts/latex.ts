export const latexArtifact = {
  type: "text/latex" as const,
  label: "LaTeX / Math",
  summary:
    "Mathematical documents with sections, equations, and proofs — KaTeX-rendered. Supports inline/display math plus align, matrix, cases, gather, multline.",
  rules: `**text/latex — Mathematical Documents**

You are generating a LaTeX-flavored document that will be rendered by **KaTeX inside a custom transpiler**, NOT a full LaTeX engine. The renderer handles a curated subset of LaTeX: math environments via KaTeX, plus a small set of document-structure commands (sections, lists, quotes, basic text formatting). Pick this type for proofs, derivations, equation reference sheets, and math-heavy explainers.

## Runtime Environment
- **Math engine:** KaTeX with \`throwOnError: false\` — invalid math is rendered as a red \`\\code\` fragment, not a hard crash. Still: write valid math.
- **NOT a full LaTeX engine.** There is no preamble, no compilation step, no \`.tex\` toolchain.
- **Text outside math mode IS supported.** This renderer is not math-only — it handles \`\\section\`, \`\\subsection\`, paragraphs, lists, and basic inline formatting around your equations. Write structured documents, not just bare equations.
- **Math delimiters:**
  - Inline math: \`$...$\`
  - Display math: \`$$...$$\`, \`\\[...\\]\`, or any supported math environment.

## Supported Document-Structure Commands
| Command | Renders as |
|---|---|
| \`\\section{...}\` / \`\\section*{...}\` | \`<h2>\` |
| \`\\subsection{...}\` | \`<h3>\` |
| \`\\subsubsection{...}\` | \`<h4>\` |
| \`\\paragraph{...}\` | bold inline lead-in |
| \`\\begin{itemize} ... \\end{itemize}\` with \`\\item\` | unordered list |
| \`\\begin{enumerate} ... \\end{enumerate}\` with \`\\item\` | ordered list |
| \`\\begin{quote} ... \\end{quote}\` | blockquote |
| \`\\begin{abstract} ... \\end{abstract}\` | blockquote |
| \`\\textbf{...}\` | bold |
| \`\\textit{...}\` / \`\\emph{...}\` | italic |
| \`\\underline{...}\` | underline |
| \`\\texttt{...}\` | inline code |
| \`\\href{url}{text}\` | link |
| \`\\\\\` or \`\\newline\` | line break |
| \`~\` | non-breaking space |
| \`---\` / \`--\` | em-dash / en-dash |

Plain consecutive text lines (not starting with \`\\\` or \`$\`) are auto-wrapped as paragraphs. Use blank lines to separate paragraphs.

## Supported Math Environments
- \`equation\` / \`equation*\` — single numbered/unnumbered equation
- \`align\` / \`align*\` — multi-line aligned equations (use this for derivations)
- \`gather\` / \`gather*\` — multi-line centered equations
- \`multline\` / \`multline*\` — long single equation broken across lines
- \`cases\` — piecewise definitions
- \`eqnarray\` / \`eqnarray*\` (legacy; prefer \`align\`)

Inside math mode, KaTeX additionally supports:
- \`matrix\`, \`pmatrix\`, \`bmatrix\`, \`vmatrix\`, \`Vmatrix\`, \`Bmatrix\`
- \`array\`
- \`cases\`, \`aligned\`, \`gathered\`, \`split\`

## Math Best Practices
- Use \`\\newcommand{\\R}{\\mathbb{R}}\` (and similar) for symbols you repeat. KaTeX supports \`\\newcommand\`, \`\\renewcommand\`, and \`\\def\`.
- Use the \`align\` environment for multi-step derivations — **do not** stack multiple separate \`$$...$$\` blocks.
- Use \`\\text{...}\` for words inside math mode. Bare words inside \`$...$\` render in math italic and look wrong.
- Use \`\\left( ... \\right)\` (and \`\\left[\`, \`\\left\\{\`) for delimiters that auto-size with their contents.
- Spacing inside math: \`\\,\` thin, \`\\:\` medium, \`\\;\` thick, \`\\quad\`, \`\\qquad\`. Do not use literal spaces — they're ignored.
- Use \`&\` to mark alignment points in \`align\`, and \`\\\\\` to end a row.

## Common Symbols (Quick Reference)
- **Greek (lowercase):** \`\\alpha \\beta \\gamma \\delta \\epsilon \\varepsilon \\zeta \\eta \\theta \\vartheta \\iota \\kappa \\lambda \\mu \\nu \\xi \\pi \\rho \\sigma \\tau \\upsilon \\phi \\varphi \\chi \\psi \\omega\`
- **Greek (uppercase):** \`\\Gamma \\Delta \\Theta \\Lambda \\Xi \\Pi \\Sigma \\Upsilon \\Phi \\Psi \\Omega\`
- **Operators:** \`\\sum \\prod \\int \\oint \\iint \\partial \\nabla \\infty \\lim \\sup \\inf \\max \\min\`
- **Relations:** \`\\leq \\geq \\neq \\approx \\equiv \\sim \\propto \\subset \\supset \\subseteq \\in \\notin \\forall \\exists \\nexists\`
- **Logic / arrows:** \`\\land \\lor \\lnot \\implies \\iff \\to \\rightarrow \\leftarrow \\Rightarrow \\Leftrightarrow \\mapsto\`
- **Decorations:** \`\\hat{x} \\bar{x} \\vec{x} \\dot{x} \\ddot{x} \\tilde{x} \\widehat{xyz} \\overline{xyz} \\overrightarrow{AB}\`
- **Sets:** \`\\mathbb{R} \\mathbb{Z} \\mathbb{N} \\mathbb{C} \\mathbb{Q} \\emptyset \\varnothing\`
- **Calligraphic / fraktur:** \`\\mathcal{L} \\mathscr{F} \\mathfrak{g}\`
- **Roots / fractions:** \`\\sqrt{x} \\sqrt[n]{x} \\frac{a}{b} \\dfrac{a}{b} \\binom{n}{k}\`

## Anti-Patterns (Do NOT do these)
- ❌ \`\\documentclass{...}\` — silently stripped by the renderer; pure wasted tokens.
- ❌ \`\\usepackage{...}\` — same; KaTeX has no package system.
- ❌ \`\\begin{document}\` / \`\\end{document}\` — same.
- ❌ \`\\maketitle\` — only works if \`\\title{}\` was given; better to write \`\\section{}\` directly.
- ❌ \`\\input{...}\` / \`\\include{...}\` — no file system.
- ❌ \`\\label{...}\` / \`\\ref{...}\` / \`\\eqref{...}\` — cross-references are not resolved by this renderer.
- ❌ \`\\bibliography{...}\` / \`\\cite{...}\` — no bibliography pipeline.
- ❌ \`\\includegraphics{...}\` — no image inclusion.
- ❌ \`\\begin{tikzpicture}\`, \`\\begin{figure}\`, \`\\begin{table}\`, \`\\begin{tabular}\` — not supported. Use \`pmatrix\`/\`array\` for tabular math; switch to \`text/markdown\` for non-math tables.
- ❌ \`\\verb\` / \`\\begin{verbatim}\` — use \`\\texttt{...}\` instead.
- ❌ Multiple separate \`$$...$$\` blocks for what should be one \`align\` derivation.
- ❌ Bare English words inside \`$...$\` without wrapping them in \`\\text{...}\`.
- ❌ Truncation, \`\\dots\` as a stand-in for "and so on", or any placeholder text. Output the COMPLETE document.
`,
  examples: [
    {
      label: "Proof: √2 is irrational",
      code: `\\section{Theorem}

\\textbf{Claim.} $\\sqrt{2}$ is irrational.

\\section{Proof}

\\newcommand{\\Q}{\\mathbb{Q}}
\\newcommand{\\Z}{\\mathbb{Z}}

We proceed by contradiction. Suppose, for the sake of argument, that $\\sqrt{2} \\in \\Q$. Then there exist integers $a, b \\in \\Z$ with $b \\neq 0$ such that

$$
\\sqrt{2} = \\frac{a}{b}, \\qquad \\gcd(a, b) = 1.
$$

We may assume the fraction is in lowest terms. Squaring both sides and rearranging:

\\begin{align}
2 &= \\frac{a^2}{b^2} \\\\
a^2 &= 2 b^2.
\\end{align}

Therefore $a^2$ is even, which implies $a$ is even (since the square of an odd integer is odd). Write $a = 2k$ for some $k \\in \\Z$. Substituting:

\\begin{align}
(2k)^2 &= 2 b^2 \\\\
4 k^2  &= 2 b^2 \\\\
b^2    &= 2 k^2.
\\end{align}

By the same argument, $b$ is also even. But then $\\gcd(a, b) \\geq 2$, contradicting our assumption that $\\gcd(a, b) = 1$.

\\section{Conclusion}

The assumption $\\sqrt{2} \\in \\Q$ leads to a contradiction, so $\\sqrt{2} \\notin \\Q$. $\\quad \\blacksquare$
`,
    },
    {
      label: "Reference card: math environments",
      code: `\\section{KaTeX Environment Sampler}

\\subsection{Matrices}

$$
A = \\begin{pmatrix} 1 & 2 & 3 \\\\ 4 & 5 & 6 \\\\ 7 & 8 & 9 \\end{pmatrix},
\\qquad
\\det(A) = 0.
$$

\\subsection{Piecewise Definition}

$$
f(x) = \\begin{cases}
  x^2          & \\text{if } x \\geq 0, \\\\
  -x           & \\text{if } -1 \\leq x < 0, \\\\
  \\sin(x)     & \\text{otherwise}.
\\end{cases}
$$

\\subsection{Summation and Integral}

\\begin{align}
\\sum_{k=1}^{n} k         &= \\frac{n(n+1)}{2}, \\\\
\\int_{0}^{\\infty} e^{-x^2}\\, dx &= \\frac{\\sqrt{\\pi}}{2}.
\\end{align}

\\subsection{Vector Calculus}

For a scalar field $\\phi : \\mathbb{R}^3 \\to \\mathbb{R}$,

$$
\\nabla \\phi = \\left( \\frac{\\partial \\phi}{\\partial x},\\; \\frac{\\partial \\phi}{\\partial y},\\; \\frac{\\partial \\phi}{\\partial z} \\right).
$$
`,
    },
  ] as { label: string; code: string }[],
}
