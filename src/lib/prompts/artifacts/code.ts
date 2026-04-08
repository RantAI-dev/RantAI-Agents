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
