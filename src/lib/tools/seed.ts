import { prisma } from "@/lib/prisma"
import { BUILTIN_TOOLS } from "./builtin"
import { zodToJsonSchema } from "./utils"

/** Emoji icons for built-in tools */
const BUILTIN_TOOL_ICONS: Record<string, string> = {
  knowledge_search: "\uD83D\uDD0D",
  customer_lookup: "\uD83D\uDCCA",
  channel_dispatch: "\uD83D\uDCE8",
  document_analysis: "\uD83D\uDCC4",
  file_operations: "\uD83D\uDCC1",
  web_search: "\uD83C\uDF10",
  calculator: "\uD83E\uDDEE",
  date_time: "\uD83D\uDD52",
  json_transform: "\uD83D\uDD00",
  text_utilities: "\u270F\uFE0F",
  create_artifact: "\u2728",
  update_artifact: "\uD83D\uDD27",
  code_interpreter: "\uD83D\uDCBB",
  ocr_document: "\uD83D\uDDCE",
}

// Tools that should NOT appear in the user-selectable dropdown
// Either because they have dedicated UI toggles or are internal-only
const NON_USER_SELECTABLE_BUILTIN_TOOLS = new Set([
  "create_artifact",   // internal - triggered by AI automatically
  "update_artifact",   // internal - triggered by AI automatically
  "file_operations",   // internal - used by system
  "knowledge_search",  // has dedicated UI toggle (KB picker)
  "web_search",        // has dedicated UI toggle (globe icon)
  "code_interpreter",  // has dedicated UI toggle (code icon)
])

function isBuiltinToolUserSelectable(name: string): boolean {
  return !NON_USER_SELECTABLE_BUILTIN_TOOLS.has(name)
}

let seeded = false

/**
 * Ensure all built-in tools exist in the database.
 * Creates missing tools, updates existing ones, removes duplicates.
 * Called during database seeding or on first API call.
 */
export async function ensureBuiltinTools(): Promise<void> {
  if (seeded) return
  seeded = true

  // Remove duplicate built-in tools (keep only the first one per name)
  const builtinTools = await prisma.tool.findMany({
    where: { isBuiltIn: true, organizationId: null },
    orderBy: { createdAt: "asc" },
  })
  const seen = new Set<string>()
  for (const tool of builtinTools) {
    if (seen.has(tool.name)) {
      await prisma.tool.delete({ where: { id: tool.id } })
    } else {
      seen.add(tool.name)
    }
  }

  for (const [name, def] of Object.entries(BUILTIN_TOOLS)) {
    const existing = await prisma.tool.findFirst({
      where: { name, isBuiltIn: true, organizationId: null },
    })

    const data = {
      displayName: def.displayName,
      description: def.description,
      parameters: zodToJsonSchema(def.parameters),
      icon: BUILTIN_TOOL_ICONS[name] || null,
      userSelectable: isBuiltinToolUserSelectable(name),
    }

    if (existing) {
      await prisma.tool.update({
        where: { id: existing.id },
        data,
      })
    } else {
      await prisma.tool.create({
        data: {
          name,
          ...data,
          category: "builtin",
          isBuiltIn: true,
          enabled: true,
        },
      })
    }
  }
}
