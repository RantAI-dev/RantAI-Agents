import { prisma } from "@/lib/prisma"

export async function findDashboardTemplatesByOrganization(
  organizationId: string
) {
  return prisma.employeeTemplateShare.findMany({
    where: {
      OR: [{ organizationId }, { isPublic: true }],
    },
    orderBy: { updatedAt: "desc" },
  })
}

export async function findDashboardTemplateById(
  templateId: string,
  organizationId: string
) {
  return prisma.employeeTemplateShare.findFirst({
    where: { id: templateId, organizationId },
  })
}

export async function createDashboardTemplate(data: {
  organizationId: string
  name: string
  description: string | null
  category: string
  templateData: object
  isPublic: boolean
  createdBy: string
}) {
  return prisma.employeeTemplateShare.create({
    data,
  })
}

export async function updateDashboardTemplate(
  templateId: string,
  data: {
    name?: string
    description?: string | null
    category?: string
    templateData?: object
    isPublic?: boolean
  }
) {
  return prisma.employeeTemplateShare.update({
    where: { id: templateId },
    data: {
      ...data,
      version: { increment: 1 },
    },
  })
}

export async function deleteDashboardTemplate(templateId: string) {
  return prisma.employeeTemplateShare.delete({
    where: { id: templateId },
  })
}
