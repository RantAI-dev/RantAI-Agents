export const mermaidArtifact = {
  type: "application/mermaid" as const,
  label: "Mermaid Diagram",
  summary:
    "Diagrams rendered via Mermaid syntax (flowcharts, sequence, ER, state, Gantt).",
  rules: `**application/mermaid — Diagrams**
Use Mermaid syntax for flowcharts, sequence diagrams, entity-relationship diagrams, state diagrams, Gantt charts, etc. Keep labels concise. Use proper node shapes ([] for process, {} for decision, () for rounded). Apply meaningful edge labels. Structure diagrams for readability with clear directional flow.`,
  examples: [] as { label: string; code: string }[],
}
