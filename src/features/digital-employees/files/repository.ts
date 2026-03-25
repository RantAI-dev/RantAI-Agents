import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

export async function findEmployeeForFiles(
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
    },
  })
}

export async function listEmployeeFilesByEmployeeId(employeeId: string) {
  return prisma.employeeFile.findMany({
    where: { digitalEmployeeId: employeeId },
    orderBy: { filename: "asc" },
  })
}

export async function findEmployeeFileByName(
  employeeId: string,
  filename: string
) {
  return prisma.employeeFile.findUnique({
    where: {
      digitalEmployeeId_filename: {
        digitalEmployeeId: employeeId,
        filename,
      },
    },
  })
}

export async function upsertEmployeeFile(
  employeeId: string,
  filename: string,
  content: string,
  updatedBy: string
) {
  return prisma.employeeFile.upsert({
    where: {
      digitalEmployeeId_filename: {
        digitalEmployeeId: employeeId,
        filename,
      },
    },
    create: {
      digitalEmployeeId: employeeId,
      filename,
      content,
      updatedBy,
    },
    update: {
      content,
      updatedBy,
    },
  })
}

export async function syncEmployeeFiles(
  files: Array<{ filename: string; content: string }>,
  employeeId: string,
  updatedBy: string
) {
  return Promise.all(
    files.map((file) => upsertEmployeeFile(employeeId, file.filename, file.content, updatedBy))
  )
}
