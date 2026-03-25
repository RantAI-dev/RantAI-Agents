import { NextResponse } from "next/server"
import { verifyRuntimeToken } from "@/lib/digital-employee/runtime-auth"
import { RuntimeApprovalSchema } from "@/src/features/runtime/approvals/schema"
import { requestRuntimeApproval } from "@/src/features/runtime/approvals/service"
import { isHttpServiceError } from "@/src/features/shared/http-service-error"

// POST - VM requests an approval from human
export async function POST(req: Request) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { employeeId, runId } = await verifyRuntimeToken(token)
    const parsed = RuntimeApprovalSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: "Failed" }, { status: 500 })
    }

    const approval = await requestRuntimeApproval({
      employeeId,
      runId,
      input: parsed.data,
    })

    if (isHttpServiceError(approval)) {
      return NextResponse.json({ error: approval.error }, { status: approval.status })
    }

    return NextResponse.json(approval, { status: 201 })
  } catch (error) {
    console.error("Runtime approval request failed:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
