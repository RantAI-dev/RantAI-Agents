/**
 * Mermaid configuration for polished diagram rendering.
 * Maps application design tokens to Mermaid themeVariables.
 *
 * OKLCH → Hex conversions from globals.css (verified)
 *
 * Light mode tokens:
 *   --background: oklch(0.98 0.002 90) → #fafaf9
 *   --foreground: oklch(0.15 0 0) → #1c1c1c
 *   --card: oklch(1 0 0) → #ffffff
 *   --border: oklch(0.88 0.01 80) → #e2e1de
 *   --muted: oklch(0.92 0.01 80) → #ebeae7
 *   --muted-foreground: oklch(0.45 0 0) → #6b6b6b
 *   --accent: oklch(0.55 0.2 250) → #3b82f6
 *
 * Dark mode tokens:
 *   --background: oklch(0.145 0 0) → #1a1a1a
 *   --foreground: oklch(0.985 0 0) → #fbfbfb
 *   --card: oklch(0.145 0 0) → #1a1a1a
 *   --border: oklch(0.269 0 0) → #404040
 *   --muted: oklch(0.269 0 0) → #404040
 *   --muted-foreground: oklch(0.708 0 0) → #b0b0b0
 */
import type { MermaidConfig } from "mermaid"

// ============================================================================
// Design Tokens (matched to globals.css)
// ============================================================================

const LIGHT = {
  // Core tokens from globals.css
  background: "#fafaf9", // oklch(0.98 0.002 90)
  foreground: "#1c1c1c", // oklch(0.15 0 0)
  card: "#ffffff", // oklch(1 0 0)
  border: "#e2e1de", // oklch(0.88 0.01 80)
  muted: "#ebeae7", // oklch(0.92 0.01 80)
  mutedForeground: "#6b6b6b", // oklch(0.45 0 0)
  // Accent blue for interactive elements
  accent: "#3b82f6", // oklch(0.55 0.2 250) - blue-500
  accentLight: "#dbeafe", // blue-100 for subtle backgrounds
  // Semantic colors
  subgraphBg: "#f5f5f4", // stone-100
  noteBg: "#fef3c7", // amber-100
  noteBorder: "#fbbf24", // amber-400
  success: "#22c55e", // green-500
  successLight: "#dcfce7", // green-100
  error: "#ef4444", // red-500
  errorLight: "#fee2e2", // red-100
} as const

const DARK = {
  // Core tokens from globals.css
  background: "#1a1a1a", // oklch(0.145 0 0)
  foreground: "#fbfbfb", // oklch(0.985 0 0)
  card: "#262626", // slightly elevated from background
  border: "#404040", // oklch(0.269 0 0)
  muted: "#404040", // oklch(0.269 0 0)
  mutedForeground: "#b0b0b0", // oklch(0.708 0 0)
  // Accent blue for dark mode (lighter for visibility)
  accent: "#60a5fa", // blue-400
  accentDark: "#1e3a5f", // dark blue for backgrounds
  // Semantic colors (muted for dark mode)
  subgraphBg: "#262626", // elevated surface
  noteBg: "#451a03", // amber-950
  noteBorder: "#d97706", // amber-600
  success: "#22c55e", // green-500
  successDark: "#14532d", // green-900
  error: "#ef4444", // red-500
  errorDark: "#7f1d1d", // red-900
} as const

const FONT_FAMILY =
  "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"

// ============================================================================
// Theme Variables
// ============================================================================

