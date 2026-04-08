export const markdownArtifact = {
  type: "text/markdown" as const,
  label: "Document",
  summary:
    "Long-form structured Markdown documents with headings, lists, tables, and code blocks.",
  rules: `**text/markdown — Documents**
Write well-structured Markdown with proper heading hierarchy (h1 > h2 > h3), lists, code blocks with language tags, and emphasis. Use tables for structured comparisons. Include a clear introduction and logical section flow. For long documents, use a table of contents.`,
  examples: [] as { label: string; code: string }[],
}
