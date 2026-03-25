import { prisma } from "@/lib/prisma"

export async function findWorkspaceEmployee(
  employeeId: string,
  organizationId: string | null
) {
  return prisma.digitalEmployee.findFirst({
    where: {
      id: employeeId,
      ...(organizationId ? { organizationId } : {}),
    },
    select: {
      id: true,
      groupId: true,
    },
  })
}

export async function findWorkspaceGroupById(groupId: string) {
  return prisma.employeeGroup.findUnique({
    where: { id: groupId },
    select: {
      containerPort: true,
      gatewayToken: true,
      containerId: true,
      status: true,
    },
  })
}
