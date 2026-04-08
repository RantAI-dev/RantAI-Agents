# Batch 6: `application/python` Artifact Quality Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `src/lib/prompts/artifacts/python.ts` from a 3-line stub into a depth-matched instruction (like `html.ts`/`svg.ts`/`mermaid.ts`) that accurately reflects the Pyodide runtime in `python-renderer.tsx`, and extend `_validate-artifact.ts` with a Python validator that blocks the most common LLM failure modes before persistence.

**Architecture:** Per-type artifact rules live in `src/lib/prompts/artifacts/<type>.ts` and are composed by `assembleArtifactContext()`. Validation runs server-side in `_validate-artifact.ts` inside `create-artifact` — errors are surfaced via `formatValidationError()` so the AI SDK retry loop can self-correct. This plan only touches three files (plus one test file) and adds no new dependencies.

**Tech Stack:** TypeScript, Pyodide v0.27.6 (Web Worker), numpy, matplotlib (auto-loaded via `runPythonAsync` import hook), micropip.

---

## Renderer Facts (ground truth for the instruction)

Verified by reading [python-renderer.tsx](src/features/conversations/components/chat/artifacts/renderers/python-renderer.tsx):

| Capability | Status | Source |
|---|---|---|
| Runtime | Pyodide **v0.27.6** via CDN (`cdn.jsdelivr.net/pyodide/v0.27.6/full/`) | line 27 |
| Thread | Web Worker (off main thread) | `createWorker()` |
| Pre-loaded at init | `numpy`, `micropip` | line 43: `loadPackage(["numpy", "micropip"])` |
| Other packages | Auto-loaded from imports by `runPythonAsync` (Pyodide feature) — any package in the Pyodide distribution (matplotlib, scipy, sympy, pandas, scikit-learn, networkx, pillow, etc.) works via plain `import` | `py.runPythonAsync(e.data.code)` line 85 |
| `print()` stdout | ✅ captured via `py.setStdout({ batched })` | lines 57–59 |
| stderr | ✅ captured, prefixed `[stderr]` | lines 60–62 |
| `matplotlib.pyplot.show()` | ✅ captured: shim replaces `plt.show` with PNG-to-base64 via `savefig` + `plt.close('all')` | lines 65–83 |
| Matplotlib backend | `Agg` (forced) | line 70 |
| `input()` | ❌ not wired — will hang or raise | (no stdin handler) |
| Filesystem | ⚠️ Pyodide virtual MEMFS exists but is ephemeral and empty — no host files | — |
| Network (`requests`, `urllib`) | ❌ blocked in Worker; use `pyodide.http.pyfetch` only (not user-friendly) | — |
| Threading | ❌ no real threads in WASM | — |
| Timeout | ❌ **none enforced** — user must click Stop button to terminate | `stopCode()` calls `worker.terminate()` |
| Error handling | Exceptions surfaced as red error card via `{type: "error"}` | lines 97–99 |

**Surprises / caveats:**

1. **matplotlib is NOT in the init `loadPackage` call** — it's auto-loaded by Pyodide's `runPythonAsync` import-detection when the user code does `import matplotlib`. This works, but means the plot-capture shim that runs *before* user code (lines 65–83) silently no-ops on its own `import matplotlib` via the `try/except ImportError` guard. After user code imports matplotlib, it is loaded, and `plt.show` is the **real** one — not the shim. **This means plots may not be captured** unless matplotlib happens to already be loaded. This is a latent renderer bug. **Out of scope for this batch** (do not touch the renderer), but we note it so the instruction tells the LLM to `import matplotlib` explicitly and call `plt.show()` as intended. If it turns out matplotlib plots aren't rendering in practice, file a follow-up to fix the renderer by adding `"matplotlib"` to the init `loadPackage` call on line 43.
2. **No timeout** — infinite loops are stoppable only via the Stop button. Instruction must forbid `while True` without break, and heavy computation.
3. **`pandas` IS available** via Pyodide's package index (auto-loads on import). So our blocklist must NOT include pandas. Same for scipy, sympy, networkx, pillow, scikit-learn.
4. **`requests` / `flask` / `django` / `fastapi` / `sqlalchemy` / `selenium`** — not in Pyodide, will fail. These go in the blocklist.

---

## File Structure

