export const pythonArtifact = {
  type: "application/python" as const,
  label: "Python Notebook",
  summary:
    "Jupyter-like notebook executed cell-by-cell in Pyodide (WebAssembly). CONTENT MUST BE A JSON OBJECT shaped {\"cells\":[{\"type\":\"code\"|\"markdown\",\"source\":\"...\"}, ...]} — never a bare Python script. Kernel state persists across cells. numpy/matplotlib/pandas/scipy/sklearn auto-load. Output via print(), DataFrame display, plt.show().",
  rules: `**application/python — Jupyter-like Python Notebooks**

You are generating a notebook that will RUN in the user's browser via Pyodide (Python 3.12 in WebAssembly, executed in a Web Worker). The user runs cells independently and sees per-cell output: stdout, errors, plots, and DataFrame tables. Kernel globals persist across cells so cell N can use variables defined in cell N-1.

## Output Format — STRICT

You MUST emit a JSON object with this exact shape:

\`\`\`json
{
  "cells": [
    { "type": "markdown", "source": "# Title\\n\\nIntro paragraph." },
    { "type": "code",     "source": "import numpy as np\\nrng = np.random.default_rng(42)" },
    { "type": "code",     "source": "samples = rng.normal(0, 1, 1000)\\nprint(samples.mean())" }
  ]
}
\`\`\`

- **Top-level key MUST be \`cells\`** — an array of objects.
- Each cell has \`type\` (\`"code"\` or \`"markdown"\`) and \`source\` (string).
- Do NOT include \`outputs\`, \`executionCount\`, or \`id\` — those are runtime fields.
- Do NOT wrap the JSON in markdown fences.
- Do NOT include any prose outside the JSON.

## Cell-Splitting Rules

- **Split logically** — imports in one cell, data setup in another, computation in another, plotting in another.
- **One concept per cell.** A cell that imports, fetches, computes, prints, and plots is too big — split it.
- **Markdown cells between code** to explain what the next cell does — like a Jupyter notebook for teaching.
- **Single-cell notebooks are valid** when the task is small (e.g., "show me a histogram of normal samples"), but multi-cell is preferred for anything with distinct phases.

## Runtime Environment
- **Runtime:** Pyodide v0.28.x (Python 3.12) running in a persistent Web Worker.
- **Kernel persists:** Variables, imports, and functions defined in earlier cells are available in later cells.
- **Pre-loaded at startup:** \`numpy\`, \`micropip\`, \`matplotlib\`, \`scikit-learn\` (as \`sklearn\`).
- **Auto-loaded on import:** \`pandas\`, \`scipy\`, \`sympy\`, \`networkx\`, \`pillow\` (as \`PIL\`), \`pytz\`, \`python-dateutil\` (as \`dateutil\`), \`regex\`, \`beautifulsoup4\` (as \`bs4\`), \`lxml\`, \`pyyaml\` (as \`yaml\`). Full standard library.
- **NOT available:** \`requests\`, \`urllib3\`, \`httpx\`, \`flask\`, \`django\`, \`fastapi\`, \`sqlalchemy\`, \`selenium\`, \`tensorflow\`, \`torch\`, \`keras\`, \`transformers\`, \`opencv-python\` (\`cv2\`), \`pyarrow\`, \`polars\`. Do not import these.
- **No network, no real filesystem, no \`input()\`, no threads.**
- **Per-cell timeout: 30 seconds.** Worker is forcibly terminated past that and the kernel must be restarted by the user.

## Output Conventions Per Cell
- **Code cells SHOULD produce visible output** — \`print()\`, \`plt.show()\`, or a final-line expression (Jupyter "last expression" auto-display, e.g. a bare \`df\` to show a DataFrame).
- **DataFrame display:** the renderer detects \`pandas.DataFrame\` final-line expressions and renders them as HTML tables. \`print(df)\` works too but produces text.
- **Matplotlib:** \`import matplotlib.pyplot as plt\`, set \`plt.figure(figsize=(10, 6))\`, always include \`title\`, \`xlabel\`, \`ylabel\`, end with \`plt.tight_layout(); plt.show()\`. Each \`plt.show()\` emits one inline PNG below the cell.
- **A computation-only cell with no print/show/last-expression is fine** if it's just setup (imports, function defs).

## Markdown Cells
- Use for section headers, explanations, formulas. Standard markdown syntax: \`#\`, \`##\`, lists, fenced code, tables, LaTeX (\`$x^2$\` inline, \`$$...$$\` block).
- Keep them tight — 1–3 paragraphs max. Notebook reads top-to-bottom; long prose belongs in \`text/document\`.

## Code Quality — STRICT (per cell)
- **Complete code only** — no \`# ...\`, no \`# TODO\`, no truncation.
- **Never import unavailable packages** from the NOT-available list.
- **Never call \`input()\`** — there is no stdin.
- **Never use \`open()\`** for file I/O.
- **Never make network requests.**
- Type hints on function signatures.
- One-line docstrings on functions.
- No bare \`except:\`.
- 4-space indent, Python 3.10+ syntax (PEP 604 \`int | None\`, PEP 585 \`list[str]\`).

## Data Handling
- Mock data inline with \`numpy.random\` (always seed: \`rng = np.random.default_rng(42)\`).
- ≤ 10,000 elements for computation, ≤ 100 rows for tabular display.
- Realistic values and names — \`monthly_revenue\`, not \`data\`.

## Type Boundary: \`application/python\` vs \`application/code\`
- Use **\`application/python\`** when the user wants to **run code and see output** — exploratory analysis, charts, simulations, "show me X". The model emits a notebook.
- Use **\`application/code\`** with \`language: "python"\` when the user wants to **read and copy** a self-contained module/class. No execution.

## Self-Check Before Emitting
1. Top-level JSON has \`cells\` array? No surrounding prose or fences?
2. Every code cell uses only available imports?
3. Logical cells — does each one do one clear thing?
4. At least one cell produces visible output (print/plot/last-expression)?
5. No \`input()\`, no \`open()\`, no network?

If any answer is wrong, fix it before emitting.`,
  examples: [
    {
      label: "Multi-cell — normal distribution analysis with stats and histogram",
      code: JSON.stringify({
        cells: [
          { type: "markdown", source: "# Normal Distribution Analysis\n\nSample 1,000 values from N(50, 12), summarize, and plot." },
          { type: "code", source: "import numpy as np\nimport matplotlib.pyplot as plt\n\nrng = np.random.default_rng(42)\nsamples = rng.normal(loc=50.0, scale=12.0, size=1000)" },
          { type: "markdown", source: "## Summary statistics" },
          { type: "code", source: "stats = {\n    'count': samples.size,\n    'mean': float(np.mean(samples)),\n    'std': float(np.std(samples, ddof=1)),\n    'median': float(np.median(samples)),\n}\nfor k, v in stats.items():\n    print(f'{k:<7} = {v:10.3f}')" },
          { type: "markdown", source: "## Histogram" },
          { type: "code", source: "plt.figure(figsize=(10, 6))\nplt.hist(samples, bins=40, color='#4c72b0', edgecolor='white', alpha=0.85)\nplt.axvline(stats['mean'], color='#c44e52', linestyle='--', linewidth=2, label=f\"mean = {stats['mean']:.2f}\")\nplt.title('Sampled Normal Distribution')\nplt.xlabel('Value')\nplt.ylabel('Frequency')\nplt.legend()\nplt.tight_layout()\nplt.show()" },
        ],
      }, null, 2),
    },
    {
      label: "Single-cell — Monte Carlo π estimate",
      code: JSON.stringify({
        cells: [
          { type: "markdown", source: "# Monte Carlo π estimation" },
          { type: "code", source: "import numpy as np\n\nrng = np.random.default_rng(7)\npoints = rng.uniform(-1.0, 1.0, size=(50_000, 2))\ninside = np.sum(points[:, 0]**2 + points[:, 1]**2 <= 1.0)\nestimate = 4.0 * inside / 50_000\nprint(f'samples  = 50,000')\nprint(f'estimate = {estimate:.6f}')\nprint(f'true π   = {np.pi:.6f}')\nprint(f'error    = {abs(estimate - np.pi):.6f}')" },
        ],
      }, null, 2),
    },
  ] as { label: string; code: string }[],
}
