export const pythonArtifact = {
  type: "application/python" as const,
  label: "Python Script",
  summary:
    "Executable Python scripts run in-browser via Pyodide, with numpy/matplotlib support.",
  rules: `**application/python — Executable Python Scripts**
Output valid Python code that runs in the browser via Pyodide. Runtime supports numpy, matplotlib, and standard library. Use \`print()\` for text output. For plots, use \`plt.show()\` — it is automatically captured as a PNG image. Structure code with clear sections: imports, data setup, processing, output. Include comments for complex logic.`,
  examples: [] as { label: string; code: string }[],
}
