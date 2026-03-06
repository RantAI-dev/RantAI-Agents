import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyRuntimeToken } from "@/lib/digital-employee/runtime-auth"

interface RouteParams {
  params: Promise<{ runId: string }>
}

// POST - VM submits run output
export async function POST(req: Request, { params }: RouteParams) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { runId: tokenRunId } = await verifyRuntimeToken(token)
    const { runId } = await params

    if (tokenRunId !== runId) {
      return NextResponse.json({ error: "Token mismatch" }, { status: 403 })
    }

    const body = await req.json()

    await prisma.employeeRun.update({
      where: { id: runId },
      data: { output: body.output || body },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Runtime output submit failed:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
