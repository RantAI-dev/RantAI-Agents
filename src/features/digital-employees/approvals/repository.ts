import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

export async function findDashboardApprovalById(id: string) {
  return prisma.employeeApproval.findUnique({
    where: { id },
    select: {
      id: true,
      digitalEmployeeId: true,
      employeeRunId: true,
      requestType: true,
      content: true,
      status: true,
    },
  })
}

export async function updateDashboardApprovalById(
  id: string,
  data: Prisma.EmployeeApprovalUpdateInput
) {
  return prisma.employeeApproval.update({
    where: { id },
    data,
  })
}

export async function findDashboardEmployeeRunById(id: string) {
  return prisma.employeeRun.findUnique({
    where: { id },
    include: {
      digitalEmployee: {
        select: { groupId: true },
      },
    },
  })
}

export async function findDashboardEmployeeGroupById(id: string) {
  return prisma.employeeGroup.findUnique({
    where: { id },
    select: { gatewayToken: true },
  })
}

export async function updateDashboardEmployeeMessageStatus(
  id: string,
  status: "pending" | "cancelled"
) {
  return prisma.employeeMessage.update({
    where: { id },
    data: { status },
  })
}
