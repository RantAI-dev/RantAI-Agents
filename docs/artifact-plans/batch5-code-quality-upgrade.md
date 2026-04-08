# Batch 5: `application/code` Artifact Quality Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `src/lib/prompts/artifacts/code.ts` into a depth-matched per-type instruction (comparable to `html.ts`, `svg.ts`, `mermaid.ts`), and extend the server-side validator with a `validateCode` branch so truncation, placeholder implementations, and wrong-type misuse get caught before persisting.

**Architecture:** `application/code` is a display-only artifact. The artifact panel renders it by wrapping content in a fenced markdown block (`getCodeLanguage()` in [artifact-panel.tsx:564](src/features/conversations/components/chat/artifacts/artifact-panel.tsx#L564)) and handing it to `StreamdownContent`, which syntax-highlights via the Streamdown/Shiki pipeline. The `language` parameter is a free-form string on the `create_artifact` tool schema ([create-artifact.ts:42](src/lib/tools/builtin/create-artifact.ts#L42)) — not an enum, not required — used for both highlighting and download file extension. The file is also used as the download extension fallback (`.${language}` or `.txt`). Because there is no dedicated renderer, quality is 100% governed by the prompt rules + a lightweight text validator.

**Tech Stack:** TypeScript, existing `validateArtifactContent` pipeline in [_validate-artifact.ts](src/lib/tools/builtin/_validate-artifact.ts), no new dependencies.

---

## Context Summary (from Step 1 reading)

- **Current `code.ts` rules** ([code.ts:6](src/lib/prompts/artifacts/code.ts#L6)): one paragraph, ~60 words. Says "set `language`", "be complete", "no stubs". Zero guidance on structure, per-language idioms, documentation, anti-patterns, or type-boundary decisions. `examples` array is empty.
- **How it renders:** [artifact-panel.tsx:493](src/features/conversations/components/chat/artifacts/artifact-panel.tsx#L493) builds `` `${language}\n${content}\n` `` and passes it to `StreamdownContent` (Shiki-based highlighter). No execution, no iframe — pure display. Copy and Download buttons live in the header. Download filename uses `language` as extension.
- **`language` parameter:** Optional free string on the Zod schema ([create-artifact.ts:42-47](src/lib/tools/builtin/create-artifact.ts#L42-L47)). Used as-is by Shiki (common values: `typescript`, `tsx`, `python`, `rust`, `go`, `sql`, `yaml`, `json`, `toml`, `bash`, `java`, `cpp`, `csharp`, `ruby`, `php`, `html`, `css`). Since it's optional, the LLM frequently forgets it, which produces unstyled code.
- **Key gaps:**
  1. No type-boundary guidance — LLM picks `application/code` for Python that should be `application/python` or HTML that should be `text/html`.
  2. No rule that `language` must be set (it's optional in the schema, so the prompt has to enforce it).
  3. No structure/ordering rules (imports → types → logic → exports → example).
  4. No anti-truncation language specific to code ("`// ...rest of implementation`" is the most common failure).
  5. No language-specific idiom rules — TS code lands with `any`, Python without type hints, Go without error checks.
  6. No documentation expectations (module header, docstrings, usage example).
  7. No examples in the `examples` array — the other upgraded types all ship 2-3.
- **Validator gap:** [_validate-artifact.ts:42-47](src/lib/tools/builtin/_validate-artifact.ts#L42-L47) only dispatches `text/html`, `application/react`, `image/svg+xml`, `application/mermaid`. `application/code` falls through to the default `{ ok: true }`, so bad output is never caught.

---

## File Structure

- **Modify:** [src/lib/prompts/artifacts/code.ts](src/lib/prompts/artifacts/code.ts) — full rewrite of `rules`, `summary`, plus 2 entries in `examples`. Target ≤ 1,800 tokens for `rules`.
- **Modify:** [src/lib/tools/builtin/_validate-artifact.ts](src/lib/tools/builtin/_validate-artifact.ts) — add `validateCode` function and dispatch branch.
- **Create:** `src/lib/tools/builtin/__tests__/_validate-artifact.code.test.ts` — unit tests for the new branch (or extend the existing validator test file if present; discover during Task 2).

Each file has a single responsibility: `code.ts` is prompt content, `_validate-artifact.ts` is the runtime guard, test file is verification. No cross-file coupling beyond the existing dispatch.

---

## Task 1: Rewrite `code.ts` — rules + summary + examples

**Files:**
- Modify: [src/lib/prompts/artifacts/code.ts](src/lib/prompts/artifacts/code.ts) (full rewrite)

- [ ] **Step 1: Open existing file and confirm exports**

Run: `cat src/lib/prompts/artifacts/code.ts`
Expected: Confirm the export shape is `{ type, label, summary, rules, examples }` — must preserve field names and types because [index.ts](src/lib/prompts/artifacts/index.ts) consumes them.

- [ ] **Step 2: Replace file contents**

Write the new file. The `rules` string must contain these six sections in order (titles exactly as shown, so editors can locate them):

1. **What This Type Is** — display-only, no execution, copy/download, syntax highlighting via Shiki. Explicitly set `language`. Include the type-boundary decision table (see below).
2. **Code Quality — STRICT** — anti-truncation and anti-placeholder rules.
3. **Structure** — ordering convention, function size, indentation per language.
4. **Language-Specific Conventions** — TS, Python, Rust, Go, SQL, config (YAML/JSON/TOML), shell.
5. **Documentation** — module header, public-function docs, inline comments for "why" only, usage example.
6. **Anti-Patterns** — bullet list of forbidden things.

Full content for `code.ts`:

```ts
export const codeArtifact = {
  type: "application/code" as const,
  label: "Code",
  summary:
    "Source code files with syntax highlighting — any language (TypeScript, Python, Rust, Go, SQL, config files, shell scripts, etc.). Display only, no execution.",
  rules: `**application/code — Source Code Files**

You are generating a standalone source code file that will be displayed in a read-only panel with Shiki syntax highlighting, a copy button, and a download button. **There is no execution environment.** The user copies the code out and runs it somewhere else. Your only job is to produce code that is correct, complete, idiomatic, and ready to paste into a real project.

## Runtime Environment
- **Rendering:** Shiki highlights the content based on the \`language\` parameter you set. If \`language\` is missing or wrong, the code appears as unstyled plain text and the download file gets the wrong extension.
- **The \`language\` parameter is REQUIRED.** Always set it. Use the canonical highlighter name, lowercase: \`typescript\`, \`tsx\`, \`javascript\`, \`jsx\`, \`python\`, \`rust\`, \`go\`, \`java\`, \`csharp\`, \`cpp\`, \`c\`, \`ruby\`, \`php\`, \`swift\`, \`kotlin\`, \`sql\`, \`bash\`, \`shell\`, \`yaml\`, \`json\`, \`toml\`, \`dockerfile\`, \`html\`, \`css\`, \`scss\`, \`markdown\`. Match the file's actual language — do not put \`javascript\` on a TypeScript file.
- **No execution, no sandbox, no imports resolved.** The code is not validated by a compiler or runtime. Mentally verify it would compile/run if pasted into a real project.

## Type Boundary — Pick the RIGHT Artifact Type
\`application/code\` is NOT the only code-bearing type. Using it when a better type exists wastes the user's capabilities. Decide BEFORE you generate:

| User wants... | Correct type | Reason |
|---|---|---|
| Runnable Python script (fibonacci, data munging, API call) | \`application/python\` | Executes in-browser via Pyodide |
| Interactive HTML page (landing page, calculator, demo) | \`text/html\` | Rendered live in iframe |
| React component with visual output | \`application/react\` | Rendered via Babel + iframe |
| TypeScript / JavaScript library code (no UI, utility functions) | \`application/code\` | Display-only, copy-to-project |
| Rust / Go / Java / C++ / C# / Swift (any compiled language) | \`application/code\` | Cannot execute in browser |
| SQL queries, schema migrations | \`application/code\` | Display-only |
| Config files (YAML, JSON, TOML, Dockerfile, nginx.conf) | \`application/code\` | Display-only |
| Shell / Bash scripts | \`application/code\` | Display-only |
| SVG illustration | \`image/svg+xml\` | Rendered visually |
| Mermaid diagram | \`application/mermaid\` | Rendered as SVG |

**Rule of thumb:** if the user asks "write me X that I can run right now" and X is Python, HTML, or React, pick the executable type. Otherwise use \`application/code\`.

## Code Quality — STRICT
- **NEVER truncate.** Output the COMPLETE file. No \`// ...rest of implementation\`, no \`/* TODO */\`, no \`# ...\`, no \`...\` ellipsis. If the user asks for something that would be 400 lines, output 400 lines.
- **NEVER use placeholder implementations.** No \`pass  # implement me\`, no \`throw new Error("not implemented")\`, no \`unimplemented!()\`, no \`TODO: fill in\`. Every function must have a working body.
- **All imports must be present and correct** for the target language at the top of the file. Do not assume ambient globals.
- **All names must be defined.** If you reference a helper, the helper exists in the same file (or is imported from a clearly-named standard library).
- **No dead code** and no commented-out alternatives ("// or you could do it this way"). Pick one approach and commit.
- **No unrealistic placeholders in values.** Do not use \`example.com\`, \`your-api-key-here\`, \`replace-me\`, \`foo\`, \`bar\`. Use realistic sample values (\`api.stripe.com\`, \`sk_test_51H...\` for illustrative secrets with an obvious \`test\` prefix, \`alice@acme.io\`).

## Structure
Order sections top-to-bottom in this sequence (skip sections the language doesn't have):
1. File header comment (1–3 sentences: what does this file do)
2. Imports / \`use\` / \`require\` / \`#include\`
3. Constants and configuration
4. Type definitions (interfaces, structs, enums, dataclasses)
5. Helper functions (private, bottom-up dependency order)
6. Main logic / exported functions / public API
7. Exports block (if the language has one)
8. Usage example — a \`main()\` function, \`if __name__ == "__main__"\` block, or commented example showing how to call the public API with realistic arguments

Separate sections with a blank line. Keep functions focused — aim for ≤ 30 lines per function; extract helpers when a function grows past that. Use consistent indentation per language convention (2 spaces for JS/TS/YAML/JSON; 4 spaces for Python/Rust/Go/Java).

## Language-Specific Conventions

### TypeScript / JavaScript
- Use ES module syntax (\`import\` / \`export\`), not CommonJS (\`require\`), unless the user explicitly asks for Node CommonJS.
- **Never use \`any\`.** Use \`unknown\` + narrowing, or define a proper type.
- Prefer \`interface\` for object shapes, \`type\` for unions and aliases.
- \`async\`/\`await\` for all asynchronous code. Never mix with raw \`.then()\` chains.
- Named exports preferred over default exports for libraries; default export is fine for single-entry-point modules.
- JSDoc for public functions: \`/** One-line summary. @param x description @returns description */\`.

### Python
- Target Python 3.10+.
- **Type hints on every function signature and return type.** Use \`list[str]\`, \`dict[str, int]\` (PEP 585), not \`typing.List\`.
- Docstrings in Google style: Summary line, blank line, \`Args:\`, \`Returns:\`, \`Raises:\`.
- Guard executable code with \`if __name__ == "__main__":\`.
- Prefer f-strings for formatting. Use \`pathlib.Path\` over raw \`os.path\`.
- Never catch bare \`except:\` — always specify the exception class.

### Rust
- Use \`Result<T, E>\` and \`?\` for error propagation. Never unwrap in library code; \`.expect("reason")\` is tolerable in examples with a real message.
- Derive \`Debug\` on public structs; derive \`Clone\`, \`PartialEq\`, \`Eq\` when semantically appropriate.
- Lifetimes only when the borrow checker requires them — don't add them defensively.
- Documentation comments: \`///\` for items, \`//!\` for module-level.
- Prefer iterator chains (\`.iter().map().filter().collect()\`) over imperative loops when they read clearly.

### Go
- **Check every \`error\` return.** \`if err != nil { return ... }\` — no silent drops.
- Exported names: \`PascalCase\`. Unexported: \`camelCase\`. Package names: short, lowercase, single word.
- Doc comments start with the name being documented: \`// Parse parses a config file and returns ...\`.
- Use \`context.Context\` as the first parameter for any function that does I/O or can be cancelled.

### SQL
- **Uppercase keywords** (\`SELECT\`, \`FROM\`, \`WHERE\`, \`JOIN\`, \`GROUP BY\`), lowercase identifiers (table and column names).
- One clause per line for non-trivial queries; indent \`JOIN\` conditions and subqueries.
- Explicit \`INNER JOIN\` / \`LEFT JOIN\` — never bare \`JOIN\` or comma-joins.
- Comment non-obvious joins or window functions with \`-- why this clause exists\`.

### Config Files (YAML / JSON / TOML / Dockerfile)
- Use realistic values — real image tags (\`postgres:16-alpine\`, not \`postgres:latest\`), real ports, real hostnames (\`db\`, \`redis\`, \`api\`).
- Comment non-obvious fields (YAML and TOML support comments; JSON does not — in JSON, pick sensible defaults and explain them in surrounding prose elsewhere, not inline).
- Dockerfiles: pin base image versions, combine related \`RUN\` steps, use multi-stage builds for compiled languages, set \`WORKDIR\` before copying.

### Shell / Bash
- First line: \`#!/usr/bin/env bash\`.
- Second line: \`set -euo pipefail\` (fail fast, error on unset vars, propagate pipe failures).
- Quote all variable expansions: \`"\${var}"\`, not \`$var\`.
- Use functions for reusable logic; use \`"\$@"\` to forward args.

## Documentation
- **Module-level header:** 1–3 sentences at the top of the file explaining what the file does and who would use it. Place it after the shebang (if any) and before imports.
- **Public functions:** documented with the language's native format — JSDoc for TS/JS, docstrings for Python, \`///\` for Rust, Go doc comments starting with the name.
- **Inline comments:** only for non-obvious logic. Explain *why*, not *what*. If the "what" isn't self-evident from the code, rename the variable or extract a helper instead of commenting.
- **Usage example:** at the bottom of the file, show how to use the public API with realistic arguments. For libraries, a commented-out example is fine. For scripts, use the appropriate \`main\` entry point.

## Anti-Patterns
- ❌ Missing \`language\` parameter on the tool call
- ❌ Wrong \`language\` value (e.g. \`javascript\` on a \`.ts\` file, or blank)
- ❌ Truncation: \`// ...\`, \`/* rest omitted */\`, \`# ... more code\`, trailing \`...\`
- ❌ Placeholder bodies: \`pass\`, \`todo!()\`, \`throw new Error("not implemented")\`, \`// TODO: implement\`
- ❌ Missing imports — referencing \`fetch\` in a Node script without importing it, using \`pd\` without \`import pandas as pd\`
- ❌ \`any\` in TypeScript
- ❌ Bare \`except:\` in Python, unwrapping \`Option\`/\`Result\` carelessly in Rust, ignoring \`error\` returns in Go
- ❌ Inconsistent naming within a single file (\`getUserName\` next to \`fetch_profile\`)
- ❌ No module-level description
- ❌ Dead code, commented-out alternatives, "or you could do it this way" branches
- ❌ Placeholder values: \`example.com\`, \`your-api-key-here\`, \`foo\`/\`bar\`
- ❌ Using \`application/code\` for runnable Python (use \`application/python\`), interactive HTML (use \`text/html\`), or React components (use \`application/react\`)
- ❌ Wrapping output in markdown fences (\` \`\`\`ts ... \`\`\` \`) — the content itself is the code, not a markdown document

## Self-Check Before Emitting
Ask yourself:
1. Is \`language\` set to the canonical Shiki name for this language?
2. Would this compile/run if pasted into a fresh project with its dependencies installed?
3. Is every function implemented — no stubs, no TODOs?
4. Does the file have a header comment and a usage example at the bottom?
5. Would a better artifact type serve the user (e.g. \`application/python\` for runnable Python)?

If any answer is "no", fix it before emitting.`,
  examples: [
    {
      label: "TypeScript utility module (debounce + throttle with full types)",
      code: `/**
 * Timing utilities: debounce and throttle.
 *
 * Debounce delays invocation until \`wait\` ms have passed since the last call.
 * Throttle caps invocation to at most once per \`wait\` ms window.
 */

export type AnyFn = (...args: unknown[]) => unknown

export interface Debounced<F extends AnyFn> {
  (...args: Parameters<F>): void
  cancel(): void
}

export interface Throttled<F extends AnyFn> {
  (...args: Parameters<F>): void
  cancel(): void
}

/**
 * Create a debounced version of \`fn\` that delays execution until \`wait\` ms
 * have elapsed since the last call.
 *
 * @param fn   The function to debounce.
 * @param wait Delay in milliseconds.
 * @returns    A debounced function with a \`cancel()\` method.
 */
export function debounce<F extends AnyFn>(fn: F, wait: number): Debounced<F> {
  let timer: ReturnType<typeof setTimeout> | null = null

  const debounced = (...args: Parameters<F>): void => {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      fn(...args)
    }, wait)
  }

  debounced.cancel = (): void => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  return debounced
}

/**
 * Create a throttled version of \`fn\` that runs at most once per \`wait\` ms.
 *
 * @param fn   The function to throttle.
 * @param wait Minimum interval between invocations in milliseconds.
 * @returns    A throttled function with a \`cancel()\` method.
 */
export function throttle<F extends AnyFn>(fn: F, wait: number): Throttled<F> {
  let lastCall = 0
  let timer: ReturnType<typeof setTimeout> | null = null

  const throttled = (...args: Parameters<F>): void => {
    const now = Date.now()
    const remaining = wait - (now - lastCall)

    if (remaining <= 0) {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      lastCall = now
      fn(...args)
    } else if (timer === null) {
      timer = setTimeout(() => {
        lastCall = Date.now()
        timer = null
        fn(...args)
      }, remaining)
    }
  }

  throttled.cancel = (): void => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  return throttled
}

// Usage example:
//   const logResize = debounce(() => console.log(window.innerWidth), 200)
//   window.addEventListener("resize", logResize)
//
//   const logScroll = throttle(() => console.log(window.scrollY), 100)
//   window.addEventListener("scroll", logScroll)`,
    },
    {
      label: "Python CSV statistics module (type hints, docstrings, main guard)",
      code: `"""CSV statistics: read a CSV, filter rows, compute per-column stats.

Reads a CSV file, optionally filters rows by a predicate, and returns
basic descriptive statistics (count, mean, min, max) for numeric columns.
"""

from __future__ import annotations

import csv
import statistics
from pathlib import Path
from typing import Callable


Row = dict[str, str]
Predicate = Callable[[Row], bool]


def read_csv(path: Path) -> list[Row]:
    """Read a CSV file into a list of row dictionaries.

    Args:
        path: Path to the CSV file. Must have a header row.

    Returns:
        List of rows as dicts keyed by column name.

    Raises:
        FileNotFoundError: If \`path\` does not exist.
    """
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return list(reader)


def filter_rows(rows: list[Row], predicate: Predicate) -> list[Row]:
    """Return only rows where \`predicate\` evaluates truthy."""
    return [row for row in rows if predicate(row)]


def column_stats(rows: list[Row], column: str) -> dict[str, float]:
    """Compute count, mean, min, and max for a numeric column.

    Args:
        rows:   Parsed CSV rows.
        column: Column name. Non-numeric values are skipped.

    Returns:
        Dict with keys \`count\`, \`mean\`, \`min\`, \`max\`. Empty dict if no
        numeric values were found.
    """
    values: list[float] = []
    for row in rows:
        raw = row.get(column, "").strip()
        if not raw:
            continue
        try:
            values.append(float(raw))
        except ValueError:
            continue

    if not values:
        return {}

    return {
        "count": float(len(values)),
        "mean": statistics.fmean(values),
        "min": min(values),
        "max": max(values),
    }


def main() -> None:
    """Example: load sales.csv, keep rows from 2026, print stats for \`amount\`."""
    rows = read_csv(Path("sales.csv"))
    recent = filter_rows(rows, lambda r: r.get("year", "") == "2026")
    stats = column_stats(recent, "amount")
    print(f"2026 sales — {stats}")


if __name__ == "__main__":
    main()`,
    },
  ],
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `bunx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "code\.ts|artifacts/index" | head -20`
Expected: No errors referencing `code.ts` or the artifacts index.

- [ ] **Step 4: Estimate token budget**

Run: `wc -c src/lib/prompts/artifacts/code.ts`
Expected: `rules` body is roughly 6,000–7,200 chars (≈ 1,500–1,800 tokens). If it's over ~7,500 chars, tighten the least-essential section (usually language-specific conventions).

- [ ] **Step 5: Commit**

```bash
git add src/lib/prompts/artifacts/code.ts
git commit -m "feat(artifacts): upgrade application/code prompt with structure, idioms, type-boundary rules"
```

---

## Task 2: Add `validateCode` to `_validate-artifact.ts`

**Files:**
- Modify: [src/lib/tools/builtin/_validate-artifact.ts:38-47](src/lib/tools/builtin/_validate-artifact.ts#L38-L47) — add dispatch branch
- Modify: [src/lib/tools/builtin/_validate-artifact.ts](src/lib/tools/builtin/_validate-artifact.ts) — append `validateCode` function at the bottom before `formatValidationError`

- [ ] **Step 1: Add dispatch branch**

Edit `validateArtifactContent`:

```ts
export function validateArtifactContent(
  type: string,
  content: string
): ArtifactValidationResult {
  if (type === "text/html") return validateHtml(content)
  if (type === "application/react") return validateReact(content)
  if (type === "image/svg+xml") return validateSvg(content)
  if (type === "application/mermaid") return validateMermaid(content)
  if (type === "application/code") return validateCode(content)
  return { ok: true, errors: [], warnings: [] }
}
```

- [ ] **Step 2: Append `validateCode` function**

Add this function below `validateMermaid` (or at the bottom of the file, above `formatValidationError`):

```ts
// ---------------------------------------------------------------------------
// Code validation
// ---------------------------------------------------------------------------

/**
 * Truncation / placeholder markers that indicate the LLM gave up partway.
 * These are looked for as substrings; each is chosen to be unlikely in real
 * code that is NOT a truncation marker.
 */
const CODE_TRUNCATION_MARKERS: ReadonlyArray<{ marker: RegExp; label: string }> = [
  { marker: /\/\/\s*\.{3,}\s*(rest|more|etc|remaining|omitted)/i, label: "// ... rest" },
  { marker: /\/\*\s*\.{3,}\s*(rest|more|etc|remaining|omitted).*?\*\//is, label: "/* ... rest */" },
  { marker: /#\s*\.{3,}\s*(rest|more|etc|remaining|omitted)/i, label: "# ... rest" },
  { marker: /\/\/\s*TODO:?\s*implement/i, label: "// TODO: implement" },
  { marker: /#\s*TODO:?\s*implement/i, label: "# TODO: implement" },
  { marker: /\/\/\s*implement (this|me)/i, label: "// implement this" },
  { marker: /throw new Error\(\s*["'`]not[ _-]?implemented["'`]/i, label: 'throw new Error("not implemented")' },
  { marker: /\bunimplemented!\s*\(/i, label: "unimplemented!()" },
  { marker: /\btodo!\s*\(/i, label: "todo!()" },
  { marker: /\bpass\s*#\s*(placeholder|implement|todo)/i, label: "pass  # placeholder" },
]

function validateCode(content: string): ArtifactValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  const trimmed = content.trim()

  if (!trimmed) {
    errors.push("Code content is empty.")
    return { ok: false, errors, warnings }
  }

  // Wrong-type guard: HTML document masquerading as code.
  // A real HTML file should use text/html so it renders in the iframe.
  if (/^\s*<!doctype\s+html/i.test(content) || /^\s*<html[\s>]/i.test(content)) {
    errors.push(
      "This looks like an HTML document. Use type 'text/html' so it renders in the preview iframe, not 'application/code'."
    )
    return { ok: false, errors, warnings }
  }

  // Wrong-type guard: markdown fence wrap — LLM treated content as markdown.
  if (/^\s*```/m.test(trimmed.split("\n")[0] ?? "")) {
    errors.push(
      "Remove the markdown code fences (```lang ... ```). The artifact content is the code itself — the renderer adds highlighting."
    )
    return { ok: false, errors, warnings }
  }

  // Truncation / placeholder warnings
  const hits: string[] = []
  for (const { marker, label } of CODE_TRUNCATION_MARKERS) {
    if (marker.test(content)) hits.push(label)
  }
  if (hits.length > 0) {
    warnings.push(
      `Detected likely truncation or placeholder markers: ${hits
        .slice(0, 3)
        .map((h) => `"${h}"`)
        .join(", ")}. Output the COMPLETE code with every function implemented.`
    )
  }

  // Size warning — 512KB
  if (content.length > 512 * 1024) {
    warnings.push(
      `Code content is ${Math.round(content.length / 1024)}KB — consider splitting into multiple files or trimming.`
    )
  }

  return { ok: errors.length === 0, errors, warnings }
}
```

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit -p tsconfig.json 2>&1 | grep "_validate-artifact" | head -20`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/tools/builtin/_validate-artifact.ts
git commit -m "feat(artifacts): validate application/code — catch truncation, placeholders, wrong-type HTML"
```

---

## Task 3: Validation Tests

**Files:**
- Check first: `ls src/lib/tools/builtin/__tests__/` and `ls src/lib/tools/builtin/*.test.ts 2>/dev/null` to see if there's an existing validator test file to extend.
- Create OR extend: the validator test file (follow whatever pattern is already in the repo — Bun test, Vitest, or Jest; inspect `package.json` scripts to confirm).

- [ ] **Step 1: Discover test framework and location**

Run:
```bash
grep -E '"test"' package.json
find src -name "*.test.ts" -path "*tools*" 2>/dev/null | head
find src -name "*validate*test*" 2>/dev/null
```
Expected: Identify the test runner (likely `bun test` or `vitest`) and whether an existing validator test file exists. Match its import style.

- [ ] **Step 2: Write tests**

Create `src/lib/tools/builtin/__tests__/_validate-artifact.code.test.ts` (adjust path/framework to match repo convention discovered in Step 1). Use this content, adapting the import/assertion syntax if the repo uses Vitest instead of Bun:

```ts
import { describe, it, expect } from "bun:test"
import { validateArtifactContent } from "../_validate-artifact"

const TS_GOOD = `/** Add two numbers. */
export function add(a: number, b: number): number {
  return a + b
}

// Usage:
//   add(2, 3) // => 5
`

const PY_GOOD = `"""Greeting helper."""

def greet(name: str) -> str:
    """Return a greeting for the given name."""
    return f"Hello, {name}!"


if __name__ == "__main__":
    print(greet("Alice"))
`

const RS_GOOD = `//! Simple key-value store wrapper around HashMap.

use std::collections::HashMap;

pub struct Store {
    inner: HashMap<String, String>,
}

impl Store {
    pub fn new() -> Self {
        Self { inner: HashMap::new() }
    }

    pub fn set(&mut self, key: String, value: String) {
        self.inner.insert(key, value);
    }

    pub fn get(&self, key: &str) -> Option<&String> {
        self.inner.get(key)
    }

    pub fn delete(&mut self, key: &str) -> Option<String> {
        self.inner.remove(key)
    }
}

// Example:
//   let mut s = Store::new();
//   s.set("k".into(), "v".into());
`

describe("validateArtifactContent — application/code", () => {
  it("accepts valid TypeScript", () => {
    const result = validateArtifactContent("application/code", TS_GOOD)
    expect(result.ok).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it("accepts valid Python", () => {
    const result = validateArtifactContent("application/code", PY_GOOD)
    expect(result.ok).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it("accepts valid Rust", () => {
    const result = validateArtifactContent("application/code", RS_GOOD)
    expect(result.ok).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it("rejects empty content", () => {
    const result = validateArtifactContent("application/code", "   \n  \n")
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toMatch(/empty/i)
  })

  it("rejects HTML document (wrong type)", () => {
    const result = validateArtifactContent(
      "application/code",
      "<!DOCTYPE html>\n<html><body>hi</body></html>"
    )
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toMatch(/text\/html/)
  })

  it("rejects markdown-fenced content", () => {
    const result = validateArtifactContent(
      "application/code",
      "```ts\nexport const x = 1\n```"
    )
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toMatch(/markdown code fences/i)
  })

  it("warns on truncation marker '// ... rest of implementation'", () => {
    const content = `export function big() {
  doStep1()
  // ... rest of implementation
}`
    const result = validateArtifactContent("application/code", content)
    expect(result.ok).toBe(true) // warning, not error
    expect(result.warnings.join(" ")).toMatch(/truncation|placeholder/i)
  })

  it("warns on '// TODO: implement'", () => {
    const content = `export function foo() {
  // TODO: implement
}`
    const result = validateArtifactContent("application/code", content)
    expect(result.ok).toBe(true)
    expect(result.warnings.join(" ")).toMatch(/truncation|placeholder/i)
  })

  it("warns on Rust 'unimplemented!()'", () => {
    const content = `pub fn compute() -> i32 {
    unimplemented!()
}`
    const result = validateArtifactContent("application/code", content)
    expect(result.ok).toBe(true)
    expect(result.warnings.join(" ")).toMatch(/truncation|placeholder/i)
  })
})
```

- [ ] **Step 3: Run tests**

Run: `bun test src/lib/tools/builtin/__tests__/_validate-artifact.code.test.ts` (or the equivalent Vitest command).
Expected: All 9 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/tools/builtin/__tests__/_validate-artifact.code.test.ts
git commit -m "test(artifacts): validateCode — good/bad TS, Python, Rust + wrong-type + truncation"
```

---

## Task 4: Manual smoke test with prompts

**Files:** none — interactive validation.

- [ ] **Step 1: Launch dev server**

Run: `bun run dev` (background).
Expected: App reachable at http://localhost:3000.

- [ ] **Step 2: Run each test prompt in a Code canvas session and check the checklist**

For each prompt below, open a chat, force-select Code canvas mode, paste the prompt, and verify the checklist items. Record PASS/FAIL in a scratch note.

Prompts:
1. **TypeScript:** "Create a TypeScript utility for debounce and throttle functions with proper types"
2. **Python:** "Create a Python module for reading CSV files, filtering rows, and computing column statistics"
3. **Rust:** "Create a Rust module for a simple key-value store using HashMap with get, set, delete operations"
4. **SQL:** "Create SQL queries to set up a blog database: users table, posts table, comments table, and a query to get all posts with comment counts"
5. **Config:** "Create a docker-compose.yml for a web app with nginx, node.js backend, postgres, and redis"
6. **Type-boundary (auto canvas mode, NOT forced Code):** "Write me a Python script that calculates fibonacci numbers and prints the first 20" — should route to `application/python`, not `application/code`. If it picks `application/code`, the type-boundary section of the rules needs strengthening.

Per-prompt checklist:
- [ ] `language` parameter set correctly
- [ ] No truncation markers, no placeholder bodies
- [ ] All imports present
- [ ] Structure: header → imports → types → logic → exports → usage example
- [ ] Language-appropriate idioms (types/hints/error handling)
- [ ] Module-level description present
- [ ] Usage example at bottom

- [ ] **Step 3: Record observations in plan doc (this file)**

Append a short "## Smoke Test Results" section to this plan file with PASS/FAIL per prompt and any failure modes observed. Commit.

```bash
git add docs/artifact-plans/batch5-code-quality-upgrade.md
git commit -m "docs(artifacts): batch5 smoke test results"
```

---

## Self-Review Checklist

- [x] Every task has exact file paths
- [x] Full replacement content for `code.ts` is inline (no "see above" placeholders)
- [x] `validateCode` function body is complete and callable
- [x] Test cases match the spec table (valid TS/Py/Rust, empty, HTML-wrong-type, truncation, TODO)
- [x] Token budget check included (Step 4 of Task 1)
- [x] Type-boundary rules explicit in prompt (decision table + rule-of-thumb)
- [x] `language` parameter enforcement lives in the prompt, not the schema, because the schema is shared across all artifact types and making it required would break other types
- [x] Each task ends with a commit

## Deliverables Summary

1. **Plan doc:** `docs/artifact-plans/batch5-code-quality-upgrade.md` (this file) ✅
2. **Updated:** `src/lib/prompts/artifacts/code.ts` — full rewrite + 2 examples
3. **Updated:** `src/lib/tools/builtin/_validate-artifact.ts` — `validateCode` branch
4. **New:** `src/lib/tools/builtin/__tests__/_validate-artifact.code.test.ts` — 9 tests
5. **Smoke test results** appended to this file after Task 4

## Top 3 Impactful Additions vs Current 2-Line Rules

1. **Type-boundary decision table** — tells the LLM when NOT to use `application/code` (executable Python → `application/python`, interactive HTML → `text/html`, React UI → `application/react`). The biggest current failure mode is misrouting runnable code to the display-only type.
2. **Anti-truncation + anti-placeholder rules with concrete examples** — backed up by runtime validator warnings on `// ... rest`, `TODO: implement`, `unimplemented!()`, `todo!()`, `throw new Error("not implemented")`. Catches the single most common quality failure.
3. **Language-specific idiom rules** — per-language sections for TS/Python/Rust/Go/SQL/config/shell with the non-obvious rules (no `any`, PEP 585 type hints, `?` operator, error checking, uppercase SQL keywords, `set -euo pipefail`). Makes the output feel written by a senior in that specific language instead of generic AI code.
