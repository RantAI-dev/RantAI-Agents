import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

export async function findDigitalEmployeeLifecycleContextById(params: {
  digitalEmployeeId: string
  organizationId: string | null
}) {
  return prisma.digitalEmployee.findFirst({
    where: {
      id: params.digitalEmployeeId,
      ...(params.organizationId ? { organizationId: params.organizationId } : {}),
    },
    select: {
      id: true,
      status: true,
      groupId: true,
      autonomyLevel: true,
      sandboxMode: true,
      trustScore: true,
      organizationId: true,
    },
  })
}

export async function updateDigitalEmployeeLifecycleById(
  digitalEmployeeId: string,
  data: Prisma.DigitalEmployeeUpdateInput
) {
  return prisma.digitalEmployee.update({
    where: { id: digitalEmployeeId },
    data,
  })
}
