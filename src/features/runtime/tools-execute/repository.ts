import { prisma } from "@/lib/prisma"

export async function findRuntimeEmployeeToolContext(employeeId: string) {
  return prisma.digitalEmployee.findUnique({
    where: { id: employeeId },
    select: {
      organizationId: true,
      assistantId: true,
      assistant: {
        select: {
          tools: {
            where: { enabled: true },
            include: { tool: { select: { name: true } } },
          },
        },
      },
    },
  })
}
