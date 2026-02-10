import { prisma } from "@/lib/prisma"
import { BUILTIN_TOOLS } from "./builtin"
import { zodToJsonSchema } from "./utils"

/**
 * Ensure all built-in tools exist in the database.
 * Creates missing tools, updates existing ones.
 * Called during database seeding or on first API call.
 */
export async function ensureBuiltinTools(): Promise<void> {
  for (const [name, def] of Object.entries(BUILTIN_TOOLS)) {
    const existing = await prisma.tool.findFirst({
      where: { name, isBuiltIn: true, organizationId: null },
    })

    const data = {
      displayName: def.displayName,
      description: def.description,
      parameters: zodToJsonSchema(def.parameters),
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
