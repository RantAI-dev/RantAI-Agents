// scripts/backfill-orgless-rows.ts
// One-shot: detect rows in org-scoped tables that ended up with
// organizationId = NULL because of the strict-resolver bug, then optionally
// reassign them to the creating user's first accepted membership.
//
// Covers: Assistant, Workflow, Document, DigitalEmployee, Category.
// Tool / Skill / McpServerConfig / KnowledgeBaseGroup intentionally allow
// global (organizationId = NULL) rows — they are NOT touched.
//
// Idempotent. Dry-run by default — pass `--apply` to write.
// Usage:  bun run scripts/backfill-orgless-rows.ts [--apply]
//
// Supersedes scripts/backfill-orgless-assistants.ts (which still works for
// just the assistants table if you want a narrower scope).

import { prisma } from "@/lib/prisma"

const APPLY = process.argv.includes("--apply")

type Stat = {
  table: string
  scanned: number
  resolved: number
  noUser: number
  noMembership: number
  updated: number
}

async function firstOrgFor(userId: string): Promise<string | null> {
  const m = await prisma.organizationMember.findFirst({
    where: { userId, acceptedAt: { not: null } },
    select: { organizationId: true },
    orderBy: { acceptedAt: "asc" },
  })
  return m?.organizationId ?? null
}

async function backfillTable<T extends { id: string; createdBy: string | null }>(
  table: string,
  rows: T[],
  update: (id: string, orgId: string) => Promise<void>
): Promise<Stat> {
  const stat: Stat = { table, scanned: rows.length, resolved: 0, noUser: 0, noMembership: 0, updated: 0 }

  for (const row of rows) {
    if (!row.createdBy) {
      stat.noUser++
      continue
    }
    const orgId = await firstOrgFor(row.createdBy)
    if (!orgId) {
      stat.noMembership++
      continue
    }
    stat.resolved++
    if (APPLY) {
      await update(row.id, orgId)
      stat.updated++
    }
  }
  return stat
}

async function main() {
  console.log(`[backfill] mode=${APPLY ? "APPLY" : "DRY-RUN"}`)
  const stats: Stat[] = []

  // Assistants — exclude built-ins (they are intentionally orgless).
  {
    const rows = await prisma.assistant.findMany({
      where: { organizationId: null, isBuiltIn: false },
      select: { id: true, createdBy: true, name: true },
    })
    stats.push(
      await backfillTable("Assistant", rows, (id, orgId) =>
        prisma.assistant.update({ where: { id }, data: { organizationId: orgId } }).then(() => undefined)
      )
    )
  }

  // Workflows — has createdBy as required string per schema. Orgless rows
  // are bugs, not features.
  {
    const rows = await prisma.workflow.findMany({
      where: { organizationId: null },
      select: { id: true, createdBy: true, name: true },
    })
    stats.push(
      await backfillTable("Workflow", rows, (id, orgId) =>
        prisma.workflow.update({ where: { id }, data: { organizationId: orgId } }).then(() => undefined)
      )
    )
  }

  // Documents — knowledge docs.
  {
    const rows = await prisma.document.findMany({
      where: { organizationId: null },
      select: { id: true, createdBy: true, title: true },
    })
    stats.push(
      await backfillTable("Document", rows, (id, orgId) =>
        prisma.document.update({ where: { id }, data: { organizationId: orgId } }).then(() => undefined)
      )
    )
  }

  // DigitalEmployee.organizationId is non-nullable in the schema, so there
  // are no orgless rows to backfill. Skipped.

  // Categories don't track a creator, so we can't auto-attribute. List them
  // for the operator to handle manually instead of guessing.
  {
    const rows = await prisma.category.findMany({
      where: { organizationId: null, isSystem: false },
      select: { id: true, name: true },
    })
    if (rows.length > 0) {
      console.log("")
      console.log(`[backfill] ${rows.length} non-system Category rows are orgless — no createdBy field, manual review needed:`)
      for (const r of rows.slice(0, 20)) console.log(`  ${r.id}  ${r.name}`)
    }
  }

  console.log("")
  console.log("table             scanned  resolved  no-user  no-membership  updated")
  for (const s of stats) {
    console.log(
      `${s.table.padEnd(17)} ${String(s.scanned).padStart(7)}  ${String(s.resolved).padStart(8)}  ${String(s.noUser).padStart(7)}  ${String(s.noMembership).padStart(13)}  ${String(s.updated).padStart(7)}`
    )
  }
  if (!APPLY) {
    console.log("")
    console.log("[backfill] DRY-RUN — pass --apply to write")
  }
}

main()
  .catch((err) => {
    console.error("[backfill] failed:", err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
