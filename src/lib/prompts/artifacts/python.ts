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
