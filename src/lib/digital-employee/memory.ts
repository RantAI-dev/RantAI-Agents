import { prisma } from "@/lib/prisma"

export interface MemoryResult {
  id: string
  type: string
  date?: string | null
  content: string
  createdAt: Date
}

export async function writeDailyNote(
  employeeId: string,
  content: string
): Promise<void> {
  const today = new Date().toISOString().split("T")[0]

  // Upsert today's daily note
  const existing = await prisma.employeeMemory.findFirst({
    where: {
      digitalEmployeeId: employeeId,
      type: "daily_note",
      date: today,
    },
  })

  if (existing) {
    await prisma.employeeMemory.update({
      where: { id: existing.id },
      data: { content: existing.content + "\n\n" + content },
    })
  } else {
    await prisma.employeeMemory.create({
      data: {
        digitalEmployeeId: employeeId,
        type: "daily_note",
        date: today,
        content,
        embedding: [],
      },
    })
  }
}

export async function updateLongTermMemory(
  employeeId: string,
  content: string
): Promise<void> {
  // Update MEMORY.md file
  await prisma.employeeFile.upsert({
    where: {
      digitalEmployeeId_filename: {
        digitalEmployeeId: employeeId,
        filename: "MEMORY.md",
      },
    },
    create: {
      digitalEmployeeId: employeeId,
      filename: "MEMORY.md",
      content,
      updatedBy: "employee",
    },
    update: {
      content,
      updatedBy: "employee",
    },
  })

  // Also store as memory entry for search
  const existing = await prisma.employeeMemory.findFirst({
    where: {
      digitalEmployeeId: employeeId,
      type: "long_term",
    },
  })

  if (existing) {
    await prisma.employeeMemory.update({
      where: { id: existing.id },
      data: { content },
    })
  } else {
    await prisma.employeeMemory.create({
      data: {
        digitalEmployeeId: employeeId,
        type: "long_term",
        content,
        embedding: [],
      },
    })
  }
}

export async function searchMemory(
  employeeId: string,
  query: string
): Promise<MemoryResult[]> {
  // Keyword search for now; vector search when embeddings are available
  const results = await prisma.employeeMemory.findMany({
    where: {
      digitalEmployeeId: employeeId,
      content: { contains: query, mode: "insensitive" },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  })

  return results.map((r) => ({
    id: r.id,
    type: r.type,
    date: r.date,
    content: r.content,
    createdAt: r.createdAt,
  }))
}

export async function getMemoryContext(employeeId: string): Promise<string> {
  // Get MEMORY.md content
  const memoryFile = await prisma.employeeFile.findUnique({
    where: {
      digitalEmployeeId_filename: {
        digitalEmployeeId: employeeId,
        filename: "MEMORY.md",
      },
    },
  })

  // Get last 3 daily notes
  const dailyNotes = await prisma.employeeMemory.findMany({
    where: {
      digitalEmployeeId: employeeId,
      type: "daily_note",
    },
    orderBy: { date: "desc" },
    take: 3,
  })

  const parts: string[] = []

  if (memoryFile?.content) {
    parts.push(`## Long-Term Memory\n${memoryFile.content}`)
  }

  if (dailyNotes.length > 0) {
    parts.push(
      `## Recent Daily Notes\n${dailyNotes
        .map((n) => `### ${n.date || "Unknown"}\n${n.content}`)
        .join("\n\n")}`
    )
  }

  return parts.join("\n\n") || "_No memory context available._"
}
