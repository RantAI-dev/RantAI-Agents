export const latexArtifact = {
  type: "text/latex" as const,
  label: "LaTeX / Math",
  summary:
    "Mathematical documents written in raw LaTeX with standard math environments.",
  rules: `**text/latex — Mathematical Documents**
Output raw LaTeX. Use standard math environments: \\equation, \\align, \\gather for display math. Use $ for inline math. Define custom commands with \\newcommand for repeated expressions. Structure with \\section, \\subsection. Use \\text{} for words within math mode.`,
  examples: [] as { label: string; code: string }[],
}
