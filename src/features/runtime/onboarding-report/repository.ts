import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

export async function findRuntimeOnboardingStatusFile(employeeId: string) {
  return prisma.employeeFile.findUnique({
    where: {
      digitalEmployeeId_filename: {
        digitalEmployeeId: employeeId,
        filename: "ONBOARDING_STATUS.json",
      },
    },
  })
}

export async function upsertRuntimeOnboardingStatusFile(params: {
  employeeId: string
  content: string
}) {
  return prisma.employeeFile.upsert({
    where: {
      digitalEmployeeId_filename: {
        digitalEmployeeId: params.employeeId,
        filename: "ONBOARDING_STATUS.json",
      },
    },
    create: {
      digitalEmployeeId: params.employeeId,
      filename: "ONBOARDING_STATUS.json",
      content: params.content,
    },
    update: {
      content: params.content,
    },
  })
}
