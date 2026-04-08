export const codeArtifact = {
  type: "application/code" as const,
  label: "Code",
  summary:
    "Standalone source code files in any programming language with syntax highlighting.",
  rules: `**application/code — Code Files**
Output clean, well-structured code with syntax highlighting support. Include proper imports, type annotations where appropriate, and meaningful variable names. Always set the \`language\` parameter to the correct programming language (e.g. python, javascript, typescript, rust, go). Code must be complete and runnable — no stubs or placeholder functions.`,
  examples: [] as { label: string; code: string }[],
}