const lightThemeVariables = {
  // Canvas
  background: LIGHT.background,

  // Primary elements (main nodes)
  primaryColor: LIGHT.card,
  primaryTextColor: LIGHT.foreground,
  primaryBorderColor: LIGHT.border,

  // Secondary elements - same as primary for consistency
  secondaryColor: LIGHT.card,
  secondaryTextColor: LIGHT.foreground,
  secondaryBorderColor: LIGHT.border,

  // Tertiary elements (subgraphs, clusters)
  tertiaryColor: LIGHT.card,
  tertiaryTextColor: LIGHT.foreground,
  tertiaryBorderColor: LIGHT.border,

  // Lines and text
  lineColor: LIGHT.mutedForeground,
  textColor: LIGHT.foreground,

  // Flowchart nodes
  nodeBkg: LIGHT.card,
  nodeBorder: LIGHT.border,
  mainBkg: LIGHT.card,
  nodeTextColor: LIGHT.foreground,

  // Subgraphs/clusters
  clusterBkg: LIGHT.subgraphBg,
  clusterBorder: LIGHT.border,

  // Sequence diagram - actors
  actorBkg: LIGHT.card,
  actorBorder: LIGHT.border,
  actorTextColor: LIGHT.foreground,
  actorLineColor: LIGHT.mutedForeground,

  // Sequence diagram - messages
  signalColor: LIGHT.foreground,
  signalTextColor: LIGHT.foreground,

  // Sequence diagram - labels
  labelBoxBkgColor: LIGHT.card,
  labelBoxBorderColor: LIGHT.border,
  labelTextColor: LIGHT.foreground,
  loopTextColor: LIGHT.foreground,

  // Sequence diagram - activation bars
  activationBkgColor: LIGHT.accentLight,
  activationBorderColor: LIGHT.accent,

  // Notes
  noteBkgColor: LIGHT.noteBg,
  noteTextColor: LIGHT.foreground,
  noteBorderColor: LIGHT.noteBorder,

  // Gantt chart - sections
  sectionBkgColor: LIGHT.subgraphBg,
  altSectionBkgColor: LIGHT.card,
  gridColor: LIGHT.border,

  // Gantt chart - tasks
  taskBkgColor: LIGHT.accent,
  taskBorderColor: "#2563eb", // blue-600
  taskTextColor: "#ffffff",
  taskTextLightColor: LIGHT.foreground,
  activeTaskBkgColor: "#93c5fd", // blue-300
  activeTaskBorderColor: LIGHT.accent,
  doneTaskBkgColor: LIGHT.successLight,
  doneTaskBorderColor: LIGHT.success,
  critBkgColor: LIGHT.errorLight,
  critBorderColor: LIGHT.error,
  todayLineColor: "#f97316", // orange-500

  // Labels
  labelColor: LIGHT.foreground,

  // State diagram
  stateBkg: LIGHT.card,
  stateLabelColor: LIGHT.foreground,
  compositeBackground: LIGHT.subgraphBg,
  compositeBorder: LIGHT.border,

  // Class/ER diagram
  attributeBackgroundColorOdd: LIGHT.subgraphBg,
  attributeBackgroundColorEven: LIGHT.card,
  classText: LIGHT.foreground,

  // Edge labels
  edgeLabelBackground: LIGHT.card,

  // Pie chart colors (distinct, harmonious palette)
  pie1: "#3b82f6", // blue-500
  pie2: "#22c55e", // green-500
  pie3: "#f59e0b", // amber-500
  pie4: "#ef4444", // red-500
  pie5: "#8b5cf6", // violet-500
  pie6: "#06b6d4", // cyan-500
  pie7: "#ec4899", // pink-500
  pie8: "#14b8a6", // teal-500

  // Flowchart alternating fills - all consistent
  fill0: LIGHT.card,
  fill1: LIGHT.card,
  fill2: LIGHT.card,
  fill3: LIGHT.card,
  fill4: LIGHT.card,
  fill5: LIGHT.card,
  fill6: LIGHT.card,
  fill7: LIGHT.card,

  // Color scale for various elements
  cScale0: LIGHT.card,
  cScale1: LIGHT.card,
  cScale2: LIGHT.card,
  cScale3: LIGHT.card,
  cScale4: LIGHT.card,
  cScale5: LIGHT.card,
  cScale6: LIGHT.card,
  cScale7: LIGHT.card,
  cScale8: LIGHT.card,
  cScale9: LIGHT.card,
  cScale10: LIGHT.card,
  cScale11: LIGHT.card,

  // Typography
  fontFamily: FONT_FAMILY,
  fontSize: "14px",
} as const

