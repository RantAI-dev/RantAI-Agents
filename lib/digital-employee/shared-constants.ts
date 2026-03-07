export const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "bg-muted text-muted-foreground" },
  ONBOARDING: { label: "Onboarding", className: "bg-sky-500/10 text-sky-500" },
  ACTIVE: { label: "Active", className: "bg-emerald-500/10 text-emerald-500" },
  PAUSED: { label: "Paused", className: "bg-amber-500/10 text-amber-500" },
  SUSPENDED: { label: "Suspended", className: "bg-red-500/10 text-red-500" },
  ARCHIVED: { label: "Archived", className: "bg-muted text-muted-foreground" },
}

export const AUTONOMY_STYLES: Record<string, { label: string; className: string }> = {
  L1: { label: "L1 Observer", className: "bg-blue-500/10 text-blue-500" },
  L2: { label: "L2 Assistant", className: "bg-sky-500/10 text-sky-500" },
  L3: { label: "L3 Collaborator", className: "bg-emerald-500/10 text-emerald-500" },
  L4: { label: "L4 Autonomous", className: "bg-purple-500/10 text-purple-500" },
  // Backward compat
  supervised: { label: "L1 Observer", className: "bg-blue-500/10 text-blue-500" },
  autonomous: { label: "L4 Autonomous", className: "bg-purple-500/10 text-purple-500" },
}

export const RUN_STATUS_STYLES: Record<string, { label: string; className: string }> = {
  RUNNING: { label: "Running", className: "bg-blue-500/10 text-blue-500" },
  COMPLETED: { label: "Completed", className: "bg-emerald-500/10 text-emerald-500" },
  FAILED: { label: "Failed", className: "bg-red-500/10 text-red-500" },
  PAUSED: { label: "Paused", className: "bg-amber-500/10 text-amber-500" },
}

export const BUILTIN_TOOL_ICONS: Record<string, string> = {
  knowledge_search: "📚", customer_lookup: "👥", channel_dispatch: "📤",
  document_analysis: "📄", file_operations: "📁", web_search: "🔍",
  calculator: "🧮", date_time: "⏰", json_transform: "🔄",
  text_utilities: "🔤", create_artifact: "🎨", update_artifact: "✏️",
}

export const CATEGORY_LABELS: Record<string, string> = {
  builtin: "Built-in", custom: "Custom", community: "Community", openapi: "OpenAPI", mcp: "MCP",
}
