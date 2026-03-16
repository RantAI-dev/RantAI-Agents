import { prisma } from "@/lib/prisma"
import { generateEmployeePackage } from "./package-generator"
import type { EmployeePackage } from "./types"

export interface GroupPackage {
  group: { id: string; name: string }
  employees: EmployeePackage[]
}

export async function generateGroupPackage(groupId: string): Promise<GroupPackage> {
  const group = await prisma.employeeGroup.findUnique({
    where: { id: groupId },
    include: {
      members: { select: { id: true } },
    },
  })

  if (!group) {
    throw new Error("Employee group not found")
  }

  if (group.members.length === 0) {
    throw new Error("Employee group has no members")
  }

  const employees = await Promise.all(
    group.members.map((member) => generateEmployeePackage(member.id))
  )

  return {
    group: { id: group.id, name: group.name },
    employees,
  }
}