const darkThemeVariables = {
  // Canvas
  background: DARK.background,

  // Primary elements (main nodes) - elevated surface
  primaryColor: DARK.card,
  primaryTextColor: DARK.foreground,
  primaryBorderColor: DARK.border,

  // Secondary elements - keep dark for contrast
  secondaryColor: DARK.card,
  secondaryTextColor: DARK.foreground,
  secondaryBorderColor: DARK.border,

  // Tertiary elements (subgraphs, clusters)
  tertiaryColor: DARK.card,
  tertiaryTextColor: DARK.foreground,
  tertiaryBorderColor: DARK.border,

  // Lines and text
  lineColor: DARK.mutedForeground,
  textColor: DARK.foreground,

  // Flowchart nodes - ALL shapes should be dark
  nodeBkg: DARK.card,
  nodeBorder: DARK.border,
  mainBkg: DARK.card,

  // Flowchart node text - ensure visibility
  nodeTextColor: DARK.foreground,

  // Subgraphs/clusters
  clusterBkg: DARK.subgraphBg,
  clusterBorder: DARK.border,

  // Sequence diagram - actors
  actorBkg: DARK.card,
  actorBorder: DARK.border,
  actorTextColor: DARK.foreground,
  actorLineColor: DARK.mutedForeground,

  // Sequence diagram - messages
  signalColor: DARK.foreground,
  signalTextColor: DARK.foreground,

  // Sequence diagram - labels
  labelBoxBkgColor: DARK.card,
  labelBoxBorderColor: DARK.border,
  labelTextColor: DARK.foreground,
  loopTextColor: DARK.foreground,

  // Sequence diagram - activation bars
  activationBkgColor: DARK.accentDark,
  activationBorderColor: DARK.accent,

  // Notes
  noteBkgColor: DARK.noteBg,
  noteTextColor: DARK.foreground,
  noteBorderColor: DARK.noteBorder,

  // Gantt chart - sections
  sectionBkgColor: DARK.subgraphBg,
  altSectionBkgColor: DARK.card,
  gridColor: DARK.border,

  // Gantt chart - tasks
  taskBkgColor: DARK.accent,
  taskBorderColor: "#3b82f6", // blue-500
  taskTextColor: "#1a1a1a", // dark text on light blue
  taskTextLightColor: DARK.foreground,
  activeTaskBkgColor: "#3b82f6", // blue-500
  activeTaskBorderColor: DARK.accent,
  doneTaskBkgColor: DARK.successDark,
  doneTaskBorderColor: DARK.success,
  critBkgColor: DARK.errorDark,
  critBorderColor: DARK.error,
  todayLineColor: "#fb923c", // orange-400

  // Labels
  labelColor: DARK.foreground,

  // State diagram
  stateBkg: DARK.card,
  stateLabelColor: DARK.foreground,
  compositeBackground: DARK.subgraphBg,
  compositeBorder: DARK.border,

  // Class/ER diagram
  attributeBackgroundColorOdd: DARK.card,
  attributeBackgroundColorEven: DARK.subgraphBg,
  classText: DARK.foreground,

  // Edge labels
  edgeLabelBackground: DARK.card,

  // Pie chart colors (brighter for dark mode visibility)
  pie1: "#60a5fa", // blue-400
  pie2: "#4ade80", // green-400
  pie3: "#fbbf24", // amber-400
  pie4: "#f87171", // red-400
  pie5: "#a78bfa", // violet-400
  pie6: "#22d3ee", // cyan-400
  pie7: "#f472b6", // pink-400
  pie8: "#2dd4bf", // teal-400

  // Flowchart alternating fills - ALL dark for consistency
  // These control node colors in sequence when multiple nodes exist
  fill0: DARK.card,
  fill1: DARK.card,
  fill2: DARK.card,
  fill3: DARK.card,
  fill4: DARK.card,
  fill5: DARK.card,
  fill6: DARK.card,
  fill7: DARK.card,

  // Color scale for various elements
  cScale0: DARK.card,
  cScale1: DARK.card,
  cScale2: DARK.card,
  cScale3: DARK.card,
  cScale4: DARK.card,
  cScale5: DARK.card,
  cScale6: DARK.card,
  cScale7: DARK.card,
  cScale8: DARK.card,
  cScale9: DARK.card,
  cScale10: DARK.card,
  cScale11: DARK.card,

  // Typography
  fontFamily: FONT_FAMILY,
  fontSize: "14px",
} as const

