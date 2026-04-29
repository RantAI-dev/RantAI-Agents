/**
 * Single source of truth for "what mermaid diagram-type keywords does our
 * stack accept?". Used by:
 *
 *  - `_validate-artifact.ts` (`validateMermaid`) — gates standalone
 *    `application/mermaid` artifacts.
 *  - `_validate-artifact.ts` (`validateSlides`) — gates per-slide
 *    `diagram` fields on `diagram` / `diagram-content` layouts.
 *
 * Keeping these in lockstep prevents the historical drift where a
 * diagram type the standalone renderer accepts gets a "may be invalid"
 * warning when the same code is embedded in a slide.
 */
export const MERMAID_DIAGRAM_TYPES = [
  "flowchart",
  "graph",
  "sequenceDiagram",
  "erDiagram",
  "stateDiagram-v2",
  "stateDiagram",
  "classDiagram",
  "gantt",
  "pie",
  "mindmap",
  "gitGraph",
  "journey",
  "quadrantChart",
  "timeline",
  "sankey-beta",
  "xychart-beta",
  "block-beta",
  "packet-beta",
  "kanban",
  "C4Context",
  "C4Container",
  "C4Component",
  "C4Deployment",
  "requirementDiagram",
  "architecture-beta",
] as const

export type MermaidDiagramType = (typeof MERMAID_DIAGRAM_TYPES)[number]
