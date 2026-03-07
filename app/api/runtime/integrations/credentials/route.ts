import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyRuntimeToken } from "@/lib/digital-employee/runtime-auth"

export async function POST(req: Request) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { employeeId } = await verifyRuntimeToken(token)
    const { integrationId, title, description } = await req.json()

    if (!integrationId) return NextResponse.json({ error: "integrationId required" }, { status: 400 })

    // Create an approval request for credentials
    const approval = await prisma.employeeApproval.create({
      data: {
        digitalEmployeeId: employeeId,
        employeeRunId: "credential-request",
        requestType: "credential_request",
        title: title || `Credentials needed: ${integrationId}`,
        description: description || `The employee needs credentials for ${integrationId}`,
        content: { integrationId },
        options: { type: "credential_request" },
        channel: "dashboard",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    })

    return NextResponse.json({ approvalId: approval.id, status: "pending" })
  } catch (error) {
    console.error("Failed to request credentials:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
