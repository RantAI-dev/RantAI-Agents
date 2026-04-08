export const sheetArtifact = {
  type: "application/sheet" as const,
  label: "Spreadsheet",
  summary: "Tabular CSV data with a header row and consistent column types.",
  rules: `**application/sheet — Tabular Data**
Output as CSV with a header row. Use consistent column naming (Title Case). Ensure data types are consistent within columns. For numeric data, use consistent decimal precision. Include meaningful column headers that describe the data clearly.`,
  examples: [] as { label: string; code: string }[],
}
