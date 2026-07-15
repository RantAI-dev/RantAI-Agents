import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

export async function findOpenApiSpecsByOrganization(organizationId: string | null) {
  return prisma.openApiSpec.findMany({
    where: {
      organizationId,
    },
    orderBy: { createdAt: "desc" },
  })
}

export async function createOpenApiSpec(data: {
  name: string
  specUrl: string | null
  specContent: unknown
  version: string
  serverUrl: string
  authConfig: unknown | null
  toolCount: number
  organizationId: string | null
  createdBy: string
}) {
  return prisma.openApiSpec.create({
    data: data as Prisma.OpenApiSpecUncheckedCreateInput,
  })
}

export async function findOpenApiSpecById(id: string, organizationId: string | null) {
  return prisma.openApiSpec.findFirst({
    where: { id, organizationId },
  })
}

export async function findOpenApiSpecWithToolsById(id: string, organizationId: string | null) {
  return prisma.openApiSpec.findFirst({
    where: { id, organizationId },
  })
}

export async function findOpenApiToolsBySpecId(specId: string) {
  return prisma.tool.findMany({
    where: { openApiSpecId: specId },
    select: {
      id: true,
      name: true,
      displayName: true,
      description: true,
      enabled: true,
    },
  })
}

export async function createOpenApiTools(
  data: Array<{
    name: string
    displayName: string
    description: string
    category: "openapi"
    parameters: object
    executionConfig: {
      url: string
      method: string
      headers?: Record<string, string>
    }
    isBuiltIn: false
    enabled: true
    openApiSpecId: string
    organizationId: string | null
    createdBy: string | null
  }>
) {
  return prisma.tool.createMany({
    data,
    skipDuplicates: true,
  })
}

export async function updateOpenApiSpecToolCount(id: string, toolCount: number) {
  return prisma.openApiSpec.update({
    where: { id },
    data: { toolCount },
  })
}

export async function deleteOpenApiToolsBySpecId(specId: string) {
  return prisma.tool.deleteMany({
    where: { openApiSpecId: specId },
  })
}

export async function deleteOpenApiSpecById(id: string, organizationId: string | null) {
  return prisma.openApiSpec.deleteMany({
    where: { id, organizationId },
  })
}
