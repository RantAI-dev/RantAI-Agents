# Batch 9 — `text/markdown` + `text/latex` Quality Upgrade

## 1. Goal

Replace the ~2-line `rules` strings on `markdown.ts` and `latex.ts` with full
instruction blocks that match the depth of `html.ts`, `svg.ts`, `mermaid.ts`,
and `code.ts`. Add validation in `_validate-artifact.ts`. No new dependencies.

## 2. Renderer Findings (the load-bearing analysis)

### 2.1 Markdown — `StreamdownContent`
File: [src/features/conversations/components/chat/streamdown-content.tsx](../../src/features/conversations/components/chat/streamdown-content.tsx)

- Library: **`streamdown`** (a streaming-friendly react-markdown wrapper).
- Plugins enabled:
  - `remark-math` + `rehype-katex` → **inline `$...$` and display `$$...$$` math
    blocks render via KaTeX, inside markdown**.
  - Shiki syntax highlighting for fenced code blocks (`controls.code: true`),
    themed `github-dark` / `github-light`.
  - GFM tables (`controls.table: true`).
  - Mermaid blocks (` ```mermaid `) with custom error UI.
- Streaming: animated caret while content streams in.
- Wrapped in a `chat-message` / `prose` style container.
- **Beyond basic Markdown the renderer supports:** GFM tables, fenced code with
  language tags + Shiki highlighting, ` ```mermaid ` diagrams, KaTeX math
  (`$...$`, `$$...$$`), task lists (GFM default), strikethrough, autolinks.
- **Not guaranteed:** raw HTML passthrough is *not* explicitly enabled — assume
  HTML-in-markdown is unreliable. Footnotes/definition lists not configured.

### 2.2 LaTeX — `LatexRenderer`
File: [src/features/conversations/components/chat/artifacts/renderers/latex-renderer.tsx](../../src/features/conversations/components/chat/artifacts/renderers/latex-renderer.tsx)

This is a **custom mini-LaTeX-to-HTML transpiler** wrapping KaTeX (`katex`
package, `throwOnError: false`). The #1 finding from the prompt:

> **The renderer supports text outside math mode.** It is NOT math-only.

Concretely the parser handles:

| Construct | Behavior |
|---|---|
| `\documentclass`, `\usepackage`, `\begin{document}`, `\end{document}`, `\title`, `\author`, `\date`, `\maketitle` | **Silently stripped** (preamble is parsed for title block only). They don't error, but they're useless filler. Instructions should still ban them. |
| `\section{}` / `\section*{}` | `<h2>` |
| `\subsection{}` | `<h3>` |
| `\subsubsection{}` | `<h4>` |
| `\paragraph{}` | bold lead-in |
| `\begin{itemize}` / `\begin{enumerate}` + `\item` | `<ul>` / `<ol>` |
| `\begin{quote}`, `\begin{abstract}` | `<blockquote>` |
| `\begin{equation|align|gather|multline|cases|eqnarray}` (`*` allowed) | KaTeX display |
| `\[ ... \]` | KaTeX display |
| `$$ ... $$` | KaTeX display |
| `$...$` (inline) | KaTeX inline |
| `\textbf{}`, `\textit{}`, `\emph{}`, `\underline{}`, `\texttt{}`, `\href{}{}`, `\text{}` (unwrapped), `\\`, `\newline`, `~`, `\,`, `\;`, `\quad`, `\qquad`, `---`, `--` | inline HTML |
| Any other `\begin{…}` / `\end{…}` | **silently skipped** |
| Plain consecutive non-command lines | wrapped as `<p>` |

KaTeX limitations the LLM must respect (from KaTeX docs):

- No `\usepackage`, `\documentclass`, `\begin{document}`, `\input`, `\include`.
- No `\newenvironment`. `\newcommand` / `\def` / `\renewcommand` *are* supported
  (KaTeX implements them).
- No `\label{}` / `\ref{}` / `\eqref{}` cross-references (KaTeX has limited
  support; not reliable here — and our renderer doesn't post-process refs).
- No `tikzpicture`, `figure`, `table`, `tabular` environments.
- No `\includegraphics`.
- No bibliography (`\cite`, `\bibliography`).
- No `align*` line numbering control beyond `*`.
- No `mathchoice`, `\verb`, `\verbatim`.
- No color packages outside `\color{}` / `\textcolor{}` (KaTeX supports those).

### 2.3 Current `rules` (the gap)

- `markdown.ts:6-7` — one sentence. Says nothing about KaTeX math, mermaid,
  Shiki code blocks, GFM tables, type boundary vs HTML.
- `latex.ts:6-7` — one sentence. Doesn't mention KaTeX, doesn't list supported
  environments, doesn't warn against `\usepackage` / `\documentclass`, doesn't
  explain that the renderer DOES support text/sections.

## 3. Implementation

### 3.1 Rewrite `src/lib/prompts/artifacts/markdown.ts`

`rules` will cover (≤ 1,200 tokens):

1. **What this type is** — long-form documents to read. Type boundary:
   markdown for documents/READMEs/reports/articles/tutorials; HTML for
   interactive pages.
2. **Renderer capabilities** — Streamdown with GFM, Shiki-highlighted fenced
   code, mermaid blocks, **inline `$...$` and display `$$...$$` KaTeX math**,
   tables, task lists, autolinks. Raw HTML is unreliable — avoid.
3. **Document structure** — single `# Title`, never skip levels (`#` → `##` →
   `###`), TOC for long docs, conclusion section for reports.
4. **Formatting rules** — Title Case for H1/H2, Sentence case below; 2–4
   sentence paragraphs; mix prose with lists; always tag fenced code with a
   language; descriptive link text; tables for comparisons.
5. **Math + diagrams** — note that `$$...$$` and ` ```mermaid ` blocks render,
   so use them when helpful instead of switching artifact type.
6. **Anti-patterns** — skipped heading levels, all-bullets, code blocks without
   language tag, raw URLs, walls of text, placeholders (`[TODO]`,
   `Lorem ipsum`, `...`), truncation, embedded `<script>` / raw HTML.
7. **One example** in the `examples` array (~60–80 lines): a technical doc with
   title, TOC, sections, fenced code, table, mixed list/prose, conclusion.

`summary` becomes:
> "Documents, reports, READMEs, articles, tutorials — rendered Markdown with
> GFM tables, Shiki-highlighted code blocks, KaTeX math, and mermaid diagrams."

### 3.2 Rewrite `src/lib/prompts/artifacts/latex.ts`

`rules` will cover (≤ 1,400 tokens):

1. **Runtime** — KaTeX inside a custom transpiler. **Not a full LaTeX engine.**
   Critically: the renderer DOES handle text outside math mode (sections,
   paragraphs, lists, quotes), so it's fine to write a structured document.
2. **Delimiters** — inline `$...$`; display `$$...$$`, `\[...\]`, or a math
   environment.
3. **Supported environments** — `equation`, `align`, `gather`, `multline`,
   `cases`, `eqnarray` (each with `*` variant). Plus `itemize`, `enumerate`,
   `quote`, `abstract`. Inside math: `matrix`, `pmatrix`, `bmatrix`, `vmatrix`,
   `Vmatrix`, `array`, `cases`.
4. **Document structure commands that work** — `\section`, `\subsection`,
   `\subsubsection`, `\paragraph`, `\textbf`, `\textit`, `\emph`, `\underline`,
   `\texttt`, `\href{url}{text}`, `\item`. `\\` for line breaks. Spacing
   commands `\,`, `\;`, `\quad`, `\qquad` work.
5. **Math best practices** — `\newcommand` for repeated symbols, `align` for
   multi-step derivations (not multiple `$$` blocks), `\text{}` for words inside
   math, `\left( ... \right)` for auto-sized delimiters.
6. **Symbol quick-reference** — Greek (`\alpha`…`\omega`, `\Gamma`, `\Delta`),
   operators (`\sum`, `\prod`, `\int`, `\partial`, `\nabla`, `\infty`),
   relations (`\leq`, `\geq`, `\neq`, `\approx`, `\equiv`, `\subset`, `\in`,
   `\forall`, `\exists`), decorations (`\hat{x}`, `\bar{x}`, `\vec{x}`,
   `\dot{x}`, `\tilde{x}`), sets (`\mathbb{R|Z|N|C|Q}`).
7. **Anti-patterns** — `\documentclass`, `\usepackage`, `\begin{document}` /
   `\end{document}`, `\maketitle` (silently stripped — wasted tokens),
   `\input` / `\include`, `\label`/`\ref`/`\eqref`, `tikzpicture`, `figure`,
   `tabular`, `\includegraphics`, `\cite`, multiple `$$` blocks where `align`
   belongs, bare words inside math mode without `\text{}`, truncation /
   placeholders.
8. **Two examples**:
   - **Proof / derivation** (~30–40 lines): √2 irrational OR quadratic formula
     derivation, using `\section`, `\newcommand`, `align`, `\text{}`.
   - **Reference card** (~20–30 lines): pmatrix, cases, integral, summation —
     showing environment variety.

`summary` becomes:
> "Mathematical documents with sections, equations, and proofs — KaTeX-rendered.
> Supports inline/display math plus align, matrix, cases, gather, multline."

### 3.3 Validation — `src/lib/tools/builtin/_validate-artifact.ts`

Add `validateMarkdown` and `validateLatex`. Pure string/regex.

**`validateMarkdown(content)`**
- ERROR: empty / whitespace-only.
- WARN: first non-blank line is not `# `.
- WARN: heading level skip (e.g. `#` directly followed later by `###` with no
  intermediate `##`).
- WARN: contains `<script` (likely meant for `text/html`).

**`validateLatex(content)`**
- ERROR: empty / whitespace-only.
- ERROR: contains `\documentclass`.
- ERROR: contains `\usepackage`.
- ERROR: contains `\begin{document}`.
- WARN: no math delimiter found at all (`$`, `$$`, `\[`, `\begin{equation}`,
  `\begin{align}`, `\begin{gather}`, `\begin{multline}`, `\begin{cases}`,
  `\begin{eqnarray}`).
- WARN: contains a known-unsupported command from this list:
  `\includegraphics`, `\bibliography`, `\cite`, `\input`, `\include`,
  `\tikz`, `\begin{tikzpicture}`, `\begin{figure}`, `\begin{table}`,
  `\begin{tabular}`, `\verb`, `\label{`, `\ref{`, `\eqref{`.

Wire into the existing `switch(type)` in `_validate-artifact.ts`:

```ts
if (type === "text/markdown") return validateMarkdown(content)
if (type === "text/latex")    return validateLatex(content)
```

### 3.4 Tests

New file (or extend existing `_validate-artifact` test):
`tests/unit/validate-artifact-markdown-latex.test.ts`.

Markdown cases:

| Input | Expect |
|---|---|
| `# Title\n\nBody.` | `ok: true`, no warnings |
| `""` | error |
| `Just a paragraph.` | warning (no heading) |
| `# A\n\n### C` | warning (skipped level) |
| `# T\n\n<script>x</script>` | warning (script tag) |

LaTeX cases:

| Input | Expect |
|---|---|
| `$$ x^2 + y^2 = z^2 $$` | ok |
| `\begin{align} a &= b \\ c &= d \end{align}` | ok |
| `""` | error |
| `\documentclass{article}\n$$x$$` | error |
| `\usepackage{amsmath}\n$$x$$` | error |
| `\begin{document}$$x$$\end{document}` | error |
| `\section{Intro}\nHello world.` | warning (no math delimiters) |
| `$$\includegraphics{a.png}$$` | warning (unsupported command) |

### 3.5 Order of work

| # | Task | File |
|---|---|---|
| 1 | Rewrite `markdown.ts` rules + example | [src/lib/prompts/artifacts/markdown.ts](../../src/lib/prompts/artifacts/markdown.ts) |
| 2 | Rewrite `latex.ts` rules + 2 examples | [src/lib/prompts/artifacts/latex.ts](../../src/lib/prompts/artifacts/latex.ts) |
| 3 | Add `validateMarkdown` + `validateLatex` | [src/lib/tools/builtin/_validate-artifact.ts](../../src/lib/tools/builtin/_validate-artifact.ts) |
| 4 | Vitest cases for both | `tests/unit/validate-artifact-markdown-latex.test.ts` |
| 5 | Manual test prompts (see §4) | — |

## 4. Manual Test Prompts

**Markdown (canvas = markdown):**
1. Technical README for a Node.js REST API (auth + DB + deploy).
2. Comparison report: PostgreSQL vs MySQL vs SQLite.
3. CI/CD tutorial with GitHub Actions for Next.js.

**LaTeX (canvas = latex):**
4. Derive the quadratic formula step by step.
5. Reference sheet: Normal / Binomial / Poisson / Exponential.
6. Prove √2 is irrational by contradiction.

**Type boundary (auto):**
7. "Explain the Pythagorean theorem with proof" → expect LaTeX.
8. "Project documentation for our microservice architecture" → expect Markdown.

Per-test acceptance criteria are listed in the source prompt; no changes.

## 5. Top-3 Most Impactful Additions

**Markdown**
1. Telling the LLM that the renderer **already supports `$$…$$` KaTeX math and
   ` ```mermaid ` blocks** — so it doesn't need to switch artifact types for
   these.
2. The HTML-vs-Markdown type boundary rule (read vs interact).
3. "Always tag fenced code with a language" + a real example so Shiki produces
   highlighted output.

**LaTeX**
1. Stating clearly that **the renderer is NOT math-only** — sections, lists,
   text formatting all work — while ALSO banning `\documentclass` /
   `\usepackage` / `\begin{document}` (silently stripped, pure waste).
2. Concrete list of supported environments (`equation`, `align`, `gather`,
   `multline`, `cases`, `eqnarray`, plus matrix family inside math).
3. The unsupported-commands blacklist (`\includegraphics`, `\cite`, `tikz`,
   `tabular`, `figure`, `\label`/`\ref`) — these are the failure modes that
   recur in untrained LLM output.

## 6. Constraints

- Token budgets: Markdown rules ≤ 1,200; LaTeX rules ≤ 1,400.
- No new dependencies.
- Examples live in the `examples` array (deterministic, not in `rules`).
- Don't commit `/tmp/reference/`.
- Two separate files — do not merge.