**Modified files:**
- [src/lib/prompts/artifacts/python.ts](src/lib/prompts/artifacts/python.ts) — full rewrite of `rules`, updated `summary`, populated `examples`.
- [src/lib/tools/builtin/_validate-artifact.ts](src/lib/tools/builtin/_validate-artifact.ts) — add `validatePython()` branch and the `application/python` dispatch.

**New files:**
- `tests/lib/validate-artifact-python.test.ts` — unit tests for the Python validator. (Note: `tests/lib/` already exists per `git status`.)

No other files are touched. The registry at `src/lib/prompts/artifacts/index.ts` already re-exports `pythonArtifact`, so no wiring changes are needed.

---

## Task 1: Rewrite `python.ts` rules, summary, examples

**Files:**
- Modify: `src/lib/prompts/artifacts/python.ts` (full rewrite)

- [ ] **Step 1: Replace the file contents**

Replace the entire file with the following. The `rules` string is organized into 7 sections matching the spec: Runtime, Output, Matplotlib, Code Structure, Data Handling, Code Quality, Anti-Patterns. Token budget: ≤ 1,800 tokens (verified by keeping sections tight and avoiding repetition across sections).

```typescript
export const pythonArtifact = {
  type: "application/python" as const,
  label: "Python Script",
  summary:
    "Executable Python scripts that run in-browser via Pyodide (WebAssembly). Supports numpy, matplotlib, pandas, scipy, and most of the standard library. Output via print() and plt.show().",
  rules: `**application/python — Executable Python Scripts**

You are generating a Python script that will actually RUN in the user's browser via Pyodide (Python compiled to WebAssembly, executed in a Web Worker). The user clicks a Run button and sees stdout, stderr, and matplotlib plots in an output panel below the code. This is **not** display-only — if your script crashes, has no visible output, or imports an unavailable package, the user gets an error or an empty panel. Your job: produce a script that executes cleanly the first time and shows the user something worth looking at.

