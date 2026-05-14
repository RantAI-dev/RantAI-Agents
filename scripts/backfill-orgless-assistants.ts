// scripts/backfill-orgless-assistants.ts
// One-shot: assign organizationId to any non-builtin Assistant rows that were
// created without an org (the agent-builder org-context bug). For each orgless
// agent, picks the createdBy user's first accepted membership.
//
// Idempotent — only touches rows where organizationId IS NULL AND isBuiltIn = false.
//
// Usage: bun run scripts/backfill-orgless-assistants.ts          # dry run
//        bun run scripts/backfill-orgless-assistants.ts --apply  # write

import { prisma } from "@/lib/prisma"

async function main() {
  const apply = process.argv.includes("--apply")

  const orgless = await prisma.assistant.findMany({
    where: { organizationId: null, isBuiltIn: false },
    select: { id: true, name: true, createdBy: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  })

  console.log(`[backfill] found ${orgless.length} orgless non-builtin assistants`)
  if (orgless.length === 0) return

  let resolved = 0
  let skippedNoUser = 0
  let skippedNoMembership = 0
  const plan: Array<{ id: string; name: string; orgId: string }> = []

  for (const a of orgless) {
    if (!a.createdBy) {
      skippedNoUser++
      console.warn(`[backfill] SKIP ${a.id} (${a.name}): no createdBy`)
      continue
    }

    const membership = await prisma.organizationMember.findFirst({
      where: { userId: a.createdBy, acceptedAt: { not: null } },
      select: { organizationId: true },
      orderBy: { acceptedAt: "asc" },
    })

    if (!membership) {
      skippedNoMembership++
      console.warn(
        `[backfill] SKIP ${a.id} (${a.name}): user ${a.createdBy} has no accepted membership`
      )
      continue
    }

    plan.push({ id: a.id, name: a.name, orgId: membership.organizationId })
    resolved++
  }

  console.log(`[backfill] resolved=${resolved} skipped_no_user=${skippedNoUser} skipped_no_membership=${skippedNoMembership}`)

  if (!apply) {
    console.log("[backfill] DRY RUN — pass --apply to write. First 20:")
    for (const p of plan.slice(0, 20)) {
      console.log(`  ${p.id}  ->  ${p.orgId}  (${p.name})`)
    }
    return
  }

  let updated = 0
  for (const p of plan) {
    await prisma.assistant.update({
      where: { id: p.id },
      data: { organizationId: p.orgId },
    })
    updated++
  }
  console.log(`[backfill] APPLIED — updated ${updated} assistants`)
}

main()
  .catch((err) => {
    console.error("[backfill] failed:", err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
