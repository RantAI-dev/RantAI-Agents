import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { UpdateAdminChannelSchema } from "@/features/admin/channels/schema"
import {
  getAdminChannels,
  updateAdminChannel,
} from "@/features/admin/channels/service"

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
    const channels = await getAdminChannels()
    return NextResponse.json(channels)
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
    const parsed = UpdateAdminChannelSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Channel is required" },
        { status: 400 }
      )
    }

    const updated = await updateAdminChannel(parsed.data)
    return NextResponse.json(updated)
  } catch (error) {
    console.error("Error updating channel:", error)
    return NextResponse.json(
      { error: "Failed to update channel" },
      { status: 500 }
    )
  }
}
