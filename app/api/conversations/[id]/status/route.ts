import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      select: { status: true },
    })

    if (!conversation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    return NextResponse.json({ status: conversation.status })
  } catch (error) {
    console.error("Error fetching conversation status:", error)
    return NextResponse.json(
      { error: "Failed to fetch status" },
      { status: 500 }
    )
  }
}
