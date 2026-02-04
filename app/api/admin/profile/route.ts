import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getPresignedDownloadUrl } from "@/lib/s3"

// GET - Get current user profile
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const agent = await prisma.agent.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        avatarS3Key: true,
        createdAt: true,
      },
    })

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 })
    }

    // Generate presigned URL for avatar if exists
    let avatarUrl: string | null = null
    if (agent.avatarS3Key) {
      try {
        avatarUrl = await getPresignedDownloadUrl(agent.avatarS3Key)
      } catch (error) {
        console.warn("Failed to generate avatar URL:", error)
      }
    }

    return NextResponse.json({
      ...agent,
      avatarUrl,
    })
  } catch (error) {
    console.error("Failed to get profile:", error)
    return NextResponse.json(
      { error: "Failed to get profile" },
      { status: 500 }
    )
  }
}

// PUT - Update user profile
export async function PUT(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { name } = await request.json()

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      )
    }

    const agent = await prisma.agent.update({
      where: { id: session.user.id },
      data: { name: name.trim() },
      select: {
        id: true,
        name: true,
        email: true,
      },
    })

    return NextResponse.json(agent)
  } catch (error) {
    console.error("Failed to update profile:", error)
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    )
  }
}
