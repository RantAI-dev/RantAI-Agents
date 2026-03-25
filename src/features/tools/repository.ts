import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

export async function findToolsForOrganization(
  organizationId: string | null,
  options?: { userSelectableOnly?: boolean }
) {
  const userSelectableOnly = options?.userSelectableOnly ?? true

  return prisma.tool.findMany({
    where: {
      OR: [
        { organizationId: null, isBuiltIn: true },
        ...(organizationId ? [{ organizationId }] : []),
      ],
      ...(userSelectableOnly ? { userSelectable: true } : {}),
    },
    include: {
      mcpServer: { select: { id: true, name: true } },
      _count: { select: { assistantTools: true } },
    },
    orderBy: [{ isBuiltIn: "desc" }, { category: "asc" }, { name: "asc" }],
  })
}

export async function createTool(data: Prisma.ToolUncheckedCreateInput) {
  return prisma.tool.create({ data })
}

export async function findToolById(id: string) {
  return prisma.tool.findUnique({
    where: { id },
    include: {
      mcpServer: { select: { id: true, name: true } },
      _count: { select: { assistantTools: true } },
    },
  })
}

export async function findToolByIdBasic(id: string) {
  return prisma.tool.findUnique({
    where: { id },
  })
}

export async function updateToolById(id: string, data: Prisma.ToolUpdateInput) {
  return prisma.tool.update({
    where: { id },
    data,
  })
}

export async function deleteToolById(id: string) {
  return prisma.tool.delete({
    where: { id },
  })
}
