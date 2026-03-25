import { prisma } from "@/lib/prisma"

export async function findAssistantById(id: string) {
  return prisma.assistant.findUnique({ where: { id } })
}

export async function clearSystemDefaultAssistants() {
  await prisma.assistant.updateMany({
    where: { isSystemDefault: true },
    data: { isSystemDefault: false },
  })
}

export async function setAssistantSystemDefault(id: string) {
  return prisma.assistant.update({
    where: { id },
    data: { isSystemDefault: true },
  })
}

export async function unsetAssistantSystemDefault(id: string) {
  return prisma.assistant.update({
    where: { id },
    data: { isSystemDefault: false },
  })
}

