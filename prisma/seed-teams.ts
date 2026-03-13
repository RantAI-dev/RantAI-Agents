/**
 * One-time migration script: create implicit teams for ungrouped employees.
 * This was run BEFORE the schema change that made groupId required.
 * Kept for reference only — running it again is a no-op since all employees now have groupId.
 */
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  // After schema migration, groupId is required — no ungrouped employees can exist.
  // This script only applies to the pre-migration state where groupId was nullable.
  const ungrouped = await prisma.digitalEmployee.findMany({
    where: {},
    select: {
      id: true,
      name: true,
      organizationId: true,
      createdBy: true,
      groupId: true,
    },
  })

  const needsTeam = ungrouped.filter((e) => !e.groupId)
  console.log(`Found ${needsTeam.length} employees without a team (total: ${ungrouped.length})`)

  for (const emp of needsTeam) {
    const group = await prisma.employeeGroup.create({
      data: {
        name: emp.name,
        description: `Auto-created team for ${emp.name}`,
        organizationId: emp.organizationId,
        createdBy: emp.createdBy,
        isImplicit: true,
        status: "IDLE",
      },
    })

    await prisma.digitalEmployee.update({
      where: { id: emp.id },
      data: { groupId: group.id },
    })

    console.log(`Created implicit team "${group.name}" for employee ${emp.id}`)
  }

  console.log("Done!")
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
