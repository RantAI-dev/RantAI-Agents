import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET all channel configurations
export async function GET() {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const channels = await prisma.channelConfig.findMany({
      orderBy: { channel: "asc" },
    })

    // Ensure all channels exist in the response
    const allChannels = ["PORTAL", "SALESFORCE", "WHATSAPP", "EMAIL"]
    const result = allChannels.map((channel) => {
      const existing = channels.find((c) => c.channel === channel)
      if (existing) {
        return existing
      }
      // Return default config for missing channels
      return {
        id: null,
        channel,
        enabled: channel === "PORTAL", // Portal enabled by default
        isPrimary: channel === "PORTAL",
        config: {},
        createdAt: null,
        updatedAt: null,
      }
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error("Error fetching channels:", error)
    return NextResponse.json(
      { error: "Failed to fetch channels" },
      { status: 500 }
    )
  }
}

// PUT to update a channel configuration
export async function PUT(request: Request) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { channel, enabled, isPrimary, config } = body

    if (!channel) {
      return NextResponse.json(
        { error: "Channel is required" },
        { status: 400 }
      )
    }

    // If setting as primary, unset other primaries first
    if (isPrimary) {
      await prisma.channelConfig.updateMany({
        where: { isPrimary: true },
        data: { isPrimary: false },
      })
    }

    const updated = await prisma.channelConfig.upsert({
      where: { channel },
      create: {
        channel,
        enabled: enabled ?? false,
        isPrimary: isPrimary ?? false,
        config: config ?? {},
      },
      update: {
        enabled: enabled ?? undefined,
        isPrimary: isPrimary ?? undefined,
        config: config ?? undefined,
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error("Error updating channel:", error)
    return NextResponse.json(
      { error: "Failed to update channel" },
      { status: 500 }
    )
  }
}
