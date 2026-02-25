/**
 * Seed CatalogItem records from the @rantai/community-skills package.
 * Creates marketplace entries for each community tool and skill.
 *
 * Usage: npx tsx scripts/seed-community.ts [--dry-run]
 */

import { PrismaClient } from "@prisma/client"
import type { z } from "zod"

const prisma = new PrismaClient()
const isDryRun = process.argv.includes("--dry-run")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ZodDef = { _def: Record<string, any> }
function asDef(schema: z.ZodSchema): ZodDef["_def"] {
  return (schema as unknown as ZodDef)._def
}

/** Convert a Zod schema to JSON Schema for DB storage */
function zodToJsonSchema(schema: z.ZodSchema): object {
  if ("_def" in schema && schema._def) {
    const def = schema._def as Record<string, unknown>
    if (def.typeName === "ZodObject") {
      const shape = (def as { shape: () => Record<string, z.ZodSchema> }).shape()
      const properties: Record<string, object> = {}
      const required: string[] = []
      for (const [key, fieldSchema] of Object.entries(shape)) {
        const fieldDef = asDef(fieldSchema)
        const isOptional =
          fieldDef.typeName === "ZodOptional" || fieldDef.typeName === "ZodDefault"
        if (!isOptional) required.push(key)
        const prop: Record<string, unknown> = {
          type: getZodTypeName(fieldSchema),
          description:
            fieldDef.description || fieldDef.innerType?._def?.description || undefined,
        }
        const enumValues = getZodEnumValues(fieldSchema)
        if (enumValues) prop.enum = enumValues
        const defaultValue = getZodDefault(fieldSchema)
        if (defaultValue !== undefined) prop.default = defaultValue
        properties[key] = prop
      }
      return { type: "object", properties, required }
    }
  }
  return { type: "object", properties: {} }
}

function getZodEnumValues(schema: z.ZodSchema): string[] | undefined {
  const def = asDef(schema)
  const typeName = def.typeName as string
  if (typeName === "ZodEnum") return def.values as string[]
  if (typeName === "ZodDefault" || typeName === "ZodOptional") {
    const inner = (def.innerType || def.type) as z.ZodSchema | undefined
    if (inner) return getZodEnumValues(inner)
  }
  return undefined
}

function getZodDefault(schema: z.ZodSchema): unknown {
  const def = asDef(schema)
  if (def.typeName === "ZodDefault") {
    return typeof def.defaultValue === "function"
      ? (def.defaultValue as () => unknown)()
      : def.defaultValue
  }
  if (def.typeName === "ZodOptional") {
    const inner = (def.innerType || def.type) as z.ZodSchema | undefined
    if (inner) return getZodDefault(inner)
  }
  return undefined
}

function getZodTypeName(schema: z.ZodSchema): string {
  const def = asDef(schema)
  const typeName = def.typeName as string
  switch (typeName) {
    case "ZodString": return "string"
    case "ZodNumber": return "number"
    case "ZodBoolean": return "boolean"
    case "ZodArray": return "array"
    case "ZodEnum": return "string"
    case "ZodOptional":
    case "ZodDefault":
      return getZodTypeName((def.innerType || def.type) as z.ZodSchema)
    default: return "string"
  }
}

async function main() {
  console.log(
    isDryRun
      ? "[DRY RUN] Scanning community package..."
      : "Seeding community catalog items..."
  )

  let pkg: { tools?: Record<string, unknown>; skills?: Record<string, unknown> }
  try {
    pkg = await import("@rantai/community-skills")
  } catch {
    console.error(
      "Error: @rantai/community-skills package not found.\n" +
        "Install it first: npm install @rantai/community-skills"
    )
    process.exit(1)
  }

  const tools = pkg.tools ?? {}
  const skills = pkg.skills ?? {}

  const TOOL_ICONS: Record<string, string> = {
    yahoo_finance_quote: "💹",
    yahoo_finance_search: "🔎",
    weather_lookup: "🌦️",
    qr_code_generator: "📱",
    url_metadata_extract: "🔗",
    crypto_price: "🪙",
    crypto_search: "🔍",
    wikipedia_search: "📚",
    dictionary_lookup: "📖",
  }

  let toolCount = 0
  let skillCount = 0

  // Seed standalone community tools
  for (const [name, toolDef] of Object.entries(tools)) {
    const def = toolDef as {
      name: string
      displayName: string
      description: string
      tags?: string[]
    }

    const catalogName = `community-tool-${name}`
    const toolIcon = TOOL_ICONS[def.name] || "🔧"

    if (isDryRun) {
      console.log(`  [tool] ${def.displayName} (${catalogName})`)
      toolCount++
      continue
    }

    await prisma.catalogItem.upsert({
      where: { name: catalogName },
      update: {
        displayName: def.displayName,
        description: def.description,
        icon: toolIcon,
        tags: def.tags ?? [],
      },
      create: {
        name: catalogName,
        displayName: def.displayName,
        description: def.description,
        category: "Community",
        type: "tool",
        icon: toolIcon,
        tags: def.tags ?? [],
        communityToolName: name,
      },
    })
    console.log(`  Seeded tool: ${def.displayName}`)
    toolCount++
  }

  // Seed community skills
  for (const [name, skillDef] of Object.entries(skills)) {
    const def = skillDef as {
      name: string
      displayName: string
      description: string
      category: string
      tags: string[]
      icon?: string
      configSchema?: unknown
    }

    const catalogName = `community-skill-${name}`

    if (isDryRun) {
      console.log(`  [skill] ${def.displayName} (${catalogName})`)
      skillCount++
      continue
    }

    const configJsonSchema = def.configSchema
      ? zodToJsonSchema(def.configSchema as z.ZodSchema)
      : undefined

    await prisma.catalogItem.upsert({
      where: { name: catalogName },
      update: {
        displayName: def.displayName,
        description: def.description,
        icon: def.icon || "✨",
        tags: def.tags,
        configSchema: configJsonSchema ?? undefined,
      },
      create: {
        name: catalogName,
        displayName: def.displayName,
        description: def.description,
        category: def.category,
        type: "skill",
        icon: def.icon || "✨",
        tags: def.tags,
        communitySkillName: name,
        configSchema: configJsonSchema ?? undefined,
      },
    })
    console.log(`  Seeded skill: ${def.displayName}`)
    skillCount++
  }

  console.log(
    `\n${isDryRun ? "[DRY RUN] Would seed" : "Seeded"}: ${toolCount} tools, ${skillCount} skills`
  )
}

main()
  .catch((err) => {
    console.error("Seed failed:", err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