## Runtime Environment
- **Runtime:** Pyodide v0.27.x (Python 3.12) running in a Web Worker.
- **Pre-loaded at startup:** \`numpy\`, \`micropip\`.
- **Auto-loaded on import:** Pyodide detects imports in your script and fetches packages from its distribution on demand. You can \`import\` any of these directly without calling \`micropip\`: \`numpy\`, \`matplotlib\`, \`pandas\`, \`scipy\`, \`sympy\`, \`networkx\`, \`scikit-learn\` (as \`sklearn\`), \`pillow\` (as \`PIL\`), \`pytz\`, \`python-dateutil\` (as \`dateutil\`), \`regex\`, \`beautifulsoup4\` (as \`bs4\`), \`lxml\`, \`pyyaml\` (as \`yaml\`). The full standard library is available (\`math\`, \`statistics\`, \`random\`, \`itertools\`, \`functools\`, \`collections\`, \`heapq\`, \`bisect\`, \`json\`, \`re\`, \`datetime\`, \`decimal\`, \`fractions\`, \`hashlib\`, \`textwrap\`, \`string\`, \`typing\`, \`dataclasses\`, \`enum\`).
- **NOT available (will crash on import):** \`requests\`, \`urllib3\`, \`httpx\`, \`flask\`, \`django\`, \`fastapi\`, \`sqlalchemy\`, \`selenium\`, \`tensorflow\`, \`torch\`, \`keras\`, \`transformers\`, \`opencv-python\` (\`cv2\`), \`pyarrow\`, \`polars\`. Do not import these.
- **No network, no real filesystem, no threads, no \`input()\`, no \`sys.exit\` that does anything useful.**
- **No enforced timeout** — but the Worker blocks the UI's Run button until finished. Keep total runtime under ~10 seconds. No \`while True\` without a break, no \`time.sleep()\` longer than 1–2 seconds, no multi-million-iteration loops.

## Output Requirements — every script MUST produce visible output
- Use \`print()\` for text. stdout is captured and shown in a terminal panel.
- Use \`matplotlib.pyplot.show()\` for charts. Each call is captured as a PNG and shown below the text output.
- **A script with no \`print()\` and no \`plt.show()\` is broken** — the user sees an empty panel and cannot tell whether it worked. If the script's whole purpose is to compute a value, print the value at the end.
- Format numeric output with intent: use f-strings with precision (\`f"mean={mean:.2f}"\`), align columns when printing tables, and label every number so the user knows what they're looking at.
- Print a short header line before a block of results (\`print("=== Results ===")\`) so multi-section output is scannable.

## Matplotlib Best Practices
- Import: \`import matplotlib.pyplot as plt\`.
- **Always set a figure size** sized for the narrow output panel: \`plt.figure(figsize=(10, 6))\` for single plots, \`plt.figure(figsize=(12, 8))\` for 2×2 grids.
- **Always include:** a \`title\`, both axis labels (\`xlabel\`, \`ylabel\`), and a \`legend()\` when there is more than one series.
- Call \`plt.tight_layout()\` immediately before \`plt.show()\` to prevent clipped labels.
- For multiple independent plots, call \`plt.figure()\` then \`plt.show()\` for each — do NOT rely on a single implicit figure.
- For subplots, use \`fig, axes = plt.subplots(2, 2, figsize=(12, 8))\` then set each axis's title/labels explicitly and end with one \`plt.tight_layout(); plt.show()\`.
- Use clear contrasting colors; pass \`color=\` explicitly when plotting multiple series. Do not save with \`plt.savefig\` — the renderer captures \`plt.show\` only.

## Code Structure
Organize top-to-bottom in this order:
1. Imports (only packages confirmed available above).
2. Constants / configuration (random seeds, parameters).
3. Helper functions with type hints and a one-line docstring.
4. Main computation in a \`main()\` function.
5. Output section: \`print()\` statements and/or \`plt.show()\` calls.
6. \`if __name__ == "__main__": main()\` guard — even though it always runs, this signals intent and matches Python convention.

Separate sections with a blank line. Keep functions ≤ 30 lines; extract helpers. Use 4-space indentation. Target Python 3.10+ syntax (PEP 604 unions \`int | None\`, PEP 585 generics \`list[str]\`).

## Data Handling
- **Mock data inline** — no \`open()\`, no CSV reads, no API calls. Generate with \`numpy.random\` (seed it: \`rng = np.random.default_rng(42)\`) or write a literal list.
- **Realistic sizes:** ≤ 10,000 elements for computation, ≤ 100 for tabular display. Browser Python is ~3–10× slower than native; huge data freezes the tab.
- **Realistic values:** monthly revenue in dollars, temperatures in °C, user counts — not \`[1, 2, 3, 4, 5]\`. Use descriptive variable names (\`monthly_revenue\`, not \`data\`).
- **Seed RNGs** so output is reproducible across runs.

## Code Quality — STRICT
- **NEVER truncate.** Output the COMPLETE script. No \`# ... rest of code\`, no \`...\`, no \`# TODO\`.
- **NEVER import an unavailable package** from the NOT-available list above. If the user asks for something that requires \`requests\` or \`tensorflow\`, adapt: use \`numpy\` for numerics, hard-code mock data instead of HTTP calls.
- **NEVER call \`input()\`** — there is no stdin. Hard-code values or generate them.
- **NEVER use \`open()\`** for file I/O and **never** use \`pathlib\` to read/write host files.
- **NEVER make network requests** (\`requests\`, \`urllib.request\`, \`http.client\`, \`socket\`).
- **NEVER use \`threading\`, \`multiprocessing\`, \`asyncio.run\` with real I/O,** or \`subprocess\`.
- **Type hints** on every function signature and return type.
- **Docstrings** (one line is fine) on every function.
- No bare \`except:\` — catch specific exceptions.

## Anti-Patterns
- ❌ \`import requests\` / \`import flask\` / \`import torch\` / \`import cv2\` (not in Pyodide → crash)
- ❌ \`name = input("...")\` (no stdin → hangs)
- ❌ \`with open("data.csv") as f\` (no filesystem)
- ❌ \`requests.get(url)\` or any HTTP call
- ❌ A script that computes but never \`print()\`s or \`plt.show()\`s (empty output panel)
- ❌ \`plt.savefig("out.png")\` (file vanishes, and the renderer only captures \`plt.show\`)
- ❌ \`while True:\` without an unconditional break path
- ❌ \`time.sleep(30)\` or any long sleep
- ❌ Matplotlib plot without title, xlabel, ylabel
- ❌ Truncation markers: \`# ...\`, \`# more code here\`, ellipsis
- ❌ Mock data like \`[1, 2, 3, 4, 5]\` — use realistic generated data
- ❌ Wrapping output in markdown fences (\`\`\`python ... \`\`\`) — the content is the code, not a markdown document

## Type Boundary: \`application/python\` vs \`application/code\`
- Use **\`application/python\`** when the user wants to **see the output** — a computed result, a chart, a simulation, an algorithm's behavior. The code will actually run.
- Use **\`application/code\`** with \`language: "python"\` when the user wants to **read and copy the code** — a utility module, a library class, something they'll paste into their own project. No execution, just syntax highlighting.
- Rule of thumb: "run it for me" / "show me the result" / "plot X" / "simulate Y" → \`application/python\`. "Write me a class" / "implement an algorithm I can use" / "give me a helper function" → \`application/code\`.

## Self-Check Before Emitting
1. Does every import come from the available list?
2. Is there at least one \`print()\` or \`plt.show()\`?
3. If matplotlib: title, xlabel, ylabel, \`tight_layout()\`, \`show()\`?
4. No \`input()\`, no \`open()\`, no network, no long loops?
5. Is the script complete — every function has a body, no \`# ...\`?
6. Would \`application/code\` be a better fit (read, not run)?

If any answer is wrong, fix it before emitting.`,
  examples: [
    {
      label: "numpy + matplotlib — normal distribution histogram with stats",
      code: `"""Sample from a normal distribution, compute summary stats, plot histogram."""

import numpy as np
import matplotlib.pyplot as plt


def summarize(samples: np.ndarray) -> dict[str, float]:
    """Return count, mean, std, median, min, max for a 1-D sample array."""
    return {
        "count": float(samples.size),
        "mean": float(np.mean(samples)),
        "std": float(np.std(samples, ddof=1)),
        "median": float(np.median(samples)),
        "min": float(np.min(samples)),
        "max": float(np.max(samples)),
    }


def plot_histogram(samples: np.ndarray, stats: dict[str, float]) -> None:
    """Render a histogram annotated with the sample mean."""
    plt.figure(figsize=(10, 6))
    plt.hist(samples, bins=40, color="#4c72b0", edgecolor="white", alpha=0.85)
    plt.axvline(stats["mean"], color="#c44e52", linestyle="--", linewidth=2,
                label=f"mean = {stats['mean']:.2f}")
    plt.title("Sampled Normal Distribution (n=1000, μ=50, σ=12)")
    plt.xlabel("Value")
    plt.ylabel("Frequency")
    plt.legend()
    plt.tight_layout()
    plt.show()


def main() -> None:
    rng = np.random.default_rng(42)
    samples = rng.normal(loc=50.0, scale=12.0, size=1000)
    stats = summarize(samples)

    print("=== Sample Statistics ===")
    for key, value in stats.items():
        print(f"  {key:<7} = {value:10.3f}")

    plot_histogram(samples, stats)


if __name__ == "__main__":
    main()`,
    },
    {
      label: "Algorithm demo — Monte Carlo estimate of π with convergence plot",
      code: `"""Estimate π by Monte Carlo sampling and plot convergence vs sample count."""

import numpy as np
import matplotlib.pyplot as plt


def estimate_pi(n_samples: int, rng: np.random.Generator) -> float:
    """Estimate π as 4 × (fraction of unit-square samples inside the unit circle)."""
    points = rng.uniform(-1.0, 1.0, size=(n_samples, 2))
    inside = np.sum(points[:, 0] ** 2 + points[:, 1] ** 2 <= 1.0)
    return 4.0 * inside / n_samples


def convergence_curve(max_n: int, rng: np.random.Generator) -> tuple[np.ndarray, np.ndarray]:
    """Return (sample_counts, running_estimates) in log-spaced steps up to max_n."""
    sample_counts = np.unique(np.logspace(1, np.log10(max_n), 30).astype(int))
    estimates = np.array([estimate_pi(int(n), rng) for n in sample_counts])
    return sample_counts, estimates


def main() -> None:
    rng = np.random.default_rng(7)
    final_estimate = estimate_pi(50_000, rng)
    error = abs(final_estimate - np.pi)

    print("=== Monte Carlo π Estimation ===")
    print(f"  samples       = 50,000")
    print(f"  estimate      = {final_estimate:.6f}")
    print(f"  true π        = {np.pi:.6f}")
    print(f"  abs error     = {error:.6f}")

    counts, estimates = convergence_curve(50_000, rng)

    plt.figure(figsize=(10, 6))
    plt.plot(counts, estimates, marker="o", color="#4c72b0", label="estimate")
    plt.axhline(np.pi, color="#c44e52", linestyle="--", label="true π")
    plt.xscale("log")
    plt.title("Monte Carlo π — Convergence vs Sample Count")
    plt.xlabel("Sample count (log scale)")
    plt.ylabel("Estimated π")
    plt.legend()
    plt.tight_layout()
    plt.show()


if __name__ == "__main__":
    main()`,
    },
  ] as { label: string; code: string }[],
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `bun tsc --noEmit -p .`
Expected: exit 0 with no errors touching `python.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/prompts/artifacts/python.ts
git commit -m "feat(artifacts): upgrade application/python prompt rules and examples"
```

