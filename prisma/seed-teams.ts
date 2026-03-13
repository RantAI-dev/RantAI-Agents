import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const ungrouped = await prisma.digitalEmployee.findMany({
    where: { groupId: null },
    select: {
      id: true,
      name: true,
      organizationId: true,
      createdBy: true,
      containerId: true,
      containerPort: true,
      noVncPort: true,
      gatewayToken: true,
    },
  })

  console.log(`Found ${ungrouped.length} ungrouped employees`)

  for (const emp of ungrouped) {
    const group = await prisma.employeeGroup.create({
      data: {
        name: emp.name,
        description: `Auto-created team for ${emp.name}`,
        organizationId: emp.organizationId,
        createdBy: emp.createdBy,
        isImplicit: true,
        containerId: emp.containerId,
        containerPort: emp.containerPort,
        noVncPort: emp.noVncPort,
        gatewayToken: emp.gatewayToken,
        status: emp.containerPort ? "ACTIVE" : "IDLE",
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
