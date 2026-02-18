import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// DELETE /api/dashboard/memory/[id] — Delete a single memory entry
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    // Verify ownership
    const memory = await prisma.userMemory.findUnique({
      where: { id },
      select: { userId: true },
    })

    if (!memory) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    if (memory.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    await prisma.userMemory.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Memory API] DELETE by id error:", error)
    return NextResponse.json(
      { error: "Failed to delete memory" },
      { status: 500 }
    )
  }
}