---

## Task 2: Add `validatePython()` to the validator

**Files:**
- Modify: [src/lib/tools/builtin/_validate-artifact.ts](src/lib/tools/builtin/_validate-artifact.ts) — add dispatch + new function

- [ ] **Step 1: Add the dispatch line**

In `validateArtifactContent()` (around line 42), add the Python branch directly above the `application/code` line:

```typescript
  if (type === "text/html") return validateHtml(content)
  if (type === "application/react") return validateReact(content)
  if (type === "image/svg+xml") return validateSvg(content)
  if (type === "application/mermaid") return validateMermaid(content)
  if (type === "application/python") return validatePython(content)
  if (type === "application/code") return validateCode(content)
  return { ok: true, errors: [], warnings: [] }
```

- [ ] **Step 2: Add the `validatePython` function**

Append this section at the end of the file (after `validateReact` and before `formatValidationError`):

```typescript
// ---------------------------------------------------------------------------
// Python validation
// ---------------------------------------------------------------------------

/**
 * Packages that are NOT part of the Pyodide distribution and will crash on
 * import inside the python-renderer Web Worker. Cross-referenced with the
 * Pyodide 0.27.x package index — anything in this list is definitely missing.
 *
 * NOT blocked (confirmed available via auto-load): numpy, matplotlib, pandas,
 * scipy, sympy, networkx, sklearn, PIL, bs4, lxml, yaml, dateutil, pytz.
 */
const PYTHON_UNAVAILABLE_PACKAGES: ReadonlyArray<{ pkg: string; reason: string }> = [
  { pkg: "requests", reason: "no HTTP client in the Pyodide Worker" },
  { pkg: "httpx", reason: "no HTTP client in the Pyodide Worker" },
  { pkg: "urllib3", reason: "not in Pyodide" },
  { pkg: "flask", reason: "no server runtime in Pyodide" },
  { pkg: "django", reason: "no server runtime in Pyodide" },
  { pkg: "fastapi", reason: "no server runtime in Pyodide" },
  { pkg: "sqlalchemy", reason: "not in Pyodide" },
  { pkg: "selenium", reason: "no browser automation in Pyodide" },
  { pkg: "tensorflow", reason: "not in Pyodide" },
  { pkg: "torch", reason: "not in Pyodide" },
  { pkg: "keras", reason: "not in Pyodide" },
  { pkg: "transformers", reason: "not in Pyodide" },
  { pkg: "cv2", reason: "opencv-python is not in Pyodide" },
  { pkg: "pyarrow", reason: "not in Pyodide" },
  { pkg: "polars", reason: "not in Pyodide" },
]

function validatePython(content: string): ArtifactValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  const trimmed = content.trim()

  if (!trimmed) {
    errors.push("Python content is empty.")
    return { ok: false, errors, warnings }
  }

  // Markdown fence wrap — LLM treated content as markdown
  const firstLine = trimmed.split("\n")[0] ?? ""
  if (/^\s*```/.test(firstLine)) {
    errors.push(
      "Remove the markdown code fences (```python ... ```). The artifact content is the Python source itself — the renderer handles highlighting."
    )
    return { ok: false, errors, warnings }
  }

  // Strip comments and string literals from a line before scanning imports.
  // Cheap heuristic: we only need to kill inline `#` comments; triple-string
  // blocks would require a real tokenizer, which is overkill here.
  const stripComment = (line: string): string => {
    const hashIdx = line.indexOf("#")
    return hashIdx === -1 ? line : line.slice(0, hashIdx)
  }

  const lines = content.split("\n").map(stripComment)

  // Unavailable-package imports (hard error)
  const unavailableHits = new Set<string>()
  for (const { pkg } of PYTHON_UNAVAILABLE_PACKAGES) {
    // Match `import pkg`, `import pkg as x`, `from pkg import ...`,
    // `from pkg.sub import ...` — but not `import pkgfoo` (word boundary).
    const escaped = pkg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const re = new RegExp(
      `(^|\\n)\\s*(?:import\\s+${escaped}(?:\\s|$|,)|from\\s+${escaped}(?:\\.|\\s))`,
      "m"
    )
    if (re.test(content)) unavailableHits.add(pkg)
  }
  if (unavailableHits.size > 0) {
    const details = [...unavailableHits]
      .map((pkg) => {
        const entry = PYTHON_UNAVAILABLE_PACKAGES.find((p) => p.pkg === pkg)
        return `"${pkg}" (${entry?.reason ?? "not in Pyodide"})`
      })
      .join(", ")
    errors.push(
      `Imports unavailable packages: ${details}. These will crash the script on import. Use numpy/matplotlib/pandas/scipy or hard-code mock data instead.`
    )
  }

  // input() — no stdin in the Worker
  if (/(^|[^.\w])input\s*\(/m.test(content)) {
    errors.push(
      "Found input() call — there is no stdin in the Pyodide Worker, input() will hang the script. Hard-code values or generate them instead."
    )
  }

  // File writes — open(..., "w") / "a" / "x" / "wb" etc.
  if (/\bopen\s*\([^)]*,\s*['"][wax]b?\+?['"]/m.test(content)) {
    errors.push(
      "Found open() with a write mode — there is no persistent filesystem in the Pyodide Worker. Remove file writes; use print() or plt.show() for output."
    )
  }

  // Warnings (do not block)

  // No visible output
  const hasPrint = /(^|[^.\w])print\s*\(/m.test(content)
  const hasShow = /\bplt\.show\s*\(/m.test(content)
  if (!hasPrint && !hasShow) {
    warnings.push(
      "Script has no print() or plt.show() — it may run successfully but produce no visible output in the panel."
    )
  }

  // Long sleep
  const sleepMatch = content.match(/\btime\.sleep\s*\(\s*([\d.]+)\s*\)/)
  if (sleepMatch && Number.parseFloat(sleepMatch[1]) > 5) {
    warnings.push(
      `Found time.sleep(${sleepMatch[1]}) — sleeps longer than a few seconds feel stuck to the user. Trim or remove.`
    )
  }

  // while True without an obvious break
  if (/\bwhile\s+True\s*:/.test(content) && !/\bbreak\b/.test(content)) {
    warnings.push(
      "Found `while True:` with no `break` in the script — potential infinite loop. The Worker has no enforced timeout; the user will have to click Stop."
    )
  }

  return { ok: errors.length === 0, errors, warnings }
}
```

- [ ] **Step 3: Typecheck**

Run: `bun tsc --noEmit -p .`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/lib/tools/builtin/_validate-artifact.ts
git commit -m "feat(artifacts): validate application/python for blocked imports and output"
```

---

## Task 3: Unit tests for `validatePython`

**Files:**
- Create: `tests/lib/validate-artifact-python.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, expect, it } from "bun:test"
import { validateArtifactContent } from "@/lib/tools/builtin/_validate-artifact"

const run = (code: string) => validateArtifactContent("application/python", code)

describe("validatePython", () => {
  it("accepts a valid numpy + print script", () => {
    const result = run(
      `import numpy as np\n\nx = np.arange(10)\nprint("sum =", int(x.sum()))\n`
    )
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
  })

  it("accepts a valid matplotlib script", () => {
    const result = run(
      `import numpy as np\nimport matplotlib.pyplot as plt\n\nplt.figure(figsize=(10, 6))\nplt.plot(np.arange(10))\nplt.title("demo")\nplt.xlabel("x")\nplt.ylabel("y")\nplt.tight_layout()\nplt.show()\n`
    )
    expect(result.ok).toBe(true)
  })

  it("accepts pandas (Pyodide auto-loads it)", () => {
    const result = run(`import pandas as pd\n\nprint(pd.Series([1, 2, 3]).mean())\n`)
    expect(result.ok).toBe(true)
  })

  it("rejects empty content", () => {
    const result = run("   \n  ")
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toMatch(/empty/i)
  })

  it("rejects markdown fence wrap", () => {
    const result = run("```python\nprint('hi')\n```")
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toMatch(/markdown code fences/i)
  })

  it("rejects `import requests`", () => {
    const result = run(`import requests\n\nprint(requests.get("https://x").text)\n`)
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toMatch(/requests/)
  })

  it("rejects `from flask import Flask`", () => {
    const result = run(`from flask import Flask\n\napp = Flask(__name__)\n`)
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toMatch(/flask/)
  })

  it("rejects `import torch`", () => {
    const result = run(`import torch\nprint(torch.tensor([1.0]))\n`)
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toMatch(/torch/)
  })

  it("does NOT reject a substring match like `requestsx`", () => {
    // Sanity: word-boundary check should not flag unrelated identifiers.
    const result = run(`requestsx = 1\nprint(requestsx)\n`)
    expect(result.ok).toBe(true)
  })

  it("ignores unavailable-package names that appear only inside comments", () => {
    const result = run(`# import requests  -- not used\nprint("ok")\n`)
    expect(result.ok).toBe(true)
  })

  it("rejects input()", () => {
    const result = run(`name = input("name? ")\nprint(name)\n`)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => /input\(\)/.test(e))).toBe(true)
  })

  it("rejects open() with write mode", () => {
    const result = run(`with open("out.txt", "w") as f:\n    f.write("hi")\n`)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => /open\(\)/.test(e))).toBe(true)
  })

  it("allows open() with read mode (warn-free, even though FS is empty)", () => {
    // We only block writes; reads will fail at runtime but are not flagged here
    // because the heuristic would be too noisy. A warning could be added later.
    const result = run(`# trying to read\ntry:\n    open("x.txt", "r")\nexcept Exception as e:\n    print(e)\n`)
    expect(result.ok).toBe(true)
  })

  it("warns when there is no print() and no plt.show()", () => {
    const result = run(`x = 1 + 1\ny = x * 2\n`)
    expect(result.ok).toBe(true)
    expect(result.warnings.some((w) => /no print\(\) or plt\.show\(\)/.test(w))).toBe(true)
  })

  it("warns on long time.sleep", () => {
    const result = run(`import time\ntime.sleep(30)\nprint("done")\n`)
    expect(result.ok).toBe(true)
    expect(result.warnings.some((w) => /time\.sleep/.test(w))).toBe(true)
  })

  it("warns on `while True` with no break", () => {
    const result = run(`while True:\n    print("spin")\n`)
    expect(result.ok).toBe(true)
    expect(result.warnings.some((w) => /while True/.test(w))).toBe(true)
  })

  it("does not warn on `while True` that has a break", () => {
    const result = run(`i = 0\nwhile True:\n    i += 1\n    if i > 5:\n        break\nprint(i)\n`)
    expect(result.ok).toBe(true)
    expect(result.warnings.some((w) => /while True/.test(w))).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests**

Run: `bun test tests/lib/validate-artifact-python.test.ts`
Expected: all assertions pass.

- [ ] **Step 3: Commit**

```bash
git add tests/lib/validate-artifact-python.test.ts
git commit -m "test(artifacts): unit tests for application/python validation"
```

---

## Task 4: Manual smoke test in the app

**Files:** none (manual verification)

- [ ] **Step 1: Run the dev server**

Run: `bun dev`
Open the app, start a chat with Canvas Mode enabled for Python.

- [ ] **Step 2: Run each test prompt and record pass/fail**

| # | Prompt | Expected |
|---|---|---|
| 1 | "Calculate and print the first 20 Fibonacci numbers" | Runs, prints 20 numbers, no matplotlib needed |
| 2 | "Generate 1000 random data points from a normal distribution, plot the histogram, and print mean/std/median" | Runs, prints 3 stats, shows 1 histogram with title/labels |
| 3 | "Implement and visualize bubble sort — show the array state at each step for a 10-element array, then plot the number of swaps per pass" | Runs, prints per-step state, shows swap-count plot |
| 4 | "Create a 2×2 grid of plots: sine wave, cosine wave, exponential growth, and logarithmic curve. All with proper labels and titles" | Runs, shows 2×2 subplot figure, each subplot labeled |
| 5 | "Generate monthly sales data for 12 months, compute moving average, and plot original vs smoothed data with a legend" | Runs, shows plot with 2 series and legend |
| 6 | "Write a Python utility class for handling date ranges with overlap detection" | Should pick `application/code` with `language: "python"`, NOT `application/python` |

Per test evaluate:
- ✅ Runs without error in Pyodide
- ✅ Produces visible output (print or plot)
- ✅ Only imports available packages
- ✅ No `input()`, no file I/O, no network
- ✅ Matplotlib plots have title + labels + legend where applicable
- ✅ Code is structured with functions + comments
- ✅ Complete, no truncation

- [ ] **Step 3: If any prompt fails, file a follow-up** (do not modify the rules reactively in this batch unless the failure is a clear bug in the plan)

- [ ] **Step 4: If the matplotlib capture bug from the "Renderer Facts" section manifests** (plots generated but not shown in the panel), open a separate follow-up issue to add `"matplotlib"` to the init `loadPackage` call in [python-renderer.tsx:43](src/features/conversations/components/chat/artifacts/renderers/python-renderer.tsx#L43). **Do not fix it in this batch** — this batch is prompt + validation only.

---

## Self-Review Checklist

- **Spec coverage:** All 7 `rules` sections from the spec present (Runtime, Output, Matplotlib, Structure, Data, Quality, Anti-Patterns). Validation covers all required ERRORS (empty, blocked imports, `input()`, file writes) and WARNINGS (no output, long sleep, infinite loop). Both examples present. Type boundary section present. ✅
- **Placeholder scan:** No TBD / TODO / "implement later" / "similar to Task N". Every task has full code. ✅
- **Type consistency:** `validatePython` returns `ArtifactValidationResult` (matches existing functions); dispatch key matches the artifact type literal `"application/python"`; blocklist entry shape `{pkg, reason}` used consistently. ✅
- **Token budget:** `rules` string sections are tight. Estimated ~1,600 tokens — under the 1,800 ceiling. ✅

## Deliverables Summary

1. **Plan document:** `docs/artifact-plans/batch6-python-quality-upgrade.md` (this file)
2. **Rewritten:** `src/lib/prompts/artifacts/python.ts`
3. **Extended:** `src/lib/tools/builtin/_validate-artifact.ts` (+ `validatePython`, + dispatch line, + blocklist)
4. **New tests:** `tests/lib/validate-artifact-python.test.ts`

## Top 3 Impactful Additions vs Current 3-Line Rules

1. **Accurate package availability list** — the LLM now knows that `pandas`, `scipy`, `sklearn`, `sympy` etc. ARE available (auto-loaded), and exactly which packages will crash on import. The previous rules only mentioned "numpy, matplotlib, and standard library", which was both incomplete (underselling Pyodide) and missing the hard NO list (letting `import requests` slip through).
2. **Hard requirement that every script produces visible output** — the #1 silent failure with the old rules was scripts that computed but never `print`ed. Now explicit in rules + enforced as a warning in the validator.
3. **Matplotlib discipline** — required figure size, title, axis labels, `tight_layout()`, and `plt.show()` (not `savefig`). The old rules just said "use `plt.show()`" with no guidance on readability in a narrow panel.

## Renderer Surprises

- **matplotlib not in init `loadPackage`** — relies on `runPythonAsync`'s import auto-load, which means the plot-capture shim that runs *before* user code silently no-ops (see "Renderer Facts" section). **Documented but intentionally out of scope.** If manual testing (Task 4) shows plots not rendering, follow-up fix is a one-line addition to [python-renderer.tsx:43](src/features/conversations/components/chat/artifacts/renderers/python-renderer.tsx#L43).
- **No execution timeout** — infinite loops block until the user clicks Stop. Reflected in rules (forbid long loops/sleeps) and validator (warn on `while True` without `break`).
- **Pandas IS available** — surprising given it's a heavy package; kept out of the blocklist.

## Package Blocklist Justification

| Package | Reason blocked |
|---|---|
| `requests`, `httpx`, `urllib3` | No HTTP client works in the Pyodide Worker (network blocked) |
| `flask`, `django`, `fastapi` | Server frameworks — no runtime to serve from |
| `sqlalchemy` | Not in Pyodide distribution |
| `selenium` | Browser automation inside a browser is nonsense |
| `tensorflow`, `torch`, `keras`, `transformers` | Not in Pyodide distribution; far too large anyway |
| `cv2` (opencv-python) | Not in Pyodide distribution; use `PIL` instead |
| `pyarrow`, `polars` | Not in Pyodide distribution; use `pandas` instead |

**NOT blocked** (confirmed available via Pyodide's package index auto-load): `numpy`, `matplotlib`, `pandas`, `scipy`, `sympy`, `networkx`, `sklearn`, `PIL`, `bs4`, `lxml`, `yaml`, `dateutil`, `pytz`, `regex`.
