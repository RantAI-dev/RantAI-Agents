import { NextResponse } from "next/server"
import { verifyRuntimeToken } from "@/lib/digital-employee/runtime-auth"
import { RuntimeInboxQuerySchema } from "@/features/runtime/messages/schema"
import { getRuntimeInboxMessages } from "@/features/runtime/messages/service"

export async function GET(req: Request) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    await verifyRuntimeToken(token)

    const parsed = RuntimeInboxQuerySchema.safeParse({
      employeeId: new URL(req.url).searchParams.get("employeeId") ?? undefined,
    })
    if (!parsed.success || !parsed.data.employeeId) {
      return NextResponse.json({ error: "employeeId required" }, { status: 400 })
    }

    const messages = await getRuntimeInboxMessages(parsed.data.employeeId)
    return NextResponse.json({ messages })
  } catch (error) {
    console.error("Failed to fetch inbox:", error)
    return NextResponse.json({ error: "Failed to fetch inbox" }, { status: 500 })
  }
}