// ============================================================================
// Diagram-Specific Configurations
// ============================================================================

const flowchartConfig = {
  useMaxWidth: true,
  htmlLabels: false,
  curve: "basis" as const,
  padding: 15,
  nodeSpacing: 50,
  rankSpacing: 50,
  diagramPadding: 8,
  wrappingWidth: 200,
}

const sequenceConfig = {
  useMaxWidth: true,
  diagramMarginX: 50,
  diagramMarginY: 10,
  actorMargin: 50,
  width: 150,
  height: 65,
  boxMargin: 10,
  boxTextMargin: 5,
  noteMargin: 10,
  messageMargin: 35,
  messageAlign: "center" as const,
  mirrorActors: true,
  bottomMarginAdj: 1,
  rightAngles: false,
  showSequenceNumbers: false,
}

const erConfig = {
  useMaxWidth: true,
  diagramPadding: 20,
  layoutDirection: "TB" as const,
  minEntityWidth: 100,
  minEntityHeight: 75,
  entityPadding: 15,
  fontSize: 12,
}

const stateConfig = {
  useMaxWidth: true,
  dividerMargin: 10,
  sizeUnit: 5,
  padding: 8,
  textHeight: 10,
  titleShift: -15,
  noteMargin: 10,
}

const classConfig = {
  useMaxWidth: true,
  titleTopMargin: 25,
  dividerMargin: 10,
  padding: 8,
  textHeight: 10,
  htmlLabels: false,
}

const ganttConfig = {
  useMaxWidth: true,
  titleTopMargin: 25,
  barHeight: 20,
  barGap: 4,
  topPadding: 50,
  leftPadding: 75,
  gridLineStartPadding: 35,
  fontSize: 11,
  sectionFontSize: 11,
  numberSectionStyles: 4,
  axisFormat: "%Y-%m-%d",
}

const mindmapConfig = {
  useMaxWidth: true,
  padding: 10,
  maxNodeWidth: 200,
}

const gitGraphConfig = {
  useMaxWidth: true,
  titleTopMargin: 25,
  diagramPadding: 8,
  showCommitLabel: true,
  showBranches: true,
  rotateCommitLabel: true,
}

const pieConfig = {
  useMaxWidth: true,
  textPosition: 0.75,
}

const journeyConfig = {
  useMaxWidth: true,
  diagramMarginX: 50,
  diagramMarginY: 10,
  leftMargin: 150,
  width: 150,
  height: 50,
  boxMargin: 10,
  boxTextMargin: 5,
  noteMargin: 10,
  messageMargin: 35,
  messageAlign: "center" as const,
  bottomMarginAdj: 1,
  rightAngles: false,
}

const quadrantConfig = {
  useMaxWidth: true,
  chartWidth: 500,
  chartHeight: 500,
  titleFontSize: 20,
  titlePadding: 10,
  quadrantPadding: 5,
  xAxisLabelPadding: 5,
  yAxisLabelPadding: 5,
  pointRadius: 5,
  pointLabelFontSize: 12,
}

// ============================================================================
// Main Config Generator
// ============================================================================

export function getMermaidConfig(theme: "dark" | "default"): MermaidConfig {
  const themeVariables =
    theme === "dark" ? darkThemeVariables : lightThemeVariables

  return {
    startOnLoad: false,
    securityLevel: "strict",
    logLevel: "error",
    theme: "base",
    themeVariables,
    fontFamily: FONT_FAMILY,
    htmlLabels: false,
    flowchart: flowchartConfig,
    sequence: sequenceConfig,
    er: erConfig,
    state: stateConfig,
    class: classConfig,
    gantt: ganttConfig,
    mindmap: mindmapConfig,
    gitGraph: gitGraphConfig,
    pie: pieConfig,
    journey: journeyConfig,
    quadrantChart: quadrantConfig,
  }
}
